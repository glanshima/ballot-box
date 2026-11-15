import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Neon HTTP driver (stateless, serverless-friendly; use the POOLED url).
 * It has no interactive transactions, so multi-statement writes use either
 * `db.batch([...])` (one real transaction) or a single-statement CTE (see lib/voting.ts).
 */
let _db: ReturnType<typeof create> | undefined;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(url), { schema });
}

export function getDb() {
  return (_db ??= create());
}

/** db.execute() returns either an array or { rows } depending on driver version. */
export function rowsOf<T = Record<string, unknown>>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const rows = (res as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}
