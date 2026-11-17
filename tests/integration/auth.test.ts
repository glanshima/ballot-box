/**
 * Integration tests for the admin auth model: single-use password tokens, the
 * last-super-admin guard, and session invalidation after a password/role change.
 * Same setup as vote.test.ts (TEST_DATABASE_URL + `npm run db:push`).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

let db: ReturnType<typeof import('@/lib/db/client').getDb>;
let s: typeof import('@/lib/db/schema');
let pt: typeof import('@/lib/password-tokens');
let g: typeof import('@/lib/admin-guards');
let t: typeof import('@/lib/tokens');
let az: typeof import('@/lib/authz');
let authMock: ReturnType<typeof vi.fn>;

const createdAdmins: string[] = [];
/** Active super admins that existed before this file ran; parked and restored so counts are deterministic. */
const parkedSupers: string[] = [];

async function makeAdmin(opts: { role?: 'admin' | 'super_admin'; isActive?: boolean } = {}) {
  const [row] = await db
    .insert(s.admins)
    .values({
      email: `t-${crypto.randomUUID()}@test.invalid`,
      name: 'Test admin',
      passwordHash: 'unusable-in-tests',
      role: opts.role ?? 'admin',
      isActive: opts.isActive ?? true,
    })
    .returning();
  createdAdmins.push(row!.id);
  return row!;
}

const asSession = (a: { id: string; email: string; name: string | null; role: string }, sessionVersion: number) => ({
  user: { id: a.id, email: a.email, name: a.name, role: a.role, sessionVersion },
});

d('admin auth (integration)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    db = (await import('@/lib/db/client')).getDb();
    s = await import('@/lib/db/schema');
    pt = await import('@/lib/password-tokens');
    g = await import('@/lib/admin-guards');
    t = await import('@/lib/tokens');
    az = await import('@/lib/authz');
    authMock = (await import('@/auth')).auth as unknown as ReturnType<typeof vi.fn>;

    const existing = await db
      .select({ id: s.admins.id })
      .from(s.admins)
      .where(and(eq(s.admins.role, 'super_admin'), eq(s.admins.isActive, true)));
    parkedSupers.push(...existing.map((r) => r.id));
    if (parkedSupers.length) {
      await db.update(s.admins).set({ isActive: false }).where(inArray(s.admins.id, parkedSupers));
    }
  });

  afterAll(async () => {
    if (createdAdmins.length) await db.delete(s.admins).where(inArray(s.admins.id, createdAdmins));
    if (parkedSupers.length) {
      await db.update(s.admins).set({ isActive: true }).where(inArray(s.admins.id, parkedSupers));
    }
  });

  describe('password tokens', () => {
    it('can be consumed exactly once', async () => {
      const a = await makeAdmin();
      const raw = await pt.issuePasswordToken(a.id, 'reset');
      expect(await pt.consumePasswordToken(raw)).toBe(a.id);
      expect(await pt.consumePasswordToken(raw)).toBeNull();
    });

    it('rejects an expired token without consuming it', async () => {
      const a = await makeAdmin();
      const raw = t.generateToken();
      await db.insert(s.adminPasswordTokens).values({
        adminId: a.id,
        tokenHash: t.hashToken(raw),
        purpose: 'reset',
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await pt.consumePasswordToken(raw)).toBeNull();
      const [row] = await db
        .select({ usedAt: s.adminPasswordTokens.usedAt })
        .from(s.adminPasswordTokens)
        .where(eq(s.adminPasswordTokens.adminId, a.id));
      expect(row?.usedAt).toBeNull();
    });

    it('rejects unknown and malformed tokens', async () => {
      expect(await pt.consumePasswordToken(t.generateToken())).toBeNull();
      expect(await pt.consumePasswordToken('not-a-token')).toBeNull();
    });

    it('issuing a new token invalidates the previous unused one', async () => {
      const a = await makeAdmin();
      const first = await pt.issuePasswordToken(a.id, 'reset');
      const second = await pt.issuePasswordToken(a.id, 'invite');
      expect(await pt.consumePasswordToken(first)).toBeNull();
      expect(await pt.consumePasswordToken(second)).toBe(a.id);
    });
  });

  describe('last super admin guard', () => {
    it('only protects the final active super admin', async () => {
      const first = await makeAdmin({ role: 'super_admin' });
      expect(await g.isLastActiveSuperAdmin(first.id)).toBe(true);

      const second = await makeAdmin({ role: 'super_admin' });
      expect(await g.isLastActiveSuperAdmin(first.id)).toBe(false);
      expect(await g.isLastActiveSuperAdmin(second.id)).toBe(false);

      await db.update(s.admins).set({ isActive: false }).where(eq(s.admins.id, second.id));
      expect(await g.isLastActiveSuperAdmin(first.id)).toBe(true);
      // deactivating an already inactive super admin is not blocked
      expect(await g.isLastActiveSuperAdmin(second.id)).toBe(false);

      const plain = await makeAdmin();
      expect(await g.isLastActiveSuperAdmin(plain.id)).toBe(false);
      expect(await g.isLastActiveSuperAdmin(crypto.randomUUID())).toBe(false);
    });
  });

  describe('getAdminUser', () => {
    it('returns the database role, not the one baked into the session', async () => {
      const a = await makeAdmin();
      authMock.mockResolvedValue(asSession(a, a.sessionVersion));
      expect(await az.getAdminUser()).toMatchObject({ id: a.id, role: 'admin' });

      const [b] = await db
        .update(s.admins)
        .set({ role: 'super_admin', sessionVersion: a.sessionVersion + 1 })
        .where(eq(s.admins.id, a.id))
        .returning();
      // the old session carries a stale session_version, so it is rejected outright
      expect(await az.getAdminUser()).toBeNull();

      authMock.mockResolvedValue(asSession(b!, b!.sessionVersion));
      expect(await az.getAdminUser()).toMatchObject({ id: a.id, role: 'super_admin' });
    });

    it('rejects a stale session_version after a password change', async () => {
      const a = await makeAdmin();
      authMock.mockResolvedValue(asSession(a, a.sessionVersion));
      expect(await az.getAdminUser()).not.toBeNull();

      await db
        .update(s.admins)
        .set({ sessionVersion: a.sessionVersion + 1 })
        .where(eq(s.admins.id, a.id));
      expect(await az.getAdminUser()).toBeNull();
    });

    it('rejects deactivated admins and sessions without an id', async () => {
      const a = await makeAdmin();
      authMock.mockResolvedValue(asSession(a, a.sessionVersion));
      expect(await az.getAdminUser()).not.toBeNull();

      await db.update(s.admins).set({ isActive: false }).where(eq(s.admins.id, a.id));
      expect(await az.getAdminUser()).toBeNull();

      authMock.mockResolvedValue({ user: { email: a.email, role: 'admin', sessionVersion: 1 } });
      expect(await az.getAdminUser()).toBeNull();
    });
  });
});
