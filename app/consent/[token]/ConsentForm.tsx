'use client';

import { useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';

type Up = { url: string; path: string } | null;

export function ConsentForm({ token, electionId }: { token: string; electionId: string }) {
  const [photo, setPhoto] = useState<Up>(null);
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function respond(action: 'accept' | 'decline') {
    setError(null);
    if (action === 'accept' && !photo) {
      setError('Please upload your photo before accepting.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/consent/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'accept'
            ? { action, photoUrl: photo!.url, photoPath: photo!.path, bio: bio.trim() || undefined }
            : { action },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not record your response. Please try again.');
        return;
      }
      setDone(action === 'accept' ? 'accepted' : 'declined');
    } catch {
      setError('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card mt-6 text-center sm:p-8" role="status">
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
            done === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {done === 'accepted' ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <span aria-hidden="true" className="text-lg font-bold">×</span>
          )}
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">
          {done === 'accepted' ? 'Consent received' : 'Nomination declined'}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {done === 'accepted'
            ? 'Thank you. The election organisers will add you to the ballot when it opens.'
            : 'You will not appear on the ballot. The organisers have been notified.'}
        </p>
      </div>
    );
  }

  return (
    <form
      className="card mt-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void respond('accept');
      }}
    >
      <ImageUploader
        kind="nomination-photo"
        electionId={electionId}
        consentToken={token}
        label="Your photo"
        required
        hint="A clear head-and-shoulders photo shown on the ballot. JPEG, PNG or WebP."
        urlName="photoUrl"
        pathName="photoPath"
        onChange={setPhoto}
      />

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="bio" className="label">Short bio (optional)</label>
          <span className="text-xs text-slate-500 tabular-nums">{bio.length} / 1,500</span>
        </div>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={1500}
          className="input"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <p className="hint">Shown to voters on the ballot if you are approved.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={busy || !photo}>
        {busy ? 'Submitting…' : 'Accept nomination'}
      </button>

      {confirming ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5">
          <p className="text-sm text-red-900">Decline this nomination? You will not appear on the ballot.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void respond('decline')} disabled={busy}>
              Yes, decline
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary w-full" onClick={() => setConfirming(true)} disabled={busy}>
          Decline nomination
        </button>
      )}
    </form>
  );
}
