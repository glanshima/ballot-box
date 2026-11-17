import { describe, expect, it } from 'vitest';
import {
  generateOtpCode,
  hashesEqual,
  hmacHex,
  MEMBER_SESSION_TTL_SECONDS,
  normalizeEmail,
  otpCodeHash,
  otpEmailHash,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  signMemberSession,
  verifyMemberSession,
} from '@/lib/nominations/otp';

const key = Buffer.from('0'.repeat(32));
const otherKey = Buffer.from('1'.repeat(32));
const election = '11111111-1111-4111-8111-111111111111';
const otherElection = '22222222-2222-4222-8222-222222222222';

describe('OTP helpers', () => {
  it('generates uniform six-digit codes with leading zeroes preserved', () => {
    for (let i = 0; i < 500; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('normalises emails', () => {
    expect(normalizeEmail('  A@B.CO ')).toBe('a@b.co');
  });

  it('hashes emails deterministically, case-insensitively and per election/key', () => {
    const h = otpEmailHash(key, election, 'a@b.co');
    expect(h).toBe(otpEmailHash(key, election, ' A@B.CO '));
    expect(h).not.toBe(otpEmailHash(key, election, 'c@d.co'));
    expect(h).not.toBe(otpEmailHash(key, otherElection, 'a@b.co'));
    expect(h).not.toBe(otpEmailHash(otherKey, election, 'a@b.co'));
  });

  it('binds the code hash to the election, email hash and code', () => {
    const emailHash = otpEmailHash(key, election, 'a@b.co');
    expect(otpCodeHash(key, election, emailHash, '123456')).toBe(otpCodeHash(key, election, emailHash, '123456'));
    expect(otpCodeHash(key, election, emailHash, '123456')).not.toBe(otpCodeHash(key, election, emailHash, '654321'));
    expect(otpCodeHash(key, election, emailHash, '123456')).not.toBe(
      otpCodeHash(key, otherElection, emailHash, '123456'),
    );
  });

  it('compares digests safely', () => {
    const a = hmacHex(key, 'a');
    expect(hashesEqual(a, a)).toBe(true);
    expect(hashesEqual(a, hmacHex(key, 'b'))).toBe(false);
    expect(hashesEqual('', '')).toBe(false);
    expect(hashesEqual(a, '')).toBe(false);
  });

  it('signs and verifies member sessions', () => {
    const now = Date.now();
    const exp = Math.floor(now / 1000) + 60;
    const token = signMemberSession(key, { electionId: election, voterId: 'voter-1', exp });
    expect(verifyMemberSession(key, token, now)).toEqual({ electionId: election, voterId: 'voter-1', exp });
    expect(verifyMemberSession(otherKey, token, now)).toBeNull();
  });

  it('rejects expired, tampered and malformed sessions', () => {
    const now = Date.now();
    const expired = signMemberSession(key, { electionId: election, voterId: 'v', exp: Math.floor(now / 1000) - 1 });
    expect(verifyMemberSession(key, expired, now)).toBeNull();

    const live = signMemberSession(key, { electionId: election, voterId: 'v', exp: Math.floor(now / 1000) + 60 });
    expect(verifyMemberSession(key, `${live}x`, now)).toBeNull();
    expect(verifyMemberSession(key, live.slice(0, -2), now)).toBeNull();
    expect(verifyMemberSession(key, 'not-a-session', now)).toBeNull();
  });

  it('keeps the documented limits', () => {
    expect(OTP_TTL_MINUTES).toBe(10);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(MEMBER_SESSION_TTL_SECONDS).toBe(30 * 60);
  });
});
