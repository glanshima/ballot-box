import { describe, expect, it } from 'vitest';
import { groupOptions, validateChoices } from '@/lib/voting';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const OTHER_ELECTION = '99999999-9999-4999-8999-999999999999';

const opts = [
  { id: A, position: 'President' },
  { id: B, position: 'President' },
  { id: C, position: 'Secretary' },
];

describe('validateChoices', () => {
  it('accepts one choice per position', () => {
    expect(validateChoices(opts, [{ position: 'President', optionId: A }, { position: 'Secretary', optionId: C }])).toBeNull();
  });
  it('accepts an explicit abstain', () => {
    expect(validateChoices(opts, [{ position: 'President', optionId: null }, { position: 'Secretary', optionId: C }])).toBeNull();
  });
  it('rejects two choices for one position', () => {
    expect(validateChoices(opts, [{ position: 'President', optionId: A }, { position: 'President', optionId: B }, { position: 'Secretary', optionId: C }])).toMatch(/more than one/i);
  });
  it('rejects an option from another election', () => {
    expect(validateChoices(opts, [{ position: 'President', optionId: OTHER_ELECTION }, { position: 'Secretary', optionId: C }])).toMatch(/does not belong/i);
  });
  it('rejects an option submitted under the wrong position', () => {
    expect(validateChoices(opts, [{ position: 'Secretary', optionId: A }, { position: 'President', optionId: B }])).toMatch(/position/i);
  });
  it('rejects a missing position and unknown positions', () => {
    expect(validateChoices(opts, [{ position: 'President', optionId: A }])).toMatch(/every position/i);
    expect(validateChoices(opts, [{ position: 'Chair', optionId: A }])).toMatch(/unknown/i);
  });
  it('handles polls (null position)', () => {
    const poll = [{ id: A, position: null }, { id: B, position: null }];
    expect(validateChoices(poll, [{ position: null, optionId: B }])).toBeNull();
    expect(validateChoices(poll, [{ position: null, optionId: A }, { position: null, optionId: B }])).toMatch(/more than one/i);
  });
});

describe('groupOptions', () => {
  it('groups by position in order of first appearance', () => {
    const g = groupOptions(opts);
    expect(g.map((x) => x.position)).toEqual(['President', 'Secretary']);
    expect(g[0]!.options).toHaveLength(2);
  });
});
