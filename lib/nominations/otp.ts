import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const MEMBER_SESSION_TTL_SECONDS = 30 * 60;

/** Roll emails are compared case-insensitively and trimmed. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Uniform 6-digit code (CSPRNG, leading zeroes preserved). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hmacHex(key: Uint8Array, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/** Hashed identifier stored in member_otps and audit metadata. */
export function otpEmailHash(key: Uint8Array, electionId: string, email: string): string {
  return hmacHex(key, `otp:${electionId}:${normalizeEmail(email)}`);
}

export function otpCodeHash(key: Uint8Array, electionId: string, emailHash: string, code: string): string {
  return hmacHex(key, `code:${electionId}:${emailHash}:${code}`);
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

export type MemberSession = { electionId: string; voterId: string; exp: number };

/** Stateless signed cookie payload; no session row is stored. */
export function signMemberSession(key: Uint8Array, session: MemberSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const sig = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyMemberSession(key: Uint8Array, token: string, nowMs = Date.now()): MemberSession | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', key).update(payload).digest('base64url');
  const given = Buffer.from(sig, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<MemberSession>;
    if (typeof parsed.electionId !== 'string' || typeof parsed.voterId !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp * 1000 <= nowMs) return null;
    return { electionId: parsed.electionId, voterId: parsed.voterId, exp: parsed.exp };
  } catch {
    return null;
  }
}
