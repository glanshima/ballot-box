'use client';

import { useState } from 'react';
import { CopyButton } from './CopyButton';

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
      <h2 className="font-bold text-slate-900">Export results</h2>
      <p className="hint mb-3">
        The SHA-256 hash is also stored in the audit log. The PDF includes turnout, tallies, the integrity check and the same
        results hash. Re-hash the downloaded file to verify it is unchanged.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={run} disabled={busy}>
          {busy ? 'Exporting…' : 'Download CSV'}
        </button>
        <a className="btn btn-secondary" href={`/api/admin/elections/${electionId}/results-pdf`}>
          Download PDF
        </a>
      </div>
      {hash && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-slate-500">SHA-256 Checksum</span>
            <code className="block truncate text-xs text-slate-800">{hash}</code>
          </div>
          <CopyButton value={hash} label="Copy hash" />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
