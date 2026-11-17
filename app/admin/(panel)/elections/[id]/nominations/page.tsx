import { asc, count, desc, eq, sql } from 'drizzle-orm';
import Image from 'next/image';
import { ActionForm } from '@/components/ActionForm';
import { CopyButton } from '@/components/CopyButton';
import { LocalTime } from '@/components/LocalTime';
import { StatusBadge } from '@/components/StatusBadge';
import { purgeNominationAttachments } from '@/lib/actions/attachments';
import { approveNominee, rejectNominee, sendConsent, sendConsentBulk } from '@/lib/actions/consent';
import { approveNomination, rejectNomination } from '@/lib/actions/nominations';
import { isSuper, requireElectionPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { nominationAttachments, nominations, nominees, nominators, type Election, type Nominee } from '@/lib/db/schema';
import { appUrl } from '@/lib/env';
import {
  canApproveConsent,
  canRejectNominee,
  canSendConsent,
  CONSENT_BATCH_SIZE,
} from '@/lib/nominations/consent';

export const metadata = { title: 'Nominations' };

type MemberRow = { nominee: Nominee; nominatorCount: number };

const STATUS_COPY: Record<string, string> = {
  collecting: 'Waiting for more verified nominators.',
  ready: 'Enough nominators. Send the consent link.',
  consent_sent: 'Consent link sent to the nominee.',
  accepted: 'The nominee consented. Review and approve them onto the ballot.',
  declined: 'The nominee declined and stays off the ballot.',
  expired: 'The consent link expired. You can send a new one.',
  approved: 'Added to the ballot as a candidate option.',
  rejected: 'Rejected by an organiser.',
};

function ExportPdfCard({ electionId }: { electionId: string }) {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 !py-3">
      <div className="min-w-0 flex-1 text-xs">
        <span className="font-semibold text-slate-500">Nominations PDF: </span>
        <span className="font-medium text-slate-800">
          Includes private proofs of membership and signatures. Store the download confidentially.
        </span>
      </div>
      <a className="btn btn-secondary btn-sm" href={`/api/admin/elections/${electionId}/nominations-pdf`}>
        Download PDF
      </a>
    </div>
  );
}

