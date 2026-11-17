'use client';

import Link from 'next/link';
import { ActionForm } from '@/components/ActionForm';
import { requestPasswordReset } from '@/lib/actions/password-reset';

export function ForgotForm() {
  return (
    <>
      <ActionForm action={requestPasswordReset} className="card space-y-4" submitLabel="Send reset link" submitClass="btn btn-primary w-full">
        <div>
          <label htmlFor="email" className="label">Admin email</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="username" />
        </div>
      </ActionForm>
      <p className="mt-4 text-sm"><Link className="text-indigo-800 hover:underline" href="/">Back to sign in</Link></p>
    </>
  );
}
