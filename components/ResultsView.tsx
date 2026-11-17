import type { ElectionResults } from '@/lib/results';
import { OptionAvatar } from './OptionAvatar';

/** Responsive summary + bar breakdown per position. Server component used by admin and public views. */
export function ResultsView({ results }: { results: ElectionResults }) {
  const { turnout, positions } = results;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Turnout rate</p>
          <p className="mt-1 text-3xl font-bold text-indigo-700 tabular-nums">{turnout.percent}%</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ballots cast</p>
          <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{turnout.voted}</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Eligible voters</p>
          <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{turnout.total}</p>
        </div>
      </div>

      {positions.map((p, idx) => {
        const abstainPercent = p.totalBallots ? Math.round((p.abstentions / p.totalBallots) * 1000) / 10 : 0;
        return (
          <section key={p.position ?? 'poll'} className="card" aria-labelledby={`results-position-${idx}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id={`results-position-${idx}`} className="text-lg font-bold text-slate-900">
                {p.position ?? 'Results'}
              </h2>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {p.totalBallots} total {p.totalBallots === 1 ? 'ballot' : 'ballots'}
              </span>
            </div>

            {p.tie && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950">
                <strong className="font-semibold">Tie:</strong> More than one option has the highest number of votes. No single winner is declared.
              </p>
            )}

            <ul className="space-y-3">
              {p.options.map((o) => (
                <li
                  key={o.optionId}
                  className={`rounded-xl border p-3.5 ${
                    o.isWinner ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {o.imageUrl && <OptionAvatar label={o.label} imageUrl={o.imageUrl} size="sm" />}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-slate-900">{o.label}</span>
                          {o.isWinner && (
                            <span className="badge bg-emerald-700 text-white">Winner</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <span className="text-base font-bold text-slate-900">{o.percent}%</span>
                      <span className="ml-1.5 text-xs text-slate-600">({o.votes})</span>
                    </div>
                  </div>

                  <div
                    className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                    role="img"
                    aria-label={`${o.label}: ${o.percent} percent (${o.votes} votes)`}
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
                        o.isWinner ? 'bg-emerald-700' : 'bg-indigo-700'
                      }`}
                      style={{ width: `${o.percent}%` }}
                    />
                  </div>
                </li>
              ))}

              <li className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-600">
                <span className="font-medium">Abstained</span>
                <span className="tabular-nums">
                  <strong className="font-semibold text-slate-800">{abstainPercent}%</strong> ({p.abstentions})
                </span>
              </li>
            </ul>

            <p className="hint mt-3">Percentages are calculated out of all ballots cast for this position, including abstentions.</p>
          </section>
        );
      })}
    </div>
  );
}
