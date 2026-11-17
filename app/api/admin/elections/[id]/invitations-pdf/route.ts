import { asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { electionFor, getAdminUser } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { voters } from '@/lib/db/schema';
import { buildInvitationsPdf, invitationPdfRows, PDF_LIMITS, pdfResponseBody } from '@/lib/pdf';
import { checkLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Invitations status PDF: who was invited, whether the email went out and
 * whether they voted. Voting links/tokens are never selected or printed.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const election = await electionFor(user, id);
  if (!election) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await checkLimit('api', user.email))) {
    return NextResponse.json({ error: 'Too many exports. Please wait a minute.' }, { status: 429 });
  }

  const rows = await getDb()
    .select({
      name: voters.name,
      email: voters.email,
      inviteStatus: voters.inviteStatus,
      hasVoted: voters.hasVoted,
    })
    .from(voters)
    .where(eq(voters.electionId, id))
    .orderBy(asc(voters.email));
  const included = rows.slice(0, PDF_LIMITS.invitationRows);
  const exportedAt = new Date();
  const pdf = await buildInvitationsPdf({
    electionTitle: election.title,
    electionId: id,
    rows: invitationPdfRows(included),
    exportedBy: user.email,
    exportedAt,
    omittedRows: rows.length - included.length,
  });

  await logAudit({
    actor: user.email,
    action: 'invitations.export_pdf',
    electionId: id,
    meta: { voters: included.length, omitted: rows.length - included.length },
  });

  return new NextResponse(pdfResponseBody(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invitations-${id}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