function groupByPosition(rows: MemberRow[], positions: string[]) {
  const map = new Map<string | null, MemberRow[]>();
  for (const row of rows) {
    const key = row.nominee.position;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  const order: (string | null)[] = [
    ...positions.filter((p) => map.has(p)),
    ...[...map.keys()].filter((k): k is string => k !== null && !positions.includes(k)),
    ...(map.has(null) ? [null] : []),
  ];
  return order.map((position) => ({ position, rows: map.get(position)! }));
}

function MemberNominations({
  election,
  rows,
  draft,
  canPurge,
  attachmentCount,
}: {
  election: Election;
  rows: MemberRow[];
  draft: boolean;
  canPurge: boolean;
  attachmentCount: number;
}) {
  const nominateUrl = `${appUrl()}/nominate/${election.id}`;
  const ready = rows.filter((r) => r.nominee.status === 'ready');
  const groups = groupByPosition(rows, election.nominationPositions);

  return (
    <div className="space-y-4">
      <ExportPdfCard electionId={election.id} />
      {election.nominationsEnabled ? (
        <div className="card flex flex-wrap items-center justify-between gap-2 !py-3">
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-semibold text-slate-500">Member nomination URL: </span>
            <span className="break-all font-medium text-slate-800">{nominateUrl}</span>
          </div>
          <CopyButton value={nominateUrl} label="Copy link" />
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The nomination form is switched off. Enable it on the Details tab.
        </p>
      )}

      {!draft && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Nominations are frozen now that the election has left the draft stage.
        </p>
      )}

      {draft && ready.length > 0 && (
        <div className="card !py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">Ready for consent</h2>
              <p className="text-sm text-slate-600">
                {ready.length} nominee{ready.length === 1 ? '' : 's'} reached the minimum of {election.minNominators} nominators.
              </p>
            </div>
            <ActionForm
              action={sendConsentBulk.bind(null, election.id)}
              submitLabel={`Send consent to all ready (${ready.length})`}
            />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card border-dashed py-10 text-center text-sm text-slate-600">
          {election.nominationsEnabled
            ? 'No member nominations yet. Share the nomination link with members.'
            : 'No member nominations yet.'}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.position ?? 'none'} className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">
              {group.position ?? 'No position set'}{' '}
              <span className="text-sm font-medium text-slate-500">({group.rows.length})</span>
            </h2>
            {group.rows.map(({ nominee: n, nominatorCount }) => {
              const count = Number(nominatorCount);
              const pct = Math.min(100, Math.round((count / Math.max(1, election.minNominators)) * 100));
              return (
                <article key={n.id} className="card">
                  <div className="flex gap-4">
                    {n.photoUrl && (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        <Image src={n.photoUrl} alt={n.fullName} fill sizes="96px" className="object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{n.fullName}</h3>
                        <StatusBadge value={n.status} />
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        Added <LocalTime iso={n.createdAt.toISOString()} />
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-600">
                        {n.email}
                        {n.phone ? ` · ${n.phone}` : ''}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">{STATUS_COPY[n.status] ?? ''}</p>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                          <span>
                            {count} of {election.minNominators} required nominators
                          </span>
                          <span>max {election.maxNominators}</span>
                        </div>
                        <div
                          className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"
                          role="img"
                          aria-label={`${count} of ${election.minNominators} required nominators`}
                        >
                          <div className="h-full rounded-full bg-indigo-700" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      {n.status === 'consent_sent' && n.consentExpiresAt && (
                        <p className="mt-2 text-xs text-slate-600">
                          Consent link expires <LocalTime iso={n.consentExpiresAt.toISOString()} />
                        </p>
                      )}
                    </div>
                  </div>

                  {n.bio && (
                    <p className="mt-3 whitespace-pre-line rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm leading-relaxed text-slate-700">
                      {n.bio}
                    </p>
                  )}

                  {n.reviewNote && (
                    <p className="mt-2 text-xs text-slate-600">
                      <strong className="font-semibold">Review note:</strong> {n.reviewNote}
                    </p>
                  )}

                  {draft && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-start">
                      {canSendConsent(n.status) && (
                        <ActionForm
                          action={sendConsent.bind(null, election.id, n.id)}
                          submitLabel={n.status === 'ready' ? 'Send consent link' : 'Send a new consent link'}
                          confirm={
                            n.status === 'ready'
                              ? undefined
                              : 'Send a new consent link? The previous consent link will stop working.'
                          }
                        />
                      )}
                      {canApproveConsent(n.status) && (
                        <ActionForm
                          action={approveNominee.bind(null, election.id, n.id)}
                          submitLabel="Approve → add as candidate"
                          confirm="Approve this nominee and add them as a candidate?"
                        />
                      )}
                      {canRejectNominee(n.status) && (
                        <ActionForm
                          action={rejectNominee.bind(null, election.id, n.id)}
                          className="flex flex-1 gap-2"
                          submitLabel="Reject"
                          submitClass="btn btn-secondary"
                        >
                          <input
                            name="note"
                            className="input"
                            placeholder="Rejection reason (optional)"
                            maxLength={500}
                            aria-label="Rejection reason"
                          />
                        </ActionForm>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))
      )}

      {canPurge && attachmentCount > 0 && (
        <section className="card border-red-200 bg-red-50/20">
          <h2 className="mb-2 font-bold text-red-800">Delete signatures and proofs</h2>
          <p className="mb-3 text-sm text-slate-700">
            Permanently removes the {attachmentCount} private attachment{attachmentCount === 1 ? '' : 's'} members
            submitted for this election. Nominee details, votes and results are not affected. Download the nominations
            PDF first if you need a copy; this cannot be undone.
          </p>
          <ActionForm
            action={purgeNominationAttachments.bind(null, election.id)}
            className="space-y-3"
            submitLabel="Delete all signatures and proofs"
            submitClass="btn btn-danger"
          >
            <label htmlFor="purgeConfirmTitle" className="label">Type the election title to confirm</label>
            <input id="purgeConfirmTitle" name="confirmTitle" className="input" autoComplete="off" />
          </ActionForm>
        </section>
      )}
    </div>
  );
}

export default async function NominationsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, election } = await requireElectionPage(id);
  const db = getDb();
  const draft = election.status === 'draft';

  if (election.nominationMode === 'member') {
    const rows = await db
      .select({
        nominee: nominees,
        nominatorCount: sql<number>`(select count(*)::int from ${nominators} where ${nominators.nomineeId} = ${nominees.id})`,
      })
      .from(nominees)
      .where(eq(nominees.electionId, id))
      .orderBy(asc(nominees.position), desc(nominees.createdAt));
    const [attachments] = await db
      .select({ n: count() })
      .from(nominationAttachments)
      .innerJoin(nominators, eq(nominationAttachments.nominatorId, nominators.id))
      .where(eq(nominators.electionId, id));
    return (
      <MemberNominations
        election={election}
        rows={rows}
        draft={draft}
        canPurge={isSuper(user)}
        attachmentCount={Number(attachments?.n ?? 0)}
      />
    );
  }

  const list = await db
    .select()
    .from(nominations)
    .where(eq(nominations.electionId, id))
    .orderBy(desc(nominations.createdAt));
  const nominateUrl = `${appUrl()}/nominate/${id}`;

  return (
    <div className="space-y-4">
      <ExportPdfCard electionId={election.id} />
      {election.nominationsEnabled ? (
        <div className="card flex flex-wrap items-center justify-between gap-2 !py-3">
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-semibold text-slate-500">Public nomination URL: </span>
            <span className="break-all font-medium text-slate-800">{nominateUrl}</span>
          </div>
          <CopyButton value={nominateUrl} label="Copy link" />
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The nomination form is switched off. Enable it on the Details tab.
        </p>
      )}

      {!draft && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Nominations can only be reviewed while the election is a draft.
        </p>
      )}

      {list.length === 0 ? (
        <div className="card border-dashed py-10 text-center text-sm text-slate-600">
          No nominations received yet.
        </div>
      ) : (
        list.map((n) => (
          <article key={n.id} className="card">
            <div className="flex gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <Image src={n.photoUrl} alt={n.fullName} fill sizes="96px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">{n.fullName}</h2>
                  <StatusBadge value={n.status} />
                </div>
                <p className="mt-0.5 text-xs font-medium text-indigo-800">
                  {n.position ?? 'No position'} · <span className="text-slate-500"><LocalTime iso={n.createdAt.toISOString()} /></span>
                </p>
                <p className="mt-1 break-all text-xs text-slate-600">
                  {n.email}{n.phone ? ` · ${n.phone}` : ''}
                </p>
              </div>
            </div>

            {n.manifesto && (
              <p className="mt-3 whitespace-pre-line rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm leading-relaxed text-slate-700">
                {n.manifesto}
              </p>
            )}

            <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50 px-3.5 py-2.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence of form purchase</p>
              {n.receiptUrl ? (
                <p className="mt-1">
                  <a href={n.receiptUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-indigo-700 underline hover:text-indigo-900">
                    Open receipt ↗
                  </a>
                  {n.receiptReference ? <span className="text-slate-600"> · Ref: {n.receiptReference}</span> : ''}
                </p>
              ) : (
                <p className="mt-1 text-slate-600">
                  {n.receiptReference ? `Ref: ${n.receiptReference} (no file)` : 'None provided'}
                  {election.requirePurchaseEvidence ? <span className="font-semibold text-red-700"> (required!)</span> : ''}
                </p>
              )}
            </div>

            {n.reviewNote && (
              <p className="mt-2 text-xs text-slate-600">
                <strong className="font-semibold">Review note:</strong> {n.reviewNote}
              </p>
            )}

            {draft && n.status !== 'approved' && (
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-start">
                <ActionForm action={approveNomination.bind(null, id, n.id)} submitLabel="Approve → add as candidate" />
                {n.status === 'pending' && (
                  <ActionForm
                    action={rejectNomination.bind(null, id, n.id)}
                    className="flex flex-1 gap-2"
                    submitLabel="Reject"
                    submitClass="btn btn-secondary"
                  >
                    <input
                      name="note"
                      className="input"
                      placeholder="Rejection reason (optional)"
                      maxLength={500}
                      aria-label="Rejection reason"
                    />
                  </ActionForm>
                )}
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
