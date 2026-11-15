import { describe, expect, it } from 'vitest';
import { parseCsv, parseVoterCsv, toCsv } from '@/lib/csv';

describe('csv', () => {
  it('parses quotes, commas, CRLF and BOM', () => {
    expect(parseCsv('﻿email,name\r\na@x.com,"Doe, Jane"\r\nb@x.com,"Say ""hi"""\r\n')).toEqual([
      ['email', 'name'],
      ['a@x.com', 'Doe, Jane'],
      ['b@x.com', 'Say "hi"'],
    ]);
  });
  it('validates, dedupes and flags existing voters', () => {
    const rows = parseVoterCsv('email,name\nA@x.com,A\nbad,B\na@x.com,Dup\nold@x.com,O\n', new Set(['old@x.com']));
    expect(rows.map((r) => r.status)).toEqual(['valid', 'invalid', 'duplicate', 'existing']);
    expect(rows[0]!.email).toBe('a@x.com');
  });
  it('works without a header row', () => {
    expect(parseVoterCsv('a@x.com,Ann\n', new Set())[0]).toMatchObject({ email: 'a@x.com', name: 'Ann', status: 'valid' });
  });
  it('neutralises spreadsheet formula injection on export', () => {
    expect(toCsv([['=HYPERLINK("x")', 'ok']])).toBe(`"'=HYPERLINK(""x"")",ok\r\n`);
  });
});
