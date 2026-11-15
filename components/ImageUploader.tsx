'use client';

import { upload } from '@vercel/blob/client';
import { useId, useState } from 'react';
import { compressImage } from '@/lib/image-compress';
import { requestedPathname, validateFileMeta, type UploadKind } from '@/lib/upload-policy';

type Uploaded = { url: string; path: string } | null;

/**
 * Compresses (images) then uploads straight to Vercel Blob using a short-lived
 * token from /api/upload. Writes the result into hidden inputs (for server-action forms)
 * and/or reports it via onChange (for the JSON nomination form).
 */
export function ImageUploader({
  kind,
  electionId,
  label,
  required,
  hint,
  urlName = 'imageUrl',
  pathName = 'imagePath',
  initialUrl,
  initialPath,
  onChange,
}: {
  kind: UploadKind;
  electionId: string;
  label: string;
  required?: boolean;
  hint?: string;
  urlName?: string;
  pathName?: string;
  initialUrl?: string | null;
  initialPath?: string | null;
  onChange?: (v: Uploaded) => void;
}) {
  const id = useId();
  const isReceipt = kind === 'nomination-receipt';
  const [value, setValue] = useState<Uploaded>(initialUrl && initialPath ? { url: initialUrl, path: initialPath } : null);
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);
  const [isPdf, setIsPdf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (v: Uploaded) => {
    setValue(v);
    onChange?.(v);
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    // Raw phone photos can be several MB; they are compressed below, so only sanity-check type here.
    const typeErr = validateFileMeta(kind, file.type, 0);
    if (typeErr) return setError(typeErr);
    setBusy(true);
    try {
      let body: Blob = file;
      if (file.type.startsWith('image/')) {
        body = await compressImage(file, isReceipt ? 1600 : 800, isReceipt ? 600 * 1024 : 200 * 1024);
      }
      const sizeErr = validateFileMeta(kind, body.type || file.type, body.size);
      if (sizeErr) throw new Error(sizeErr);
      const contentType = body.type || file.type;
      const blob = await upload(requestedPathname(kind, electionId, contentType), body, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        clientPayload: JSON.stringify({ kind, electionId }),
        contentType,
      });
      const pathname = new URL(blob.url).pathname.replace(/^\//, '');
      set({ url: blob.url, path: decodeURIComponent(pathname) });
      setIsPdf(contentType === 'application/pdf');
      setPreview(contentType === 'application/pdf' ? null : URL.createObjectURL(body));
    } catch (e) {
      setError(e instanceof Error && e.message.length < 120 ? e.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className="flex items-center gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={`${label} preview`} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-1 text-center text-xs text-slate-600">
              {isPdf && value ? 'PDF attached' : 'None'}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            id={id}
            type="file"
            accept={isReceipt ? 'image/jpeg,image/png,image/webp,application/pdf' : 'image/jpeg,image/png,image/webp'}
            capture={undefined}
            disabled={busy}
            required={required && !value}
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:text-sm file:font-semibold"
          />
          {busy && <p role="status" className="hint">Uploading…</p>}
          {value && !busy && (
            <button type="button" className="mt-1 text-xs text-red-800 underline" onClick={() => { set(null); setPreview(null); setIsPdf(false); }}>
              Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="hint">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-red-800">{error}</p>}
      <input type="hidden" name={urlName} value={value?.url ?? ''} />
      <input type="hidden" name={pathName} value={value?.path ?? ''} />
    </div>
  );
}
