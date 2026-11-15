import Link from 'next/link';
import { logout } from '@/lib/actions/login';
import { isSuper, requireAdminPage } from '@/lib/authz';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage(); // re-check: middleware is not the only guard
  return (
    <div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="text-lg font-bold">Ballot Box</Link>
          <nav aria-label="Admin" className="flex flex-1 flex-wrap gap-4 text-sm">
            <Link href="/admin" className="py-2 hover:underline">Elections</Link>
            {isSuper(user) && <Link href="/admin/admins" className="py-2 hover:underline">Admins</Link>}
            <Link href="/admin/account" className="py-2 hover:underline">Account</Link>
          </nav>
          <span className="text-xs text-slate-700">
            {user.email} · {isSuper(user) ? 'Super admin' : 'Admin'}
          </span>
          <form action={logout}>
            <button className="btn btn-secondary btn-sm" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
