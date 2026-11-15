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

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-sm font-medium text-slate-700">Turnout</h2>
        <p className="text-2xl font-bold">{voted} / {list.length}</p>
        <p className="hint">Shows who has voted, never what they voted for.</p>
      </div>

      {draft ? (
        <>
          <section className="card">
            <h2 className="mb-3 font-semibold">Import voters from CSV</h2>
            <VoterImport electionId={id} />
          </section>
          <section className="card">
            <h2 className="mb-3 font-semibold">Add a single voter</h2>
            <ActionForm action={addVoter.bind(null, id)} className="space-y-3" submitLabel="Add voter" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label">Email *</label><input name="email" type="email" className="input" required /></div>
                <div><label className="label">Name</label><input name="name" className="input" /></div>
              </div>
            </ActionForm>
          </section>
        </>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The voter list is locked now that the election has been launched.</p>
      )}

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Voter list ({list.length})</h2>
        {list.length === 0 ? <p className="text-slate-700">No voters yet.</p> : (
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-slate-700"><th className="py-2 pr-2">Email</th><th className="py-2 pr-2">Name</th><th className="py-2 pr-2">Invite</th><th className="py-2 pr-2">Voted</th>{draft && <th />}</tr></thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2 break-all">{v.email}</td>
                  <td className="py-2 pr-2">{v.name}</td>
                  <td className="py-2 pr-2"><StatusBadge value={v.inviteStatus} /></td>
                  <td className="py-2 pr-2">{v.hasVoted ? 'Yes' : 'No'}</td>
                  {draft && <td className="py-1 text-right"><ActionForm action={removeVoter.bind(null, id, v.id)} submitLabel="Remove" submitClass="btn btn-secondary btn-sm" confirm="Remove this voter?">{null}</ActionForm></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
