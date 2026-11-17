import { ActionForm } from '@/components/ActionForm';
import { ImageUploader } from '@/components/ImageUploader';
import { OptionAvatar } from '@/components/OptionAvatar';
import { deleteOption, moveOption, saveOption } from '@/lib/actions/options';
import { requireElectionPage } from '@/lib/authz';
import { getOptions } from '@/lib/db/queries';
import type { Election, Option } from '@/lib/db/schema';

export const metadata = { title: 'Options' };

function OptionFields({ election, option }: { election: Election; option?: Option }) {
  const candidate = election.type === 'candidate';
  const uploader = (
    <ImageUploader
      kind="option"
      electionId={election.id}
      label="Image"
      required={election.requireImages && candidate}
      hint="Optional unless the election requires images. Compressed in your browser; every image is shown as the same square crop."
      initialUrl={option?.imageUrl}
      initialPath={option?.imagePath}
    />
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="label">{candidate ? 'Candidate name *' : 'Choice text *'}</label>
        <input name="label" className="input" required maxLength={200} defaultValue={option?.label} />
      </div>
      {candidate && (
        <div>
          <label className="label">Position / office</label>
          <input
            name="position"
            className="input"
            maxLength={100}
            defaultValue={option?.position ?? ''}
            list={`positions-${election.id}`}
          />
          <datalist id={`positions-${election.id}`}>
            {election.nominationPositions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <p className="hint">Candidates with the same position are shown together; voters pick one per position.</p>
        </div>
      )}
      <div>
        <label className="label">{candidate ? 'Short bio / manifesto' : 'Description'}</label>
        <textarea name="description" rows={3} maxLength={1000} className="input" defaultValue={option?.description ?? ''} />
      </div>
      {candidate ? (
        uploader
      ) : (
        <details open={!!option?.imageUrl} className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-indigo-700 hover:text-indigo-900">
            Add image (optional)
          </summary>
          <div className="mt-3">{uploader}</div>
        </details>
      )}
    </div>
  );
}

export default async function OptionsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { election } = await requireElectionPage(id);
  const list = await getOptions(id);
  const locked = election.status !== 'draft';

  return (
    <div className="space-y-6">
      {locked && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This election is locked: options can no longer be changed.
        </p>
      )}

      {list.length === 0 ? (
        <div className="card border-dashed py-10 text-center text-sm text-slate-600">
          No {election.type === 'candidate' ? 'candidates' : 'options'} added yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <li key={o.id} className="card">
              <div className="flex items-center gap-3.5">
                <OptionAvatar label={o.label} imageUrl={o.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{o.label}</p>
                  <p className="text-xs font-medium text-slate-600">
                    {o.position ?? (election.type === 'poll' ? 'Poll option' : 'No position')}
                  </p>
                  {election.requireImages && !o.imageUrl && (
                    <p className="mt-1 inline-block rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                      Image required before launch
                    </p>
                  )}
                </div>
                {!locked && (
                  <div className="flex gap-1">
                    <ActionForm action={moveOption.bind(null, id, o.id, 'up')} submitLabel="↑" submitClass="btn btn-secondary btn-sm" />
                    <ActionForm action={moveOption.bind(null, id, o.id, 'down')} submitLabel="↓" submitClass="btn btn-secondary btn-sm" />
                  </div>
                )}
              </div>

              {!locked && (
                <details className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5">
                  <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:text-indigo-900">
                    Edit details
                  </summary>
                  <ActionForm action={saveOption.bind(null, id, o.id)} className="mt-3 space-y-4" submitLabel="Save option">
                    <OptionFields election={election} option={o} />
                  </ActionForm>
                  <ActionForm
                    action={deleteOption.bind(null, id, o.id)}
                    className="mt-3 border-t border-slate-200 pt-3"
                    submitLabel="Delete option"
                    submitClass="btn btn-danger btn-sm"
                    confirm="Delete this option and its image?"
                  />
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <section className="card">
          <h2 className="mb-4 font-bold text-slate-900">
            Add {election.type === 'candidate' ? 'a candidate' : 'an option'}
          </h2>
          <ActionForm action={saveOption.bind(null, id, null)} className="space-y-4" submitLabel="Add" resetOnSuccess>
            <OptionFields election={election} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
