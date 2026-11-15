'use server';

import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/auth';
import type { ActionState } from '@/lib/action-utils';

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await signIn('credentials', {
      email: String(fd.get('email') ?? ''),
      password: String(fd.get('password') ?? ''),
      redirectTo: '/admin',
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: 'Invalid email or password, or too many attempts.' };
    throw e; // the success redirect is thrown by Auth.js and must propagate
  }
}

export async function logout() {
  await signOut({ redirectTo: '/admin/login' });
}
