'use server';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireElectionAction } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { isUuid } from '@/lib/db/queries';
import { voters, type Election } from '@/lib/db/schema';
import { sendInvitationEmail } from '@/lib/email';
import { issueToken, sleep } from '@/lib/invitations';

// NOTE: a 'use server' file may only export async functions, so `maxDuration`
// is exported from the invitations page instead (app/admin/.../invitations/page.tsx).
const refresh = (id: string) => revalidatePath(`/admin/elections/${id}`, 'layout');

function assertInvitable(e: Election) {
  if (e.status !== 'draft' && e.status !== 'open') throw new AppError('Invitations can only be sent before voting closes.');
}

async function inviteOne(election: Election, v: { id: string; email: string; name: string | null }) {
  // Rotate first so the emailed token is the only valid one; mark failed if sending fails.
  const { link } = await issueToken(v.id, election.closesAt, 'pending');
  try {
    await sendInvitationEmail({ to: v.email, name: v.name, electionTitle: election.title, link, closesAt: election.closesAt });
    await getDb().update(voters).set({ inviteStatus: 'sent' }).where(eq(voters.id, v.id));
    return true;
  } catch {
    // Do not log the address or link.
    await getDb().update(voters).set({ inviteStatus: 'failed' }).where(eq(voters.id, v.id));
    return false;
  }
}

/**
 * Send a BATCH of invitations (default 20, max 50) to voters who are pending/failed and haven't voted.
 * Batching + per-voter status keeps us inside free-tier email limits and function timeouts;
 * run it again for the next batch.
 */
export async function sendInvitations(electionId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertInvitable(election);
    const size = Math.min(50, Math.max(1, Number.parseInt(getStr(fd, 'batchSize') ?? '20', 10) || 20));
    const db = getDb();
    const waiting = await db
      .select({ id: voters.id, email: voters.email, name: voters.name })
      .from(voters)
      .where(and(eq(voters.electionId, electionId), eq(voters.hasVoted, false), inArray(voters.inviteStatus, ['pending', 'failed'])))
      .orderBy(asc(voters.createdAt));
    if (waiting.length === 0) throw new AppError('Nobody is waiting for an invitation.');

    let sent = 0;
    let failed = 0;
    for (const v of waiting.slice(0, size)) {
      (await inviteOne(election, v)) ? sent++ : failed++;
      await sleep(550); // Resend free tier allows ~2 requests/second
    }
    await logAudit({ actor: user.email, action: 'invitations.send', electionId, meta: { sent, failed } });
    refresh(electionId);
    const remaining = Math.max(0, waiting.length - size);
    return `Sent ${sent}, failed ${failed}${remaining ? `, ${remaining} still waiting: send another batch` : ''}.${failed ? ' Failed voters can be retried or exported as links.' : ''}`;
  });
}

/** Re-send to one voter. This rotates their token: the previous link stops working. */
export async function resendInvitation(electionId: string, voterId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertInvitable(election);
    if (!isUuid(voterId)) throw new AppError('Voter not found.');
    const [v] = await getDb()
      .select({ id: voters.id, email: voters.email, name: voters.name, hasVoted: voters.hasVoted })
      .from(voters)
      .where(and(eq(voters.id, voterId), eq(voters.electionId, electionId)))
      .limit(1);
    if (!v) throw new AppError('Voter not found.');
    if (v.hasVoted) throw new AppError('This voter has already voted.');
    const ok = await inviteOne(election, v);
    await logAudit({ actor: user.email, action: 'invitations.resend', electionId, meta: { ok } });
    refresh(electionId);
    if (!ok) throw new AppError('Sending failed. Check email settings or export the link instead.');
    return 'Invitation re-sent (previous link no longer works).';
  });
}
