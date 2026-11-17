import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from './db/client';
import { adminPasswordTokens } from './db/schema';
import { generateToken, hashToken, TOKEN_REGEX } from './tokens';

export const PASSWORD_TOKEN_TTL_MS = 30 * 60 * 1000;

export type PasswordTokenPurpose = 'reset' | 'invite';

/** Issues a token and invalidates any unused ones for that admin. Returns the raw token (shown once). */
export async function issuePasswordToken(adminId: string, purpose: PasswordTokenPurpose): Promise<string> {
  const db = getDb();
  const raw = generateToken();
  await db
    .delete(adminPasswordTokens)
    .where(and(eq(adminPasswordTokens.adminId, adminId), isNull(adminPasswordTokens.usedAt)));
  await db.insert(adminPasswordTokens).values({
    adminId,
    tokenHash: hashToken(raw),
    purpose,
    expiresAt: new Date(Date.now() + PASSWORD_TOKEN_TTL_MS),
  });
  return raw;
}

/** Atomically marks a token used and returns its admin. Null when unknown, expired, or already used. */
export async function consumePasswordToken(raw: string): Promise<string | null> {
  if (!TOKEN_REGEX.test(raw)) return null;
  const [row] = await getDb()
    .update(adminPasswordTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(adminPasswordTokens.tokenHash, hashToken(raw)),
        isNull(adminPasswordTokens.usedAt),
        gt(adminPasswordTokens.expiresAt, new Date()),
      ),
    )
    .returning({ adminId: adminPasswordTokens.adminId });
  return row?.adminId ?? null;
}
