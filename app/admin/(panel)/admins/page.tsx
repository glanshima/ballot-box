import { asc } from 'drizzle-orm';
import { ActionForm } from '@/components/ActionForm';
import { StatusBadge } from '@/components/StatusBadge';
import { createAdmin, resetAdminPassword, setAdminActive } from '@/lib/actions/admins';
import { requireSuperPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { admins } from '@/lib/db/schema';

export const metadata = { title: 'Admins' };

export default async function AdminsPage() {
  await requireSuperPage();
  const list = await getDb().select().from(admins).orderBy(asc(admins.name));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admins</h1>
      <section className="card max-w-xl">
        <h2 className="mb-3 font-semibold">Create an admin</h2>
        <ActionForm action={createAdmin} className="space-y-3" submitLabel="Create admin" resetOnSuccess>
          <div><label className="label">Name *</label><input name="name" className="input" required maxLength={100} autoComplete="off" /></div>
          <div><label className="label">Email *</label><input name="email" type="email" className="input" required autoComplete="off" /></div>
          <div><label className="label">Initial password * (min 10 characters)</label><input name="password" type="text" className="input" required minLength={10} autoComplete="off" /></div>
        </ActionForm>
        <p className="hint">Admins only see elections you assign to them (open an election → Admins tab).</p>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">All admins ({list.length})</h2>
        {list.length === 0 ? <p className="text-slate-700">None yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {list.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-sm text-slate-700">{a.email}</span>
                  <StatusBadge value={a.isActive ? 'approved' : 'rejected'} />
                  <span className="text-xs text-slate-700">{a.isActive ? 'active' : 'deactivated'}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-start gap-3">
                  <ActionForm action={setAdminActive.bind(null, a.id, !a.isActive)} submitLabel={a.isActive ? 'Deactivate' : 'Re-activate'} submitClass="btn btn-secondary btn-sm">{null}</ActionForm>
                  <details>
                    <summary className="cursor-pointer text-sm text-indigo-800">Reset password</summary>
                    <ActionForm action={resetAdminPassword.bind(null, a.id)} className="mt-2 flex gap-2" submitLabel="Reset" submitClass="btn btn-secondary btn-sm">
                      <input name="password" type="text" minLength={10} required className="input" aria-label="New password" autoComplete="off" />
                    </ActionForm>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
