import { eq } from 'drizzle-orm';
import { appUrl } from './env';
import { getDb } from './db/client';
import { voters } from './db/schema';
import { generateToken, hashToken } from './tokens';

/**
 * Create a fresh token for a voter and store ONLY its hash (rotating any previous
 * token, which stops working immediately). Returns the raw link: the single
 * place a raw token exists is the caller's email / CSV export.
 */
export async function issueToken(voterId: string, expiresAt: Date, status: 'pending' | 'sent' | 'failed' | 'exported' = 'pending') {
  const raw = generateToken();
  await getDb()
    .update(voters)
    .set({ tokenHash: hashToken(raw), tokenExpiresAt: expiresAt, inviteStatus: status })
    .where(eq(voters.id, voterId));
  return { raw, link: `${appUrl()}/vote/${raw}` };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
