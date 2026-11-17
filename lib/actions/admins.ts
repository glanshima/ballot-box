'use server';

import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { signOut } from '@/auth';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { isLastActiveSuperAdmin } from '@/lib/admin-guards';
import { logAudit } from '@/lib/audit';
import { requireAdminAction, requireSuperAction } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { isUuid } from '@/lib/db/queries';
import { admins } from '@/lib/db/schema';
import { appUrl } from '@/lib/env';
import { issuePasswordToken, type PasswordTokenPurpose } from '@/lib/password-tokens';
import { generateToken } from '@/lib/tokens';
import { adminCreateSchema, passwordSchema } from '@/lib/validators';

const resetLink = (raw: string) => `${appUrl()}/admin/reset?token=${encodeURIComponent(raw)}`;

/** Super admin creates an admin; access is granted through a one-time link, never a shared password. */
export async function createAdmin(_p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    const v = adminCreateSchema.parse({ name: getStr(fd, 'name'), email: getStr(fd, 'email') });
    const res = await getDb()
      .insert(admins)
      .values({
        name: v.name,
        email: v.email,
        // Unusable until the invite link is used: nobody ever knows this value.
        passwordHash: await bcrypt.hash(generateToken(), 12),
      })
      .onConflictDoNothing()
      .returning({ id: admins.id });
    if (res.length === 0) throw new AppError('An admin with that email already exists.');
    const adminId = res[0]!.id;
    const raw = await issuePasswordToken(adminId, 'invite');
    await logAudit({ actor: user.email, action: 'admin.invite', meta: { adminId } });
    revalidatePath('/admin/admins');
    return { message: 'Admin created. Send them this one-time link (valid for 30 minutes):', link: resetLink(raw) };
  });
}

export async function setAdminActive(adminId: string, active: boolean, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    if (!isUuid(adminId)) throw new AppError('Admin not found.');
    if (!active && (await isLastActiveSuperAdmin(adminId))) {
      throw new AppError('You cannot deactivate the last active super admin.');
    }
    await getDb().update(admins).set({ isActive: active }).where(eq(admins.id, adminId));
    await logAudit({ actor: user.email, action: active ? 'admin.activate' : 'admin.deactivate', meta: { adminId } });
    revalidatePath('/admin/admins');
    return active ? 'Admin re-activated.' : 'Admin deactivated (signed out immediately).';
  });
}

export async function setAdminRole(adminId: string, role: 'super_admin' | 'admin', _p: ActionState, _fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    if (!isUuid(adminId)) throw new AppError('Admin not found.');
    if (role === 'admin' && (await isLastActiveSuperAdmin(adminId))) {
      throw new AppError('You cannot demote the last active super admin.');
    }
    await getDb()
      .update(admins)
      .set({ role, sessionVersion: sql`${admins.sessionVersion} + 1` })
      .where(eq(admins.id, adminId));
    await logAudit({ actor: user.email, action: 'admin.change_role', meta: { adminId, role } });
    revalidatePath('/admin/admins');
    return role === 'super_admin' ? 'Now a super admin (their sessions were signed out).' : 'No longer a super admin.';
  });
}

/** Issues a fresh one-time reset/invite link and invalidates the admin's earlier unused links. */
export async function issueAdminResetLink(adminId: string, purpose: PasswordTokenPurpose, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    if (!isUuid(adminId)) throw new AppError('Admin not found.');
    const raw = await issuePasswordToken(adminId, purpose);
    await logAudit({ actor: user.email, action: 'admin.reset_link', meta: { adminId } });
    return { message: 'One-time link created (valid for 30 minutes, single use):', link: resetLink(raw) };
  });
}

/** Any admin changes their own password. Signs every session out, including this one. */
export async function changeOwnPassword(_p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireAdminAction();
    const [row] = await getDb()
      .select({ passwordHash: admins.passwordHash })
      .from(admins)
      .where(eq(admins.id, user.id))
      .limit(1);
    const current = String(fd.get('current') ?? '');
    if (!row || !(await bcrypt.compare(current, row.passwordHash))) {
      throw new AppError('Current password is incorrect.');
    }
    const next = passwordSchema.parse(fd.get('password'));
    if (next === current) throw new AppError('Choose a password different from the current one.');
    await getDb()
      .update(admins)
      .set({ passwordHash: await bcrypt.hash(next, 12), sessionVersion: sql`${admins.sessionVersion} + 1` })
      .where(eq(admins.id, user.id));
    await logAudit({ actor: user.email, action: 'admin.change_password' });
    await signOut({ redirectTo: '/?changed=1' });
  });
}
