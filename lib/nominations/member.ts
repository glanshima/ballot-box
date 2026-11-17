import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb, rowsOf } from '@/lib/db/client';
import { nominees, nominationAttachments, nominators, voters, type NomineeStatus } from '@/lib/db/schema';
import { nomineeAcceptsNominators } from './rules';

export type AttachmentInput = {
  kind: 'membership_proof' | 'signature';
  contentType: string;
  dataBase64: string;
  size: number;
};

export type AddNominatorResult =
  | { ok: true; nomineeId: string; nominatorId: string; count: number; status: NomineeStatus }
  | { ok: false; reason: 'duplicate' | 'full' | 'closed' };

/** The verified member behind the session cookie, or null if the roll entry disappeared. */
export async function sessionVoter(electionId: string, voterId: string) {
  const [row] = await getDb()
    .select({ id: voters.id, email: voters.email, name: voters.name })
    .from(voters)
    .where(and(eq(voters.id, voterId), eq(voters.electionId, electionId)))
    .limit(1);
  return row ?? null;
}

/**
 * Reuses an existing nominee row for (election, position, lower(email)); creates
 * it otherwise. Names/phones of later nominators never overwrite the first entry.
 */
async function ensureNominee(args: {
  electionId: string;
  position: string | null;
  fullName: string;
  email: string;
  phone: string | null;
}): Promise<string> {
  const db = getDb();
  const [created] = await db
    .insert(nominees)
    .values({
      electionId: args.electionId,
      position: args.position,
      fullName: args.fullName,
      email: args.email,
      phone: args.phone,
    })
    .onConflictDoNothing()
    .returning({ id: nominees.id });
  if (created) return created.id;

  const where = and(
    eq(nominees.electionId, args.electionId),
    args.position === null ? isNull(nominees.position) : eq(nominees.position, args.position),
    sql`lower(${nominees.email}) = ${args.email.trim().toLowerCase()}`,
  );
  const [existing] = await db.select({ id: nominees.id }).from(nominees).where(where).limit(1);
  if (!existing) throw new Error('Could not create the nominee record.');
  return existing.id;
}

type AddRow = {
  nominee_id: string | null;
  prior_status: string | null;
  prior_count: number | string | null;
  nominator_id: string | null;
  bumped_id: string | null;
};

/**
 * Adds one verified nominator inside a single statement. The nominee row is
 * locked (`FOR UPDATE`) so parallel submissions serialize on the same person;
 * the unique (nominee, voter) constraint is the final duplicate guard.
 */
async function insertNominator(args: {
  nomineeId: string;
  electionId: string;
  voterId: string;
  voterName: string | null;
  voterEmail: string;
  min: number;
  max: number;
}): Promise<AddRow> {
  const res = await getDb().execute(sql`
    WITH target AS (
      SELECT n.id, n.status
      FROM nominees n
      WHERE n.id = ${args.nomineeId}::uuid
      FOR UPDATE
    ),
    cnt AS (
      SELECT count(*)::int AS n FROM nominators WHERE nominee_id = (SELECT id FROM target)
    ),
    ins AS (
      INSERT INTO nominators (nominee_id, election_id, voter_id, nominator_name, nominator_email)
      SELECT t.id, ${args.electionId}::uuid, ${args.voterId}::uuid, ${args.voterName}::text, ${args.voterEmail}::text
      FROM target t, cnt
      WHERE t.status IN ('collecting', 'ready') AND cnt.n < ${args.max}::int
      ON CONFLICT (nominee_id, voter_id) DO NOTHING
      RETURNING id
    ),
    bumped AS (
      UPDATE nominees
      SET status = 'ready'
      WHERE id = (SELECT id FROM target)
        AND status = 'collecting'
        AND (SELECT n FROM cnt) + (SELECT count(*)::int FROM ins) >= ${args.min}::int
      RETURNING id
    )
    SELECT (SELECT id FROM target) AS nominee_id,
           (SELECT status FROM target) AS prior_status,
           (SELECT n FROM cnt) AS prior_count,
           (SELECT id FROM ins) AS nominator_id,
           (SELECT id FROM bumped) AS bumped_id
  `);
  return (
    rowsOf<AddRow>(res)[0] ?? {
      nominee_id: null,
      prior_status: null,
      prior_count: null,
      nominator_id: null,
      bumped_id: null,
    }
  );
}

/**
 * Adds a member nomination and its optional private attachments. If storing the
 * attachments fails, the nominator row is removed again (attachments cascade)
 * and the nominee drops back to `collecting` when it no longer has enough.
 */
export async function addMemberNomination(
  args: {
    electionId: string;
    voterId: string;
    voterName: string | null;
    voterEmail: string;
    position: string | null;
    fullName: string;
    email: string;
    phone: string | null;
    min: number;
    max: number;
  },
  attachments: AttachmentInput[],
): Promise<AddNominatorResult> {
  const nomineeId = await ensureNominee({
    electionId: args.electionId,
    position: args.position,
    fullName: args.fullName,
    email: args.email,
    phone: args.phone,
  });

  const row = await insertNominator({
    nomineeId,
    electionId: args.electionId,
    voterId: args.voterId,
    voterName: args.voterName,
    voterEmail: args.voterEmail,
    min: args.min,
    max: args.max,
  });

  const priorStatus = row.prior_status as NomineeStatus | null;
  if (!row.nominator_id) {
    if (!priorStatus || !nomineeAcceptsNominators(priorStatus)) return { ok: false, reason: 'closed' };
    if (Number(row.prior_count ?? 0) >= args.max) return { ok: false, reason: 'full' };
    return { ok: false, reason: 'duplicate' };
  }

  const db = getDb();
  try {
    if (attachments.length > 0) {
      await db.insert(nominationAttachments).values(
        attachments.map((a) => ({
          nominatorId: row.nominator_id!,
          kind: a.kind,
          contentType: a.contentType,
          dataBase64: a.dataBase64,
          size: a.size,
        })),
      );
    }
  } catch (err) {
    await db.delete(nominators).where(eq(nominators.id, row.nominator_id));
    await db.execute(sql`
      UPDATE nominees
      SET status = 'collecting'
      WHERE id = ${nomineeId}::uuid
        AND status = 'ready'
        AND (SELECT count(*) FROM nominators WHERE nominee_id = ${nomineeId}::uuid) < ${args.min}::int
    `);
    throw err;
  }

  const count = Number(row.prior_count ?? 0) + 1;
  const status: NomineeStatus = row.bumped_id ? 'ready' : (priorStatus ?? 'collecting');
  return { ok: true, nomineeId, nominatorId: row.nominator_id, count, status };
}
