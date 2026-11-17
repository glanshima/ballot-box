import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { IntegrityReport } from './integrity';
import type { ElectionResults } from './results';
import { sha256Hex } from './results';

const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = MARGIN + 24;

export const PDF_LIMITS = {
  /** Nominees included in one nominations export. */
  nominees: 100,
  /** Attachment files embedded in one nominations export. */
  attachments: 80,
  attachmentBytes: 20 * 1024 * 1024,
  /** Rows included in one invitations export. */
  invitationRows: 2000,
  /** Pages copied from an attached PDF. */
  attachedPdfPages: 5,
} as const;

const INK = rgb(0.1, 0.13, 0.2);
const MUTED = rgb(0.38, 0.42, 0.5);
const RULE = rgb(0.82, 0.85, 0.89);
const INDIGO = rgb(0.31, 0.27, 0.9);
const GREEN = rgb(0.05, 0.45, 0.3);
const RED = rgb(0.65, 0.1, 0.1);
const BAND = rgb(0.96, 0.97, 0.99);

function asPdfText(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF]/g, '-')
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '?');
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const text = asPdfText(value);
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

type Cell = { text: string; width: number; bold?: boolean; color?: RGB };

class Writer {
  readonly doc: PDFDocument;
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  private pages: PDFPage[] = [];
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Adds a page if `height` does not fit and reports whether it did. */
  ensure(height: number): boolean {
    if (this.y - height < BOTTOM) {
      this.newPage();
      return true;
    }
    return false;
  }

  gap(height: number) {
    this.y -= height;
  }

  text(
    value: string,
    opts: { size?: number; font?: 'regular' | 'bold'; color?: RGB; indent?: number; gap?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.font === 'bold' ? this.bold : this.regular;
    const maxWidth = CONTENT_WIDTH - (opts.indent ?? 0);
    for (const line of wrapText(value, font, size, maxWidth)) {
      this.ensure(size * 1.35);
      this.page.drawText(line, {
        x: MARGIN + (opts.indent ?? 0),
        y: this.y - size,
        size,
        font,
        color: opts.color ?? INK,
      });
      this.y -= size * 1.35;
    }
    this.y -= opts.gap ?? 4;
  }

  brand() {
    this.text('BALLOT BOX', { size: 9, font: 'bold', color: INDIGO, gap: 10 });
  }

  h1(value: string) {
    this.text(value, { size: 20, font: 'bold', gap: 8 });
  }

  h2(value: string) {
    this.text(value, { size: 13, font: 'bold', gap: 4 });
  }

  label(value: string) {
    this.text(value, { size: 8.5, font: 'bold', color: MUTED, gap: 2 });
  }

  rule() {
    this.ensure(10);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness: 0.7,
      color: RULE,
    });
    this.y -= 10;
  }

  private rowLines(cells: Cell[], size: number) {
    return cells.map((c) =>
      wrapText(c.text, c.bold ? this.bold : this.regular, size, Math.max(8, c.width - 8)),
    );
  }

  private rowHeight(cells: Cell[], size: number) {
    const lines = this.rowLines(cells, size);
    return Math.max(...lines.map((l) => l.length), 1) * size * 1.25 + 6;
  }

  private drawRow(cells: Cell[], size: number, header = false) {
    const height = this.rowHeight(cells, size);
    const lines = this.rowLines(cells, size);
    if (header) {
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - height,
        width: CONTENT_WIDTH,
        height,
        color: BAND,
      });
    }
    let x = MARGIN;
    lines.forEach((cellLines, i) => {
      const cell = cells[i]!;
      const font = cell.bold || header ? this.bold : this.regular;
      cellLines.forEach((line, j) => {
        this.page.drawText(line, {
          x: x + 4,
          y: this.y - 3 - size - j * size * 1.25,
          size,
          font,
          color: cell.color ?? INK,
        });
      });
      x += cell.width;
    });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - height },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y - height },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= height;
  }

  /** Header row repeats after a page break. */
  table(header: Cell[], rows: Cell[][], size = 9) {
    this.ensure(this.rowHeight(header, size));
    this.drawRow(header, size, true);
    for (const row of rows) {
      if (this.ensure(this.rowHeight(row, size))) this.drawRow(header, size, true);
      this.drawRow(row, size);
    }
    this.y -= 6;
  }

  async appendPdf(bytes: Uint8Array) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = src.getPageCount();
    const copied = await this.doc.copyPages(src, src.getPageIndices().slice(0, PDF_LIMITS.attachedPdfPages));
    for (const p of copied) this.doc.addPage(p);
    if (total > PDF_LIMITS.attachedPdfPages) {
      this.newPage();
      this.text(`[Attached PDF truncated to the first ${PDF_LIMITS.attachedPdfPages} of ${total} pages]`, {
        size: 8.5,
        color: MUTED,
      });
    }
    // Continue on a fresh page so later text never lands on an appended document.
    this.newPage();
  }

  async image(bytes: Uint8Array, contentType: string) {
    const img =
      contentType === 'image/png' ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    const maxHeight = PAGE_HEIGHT - MARGIN * 2 - 40;
    const scale = Math.min(CONTENT_WIDTH / img.width, maxHeight / img.height, 1);
    const width = img.width * scale;
    const height = img.height * scale;
    this.ensure(height + 12);
    this.page.drawImage(img, {
      x: MARGIN + (CONTENT_WIDTH - width) / 2,
      y: this.y - height,
      width,
      height,
    });
    this.y -= height + 10;
  }

  finish(footer: string) {
    this.pages.forEach((page, i) => {
      page.drawLine({
        start: { x: MARGIN, y: MARGIN + 14 },
        end: { x: MARGIN + CONTENT_WIDTH, y: MARGIN + 14 },
        thickness: 0.5,
        color: RULE,
      });
      page.drawText(asPdfText(footer), {
        x: MARGIN,
        y: MARGIN,
        size: 7.5,
        font: this.regular,
        color: MUTED,
        maxWidth: CONTENT_WIDTH - 70,
      });
      page.drawText(`Page ${i + 1} of ${this.pages.length}`, {
        x: PAGE_WIDTH - MARGIN - 60,
        y: MARGIN,
        size: 7.5,
        font: this.regular,
        color: MUTED,
      });
    });
  }
}

