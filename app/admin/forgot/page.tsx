import type { Metadata } from 'next';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'Forgot password', robots: { index: false } };

export default function ForgotPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold">Reset your password</h1>
      <p className="mb-6 text-sm text-slate-700">
        Enter your admin email and we will send a one-time link if the account exists.
      </p>
      <ForgotForm />
    </main>
  );
}
