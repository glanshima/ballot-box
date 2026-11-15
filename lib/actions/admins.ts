'use server';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireAdminAction, requireSuperAction } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { isUuid } from '@/lib/db/queries';
import { admins } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';
import { adminCreateSchema, passwordSchema } from '@/lib/validators';

/** Super admin creates a delegated admin and shares the initial password out-of-band. */
export async function createAdmin(_p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    const v = adminCreateSchema.parse({ name: getStr(fd, 'name'), email: getStr(fd, 'email'), password: fd.get('password') });
    if (v.email === getEnv().ADMIN_EMAIL.toLowerCase()) throw new AppError('That email belongs to the super admin.');
    const res = await getDb()
      .insert(admins)
      .values({ name: v.name, email: v.email, passwordHash: await bcrypt.hash(v.password, 12) })
      .onConflictDoNothing()
      .returning({ id: admins.id });
    if (res.length === 0) throw new AppError('An admin with that email already exists.');
    await logAudit({ actor: user.email, action: 'admin.create', meta: { adminId: res[0]!.id } });
    revalidatePath('/admin/admins');
    return 'Admin created. Share the password with them securely; they can change it under Account.';
  });
}

export async function setAdminActive(adminId: string, active: boolean, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    if (!isUuid(adminId)) throw new AppError('Admin not found.');
    await getDb().update(admins).set({ isActive: active }).where(eq(admins.id, adminId));
    await logAudit({ actor: user.email, action: active ? 'admin.activate' : 'admin.deactivate', meta: { adminId } });
    revalidatePath('/admin/admins');
    return active ? 'Admin re-activated.' : 'Admin deactivated (signed out immediately).';
  });
}

export async function resetAdminPassword(adminId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    if (!isUuid(adminId)) throw new AppError('Admin not found.');
    const pw = passwordSchema.parse(fd.get('password'));
    await getDb().update(admins).set({ passwordHash: await bcrypt.hash(pw, 12) }).where(eq(admins.id, adminId));
    await logAudit({ actor: user.email, action: 'admin.reset_password', meta: { adminId } });
    return 'Password reset.';
  });
}

/** Delegated admins change their own password. (The super admin's lives in env vars.) */
export async function changeOwnPassword(_p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireAdminAction();
    if (user.role !== 'admin') throw new AppError('The super admin password is set via the ADMIN_PASSWORD_HASH environment variable.');
    const [row] = await getDb().select().from(admins).where(eq(admins.id, user.id)).limit(1);
    if (!row || !(await bcrypt.compare(String(fd.get('current') ?? ''), row.passwordHash))) {
      throw new AppError('Current password is incorrect.');
    }
    const next = passwordSchema.parse(fd.get('password'));
    await getDb().update(admins).set({ passwordHash: await bcrypt.hash(next, 12) }).where(eq(admins.id, user.id));
    await logAudit({ actor: user.email, action: 'admin.change_password' });
    return 'Password changed.';
  });
}
