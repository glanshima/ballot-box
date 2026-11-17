'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/SignaturePad';
import { LocalTime } from '@/components/LocalTime';
import {
  ATTACHMENT_MAX_BYTES,
  PROOF_TYPES,
  SIGNATURE_TYPES,
} from '@/lib/nominations/attachments';

type Step = 'email' | 'code' | 'form';
type Done = { count: number; min: number; max: number; ready: boolean };

function typeAndSizeError(file: File, allowed: readonly string[], label: string): string | null {
  if (!allowed.includes(file.type)) return `Please upload ${label}.`;
  if (file.size > ATTACHMENT_MAX_BYTES) return 'File is too large (maximum 2 MB).';
  return null;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/png';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function MemberNominationFlow({
  electionId,
  positions,
  minNominators,
  maxNominators,
  closesAt,
  initialEmail,
}: {
  electionId: string;
  positions: string[];
  minNominators: number;
  maxNominators: number;
  closesAt: string | null;
  initialEmail: string | null;
}) {
  const [step, setStep] = useState<Step>(initialEmail ? 'form' : 'email');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [memberEmail, setMemberEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [done, setDone] = useState<Done | null>(null);

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

    if (signatureData && dataUrlToBlob(signatureData).size > ATTACHMENT_MAX_BYTES) {
      return setError('The signature is too large. Please clear it and sign again.');
    }

    const fd = new FormData(e.currentTarget);
    fd.set('electionId', electionId);
    if (proof) fd.set('proof', proof, proof.name);
    if (signatureFile) fd.set('signature', signatureFile, signatureFile.name);
    else if (signatureData) fd.set('signature', dataUrlToBlob(signatureData), 'signature.png');

    setBusy(true);
    try {
      const res = await fetch('/api/nominations/member', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: string;
        count?: number;
        minNominators?: number;
        maxNominators?: number;
      };
      if (res.status === 401) {
        setMemberEmail(null);
        setStep('email');
        setError(data.error ?? 'Your verification expired. Please verify your email again.');
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not record the nomination. Please try again.');
        return;
      }
      setDone({
        count: data.count ?? 1,
        min: data.minNominators ?? minNominators,
        max: data.maxNominators ?? maxNominators,
        ready: data.status === 'ready' || (data.count ?? 0) >= (data.minNominators ?? minNominators),
      });
    } catch {
      setError('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function nominateAnother() {
    setDone(null);
    setProof(null);
    setSignatureFile(null);
    setSignatureData(null);
    setPadKey((k) => k + 1);
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
        <h2 className="mt-4 text-xl font-bold text-slate-900">Nomination recorded</h2>
        <p className="mt-2 text-sm text-slate-600">
          {done.ready
            ? 'This nominee now has enough verified nominators. The election organisers will contact them for consent before they can appear on the ballot.'
            : `This nominee has ${done.count} of the ${done.min} nominators needed. Another verified member can complete the nomination.`}
        </p>
        {done.count >= done.max && (
          <p className="mt-2 text-sm text-slate-600">The maximum of {done.max} nominators for this nominee has been reached.</p>
        )}
        <button type="button" className="btn btn-secondary mt-5" onClick={nominateAnother}>
          Nominate another member
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
          <span className="font-medium">Nominations close</span>
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
        <label htmlFor="fullName" className="label">Nominee&rsquo;s full name *</label>
        <input id="fullName" name="fullName" className="input" required maxLength={200} autoComplete="off" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nomineeEmail" className="label">Nominee&rsquo;s email *</label>
          <input id="nomineeEmail" name="email" type="email" className="input" required maxLength={254} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="nomineePhone" className="label">Nominee&rsquo;s phone</label>
          <input id="nomineePhone" name="phone" type="tel" className="input" maxLength={40} autoComplete="off" />
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

      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">What happens with this information</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your verified member email is recorded with the nomination so organisers can check that each nomination comes from a member.</li>
          <li>The nominee&rsquo;s name, email and optional phone are shared with the election organisers so they can ask the nominee for consent.</li>
          <li>Proof of membership and signatures are private: only the organisers of this election can see them. They never appear on the ballot or public results.</li>
          <li>Records are kept until the election is complete and results are published. Organisers may delete proof and signature files sooner.</li>
        </ul>
      </div>

      <div>
        <label htmlFor="proof" className="label">Proof of membership (optional)</label>
        <input
          id="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:text-sm file:font-semibold"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            const problem = file ? typeAndSizeError(file, PROOF_TYPES, 'a JPEG, PNG, WebP or PDF file') : null;
            if (problem) {
              setError(problem);
              e.target.value = '';
              return;
            }
            setError(null);
            setProof(file);
          }}
        />
        <p className="hint">A member card, roster entry or receipt. JPEG, PNG, WebP or PDF, up to 2 MB.</p>
        {proof && (
          <button type="button" className="mt-1 text-xs text-red-800 underline" onClick={() => setProof(null)}>
            Remove proof
          </button>
        )}
      </div>

      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <legend className="px-1.5 text-sm font-semibold text-slate-800">Signature (optional)</legend>
        <SignaturePad key={padKey} onChange={setSignatureData} disabled={busy} />
        <div>
          <label htmlFor="signatureScan" className="label">Upload a scan instead</label>
          <input
            id="signatureScan"
            type="file"
            accept="image/png,image/jpeg"
            className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:text-sm file:font-semibold"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              const problem = file ? typeAndSizeError(file, SIGNATURE_TYPES, 'a PNG or JPEG signature') : null;
              if (problem) {
                setError(problem);
                e.target.value = '';
                return;
              }
              setError(null);
              setSignatureFile(file);
            }}
          />
          <p className="hint">
            PNG or JPEG, up to 2 MB. {signatureFile ? 'This scan replaces the drawing above.' : 'Leave empty to submit the drawing instead.'}
          </p>
          {signatureFile && (
            <button type="button" className="mt-1 text-xs text-red-800 underline" onClick={() => setSignatureFile(null)}>
              Remove scan
            </button>
          )}
        </div>
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
