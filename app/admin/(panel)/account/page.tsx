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
      <ActionForm action={changeOwnPassword} className="card space-y-3" submitLabel="Change password">
        <div><label className="label">Current password</label><input name="current" type="password" className="input" required autoComplete="current-password" /></div>
        <div><label className="label">New password (min 12 characters)</label><input name="password" type="password" className="input" required minLength={12} autoComplete="new-password" /></div>
      </ActionForm>
      <p className="hint">Changing your password signs out every device, including this one.</p>
      <p className="hint">Forgot your password? Sign out and use “Forgot password?” on the sign-in page.</p>
    </div>
  );
}
