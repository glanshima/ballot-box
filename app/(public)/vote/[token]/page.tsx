import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { checkLimit, getClientIp } from '@/lib/ratelimit';
import { groupOptions, lookupVoter } from '@/lib/voting';
import { BallotForm } from './BallotForm';

export const dynamic = 'force-dynamic'; // never cached: the URL contains a secret
export const metadata: Metadata = { title: 'Vote', robots: { index: false, follow: false } };

// Messages are deliberately generic: they never reveal whether an email address is on a voter list.
const MESSAGES = {
  invalid: ['Link not valid', 'This voting link is not valid. Please check you copied the whole link from your email.'],
  expired: ['Link expired', 'This voting link has expired. Contact your election organiser if you think this is a mistake.'],
  not_open: ['Voting has not opened yet', 'Please come back when voting opens.'],
  closed: ['Voting has closed', 'This election is no longer accepting votes.'],
  voted: ['Already voted', 'A vote has already been recorded with this link. Each link can be used once.'],
  limited: ['Please wait', 'Too many requests. Try again in a minute.'],
} as const;

function Notice({ kind }: { kind: keyof typeof MESSAGES }) {
  const [title, body] = MESSAGES[kind];
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="card text-center" role="alert">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-slate-700">{body}</p>
      </div>
    </main>
  );
}

export default async function VotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(await headers());
  if (!(await checkLimit('tokenPage', ip))) return <Notice kind="limited" />;

  const state = await lookupVoter(token);
  if (state.status !== 'ok') return <Notice kind={state.status} />;

  const groups = groupOptions(state.options).map((g) => ({
    position: g.position,
    options: g.options.map((o) => ({ id: o.id, label: o.label, description: o.description, imageUrl: o.imageUrl })),
  }));
  return <BallotForm token={token} title={state.election.title} description={state.election.description} groups={groups} />;
}
