import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

const PRESETS = {
  vote: { n: 10, w: '1 m' as Window }, // per IP
  voteToken: { n: 5, w: '1 m' as Window }, // per token hash
  tokenPage: { n: 30, w: '1 m' as Window }, // per IP
  login: { n: 8, w: '10 m' as Window }, // per IP
  loginEmail: { n: 8, w: '10 m' as Window }, // per account
  nominate: { n: 5, w: '10 m' as Window }, // per IP
  upload: { n: 30, w: '10 m' as Window }, // per IP
  api: { n: 60, w: '1 m' as Window }, // generic read endpoints
  passwordReset: { n: 3, w: '1 h' as Window }, // per IP
  passwordResetEmail: { n: 3, w: '1 h' as Window }, // per account
  passwordSubmit: { n: 10, w: '1 h' as Window }, // per IP, valid reset-token submissions
} as const;

export type LimitName = keyof typeof PRESETS;

let redis: Redis | null | undefined;
let warned = false;
const limiters = new Map<LimitName, Ratelimit>();

function getLimiter(name: LimitName): Ratelimit | null {
  if (redis === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    redis = url && token ? new Redis({ url, token }) : null;
  }
  if (!redis) {
    if (!warned) {
      console.warn('[ratelimit] Upstash env vars missing: rate limiting is DISABLED (ok for local dev only).');
      warned = true;
    }
    return null;
  }
  let l = limiters.get(name);
  if (!l) {
    const p = PRESETS[name];
    l = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(p.n, p.w),
      prefix: `rl:${name}`,
      analytics: false,
    });
    limiters.set(name, l);
  }
  return l;
}

/** Returns true when the request may proceed. Fails OPEN if Redis is unreachable (availability for voters). */
export async function checkLimit(name: LimitName, key: string): Promise<boolean> {
  const limiter = getLimiter(name);
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch {
    console.error('[ratelimit] backend error; allowing request');
    return true;
  }
}

export function getClientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
