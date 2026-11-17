'use server';

import { eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireElectionAction, requireSuperAction } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { nominationAttachments, nominators } from '@/lib/db/schema';

const refresh = (id: string) => revalidatePath(`/admin/elections/${id}`, 'layout');

/**
 * Retention action: permanently deletes every membership proof and signature
 * stored for the election. Super admin only (irreversible data loss), audited.
 */
export async function purgeNominationAttachments(electionId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    const { election } = await requireElectionAction(electionId);
    if (getStr(fd, 'confirmTitle') !== election.title) {
      throw new AppError('Type the election title exactly to confirm.');
    }

    const db = getDb();
    const rows = await db
      .select({ id: nominators.id })
      .from(nominators)
      .where(eq(nominators.electionId, electionId));
    const nominatorIds = rows.map((r) => r.id);
    const deleted = nominatorIds.length
      ? await db
          .delete(nominationAttachments)
          .where(inArray(nominationAttachments.nominatorId, nominatorIds))
          .returning({ id: nominationAttachments.id })
      : [];

    await logAudit({
      actor: user.email,
      action: 'nomination.attachments_purged',
      electionId,
      meta: { deleted: deleted.length },
    });
    refresh(electionId);
    return deleted.length === 0
      ? 'There were no signatures or proofs to delete.'
      : `Deleted ${deleted.length} private attachment${deleted.length === 1 ? '' : 's'}. This cannot be undone.`;
  });
}
