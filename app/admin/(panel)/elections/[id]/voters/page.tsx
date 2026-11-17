import { asc, eq } from 'drizzle-orm';
import { ActionForm } from '@/components/ActionForm';
import { StatusBadge } from '@/components/StatusBadge';
import { VoterImport } from '@/components/VoterImport';
import { addVoter, removeVoter } from '@/lib/actions/voters';
import { requireElectionPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { voters } from '@/lib/db/schema';

export const metadata = { title: 'Voters' };

export default async function VotersTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { election } = await requireElectionPage(id);
  const list = await getDb().select().from(voters).where(eq(voters.electionId, id)).orderBy(asc(voters.email));
  const draft = election.status === 'draft';
  const voted = list.filter((v) => v.hasVoted).length;
  const pct = list.length ? Math.round((voted / list.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Eligible voters</p>
          <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{list.length}</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Votes cast</p>
          <p className="mt-1 text-3xl font-bold text-indigo-700 tabular-nums">{voted}</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Participation</p>
          <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{pct}%</p>
          <p className="hint mt-0.5">Shows participation only, never choices.</p>
        </div>
      </div>

      {draft ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="card">
            <h2 className="mb-3 font-bold text-slate-900">Import voters from CSV</h2>
            <VoterImport electionId={id} />
          </section>
          <section className="card">
            <h2 className="mb-3 font-bold text-slate-900">Add a single voter</h2>
            <ActionForm action={addVoter.bind(null, id)} className="space-y-3.5" submitLabel="Add voter" resetOnSuccess>
              <div>
                <label className="label">Email *</label>
                <input name="email" type="email" className="input" required />
              </div>
              <div>
                <label className="label">Name</label>
                <input name="name" className="input" />
              </div>
            </ActionForm>
          </section>
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The voter list is locked now that the election has been launched.
        </p>
      )}

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-bold text-slate-900">Voter list ({list.length})</h2>
        {list.length === 0 ? (
          <p className="text-sm text-slate-600">No voters added yet.</p>
        ) : (
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 pr-3">Email</th>
                <th className="py-2.5 pr-3">Name</th>
                <th className="py-2.5 pr-3">Invite</th>
                <th className="py-2.5 pr-3">Voted</th>
                {draft && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 pr-3 break-all font-medium text-slate-900">{v.email}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{v.name ?? '—'}</td>
                  <td className="py-2.5 pr-3"><StatusBadge value={v.inviteStatus} /></td>
                  <td className="py-2.5 pr-3">
                    {v.hasVoted ? (
                      <span className="font-semibold text-emerald-700">Yes</span>
                    ) : (
                      <span className="text-slate-500">No</span>
                    )}
                  </td>
                  {draft && (
                    <td className="py-1.5 text-right">
                      <ActionForm
                        action={removeVoter.bind(null, id, v.id)}
                        submitLabel="Remove"
                        submitClass="btn btn-secondary btn-sm"
                        confirm="Remove this voter?"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
