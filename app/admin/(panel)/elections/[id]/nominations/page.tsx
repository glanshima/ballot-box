import { desc, eq } from 'drizzle-orm';
import Image from 'next/image';
import { ActionForm } from '@/components/ActionForm';
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
  const list = await getDb().select().from(nominations).where(eq(nominations.electionId, id)).orderBy(desc(nominations.createdAt));
  const draft = election.status === 'draft';

  return (
    <div className="space-y-4">
      {election.nominationsEnabled ? (
        <p className="text-sm text-slate-700">Public form: <span className="break-all rounded bg-slate-100 px-1.5 py-0.5">{appUrl()}/nominate/{id}</span></p>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The nomination form is switched off. Enable it on the Details tab.</p>
      )}
      {!draft && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nominations can only be reviewed while the election is a draft.</p>}

      {list.length === 0 ? (
        <div className="card text-center text-slate-700">No nominations received yet.</div>
      ) : (
        list.map((n) => (
          <article key={n.id} className="card">
            <div className="flex gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-200">
                <Image src={n.photoUrl} alt={n.fullName} fill sizes="96px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{n.fullName}</h2>
                  <StatusBadge value={n.status} />
                </div>
                <p className="text-sm text-slate-700">{n.position ?? 'No position'} · <LocalTime iso={n.createdAt.toISOString()} /></p>
                <p className="break-all text-sm text-slate-700">{n.email}{n.phone ? ` · ${n.phone}` : ''}</p>
              </div>
            </div>
            {n.manifesto && <p className="mt-3 whitespace-pre-line text-sm">{n.manifesto}</p>}
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium">Evidence of form purchase</p>
              {n.receiptUrl ? (
                <p>
                  <a href={n.receiptUrl} target="_blank" rel="noreferrer noopener" className="text-indigo-800 underline">Open receipt</a>
                  {n.receiptReference ? ` · Ref: ${n.receiptReference}` : ''}
                </p>
              ) : (
                <p className="text-slate-700">{n.receiptReference ? `Ref: ${n.receiptReference} (no file)` : 'None provided'}{election.requirePurchaseEvidence ? ' (required!)' : ''}</p>
              )}
            </div>
            {n.reviewNote && <p className="mt-2 text-sm text-slate-700">Note: {n.reviewNote}</p>}
            {draft && n.status !== 'approved' && (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
                <ActionForm action={approveNomination.bind(null, id, n.id)} submitLabel="Approve → add as candidate">{null}</ActionForm>
                {n.status === 'pending' && (
                  <ActionForm action={rejectNomination.bind(null, id, n.id)} className="flex flex-1 gap-2" submitLabel="Reject" submitClass="btn btn-secondary">
                    <input name="note" className="input" placeholder="Reason (optional)" maxLength={500} aria-label="Rejection reason" />
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
