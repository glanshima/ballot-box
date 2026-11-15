import { ActionForm } from '@/components/ActionForm';
import { ElectionFields } from '@/components/ElectionFields';
import { closeElection, deleteElection, launchElection, publishElection, updateElection } from '@/lib/actions/elections';
import { isSuper, requireElectionPage } from '@/lib/authz';
import { appUrl } from '@/lib/env';

export const metadata = { title: 'Election details' };

export default async function Details({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, election } = await requireElectionPage(id);
  const superAdmin = isSuper(user);
  const mode = election.status === 'draft' ? 'full' : election.status === 'open' ? 'extend' : 'readonly';
  const nominateUrl = `${appUrl()}/nominate/${id}`;

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-2 font-semibold">Status: {election.status}</h2>
        {election.status === 'draft' && (
          <>
            <p className="mb-3 text-sm text-slate-700">Everything can be edited while the election is a draft. Launching locks options, voters and times (you can still extend the closing time).</p>
            <ActionForm action={launchElection.bind(null, id)} submitLabel="Launch election" confirm="Launch this election? Options, voters and times will be locked.">{null}</ActionForm>
          </>
        )}
        {election.status === 'open' && (
          <>
            <p className="mb-3 text-sm text-slate-700">Voting is live according to the opening and closing times. It closes automatically after the closing time; results stay hidden until the super admin closes and publishes.</p>
            {superAdmin && <ActionForm action={closeElection.bind(null, id)} submitLabel="Close voting now" submitClass="btn btn-danger" confirm="Close voting now? This cannot be undone.">{null}</ActionForm>}
          </>
        )}
        {election.status === 'closed' && (
          <>
            <p className="mb-3 text-sm text-slate-700">Voting has ended. {superAdmin ? 'Publishing makes the results final and immutable.' : 'The super admin decides when results are published.'}</p>
            {superAdmin && (
              <ActionForm action={publishElection.bind(null, id)} submitLabel="Publish results" confirm="Publish results? This is final and cannot be undone." className="space-y-3">
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="resultsPublic" className="h-5 w-5 accent-indigo-700" /> Make the public results page visible to everyone
                </label>
              </ActionForm>
            )}
          </>
        )}
        {election.status === 'published' && (
          <p className="text-sm text-slate-700">
            Results are published and final.{' '}
            {election.resultsPublic ? <>Public page: <a className="text-indigo-800 underline" href={`/results/${id}`}>/results/{id}</a></> : 'The public page is not enabled.'}
          </p>
        )}
      </section>

      {election.type === 'candidate' && election.nominationsEnabled && (
        <section className="card">
          <h2 className="mb-1 font-semibold">Public nomination link</h2>
          <p className="break-all rounded bg-slate-100 px-2 py-1 text-sm">{nominateUrl}</p>
          <p className="hint">Share this link with aspirants. It works only while the election is a draft and before the nomination close time.</p>
        </section>
      )}

      <section className="card">
        <h2 className="mb-4 font-semibold">{mode === 'full' ? 'Edit details' : mode === 'extend' ? 'Extend closing time' : 'Details (locked)'}</h2>
        <ActionForm action={updateElection.bind(null, id)} className="space-y-5" submitLabel={mode === 'readonly' ? undefined : mode === 'extend' ? 'Extend closing time' : 'Save changes'}>
          <ElectionFields election={election} mode={mode} canSetLive={superAdmin} />
        </ActionForm>
      </section>

      {superAdmin && election.status === 'draft' && (
        <section className="card border-red-200">
          <h2 className="mb-2 font-semibold text-red-800">Delete election</h2>
          <p className="mb-3 text-sm text-slate-700">Removes the election, its options, voters, nominations and all uploaded images. Only possible while it is a draft.</p>
          <ActionForm action={deleteElection.bind(null, id)} className="space-y-3" submitLabel="Delete election" submitClass="btn btn-danger">
            <label htmlFor="confirmTitle" className="label">Type the title to confirm</label>
            <input id="confirmTitle" name="confirmTitle" className="input" autoComplete="off" />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