async function openDocument(title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor('Ballot Box');
  doc.setCreator('Ballot Box');
  doc.setProducer('Ballot Box');
  doc.setCreationDate(new Date());
  const writer = new Writer(
    doc,
    await doc.embedFont(StandardFonts.Helvetica),
    await doc.embedFont(StandardFonts.HelveticaBold),
  );
  return { doc, w: writer };
}

function footerFor(exportedBy: string, exportedAt: Date): string {
  return `Exported by ${exportedBy} at ${exportedAt.toISOString()} (confidential)`;
}

const bytesOf = (dataBase64: string) => new Uint8Array(Buffer.from(dataBase64, 'base64'));

/** Copies into a plain ArrayBuffer so route handlers can pass it to NextResponse. */
export function pdfResponseBody(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

// ---------- Results ----------

export type ResultsPdfInput = {
  electionId: string;
  title: string;
  status: string;
  results: ElectionResults;
  integrity: IntegrityReport;
  exportedBy: string;
  exportedAt: Date;
};

/** SHA-256 over the canonical results payload that is printed in the PDF. */
export function resultsPayloadHash(electionId: string, results: ElectionResults): string {
  return sha256Hex(JSON.stringify({ electionId, results }));
}

export async function buildResultsPdf(input: ResultsPdfInput): Promise<Uint8Array> {
  const { electionId, title, status, results, integrity, exportedBy, exportedAt } = input;
  const hash = resultsPayloadHash(electionId, results);
  const { doc, w } = await openDocument(`${title} — Results`);

  w.brand();
  w.h1('Election results');
  w.text(title, { size: 14, font: 'bold', gap: 2 });
  const statusLabel =
    status === 'open' ? 'Open (live view — not final)' : status === 'published' ? 'Published (final)' : 'Closed (awaiting publication)';
  w.text(statusLabel, { size: 10, color: MUTED, gap: 2 });
  w.text(`Exported: ${exportedAt.toISOString()}`, { size: 9, color: MUTED, gap: 1 });
  w.text(`Exported by: ${exportedBy}`, { size: 9, color: MUTED, gap: 1 });
  w.text(`Election reference: ${electionId}`, { size: 9, color: MUTED, gap: 8 });

  w.rule();
  w.label('RESULTS PAYLOAD SHA-256');
  w.text(hash, { size: 8, gap: 10 });

  w.h2('Turnout');
  w.text(
    `${results.turnout.voted} of ${results.turnout.total} eligible voters voted (${results.turnout.percent}%).`,
    { size: 10, gap: 8 },
  );

  w.h2('Integrity check');
  w.text(integrity.ok ? 'PASS — ballot rows reconcile with turnout.' : 'FAILED — see the checks below.', {
    size: 10,
    font: 'bold',
    color: integrity.ok ? GREEN : RED,
    gap: 4,
  });
  for (const check of integrity.checks) {
    w.text(`${check.ok ? 'OK' : 'FAILED'} — ${check.label}: ${check.detail}`, {
      size: 9,
      color: check.ok ? INK : RED,
      gap: 2,
    });
  }
  w.gap(6);

  for (const position of results.positions) {
    w.ensure(60);
    w.h2(position.position ?? (results.positions.length === 1 ? 'Poll result' : 'No position'));
    w.text(
      `${position.totalBallots} ballot(s) for this position; ${position.abstentions} explicit abstention(s).`,
      { size: 9, color: MUTED, gap: 3 },
    );
    const rows: Cell[][] = position.options.map((o) => [
      { text: o.isWinner ? `${o.label} (winner)` : o.label, width: 250, bold: o.isWinner },
      { text: String(o.votes), width: 60 },
      { text: `${o.percent}%`, width: 80 },
      {
        text: o.isWinner ? 'Winner' : position.tie && o.votes === Math.max(...position.options.map((x) => x.votes)) ? 'Tie' : '',
        width: 100,
      },
    ]);
    rows.push([
      { text: '(abstain)', width: 250, color: MUTED },
      { text: String(position.abstentions), width: 60 },
      { text: `${position.totalBallots === 0 ? 0 : Math.round((position.abstentions / position.totalBallots) * 1000) / 10}%`, width: 80 },
      { text: '', width: 100 },
    ]);
    w.table(
      [
        { text: 'Option', width: 250, bold: true },
        { text: 'Votes', width: 60, bold: true },
        { text: '% of ballots', width: 80, bold: true },
        { text: 'Outcome', width: 100, bold: true },
      ],
      rows,
    );
    if (position.tie) w.text('Tie for first place: no winner is declared for this position.', { size: 9, color: RED, gap: 6 });
  }

  w.finish(footerFor(exportedBy, exportedAt));
  return doc.save();
}

// ---------- Nominations ----------

export type AttachmentExport = {
  kind: string;
  contentType: string;
  dataBase64: string;
  size: number;
};

export type NominatorExport = {
  name: string | null;
  email: string;
  createdAt: Date;
  attachments: AttachmentExport[];
};

export type NomineeExport = {
  position: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  bio: string | null;
  reviewNote: string | null;
  consentExpiresAt: Date | null;
  createdAt: Date;
  nominators: NominatorExport[];
};

export type SelfNominationExport = {
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  status: string;
  manifesto: string | null;
  receiptReference: string | null;
  hasReceipt: boolean;
  reviewNote: string | null;
  createdAt: Date;
};

export type NominationsPdfInput = {
  electionTitle: string;
  electionId: string;
  mode: 'member' | 'self';
  nominees: NomineeExport[];
  nominations: SelfNominationExport[];
  exportedBy: string;
  exportedAt: Date;
  omittedNominees?: number;
  omittedAttachments?: number;
};

const ATTACHMENT_LABEL: Record<string, string> = {
  membership_proof: 'Proof of membership',
  signature: 'Signature',
};

async function appendAttachments(w: Writer, nominator: NominatorExport, skipped: { n: number }) {
  if (nominator.attachments.length === 0) {
    w.text('No proof or signature attached.', { size: 9, color: MUTED, gap: 6 });
    return;
  }
  for (const a of nominator.attachments) {
    if (skipped.n > 0) {
      skipped.n--;
      continue;
    }
    w.label(`${ATTACHMENT_LABEL[a.kind] ?? a.kind} — ${a.contentType}, ${Math.round(a.size / 1024)} KB`);
    try {
      const bytes = bytesOf(a.dataBase64);
      if (a.contentType === 'application/pdf') await w.appendPdf(bytes);
      else if (a.contentType === 'image/png' || a.contentType === 'image/jpeg') await w.image(bytes, a.contentType);
      else {
        w.text(
          `[${a.contentType} attachments cannot be embedded in a PDF. Open it in the admin panel while the attachment is retained.]`,
          { size: 9, color: MUTED, gap: 6 },
        );
      }
    } catch {
      w.text('[This attachment could not be rendered.]', { size: 9, color: RED, gap: 6 });
    }
  }
}

export async function buildNominationsPdf(input: NominationsPdfInput): Promise<Uint8Array> {
  const { electionTitle, electionId, mode, nominees, nominations, exportedBy, exportedAt } = input;
  const { doc, w } = await openDocument(`${electionTitle} — Nominations`);

  w.brand();
  w.h1('Nominations report');
  w.text(electionTitle, { size: 14, font: 'bold', gap: 2 });
  w.text(mode === 'member' ? 'Verified-member nominations' : 'Self nominations', { size: 10, color: MUTED, gap: 2 });
  w.text(`Exported: ${exportedAt.toISOString()}`, { size: 9, color: MUTED, gap: 1 });
  w.text(`Exported by: ${exportedBy}`, { size: 9, color: MUTED, gap: 1 });
  w.text(`Election reference: ${electionId}`, { size: 9, color: MUTED, gap: 6 });
  w.rule();
  w.text(
    'This report contains private membership evidence and signatures. Handle it as sensitive personal data and keep it only as long as the election records require.',
    { size: 9, color: MUTED, gap: 10 },
  );

  if (mode === 'member') {
    const nominatorCount = nominees.reduce((n, x) => n + x.nominators.length, 0);
    w.h2('Summary');
    w.text(`${nominees.length} nominee(s); ${nominatorCount} verified nominator record(s).`, { size: 10, gap: 6 });
    if (input.omittedNominees) {
      w.text(
        `${input.omittedNominees} further nominee(s) were left out of this export (limit ${PDF_LIMITS.nominees}).`,
        { size: 9, color: RED, gap: 6 },
      );
    }
    if (input.omittedAttachments) {
      w.text(
        `${input.omittedAttachments} attachment(s) were left out of this export to keep it within the size limit.`,
        { size: 9, color: RED, gap: 6 },
      );
    }

    const skipped = { n: input.omittedAttachments ?? 0 };
    for (const n of nominees) {
      w.ensure(90);
      w.rule();
      w.h2(n.fullName || '(no name)');
      w.text(`Position: ${n.position ?? 'None'} · Status: ${n.status}`, { size: 9.5, color: MUTED, gap: 2 });
      w.text(`Contact: ${n.email}${n.phone ? ` · ${n.phone}` : ''}`, { size: 9.5, gap: 2 });
      w.text(`Nominators: ${n.nominators.length}`, { size: 9.5, gap: 2 });
      w.text(`Recorded: ${n.createdAt.toISOString()}`, { size: 9, color: MUTED, gap: 2 });
      if (n.consentExpiresAt) w.text(`Consent link expiry: ${n.consentExpiresAt.toISOString()}`, { size: 9, color: MUTED, gap: 2 });
      if (n.bio) w.text(n.bio, { size: 9.5, gap: 4 });
      if (n.reviewNote) w.text(`Review note: ${n.reviewNote}`, { size: 9, color: MUTED, gap: 4 });

      w.gap(2);
      if (n.nominators.length === 0) w.text('No verified nominators recorded.', { size: 9, color: MUTED, gap: 6 });
      for (const [i, nominator] of n.nominators.entries()) {
        w.ensure(40);
        w.text(`${i + 1}. ${nominator.name ?? '(no name)'} — ${nominator.email}`, { size: 9.5, gap: 1 });
        w.text(`Nominated: ${nominator.createdAt.toISOString()}`, { size: 8.5, color: MUTED, gap: 3 });
        await appendAttachments(w, nominator, skipped);
      }
    }
  } else {
    w.h2('Summary');
    w.text(`${nominations.length} self nomination(s).`, { size: 10, gap: 6 });
    for (const n of nominations) {
      w.ensure(70);
      w.rule();
      w.h2(n.fullName || '(no name)');
      w.text(`Position: ${n.position ?? 'None'} · Status: ${n.status}`, { size: 9.5, color: MUTED, gap: 2 });
      w.text(`Contact: ${n.email}${n.phone ? ` · ${n.phone}` : ''}`, { size: 9.5, gap: 2 });
      w.text(`Received: ${n.createdAt.toISOString()}`, { size: 9, color: MUTED, gap: 2 });
      w.text(
        n.hasReceipt
          ? `Receipt attached${n.receiptReference ? ` · Ref: ${n.receiptReference}` : ''}. Open it in the admin panel.`
          : `No receipt${n.receiptReference ? ` · Ref: ${n.receiptReference}` : ''}.`,
        { size: 9, color: MUTED, gap: 2 },
      );
      if (n.manifesto) w.text(n.manifesto, { size: 9.5, gap: 3 });
      if (n.reviewNote) w.text(`Review note: ${n.reviewNote}`, { size: 9, color: MUTED, gap: 3 });
    }
    w.gap(4);
    w.text('Self-nomination photos and receipts are stored as public links and are not embedded in this PDF.', {
      size: 8.5,
      color: MUTED,
      gap: 4,
    });
  }

  w.finish(footerFor(exportedBy, exportedAt));
  return doc.save();
}

// ---------- Invitations status ----------

export type InvitationPdfRow = {
  name: string | null;
  email: string;
  inviteStatus: string;
  hasVoted: boolean;
};

/**
 * Whitelists the columns that may ever reach the invitations PDF. Voting links
 * and token hashes are deliberately not part of this shape.
 */
export function invitationPdfRows(
  voters: { name: string | null; email: string; inviteStatus: string; hasVoted: boolean }[],
): InvitationPdfRow[] {
  return voters.map((v) => ({ name: v.name, email: v.email, inviteStatus: v.inviteStatus, hasVoted: v.hasVoted }));
}

export type InvitationsPdfInput = {
  electionTitle: string;
  electionId: string;
  rows: InvitationPdfRow[];
  exportedBy: string;
  exportedAt: Date;
  omittedRows?: number;
};

export async function buildInvitationsPdf(input: InvitationsPdfInput): Promise<Uint8Array> {
  const { electionTitle, electionId, rows, exportedBy, exportedAt } = input;
  const { doc, w } = await openDocument(`${electionTitle} — Invitations status`);

  const count = (s: string) => rows.filter((r) => r.inviteStatus === s && !r.hasVoted).length;
  const voted = rows.filter((r) => r.hasVoted).length;

  w.brand();
  w.h1('Invitations status report');
  w.text(electionTitle, { size: 14, font: 'bold', gap: 2 });
  w.text(`Exported: ${exportedAt.toISOString()}`, { size: 9, color: MUTED, gap: 1 });
  w.text(`Exported by: ${exportedBy}`, { size: 9, color: MUTED, gap: 1 });
  w.text(`Election reference: ${electionId}`, { size: 9, color: MUTED, gap: 6 });
  w.text('This report never contains voting links or tokens.', { size: 9, font: 'bold', gap: 8 });
  w.rule();

  w.h2('Summary');
  w.text(
    `${rows.length} voter(s): ${count('sent')} sent, ${count('exported')} exported, ${count('failed')} failed, ${count('pending')} not sent, ${voted} voted.`,
    { size: 10, gap: 6 },
  );
  if (input.omittedRows) {
    w.text(`${input.omittedRows} further voter(s) were left out of this export (limit ${PDF_LIMITS.invitationRows}).`, {
      size: 9,
      color: RED,
      gap: 6,
    });
  }

  w.table(
    [
      { text: 'Name', width: 130, bold: true },
      { text: 'Email', width: 220, bold: true },
      { text: 'Invite status', width: 80, bold: true },
      { text: 'Voted', width: 60, bold: true },
    ],
    rows.map((r) => [
      { text: r.name ?? '', width: 130 },
      { text: r.email, width: 220 },
      { text: r.hasVoted ? 'sent' : r.inviteStatus, width: 80 },
      { text: r.hasVoted ? 'Yes' : 'No', width: 60 },
    ]),
    8.5,
  );

  w.finish(footerFor(exportedBy, exportedAt));
  return doc.save();
}
