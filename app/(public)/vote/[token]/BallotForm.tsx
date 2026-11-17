'use client';

import { useEffect, useRef, useState } from 'react';
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

export function BallotForm({
  token,
  title,
  description,
  groups,
}: {
  token: string;
  title: string;
  description: string | null;
  groups: Group[];
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manifestoModal, setManifestoModal] = useState<{ position: string | null; option: Opt } | null>(null);
  const manifestoCloseRef = useRef<HTMLButtonElement>(null);
  const manifestoOpenerRef = useRef<HTMLElement | null>(null);

  const keyOf = (g: Group) => g.position ?? '';
  const selectedCount = groups.filter((g) => Boolean(picked[keyOf(g)])).length;
  const complete = selectedCount === groups.length;

  useEffect(() => {
    if (!manifestoModal) return;
    manifestoOpenerRef.current = document.activeElement as HTMLElement | null;
    manifestoCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setManifestoModal(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      manifestoOpenerRef.current?.focus();
      manifestoOpenerRef.current = null;
    };
  }, [manifestoModal]);

  function goToStep(next: 0 | 1 | 2) {
    setStep(next);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

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
        goToStep(2);
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
    <div className="min-h-screen bg-slate-50 pb-28 sm:pb-12">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-700 text-white">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </span>
            <span className="text-sm font-bold text-slate-900">Ballot Box</span>
          </div>
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
            Single-use anonymous ballot
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 sm:pt-8">
        <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? 'step' : undefined}
              className={`flex items-center gap-2 ${i === step ? 'font-semibold text-indigo-800' : i < step ? 'font-medium text-slate-800' : 'text-slate-500'}`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${
                  i < step
                    ? 'bg-emerald-700 text-white'
                    : i === step
                    ? 'bg-indigo-700 text-white ring-4 ring-indigo-100'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </span>
              {s}
              {i < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 text-slate-300">›</span>}
            </li>
          ))}
        </ol>

        {step === 2 ? (
          <div className="card text-center sm:p-8" role="status">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Vote recorded</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              Thank you. Your vote has been counted. For your privacy no receipt is issued and your choices cannot be traced back to you. You can safely close this page.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
              {description && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{description}</p>}
            </div>

            {step === 0 && (
              <form
                id="ballot-select-form"
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (complete) goToStep(1);
                }}
              >
                {groups.map((g, idx) => {
                  const hasSelection = Boolean(picked[keyOf(g)]);
                  return (
                    <fieldset key={keyOf(g)} className="card">
                      <legend className="mb-3 flex w-full items-center justify-between gap-2">
                        <span className="text-lg font-bold text-slate-900">
                          {g.position ?? 'Choose one option'}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            hasSelection ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {hasSelection ? 'Selected' : `${idx + 1} of ${groups.length}`}
                        </span>
                      </legend>

                      <div className="space-y-3">
                        {g.options.map((o) => {
                          const isSelected = picked[keyOf(g)] === o.id;
                          const isLongBio = (o.description?.length ?? 0) > 140;
                          return (
                            <div
                              key={o.id}
                              className={`rounded-xl border-2 transition duration-150 ${
                                isSelected
                                  ? 'border-indigo-700 bg-indigo-50/70 shadow-sm'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <label className="flex min-h-16 cursor-pointer items-start gap-3.5 p-3.5">
                                <input
                                  type="radio"
                                  name={`g-${keyOf(g)}`}
                                  value={o.id}
                                  checked={isSelected}
                                  onChange={() => setPicked({ ...picked, [keyOf(g)]: o.id })}
                                  className="mt-1 h-5 w-5 shrink-0 accent-indigo-700"
                                />
                                <OptionAvatar label={o.label} imageUrl={o.imageUrl} />
                                <span className="min-w-0 flex-1">
                                  <span className="block font-semibold text-slate-900">{o.label}</span>
                                  {o.description && (
                                    <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-slate-600">
                                      {o.description}
                                    </span>
                                  )}
                                </span>
                              </label>
                              {isLongBio && (
                                <div className="border-t border-slate-200/70 px-3.5 py-2 pl-12">
                                  <button
                                    type="button"
                                    onClick={() => setManifestoModal({ position: g.position, option: o })}
                                    className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
                                  >
                                    Read full manifesto →
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <label
                          className={`flex min-h-14 cursor-pointer items-center gap-3.5 rounded-xl border-2 p-3.5 transition duration-150 ${
                            picked[keyOf(g)] === ABSTAIN
                              ? 'border-indigo-700 bg-indigo-50/70'
                              : 'border-dashed border-slate-300 bg-slate-50/50 hover:border-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`g-${keyOf(g)}`}
                            value={ABSTAIN}
                            checked={picked[keyOf(g)] === ABSTAIN}
                            onChange={() => setPicked({ ...picked, [keyOf(g)]: ABSTAIN })}
                            className="h-5 w-5 shrink-0 accent-indigo-700"
                          />
                          <span className="font-medium text-slate-700">Abstain (no preference)</span>
                        </label>
                      </div>
                    </fieldset>
                  );
                })}

                <div className="hidden sm:block">
                  <button type="submit" disabled={!complete} className="btn btn-primary w-full">
                    Review my choices ({selectedCount}/{groups.length})
                  </button>
                  {!complete && (
                    <p className="hint text-center">Choose an option (or abstain) in every section to continue.</p>
                  )}
                </div>
              </form>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <strong className="font-semibold">Final check:</strong> Once submitted, your vote is final and cannot be changed.
                </div>

                <ul className="space-y-3">
                  {groups.map((g) => {
                    const sel = picked[keyOf(g)];
                    const opt = g.options.find((o) => o.id === sel);
                    return (
                      <li key={keyOf(g)} className="card flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {opt ? <OptionAvatar label={opt.label} imageUrl={opt.imageUrl} size="sm" /> : null}
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {g.position ?? 'Your choice'}
                            </p>
                            <p className="mt-0.5 font-semibold text-slate-900">{opt ? opt.label : 'Abstain'}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => goToStep(0)}
                          className="text-xs font-semibold text-indigo-700 hover:underline"
                        >
                          Change
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                    {error}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button type="button" className="btn btn-secondary flex-1" disabled={busy} onClick={() => goToStep(0)}>
                    Back to ballot
                  </button>
                  <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={submit}>
                    {busy ? 'Recording vote…' : 'Submit my vote'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {step === 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:hidden">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-semibold text-slate-900">
                {selectedCount} of {groups.length} selected
              </p>
              <p className="text-slate-500">{complete ? 'Ready to review' : 'Select all sections'}</p>
            </div>
            <button
              type="submit"
              form="ballot-select-form"
              disabled={!complete}
              className="btn btn-primary shrink-0 px-5"
            >
              Review choices →
            </button>
          </div>
        </div>
      )}

      {manifestoModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manifesto-modal-title"
          onClick={() => setManifestoModal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <OptionAvatar label={manifestoModal.option.label} imageUrl={manifestoModal.option.imageUrl} />
                <div>
                  {manifestoModal.position && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      {manifestoModal.position}
                    </p>
                  )}
                  <h2 id="manifesto-modal-title" className="text-lg font-bold text-slate-900">
                    {manifestoModal.option.label}
                  </h2>
                </div>
              </div>
              <button
                ref={manifestoCloseRef}
                type="button"
                onClick={() => setManifestoModal(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-indigo-700"
                aria-label="Close manifesto"
              >
                ✕
              </button>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {manifestoModal.option.description}
            </p>
            <div className="mt-6 flex justify-end">
              <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={() => setManifestoModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
