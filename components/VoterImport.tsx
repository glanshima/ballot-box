'use client';

import { useState } from 'react';
import { importVoters, previewVoters, type PreviewResult } from '@/lib/actions/voters';

export function VoterImport({ electionId }: { electionId: string }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setMsg(null);
    setPreview(null);
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    setCsv(text);
    const res = await previewVoters(electionId, text);
    setBusy(false);
    if (res.ok) setPreview(res);
    else setMsg({ ok: false, text: res.error });
  }

  async function doImport() {
    setBusy(true);
    const res = await importVoters(electionId, csv);
    setBusy(false);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) {
      setPreview(null);
      setCsv('');
    }
  }

  return (
    <div>
      <label htmlFor="voter-csv" className="label">Upload CSV (columns: email, optional name)</label>
      <input id="voter-csv" type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])}
        className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:text-sm file:font-semibold" />
      {preview && (
        <div className="mt-4">
          <p className="text-sm" role="status">
            <strong>{preview.counts.valid}</strong> will be imported · {preview.counts.existing} already listed · {preview.counts.duplicate} duplicates in file · {preview.counts.invalid} invalid
          </p>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Result</th></tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 300).map((r) => (
                  <tr key={r.line} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{r.line}</td>
                    <td className="px-3 py-1.5 break-all">{r.email || '(empty)'}</td>
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className={`px-3 py-1.5 ${r.status === 'valid' ? 'text-green-800' : 'text-red-800'}`}>{r.status === 'valid' ? 'OK' : r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 300 && <p className="hint">Showing the first 300 rows; all valid rows will be imported.</p>}
          <button type="button" className="btn btn-primary mt-3" disabled={busy || preview.counts.valid === 0} onClick={doImport}>
            {busy ? 'Importing…' : `Import ${preview.counts.valid} voter(s)`}
          </button>
        </div>
      )}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 rounded-md px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
    </div>
  );
}
