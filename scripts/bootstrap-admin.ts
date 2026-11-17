/**
 * Seeds the first super admin from ADMIN_EMAIL / ADMIN_PASSWORD_HASH.
 * The env pair is a bootstrap input only: after this runs, login reads the database.
 * Idempotent: if the email already exists, nothing is changed unless --reset-password
 * is passed. That break-glass mode replaces the hash (from env), makes the row an
 * active super admin, and signs out its sessions.
 * Run:  npm run db:bootstrap [-- --reset-password]
 */
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const rawHash = process.env.ADMIN_PASSWORD_HASH;
  if (!email || !rawHash) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be set.');
  // .env files escape "$" as "\$"; accept both forms.
  const hash = rawHash.replace(/\\\$/g, '$');
  if (!hash.startsWith('$2')) throw new Error('ADMIN_PASSWORD_HASH must be a bcrypt hash (run: npm run hash-password).');

  const { eq, sql } = await import('drizzle-orm');
  const { getDb } = await import('../lib/db/client');
  const { admins } = await import('../lib/db/schema');
  const db = getDb();

  const [existing] = await db
    .select({ id: admins.id, role: admins.role, isActive: admins.isActive })
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);
  if (existing) {
    if (!process.argv.includes('--reset-password')) {
      console.log(`Admin ${email} already exists (role: ${existing.role}, active: ${existing.isActive}). Nothing to do.`);
      console.log('To replace their password with the one hashed in ADMIN_PASSWORD_HASH, re-run with -- --reset-password.');
      return;
    }
    await db
      .update(admins)
      .set({ passwordHash: hash, role: 'super_admin', isActive: true, sessionVersion: sql`${admins.sessionVersion} + 1` })
      .where(eq(admins.id, existing.id));
    console.log(`Password for ${email} replaced and all their sessions were signed out.`);
    if (existing.role !== 'super_admin') console.log(`Role changed from ${existing.role} to super_admin.`);
    if (!existing.isActive) console.log('Account re-activated.');
    return;
  }

  await db.insert(admins).values({ email, name: 'Super admin', passwordHash: hash, role: 'super_admin' });
  console.log(`Created super admin ${email}. They can now sign in and change their password under Account.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
