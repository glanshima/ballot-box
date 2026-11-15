import { createHash } from 'node:crypto';
import { count, eq, sql } from 'drizzle-orm';
import { toCsv } from './csv';
import { getDb } from './db/client';
import { getElection, getOptions } from './db/queries';
import { ballots, voters, type Election } from './db/schema';
import { groupOptions } from './voting';

export type Viewer = 'public' | 'admin';

/**
 * Single source of truth for who may see results. Enforced server-side only.
 *  - draft:      nobody
 *  - open:       admins only, and only if live_results is on
 *  - closed:     admins only
 *  - published:  admins; the public only if results_public is on
 */
export function resultsAccess(
  e: Pick<Election, 'status' | 'resultsPublic' | 'liveResults'>,
  viewer: Viewer,
): 'allow' | 'deny' {
  switch (e.status) {
    case 'draft':
      return 'deny';
    case 'open':
      return viewer === 'admin' && e.liveResults ? 'allow' : 'deny';
    case 'closed':
      return viewer === 'admin' ? 'allow' : 'deny';
    case 'published':
      return viewer === 'admin' || e.resultsPublic ? 'allow' : 'deny';
  }
}

export type OptionResult = {
  optionId: string;
  label: string;
  imageUrl: string | null;
  votes: number;
  percent: number;
  isWinner: boolean;
};
export type PositionResult = {
  position: string | null;
  options: OptionResult[];
  abstentions: number;
  totalBallots: number;
  tie: boolean;
};
export type ElectionResults = {
  positions: PositionResult[];
  turnout: { voted: number; total: number; percent: number };
};

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

/** Server-side tally: ballots per option grouped by position, plus turnout from voters. */
export async function computeResults(electionId: string): Promise<ElectionResults> {
  const db = getDb();
  const opts = await getOptions(electionId);
  const rows = await db
    .select({ position: ballots.position, optionId: ballots.optionId, n: count() })
    .from(ballots)
    .where(eq(ballots.electionId, electionId))
    .groupBy(ballots.position, ballots.optionId);
  const [t] = await db
    .select({ total: count(), voted: sql<number>`count(*) filter (where ${voters.hasVoted})` })
    .from(voters)
    .where(eq(voters.electionId, electionId));

  const votesByOption = new Map<string, number>();
  const abstainByPos = new Map<string, number>();
  for (const r of rows) {
    if (r.optionId) votesByOption.set(r.optionId, (votesByOption.get(r.optionId) ?? 0) + Number(r.n));
    else abstainByPos.set(r.position ?? '', (abstainByPos.get(r.position ?? '') ?? 0) + Number(r.n));
  }

  const positions = groupOptions(opts).map((g): PositionResult => {
    const abstentions = abstainByPos.get(g.position ?? '') ?? 0;
    const counts = g.options.map((o) => votesByOption.get(o.id) ?? 0);
    const totalBallots = counts.reduce((a, b) => a + b, 0) + abstentions;
    const max = Math.max(0, ...counts);
    const leaders = max > 0 ? counts.filter((c) => c === max).length : 0;
    return {
      position: g.position,
      abstentions,
      totalBallots,
      tie: leaders > 1,
      options: g.options.map((o, i) => ({
        optionId: o.id,
        label: o.label,
        imageUrl: o.imageUrl,
        votes: counts[i]!,
        percent: pct(counts[i]!, totalBallots),
        isWinner: max > 0 && counts[i] === max && leaders === 1,
      })),
    };
  });

  const total = Number(t?.total ?? 0);
  const voted = Number(t?.voted ?? 0);
  return { positions, turnout: { voted, total, percent: pct(voted, total) } };
}

export type LoadedResults =
  | { ok: true; election: Election; results: ElectionResults }
  | { ok: false; status: 403 | 404 };

export async function loadResultsForViewer(electionId: string, viewer: Viewer): Promise<LoadedResults> {
  const election = await getElection(electionId);
  if (!election) return { ok: false, status: 404 };
  if (resultsAccess(election, viewer) === 'deny') return { ok: false, status: 403 };
  return { ok: true, election, results: await computeResults(electionId) };
}

export const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export function resultsToCsv(election: Pick<Election, 'title'>, r: ElectionResults): string {
  const rows: (string | number | null)[][] = [['election', 'position', 'option', 'votes', 'percent_of_ballots', 'outcome']];
  for (const p of r.positions) {
    for (const o of p.options) {
      rows.push([election.title, p.position ?? '', o.label, o.votes, o.percent, o.isWinner ? 'winner' : p.tie && o.votes === Math.max(...p.options.map((x) => x.votes)) ? 'tie' : '']);
    }
    rows.push([election.title, p.position ?? '', '(abstain)', p.abstentions, pct(p.abstentions, p.totalBallots), '']);
  }
  rows.push([election.title, '', 'TURNOUT voted', r.turnout.voted, r.turnout.percent, '']);
  rows.push([election.title, '', 'TURNOUT eligible', r.turnout.total, '', '']);
  return toCsv(rows);
}
