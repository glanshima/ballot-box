import { eq } from 'drizzle-orm';
import { ActionForm } from '@/components/ActionForm';
import { ElectionFields } from '@/components/ElectionFields';
import { createElection } from '@/lib/actions/elections';
import { requireSuperPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { admins } from '@/lib/db/schema';

export const metadata = { title: 'New election' };

export default async function NewElection() {
  await requireSuperPage();
  const list = await getDb().select().from(admins).where(eq(admins.isActive, true)).orderBy(admins.name);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">New election or poll</h1>
      <ActionForm action={createElection} className="card space-y-6" submitLabel="Create election">
        <ElectionFields canSetLive />
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">Admins who will manage it</legend>
          {list.length === 0 ? (
            <p className="text-sm text-slate-700">No admins yet. Create some under Admins, then assign them from the election&apos;s Admins tab.</p>
          ) : (
            list.map((a) => (
              <label key={a.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" name="adminIds" value={a.id} className="h-5 w-5 accent-indigo-700" /> {a.name} <span className="text-slate-600">({a.email})</span>
              </label>
            ))
          )}
        </fieldset>
      </ActionForm>
    </div>
  );
}
