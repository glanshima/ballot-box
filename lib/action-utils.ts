import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { AppError } from './app-error';

export { AppError };

export type ActionState = { ok: boolean; error?: string; message?: string } | null;

/** Wrap a server action body: returns {ok,error|message}, rethrows redirects/notFound. */
export async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'Invalid input.' };
    console.error('[action] unexpected error:', e instanceof Error ? e.name : 'unknown');
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/** Empty strings become undefined so optional zod fields behave. */
export function getStr(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

export const getBool = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === 'true';
