import { and, count, eq } from 'drizzle-orm';
import { StatusBadge } from '@/components/StatusBadge';
import { TabNav } from '@/components/TabNav';
import { isSuper, requireElectionPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { nominations } from '@/lib/db/schema';

export default async function ElectionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, election } = await requireElectionPage(id);
  const [pending] = await getDb()
    .select({ n: count() })
    .from(nominations)
    .where(and(eq(nominations.electionId, id), eq(nominations.status, 'pending')));

  const tabs = [
    { href: '', label: 'Details' },
    { href: '/options', label: 'Options' },
    ...(election.type === 'candidate' ? [{ href: '/nominations', label: 'Nominations', badge: Number(pending?.n ?? 0) }] : []),
    { href: '/voters', label: 'Voters' },
    { href: '/invitations', label: 'Invitations' },
    { href: '/results', label: 'Results' },
    ...(isSuper(user) ? [{ href: '/admins', label: 'Admins' }] : []),
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{election.title}</h1>
        <StatusBadge value={election.status} />
        <StatusBadge value={election.type} />
      </div>
      <TabNav base={`/admin/elections/${id}`} tabs={tabs} />
      {children}
    </div>
  );
}
