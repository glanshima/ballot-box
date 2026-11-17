import { and, eq, isNull, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db/client';
import { getElection } from '@/lib/db/queries';
import { memberOtps, voters } from '@/lib/db/schema';
import { memberFlowOpen } from '@/lib/election-rules';
import { sendNominationOtpEmail } from '@/lib/email';
import { nominationKeys } from '@/lib/nominations/keys';
import {
  generateOtpCode,
  normalizeEmail,
  otpCodeHash,
  otpEmailHash,
  OTP_TTL_MINUTES,
} from '@/lib/nominations/otp';
import { checkLimitClosed, getClientIp } from '@/lib/ratelimit';
import { otpRequestSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const json = (body: object, status = 200) => NextResponse.json(body, { status });

/**
 * Email a one-time code to a verified member. The response is identical whether
 * or not the address is on the voter roll (no enumeration).
 */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ ok: false, error: 'Forbidden' }, 403);
  }
  const ip = getClientIp(request.headers);
  if (!(await checkLimitClosed('otpRequestIp', ip))) {
    return json({ ok: false, error: 'Too many requests. Please try again later.' }, 429);
  }

  const parsed = otpRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: 'Enter a valid email address.' }, 400);
  const { electionId } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const emailHash = otpEmailHash(nominationKeys().otp, electionId, email);
  if (!(await checkLimitClosed('otpRequestEmail', `${electionId}:${emailHash}`))) {
    return json({ ok: false, error: 'Too many requests. Please try again later.' }, 429);
  }

  const election = await getElection(electionId);
  const open = !!election && memberFlowOpen(election, new Date());
  const db = getDb();

  let voter: { id: string; name: string | null } | undefined;
  if (open && election) {
    const [row] = await db
      .select({ id: voters.id, name: voters.name })
      .from(voters)
      .where(and(eq(voters.electionId, election.id), sql`lower(${voters.email}) = ${email}`))
      .limit(1);
    voter = row;
  }

  if (election && open && voter) {
    const code = generateOtpCode();
    const key = nominationKeys().otp;
    await db.batch([
      db
        .update(memberOtps)
        .set({ consumedAt: sql`now()` })
        .where(
          and(
            eq(memberOtps.electionId, election.id),
            eq(memberOtps.emailHash, emailHash),
            isNull(memberOtps.consumedAt),
          ),
        ),
      db.insert(memberOtps).values({
        electionId: election.id,
        emailHash,
        codeHash: otpCodeHash(key, election.id, emailHash, code),
        expiresAt: sql`now() + make_interval(mins => ${OTP_TTL_MINUTES})`,
      }),
    ]);
    try {
      await sendNominationOtpEmail({
        to: email,
        name: voter.name,
        electionTitle: election.title,
        code,
        minutes: OTP_TTL_MINUTES,
      });
    } catch {
      await logAudit({ actor: 'public', action: 'nomination.otp_email_failed', electionId, meta: { emailHash } });
    }
  }

  await logAudit({
    actor: 'public',
    action: 'nomination.otp_requested',
    electionId,
    meta: { emailHash, emailed: Boolean(open && voter) },
  });
  return json({ ok: true });
}
