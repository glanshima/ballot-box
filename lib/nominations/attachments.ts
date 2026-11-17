// Pure module (no node imports) so the browser can reuse the limits.
// Magic bytes are authoritative: a file is stored under the type it really is,
// never under the type the client claims.

export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const SIGNATURE_TARGET_BYTES = 100 * 1024; // client-side target after trimming

export type AttachmentKind = 'membership_proof' | 'signature';

export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const SIGNATURE_TYPES = ['image/jpeg', 'image/png'] as const;

const starts = (b: Uint8Array, sig: readonly number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

/** Detects the real content type from the first bytes, or null when unsupported. */
export function sniffAttachmentType(bytes: Uint8Array): string | null {
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

const acceptedFor = (kind: AttachmentKind) => (kind === 'signature' ? SIGNATURE_TYPES : PROOF_TYPES);

const labelFor = (kind: AttachmentKind) =>
  kind === 'signature' ? 'a PNG or JPEG signature' : 'a JPEG, PNG, WebP or PDF file';

export type AttachmentCheck =
  | { ok: true; contentType: string; size: number }
  | { ok: false; error: string };

/**
 * Same rule for both kinds: non-empty, within the cap, and a type the detected
 * bytes actually match. `declaredType` is not trusted, but an out-of-policy
 * declaration is rejected early with a useful message.
 */
export function validateAttachmentBytes(kind: AttachmentKind, declaredType: string, bytes: Uint8Array): AttachmentCheck {
  if (bytes.length === 0) return { ok: false, error: 'The file is empty.' };
  if (bytes.length > ATTACHMENT_MAX_BYTES) return { ok: false, error: 'File is too large (maximum 2 MB).' };
  const accepted = acceptedFor(kind);
  if (declaredType && !(accepted as readonly string[]).includes(declaredType)) {
    return { ok: false, error: `Please upload ${labelFor(kind)}.` };
  }
  const detected = sniffAttachmentType(bytes);
  if (!detected || !(accepted as readonly string[]).includes(detected)) {
    return { ok: false, error: `Please upload ${labelFor(kind)}.` };
  }
  return { ok: true, contentType: detected, size: bytes.length };
}
