'use client';

import { ActionForm } from '@/components/ActionForm';
import { login } from '@/lib/actions/login';

export function LoginForm() {
  return (
    <ActionForm action={login} className="card space-y-4" submitLabel="Sign in" submitClass="btn btn-primary w-full">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="username" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
      </div>
    </ActionForm>
  );
}
