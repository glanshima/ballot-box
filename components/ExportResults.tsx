'use client';

import { useState } from 'react';

/** Downloads the results CSV and shows the SHA-256 the server computed over those exact bytes. */
export function ExportResults({ electionId }: { electionId: string }) {
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/elections/${electionId}/export`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const text = await res.text();
      setHash(res.headers.get('X-Content-SHA256'));
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `results-${electionId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="font-semibold">Export results</h2>
      <p className="hint mb-3">The SHA-256 hash is also stored in the audit log. Re-hash the downloaded file to verify it is unchanged.</p>
      <button type="button" className="btn btn-secondary" onClick={run} disabled={busy}>{busy ? 'Exporting…' : 'Download CSV'}</button>
      {hash && (
        <p className="mt-3 break-all text-sm">
          SHA-256: <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{hash}</code>
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
    </div>
  );
}
