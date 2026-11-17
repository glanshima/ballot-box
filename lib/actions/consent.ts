'use server';

import { and, asc, count, eq, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireElectionAction } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { isUuid } from '@/lib/db/queries';
import { nominees, nominators, options, type Election, type Nominee } from '@/lib/db/schema';
import { assertDraft } from '@/lib/election-rules';
import { sendConsentEmail } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { sleep } from '@/lib/invitations';
import {
  canApproveConsent,
  canRejectNominee,
  canSendConsent,
  CONSENT_BATCH_SIZE,
} from '@/lib/nominations/consent';
import { checkLimitClosed } from '@/lib/ratelimit';
import { generateToken, hashToken } from '@/lib/tokens';

const refresh = (id: string) => revalidatePath(`/admin/elections/${id}`, 'layout');

async function loadNominee(electionId: string, nomineeId: string): Promise<Nominee> {
  if (!isUuid(nomineeId)) throw new AppError('Nominee not found.');
  const [n] = await getDb()
    .select()
    .from(nominees)
    .where(and(eq(nominees.id, nomineeId), eq(nominees.electionId, electionId)))
    .limit(1);
  if (!n) throw new AppError('Nominee not found.');
  return n;
}

async function ensureEnoughNominators(election: Election, nominee: Nominee) {
  const [c] = await getDb()
    .select({ n: count() })
    .from(nominators)
    .where(eq(nominators.nomineeId, nominee.id));
  if (Number(c?.n ?? 0) < election.minNominators) {
    throw new AppError('This nominee does not have enough nominators yet.');
  }
}

/**
 * Rotates the single-use token, stores only its SHA-256 hash, then emails it.
 * A failed send puts the nominee back to `ready` so the old link stays dead and
 * the admin can retry.
 */
async function sendOne(election: Election, nominee: Nominee, actor: string): Promise<string | null> {
  const token = generateToken();
  const link = `${appUrl()}/consent/${token}`;
  const expiresAt = new Date(Date.now() + election.consentHours * 3600_000);
  await getDb()
    .update(nominees)
    .set({ status: 'consent_sent', consentTokenHash: hashToken(token), consentExpiresAt: expiresAt })
    .where(eq(nominees.id, nominee.id));
  try {
    await sendConsentEmail({
      to: nominee.email,
      name: nominee.fullName,
      electionTitle: election.title,
      position: nominee.position,
      link,
      expiresAt,
      hours: election.consentHours,
    });
  } catch {
    await getDb()
      .update(nominees)
      .set({ status: 'ready', consentTokenHash: null, consentExpiresAt: null })
      .where(eq(nominees.id, nominee.id));
    await logAudit({ actor, action: 'nominee.consent_email_failed', electionId: election.id, meta: { nomineeId: nominee.id } });
    return null;
  }
  await logAudit({ actor, action: 'nominee.consent_sent', electionId: election.id, meta: { nomineeId: nominee.id } });
  return link;
}

/** Single send or resend. The link is returned so the admin can hand it over if email is unreliable. */
export async function sendConsent(electionId: string, nomineeId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    if (!(await checkLimitClosed('emailSend', user.email))) {
      throw new AppError('Too many emails were sent recently. Please wait a few minutes.');
    }
    const n = await loadNominee(electionId, nomineeId);
    if (!canSendConsent(n.status)) {
      throw new AppError('Consent can only be sent once the nominee has enough nominators.');
    }
    await ensureEnoughNominators(election, n);
    const link = await sendOne(election, n, user.email);
    if (!link) throw new AppError('The email could not be sent. Check email settings and try again.');
    refresh(electionId);
    return { message: `Consent link sent to ${n.email}.`, link };
  });
}

/** One batch per click (default 10) so the action stays inside the function timeout. */
export async function sendConsentBulk(electionId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    if (!(await checkLimitClosed('emailSend', user.email))) {
      throw new AppError('Too many emails were sent recently. Please wait a few minutes.');
    }
    const db = getDb();
    const waiting = await db
      .select()
      .from(nominees)
      .where(and(eq(nominees.electionId, electionId), eq(nominees.status, 'ready')))
      .orderBy(asc(nominees.createdAt));
    if (waiting.length === 0) throw new AppError('No nominees are ready for a consent link.');

    let sent = 0;
    let failed = 0;
    for (const n of waiting.slice(0, CONSENT_BATCH_SIZE)) {
      if (!(await hasEnough(election, n))) continue;
      const link = await sendOne(election, n, user.email);
      if (link) sent++;
      else failed++;
      await sleep(550); // Resend free tier allows ~2 requests/second
    }
    refresh(electionId);
    const [left] = await db
      .select({ n: count() })
      .from(nominees)
      .where(and(eq(nominees.electionId, electionId), eq(nominees.status, 'ready')));
    const remaining = Number(left?.n ?? 0);
    return `Sent ${sent}, failed ${failed}${remaining ? `, ${remaining} still ready: send another batch` : ''}.`;
  });
}

async function hasEnough(election: Election, nominee: Nominee): Promise<boolean> {
  const [c] = await getDb()
    .select({ n: count() })
    .from(nominators)
    .where(eq(nominators.nomineeId, nominee.id));
  return Number(c?.n ?? 0) >= election.minNominators;
}

/** Only accepted nominees become candidates, and only while the election is a draft. */
export async function approveNominee(electionId: string, nomineeId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    const n = await loadNominee(electionId, nomineeId);
    if (!canApproveConsent(n.status)) throw new AppError('The nominee must accept the consent request first.');
    if (n.optionId) throw new AppError('This nominee is already a candidate.');
    if (!n.photoUrl || !n.photoPath) throw new AppError('The nominee has not added a photo yet.');

    const db = getDb();
    const [m] = await db.select({ n: max(options.sortOrder) }).from(options).where(eq(options.electionId, electionId));
    const optionId = crypto.randomUUID();
    await db.batch([
      db.insert(options).values({
        id: optionId,
        electionId,
        label: n.fullName,
        description: n.bio,
        position: n.position,
        imageUrl: n.photoUrl,
        imagePath: n.photoPath,
        sortOrder: (m?.n ?? -1) + 1,
      }),
      db
        .update(nominees)
        .set({ status: 'approved', optionId, reviewedBy: user.email, reviewNote: null })
        .where(eq(nominees.id, n.id)),
    ]);
    await logAudit({ actor: user.email, action: 'nominee.approve', electionId, meta: { nomineeId: n.id, optionId } });
    refresh(electionId);
    return 'Approved and added as a candidate.';
  });
}

export async function rejectNominee(electionId: string, nomineeId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    const n = await loadNominee(electionId, nomineeId);
    if (!canRejectNominee(n.status)) {
      throw new AppError('This nominee is already a candidate. Remove them from the Options tab first.');
    }
    await getDb()
      .update(nominees)
      .set({
        status: 'rejected',
        reviewNote: getStr(fd, 'note')?.slice(0, 500) ?? null,
        reviewedBy: user.email,
      })
      .where(eq(nominees.id, n.id));
    await logAudit({ actor: user.email, action: 'nominee.reject', electionId, meta: { nomineeId: n.id } });
    refresh(electionId);
    return 'Nominee rejected.';
  });
}
