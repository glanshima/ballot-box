import type { ElectionResults } from '@/lib/results';
import { OptionAvatar } from './OptionAvatar';

/** Table + CSS bar chart per position. Server component, used by the admin tab and the public page. */
export function ResultsView({ results }: { results: ElectionResults }) {
  const { turnout, positions } = results;
  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-sm font-medium text-slate-700">Turnout</h2>
        <p className="text-2xl font-bold">
          {turnout.voted} / {turnout.total} <span className="text-base font-normal text-slate-700">({turnout.percent}%)</span>
        </p>
      </div>

      {positions.map((p) => (
        <section key={p.position ?? 'poll'} className="card" aria-labelledby={`pos-${p.position ?? 'poll'}`}>
          <h2 id={`pos-${p.position ?? 'poll'}`} className="mb-3 text-lg font-semibold">{p.position ?? 'Results'}</h2>
          {p.tie && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Tie: more than one option has the highest number of votes. No single winner is declared.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">{p.position ?? 'Results'} vote counts</caption>
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th scope="col" className="py-2 pr-2 font-medium">Option</th>
                  <th scope="col" className="py-2 pr-2 text-right font-medium">Votes</th>
                  <th scope="col" className="py-2 pr-2 text-right font-medium">%</th>
                  <th scope="col" className="w-1/3 py-2 font-medium"><span className="sr-only">Share</span></th>
                </tr>
              </thead>
              <tbody>
                {p.options.map((o) => (
                  <tr key={o.optionId} className={`border-b border-slate-100 ${o.isWinner ? 'bg-green-50' : ''}`}>
                    <th scope="row" className="py-2 pr-2 font-medium">
                      <span className="flex items-center gap-3">
                        {o.imageUrl && <OptionAvatar label={o.label} imageUrl={o.imageUrl} size="sm" />}
                        <span>
                          {o.label}
                          {o.isWinner && <span className="ml-2 badge bg-green-700 text-white">Winner</span>}
                        </span>
                      </span>
                    </th>
                    <td className="py-2 pr-2 text-right tabular-nums">{o.votes}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{o.percent}%</td>
                    <td className="py-2">
                      <div className="h-3 rounded bg-slate-100" role="img" aria-label={`${o.percent} percent`}>
                        <div className={`h-3 rounded ${o.isWinner ? 'bg-green-700' : 'bg-indigo-600'}`} style={{ width: `${o.percent}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="text-slate-700">
                  <th scope="row" className="py-2 pr-2 font-medium">Abstained</th>
                  <td className="py-2 pr-2 text-right tabular-nums">{p.abstentions}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{p.totalBallots ? Math.round((p.abstentions / p.totalBallots) * 1000) / 10 : 0}%</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint">Percentages are of all ballots cast for this position, including abstentions.</p>
        </section>
      ))}
    </div>
  );
}
