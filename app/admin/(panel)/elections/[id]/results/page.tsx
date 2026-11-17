import { ExportResults } from '@/components/ExportResults';
import { ResultsImageExport } from '@/components/ResultsImageExport';
import { ResultsView } from '@/components/ResultsView';
import { requireElectionPage } from '@/lib/authz';
import { loadResultsForViewer, resultsPayloadHash } from '@/lib/results';

export const metadata = { title: 'Results' };
export const dynamic = 'force-dynamic';

/** Read-only for everyone: no code path in the app modifies ballots. */
export default async function ResultsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { election } = await requireElectionPage(id);
  const res = await loadResultsForViewer(id, 'admin');

  if (!res.ok) {
    return (
      <div className="card text-center text-slate-700">
        <p className="font-medium">Results are hidden.</p>
        <p className="mt-1 text-sm">
          {election.status === 'draft' && 'Voting has not started.'}
          {election.status === 'open' && (election.liveResults ? 'Not available.' : 'They become visible once voting has closed. (Live results are off for this election.)')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {election.status === 'open' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Live view: voting is still open, so these numbers are not final.</p>}
      <ResultsView results={res.results} />
      <ExportResults electionId={id} />
      <ResultsImageExport title={res.election.title} results={res.results} hash={resultsPayloadHash(id, res.results)} />
    </div>
  );
}
