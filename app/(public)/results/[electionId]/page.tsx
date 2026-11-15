import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ResultsView } from '@/components/ResultsView';
import { isUuid } from '@/lib/db/queries';
import { loadResultsForViewer } from '@/lib/results';

// Published results are immutable, so cache the page (ISR). publishElection()
// calls revalidatePath() so a previously cached "not available" page is replaced.
export const revalidate = 3600;
export const metadata: Metadata = { title: 'Results' };

export default async function PublicResults({ params }: { params: Promise<{ electionId: string }> }) {
  const { electionId } = await params;
  if (!isUuid(electionId)) notFound();
  // Public viewer only: visible solely when status = published AND results_public = true.
  // Otherwise 404 (the API returns 403): never reveals that the election exists.
  const res = await loadResultsForViewer(electionId, 'public');
  if (!res.ok) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">{res.election.title}</h1>
      <p className="mb-6 text-sm text-slate-700">Official results</p>
      <ResultsView results={res.results} />
    </main>
  );
}
