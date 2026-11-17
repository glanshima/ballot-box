import { describe, expect, it } from 'vitest';
import {
  canApproveConsent,
  canRejectNominee,
  canSendConsent,
  CONSENT_BATCH_SIZE,
  consentExpired,
} from '@/lib/nominations/consent';
import { consentDecisionSchema } from '@/lib/validators';

describe('consent state rules', () => {
  it('only sends from ready, consent_sent or expired', () => {
    for (const status of ['ready', 'consent_sent', 'expired'] as const) expect(canSendConsent(status)).toBe(true);
    for (const status of ['collecting', 'accepted', 'declined', 'approved', 'rejected'] as const) {
      expect(canSendConsent(status)).toBe(false);
    }
  });

  it('only accepts approval of nominees who consented', () => {
    expect(canApproveConsent('accepted')).toBe(true);
    for (const status of ['collecting', 'ready', 'consent_sent', 'declined', 'expired', 'approved', 'rejected'] as const) {
      expect(canApproveConsent(status)).toBe(false);
    }
  });

  it('cannot reject an approved or already rejected nominee', () => {
    expect(canRejectNominee('collecting')).toBe(true);
    expect(canRejectNominee('accepted')).toBe(true);
    expect(canRejectNominee('approved')).toBe(false);
    expect(canRejectNominee('rejected')).toBe(false);
  });

  it('treats missing or past expiry as expired', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(consentExpired(null, now)).toBe(true);
    expect(consentExpired(new Date('2025-12-31T23:59:59Z'), now)).toBe(true);
    expect(consentExpired(new Date('2026-01-01T00:00:01Z'), now)).toBe(false);
  });

  it('keeps the documented batch size', () => {
    expect(CONSENT_BATCH_SIZE).toBe(10);
  });
});

describe('consentDecisionSchema', () => {
  const photo = { photoUrl: 'https://x.public.blob.vercel-storage.com/a.png', photoPath: 'nominations/e/a.png' };

  it('accepts a decline on its own', () => {
    expect(consentDecisionSchema.safeParse({ action: 'decline' }).success).toBe(true);
  });

  it('requires a photo when accepting, with an optional bio', () => {
    expect(consentDecisionSchema.safeParse({ action: 'accept', ...photo }).success).toBe(true);
    expect(consentDecisionSchema.safeParse({ action: 'accept', ...photo, bio: 'Hello' }).success).toBe(true);
    expect(consentDecisionSchema.safeParse({ action: 'accept', photoUrl: photo.photoUrl }).success).toBe(false);
  });

  it('rejects unknown fields or actions', () => {
    expect(consentDecisionSchema.safeParse({ action: 'decline', note: 'x' }).success).toBe(false);
    expect(consentDecisionSchema.safeParse({ action: 'accept', ...photo, extra: 1 }).success).toBe(false);
    expect(consentDecisionSchema.safeParse({ action: 'maybe' }).success).toBe(false);
  });

  it('caps the bio at 1,500 characters', () => {
    expect(consentDecisionSchema.safeParse({ action: 'accept', ...photo, bio: 'x'.repeat(1501) }).success).toBe(false);
  });
});
