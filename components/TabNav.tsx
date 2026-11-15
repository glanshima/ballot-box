'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TabNav({ base, tabs }: { base: string; tabs: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Election sections" className="-mx-4 mb-6 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const href = `${base}${t.href}`;
          const active = pathname === href;
          return (
            <li key={t.href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium ${active ? 'border-indigo-700 text-indigo-800' : 'border-transparent text-slate-700 hover:border-slate-300'}`}
              >
                {t.label}
                {t.badge ? <span className="badge bg-indigo-700 text-white">{t.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
