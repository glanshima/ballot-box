import { describe, expect, it } from 'vitest';
import { memberNominationsOpen } from '@/lib/election-rules';
import {
  ATTACHMENT_MAX_BYTES,
  sniffAttachmentType,
  validateAttachmentBytes,
} from '@/lib/nominations/attachments';
import {
  isSelfNomination,
  nomineeAcceptsNominators,
  nominatorLimitError,
  normalizeTitle,
  positionError,
  statusAfterNominator,
  validNominatorRange,
} from '@/lib/nominations/rules';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const TEXT = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]);

describe('attachment magic bytes', () => {
  it('detects the supported types regardless of the file name', () => {
    expect(sniffAttachmentType(PNG)).toBe('image/png');
    expect(sniffAttachmentType(JPEG)).toBe('image/jpeg');
    expect(sniffAttachmentType(WEBP)).toBe('image/webp');
    expect(sniffAttachmentType(PDF)).toBe('application/pdf');
    expect(sniffAttachmentType(TEXT)).toBeNull();
    expect(sniffAttachmentType(new Uint8Array())).toBeNull();
  });

  it('accepts proof of membership in all four formats', () => {
    for (const [bytes, type] of [
      [PNG, 'image/png'],
      [JPEG, 'image/jpeg'],
      [WEBP, 'image/webp'],
      [PDF, 'application/pdf'],
    ] as const) {
      const check = validateAttachmentBytes('membership_proof', type, bytes);
      expect(check.ok).toBe(true);
      if (check.ok) expect(check.contentType).toBe(type);
    }
  });

  it('only accepts PNG and JPEG signatures', () => {
    expect(validateAttachmentBytes('signature', 'image/png', PNG).ok).toBe(true);
    expect(validateAttachmentBytes('signature', 'image/jpeg', JPEG).ok).toBe(true);
    expect(validateAttachmentBytes('signature', 'application/pdf', PDF).ok).toBe(false);
    expect(validateAttachmentBytes('signature', 'image/webp', WEBP).ok).toBe(false);
  });

  it('rejects empty, oversized and disguised files', () => {
    expect(validateAttachmentBytes('membership_proof', 'image/png', new Uint8Array()).ok).toBe(false);
    expect(validateAttachmentBytes('membership_proof', 'image/png', new Uint8Array(ATTACHMENT_MAX_BYTES + 1)).ok).toBe(false);
    expect(validateAttachmentBytes('membership_proof', 'image/png', TEXT).ok).toBe(false);
    expect(validateAttachmentBytes('signature', 'text/plain', PNG).ok).toBe(false);
  });
});

describe('member nomination rules', () => {
  it('validates the 1..10 nominator range', () => {
    expect(validNominatorRange(2, 3)).toBe(true);
    expect(validNominatorRange(1, 10)).toBe(true);
    expect(validNominatorRange(0, 3)).toBe(false);
    expect(validNominatorRange(2, 11)).toBe(false);
    expect(validNominatorRange(4, 3)).toBe(false);
    expect(validNominatorRange(2.5, 3)).toBe(false);
  });

  it('blocks self-nomination case-insensitively', () => {
    expect(isSelfNomination(' A@Example.com ', 'a@example.com')).toBe(true);
    expect(isSelfNomination('a@example.com', 'b@example.com')).toBe(false);
  });

  it('only collecting or ready nominees accept more nominators', () => {
    expect(nomineeAcceptsNominators('collecting')).toBe(true);
    expect(nomineeAcceptsNominators('ready')).toBe(true);
    for (const status of ['consent_sent', 'accepted', 'declined', 'expired', 'approved', 'rejected'] as const) {
      expect(nomineeAcceptsNominators(status)).toBe(false);
    }
  });

  it('refuses nominators once the maximum is reached', () => {
    expect(nominatorLimitError(2, 3)).toBeNull();
    expect(nominatorLimitError(3, 3)).toMatch(/maximum/i);
  });

  it('moves a nominee to ready exactly when the minimum is reached', () => {
    expect(statusAfterNominator(1, 2, 'collecting')).toBe('collecting');
    expect(statusAfterNominator(2, 2, 'collecting')).toBe('ready');
    expect(statusAfterNominator(3, 2, 'ready')).toBe('ready');
    expect(statusAfterNominator(2, 2, 'accepted')).toBe('accepted');
  });

  it('requires a valid position only when the election defines positions', () => {
    expect(positionError([], null)).toBeNull();
    expect(positionError([], 'Chair')).toMatch(/does not use positions/i);
    expect(positionError(['Chair'], null)).toMatch(/choose a position/i);
    expect(positionError(['Chair'], 'Treasurer')).toMatch(/from the list/i);
    expect(positionError(['Chair'], 'Chair')).toBeNull();
  });

  it('normalises poll suggestion titles for duplicate detection', () => {
    expect(normalizeTitle('  New   Playground ')).toBe('new playground');
    expect(normalizeTitle('New Playground')).toBe('new playground');
  });
});

describe('memberNominationsOpen', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const base = {
    status: 'draft' as const,
    type: 'candidate' as const,
    requireImages: false,
    opensAt: new Date('2025-12-01T00:00:00Z'),
    closesAt: new Date('2026-02-01T00:00:00Z'),
    nominationsEnabled: true,
    nominationsCloseAt: null,
  };
  it('requires member mode on top of the normal nomination window', () => {
    expect(memberNominationsOpen({ ...base, nominationMode: 'member' }, now)).toBe(true);
    expect(memberNominationsOpen({ ...base, nominationMode: 'self' }, now)).toBe(false);
    expect(memberNominationsOpen(base, now)).toBe(false);
  });
});
