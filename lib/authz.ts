import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from '@/auth';
import type { Role } from '@/types/next-auth';
import { AppError } from './action-utils';
import { getDb } from './db/client';
import { getElection, isUuid } from './db/queries';
import { admins, electionAdmins, type Election } from './db/schema';

export type AdminUser = { id: string; email: string; name: string; role: Role };

/**
 * Current admin, or null. The row is always re-read so deactivation, role changes,
 * and password changes take effect immediately (JWTs live up to 8h).
 */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.role || !u.email) return null;
  const [row] = await getDb()
    .select({ isActive: admins.isActive, role: admins.role, sessionVersion: admins.sessionVersion })
    .from(admins)
    .where(eq(admins.id, u.id))
    .limit(1);
  if (!row?.isActive || row.sessionVersion !== u.sessionVersion) return null;
  return { id: u.id, email: u.email, name: u.name ?? '', role: row.role };
});

export const isSuper = (u: AdminUser) => u.role === 'super_admin';

/** Election if the user may manage it: super admin = all, admin = only assigned ones. */
export async function electionFor(user: AdminUser, electionId: string): Promise<Election | null> {
  if (!isUuid(electionId)) return null;
  const election = await getElection(electionId);
  if (!election) return null;
  if (isSuper(user)) return election;
  const [link] = await getDb()
    .select({ id: electionAdmins.adminId })
    .from(electionAdmins)
    .where(and(eq(electionAdmins.electionId, electionId), eq(electionAdmins.adminId, user.id)))
    .limit(1);
  return link ? election : null;
}

// ---- Pages (redirect / 404) ----
export async function requireAdminPage(): Promise<AdminUser> {
  const u = await getAdminUser();
  if (!u) redirect('/?expired=1');
  return u;
}
export async function requireSuperPage(): Promise<AdminUser> {
  const u = await requireAdminPage();
  if (!isSuper(u)) redirect('/admin');
  return u;
}
export const requireElectionPage = cache(async (electionId: string) => {
  const user = await requireAdminPage();
  const election = await electionFor(user, electionId);
  if (!election) notFound();
  return { user, election };
});

// ---- Server actions / handlers (throw) ----
export async function requireAdminAction(): Promise<AdminUser> {
  const u = await getAdminUser();
  if (!u) throw new AppError('You are not signed in.');
  return u;
}
export async function requireSuperAction(): Promise<AdminUser> {
  const u = await requireAdminAction();
  if (!isSuper(u)) throw new AppError('Only the super admin can do this.');
  return u;
}
export async function requireElectionAction(electionId: string) {
  const user = await requireAdminAction();
  const election = await electionFor(user, electionId);
  if (!election) throw new AppError('Election not found.');
  return { user, election };
}
