import { and, count, eq } from 'drizzle-orm';
import { getDb } from './db/client';
import { admins } from './db/schema';

/**
 * True when deactivating or demoting this admin would leave no active super admin,
 * locking every organiser out of the panel.
 */
export async function isLastActiveSuperAdmin(adminId: string): Promise<boolean> {
  const db = getDb();
  const [target] = await db
    .select({ role: admins.role, isActive: admins.isActive })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  if (!target || !target.isActive || target.role !== 'super_admin') return false;
  const [row] = await db
    .select({ n: count() })
    .from(admins)
    .where(and(eq(admins.role, 'super_admin'), eq(admins.isActive, true)));
  return (row?.n ?? 0) <= 1;
}
