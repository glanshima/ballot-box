import { eq } from 'drizzle-orm';
import { ActionForm } from '@/components/ActionForm';
import { setElectionAdmins } from '@/lib/actions/elections';
import { requireSuperPage } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { admins, electionAdmins } from '@/lib/db/schema';

export const metadata = { title: 'Election admins' };

export default async function ElectionAdminsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSuperPage();
  const db = getDb();
  const all = await db.select().from(admins).orderBy(admins.name);
  const assigned = new Set((await db.select({ a: electionAdmins.adminId }).from(electionAdmins).where(eq(electionAdmins.electionId, id))).map((r) => r.a));

  return (
    <section className="card max-w-xl">
      <h2 className="mb-1 font-semibold">Who can manage this election</h2>
      <p className="mb-4 text-sm text-slate-700">
        Assigned admins can edit the title, times, options, nominations, voters and invitations while it is a draft. They can view results but cannot publish, hide or change them.
      </p>
      {all.length === 0 ? <p className="text-sm text-slate-700">No admins exist yet. Create them on the Admins page.</p> : (
        <ActionForm action={setElectionAdmins.bind(null, id)} submitLabel="Save assignments">
          {all.map((a) => (
            <label key={a.id} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="adminIds" value={a.id} defaultChecked={assigned.has(a.id)} className="h-5 w-5 accent-indigo-700" />
              {a.name} <span className="text-slate-600">({a.email}){a.isActive ? '' : ' · deactivated'}</span>
            </label>
          ))}
        </ActionForm>
      )}
    </section>
  );
}
