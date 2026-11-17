import type { Election } from '@/lib/db/schema';
import { DateTimeField } from './DateTimeField';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Shared by "new election" and "edit election". `mode` limits what can be changed. */
export function ElectionFields({ election, mode = 'full', canSetLive }: {
  election?: Election;
  /** full = draft/new; extend = open (only closing time); readonly = closed/published */
  mode?: 'full' | 'extend' | 'readonly';
  typeLocked?: boolean;
  canSetLive: boolean;
}) {
  const locked = mode !== 'full';
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="title" className="label">Title *</label>
        <input id="title" name="title" className="input" required maxLength={200} defaultValue={election?.title} disabled={locked} />
      </div>
      <div>
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" name="description" rows={3} maxLength={5000} className="input" defaultValue={election?.description ?? ''} disabled={locked} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className="label">Type *</label>
          <select id="type" name="type" className="input" defaultValue={election?.type ?? 'candidate'} disabled={locked}>
            <option value="candidate">Candidate election (people running for positions)</option>
            <option value="poll">Poll (any other question)</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="requireImages" defaultChecked={election?.requireImages} disabled={locked} className="h-5 w-5 accent-indigo-700" />
            Require a photo for every candidate
          </label>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <DateTimeField name="opensAt" label="Voting opens *" required defaultValue={iso(election?.opensAt)} disabled={locked} />
        {/* closing time stays editable while open (extension only) */}
        <DateTimeField name="closesAt" label="Voting closes *" required defaultValue={iso(election?.closesAt)} disabled={mode === 'readonly'} />
      </div>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4" disabled={locked}>
        <legend className="px-1 text-sm font-semibold">Nomination form (candidate elections)</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="nominationsEnabled" defaultChecked={election?.nominationsEnabled} className="h-5 w-5 accent-indigo-700" />
          Accept nominations through a public form while the election is a draft
        </label>
        <DateTimeField name="nominationsCloseAt" label="Nominations close (optional)" defaultValue={iso(election?.nominationsCloseAt)} />
        <div>
          <label htmlFor="nominationPositions" className="label">Positions aspirants can apply for</label>
          <textarea id="nominationPositions" name="nominationPositions" rows={3} className="input" defaultValue={election?.nominationPositions.join('\n') ?? ''} placeholder={'President\nSecretary\nTreasurer'} />
          <p className="hint">One per line. Leave empty if there are no separate positions.</p>
        </div>
        <div>
          <label htmlFor="nominationMode" className="label">Who can nominate?</label>
          <select id="nominationMode" name="nominationMode" className="input" defaultValue={election?.nominationMode ?? 'self'}>
            <option value="self">Aspirants nominate themselves (public form)</option>
            <option value="member">Verified members nominate candidates</option>
          </select>
          <p className="hint">
            Member mode checks the nominator&apos;s email against the voter roll with a one-time code. Existing elections keep
            self-nomination.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="minNominators" className="label">Minimum nominators</label>
            <input id="minNominators" name="minNominators" type="number" min={1} max={10} className="input" defaultValue={election?.minNominators ?? 2} />
          </div>
          <div>
            <label htmlFor="maxNominators" className="label">Maximum nominators</label>
            <input id="maxNominators" name="maxNominators" type="number" min={1} max={10} className="input" defaultValue={election?.maxNominators ?? 3} />
          </div>
          <div>
            <label htmlFor="consentHours" className="label">Consent link expires (hours)</label>
            <input id="consentHours" name="consentHours" type="number" min={1} max={720} className="input" defaultValue={election?.consentHours ?? 72} />
          </div>
        </div>
        <div>
          <label htmlFor="maxOptionSuggestions" className="label">Maximum poll suggestions</label>
          <input id="maxOptionSuggestions" name="maxOptionSuggestions" type="number" min={1} max={50} className="input" defaultValue={election?.maxOptionSuggestions ?? 10} />
          <p className="hint">Used for poll item suggestions. Minimum and maximum nominators apply to candidate elections.</p>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="requirePurchaseEvidence" defaultChecked={election?.requirePurchaseEvidence} className="h-5 w-5 accent-indigo-700" />
          Require evidence of nomination-form purchase (otherwise optional)
        </label>
        <div>
          <label htmlFor="nominationInstructions" className="label">Instructions shown on the form</label>
          <textarea id="nominationInstructions" name="nominationInstructions" rows={3} maxLength={2000} className="input" defaultValue={election?.nominationInstructions ?? ''} placeholder="Where to buy the form, fee, deadline details…" />
        </div>
      </fieldset>

      {canSetLive && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="liveResults" defaultChecked={election?.liveResults} disabled={locked} className="h-5 w-5 accent-indigo-700" />
          Allow admins to see live results while voting is open
        </label>
      )}
    </div>
  );
}
