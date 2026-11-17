'use client';

import { useEffect, useRef, useState } from 'react';

export function CopyButton({ value, label = 'Copy', className = 'btn btn-secondary btn-sm' }: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function handleCopy() {
    if (timer.current) window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    timer.current = window.setTimeout(() => setStatus('idle'), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-live="polite"
      title={status === 'failed' ? 'Copy failed. Select the text and copy it manually.' : undefined}
    >
      {status === 'copied' ? (
        <>
          <svg className="h-3.5 w-3.5 text-emerald-700" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          <span>Copied</span>
        </>
      ) : status === 'failed' ? (
        <>
          <svg className="h-3.5 w-3.5 text-red-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
          <span>Copy failed</span>
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
