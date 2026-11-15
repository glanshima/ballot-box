import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { ballots, voters } from '@/lib/db/schema';

describe('ballot secrecy (schema)', () => {
  it('ballots has no reference to voters and no voter-like column', () => {
    const cfg = getTableConfig(ballots);
    const votersName = getTableConfig(voters).name;
    for (const fk of cfg.foreignKeys) {
      expect(getTableConfig(fk.reference().foreignTable).name).not.toBe(votersName);
    }
    const cols = cfg.columns.map((c) => c.name);
    expect(cols.filter((c) => /voter|token|email/i.test(c))).toEqual([]);
    expect(cols.sort()).toEqual(['cast_bucket', 'election_id', 'id', 'option_id', 'position']);
  });
  it('voters does not reference ballots either', () => {
    const ballotsName = getTableConfig(ballots).name;
    for (const fk of getTableConfig(voters).foreignKeys) {
      expect(getTableConfig(fk.reference().foreignTable).name).not.toBe(ballotsName);
    }
  });
  it('ballot ids are generated randomly in the database (uuid default), not sequential', () => {
    const id = getTableConfig(ballots).columns.find((c) => c.name === 'id')!;
    expect(id.columnType).toBe('PgUUID');
    expect(id.hasDefault).toBe(true);
  });
});
