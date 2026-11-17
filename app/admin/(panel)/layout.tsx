import Link from 'next/link';
import { AdminNav } from '@/components/AdminNav';
import { logout } from '@/lib/actions/login';
import { isSuper, requireAdminPage } from '@/lib/authz';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage(); // re-check: middleware is not the only guard
  const superAdmin = isSuper(user);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-700 text-white shadow-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </span>
            <span>Ballot Box</span>
          </Link>

          <AdminNav isSuper={superAdmin} />

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-xs font-medium text-slate-600">{user.email}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  superAdmin ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {superAdmin ? 'Super admin' : 'Admin'}
              </span>
            </div>

            <form action={logout}>
              <button className="btn btn-secondary btn-sm" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
