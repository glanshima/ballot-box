import { asc, eq } from 'drizzle-orm';
import { ActionForm } from '@/components/ActionForm';
import { StatusBadge } from '@/components/StatusBadge';
import { resendInvitation, sendInvitations } from '@/lib/actions/invitations';
import { requireElectionPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { voters } from '@/lib/db/schema';

export const metadata = { title: 'Invitations' };
export const maxDuration = 60; // a batch of emails is sent sequentially (provider rate limit)

export default async function InvitationsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { election } = await requireElectionPage(id);
  const list = await getDb().select().from(voters).where(eq(voters.electionId, id)).orderBy(asc(voters.email));
  const can = election.status === 'draft' || election.status === 'open';
  const count = (s: string) => list.filter((v) => v.inviteStatus === s && !v.hasVoted).length;
  const waiting = count('pending') + count('failed');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['pending', 'sent', 'failed', 'exported'] as const).map((s) => (
          <div key={s} className="card !p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{s}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{count(s)}</p>
          </div>
        ))}
      </div>

      {!can ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Invitations can only be sent before voting closes.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="card">
            <h2 className="mb-1 font-bold text-slate-900">Send invitations by email</h2>
            <p className="mb-4 text-sm text-slate-600">
              Sends in batches so you stay within the email free tier.{' '}
              <strong className="font-semibold text-slate-900">{waiting}</strong> voter(s) waiting.
            </p>
            <ActionForm action={sendInvitations.bind(null, id)} className="flex flex-wrap items-end gap-3" submitLabel="Send batch">
              <div>
                <label htmlFor="batchSize" className="label">Batch size (max 50)</label>
                <input id="batchSize" name="batchSize" type="number" min={1} max={50} defaultValue={20} className="input w-28" />
              </div>
            </ActionForm>
          </section>

          <section className="card">
            <h2 className="mb-1 font-bold text-slate-900">Export links as CSV</h2>
            <p className="mb-4 text-sm text-slate-600">
              Fallback when email is limited. Exporting generates <strong>new</strong> links; any link previously sent to those voters stops working.
            </p>
            <form method="post" action={`/api/admin/elections/${id}/links`} className="space-y-3">
              <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
                <input type="checkbox" name="all" className="h-5 w-5 accent-indigo-700" />
                Include everyone who has not voted (re-issues links already sent)
              </label>
              <button type="submit" className="btn btn-secondary">Export links as CSV</button>
            </form>
          </section>
        </div>
      )}

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-bold text-slate-900">Per-voter status</h2>
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-2.5 pr-3">Email</th>
              <th className="py-2.5 pr-3">Status</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50/70">
                <td className="py-2.5 pr-3 break-all font-medium text-slate-900">{v.email}</td>
                <td className="py-2.5 pr-3">
                  {v.hasVoted ? (
                    <span className="badge bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200">Voted</span>
                  ) : (
                    <StatusBadge value={v.inviteStatus} />
                  )}
                </td>
                <td className="py-1.5 text-right">
                  {can && !v.hasVoted && (
                    <ActionForm
                      action={resendInvitation.bind(null, id, v.id)}
                      submitLabel="Re-send"
                      submitClass="btn btn-secondary btn-sm"
                      confirm="Re-send? The voter's previous link will stop working."
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
