'use client';

import { useState } from 'react';
import type { ElectionResults } from '@/lib/results';

const WIDTH = 1600;
const PAD = 72;
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const INK = '#0f172a';
const MUTED = '#64748b';
const INDIGO = '#4338ca';
const GREEN = '#047857';
const RULE = '#e2e8f0';
const PALE = '#f1f5f9';

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'results'
  );
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}\u2026`).width > maxWidth) out = out.slice(0, -1);
  return `${out}\u2026`;
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

function render(canvas: HTMLCanvasElement, title: string, results: ElectionResults, hash: string): void {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas is not available');

  measure.font = `700 54px ${SANS}`;
  const titleLines = wrap(measure, title, WIDTH - PAD * 2);

  const rowH = 82;
  const positionHeight = (p: ElectionResults['positions'][number]) =>
    58 + p.options.length * rowH + 48 + (p.tie ? 44 : 0) + 40;
  const height =
    600 +
    titleLines.length * 64 +
    results.positions.reduce((sum, p) => sum + positionHeight(p), 0);

  canvas.width = WIDTH;
  canvas.height = Math.min(Math.max(height, 900), 16000);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = INDIGO;
  ctx.fillRect(0, 0, canvas.width, 14);

  let y = PAD + 10;
  ctx.textBaseline = 'top';
  ctx.fillStyle = INDIGO;
  ctx.font = `700 22px ${SANS}`;
  ctx.fillText('Ballot Box', PAD, y);
  ctx.fillStyle = MUTED;
  ctx.font = `500 20px ${SANS}`;
  ctx.fillText('Official results', WIDTH - PAD - ctx.measureText('Official results').width, y + 2);
  y += 48;

  ctx.fillStyle = INK;
  ctx.font = `700 54px ${SANS}`;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y);
    y += 64;
  }

  y += 10;
  ctx.fillStyle = MUTED;
  ctx.font = `500 21px ${SANS}`;
  const generated = new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  ctx.fillText(`Generated ${generated}`, PAD, y);
  y += 38;

  ctx.fillStyle = PALE;
  const hashH = 86;
  ctx.beginPath();
  ctx.roundRect(PAD, y, WIDTH - PAD * 2, hashH, 14);
  ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.font = `700 16px ${SANS}`;
  ctx.fillText('RESULTS SHA-256', PAD + 24, y + 18);
  ctx.fillStyle = INK;
  ctx.font = `500 20px ${MONO}`;
  ctx.fillText(hash, PAD + 24, y + 46);
  y += hashH + 28;

  const stats: [string, string][] = [
    ['Turnout', `${results.turnout.percent}%`],
    ['Ballots cast', String(results.turnout.voted)],
    ['Eligible voters', String(results.turnout.total)],
  ];
  const gap = 20;
  const boxW = (WIDTH - PAD * 2 - gap * 2) / 3;
  const boxH = 108;
  stats.forEach(([label, value], i) => {
    const x = PAD + i * (boxW + gap);
    ctx.fillStyle = PALE;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 16);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.font = `700 17px ${SANS}`;
    ctx.fillText(label.toUpperCase(), x + 24, y + 22);
    ctx.fillStyle = i === 0 ? INDIGO : INK;
    ctx.font = `700 40px ${SANS}`;
    ctx.fillText(value, x + 24, y + 52);
  });
  y += boxH + 46;

  for (const p of results.positions) {
    ctx.fillStyle = INK;
    ctx.font = `700 32px ${SANS}`;
    ctx.fillText(ellipsize(ctx, p.position ?? 'Results', WIDTH - PAD * 2 - 260), PAD, y);
    const total = `${p.totalBallots} ${p.totalBallots === 1 ? 'ballot' : 'ballots'}`;
    ctx.fillStyle = MUTED;
    ctx.font = `500 19px ${SANS}`;
    ctx.fillText(total, WIDTH - PAD - ctx.measureText(total).width, y + 10);
    y += 58;

    for (const o of p.options) {
      ctx.fillStyle = o.isWinner ? GREEN : INK;
      ctx.font = `${o.isWinner ? 700 : 600} 24px ${SANS}`;
      const label = ellipsize(ctx, o.label, WIDTH - PAD * 2 - 240);
      ctx.fillText(label, PAD, y);
      if (o.isWinner) {
        const labelWidth = ctx.measureText(label).width;
        ctx.fillStyle = GREEN;
        ctx.font = `700 15px ${SANS}`;
        ctx.fillText('WINNER', PAD + labelWidth + 16, y + 7);
      }
      const score = `${o.percent}%  (${o.votes})`;
      ctx.fillStyle = INK;
      ctx.font = `700 24px ${SANS}`;
      ctx.fillText(score, WIDTH - PAD - ctx.measureText(score).width, y);
      y += 38;

      const barW = WIDTH - PAD * 2;
      ctx.fillStyle = RULE;
      ctx.beginPath();
      ctx.roundRect(PAD, y, barW, 13, 7);
      ctx.fill();
      const fillW = Math.max(0, Math.min(barW, (o.percent / 100) * barW));
      if (fillW > 0) {
        ctx.fillStyle = o.isWinner ? GREEN : INDIGO;
        ctx.beginPath();
        ctx.roundRect(PAD, y, fillW, 13, 7);
        ctx.fill();
      }
      y += 44;
    }

    const ap = pct(p.abstentions, p.totalBallots);
    ctx.fillStyle = MUTED;
    ctx.font = `500 20px ${SANS}`;
    ctx.fillText('Abstained', PAD, y);
    const abstainScore = `${ap}%  (${p.abstentions})`;
    ctx.fillText(abstainScore, WIDTH - PAD - ctx.measureText(abstainScore).width, y);
    y += 48;

    if (p.tie) {
      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      ctx.roundRect(PAD, y, WIDTH - PAD * 2, 40, 10);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.font = `600 19px ${SANS}`;
      ctx.fillText('Tie: more than one option has the highest vote count, so no winner is declared.', PAD + 16, y + 11);
      y += 44;
    }
    y += 40;
  }

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, canvas.height - 86);
  ctx.lineTo(WIDTH - PAD, canvas.height - 86);
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = `500 17px ${SANS}`;
  ctx.fillText('Generated by Ballot Box. Verify against the results hash above.', PAD, canvas.height - 66);
}

export function ResultsImageExport({
  title,
  results,
  hash,
}: {
  title: string;
  results: ElectionResults;
  hash: string;
}) {
  const [busy, setBusy] = useState<'png' | 'jpeg' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function download(type: 'png' | 'jpeg') {
    setError(null);
    setBusy(type);
    try {
      const canvas = document.createElement('canvas');
      render(canvas, title, results, hash);
      canvas.toBlob(
        (blob) => {
          setBusy(null);
          if (!blob) {
            setError('The image could not be generated. Please try again.');
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${slug(title)}-results-${stamp()}.${type === 'png' ? 'png' : 'jpg'}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        },
        type === 'png' ? 'image/png' : 'image/jpeg',
        0.92,
      );
    } catch {
      setBusy(null);
      setError('The image could not be generated in this browser.');
    }
  }

  return (
    <div className="card">
      <h2 className="font-bold text-slate-900">Export results image</h2>
      <p className="hint mb-3">
        A shareable image with the title, generation time and results hash. PNG is sharpest; JPEG is smaller for messaging
        apps that compress uploads.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => download('png')} disabled={busy !== null}>
          {busy === 'png' ? 'Rendering…' : 'Download PNG'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => download('jpeg')} disabled={busy !== null}>
          {busy === 'jpeg' ? 'Rendering…' : 'Download JPEG'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
