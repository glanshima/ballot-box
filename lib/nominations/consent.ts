import type { NomineeStatus } from '@/lib/db/schema';

/** Consent links may be sent (or re-sent) from these states. */
export function canSendConsent(status: NomineeStatus): boolean {
  return status === 'ready' || status === 'consent_sent' || status === 'expired';
}

export function canApproveConsent(status: NomineeStatus): boolean {
  return status === 'accepted';
}

export function canRejectNominee(status: NomineeStatus): boolean {
  return status !== 'approved' && status !== 'rejected';
}

export function consentExpired(expiresAt: Date | null, now: Date): boolean {
  return !expiresAt || expiresAt <= now;
}

/** Emails are sent 550 ms apart (Resend free tier allows ~2 requests/second). */
export const CONSENT_BATCH_SIZE = 10;
