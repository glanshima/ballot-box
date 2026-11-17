import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { authConfig } from './auth.config';
import { getDb } from './lib/db/client';
import { admins } from './lib/db/schema';
import { checkLimit, getClientIp } from './lib/ratelimit';

const credentialsSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

// Compared against when the account does not exist, to keep response timing uniform.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', 12));

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const ip = getClientIp(request.headers);
        // Generic failure (null) for rate-limited and bad credentials alike.
        if (!(await checkLimit('login', ip)) || !(await checkLimit('loginEmail', email))) return null;

        const [row] = await getDb()
          .select({
            id: admins.id,
            email: admins.email,
            name: admins.name,
            passwordHash: admins.passwordHash,
            role: admins.role,
            sessionVersion: admins.sessionVersion,
            isActive: admins.isActive,
          })
          .from(admins)
          .where(eq(admins.email, email))
          .limit(1);
        const ok = await bcrypt.compare(parsed.data.password, row?.passwordHash ?? getDummyHash());
        if (!row || !row.isActive || !ok) return null;
        return { id: row.id, email: row.email, name: row.name, role: row.role, sessionVersion: row.sessionVersion };      },
    }),
  ],
});
