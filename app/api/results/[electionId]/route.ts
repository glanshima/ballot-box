import { NextResponse } from 'next/server';
import { getAdminUser, electionFor } from '@/lib/authz';
import { isUuid } from '@/lib/db/queries';
import { checkLimit, getClientIp } from '@/lib/ratelimit';
import { loadResultsForViewer } from '@/lib/results';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ electionId: string }> }) {
  const { electionId } = await ctx.params;
  if (!isUuid(electionId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await checkLimit('api', getClientIp(request.headers)))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  // "admin" viewer = super admin, or a delegated admin assigned to this election.
  const user = await getAdminUser();
  const isAdmin = !!user && !!(await electionFor(user, electionId));

  const res = await loadResultsForViewer(electionId, isAdmin ? 'admin' : 'public');
  if (!res.ok) {
    // 403 (not 404) for existing-but-hidden, as specified; same body either way.
    return NextResponse.json({ error: res.status === 403 ? 'Results are not available.' : 'Not found' }, { status: res.status });
  }

  const cacheable = res.election.status === 'published' && res.election.resultsPublic && !isAdmin;
  return NextResponse.json(
    { title: res.election.title, status: res.election.status, ...res.results },
    { headers: { 'Cache-Control': cacheable ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'private, no-store' } },
  );
}
