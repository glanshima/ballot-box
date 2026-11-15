import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getElection, isUuid } from '@/lib/db/queries';
import { nominationsOpen } from '@/lib/election-rules';
import { NominationForm } from './NominationForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Nomination form' };

export default async function NominatePage({ params }: { params: Promise<{ electionId: string }> }) {
  const { electionId } = await params;
  if (!isUuid(electionId)) notFound();
  const e = await getElection(electionId);
  if (!e || !e.nominationsEnabled) notFound();

  if (!nominationsOpen(e, new Date())) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="card text-center" role="status">
          <h1 className="text-xl font-bold">Nominations closed</h1>
          <p className="mt-2 text-slate-700">{e.title} is no longer accepting nominations.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">Nomination form</h1>
      <p className="mt-1 text-slate-700">{e.title}</p>
      {e.nominationInstructions && (
        <p className="mt-4 whitespace-pre-line rounded-lg bg-indigo-50 p-3 text-sm text-indigo-950">{e.nominationInstructions}</p>
      )}
      <NominationForm
        electionId={e.id}
        positions={e.nominationPositions}
        requireEvidence={e.requirePurchaseEvidence}
        closesAt={e.nominationsCloseAt ? e.nominationsCloseAt.toISOString() : null}
      />
    </main>
  );
}
