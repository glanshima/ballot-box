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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Elections &amp; polls</h1>
          <p className="mt-1 text-sm text-slate-600">
            {list.length} {list.length === 1 ? 'election' : 'elections'} available
          </p>
        </div>
        {isSuper(user) && (
          <Link href="/admin/elections/new" className="btn btn-primary">
            + New election
          </Link>
        )}
      </div>

      {list.length === 0 ? (
        <div className="card border-dashed py-12 text-center">
          <p className="text-sm font-medium text-slate-800">
            {isSuper(user)
              ? 'No elections created yet.'
              : 'You have not been assigned to any election yet.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isSuper(user)
              ? 'Create your first election or poll to configure options and invite voters.'
              : 'Ask the super admin to assign you to an election.'}
          </p>
          {isSuper(user) && (
            <Link href="/admin/elections/new" className="btn btn-primary mt-4">
              Create first election
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/elections/${e.id}`}
                className="card group block transition duration-150 hover:border-indigo-400 hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-base font-bold text-slate-900 transition group-hover:text-indigo-800">
                      {e.title}
                    </span>
                    <StatusBadge value={e.status} />
                    <StatusBadge value={e.type} />
                  </div>
                  <span className="text-xs font-semibold text-indigo-700 opacity-0 transition group-hover:opacity-100">
                    Manage →
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">Window:</span>{' '}
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
