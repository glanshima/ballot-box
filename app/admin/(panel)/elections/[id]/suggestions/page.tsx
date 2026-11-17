import { desc, eq } from 'drizzle-orm';
import Image from 'next/image';
import { ActionForm } from '@/components/ActionForm';
import { CopyButton } from '@/components/CopyButton';
import { LocalTime } from '@/components/LocalTime';
import { StatusBadge } from '@/components/StatusBadge';
import { approveSuggestion, rejectSuggestion } from '@/lib/actions/suggestions';
import { requireElectionPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { optionSuggestions, type OptionSuggestion } from '@/lib/db/schema';
import { appUrl } from '@/lib/env';
import { countsTowardCap, type SuggestionStatus } from '@/lib/suggestions';

export const metadata = { title: 'Suggestions' };

const ORDER: Record<SuggestionStatus, number> = { pending: 0, approved: 1, rejected: 2 };

function SuggestionCard({ electionId, suggestion, draft }: { electionId: string; suggestion: OptionSuggestion; draft: boolean }) {
  const s = suggestion;
  return (
    <article className="card">
      <div className="flex gap-4">
        {s.imageUrl && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <Image src={s.imageUrl} alt={s.title} fill sizes="80px" className="object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">{s.title}</h2>
            <StatusBadge value={s.status} />
          </div>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Suggested <LocalTime iso={s.createdAt.toISOString()} />
          </p>
          {s.description && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{s.description}</p>
          )}
        </div>
      </div>

      {s.reviewNote && (
        <p className="mt-2 text-xs text-slate-600">
          <strong className="font-semibold">Review note:</strong> {s.reviewNote}
        </p>
      )}

      {s.status === 'approved' && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-sm text-emerald-900">
          Added to the poll. You can edit it on the Options tab until the election is launched.
        </p>
      )}

      {draft && s.status === 'pending' && (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-start">
          <ActionForm
            action={approveSuggestion.bind(null, electionId, s.id)}
            submitLabel="Approve → add as option"
            confirm="Approve this suggestion and add it to the poll?"
          />
          <ActionForm
            action={rejectSuggestion.bind(null, electionId, s.id)}
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
        </div>
      )}
    </article>
  );
}

export default async function SuggestionsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { election } = await requireElectionPage(id);
  const draft = election.status === 'draft';
  const suggestUrl = `${appUrl()}/nominate/${id}`;

  const rows = await getDb()
    .select()
    .from(optionSuggestions)
    .where(eq(optionSuggestions.electionId, id))
    .orderBy(desc(optionSuggestions.createdAt));
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.createdAt.getTime() - a.createdAt.getTime());
  const used = rows.filter((s) => countsTowardCap(s.status)).length;

  return (
    <div className="space-y-4">
      {election.nominationsEnabled ? (
        <div className="card flex flex-wrap items-center justify-between gap-2 !py-3">
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-semibold text-slate-500">Public suggestion URL: </span>
            <span className="break-all font-medium text-slate-800">{suggestUrl}</span>
          </div>
          <CopyButton value={suggestUrl} label="Copy link" />
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Suggestions are switched off. Enable nominations on the Details tab.
        </p>
      )}

      {!draft && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Suggestions can only be reviewed while the election is a draft.
        </p>
      )}

      <p className="text-sm text-slate-600">
        {used} of {election.maxOptionSuggestions} suggestions in use. Rejected suggestions do not count toward the limit.
      </p>

      {rows.length === 0 ? (
        <div className="card border-dashed py-10 text-center text-sm text-slate-600">
          No suggestions yet. Share the suggestion link with members.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <SuggestionCard key={s.id} electionId={id} suggestion={s} draft={draft} />
          ))}
        </div>
      )}
    </div>
  );
}
