import type { DefaultSession } from 'next-auth';

export type Role = 'super_admin' | 'admin';

declare module 'next-auth' {
  interface User {
    role?: Role;
    sessionVersion?: number;
  }
  interface Session {
    user: { id: string; role: Role; sessionVersion: number } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: Role;
    uid?: string;
    sv?: number;
  }
}
