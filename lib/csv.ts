import { z } from 'zod';

/** Minimal RFC-4180 parser (quotes, escaped quotes, CRLF, BOM). Avoids an extra dependency. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Quote cells and neutralise spreadsheet formula injection (=, +, -, @ prefixes). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const MAX_VOTER_ROWS = 2000;

export type VoterPreviewRow = {
  line: number;
  email: string;
  name: string | null;
  status: 'valid' | 'invalid' | 'duplicate' | 'existing';
  reason?: string;
};

const emailSchema = z.string().email().max(254);

/**
 * Parse a voters CSV (`email`, optional `name`). Header row optional.
 * `existing` = lower-cased emails already on this election.
 */
export function parseVoterCsv(csv: string, existing: Set<string>): VoterPreviewRow[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const first = rows[0]!.map((c) => c.trim().toLowerCase());
  const hasHeader = first.includes('email');
  const emailIdx = hasHeader ? first.indexOf('email') : 0;
  const nameIdx = hasHeader ? first.indexOf('name') : 1;
  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length > MAX_VOTER_ROWS) throw new Error(`Too many rows (maximum ${MAX_VOTER_ROWS} per import).`);

  const seen = new Set<string>();
  return body.map((r, i): VoterPreviewRow => {
    const line = i + (hasHeader ? 2 : 1);
    const email = (r[emailIdx] ?? '').trim().toLowerCase();
    const rawName = nameIdx >= 0 ? (r[nameIdx] ?? '').trim() : '';
    const name = rawName ? rawName.slice(0, 200) : null;
    if (!emailSchema.safeParse(email).success) return { line, email, name, status: 'invalid', reason: 'Invalid email' };
    if (seen.has(email)) return { line, email, name, status: 'duplicate', reason: 'Duplicate in file' };
    seen.add(email);
    if (existing.has(email)) return { line, email, name, status: 'existing', reason: 'Already on the voter list' };
    return { line, email, name, status: 'valid' };
  });
}
