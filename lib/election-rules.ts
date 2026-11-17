import { AppError } from './app-error';

type E = {
  status: 'draft' | 'open' | 'closed' | 'published';
  type: 'candidate' | 'poll';
  requireImages: boolean;
  opensAt: Date;
  closesAt: Date;
  nominationsEnabled: boolean;
  nominationsCloseAt: Date | null;
  nominationMode?: 'self' | 'member';
};

/** Options, voters and timings may only be edited while the election is a draft. */
export function assertDraft(e: Pick<E, 'status'>) {
  if (e.status !== 'draft') {
    throw new AppError('This election is locked: it can no longer be edited once it has been launched.');
  }
}

/** Problems that block moving draft -> open. Empty array = ready to launch. */
export function launchProblems(args: {
  election: E;
  options: { imageUrl: string | null; position: string | null }[];
  voterCount: number;
  pendingNominations: number;
  now: Date;
}): string[] {
  const { election, options, voterCount, pendingNominations, now } = args;
  const problems: string[] = [];
  if (election.closesAt <= now) problems.push('The closing time is in the past.');
  if (election.closesAt <= election.opensAt) problems.push('The closing time must be after the opening time.');
  if (options.length === 0) problems.push('Add at least one option.');
  if (election.type === 'poll' && options.length < 2) problems.push('A poll needs at least two options.');
  if (election.requireImages && election.type === 'candidate' && options.some((o) => !o.imageUrl)) {
    problems.push('Every candidate needs an image (this election requires images).');
  }
  if (voterCount === 0) problems.push('Add at least one voter.');
  if (pendingNominations > 0) {
    problems.push(`Review the ${pendingNominations} pending nomination(s) first: they cannot be approved after launch.`);
  }
  return problems;
}

/** Is the public nomination form accepting submissions right now? */
export function nominationsOpen(e: E, now: Date): boolean {
  return (
    e.type === 'candidate' &&
    e.status === 'draft' &&
    e.nominationsEnabled &&
    (e.nominationsCloseAt === null || now < e.nominationsCloseAt)
  );
}

/** Member-verified nominations (voter-roll email + one-time code) for this election. */
export function memberNominationsOpen(e: E, now: Date): boolean {
  return e.nominationMode === 'member' && nominationsOpen(e, now);
}

/** Poll items suggested by verified members while the election is a draft. */
export function memberSuggestionsOpen(e: E, now: Date): boolean {
  return (
    e.type === 'poll' &&
    e.status === 'draft' &&
    e.nominationMode === 'member' &&
    e.nominationsEnabled &&
    (e.nominationsCloseAt === null || now < e.nominationsCloseAt)
  );
}

/** Either public member flow needs a verified member session. */
export function memberFlowOpen(e: E, now: Date): boolean {
  return memberNominationsOpen(e, now) || memberSuggestionsOpen(e, now);
}
