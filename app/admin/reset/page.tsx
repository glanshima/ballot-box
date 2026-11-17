import type { Metadata } from 'next';
import Link from 'next/link';
import { TOKEN_REGEX } from '@/lib/tokens';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'Set a new password', robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === 'string' && TOKEN_REGEX.test(token);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold">Set a new password</h1>
      {valid ? (
        <>
          <p className="mb-6 text-sm text-slate-700">This link works once and expires 30 minutes after it was created.</p>
          <ResetForm token={token} />
        </>
      ) : (
        <p className="card text-sm">
          This link is invalid or incomplete. Ask a super admin for a new one, or use the{' '}
          <Link className="text-indigo-800 hover:underline" href="/admin/forgot">forgot password</Link> page.
        </p>
      )}
    </main>
  );
}
