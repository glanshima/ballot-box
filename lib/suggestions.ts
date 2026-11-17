import { normalizeTitle } from './nominations/rules';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

/** Rejected suggestions do not use up the election's suggestion allowance. */
export function countsTowardCap(status: SuggestionStatus): boolean {
  return status !== 'rejected';
}

export function canDecideSuggestion(status: SuggestionStatus): boolean {
  return status === 'pending';
}

/** Returns an error message when an option or suggestion with the same normalised title already exists. */
export function duplicateTitleError(existingTitles: string[], title: string): string | null {
  const wanted = normalizeTitle(title);
  return existingTitles.some((t) => normalizeTitle(t) === wanted)
    ? 'This item has already been suggested or added. Please pick a different title.'
    : null;
}
