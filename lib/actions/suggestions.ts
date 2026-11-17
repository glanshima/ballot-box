'use server';

import { and, eq, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireElectionAction } from '@/lib/authz';
import { deleteIfUnreferenced } from '@/lib/blob';
import { getDb } from '@/lib/db/client';
import { isUuid } from '@/lib/db/queries';
import { optionSuggestions, options, type OptionSuggestion } from '@/lib/db/schema';
import { assertDraft } from '@/lib/election-rules';
import { normalizeTitle } from '@/lib/nominations/rules';
import { canDecideSuggestion } from '@/lib/suggestions';

const refresh = (id: string) => revalidatePath(`/admin/elections/${id}`, 'layout');

async function loadSuggestion(electionId: string, suggestionId: string): Promise<OptionSuggestion> {
  if (!isUuid(suggestionId)) throw new AppError('Suggestion not found.');
  const [s] = await getDb()
    .select()
    .from(optionSuggestions)
    .where(and(eq(optionSuggestions.id, suggestionId), eq(optionSuggestions.electionId, electionId)))
    .limit(1);
  if (!s) throw new AppError('Suggestion not found.');
  return s;
}

/** Only pending suggestions can be approved, and only while the poll is a draft. */
export async function approveSuggestion(electionId: string, suggestionId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    if (election.type !== 'poll') throw new AppError('Suggestions only apply to polls.');
    const s = await loadSuggestion(electionId, suggestionId);
    if (!canDecideSuggestion(s.status)) throw new AppError('This suggestion has already been reviewed.');

    const db = getDb();
    const current = await db.select({ label: options.label }).from(options).where(eq(options.electionId, electionId));
    if (current.some((o) => normalizeTitle(o.label) === normalizeTitle(s.title))) {
      throw new AppError('An option with this title already exists. Reject the suggestion or rename the option first.');
    }

    const [m] = await db.select({ n: max(options.sortOrder) }).from(options).where(eq(options.electionId, electionId));
    const optionId = crypto.randomUUID();
    await db.batch([
      db.insert(options).values({
        id: optionId,
        electionId,
        label: s.title,
        description: s.description,
        imageUrl: s.imageUrl,
        imagePath: s.imagePath,
        sortOrder: (m?.n ?? -1) + 1,
      }),
      db
        .update(optionSuggestions)
        .set({ status: 'approved', optionId, reviewedBy: user.email, reviewNote: null })
        .where(eq(optionSuggestions.id, s.id)),
    ]);
    await logAudit({
      actor: user.email,
      action: 'suggestion.approve',
      electionId,
      meta: { suggestionId: s.id, optionId },
    });
    refresh(electionId);
    return 'Suggestion approved and added to the poll.';
  });
}

export async function rejectSuggestion(electionId: string, suggestionId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    const s = await loadSuggestion(electionId, suggestionId);
    if (!canDecideSuggestion(s.status)) throw new AppError('This suggestion has already been reviewed.');

    await getDb()
      .update(optionSuggestions)
      .set({
        status: 'rejected',
        reviewNote: getStr(fd, 'note')?.slice(0, 500) ?? null,
        reviewedBy: user.email,
        imageUrl: null,
        imagePath: null,
      })
      .where(eq(optionSuggestions.id, s.id));
    await deleteIfUnreferenced(s.imageUrl, s.imagePath);
    await logAudit({ actor: user.email, action: 'suggestion.reject', electionId, meta: { suggestionId: s.id } });
    refresh(electionId);
    return 'Suggestion rejected.';
  });
}
