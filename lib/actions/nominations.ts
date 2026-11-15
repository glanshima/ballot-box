'use server';

import { and, eq, max, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireElectionAction } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { isUuid } from '@/lib/db/queries';
import { nominations, options } from '@/lib/db/schema';
import { assertDraft } from '@/lib/election-rules';

const refresh = (id: string) => revalidatePath(`/admin/elections/${id}`, 'layout');

async function load(electionId: string, nominationId: string) {
  if (!isUuid(nominationId)) throw new AppError('Nomination not found.');
  const [n] = await getDb()
    .select()
    .from(nominations)
    .where(and(eq(nominations.id, nominationId), eq(nominations.electionId, electionId)))
    .limit(1);
  if (!n) throw new AppError('Nomination not found.');
  return n;
}

/** Approving turns the nomination into a candidate option (sharing the uploaded photo). Draft only. */
export async function approveNomination(electionId: string, nominationId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    const n = await load(electionId, nominationId);
    if (n.status === 'approved') throw new AppError('Already approved.');
    const db = getDb();
    const [m] = await db.select({ x: max(options.sortOrder) }).from(options).where(eq(options.electionId, electionId));
    const optionId = crypto.randomUUID();
    await db.batch([
      db.insert(options).values({
        id: optionId,
        electionId,
        label: n.fullName,
        description: n.manifesto,
        position: n.position,
        imageUrl: n.photoUrl,
        imagePath: n.photoPath,
        sortOrder: (m?.x ?? -1) + 1,
      }),
      db
        .update(nominations)
        .set({ status: 'approved', optionId, reviewedBy: user.email, reviewNote: null })
        .where(eq(nominations.id, n.id)),
    ]);
    await logAudit({ actor: user.email, action: 'nomination.approve', electionId, meta: { nominationId: n.id } });
    refresh(electionId);
    return 'Approved and added as a candidate.';
  });
}

export async function rejectNomination(electionId: string, nominationId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    const n = await load(electionId, nominationId);
    if (n.status === 'approved') throw new AppError('Remove the candidate from the Options tab first.');
    await getDb()
      .update(nominations)
      .set({ status: 'rejected', reviewNote: getStr(fd, 'note')?.slice(0, 500) ?? null, reviewedBy: user.email })
      .where(and(eq(nominations.id, n.id), ne(nominations.status, 'approved')));
    await logAudit({ actor: user.email, action: 'nomination.reject', electionId, meta: { nominationId: n.id } });
    refresh(electionId);
    return 'Nomination rejected.';
  });
}
