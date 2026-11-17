import { asc } from 'drizzle-orm';
import { ActionForm } from '@/components/ActionForm';
import { StatusBadge } from '@/components/StatusBadge';
import { createAdmin, issueAdminResetLink, setAdminActive, setAdminRole } from '@/lib/actions/admins';
import { requireSuperPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { admins } from '@/lib/db/schema';

export const metadata = { title: 'Admins' };

export default async function AdminsPage() {
  await requireSuperPage();
  const list = await getDb().select().from(admins).orderBy(asc(admins.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admins</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create delegated election managers and control their access.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <section className="card lg:col-span-5">
          <h2 className="mb-3 font-bold text-slate-900">Create an admin</h2>
          <ActionForm action={createAdmin} className="space-y-3.5" submitLabel="Create admin" resetOnSuccess>
            <div>
              <label htmlFor="admin-name" className="label">Name *</label>
              <input id="admin-name" name="name" className="input" required maxLength={100} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="admin-email" className="label">Email *</label>
              <input id="admin-email" name="email" type="email" className="input" required autoComplete="off" />
            </div>
          </ActionForm>
          <p className="hint mt-3">
            Creating an admin returns a one-time link for them to set their own password (valid 30 minutes).
          </p>
          <p className="hint">
            Admins only see elections you assign to them (open an election → Admins tab).
          </p>
        </section>

        <section className="card lg:col-span-7">
          <h2 className="mb-3 font-bold text-slate-900">All admins ({list.length})</h2>
          {list.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-600">
              No delegated admins yet. Create one using the form.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((a) => (
                <li key={a.id} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{a.name}</span>
                        <StatusBadge value={a.isActive ? 'active' : 'deactivated'} />
                        {a.role === 'super_admin' && (
                          <span className="badge bg-indigo-100 text-indigo-800 ring-1 ring-inset ring-indigo-200">
                            Super admin
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{a.email}</p>
                    </div>

                    <ActionForm
                      action={setAdminActive.bind(null, a.id, !a.isActive)}
                      submitLabel={a.isActive ? 'Deactivate' : 'Re-activate'}
                      submitClass="btn btn-secondary btn-sm"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    <ActionForm
                      action={setAdminRole.bind(null, a.id, a.role === 'super_admin' ? 'admin' : 'super_admin')}
                      submitLabel={a.role === 'super_admin' ? 'Demote' : 'Make super admin'}
                      submitClass="btn btn-secondary btn-sm"
                      confirm={a.role === 'super_admin' ? 'Demote this super admin? Their sessions will be signed out.' : 'Give this admin full access to every election and to admin management?'}
                    />
                    <details className="group rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:text-indigo-900">
                        Reset password
                      </summary>
                      <ActionForm
                        action={issueAdminResetLink.bind(null, a.id, 'reset')}
                        className="mt-2"
                        submitLabel="Create reset link"
                        submitClass="btn btn-primary btn-sm"
                      />
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">The last active super admin cannot be deactivated or demoted.</p>
        </section>
      </div>
    </div>
  );
}
