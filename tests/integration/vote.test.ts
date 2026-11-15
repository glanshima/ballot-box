/**
 * Integration tests: need a real Neon database/branch with the schema applied.
 *   1. Create a separate Neon branch for tests.
 *   2. Put its POOLED url in TEST_DATABASE_URL (.env.test or .env.local).
 *   3. Apply the schema:  DATABASE_URL=$TEST_DATABASE_URL npm run db:push
 *   4. npm test
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

type Mods = {
  db: ReturnType<typeof import('@/lib/db/client').getDb>;
  s: typeof import('@/lib/db/schema');
  v: typeof import('@/lib/voting');
  t: typeof import('@/lib/tokens');
  r: typeof import('@/lib/results');
};
let m: Mods;
const created: string[] = [];
const HOUR = 3_600_000;

async function makeElection(opts: { status?: 'draft' | 'open' | 'closed' | 'published'; opensOffset?: number; closesOffset?: number; resultsPublic?: boolean } = {}) {
  const { db, s } = m;
  const now = Date.now();
  const [e] = await db
    .insert(s.elections)
    .values({
      title: 'test election',
      type: 'candidate',
      status: opts.status ?? 'open',
      opensAt: new Date(now + (opts.opensOffset ?? -HOUR)),
      closesAt: new Date(now + (opts.closesOffset ?? HOUR)),
      resultsPublic: opts.resultsPublic ?? false,
    })
    .returning();
  created.push(e!.id);
  const mk = async (label: string, position: string, i: number) =>
    (await db.insert(s.options).values({ electionId: e!.id, label, position, sortOrder: i }).returning())[0]!;
  const p1 = await mk('Ann', 'President', 0);
  const p2 = await mk('Bob', 'President', 1);
  const s1 = await mk('Cy', 'Secretary', 2);
  return { election: e!, p1, p2, s1 };
}

async function makeVoter(electionId: string, expiresOffset = HOUR) {
  const raw = m.t.generateToken();
  await m.db.insert(m.s.voters).values({
    electionId,
    email: `${crypto.randomUUID()}@test.invalid`,
    tokenHash: m.t.hashToken(raw),
    tokenExpiresAt: new Date(Date.now() + expiresOffset),
  });
  return raw;
}

const ballotsOf = async (electionId: string) => m.db.select().from(m.s.ballots).where(eq(m.s.ballots.electionId, electionId));

d('voting (integration)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    m = {
      db: (await import('@/lib/db/client')).getDb(),
      s: await import('@/lib/db/schema'),
      v: await import('@/lib/voting'),
      t: await import('@/lib/tokens'),
      r: await import('@/lib/results'),
    };
  });
  afterAll(async () => {
    for (const id of created) await m.db.delete(m.s.elections).where(eq(m.s.elections.id, id)); // cascades
  });

  it('20 parallel submissions with one token: exactly one succeeds, one set of ballots', async () => {
    const { election, p1, s1 } = await makeElection();
    const token = await makeVoter(election.id);
    const choices = [{ position: 'President', optionId: p1.id }, { position: 'Secretary', optionId: s1.id }];
    const results = await Promise.all(Array.from({ length: 20 }, () => m.v.castVote(token, choices)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'voted')).toHaveLength(19);
    expect(await ballotsOf(election.id)).toHaveLength(2); // one ballot row per position
  });

  it('rejects a duplicate vote', async () => {
    const { election, p1, s1 } = await makeElection();
    const token = await makeVoter(election.id);
    const c = [{ position: 'President', optionId: p1.id }, { position: 'Secretary', optionId: s1.id }];
    expect((await m.v.castVote(token, c)).ok).toBe(true);
    expect(await m.v.castVote(token, c)).toEqual({ ok: false, code: 'voted' });
    expect(await ballotsOf(election.id)).toHaveLength(2);
  });

  it('rejects an expired token', async () => {
    const { election, p1, s1 } = await makeElection();
    const token = await makeVoter(election.id, -1000);
    const res = await m.v.castVote(token, [{ position: 'President', optionId: p1.id }, { position: 'Secretary', optionId: s1.id }]);
    expect(res).toEqual({ ok: false, code: 'expired' });
    expect(await ballotsOf(election.id)).toHaveLength(0);
  });

  it('rejects votes when the election is closed, past closes_at, or not yet open', async () => {
    for (const [opts, code] of [
      [{ status: 'closed' as const }, 'closed'],
      [{ closesOffset: -1000 }, 'closed'], // status still "open" but the window has passed (DB clock)
      [{ opensOffset: HOUR, closesOffset: 2 * HOUR }, 'not_open'],
    ] as const) {
      const { election, p1, s1 } = await makeElection(opts);
      const token = await makeVoter(election.id);
      const res = await m.v.castVote(token, [{ position: 'President', optionId: p1.id }, { position: 'Secretary', optionId: s1.id }]);
      expect(res).toEqual({ ok: false, code });
      expect(await ballotsOf(election.id)).toHaveLength(0);
    }
  });

  it('rejects a token from a different election being used against this ballot (wrong election option)', async () => {
    const a = await makeElection();
    const b = await makeElection();
    const token = await makeVoter(a.election.id);
    const res = await m.v.castVote(token, [{ position: 'President', optionId: b.p1.id }, { position: 'Secretary', optionId: a.s1.id }]);
    expect(res).toEqual({ ok: false, code: 'invalid_choice' });
    expect(await ballotsOf(a.election.id)).toHaveLength(0);
    expect(await ballotsOf(b.election.id)).toHaveLength(0);
    // and the voter was NOT marked as voted: they can still vote properly
    expect((await m.v.castVote(token, [{ position: 'President', optionId: a.p1.id }, { position: 'Secretary', optionId: a.s1.id }])).ok).toBe(true);
  });

  it('rejects two choices for one position', async () => {
    const { election, p1, p2, s1 } = await makeElection();
    const token = await makeVoter(election.id);
    const res = await m.v.castVote(token, [{ position: 'President', optionId: p1.id }, { position: 'President', optionId: p2.id }, { position: 'Secretary', optionId: s1.id }]);
    expect(res).toEqual({ ok: false, code: 'invalid_choice' });
    expect(await ballotsOf(election.id)).toHaveLength(0);
  });

  it('rejects an unknown token', async () => {
    expect(await m.v.castVote(m.t.generateToken(), [{ position: null, optionId: null }])).toEqual({ ok: false, code: 'invalid' });
  });

  it('stores abstentions, no voter linkage, rounded buckets', async () => {
    const { election, p1 } = await makeElection();
    const token = await makeVoter(election.id);
    expect((await m.v.castVote(token, [{ position: 'President', optionId: p1.id }, { position: 'Secretary', optionId: null }])).ok).toBe(true);
    const rows = await ballotsOf(election.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.position === 'Secretary')!.optionId).toBeNull();
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['castBucket', 'electionId', 'id', 'optionId', 'position']);
      expect(r.castBucket!.getUTCMinutes()).toBe(0);
      expect(r.castBucket!.getUTCSeconds()).toBe(0);
    }
  });

  it('results are hidden before close and visible to the public only after publish', async () => {
    const { election, p1, s1 } = await makeElection({ resultsPublic: true });
    const token = await makeVoter(election.id);
    await m.v.castVote(token, [{ position: 'President', optionId: p1.id }, { position: 'Secretary', optionId: s1.id }]);

    expect(await m.r.loadResultsForViewer(election.id, 'public')).toMatchObject({ ok: false, status: 403 });
    expect(await m.r.loadResultsForViewer(election.id, 'admin')).toMatchObject({ ok: false, status: 403 });

    await m.db.update(m.s.elections).set({ status: 'closed' }).where(eq(m.s.elections.id, election.id));
    expect(await m.r.loadResultsForViewer(election.id, 'public')).toMatchObject({ ok: false, status: 403 });
    const adminView = await m.r.loadResultsForViewer(election.id, 'admin');
    expect(adminView.ok).toBe(true);

    await m.db.update(m.s.elections).set({ status: 'published' }).where(eq(m.s.elections.id, election.id));
    const pub = await m.r.loadResultsForViewer(election.id, 'public');
    expect(pub.ok).toBe(true);
    if (pub.ok) {
      expect(pub.results.turnout).toMatchObject({ voted: 1, total: 1 });
      const president = pub.results.positions.find((p) => p.position === 'President')!;
      expect(president.options.find((o) => o.label === 'Ann')).toMatchObject({ votes: 1, isWinner: true });
    }
  });
});
