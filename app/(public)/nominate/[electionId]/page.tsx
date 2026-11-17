import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getElection, isUuid } from '@/lib/db/queries';
import { memberSuggestionsOpen, nominationsOpen } from '@/lib/election-rules';
import { sessionVoter } from '@/lib/nominations/member';
import { readMemberSession } from '@/lib/nominations/session';
import { MemberNominationFlow } from './MemberNominationFlow';
import { NominationForm } from './NominationForm';
import { PollSuggestionFlow } from './PollSuggestionFlow';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Nomination form' };

export default async function NominatePage({ params }: { params: Promise<{ electionId: string }> }) {
  const { electionId } = await params;
  if (!isUuid(electionId)) notFound();
  const e = await getElection(electionId);
  if (!e || !e.nominationsEnabled) notFound();

  const poll = e.type === 'poll';
  const memberMode = e.nominationMode === 'member';
  if (poll && !memberMode) notFound(); // poll suggestions only exist for verified members

  const now = new Date();
  const open = poll ? memberSuggestionsOpen(e, now) : nominationsOpen(e, now);
  if (!open) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="card text-center" role="status">
          <h1 className="text-xl font-bold">{poll ? 'Suggestions closed' : 'Nominations closed'}</h1>
          <p className="mt-2 text-slate-700">
            {e.title} is no longer accepting {poll ? 'suggestions' : 'nominations'}.
          </p>
        </div>
      </main>
    );
  }

  let verifiedEmail: string | null = null;
  if (memberMode) {
    const session = await readMemberSession(e.id);
    if (session) verifiedEmail = (await sessionVoter(e.id, session.voterId))?.email ?? null;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">{poll ? 'Suggest a poll item' : memberMode ? 'Nominate a member' : 'Nomination form'}</h1>
      <p className="mt-1 text-slate-700">{e.title}</p>
      {poll ? (
        <p className="mt-2 text-sm text-slate-600">
          Only verified members can suggest items. A suggestion appears on the poll only after the organisers approve it.
        </p>
      ) : (
        memberMode && (
          <p className="mt-2 text-sm text-slate-600">
            Only verified members can nominate. Each nominee needs {e.minNominators}&ndash;{e.maxNominators} verified nominators
            before the organisers ask them for consent.
          </p>
        )
      )}
      {e.nominationInstructions && (
        <p className="mt-4 whitespace-pre-line rounded-lg bg-indigo-50 p-3 text-sm text-indigo-950">{e.nominationInstructions}</p>
      )}
      {poll ? (
        <PollSuggestionFlow
          electionId={e.id}
          closesAt={e.nominationsCloseAt ? e.nominationsCloseAt.toISOString() : null}
          initialEmail={verifiedEmail}
        />
      ) : memberMode ? (
        <MemberNominationFlow
          electionId={e.id}
          positions={e.nominationPositions}
          minNominators={e.minNominators}
          maxNominators={e.maxNominators}
          closesAt={e.nominationsCloseAt ? e.nominationsCloseAt.toISOString() : null}
          initialEmail={verifiedEmail}
        />
      ) : (
        <NominationForm
          electionId={e.id}
          positions={e.nominationPositions}
          requireEvidence={e.requirePurchaseEvidence}
          closesAt={e.nominationsCloseAt ? e.nominationsCloseAt.toISOString() : null}
        />
      )}
    </main>
  );
}
