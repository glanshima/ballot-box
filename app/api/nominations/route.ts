import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db/client';
import { getElection } from '@/lib/db/queries';
import { nominations } from '@/lib/db/schema';
import { nominationsOpen } from '@/lib/election-rules';
import { checkLimit, getClientIp } from '@/lib/ratelimit';
import { isOwnUpload } from '@/lib/upload-policy';
import { nominationSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

/** Public nomination submission. */
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('Forbidden', 403);
  if (!(await checkLimit('nominate', getClientIp(request.headers)))) {
    return fail('Too many submissions. Please try again later.', 429);
  }

  const parsed = nominationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid submission.', 400);
  const v = parsed.data;

  const election = await getElection(v.electionId);
  if (!election || !nominationsOpen(election, new Date())) return fail('Nominations are closed.', 403);

  // Uploaded files must be ours, for this election.
  if (!isOwnUpload('nomination-photo', election.id, v.photoUrl, v.photoPath)) return fail('Invalid photo upload.', 400);
  if (v.receiptUrl && v.receiptPath && !isOwnUpload('nomination-receipt', election.id, v.receiptUrl, v.receiptPath)) {
    return fail('Invalid receipt upload.', 400);
  }
  if (election.requirePurchaseEvidence && !v.receiptUrl) return fail('Please upload evidence of form purchase.', 400);

  if (election.nominationPositions.length > 0) {
    if (!v.position || !election.nominationPositions.includes(v.position)) return fail('Please choose a position.', 400);
  } else if (v.position) {
    return fail('Invalid submission.', 400);
  }

  const [row] = await getDb()
    .insert(nominations)
    .values({
      electionId: election.id,
      fullName: v.fullName,
      email: v.email,
      phone: v.phone ?? null,
      position: v.position ?? null,
      manifesto: v.manifesto ?? null,
      photoUrl: v.photoUrl,
      photoPath: v.photoPath,
      receiptUrl: v.receiptUrl ?? null,
      receiptPath: v.receiptPath ?? null,
      receiptReference: v.receiptReference ?? null,
    })
    .onConflictDoNothing({ target: [nominations.electionId, nominations.email] })
    .returning({ id: nominations.id });

  if (!row) return fail('A nomination with this email has already been submitted.', 409);
  await logAudit({ actor: 'public', action: 'nomination.submitted', electionId: election.id, meta: { nominationId: row.id } });
  return NextResponse.json({ ok: true });
}
