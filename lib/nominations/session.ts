import { cookies } from 'next/headers';
import { nominationKeys } from './keys';
import { MEMBER_SESSION_TTL_SECONDS, signMemberSession, verifyMemberSession, type MemberSession } from './otp';

const COOKIE = 'bb_member';

/** HttpOnly, SameSite=Lax, Secure in production. Never stored in browser storage. */
export async function issueMemberSession(electionId: string, voterId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MEMBER_SESSION_TTL_SECONDS;
  const value = signMemberSession(nominationKeys().session, { electionId, voterId, exp });
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MEMBER_SESSION_TTL_SECONDS,
  });
}

/** Session for this election, or null when absent, tampered, expired or scoped elsewhere. */
export async function readMemberSession(electionId: string): Promise<MemberSession | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const session = verifyMemberSession(nominationKeys().session, raw);
  return session && session.electionId === electionId ? session : null;
}
