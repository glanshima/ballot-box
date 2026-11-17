import { eq, sql } from 'drizzle-orm';
import { getDb, rowsOf } from './db/client';
import { getOptions } from './db/queries';
import { ballots, voters } from './db/schema';
import { groupOptions } from './voting';

export type IntegrityCheck = { label: string; ok: boolean; detail: string };
export type IntegrityReport = {
  ok: boolean;
  voted: number;
  eligible: number;
  ballots: number;
  positions: number;
  checks: IntegrityCheck[];
};

/**
 * Read-only reconciliation between turnout and ballot rows.
 *
 * Every submitted ballot writes exactly one row per position (an abstention is a
 * row with option_id = NULL), so `ballots` must equal `voted × positions`.
 * Options are locked once an election leaves draft, which keeps this invariant
 * stable for closed/published elections.
 */
export async function reconcileElection(electionId: string): Promise<IntegrityReport> {
  const db = getDb();
  const [options, turnout] = await Promise.all([
    getOptions(electionId),
    db
      .select({
        eligible: sql<number>`count(*)::int`,
        voted: sql<number>`count(*) filter (where ${voters.hasVoted})::int`,
      })
      .from(voters)
      .where(eq(voters.electionId, electionId)),
  ]);
  const groups = groupOptions(options);

  const [totals] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ballots)
    .where(eq(ballots.electionId, electionId));
  const byPosition = await db
    .select({ position: ballots.position, n: sql<number>`count(*)::int` })
    .from(ballots)
    .where(eq(ballots.electionId, electionId))
    .groupBy(ballots.position);
  const [crossElection] = rowsOf<{ n: number | string }>(
    await db.execute(sql`
      SELECT count(*)::int AS n
      FROM ballots b
      JOIN options o ON o.id = b.option_id
      WHERE b.election_id = ${electionId}::uuid AND o.election_id <> b.election_id
    `),
  );
  const [mismatched] = rowsOf<{ n: number | string }>(
    await db.execute(sql`
      SELECT count(*)::int AS n
      FROM ballots b
      JOIN options o ON o.id = b.option_id
      WHERE b.election_id = ${electionId}::uuid AND b."position" IS DISTINCT FROM o."position"
    `),
  );

  const voted = Number(turnout[0]?.voted ?? 0);
  const eligible = Number(turnout[0]?.eligible ?? 0);
  const recorded = Number(totals?.n ?? 0);
  const expected = voted * groups.length;
  const perPosition = new Map(byPosition.map((r) => [r.position ?? '', Number(r.n)]));

  const checks: IntegrityCheck[] = [
    {
      label: 'Ballot rows match turnout',
      ok: recorded === expected,
      detail: `${recorded} ballot row(s) recorded; ${voted} voter(s) × ${groups.length} position(s) = ${expected}.`,
    },
    {
      label: 'One ballot row per voter per position',
      ok: groups.every((g) => (perPosition.get(g.position ?? '') ?? 0) === voted),
      detail: groups
        .map((g) => `${g.position ?? 'Poll'} ${perPosition.get(g.position ?? '') ?? 0}/${voted}`)
        .join('; ') || 'No positions defined.',
    },
    {
      label: 'Option and ballot positions agree',
      ok: Number(mismatched?.n ?? 0) === 0,
      detail: `${Number(mismatched?.n ?? 0)} row(s) reference an option from another position.`,
    },
    {
      label: 'No ballot rows cross elections',
      ok: Number(crossElection?.n ?? 0) === 0,
      detail: `${Number(crossElection?.n ?? 0)} row(s) reference an option from another election.`,
    },
  ];
  return {
    ok: checks.every((c) => c.ok),
    voted,
    eligible,
    ballots: recorded,
    positions: groups.length,
    checks,
  };
}
