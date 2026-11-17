/**
 * Integration tests for member nominations: unique constraints, nominator
 * counting, the consent flow and the export permission gates.
 *
 * Needs a Neon test branch (TEST_DATABASE_URL) with migrations applied; the
 * Neon HTTP driver does not work against a plain local PostgreSQL. Skipped
 * automatically when TEST_DATABASE_URL is not set.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NomineeStatus } from '@/lib/db/schema';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
// Fail-closed presets would refuse everything without Upstash; this file tests
// the flow and permissions, not the limiter.
vi.mock('@/lib/ratelimit', () => ({
  checkLimit: async () => true,
  checkLimitClosed: async () => true,
  getClientIp: () => '127.0.0.1',
}));
// next/headers cookies() needs a request scope; the OTP test only needs the
// service call to happen, not a real Set-Cookie header.
vi.mock('@/lib/nominations/session', () => ({
  issueMemberSession: vi.fn(async () => {}),
  readMemberSession: vi.fn(async () => null),
}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const HOUR = 3_600_000;
const ORIGIN = 'https://app.test';

type Deps = {
  db: ReturnType<typeof import('@/lib/db/client').getDb>;
  s: typeof import('@/lib/db/schema');
  t: typeof import('@/lib/tokens');
  m: typeof import('@/lib/nominations/member');
  otp: typeof import('@/lib/nominations/otp');
  keys: typeof import('@/lib/nominations/keys');
};
let x: Deps;
let authMock: ReturnType<typeof vi.fn>;
let sessionMock: { issueMemberSession: ReturnType<typeof vi.fn> };
let consentRoute: typeof import('@/app/api/consent/[token]/route');
let otpRequest: typeof import('@/app/api/nominations/otp/request/route');
let otpVerify: typeof import('@/app/api/nominations/otp/verify/route');
let nominationsPdf: typeof import('@/app/api/admin/elections/[id]/nominations-pdf/route');
let resultsPdf: typeof import('@/app/api/admin/elections/[id]/results-pdf/route');
let attachmentsAction: typeof import('@/lib/actions/attachments');

const createdElections: string[] = [];
const createdAdmins: string[] = [];

async function makeElection(opts: { type?: 'candidate' | 'poll'; mode?: 'self' | 'member'; status?: 'draft' | 'open' } = {}) {
  const [e] = await x.db
    .insert(x.s.elections)
    .values({
      title: 'integration election',
      type: opts.type ?? 'candidate',
      status: opts.status ?? 'draft',
      opensAt: new Date(Date.now() - HOUR),
      closesAt: new Date(Date.now() + HOUR),
      nominationMode: opts.mode ?? 'member',
      nominationsEnabled: true,
      minNominators: 2,
      maxNominators: 3,
    })
    .returning();
  createdElections.push(e!.id);
  return e!;
}

async function makeVoter(electionId: string) {
  const email = `${crypto.randomUUID()}@test.invalid`;
  const [v] = await x.db.insert(x.s.voters).values({ electionId, email }).returning();
  return v!;
}

async function makeNominee(
  electionId: string,
  opts: { position?: string | null; email?: string; status?: NomineeStatus; consent?: { token: string; expiresAt: Date } } = {},
) {
  const [n] = await x.db
    .insert(x.s.nominees)
    .values({
      electionId,
      position: opts.position === undefined ? 'Chair' : opts.position,
      fullName: 'Test Nominee',
      email: opts.email ?? `${crypto.randomUUID()}@test.invalid`,
      status: opts.status ?? 'collecting',
      consentTokenHash: opts.consent ? x.t.hashToken(opts.consent.token) : null,
      consentExpiresAt: opts.consent?.expiresAt ?? null,
    })
    .returning();
  return n!;
}

async function makeAdmin(role: 'admin' | 'super_admin' = 'admin') {
  const [a] = await x.db
    .insert(x.s.admins)
    .values({
      email: `${crypto.randomUUID()}@test.invalid`,
      name: 'Integration admin',
      passwordHash: 'unusable-in-tests',
      role,
    })
    .returning();
  createdAdmins.push(a!.id);
  return a!;
}

const sessionFor = (a: { id: string; email: string; name: string | null; role: string; sessionVersion: number }) => ({
  user: { id: a.id, email: a.email, name: a.name, role: a.role, sessionVersion: a.sessionVersion },
});

const consentRequest = (token: string, body: unknown) =>
  new Request(`${ORIGIN}/api/consent/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify(body),
  });

const photoFor = (electionId: string) => {
  const path = `nominations/${electionId}/${crypto.randomUUID()}.png`;
  return { photoUrl: `https://blob.public.blob.vercel-storage.com/${path}`, photoPath: path };
};

const otpJsonRequest = (path: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify(body),
  });

/** Inserts a known code; returns the stored email hash. */
async function seedOtp(electionId: string, email: string, code: string, expiresAt = new Date(Date.now() + 600_000)) {
  const key = x.keys.nominationKeys().otp;
  const emailHash = x.otp.otpEmailHash(key, electionId, email);
  await x.db.insert(x.s.memberOtps).values({
    electionId,
    emailHash,
    codeHash: x.otp.otpCodeHash(key, electionId, emailHash, code),
    expiresAt,
  });
  return emailHash;
}

