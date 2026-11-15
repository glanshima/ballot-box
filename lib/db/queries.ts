import { asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from './client';
import { electionAdmins, elections, options, type Election } from './schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);

export async function getElection(id: string): Promise<Election | null> {
  if (!isUuid(id)) return null;
  const [row] = await getDb().select().from(elections).where(eq(elections.id, id)).limit(1);
  return row ?? null;
}

export async function getOptions(electionId: string) {
  return getDb()
    .select()
    .from(options)
    .where(eq(options.electionId, electionId))
    .orderBy(asc(options.sortOrder), asc(options.label));
}

export async function listAllElections() {
  return getDb().select().from(elections).orderBy(desc(elections.createdAt));
}

export async function listElectionsForAdmin(adminId: string) {
  const db = getDb();
  const links = await db
    .select({ id: electionAdmins.electionId })
    .from(electionAdmins)
    .where(eq(electionAdmins.adminId, adminId));
  if (links.length === 0) return [];
  return db
    .select()
    .from(elections)
    .where(inArray(elections.id, links.map((l) => l.id)))
    .orderBy(desc(elections.createdAt));
}
