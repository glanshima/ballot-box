import { ActionForm } from '@/components/ActionForm';
import { changeOwnPassword } from '@/lib/actions/admins';
import { isSuper, requireAdminPage } from '@/lib/authz';

export const metadata = { title: 'Account' };

export default async function Account() {
  const user = await requireAdminPage();
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Account</h1>
      <p className="text-sm text-slate-700">{user.email} · {isSuper(user) ? 'Super admin' : 'Admin'}</p>
      {isSuper(user) ? (
        <p className="card text-sm">The super admin password is set through the <code>ADMIN_PASSWORD_HASH</code> environment variable. Generate a new hash with <code>npm run hash-password</code>.</p>
      ) : (
        <ActionForm action={changeOwnPassword} className="card space-y-3" submitLabel="Change password" resetOnSuccess>
          <div><label className="label">Current password</label><input name="current" type="password" className="input" required autoComplete="current-password" /></div>
          <div><label className="label">New password (min 10 characters)</label><input name="password" type="password" className="input" required minLength={10} autoComplete="new-password" /></div>
        </ActionForm>
      )}
    </div>
  );
}
