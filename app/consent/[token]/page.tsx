import { and, eq, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db/client';
import { elections, nominees } from '@/lib/db/schema';
import { checkLimit, getClientIp } from '@/lib/ratelimit';
import { hashToken, TOKEN_REGEX } from '@/lib/tokens';
import { ConsentForm } from './ConsentForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Nomination consent', robots: { index: false, follow: false } };

function Notice({ title, body, tone = 'neutral' }: { title: string; body: string; tone?: 'neutral' | 'done' }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="card text-center" role="status">
        {tone === 'done' && (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
        )}
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        <p className="mt-2 text-slate-700">{body}</p>
      </div>
    </main>
  );
}

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_REGEX.test(token)) {
    return <Notice title="Link not valid" body="This consent link is not valid. Please check that you copied the whole link." />;
  }
  if (!(await checkLimit('tokenPage', getClientIp(await headers())))) {
    return <Notice title="Please wait" body="Too many requests. Try again in a minute." />;
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: nominees.id,
      fullName: nominees.fullName,
      position: nominees.position,
      status: nominees.status,
      expiresAt: nominees.consentExpiresAt,
      now: sql<string>`now()`,
      electionId: elections.id,
      electionTitle: elections.title,
      electionStatus: elections.status,
      nominationMode: elections.nominationMode,
    })
    .from(nominees)
    .innerJoin(elections, eq(nominees.electionId, elections.id))
    .where(eq(nominees.consentTokenHash, hashToken(token)))
    .limit(1);

  if (!row) {
    return <Notice title="Link not valid" body="This consent link is not valid or has already been replaced by a newer one." />;
  }

  const now = new Date(row.now);
  if (row.status === 'consent_sent' && (!row.expiresAt || row.expiresAt <= now)) {
    await db
      .update(nominees)
      .set({ status: 'expired' })
      .where(and(eq(nominees.id, row.id), eq(nominees.status, 'consent_sent')));
    await logAudit({ actor: 'nominee', action: 'nominee.consent_expired', electionId: row.electionId, meta: { nomineeId: row.id } });
    return (
      <Notice
        title="Link expired"
        body="This consent link has expired, so this nomination cannot go on the ballot. Contact the election organiser if you still want to stand."
      />
    );
  }

  if (row.status === 'accepted') {
    return <Notice tone="done" title="Consent already given" body={`You have accepted the nomination for ${row.electionTitle}. The organisers will add you to the ballot when it opens.`} />;
  }
  if (row.status === 'declined') {
    return <Notice title="Nomination declined" body={`You declined the nomination for ${row.electionTitle}. You will not appear on the ballot.`} />;
  }
  if (row.status === 'expired') {
    return <Notice title="Link expired" body="This consent link has expired, so this nomination cannot go on the ballot." />;
  }
  if (row.status !== 'consent_sent' || row.electionStatus !== 'draft' || row.nominationMode !== 'member') {
    return <Notice title="Consent closed" body="This consent request is no longer active." />;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">Consent to nomination</h1>
      <p className="mt-1 text-slate-700">{row.electionTitle}</p>
      <p className="mt-1 text-sm text-slate-600">
        You are listed as <span className="font-semibold text-slate-900">{row.fullName}</span>
        {row.position ? <> for <span className="font-semibold text-slate-900">{row.position}</span></> : null}.
      </p>
      <p className="mt-3 text-sm text-slate-700">
        To appear on the ballot, add a photo and confirm you agree to stand. Your email address and the nominators&rsquo;
        details are never shown on the ballot.
      </p>
      <ConsentForm token={token} electionId={row.electionId} />
    </main>
  );
}
