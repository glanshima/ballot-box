import { hkdfSync } from 'node:crypto';
import { getEnv } from '@/lib/env';

type Keys = { otp: Buffer; session: Buffer };
let cached: Keys | null = null;

/**
 * Derive purpose-specific keys from AUTH_SECRET so no extra env var is needed.
 * Rotating AUTH_SECRET invalidates outstanding codes and member sessions
 * (10 minutes / 30 minutes by design).
 */
export function nominationKeys(): Keys {
  if (cached) return cached;
  const secret = Buffer.from(getEnv().AUTH_SECRET, 'utf8');
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), Buffer.from(info, 'utf8'), 32));
  cached = {
    otp: derive('ballot-box:nomination-otp:v1'),
    session: derive('ballot-box:member-session:v1'),
  };
  return cached;
}
