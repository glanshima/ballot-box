import { describe, expect, it } from 'vitest';
import { launchProblems, nominationsOpen } from '@/lib/election-rules';
import { resultsAccess } from '@/lib/results';

describe('resultsAccess (visibility rules)', () => {
  const base = { resultsPublic: false, liveResults: false };
  it('is hidden from everyone while draft', () => {
    expect(resultsAccess({ ...base, status: 'draft' }, 'admin')).toBe('deny');
    expect(resultsAccess({ ...base, status: 'draft' }, 'public')).toBe('deny');
  });
  it('is hidden while open unless live_results is on, and then admin-only', () => {
    expect(resultsAccess({ ...base, status: 'open' }, 'admin')).toBe('deny');
    expect(resultsAccess({ ...base, liveResults: true, status: 'open' }, 'admin')).toBe('allow');
    expect(resultsAccess({ ...base, liveResults: true, resultsPublic: true, status: 'open' }, 'public')).toBe('deny');
  });
  it('after close: admins only', () => {
    expect(resultsAccess({ ...base, status: 'closed' }, 'admin')).toBe('allow');
    expect(resultsAccess({ ...base, resultsPublic: true, status: 'closed' }, 'public')).toBe('deny');
  });
  it('after publish: public only if results_public', () => {
    expect(resultsAccess({ ...base, status: 'published' }, 'public')).toBe('deny');
    expect(resultsAccess({ ...base, resultsPublic: true, status: 'published' }, 'public')).toBe('allow');
    expect(resultsAccess({ ...base, status: 'published' }, 'admin')).toBe('allow');
  });
});

const now = new Date('2026-01-01T00:00:00Z');
const election = {
  status: 'draft' as const,
  type: 'candidate' as const,
  requireImages: false,
  opensAt: new Date('2026-01-02T00:00:00Z'),
  closesAt: new Date('2026-01-03T00:00:00Z'),
  nominationsEnabled: true,
  nominationsCloseAt: null,
};

describe('launchProblems', () => {
  const ok = { election, options: [{ imageUrl: null, position: 'P' }], voterCount: 3, pendingNominations: 0, now };
  it('passes a ready election', () => expect(launchProblems(ok)).toEqual([]));
  it('requires images when require_images is set', () => {
    expect(launchProblems({ ...ok, election: { ...election, requireImages: true } }).join(' ')).toMatch(/image/i);
  });
  it('blocks launch with pending nominations, no voters, no options, or a past closing time', () => {
    expect(launchProblems({ ...ok, pendingNominations: 2 }).join(' ')).toMatch(/pending nomination/i);
    expect(launchProblems({ ...ok, voterCount: 0 }).join(' ')).toMatch(/voter/i);
    expect(launchProblems({ ...ok, options: [] }).join(' ')).toMatch(/option/i);
    expect(launchProblems({ ...ok, now: new Date('2026-02-01T00:00:00Z') }).join(' ')).toMatch(/past/i);
  });
  it('requires two options for a poll', () => {
    expect(launchProblems({ ...ok, election: { ...election, type: 'poll' } }).join(' ')).toMatch(/two options/i);
  });
});

describe('nominationsOpen', () => {
  it('is open only for draft candidate elections with the form enabled and before the deadline', () => {
    expect(nominationsOpen(election, now)).toBe(true);
    expect(nominationsOpen({ ...election, status: 'open' }, now)).toBe(false);
    expect(nominationsOpen({ ...election, type: 'poll' }, now)).toBe(false);
    expect(nominationsOpen({ ...election, nominationsEnabled: false }, now)).toBe(false);
    expect(nominationsOpen({ ...election, nominationsCloseAt: new Date('2025-12-31T00:00:00Z') }, now)).toBe(false);
  });
});
