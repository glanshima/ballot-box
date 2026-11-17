'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AdminNav({ isSuper }: { isSuper: boolean }) {
  const pathname = usePathname();

  const links = [
    {
      href: '/admin',
      label: 'Elections',
      active: pathname === '/admin' || pathname.startsWith('/admin/elections'),
    },
    ...(isSuper
      ? [{ href: '/admin/admins', label: 'Admins', active: pathname.startsWith('/admin/admins') }]
      : []),
    {
      href: '/admin/account',
      label: 'Account',
      active: pathname.startsWith('/admin/account'),
    },
  ];

  return (
    <nav aria-label="Admin" className="flex flex-1 flex-wrap gap-1.5 text-sm">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={`inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 font-medium transition ${
            item.active
              ? 'bg-indigo-50 font-semibold text-indigo-800'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
