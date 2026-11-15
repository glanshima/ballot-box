import { timingSafeEqual } from 'node:crypto';
import { and, eq, lte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db/client';
import { elections } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Closes elections whose closes_at has passed. Publishing stays manual (super admin).
 * Vote acceptance never depends on this job: castVote checks closes_at itself,
 * so a late or skipped run cannot let late votes in (Hobby crons run at most daily).
 */
export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const closed = await getDb()
    .update(elections)
    .set({ status: 'closed' })
    .where(and(eq(elections.status, 'open'), lte(elections.closesAt, sql`now()`)))
    .returning({ id: elections.id });
  for (const e of closed) await logAudit({ actor: 'cron', action: 'election.auto_close', electionId: e.id });
  return NextResponse.json({ closed: closed.length });
}
