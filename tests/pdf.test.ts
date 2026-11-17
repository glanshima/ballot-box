import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { IntegrityReport } from '@/lib/integrity';
import {
  buildInvitationsPdf,
  buildNominationsPdf,
  buildResultsPdf,
  invitationPdfRows,
  resultsPayloadHash,
} from '@/lib/pdf';
import type { ElectionResults } from '@/lib/results';

const results: ElectionResults = {
  positions: [
    {
      position: 'Chair',
      abstentions: 1,
      totalBallots: 5,
      tie: false,
      options: [
        { optionId: '11111111-1111-4111-8111-111111111111', label: 'Alice', imageUrl: null, votes: 3, percent: 60, isWinner: true },
        { optionId: '22222222-2222-4222-8222-222222222222', label: 'Bob', imageUrl: null, votes: 1, percent: 20, isWinner: false },
      ],
    },
  ],
  turnout: { voted: 5, total: 12, percent: 41.7 },
};

const integrity: IntegrityReport = {
  ok: true,
  voted: 5,
  eligible: 12,
  ballots: 5,
  positions: 1,
  checks: [{ label: 'Ballot rows match turnout', ok: true, detail: '5 = 5' }],
};

// 1x1 transparent PNG
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const exportedAt = new Date('2026-11-17T12:00:00.000Z');

describe('PDF exports', () => {
  it('hashes the results payload deterministically', () => {
    const a = resultsPayloadHash('e1', results);
    const b = resultsPayloadHash('e1', results);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(resultsPayloadHash('e2', results));
  });

  it('builds a valid results PDF with the integrity report', async () => {
    const bytes = await buildResultsPdf({
      electionId: '11111111-1111-4111-8111-111111111111',
      title: 'AGM 2026',
      status: 'published',
      results,
      integrity,
      exportedBy: 'admin@example.com',
      exportedAt,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(0);
  });

  it('builds a member nominations PDF and embeds image and PDF attachments', async () => {
    const attached = await PDFDocument.create();
    attached.addPage();
    const attachedPdf = Buffer.from(await attached.save()).toString('base64');

    const bytes = await buildNominationsPdf({
      electionTitle: 'AGM 2026',
      electionId: '11111111-1111-4111-8111-111111111111',
      mode: 'member',
      nominees: [
        {
          position: 'Chair',
          fullName: 'Zoë Łukasz \u2014 Chair',
          email: 'zoe@example.com',
          phone: null,
          status: 'ready',
          bio: 'Bio text',
          reviewNote: null,
          consentExpiresAt: exportedAt,
          createdAt: exportedAt,
          nominators: [
            {
              name: 'Sam',
              email: 'sam@example.com',
              createdAt: exportedAt,
              attachments: [
                { kind: 'membership_proof', contentType: 'image/png', dataBase64: PNG_1PX, size: 68 },
                { kind: 'membership_proof', contentType: 'application/pdf', dataBase64: attachedPdf, size: 600 },
                { kind: 'signature', contentType: 'image/webp', dataBase64: PNG_1PX, size: 68 },
              ],
            },
          ],
        },
      ],
      nominations: [],
      exportedBy: 'admin@example.com',
      exportedAt,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('builds a self-nomination PDF', async () => {
    const bytes = await buildNominationsPdf({
      electionTitle: 'AGM 2026',
      electionId: '11111111-1111-4111-8111-111111111111',
      mode: 'self',
      nominees: [],
      nominations: [
        {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+1 555 0100',
          position: 'Chair',
          status: 'pending',
          manifesto: 'manifesto',
          receiptReference: 'REF-1',
          hasReceipt: true,
          reviewNote: null,
          createdAt: exportedAt,
        },
      ],
      exportedBy: 'admin@example.com',
      exportedAt,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });

  it('never passes tokens into the invitations report', async () => {
    const token = 'super-secret-voting-token-value';
    const source = [
      { name: 'Alice', email: 'alice@example.com', inviteStatus: 'sent', hasVoted: true, tokenHash: token },
    ];
    const rows = invitationPdfRows(source);
    expect(rows).toEqual([
      { name: 'Alice', email: 'alice@example.com', inviteStatus: 'sent', hasVoted: true },
    ]);
    expect(JSON.stringify(rows)).not.toContain(token);

    const bytes = await buildInvitationsPdf({
      electionTitle: 'AGM 2026',
      electionId: '11111111-1111-4111-8111-111111111111',
      rows,
      exportedBy: 'admin@example.com',
      exportedAt,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });
});