d('nominations (integration)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.AUTH_SECRET ??= 'integration-test-secret-0123456789';
    process.env.APP_URL ??= ORIGIN;
    x = {
      db: (await import('@/lib/db/client')).getDb(),
      s: await import('@/lib/db/schema'),
      t: await import('@/lib/tokens'),
      m: await import('@/lib/nominations/member'),
      otp: await import('@/lib/nominations/otp'),
      keys: await import('@/lib/nominations/keys'),
    };
    authMock = (await import('@/auth')).auth as unknown as ReturnType<typeof vi.fn>;
    sessionMock = (await import('@/lib/nominations/session')) as unknown as typeof sessionMock;
    consentRoute = await import('@/app/api/consent/[token]/route');
    otpRequest = await import('@/app/api/nominations/otp/request/route');
    otpVerify = await import('@/app/api/nominations/otp/verify/route');
    nominationsPdf = await import('@/app/api/admin/elections/[id]/nominations-pdf/route');
    resultsPdf = await import('@/app/api/admin/elections/[id]/results-pdf/route');
    attachmentsAction = await import('@/lib/actions/attachments');
  });

  afterAll(async () => {
    if (createdElections.length) {
      await x.db.delete(x.s.auditLog).where(inArray(x.s.auditLog.electionId, createdElections));
      await x.db.delete(x.s.elections).where(inArray(x.s.elections.id, createdElections));
    }
    if (createdAdmins.length) await x.db.delete(x.s.admins).where(inArray(x.s.admins.id, createdAdmins));
  });

  describe('unique constraints', () => {
    it('allows one nominee per election, position and email (case-insensitive)', async () => {
      const e = await makeElection();
      await makeNominee(e.id, { position: 'Chair', email: 'Dup@Example.com' });
      await expect(makeNominee(e.id, { position: 'Chair', email: 'dup@example.com' })).rejects.toThrow();
      // same email standing for a different position is a different person-slot
      await expect(makeNominee(e.id, { position: 'Treasurer', email: 'DUP@example.com' })).resolves.toBeTruthy();
    });

    it('allows one poll nominee per election and email when position is null', async () => {
      const e = await makeElection({ type: 'poll' });
      await makeNominee(e.id, { position: null, email: 'Poll@Example.com' });
      await expect(makeNominee(e.id, { position: null, email: 'poll@example.com' })).rejects.toThrow();
      await expect(makeNominee(e.id, { position: null, email: 'other@example.com' })).resolves.toBeTruthy();
    });

    it('allows one nominator per nominee and voter', async () => {
      const e = await makeElection();
      const n = await makeNominee(e.id);
      const a = await makeVoter(e.id);
      const b = await makeVoter(e.id);
      const row = (voterId: string) => ({
        nomineeId: n.id,
        electionId: e.id,
        voterId,
        nominatorName: 'M',
        nominatorEmail: `${voterId}@test.invalid`,
      });
      await x.db.insert(x.s.nominators).values(row(a.id));
      await expect(x.db.insert(x.s.nominators).values(row(a.id))).rejects.toThrow();
      await expect(x.db.insert(x.s.nominators).values(row(b.id))).resolves.toBeTruthy();
    });

    it('allows one suggestion per election and normalised title', async () => {
      const e = await makeElection({ type: 'poll' });
      await x.db.insert(x.s.optionSuggestions).values({
        electionId: e.id,
        title: 'New Playground',
        normalizedTitle: 'new playground',
      });
      await expect(
        x.db.insert(x.s.optionSuggestions).values({
          electionId: e.id,
          title: 'new   playground',
          normalizedTitle: 'new playground',
        }),
      ).rejects.toThrow();
    });

    it('keeps consent token hashes unique', async () => {
      const e = await makeElection();
      const token = x.t.generateToken();
      await makeNominee(e.id, { consent: { token, expiresAt: new Date(Date.now() + HOUR) } });
      await expect(makeNominee(e.id, { consent: { token, expiresAt: new Date(Date.now() + HOUR) } })).rejects.toThrow();
    });
  });

  describe('nominator counting', () => {
    it('moves collecting -> ready at the minimum, stops at the maximum and blocks repeats', async () => {
      const e = await makeElection();
      const n = await makeNominee(e.id);
      const voters = [await makeVoter(e.id), await makeVoter(e.id), await makeVoter(e.id), await makeVoter(e.id)];
      const add = (voterId: string) =>
        x.m.addMemberNomination(
          {
            electionId: e.id,
            voterId,
            voterName: 'Member',
            voterEmail: `${voterId}@test.invalid`,
            position: 'Chair',
            fullName: 'Test Nominee',
            email: n.email,
            phone: null,
            min: 2,
            max: 3,
          },
          [],
        );

      expect(await add(voters[0]!.id)).toMatchObject({ ok: true, count: 1, status: 'collecting' });
      expect(await add(voters[1]!.id)).toMatchObject({ ok: true, count: 2, status: 'ready' });
      expect(await add(voters[0]!.id)).toMatchObject({ ok: false, reason: 'duplicate' });
      expect(await add(voters[2]!.id)).toMatchObject({ ok: true, count: 3 });
      expect(await add(voters[3]!.id)).toMatchObject({ ok: false, reason: 'full' });
    });

    it('refuses new nominators once the nominee has moved past ready', async () => {
      const e = await makeElection();
      const n = await makeNominee(e.id, { status: 'accepted' });
      const v = await makeVoter(e.id);
      const res = await x.m.addMemberNomination(
        {
          electionId: e.id,
          voterId: v.id,
          voterName: null,
          voterEmail: v.email,
          position: 'Chair',
          fullName: 'Test Nominee',
          email: n.email,
          phone: null,
          min: 2,
          max: 3,
        },
        [],
      );
      expect(res).toEqual({ ok: false, reason: 'closed' });
    });
  });

  describe('consent flow', () => {
    it('accepts once with a photo and cannot be replayed', async () => {
      const e = await makeElection();
      const token = x.t.generateToken();
      const n = await makeNominee(e.id, { consent: { token, expiresAt: new Date(Date.now() + HOUR) } });

      const res = await consentRoute.POST(consentRequest(token, { action: 'accept', ...photoFor(e.id), bio: 'Hello' }), {
        params: Promise.resolve({ token }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, status: 'accepted' });

      const [row] = await x.db.select().from(x.s.nominees).where(eq(x.s.nominees.id, n.id));
      expect(row).toMatchObject({ status: 'accepted', bio: 'Hello', consentExpiresAt: null });
      expect(row!.photoUrl).toContain('/nominations/');

      const replay = await consentRoute.POST(consentRequest(token, { action: 'decline' }), {
        params: Promise.resolve({ token }),
      });
      expect(replay.status).toBe(409);
      const [after] = await x.db.select().from(x.s.nominees).where(eq(x.s.nominees.id, n.id));
      expect(after!.status).toBe('accepted');
    });

    it('expires a stale link without accepting it', async () => {
      const e = await makeElection();
      const token = x.t.generateToken();
      const n = await makeNominee(e.id, { consent: { token, expiresAt: new Date(Date.now() - 1000) } });

      const res = await consentRoute.POST(consentRequest(token, { action: 'decline' }), {
        params: Promise.resolve({ token }),
      });
      expect(res.status).toBe(409);
      const [row] = await x.db.select().from(x.s.nominees).where(eq(x.s.nominees.id, n.id));
      expect(row!.status).toBe('expired');
    });

    it('records a decline', async () => {
      const e = await makeElection();
      const token = x.t.generateToken();
      const n = await makeNominee(e.id, { consent: { token, expiresAt: new Date(Date.now() + HOUR) } });

      const res = await consentRoute.POST(consentRequest(token, { action: 'decline' }), {
        params: Promise.resolve({ token }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, status: 'declined' });
      const [row] = await x.db.select().from(x.s.nominees).where(eq(x.s.nominees.id, n.id));
      expect(row!.status).toBe('declined');
    });

    it('refuses a consent decision once the election is no longer a member-mode draft', async () => {
      const e = await makeElection({ status: 'open' });
      const token = x.t.generateToken();
      await makeNominee(e.id, { consent: { token, expiresAt: new Date(Date.now() + HOUR) } });

      const res = await consentRoute.POST(consentRequest(token, { action: 'decline' }), {
        params: Promise.resolve({ token }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('member OTP endpoints', () => {
    it('answers identically for an address that is not on the roll', async () => {
      const e = await makeElection();
      const res = await otpRequest.POST(
        otpJsonRequest('/api/nominations/otp/request', { electionId: e.id, email: 'missing@test.invalid' }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it('issues a member session for a valid code on the roll', async () => {
      const e = await makeElection();
      const v = await makeVoter(e.id);
      const emailHash = await seedOtp(e.id, v.email, '246810');

      const res = await otpVerify.POST(
        otpJsonRequest('/api/nominations/otp/verify', { electionId: e.id, email: v.email.toUpperCase(), code: '246810' }),
      );
      expect(res.status).toBe(200);
      expect(sessionMock.issueMemberSession).toHaveBeenCalledWith(e.id, v.id);

      const [row] = await x.db
        .select()
        .from(x.s.memberOtps)
        .where(and(eq(x.s.memberOtps.electionId, e.id), eq(x.s.memberOtps.emailHash, emailHash)));
      expect(row!.consumedAt).not.toBeNull();
    });

    it('exhausts a code after five wrong attempts', async () => {
      const e = await makeElection();
      const v = await makeVoter(e.id);
      const emailHash = await seedOtp(e.id, v.email, '135790');

      for (let i = 0; i < 5; i++) {
        const res = await otpVerify.POST(
          otpJsonRequest('/api/nominations/otp/verify', { electionId: e.id, email: v.email, code: '000000' }),
        );
        expect(res.status).toBe(400);
      }
      const correct = await otpVerify.POST(
        otpJsonRequest('/api/nominations/otp/verify', { electionId: e.id, email: v.email, code: '135790' }),
      );
      expect(correct.status).toBe(400);

      const [row] = await x.db
        .select()
        .from(x.s.memberOtps)
        .where(and(eq(x.s.memberOtps.electionId, e.id), eq(x.s.memberOtps.emailHash, emailHash)));
      expect(row!.attempts).toBe(5);
      expect(row!.consumedAt).toBeNull();
    });

    it('rejects an expired code without consuming it', async () => {
      const e = await makeElection();
      const v = await makeVoter(e.id);
      const emailHash = await seedOtp(e.id, v.email, '112233', new Date(Date.now() - 1000));

      const res = await otpVerify.POST(
        otpJsonRequest('/api/nominations/otp/verify', { electionId: e.id, email: v.email, code: '112233' }),
      );
      expect(res.status).toBe(400);
      const [row] = await x.db
        .select()
        .from(x.s.memberOtps)
        .where(and(eq(x.s.memberOtps.electionId, e.id), eq(x.s.memberOtps.emailHash, emailHash)));
      expect(row!.consumedAt).toBeNull();
    });
  });

  describe('retention purge', () => {
    it('is super-admin only and deletes every proof and signature after confirmation', async () => {
      const e = await makeElection();
      const n = await makeNominee(e.id);
      const v = await makeVoter(e.id);
      const [nom] = await x.db
        .insert(x.s.nominators)
        .values({
          nomineeId: n.id,
          electionId: e.id,
          voterId: v.id,
          nominatorName: 'Member',
          nominatorEmail: v.email,
        })
        .returning();
      await x.db.insert(x.s.nominationAttachments).values([
        { nominatorId: nom!.id, kind: 'membership_proof', contentType: 'image/png', dataBase64: 'AA==', size: 1 },
        { nominatorId: nom!.id, kind: 'signature', contentType: 'image/png', dataBase64: 'AA==', size: 1 },
      ]);
      const remaining = async () =>
        x.db.select().from(x.s.nominationAttachments).where(eq(x.s.nominationAttachments.nominatorId, nom!.id));

      const plain = await makeAdmin();
      authMock.mockResolvedValue(sessionFor(plain));
      const confirmed = new FormData();
      confirmed.set('confirmTitle', e.title);
      expect(await attachmentsAction.purgeNominationAttachments(e.id, null, confirmed)).toMatchObject({
        ok: false,
        error: expect.stringMatching(/super admin/i),
      });
      expect(await remaining()).toHaveLength(2);

      const superAdmin = await makeAdmin('super_admin');
      authMock.mockResolvedValue(sessionFor(superAdmin));
      const wrongTitle = new FormData();
      wrongTitle.set('confirmTitle', 'not the title');
      expect(await attachmentsAction.purgeNominationAttachments(e.id, null, wrongTitle)).toMatchObject({
        ok: false,
        error: expect.stringMatching(/exactly/i),
      });
      expect(await remaining()).toHaveLength(2);

      expect(await attachmentsAction.purgeNominationAttachments(e.id, null, confirmed)).toMatchObject({
        ok: true,
        message: expect.stringMatching(/deleted/i),
      });
      expect(await remaining()).toHaveLength(0);

      const [audit] = await x.db
        .select()
        .from(x.s.auditLog)
        .where(and(eq(x.s.auditLog.electionId, e.id), eq(x.s.auditLog.action, 'nomination.attachments_purged')));
      expect(audit?.meta).toEqual({ deleted: 2 });
    });
  });

  describe('export permissions', () => {
    const params = (id: string) => ({ params: Promise.resolve({ id }) });
    const req = () => new Request(`${ORIGIN}/api/admin/elections/x/nominations-pdf`);

    it('returns 401 for a signed-out user', async () => {
      authMock.mockResolvedValue(null);
      const id = crypto.randomUUID();
      expect((await nominationsPdf.GET(req(), params(id))).status).toBe(401);
      expect((await resultsPdf.GET(req(), params(id))).status).toBe(401);
    });

    it('returns 404 for an admin who is not assigned to the election', async () => {
      const admin = await makeAdmin();
      authMock.mockResolvedValue(sessionFor(admin));
      const e = await makeElection();
      expect((await nominationsPdf.GET(req(), params(e.id))).status).toBe(404);
      expect((await resultsPdf.GET(req(), params(e.id))).status).toBe(404);
    });

    it('lets an assigned admin export nominations and reaches the results gate', async () => {
      const admin = await makeAdmin();
      authMock.mockResolvedValue(sessionFor(admin));
      const e = await makeElection();
      await x.db.insert(x.s.electionAdmins).values({ electionId: e.id, adminId: admin.id });

      const pdf = await nominationsPdf.GET(req(), params(e.id));
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
      expect(pdf.headers.get('cache-control')).toBe('private, no-store');
      const bytes = new Uint8Array(await pdf.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

      // Draft results are not available yet: 403 means the 404 permission gate passed.
      expect((await resultsPdf.GET(req(), params(e.id))).status).toBe(403);
    });
  });
});
