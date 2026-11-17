import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getElection, isUuid } from '@/lib/db/queries';
import { memberNominationsOpen } from '@/lib/election-rules';
import { ATTACHMENT_MAX_BYTES, validateAttachmentBytes, type AttachmentKind } from '@/lib/nominations/attachments';
import { addMemberNomination, sessionVoter, type AttachmentInput } from '@/lib/nominations/member';
import { isSelfNomination, normalizeEmail, positionError } from '@/lib/nominations/rules';
import { readMemberSession } from '@/lib/nominations/session';
import { checkLimitClosed, getClientIp } from '@/lib/ratelimit';
import { memberNominationSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const json = (body: object, status = 200) => NextResponse.json(body, { status });
const fail = (error: string, status: number) => json({ ok: false, error }, status);

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

async function readAttachment(
  fd: FormData,
  field: string,
  kind: AttachmentKind,
): Promise<{ value?: AttachmentInput; error?: string }> {
  const file = fd.get(field);
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > ATTACHMENT_MAX_BYTES) return { error: 'File is too large (maximum 2 MB).' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateAttachmentBytes(kind, file.type, bytes);
  if (!check.ok) return { error: check.error };
  return {
    value: {
      kind,
      contentType: check.contentType,
      dataBase64: Buffer.from(bytes).toString('base64'),
      size: check.size,
    },
  };
}

/** Verified-member nomination: the nominator, the nominee and optional private attachments. */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return fail('Forbidden', 403);
  const ip = getClientIp(request.headers);
  if (!(await checkLimitClosed('nominate', ip))) {
    return fail('Too many submissions. Please try again later.', 429);
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return fail('Invalid submission.', 400);
  }

  const electionId = str(fd.get('electionId'));
  if (!isUuid(electionId)) return fail('Invalid election.', 400);
  const session = await readMemberSession(electionId);
  if (!session) return fail('Please verify your email address again.', 401);

  const parsed = memberNominationSchema.safeParse({
    electionId,
    fullName: str(fd.get('fullName')),
    email: str(fd.get('email')),
    phone: str(fd.get('phone')) || undefined,
    position: str(fd.get('position')) || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid submission.', 400);
  const v = parsed.data;

  const election = await getElection(electionId);
  if (!election || !memberNominationsOpen(election, new Date())) return fail('Nominations are closed.', 403);

  const voter = await sessionVoter(electionId, session.voterId);
  if (!voter) return fail('Please verify your email address again.', 401);

  if (isSelfNomination(voter.email, v.email)) return fail('You cannot nominate yourself.', 400);

  const position = v.position ?? null;
  const pErr = positionError(election.nominationPositions, position);
  if (pErr) return fail(pErr, 400);

  const proof = await readAttachment(fd, 'proof', 'membership_proof');
  if (proof.error) return fail(proof.error, 400);
  const signature = await readAttachment(fd, 'signature', 'signature');
  if (signature.error) return fail(signature.error, 400);

  try {
    const result = await addMemberNomination(
      {
        electionId,
        voterId: voter.id,
        voterName: voter.name,
        voterEmail: normalizeEmail(voter.email),
        position,
        fullName: v.fullName,
        email: v.email,
        phone: v.phone ?? null,
        min: election.minNominators,
        max: election.maxNominators,
      },
      [proof.value, signature.value].filter((a): a is AttachmentInput => !!a),
    );

    if (!result.ok) {
      const message =
        result.reason === 'duplicate'
          ? 'You have already nominated this person for this position.'
          : result.reason === 'full'
            ? 'This nominee already has the maximum number of nominators.'
            : 'This nomination is no longer accepting nominators.';
      await logAudit({
        actor: 'public',
        action: 'nomination.member_rejected',
        electionId,
        meta: { reason: result.reason, hasProof: !!proof.value, hasSignature: !!signature.value },
      });
      return fail(message, 409);
    }

    await logAudit({
      actor: 'public',
      action: 'nomination.member_added',
      electionId,
      meta: { nomineeId: result.nomineeId, count: result.count, status: result.status },
    });
    return json({
      ok: true,
      status: result.status,
      count: result.count,
      minNominators: election.minNominators,
      maxNominators: election.maxNominators,
    });
  } catch {
    return fail('Could not record the nomination. Please try again.', 500);
  }
}
