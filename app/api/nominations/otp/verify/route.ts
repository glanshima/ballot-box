import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db/client';
import { getElection } from '@/lib/db/queries';
import { memberOtps, voters } from '@/lib/db/schema';
import { memberNominationsOpen } from '@/lib/election-rules';
import { nominationKeys } from '@/lib/nominations/keys';
import {
  hashesEqual,
  normalizeEmail,
  otpCodeHash,
  otpEmailHash,
  OTP_MAX_ATTEMPTS,
} from '@/lib/nominations/otp';
import { issueMemberSession } from '@/lib/nominations/session';
import { checkLimitClosed, getClientIp } from '@/lib/ratelimit';
import { otpVerifySchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const json = (body: object, status = 200) => NextResponse.json(body, { status });
const invalid = () => json({ ok: false, error: 'Invalid or expired code.' }, 400);

/** Verify the emailed code and issue a 30-minute, election-scoped member session. */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ ok: false, error: 'Forbidden' }, 403);
  }
  const ip = getClientIp(request.headers);
  if (!(await checkLimitClosed('otpVerifyIp', ip))) {
    return json({ ok: false, error: 'Too many attempts. Please wait and try again.' }, 429);
  }

  const parsed = otpVerifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: 'Enter the 6-digit code.' }, 400);
  const { electionId, code } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const emailHash = otpEmailHash(nominationKeys().otp, electionId, email);
  if (!(await checkLimitClosed('otpVerifyEmail', `${electionId}:${emailHash}`))) {
    return json({ ok: false, error: 'Too many attempts. Please wait and try again.' }, 429);
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: memberOtps.id,
      codeHash: memberOtps.codeHash,
      attempts: memberOtps.attempts,
      expiresAt: memberOtps.expiresAt,
      now: sql<string>`now()`,
    })
    .from(memberOtps)
    .where(
      and(
        eq(memberOtps.electionId, electionId),
        eq(memberOtps.emailHash, emailHash),
        isNull(memberOtps.consumedAt),
      ),
    )
    .orderBy(desc(memberOtps.createdAt))
    .limit(1);

  const fail = async (reason: string) => {
    await logAudit({
      actor: 'public',
      action: 'nomination.otp_verify_failed',
      electionId,
      meta: { emailHash, reason },
    });
    return invalid();
  };

  if (!row) return fail('no_code');
  const now = new Date(row.now);
  if (row.expiresAt <= now) return fail('expired');
  if (row.attempts >= OTP_MAX_ATTEMPTS) return fail('attempts');

  const key = nominationKeys().otp;
  if (!hashesEqual(otpCodeHash(key, electionId, emailHash, code), row.codeHash)) {
    await db
      .update(memberOtps)
      .set({ attempts: sql`${memberOtps.attempts} + 1` })
      .where(eq(memberOtps.id, row.id));
    return fail('mismatch');
  }

  const election = await getElection(electionId);
  if (!election || !memberNominationsOpen(election, now)) {
    return json({ ok: false, error: 'Nominations are closed.' }, 403);
  }

  const [voter] = await db
    .select({ id: voters.id })
    .from(voters)
    .where(and(eq(voters.electionId, electionId), sql`lower(${voters.email}) = ${email}`))
    .limit(1);
  if (!voter) return fail('not_on_roll');

  await db.update(memberOtps).set({ consumedAt: sql`now()` }).where(eq(memberOtps.id, row.id));
  await issueMemberSession(electionId, voter.id);
  await logAudit({ actor: 'public', action: 'nomination.otp_verified', electionId, meta: { emailHash } });
  return json({ ok: true });
}
