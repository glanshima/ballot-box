'use client';

import { useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';
import { LocalTime } from '@/components/LocalTime';

type Up = { url: string; path: string } | null;

export function NominationForm({
  electionId,
  positions,
  requireEvidence,
  closesAt,
}: {
  electionId: string;
  positions: string[];
  requireEvidence: boolean;
  closesAt: string | null;
}) {
  const [photo, setPhoto] = useState<Up>(null);
  const [receipt, setReceipt] = useState<Up>(null);
  const [manifestoLen, setManifestoLen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!photo) return setError('Please upload your photo.');
    if (requireEvidence && !receipt) return setError('Please upload evidence of form purchase.');
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return v === '' ? undefined : v;
    };
    setBusy(true);
    try {
      const res = await fetch('/api/nominations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          electionId,
          fullName: s('fullName'),
          email: s('email'),
          phone: s('phone'),
          position: s('position'),
          manifesto: s('manifesto'),
          receiptReference: s('receiptReference'),
          photoUrl: photo.url,
          photoPath: photo.path,
          receiptUrl: receipt?.url,
          receiptPath: receipt?.path,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) setDone(true);
      else setError(data.error ?? 'Could not submit your nomination. Please try again.');
    } catch {
      setError('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card mt-6 text-center sm:p-8" role="status">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Nomination received</h2>
        <p className="mt-2 text-sm text-slate-600">
          Thank you. The election organisers will review your submission and notify you once approved.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mt-6 space-y-5">
      {closesAt && (
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-medium">Nominations close</span>
          <span className="font-semibold text-slate-900"><LocalTime iso={closesAt} /></span>
        </div>
      )}

      <div>
        <label htmlFor="fullName" className="label">Full name *</label>
        <input id="fullName" name="fullName" className="input" required maxLength={200} autoComplete="name" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="label">Email *</label>
          <input id="email" name="email" type="email" className="input" required maxLength={254} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="phone" className="label">Phone</label>
          <input id="phone" name="phone" type="tel" className="input" maxLength={40} autoComplete="tel" />
        </div>
      </div>

      {positions.length > 0 && (
        <div>
          <label htmlFor="position" className="label">Position *</label>
          <select id="position" name="position" className="input" required defaultValue="">
            <option value="" disabled>Select a position</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="manifesto" className="label">Short bio / manifesto</label>
          <span className="text-xs text-slate-500 tabular-nums">{manifestoLen} / 1,500</span>
        </div>
        <textarea
          id="manifesto"
          name="manifesto"
          rows={4}
          maxLength={1500}
          className="input"
          onChange={(e) => setManifestoLen(e.target.value.length)}
        />
        <p className="hint">Shown to voters on the ballot if your nomination is approved.</p>
      </div>

      <ImageUploader
        kind="nomination-photo"
        electionId={electionId}
        label="Your photo"
        required
        hint="A clear head-and-shoulders photo. JPEG, PNG or WebP."
        urlName="photoUrl"
        pathName="photoPath"
        onChange={setPhoto}
      />

      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <legend className="px-1.5 text-sm font-semibold text-slate-800">
          Evidence of nomination-form purchase{requireEvidence ? ' *' : ' (optional)'}
        </legend>
        <div>
          <label htmlFor="receiptReference" className="label">Receipt / reference number</label>
          <input id="receiptReference" name="receiptReference" className="input" maxLength={100} />
        </div>
        <ImageUploader
          kind="nomination-receipt"
          electionId={electionId}
          label="Receipt or proof of payment"
          required={requireEvidence}
          hint="Photo or PDF, up to 2 MB."
          urlName="receiptUrl"
          pathName="receiptPath"
          onChange={setReceipt}
        />
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit nomination'}
      </button>
    </form>
  );
}
