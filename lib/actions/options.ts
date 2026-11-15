'use server';

import { and, eq, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireElectionAction } from '@/lib/authz';
import { deleteIfUnreferenced } from '@/lib/blob';
import { getDb } from '@/lib/db/client';
import { getOptions, isUuid } from '@/lib/db/queries';
import { nominations, options } from '@/lib/db/schema';
import { assertDraft } from '@/lib/election-rules';
import { isOwnUpload } from '@/lib/upload-policy';
import { optionSchema } from '@/lib/validators';

const refresh = (id: string) => revalidatePath(`/admin/elections/${id}`, 'layout');

/** Create (optionId = null) or update an option. Draft elections only. */
export async function saveOption(electionId: string, optionId: string | null, _p: ActionState, fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    const v = optionSchema.parse({
      label: getStr(fd, 'label'),
      description: getStr(fd, 'description'),
      position: election.type === 'candidate' ? getStr(fd, 'position') : undefined,
      imageUrl: getStr(fd, 'imageUrl'),
      imagePath: getStr(fd, 'imagePath'),
    });
    if (v.imageUrl && v.imagePath && !isOwnUpload('option', electionId, v.imageUrl, v.imagePath)) {
      throw new AppError('Invalid image upload. Please upload it again.');
    }
    const db = getDb();

    if (optionId === null) {
      const [m] = await db.select({ n: max(options.sortOrder) }).from(options).where(eq(options.electionId, electionId));
      await db.insert(options).values({
        electionId,
        label: v.label,
        description: v.description ?? null,
        position: v.position ?? null,
        imageUrl: v.imageUrl ?? null,
        imagePath: v.imagePath ?? null,
        sortOrder: (m?.n ?? -1) + 1,
      });
      await logAudit({ actor: user.email, action: 'option.create', electionId, meta: { label: v.label } });
      refresh(electionId);
      return 'Option added.';
    }

    if (!isUuid(optionId)) throw new AppError('Option not found.');
    const [old] = await db.select().from(options).where(and(eq(options.id, optionId), eq(options.electionId, electionId))).limit(1);
    if (!old) throw new AppError('Option not found.');
    await db
      .update(options)
      .set({
        label: v.label,
        description: v.description ?? null,
        position: v.position ?? null,
        imageUrl: v.imageUrl ?? null,
        imagePath: v.imagePath ?? null,
      })
      .where(eq(options.id, optionId));
    if (old.imagePath && old.imagePath !== (v.imagePath ?? null)) await deleteIfUnreferenced(old.imageUrl, old.imagePath);
    await logAudit({ actor: user.email, action: 'option.update', electionId, meta: { optionId } });
    refresh(electionId);
    return 'Option saved.';
  });
}

export async function deleteOption(electionId: string, optionId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    if (!isUuid(optionId)) throw new AppError('Option not found.');
    const db = getDb();
    const [old] = await db.select().from(options).where(and(eq(options.id, optionId), eq(options.electionId, electionId))).limit(1);
    if (!old) throw new AppError('Option not found.');
    await db.batch([
      // an approved nomination goes back to "pending" so it is not silently lost
      db.update(nominations).set({ status: 'pending', optionId: null }).where(eq(nominations.optionId, optionId)),
      db.delete(options).where(eq(options.id, optionId)),
    ]);
    await deleteIfUnreferenced(old.imageUrl, old.imagePath);
    await logAudit({ actor: user.email, action: 'option.delete', electionId, meta: { label: old.label } });
    refresh(electionId);
    return 'Option deleted.';
  });
}

export async function moveOption(electionId: string, optionId: string, dir: 'up' | 'down', _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { election } = await requireElectionAction(electionId);
    assertDraft(election);
    const db = getDb();
    const list = await getOptions(electionId);
    const i = list.findIndex((o) => o.id === optionId);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    // Only order values matter; re-number everything so they stay unique.
    for (const [idx, o] of list.entries()) {
      if (o.sortOrder !== idx) await db.update(options).set({ sortOrder: idx }).where(eq(options.id, o.id));
    }
    refresh(electionId);
  });
}
