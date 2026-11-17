'use server';

import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { AppError, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db/client';
import { admins } from '@/lib/db/schema';
import { sendPasswordResetEmail } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { consumePasswordToken, issuePasswordToken } from '@/lib/password-tokens';
import { checkLimit, getClientIp } from '@/lib/ratelimit';
import { passwordSchema } from '@/lib/validators';

const genericSent: ActionState = {
  ok: true,
  message: 'If that email belongs to an admin account, a reset link has been sent.',
};

/** Public. Always answers the same way so the form cannot be used to discover admin emails. */
export async function requestPasswordReset(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const email = String(fd.get('email') ?? '').trim().toLowerCase();
    const ip = getClientIp(await headers());
    if (!(await checkLimit('passwordReset', ip)) || !(await checkLimit('passwordResetEmail', email))) return genericSent;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return genericSent;

    const [row] = await getDb()
      .select({ id: admins.id, email: admins.email, name: admins.name, isActive: admins.isActive })
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);
    if (!row?.isActive) return genericSent;

    const raw = await issuePasswordToken(row.id, 'reset');
    await logAudit({ actor: row.email, action: 'admin.reset_requested', meta: { adminId: row.id } });
    try {
      await sendPasswordResetEmail({ to: row.email, name: row.name, link: `${appUrl()}/admin/reset?token=${encodeURIComponent(raw)}` });
    } catch {
      console.error('[password-reset] reset email could not be sent (email is not configured or the provider failed)');
    }
    return genericSent;
  } catch (e) {
    unstable_rethrow(e);
    console.error('[password-reset] request failed:', e instanceof Error ? e.name : 'unknown');
    return genericSent;
  }
}

/** Public. Exchanges a single-use link for a new password. */
export async function resetPassword(_p: ActionState, fd: FormData) {
  return run(async () => {
    const ip = getClientIp(await headers());
    if (!(await checkLimit('passwordSubmit', ip))) throw new AppError('Too many attempts. Please try again later.');

    const next = passwordSchema.parse(fd.get('password'));
    if (next !== String(fd.get('confirm') ?? '')) throw new AppError('Passwords do not match.');

    const adminId = await consumePasswordToken(String(fd.get('token') ?? ''));
    if (!adminId) throw new AppError('This link is invalid or has expired. Ask a super admin for a new one.');

    const [row] = await getDb()
      .select({ email: admins.email, isActive: admins.isActive })
      .from(admins)
      .where(eq(admins.id, adminId))
      .limit(1);
    if (!row?.isActive) throw new AppError('This account is deactivated.');

    await getDb()
      .update(admins)
      .set({ passwordHash: await bcrypt.hash(next, 12), sessionVersion: sql`${admins.sessionVersion} + 1` })
      .where(eq(admins.id, adminId));
    await logAudit({ actor: row.email, action: 'admin.password_reset' });
    return 'Password set. You can now sign in.';
  });
}
