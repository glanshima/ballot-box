import { describe, expect, it } from 'vitest';
import { isOwnUpload, MAX_UPLOAD_BYTES, pathnameAllowed, policyFor, requestedPathname, validateFileMeta } from '@/lib/upload-policy';

const E = '11111111-1111-4111-8111-111111111111';

describe('upload policy', () => {
  it('accepts jpeg/png/webp up to 2 MB', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) expect(validateFileMeta('option', t, 1000)).toBeNull();
    expect(validateFileMeta('option', 'image/jpeg', MAX_UPLOAD_BYTES)).toBeNull();
  });
  it('rejects the wrong type', () => {
    for (const t of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/html']) expect(validateFileMeta('option', t, 1000)).toMatch(/JPEG/);
    expect(validateFileMeta('nomination-photo', 'application/pdf', 1000)).not.toBeNull();
  });
  it('rejects oversize files', () => {
    expect(validateFileMeta('option', 'image/png', MAX_UPLOAD_BYTES + 1)).toMatch(/too large/i);
  });
  it('allows a PDF only for receipts', () => {
    expect(validateFileMeta('nomination-receipt', 'application/pdf', 5000)).toBeNull();
  });
  it('token policy carries the same limits (what the Blob service enforces)', () => {
    const p = policyFor('option');
    expect(p.maximumSizeInBytes).toBe(2 * 1024 * 1024);
    expect(p.allowedContentTypes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(policyFor('nomination-receipt').allowedContentTypes).toContain('application/pdf');
  });
  it('generates random filenames and never reuses the original name', () => {
    const a = requestedPathname('option', E, 'image/jpeg');
    const b = requestedPathname('option', E, 'image/jpeg');
    expect(a).not.toBe(b);
    expect(a).toMatch(new RegExp(`^options/${E}/[0-9a-f-]{36}\\.jpg$`));
  });
  it('restricts paths to the right folder and election', () => {
    expect(pathnameAllowed('option', E, `options/${E}/abc.jpg`)).toBe(true);
    expect(pathnameAllowed('option', E, `nominations/${E}/abc.jpg`)).toBe(false);
    expect(pathnameAllowed('option', E, `options/${E}/../x.jpg`)).toBe(false);
    expect(pathnameAllowed('option', E, `options/other/abc.jpg`)).toBe(false);
  });
  it('only accepts our own Blob urls', () => {
    const path = `options/${E}/abc.jpg`;
    expect(isOwnUpload('option', E, `https://abc123.public.blob.vercel-storage.com/${path}`, path)).toBe(true);
    expect(isOwnUpload('option', E, `https://evil.example.com/${path}`, path)).toBe(false);
    expect(isOwnUpload('option', E, `http://abc123.public.blob.vercel-storage.com/${path}`, path)).toBe(false);
    expect(isOwnUpload('option', E, `https://abc123.public.blob.vercel-storage.com/other.jpg`, path)).toBe(false);
  });
});
