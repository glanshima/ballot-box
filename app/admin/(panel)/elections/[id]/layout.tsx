import Link from 'next/link';
import { and, count, eq, inArray } from 'drizzle-orm';
import { StatusBadge } from '@/components/StatusBadge';
import { TabNav } from '@/components/TabNav';
import { isSuper, requireElectionPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { nominations, nominees } from '@/lib/db/schema';

export default async function ElectionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, election } = await requireElectionPage(id);
  let pendingCount = 0;
  if (election.nominationMode === 'member') {
    const [row] = await getDb()
      .select({ n: count() })
      .from(nominees)
      .where(and(eq(nominees.electionId, id), inArray(nominees.status, ['ready', 'accepted'])));
    pendingCount = Number(row?.n ?? 0);
  } else {
    const [row] = await getDb()
      .select({ n: count() })
      .from(nominations)
      .where(and(eq(nominations.electionId, id), eq(nominations.status, 'pending')));
    pendingCount = Number(row?.n ?? 0);
  }

  const tabs = [
    { href: '', label: 'Details' },
    { href: '/options', label: 'Options' },
    ...(election.type === 'candidate'
      ? [{ href: '/nominations', label: 'Nominations', badge: pendingCount }]
      : []),
    { href: '/voters', label: 'Voters' },
    { href: '/invitations', label: 'Invitations' },
    { href: '/results', label: 'Results' },
    ...(isSuper(user) ? [{ href: '/admins', label: 'Admins' }] : []),
  ];

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 transition hover:text-indigo-700"
        >
          <span aria-hidden="true">←</span> All elections
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{election.title}</h1>
          <StatusBadge value={election.status} />
          <StatusBadge value={election.type} />
        </div>
      </div>

      <TabNav base={`/admin/elections/${id}`} tabs={tabs} />
      {children}
    </div>
  );
}
