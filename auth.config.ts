import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@/types/next-auth';

// Edge-safe half of the Auth.js config (no DB / bcrypt imports): used by middleware.
export const authConfig = {
  pages: { signIn: '/' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8h
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.uid = user.id;
        token.sv = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      session.user.sessionVersion = Number(token.sv ?? 0);
      return session;
    },
  },
} satisfies NextAuthConfig;
