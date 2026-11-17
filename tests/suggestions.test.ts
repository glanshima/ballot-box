import { describe, expect, it } from 'vitest';
import { normalizeTitle } from '@/lib/nominations/rules';
import { canDecideSuggestion, countsTowardCap, duplicateTitleError } from '@/lib/suggestions';
import { pathnameAllowed, policyFor, requestedPathname } from '@/lib/upload-policy';
import { suggestionSchema } from '@/lib/validators';

const E = '11111111-1111-4111-8111-111111111111';

describe('poll suggestions', () => {
  it('normalises case and whitespace for duplicate detection', () => {
    expect(normalizeTitle('  New   Club  Logo ')).toBe('new club logo');
    expect(normalizeTitle('NEW CLUB LOGO')).toBe(normalizeTitle('new club   logo'));
  });

  it('rejects titles that already exist as options or suggestions', () => {
    expect(duplicateTitleError(['New club logo'], ' new   CLUB logo ')).toMatch(/already/i);
    expect(duplicateTitleError(['Other'], 'New club logo')).toBeNull();
  });

  it('only pending suggestions can be approved or rejected', () => {
    expect(canDecideSuggestion('pending')).toBe(true);
    expect(canDecideSuggestion('approved')).toBe(false);
    expect(canDecideSuggestion('rejected')).toBe(false);
  });

  it('rejected suggestions do not count toward the cap', () => {
    expect(countsTowardCap('pending')).toBe(true);
    expect(countsTowardCap('approved')).toBe(true);
    expect(countsTowardCap('rejected')).toBe(false);
  });

  it('validates the suggestion payload', () => {
    expect(suggestionSchema.safeParse({ electionId: E, title: '  New item  ', description: '', imageUrl: '', imagePath: '' }).success).toBe(false);
    expect(suggestionSchema.safeParse({ electionId: E, title: '  New item  ', description: '' }).success).toBe(true);
    expect(suggestionSchema.parse({ electionId: E, title: '  New item  ' }).title).toBe('New item');
    expect(suggestionSchema.safeParse({ electionId: E, title: 'x' }).success).toBe(false);
    expect(suggestionSchema.safeParse({ electionId: E, title: 'New item', description: 'x'.repeat(1001) }).success).toBe(false);
    expect(suggestionSchema.safeParse({ electionId: E, title: 'New item', imageUrl: 'https://example.com/a.jpg' }).success).toBe(false);
  });

  it('uploads suggestion images into their own folder', () => {
    expect(policyFor('suggestion').prefix).toBe('suggestions');
    const path = requestedPathname('suggestion', E, 'image/png');
    expect(path).toMatch(new RegExp(`^suggestions/${E}/[0-9a-f-]{36}\\.png$`));
    expect(pathnameAllowed('suggestion', E, path)).toBe(true);
    expect(pathnameAllowed('suggestion', E, `options/${E}/abc.png`)).toBe(false);
  });
});
