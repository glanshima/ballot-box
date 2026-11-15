import Link from 'next/link';
import { LocalTime } from '@/components/LocalTime';
import { StatusBadge } from '@/components/StatusBadge';
import { isSuper, requireAdminPage } from '@/lib/authz';
import { listAllElections, listElectionsForAdmin } from '@/lib/db/queries';

export const metadata = { title: 'Elections' };

export default async function Dashboard() {
  const user = await requireAdminPage();
  const list = isSuper(user) ? await listAllElections() : await listElectionsForAdmin(user.id);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Elections &amp; polls</h1>
        {isSuper(user) && <Link href="/admin/elections/new" className="btn btn-primary">New election</Link>}
      </div>
      {list.length === 0 ? (
        <div className="card text-center text-slate-700">
          {isSuper(user) ? 'No elections yet. Create your first one.' : 'You have not been assigned to any election yet. Ask the super admin to assign you.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/elections/${e.id}`} className="card block hover:border-indigo-400">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.title}</span>
                  <StatusBadge value={e.status} />
                  <StatusBadge value={e.type} />
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  <LocalTime iso={e.opensAt.toISOString()} /> → <LocalTime iso={e.closesAt.toISOString()} />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
