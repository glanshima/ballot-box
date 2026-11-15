/**
 * Demo data: a candidate election (2 positions), a poll, a few voters, and a demo admin
 * assigned to the candidate election. Prints the raw voting links once (they are not stored).
 * Run:  npm run seed      (uses DATABASE_URL from .env.local / .env)
 * Seed data lives ONLY here, never in application code.
 */
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });

async function main() {
  const { getDb } = await import('../lib/db/client');
  const s = await import('../lib/db/schema');
  const { generateToken, hashToken } = await import('../lib/tokens');
  const db = getDb();
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const now = Date.now();
  const DAY = 86_400_000;

  const [cand] = await db
    .insert(s.elections)
    .values({
      title: 'DEMO: Club Executive Elections',
      description: 'Choose your executive committee for the coming year.',
      type: 'candidate',
      status: 'open',
      opensAt: new Date(now - 3_600_000),
      closesAt: new Date(now + 7 * DAY),
      nominationsEnabled: false,
      nominationPositions: ['President', 'Secretary'],
    })
    .returning();
  const [poll] = await db
    .insert(s.elections)
    .values({
      title: 'DEMO: Which date for the AGM?',
      type: 'poll',
      status: 'open',
      opensAt: new Date(now - 3_600_000),
      closesAt: new Date(now + 7 * DAY),
    })
    .returning();

  await db.insert(s.options).values([
    { electionId: cand!.id, label: 'Amina Yusuf', position: 'President', description: 'Treasurer for 3 years.', sortOrder: 0 },
    { electionId: cand!.id, label: 'Chidi Okafor', position: 'President', description: 'Events lead.', sortOrder: 1 },
    { electionId: cand!.id, label: 'Ngozi Bello', position: 'Secretary', sortOrder: 2 },
    { electionId: cand!.id, label: 'Tunde Adeyemi', position: 'Secretary', sortOrder: 3 },
    { electionId: poll!.id, label: 'Saturday 6 March', sortOrder: 0 },
    { electionId: poll!.id, label: 'Saturday 13 March', sortOrder: 1 },
    { electionId: poll!.id, label: 'Saturday 20 March', sortOrder: 2 },
  ]);

  const adminPassword = generateToken().slice(0, 16);
  const [demoAdmin] = await db
    .insert(s.admins)
    .values({ email: 'demo.admin@example.com', name: 'Demo Admin', passwordHash: await bcrypt.hash(adminPassword, 12) })
    .onConflictDoNothing()
    .returning();
  if (demoAdmin) await db.insert(s.electionAdmins).values({ electionId: cand!.id, adminId: demoAdmin.id });

  console.log('\nSeeded. Demo voting links (shown once):');
  for (const [label, e] of [['candidate', cand!], ['poll', poll!]] as const) {
    for (const n of [1, 2, 3]) {
      const raw = generateToken();
      await db.insert(s.voters).values({
        electionId: e.id,
        email: `demo${n}-${label}@example.com`,
        tokenHash: hashToken(raw),
        tokenExpiresAt: e.closesAt,
        inviteStatus: 'exported',
      });
      console.log(`  [${label}] demo${n}: ${base}/vote/${raw}`);
    }
  }
  if (demoAdmin) console.log(`\nDemo admin (assigned to the candidate election): demo.admin@example.com / ${adminPassword}`);
  else console.log('\nDemo admin already exists; password unchanged.');
  console.log(`Candidate election id: ${cand!.id}\nPoll id: ${poll!.id}\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
