'use client';

import { startTransition, useActionState, useEffect, useState, type ReactNode } from 'react';
import type { ActionState } from '@/lib/action-utils';

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children?: ReactNode;
  className?: string;
  submitLabel?: string;
  submitClass?: string;
  /** window.confirm() text shown before submitting */
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

  useEffect(() => {
    if (resetOnSuccess && state?.ok) setResetKey((k) => k + 1);
  }, [state, resetOnSuccess]);

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <div key={resetKey} className="contents">{children}</div>
      {submitLabel && (
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? 'Working…' : submitLabel}
        </button>
      )}
      {state?.error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">{state.message}</p>
      )}
    </form>
  );
}
