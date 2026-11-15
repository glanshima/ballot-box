'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppError, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireElectionAction } from '@/lib/authz';
import { parseVoterCsv, type VoterPreviewRow } from '@/lib/csv';
import { getDb } from '@/lib/db/client';
import { isUuid } from '@/lib/db/queries';
import { voters } from '@/lib/db/schema';
import { assertDraft } from '@/lib/election-rules';
import { voterSchema } from '@/lib/validators';

const refresh = (id: string) => revalidatePath(`/admin/elections/${id}`, 'layout');
const MAX_CSV_CHARS = 500_000;

async function existingEmails(electionId: string) {
  const rows = await getDb().select({ e: voters.email }).from(voters).where(eq(voters.electionId, electionId));
  return new Set(rows.map((r) => r.e));
}

export type PreviewResult =
  | { ok: true; rows: VoterPreviewRow[]; counts: Record<VoterPreviewRow['status'], number> }
  | { ok: false; error: string };

/** Step 1 of CSV import: validate + dedupe, write nothing. */
export async function previewVoters(electionId: string, csv: string): Promise<PreviewResult> {
  try {
    const { election } = await requireElectionAction(electionId);
    assertDraft(election);
    if (csv.length > MAX_CSV_CHARS) throw new AppError('File too large.');
    const rows = parseVoterCsv(csv, await existingEmails(electionId));
    const counts = { valid: 0, invalid: 0, duplicate: 0, existing: 0 };
    for (const r of rows) counts[r.status]++;
    return { ok: true, rows, counts };
  } catch (e) {
    return { ok: false, error: e instanceof AppError || e instanceof Error ? e.message : 'Could not read the file.' };
  }
}

/** Step 2: re-parse on the server (never trust the client's preview) and insert the valid rows. */
export async function importVoters(electionId: string, csv: string): Promise<{ ok: boolean; message: string }> {
  const res = await run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    if (csv.length > MAX_CSV_CHARS) throw new AppError('File too large.');
    const valid = parseVoterCsv(csv, await existingEmails(electionId)).filter((r) => r.status === 'valid');
    if (valid.length === 0) throw new AppError('No new valid voters to import.');
    const db = getDb();
    for (let i = 0; i < valid.length; i += 500) {
      await db
        .insert(voters)
        .values(valid.slice(i, i + 500).map((r) => ({ electionId, email: r.email, name: r.name })))
        .onConflictDoNothing();
    }
    await logAudit({ actor: user.email, action: 'voters.import', electionId, meta: { count: valid.length } });
    refresh(electionId);
    return `Imported ${valid.length} voter(s).`;
  });
  return { ok: !!res?.ok, message: res?.ok ? (res.message ?? 'Done.') : (res?.error ?? 'Failed.') };
}

export async function addVoter(electionId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    const v = voterSchema.parse({ email: getStr(fd, 'email'), name: getStr(fd, 'name') });
    const res = await getDb()
      .insert(voters)
      .values({ electionId, email: v.email, name: v.name ?? null })
      .onConflictDoNothing()
      .returning({ id: voters.id });
    if (res.length === 0) throw new AppError('That email is already on the voter list.');
    await logAudit({ actor: user.email, action: 'voters.add', electionId });
    refresh(electionId);
    return 'Voter added.';
  });
}

export async function removeVoter(electionId: string, voterId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    if (!isUuid(voterId)) throw new AppError('Voter not found.');
    await getDb().delete(voters).where(and(eq(voters.id, voterId), eq(voters.electionId, electionId)));
    await logAudit({ actor: user.email, action: 'voters.remove', electionId });
    refresh(electionId);
    return 'Voter removed.';
  });
}
