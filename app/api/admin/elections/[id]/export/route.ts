import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { electionFor, getAdminUser } from '@/lib/authz';
import { loadResultsForViewer, resultsToCsv, sha256Hex } from '@/lib/results';

export const dynamic = 'force-dynamic';

/** Results CSV + SHA-256 of the exact bytes returned (header + audit log). Read-only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const election = await electionFor(user, id);
  if (!election) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const res = await loadResultsForViewer(id, 'admin');
  if (!res.ok) return NextResponse.json({ error: 'Results are not available yet.' }, { status: res.status });

  const csv = resultsToCsv(res.election, res.results);
  const hash = sha256Hex(csv);
  await logAudit({ actor: user.email, action: 'results.export', electionId: id, meta: { sha256: hash } });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="results-${id}.csv"`,
      'X-Content-SHA256': hash,
      'Cache-Control': 'no-store',
    },
  });
}
