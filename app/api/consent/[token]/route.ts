import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db/client';
import { getElection } from '@/lib/db/queries';
import { nominees } from '@/lib/db/schema';
import { checkLimitClosed, getClientIp } from '@/lib/ratelimit';
import { hashToken, TOKEN_REGEX } from '@/lib/tokens';
import { isOwnUpload } from '@/lib/upload-policy';
import { consentDecisionSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const json = (body: object, status = 200) => NextResponse.json(body, { status });
const fail = (error: string, status: number) => json({ ok: false, error }, status);

/** Public: accept (with photo + optional bio) or decline a nomination consent link. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_REGEX.test(token)) return fail('This consent link is not valid.', 404);
  if (request.headers.get('origin') !== new URL(request.url).origin) return fail('Forbidden', 403);
  if (!(await checkLimitClosed('consentSubmit', getClientIp(request.headers)))) {
    return fail('Too many attempts. Please wait and try again.', 429);
  }

  const parsed = consentDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Please add a photo before accepting, or choose Decline.', 400);
  const decision = parsed.data;

  const db = getDb();
  const [row] = await db
    .select({
      id: nominees.id,
      electionId: nominees.electionId,
      status: nominees.status,
      expiresAt: nominees.consentExpiresAt,
      now: sql<string>`now()`,
    })
    .from(nominees)
    .where(eq(nominees.consentTokenHash, hashToken(token)))
    .limit(1);

  if (!row) return fail('This consent link is not valid.', 404);
  if (row.status !== 'consent_sent') return fail('This link has already been used.', 409);

  const now = new Date(row.now);
  if (!row.expiresAt || row.expiresAt <= now) {
    await db
      .update(nominees)
      .set({ status: 'expired' })
      .where(and(eq(nominees.id, row.id), eq(nominees.status, 'consent_sent')));
    await logAudit({ actor: 'nominee', action: 'nominee.consent_expired', electionId: row.electionId, meta: { nomineeId: row.id } });
    return fail('This consent link has expired.', 409);
  }

  const election = await getElection(row.electionId);
  if (!election || election.status !== 'draft' || election.nominationMode !== 'member') {
    return fail('This consent request is closed.', 403);
  }

  if (decision.action === 'accept') {
    if (!isOwnUpload('nomination-photo', election.id, decision.photoUrl, decision.photoPath)) {
      return fail('Invalid photo upload.', 400);
    }
    const [updated] = await db
      .update(nominees)
      .set({
        status: 'accepted',
        photoUrl: decision.photoUrl,
        photoPath: decision.photoPath,
        bio: decision.bio ?? null,
        acceptedAt: sql`now()`,
        consentExpiresAt: null,
      })
      .where(and(eq(nominees.id, row.id), eq(nominees.status, 'consent_sent')))
      .returning({ id: nominees.id });
    if (!updated) return fail('This link has already been used.', 409);
    await logAudit({ actor: 'nominee', action: 'nominee.consent_accepted', electionId: election.id, meta: { nomineeId: row.id } });
    return json({ ok: true, status: 'accepted' });
  }

  const [declined] = await db
    .update(nominees)
    .set({ status: 'declined', consentExpiresAt: null })
    .where(and(eq(nominees.id, row.id), eq(nominees.status, 'consent_sent')))
    .returning({ id: nominees.id });
  if (!declined) return fail('This link has already been used.', 409);
  await logAudit({ actor: 'nominee', action: 'nominee.consent_declined', electionId: election.id, meta: { nomineeId: row.id } });
  return json({ ok: true, status: 'declined' });
}
