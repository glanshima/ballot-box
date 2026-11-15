// Pure module (no node/server imports) so it is shared by the browser uploader,
// the /api/upload route, server actions and the tests.

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const RECEIPT_TYPES = [...IMAGE_TYPES, 'application/pdf'] as const;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB, enforced by the Blob client token

export type UploadKind = 'option' | 'nomination-photo' | 'nomination-receipt';

export const UPLOAD_KINDS: readonly UploadKind[] = ['option', 'nomination-photo', 'nomination-receipt'];

export interface UploadPolicy {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
  prefix: string;
}

export function policyFor(kind: UploadKind): UploadPolicy {
  return {
    allowedContentTypes: kind === 'nomination-receipt' ? [...RECEIPT_TYPES] : [...IMAGE_TYPES],
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
    prefix: kind === 'option' ? 'options' : 'nominations',
  };
}

/** Returns an error message, or null when the file is acceptable. */
export function validateFileMeta(kind: UploadKind, contentType: string, size: number): string | null {
  const p = policyFor(kind);
  if (!p.allowedContentTypes.includes(contentType)) {
    return kind === 'nomination-receipt'
      ? 'Please upload a JPEG, PNG, WebP or PDF file.'
      : 'Please upload a JPEG, PNG or WebP image.';
  }
  if (size > p.maximumSizeInBytes) return 'File is too large (maximum 2 MB).';
  return null;
}

export const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Pathname the CLIENT asks for. The filename is random; the original name is never used. */
export function requestedPathname(kind: UploadKind, electionId: string, contentType: string): string {
  const ext = EXT_BY_TYPE[contentType] ?? 'bin';
  return `${policyFor(kind).prefix}/${electionId}/${crypto.randomUUID()}.${ext}`;
}

/** True when `pathname` sits in the right folder for this kind and election (used before issuing a token). */
export function pathnameAllowed(kind: UploadKind, electionId: string, pathname: string): boolean {
  const prefix = `${policyFor(kind).prefix}/${electionId}/`;
  return pathname.startsWith(prefix) && /^[A-Za-z0-9._-]+$/.test(pathname.slice(prefix.length));
}

const BLOB_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i;

/**
 * Server-side check that a url/path pair submitted by a client really is one of
 * OUR uploads for this election (stops people pointing options at arbitrary URLs).
 */
export function isOwnUpload(kind: UploadKind, electionId: string, url: string, path: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !BLOB_HOST.test(u.hostname)) return false;
    if (decodeURIComponent(u.pathname.replace(/^\//, '')) !== path) return false;
    return pathnameAllowed(kind, electionId, path);
  } catch {
    return false;
  }
}
