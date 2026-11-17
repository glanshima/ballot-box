import type { NomineeStatus } from '@/lib/db/schema';

/** The schema and the form both enforce 1 <= min <= max <= 10. */
export const NOMINATOR_COUNT_LIMITS = { min: 1, max: 10 } as const;

export function validNominatorRange(min: number, max: number): boolean {
  return (
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= NOMINATOR_COUNT_LIMITS.min &&
    max <= NOMINATOR_COUNT_LIMITS.max &&
    min <= max
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A member cannot nominate themselves. The rule is enforced for every submission. */
export function isSelfNomination(nominatorEmail: string, nomineeEmail: string): boolean {
  return normalizeEmail(nominatorEmail) === normalizeEmail(nomineeEmail);
}

/** Only these states still collect signatures. Consent/approval stages are closed to new nominators. */
export function nomineeAcceptsNominators(status: NomineeStatus): boolean {
  return status === 'collecting' || status === 'ready';
}

export function nominatorLimitError(count: number, max: number): string | null {
  return count >= max ? 'This nominee already has the maximum number of nominators.' : null;
}

/** Reaching the minimum moves a nominee from collecting to ready (it never moves back here). */
export function statusAfterNominator(countAfter: number, min: number, current: NomineeStatus): NomineeStatus {
  return current === 'collecting' && countAfter >= min ? 'ready' : current;
}

/** Position is required when the election defines positions, and must be one of them. */
export function positionError(positions: string[], position: string | null): string | null {
  if (positions.length === 0) return position ? 'This election does not use positions.' : null;
  if (!position) return 'Please choose a position.';
  if (!positions.includes(position)) return 'Please choose a position from the list.';
  return null;
}

/** Lower-cased, whitespace-collapsed title used for duplicate detection (poll suggestions). */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}
