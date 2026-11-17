import { desc, eq } from 'drizzle-orm';
import Image from 'next/image';
import { ActionForm } from '@/components/ActionForm';
import { CopyButton } from '@/components/CopyButton';
import { LocalTime } from '@/components/LocalTime';
import { StatusBadge } from '@/components/StatusBadge';
import { approveNomination, rejectNomination } from '@/lib/actions/nominations';
import { requireElectionPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { nominations } from '@/lib/db/schema';
import { appUrl } from '@/lib/env';

export const metadata = { title: 'Nominations' };

export default async function NominationsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { election } = await requireElectionPage(id);
  const list = await getDb()
    .select()
    .from(nominations)
    .where(eq(nominations.electionId, id))
    .orderBy(desc(nominations.createdAt));
  const draft = election.status === 'draft';
  const nominateUrl = `${appUrl()}/nominate/${id}`;

  return (
    <div className="space-y-4">
      {election.nominationsEnabled ? (
        <div className="card flex flex-wrap items-center justify-between gap-2 !py-3">
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-semibold text-slate-500">Public nomination URL: </span>
            <span className="break-all font-medium text-slate-800">{nominateUrl}</span>
          </div>
          <CopyButton value={nominateUrl} label="Copy link" />
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The nomination form is switched off. Enable it on the Details tab.
        </p>
      )}

      {!draft && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Nominations can only be reviewed while the election is a draft.
        </p>
      )}

      {list.length === 0 ? (
        <div className="card border-dashed py-10 text-center text-sm text-slate-600">
          No nominations received yet.
        </div>
      ) : (
        list.map((n) => (
          <article key={n.id} className="card">
            <div className="flex gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <Image src={n.photoUrl} alt={n.fullName} fill sizes="96px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">{n.fullName}</h2>
                  <StatusBadge value={n.status} />
                </div>
                <p className="mt-0.5 text-xs font-medium text-indigo-800">
                  {n.position ?? 'No position'} · <span className="text-slate-500"><LocalTime iso={n.createdAt.toISOString()} /></span>
                </p>
                <p className="mt-1 break-all text-xs text-slate-600">
                  {n.email}{n.phone ? ` · ${n.phone}` : ''}
                </p>
              </div>
            </div>

            {n.manifesto && (
              <p className="mt-3 whitespace-pre-line rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm leading-relaxed text-slate-700">
                {n.manifesto}
              </p>
            )}

            <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50 px-3.5 py-2.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence of form purchase</p>
              {n.receiptUrl ? (
                <p className="mt-1">
                  <a href={n.receiptUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-indigo-700 underline hover:text-indigo-900">
                    Open receipt ↗
                  </a>
                  {n.receiptReference ? <span className="text-slate-600"> · Ref: {n.receiptReference}</span> : ''}
                </p>
              ) : (
                <p className="mt-1 text-slate-600">
                  {n.receiptReference ? `Ref: ${n.receiptReference} (no file)` : 'None provided'}
                  {election.requirePurchaseEvidence ? <span className="font-semibold text-red-700"> (required!)</span> : ''}
                </p>
              )}
            </div>

            {n.reviewNote && (
              <p className="mt-2 text-xs text-slate-600">
                <strong className="font-semibold">Review note:</strong> {n.reviewNote}
              </p>
            )}

            {draft && n.status !== 'approved' && (
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-start">
                <ActionForm action={approveNomination.bind(null, id, n.id)} submitLabel="Approve → add as candidate" />
                {n.status === 'pending' && (
                  <ActionForm
                    action={rejectNomination.bind(null, id, n.id)}
                    className="flex flex-1 gap-2"
                    submitLabel="Reject"
                    submitClass="btn btn-secondary"
                  >
                    <input
                      name="note"
                      className="input"
                      placeholder="Rejection reason (optional)"
                      maxLength={500}
                      aria-label="Rejection reason"
                    />
                  </ActionForm>
                )}
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
