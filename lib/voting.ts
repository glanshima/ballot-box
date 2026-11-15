import { eq, sql } from 'drizzle-orm';
import { getDb, rowsOf } from './db/client';
import { getOptions } from './db/queries';
import { elections, voters, type Option } from './db/schema';
import { hashToken, TOKEN_REGEX } from './tokens';
import type { Choice } from './validators';

export type VoterState =
  | { status: 'invalid' | 'expired' | 'not_open' | 'closed' | 'voted' }
  | {
      status: 'ok';
      election: { id: string; title: string; description: string | null; type: 'candidate' | 'poll'; closesAt: Date };
      options: Option[];
    };

/**
 * Resolve a token hash to a voter state. All time comparisons use the DATABASE
 * clock (`now()`), never the app server's.
 */
export async function lookupByHash(hash: string): Promise<VoterState> {
  const db = getDb();
  const [row] = await db
    .select({
      hasVoted: voters.hasVoted,
      expiresAt: voters.tokenExpiresAt,
      electionId: elections.id,
      title: elections.title,
      description: elections.description,
      type: elections.type,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      now: sql<string>`now()`,
    })
    .from(voters)
    .innerJoin(elections, eq(elections.id, voters.electionId))
    .where(eq(voters.tokenHash, hash))
    .limit(1);

  // Unknown token -> generic "invalid". Never reveals whether an email exists.
  if (!row) return { status: 'invalid' };
  const now = new Date(row.now);
  if (row.hasVoted) return { status: 'voted' };
  if (!row.expiresAt || row.expiresAt <= now) return { status: 'expired' };
  if (row.status === 'closed' || row.status === 'published' || now >= row.closesAt) return { status: 'closed' };
  if (row.status !== 'open' || now < row.opensAt) return { status: 'not_open' };

  return {
    status: 'ok',
    election: {
      id: row.electionId,
      title: row.title,
      description: row.description,
      type: row.type,
      closesAt: row.closesAt,
    },
    options: await getOptions(row.electionId),
  };
}

export async function lookupVoter(rawToken: string): Promise<VoterState> {
  if (!TOKEN_REGEX.test(rawToken)) return { status: 'invalid' };
  return lookupByHash(hashToken(rawToken));
}

// ---------- ballot structure & validation (pure) ----------

export type BallotGroup<T> = { position: string | null; options: T[] };

/** Group options by position, preserving order of first appearance. Polls = one group (position null). */
export function groupOptions<T extends { position: string | null }>(opts: T[]): BallotGroup<T>[] {
  const map = new Map<string, BallotGroup<T>>();
  for (const o of opts) {
    const key = o.position ?? '';
    if (!map.has(key)) map.set(key, { position: o.position ?? null, options: [] });
    map.get(key)!.options.push(o);
  }
  return [...map.values()];
}

/**
 * Returns an error string, or null when `choices` is a valid ballot:
 * exactly one entry (an option or an explicit abstain) per position, and every
 * chosen option belongs to this election AND to that position.
 */
export function validateChoices(opts: { id: string; position: string | null }[], choices: Choice[]): string | null {
  const byId = new Map(opts.map((o) => [o.id, o]));
  const positions = new Set(opts.map((o) => o.position ?? ''));
  const seen = new Set<string>();
  for (const c of choices) {
    const key = c.position ?? '';
    if (!positions.has(key)) return 'Unknown position.';
    if (seen.has(key)) return 'More than one choice for a position.';
    seen.add(key);
    if (c.optionId !== null) {
      const o = byId.get(c.optionId);
      if (!o) return 'Option does not belong to this election.';
      if ((o.position ?? '') !== key) return 'Option does not belong to this position.';
    }
  }
  if (seen.size !== positions.size) return 'Every position needs a choice or an explicit abstain.';
  return null;
}

export type CastResult =
  | { ok: true }
  | { ok: false; code: 'invalid' | 'expired' | 'not_open' | 'closed' | 'voted' | 'invalid_choice' };

/**
 * ATOMIC VOTE (single SQL statement).
 *
 * Neon's HTTP driver cannot run interactive transactions, so everything happens
 * in ONE statement: a data-modifying CTE. Postgres executes it atomically.
 *   - `upd` flips has_voted only if the voter is unused, the token is unexpired
 *     and the election is open within opens_at..closes_at (DB clock), and every
 *     submitted option belongs to the voter's election.
 *   - `ins` inserts the ballot rows FROM `upd`, so zero updated voters => zero ballots.
 * Under READ COMMITTED, concurrent submissions with the same token serialise on
 * the voter row; the losers re-evaluate `has_voted = false` and update nothing.
 * Ballot rows carry no voter reference, a random id, and an hour-rounded bucket.
 */
export async function castVote(rawToken: string, choices: Choice[]): Promise<CastResult> {
  if (!TOKEN_REGEX.test(rawToken)) return { ok: false, code: 'invalid' };
  const hash = hashToken(rawToken);

  const state = await lookupByHash(hash);
  if (state.status !== 'ok') return { ok: false, code: state.status };
  if (validateChoices(state.options, choices) !== null) return { ok: false, code: 'invalid_choice' };

  const payload = JSON.stringify(choices.map((c) => ({ position: c.position ?? '', option_id: c.optionId })));
  const db = getDb();
  const res = await db.execute(sql`
    WITH c AS (
      SELECT NULLIF(x."position", '') AS "position", x.option_id
      FROM jsonb_to_recordset(${payload}::jsonb) AS x("position" text, option_id uuid)
    ),
    upd AS (
      UPDATE voters v
      SET has_voted = true, voted_at = date_trunc('day', now())
      FROM elections e
      WHERE v.token_hash = ${hash}
        AND v.has_voted = false
        AND v.token_expires_at > now()
        AND e.id = v.election_id
        AND e.status = 'open'
        AND now() >= e.opens_at
        AND now() < e.closes_at
        AND NOT EXISTS (
          SELECT 1 FROM c
          WHERE c.option_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM options o WHERE o.id = c.option_id AND o.election_id = v.election_id)
        )
      RETURNING v.election_id
    ),
    ins AS (
      INSERT INTO ballots (election_id, option_id, "position", cast_bucket)
      SELECT upd.election_id, c.option_id, c."position", date_trunc('hour', now())
      FROM upd CROSS JOIN c
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM upd)::int AS updated, (SELECT count(*) FROM ins)::int AS inserted
  `);

  const updated = Number(rowsOf<{ updated: number }>(res)[0]?.updated ?? 0);
  if (updated === 0) {
    // Lost a race or state changed between lookup and write: report the real reason.
    const again = await lookupByHash(hash);
    return { ok: false, code: again.status === 'ok' ? 'voted' : again.status };
  }
  return { ok: true };
}
