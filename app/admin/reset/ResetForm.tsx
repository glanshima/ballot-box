'use client';

import Link from 'next/link';
import { ActionForm } from '@/components/ActionForm';
import { resetPassword } from '@/lib/actions/password-reset';

export function ResetForm({ token }: { token: string }) {
  return (
    <>
      <ActionForm action={resetPassword} className="card space-y-4" submitLabel="Set new password" submitClass="btn btn-primary w-full">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="password" className="label">New password (min 12 characters)</label>
          <input id="password" name="password" type="password" className="input" required minLength={12} autoComplete="new-password" />
        </div>
        <div>
          <label htmlFor="confirm" className="label">Confirm new password</label>
          <input id="confirm" name="confirm" type="password" className="input" required minLength={12} autoComplete="new-password" />
        </div>
      </ActionForm>
      <p className="mt-4 text-sm"><Link className="text-indigo-800 hover:underline" href="/">Go to sign in</Link></p>
    </>
  );
}
