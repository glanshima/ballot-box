import { del } from '@vercel/blob';
import { eq, or } from 'drizzle-orm';
import { getDb } from './db/client';
import { nominations, optionSuggestions, options } from './db/schema';

/** Best-effort delete. Never throws: a failed delete must not break the admin action. */
export async function deleteBlobsByUrl(urls: (string | null | undefined)[]) {
  const list = [...new Set(urls.filter((u): u is string => !!u))];
  if (list.length === 0) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn('[blob] BLOB_READ_WRITE_TOKEN missing; skipping blob delete');
    return;
  }
  try {
    await del(list);
  } catch {
    console.error('[blob] delete failed for', list.length, 'file(s)');
  }
}

/**
 * An approved nomination and its option share one photo blob, so only delete a
 * blob once nothing in the database references it any more. Call AFTER the row
 * that referenced it has been removed/updated.
 */
export async function deleteIfUnreferenced(url: string | null | undefined, path: string | null | undefined) {
  if (!url || !path) return;
  const db = getDb();
  const [inOptions] = await db.select({ id: options.id }).from(options).where(eq(options.imagePath, path)).limit(1);
  if (inOptions) return;
  const [inNoms] = await db
    .select({ id: nominations.id })
    .from(nominations)
    .where(or(eq(nominations.photoPath, path), eq(nominations.receiptPath, path)))
    .limit(1);
  if (inNoms) return;
  const [inSuggestions] = await db
    .select({ id: optionSuggestions.id })
    .from(optionSuggestions)
    .where(eq(optionSuggestions.imagePath, path))
    .limit(1);
  if (inSuggestions) return;
  await deleteBlobsByUrl([url]);
}
