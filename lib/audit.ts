import { getDb } from './db/client';
import { auditLog } from './db/schema';

/**
 * Append-only audit trail. Never put raw tokens, full voter emails or ballot
 * contents in `meta`.
 */
export async function logAudit(entry: {
  actor: string;
  action: string;
  electionId?: string | null;
  meta?: Record<string, unknown>;
}) {
  await getDb().insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    electionId: entry.electionId ?? null,
    meta: entry.meta ?? {},
  });
}
