'use client';

import { useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';
import { LocalTime } from '@/components/LocalTime';

type Step = 'email' | 'code' | 'form';

export function PollSuggestionFlow({
  electionId,
  closesAt,
  initialEmail,
}: {
  electionId: string;
  closesAt: string | null;
  initialEmail: string | null;
}) {
  const [step, setStep] = useState<Step>(initialEmail ? 'form' : 'email');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [memberEmail, setMemberEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<{ url: string; path: string } | null>(null);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/nominations/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ electionId, email }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not send the code. Please try again.');
        return;
      }
      setCode('');
      setMemberEmail(null);
      setStep('code');
      setNotice(`If ${email.trim()} is on the member roll, a 6-digit code has been sent to it.`);
    } catch {
      setError('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/nominations/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ electionId, email, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Invalid or expired code.');
        return;
      }
      setMemberEmail(email.trim());
      setNotice(null);
      setStep('form');
    } catch {
      setError('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    const description = String(fd.get('description') ?? '').trim();

    setBusy(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          electionId,
          title,
          ...(description ? { description } : {}),
          ...(image ? { imageUrl: image.url, imagePath: image.path } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 401) {
        setMemberEmail(null);
        setStep('email');
        setError(data.error ?? 'Your verification expired. Please verify your email again.');
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not send the suggestion. Please try again.');
        return;
      }
      setDone(title);
    } catch {
      setError('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function suggestAnother() {
    setDone(null);
    setImage(null);
    setUploaderKey((k) => k + 1);
    setError(null);
  }

  if (done) {
    return (
      <div className="card mt-6 text-center sm:p-8" role="status">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Suggestion sent</h2>
        <p className="mt-2 text-sm text-slate-600">
          The organisers will review &ldquo;{done}&rdquo;. Approved suggestions appear as options on the poll.
        </p>
        <button type="button" className="btn btn-secondary mt-5" onClick={suggestAnother}>
          Suggest another item
        </button>
      </div>
    );
  }

  if (step === 'email' || step === 'code') {
    return (
      <div className="card mt-6 space-y-5">
        <div>
          <p className="text-sm text-slate-600">Step {step === 'email' ? 1 : 2} of 2</p>
          <h2 className="text-lg font-semibold text-slate-900">
            {step === 'email' ? 'Verify your membership' : 'Enter your code'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {step === 'email'
              ? 'Enter the email address on the member roll. We will send a 6-digit code to it.'
              : `We sent a code to ${email.trim()}. It expires in 10 minutes.`}
          </p>
        </div>

        {notice && step === 'code' && (
          <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
            {notice}
          </p>
        )}

        {step === 'email' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void requestCode();
            }}
          >
            <div>
              <label htmlFor="memberEmail" className="label">Member email *</label>
              <input
                id="memberEmail"
                name="memberEmail"
                type="email"
                className="input"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={verifyCode}>
            <div>
              <label htmlFor="otpCode" className="label">6-digit code *</label>
              <input
                id="otpCode"
                name="otpCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                className="input tracking-[0.5em]"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Verify and continue'}
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="text-sm font-semibold text-indigo-800 underline"
                onClick={() => {
                  setError(null);
                  setNotice(null);
                  setStep('email');
                }}
              >
                Use a different email
              </button>
              <button type="button" className="text-sm text-slate-700 underline" onClick={() => void requestCode()} disabled={busy}>
                Send a new code
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mt-6 space-y-5">
      {closesAt && (
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-medium">Suggestions close</span>
          <span className="font-semibold text-slate-900"><LocalTime iso={closesAt} /></span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Verified member: <span className="font-semibold text-slate-900">{memberEmail}</span></p>
        <button
          type="button"
          className="text-sm text-slate-700 underline"
          onClick={() => {
            setMemberEmail(null);
            setStep('email');
            setError(null);
          }}
        >
          Change
        </button>
      </div>

      <div>
        <label htmlFor="title" className="label">Item title *</label>
        <input id="title" name="title" className="input" required minLength={2} maxLength={200} autoComplete="off" />
        <p className="hint">Keep it short: this is what voters will see on the ballot if it is approved.</p>
      </div>

      <div>
        <label htmlFor="description" className="label">Description (optional)</label>
        <textarea id="description" name="description" rows={3} maxLength={1000} className="input" />
      </div>

      <ImageUploader
        key={uploaderKey}
        kind="suggestion"
        electionId={electionId}
        label="Image (optional)"
        hint="JPEG, PNG or WebP, up to 2 MB. Compressed in your browser."
        onChange={(v) => setImage(v)}
      />

      <p className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-700">
        Your verified member email is recorded with the suggestion so organisers can see that it came from a member. It is
        never shown on the ballot. Suggestions stay private to the organisers until they are approved.
      </p>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? 'Sending…' : 'Send suggestion'}
      </button>
    </form>
  );
}
