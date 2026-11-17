import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { electionFor, getAdminUser } from '@/lib/authz';
import { reconcileElection } from '@/lib/integrity';
import { buildResultsPdf, pdfResponseBody } from '@/lib/pdf';
import { checkLimit } from '@/lib/ratelimit';
import { loadResultsForViewer, resultsPayloadHash } from '@/lib/results';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Results PDF with turnout, tallies, reconciliation and the results payload hash. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const election = await electionFor(user, id);
  if (!election) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await checkLimit('api', user.email))) {
    return NextResponse.json({ error: 'Too many exports. Please wait a minute.' }, { status: 429 });
  }

  const res = await loadResultsForViewer(id, 'admin');
  if (!res.ok) return NextResponse.json({ error: 'Results are not available yet.' }, { status: res.status });

  const integrity = await reconcileElection(id);
  const exportedAt = new Date();
  const hash = resultsPayloadHash(id, res.results);
  const pdf = await buildResultsPdf({
    electionId: id,
    title: res.election.title,
    status: res.election.status,
    results: res.results,
    integrity,
    exportedBy: user.email,
    exportedAt,
  });
  await logAudit({
    actor: user.email,
    action: 'results.export_pdf',
    electionId: id,
    meta: { sha256: hash, integrity: integrity.ok },
  });

  return new NextResponse(pdfResponseBody(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="results-${id}.pdf"`,
      'X-Content-SHA256': hash,
      'Cache-Control': 'private, no-store',
    },
  });
}
