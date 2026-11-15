import { and, asc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { toCsv } from '@/lib/csv';
import { logAudit } from '@/lib/audit';
import { electionFor, getAdminUser } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { voters } from '@/lib/db/schema';
import { issueToken } from '@/lib/invitations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Export links as CSV" fallback for when email is limited.
 * POST (same-origin form; middleware checks Origin). Because only hashes are stored, exporting
 * ROTATES the tokens of the voters included: any link previously sent to them stops working.
 * Default scope: voters who have not voted and are still pending/failed. `all=on` includes everyone who hasn't voted.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const election = await electionFor(user, id);
  if (!election) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (election.status !== 'draft' && election.status !== 'open') {
    return NextResponse.json({ error: 'Voting is no longer open for this election.' }, { status: 409 });
  }

  const form = await request.formData().catch(() => null);
  const all = form?.get('all') === 'on';
  const db = getDb();
  const list = await db
    .select({ id: voters.id, email: voters.email, name: voters.name })
    .from(voters)
    .where(
      all
        ? and(eq(voters.electionId, id), eq(voters.hasVoted, false))
        : and(eq(voters.electionId, id), eq(voters.hasVoted, false), inArray(voters.inviteStatus, ['pending', 'failed'])),
    )
    .orderBy(asc(voters.email));

  const rows: string[][] = [['email', 'name', 'link']];
  for (const v of list) {
    const { link } = await issueToken(v.id, election.closesAt, 'exported');
    rows.push([v.email, v.name ?? '', link]);
  }
  await logAudit({ actor: user.email, action: 'invitations.export_links', electionId: id, meta: { count: list.length, all } });

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="voting-links-${id}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
