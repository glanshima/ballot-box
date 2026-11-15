import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, TOKEN_REGEX, verifyToken } from '@/lib/tokens';

describe('tokens', () => {
  it('generates 32 random bytes as 43 URL-safe chars', () => {
    const t = generateToken();
    expect(t).toMatch(TOKEN_REGEX);
    expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    expect(generateToken()).not.toBe(t);
  });

  it('hashes with SHA-256 hex (64 chars) and is deterministic', () => {
    const t = generateToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });

  it('verifies the right token and rejects others', () => {
    const t = generateToken();
    const h = hashToken(t);
    expect(verifyToken(t, h)).toBe(true);
    expect(verifyToken(generateToken(), h)).toBe(false);
    expect(verifyToken(t, 'not-hex')).toBe(false);
  });

  it('rejects malformed tokens before any lookup', () => {
    expect(TOKEN_REGEX.test('short')).toBe(false);
    expect(TOKEN_REGEX.test('a'.repeat(43) + '!')).toBe(false);
  });
});
