'use client';

import { useState } from 'react';
import { OptionAvatar } from '@/components/OptionAvatar';

type Opt = { id: string; label: string; description: string | null; imageUrl: string | null };
type Group = { position: string | null; options: Opt[] };

const ABSTAIN = 'abstain';
const STEPS = ['Select', 'Review', 'Done'];

const ERRORS: Record<string, string> = {
  voted: 'This voting link has already been used.',
  expired: 'This voting link has expired.',
  closed: 'Voting has closed.',
  not_open: 'Voting has not opened yet.',
  invalid: 'This voting link is not valid.',
  invalid_choice: 'Your selection could not be accepted. Please review it and try again.',
};

export function BallotForm({ token, title, description, groups }: { token: string; title: string; description: string | null; groups: Group[] }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const keyOf = (g: Group) => g.position ?? '';
  const complete = groups.every((g) => picked[keyOf(g)]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          token,
          choices: groups.map((g) => ({
            position: g.position,
            optionId: picked[keyOf(g)] === ABSTAIN ? null : picked[keyOf(g)],
          })),
        }),
      });
      if (res.ok) {
        setStep(2);
        return;
      }
      if (res.status === 429) setError('Too many attempts. Please wait a minute and try again.');
      else {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setError(ERRORS[data.code ?? ''] ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network problem. Your vote has NOT been recorded yet; please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={`flex items-center gap-2 ${i === step ? 'font-semibold text-indigo-800' : 'text-slate-600'}`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${i <= step ? 'bg-indigo-700 text-white' : 'bg-slate-200'}`}>{i + 1}</span>
            {s}
            {i < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 text-slate-400">›</span>}
          </li>
        ))}
      </ol>

      {step === 2 ? (
        <div className="card text-center" role="status">
          <h1 className="text-2xl font-bold">Vote recorded</h1>
          <p className="mt-2 text-slate-700">Thank you. Your vote has been counted. For your privacy no receipt is issued and your choices cannot be traced back to you. You can close this page.</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="mt-2 whitespace-pre-line text-slate-700">{description}</p>}

          {step === 0 && (
            <form className="mt-6 space-y-6" onSubmit={(e) => { e.preventDefault(); if (complete) setStep(1); }}>
              {groups.map((g) => (
                <fieldset key={keyOf(g)} className="card">
                  <legend className="px-1 text-lg font-semibold">{g.position ?? 'Choose one option'}</legend>
                  <div className="mt-2 space-y-3">
                    {g.options.map((o) => (
                      <label key={o.id} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${picked[keyOf(g)] === o.id ? 'border-indigo-700 bg-indigo-50' : 'border-slate-200'}`}>
                        <input type="radio" name={`g-${keyOf(g)}`} value={o.id} checked={picked[keyOf(g)] === o.id} onChange={() => setPicked({ ...picked, [keyOf(g)]: o.id })} className="h-5 w-5 shrink-0 accent-indigo-700" />
                        <OptionAvatar label={o.label} imageUrl={o.imageUrl} />
                        <span className="min-w-0">
                          <span className="block font-medium">{o.label}</span>
                          {o.description && <span className="block text-sm text-slate-700">{o.description}</span>}
                        </span>
                      </label>
                    ))}
                    <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${picked[keyOf(g)] === ABSTAIN ? 'border-indigo-700 bg-indigo-50' : 'border-dashed border-slate-300'}`}>
                      <input type="radio" name={`g-${keyOf(g)}`} value={ABSTAIN} checked={picked[keyOf(g)] === ABSTAIN} onChange={() => setPicked({ ...picked, [keyOf(g)]: ABSTAIN })} className="h-5 w-5 shrink-0 accent-indigo-700" />
                      <span className="font-medium text-slate-800">Abstain</span>
                    </label>
                  </div>
                </fieldset>
              ))}
              <button type="submit" disabled={!complete} className="btn btn-primary w-full">Review my choices</button>
              {!complete && <p className="hint text-center">Choose an option (or abstain) in every section to continue.</p>}
            </form>
          )}

          {step === 1 && (
            <div className="mt-6 space-y-4">
              <h2 className="text-lg font-semibold">Please confirm your vote</h2>
              <p className="text-sm text-slate-700">Once submitted, a vote cannot be changed.</p>
              <ul className="space-y-3">
                {groups.map((g) => {
                  const sel = picked[keyOf(g)];
                  const opt = g.options.find((o) => o.id === sel);
                  return (
                    <li key={keyOf(g)} className="card flex items-center gap-3">
                      {opt ? <OptionAvatar label={opt.label} imageUrl={opt.imageUrl} size="sm" /> : null}
                      <div>
                        <p className="text-sm text-slate-700">{g.position ?? 'Your choice'}</p>
                        <p className="font-semibold">{opt ? opt.label : 'Abstain'}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" className="btn btn-secondary flex-1" disabled={busy} onClick={() => setStep(0)}>Back</button>
                <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit my vote'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
