'use client';

import { startTransition, useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ActionState } from '@/lib/action-utils';
import { CopyButton } from './CopyButton';

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children?: ReactNode;
  className?: string;
  submitLabel?: string;
  submitClass?: string;
  /** Confirmation text shown in an accessible modal before submitting */
  confirm?: string;
  /** clear inputs (and remount children, e.g. image uploaders) after a successful save */
  resetOnSuccess?: boolean;
};

/**
 * Wraps a server action with pending state and inline error/success messages.
 * Submits via startTransition (not <form action>) so React does not wipe the
 * user's input when the action returns a validation error.
 */
export function ActionForm({ action, children, className, submitLabel, submitClass = 'btn btn-primary', confirm, resetOnSuccess }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [resetKey, setResetKey] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [pendingFd, setPendingFd] = useState<FormData | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    setDismissed(false);
    if (resetOnSuccess && state?.ok) setResetKey((k) => k + 1);
  }, [state, resetOnSuccess]);

  useEffect(() => {
    if (!pendingFd) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingFd(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openerRef.current?.focus();
      openerRef.current = null;
    };
  }, [pendingFd]);

  const visible = state && !dismissed ? state : null;
  const isDanger = submitClass.includes('btn-danger');

  return (
    <>
      <form
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (confirm) {
            openerRef.current = document.activeElement as HTMLElement | null;
            setPendingFd(fd);
            return;
          }
          startTransition(() => formAction(fd));
        }}
      >
        <div key={resetKey} className="contents">{children}</div>
        {submitLabel && (
          <button type="submit" disabled={pending} className={submitClass}>
            {pending ? 'Working…' : submitLabel}
          </button>
        )}
        {visible?.error && (
          <div role="alert" className="mt-2 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            <p className="flex-1">{visible.error}</p>
            <button type="button" onClick={() => setDismissed(true)} className="text-red-800/70 hover:text-red-900" aria-label="Dismiss">×</button>
          </div>
        )}
        {visible?.ok && visible.message && (
          <div role="status" className="mt-2 flex items-start gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
            <p className="flex-1">{visible.message}</p>
            <button type="button" onClick={() => setDismissed(true)} className="text-green-900/70 hover:text-green-950" aria-label="Dismiss">×</button>
          </div>
        )}
        {visible?.ok && visible.link && (
          <div className="mt-2 flex gap-2">
            <input readOnly value={visible.link} className="input" aria-label="One-time link" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton value={visible.link} />
          </div>
        )}
      </form>

      {pendingFd && confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          onClick={() => setPendingFd(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={dialogTitleId} className="text-lg font-bold text-slate-900">
              Please confirm
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{confirm}</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPendingFd(null)}
              >
                Cancel
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className={isDanger ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => {
                  const fd = pendingFd;
                  setPendingFd(null);
                  startTransition(() => formAction(fd));
                }}
              >
                {submitLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
