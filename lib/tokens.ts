import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, URL-safe base64 (43 chars, no padding). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex. Only this hash is stored; the raw token lives only in the email / CSV export. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Constant-time comparison of a raw token against a stored hash. */
export function verifyToken(raw: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(raw), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cheap shape check so garbage never reaches the database. */
export const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;
