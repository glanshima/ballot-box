'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Point = { x: number; y: number }; // normalised 0..1 inside the pad

const HEIGHT = 176;
const PAD = 12;
const INK = '#0f172a';
const LINE = 2.4;

function strokePath(ctx: CanvasRenderingContext2D, stroke: Point[], width: number) {
  if (stroke.length === 0) return;
  ctx.beginPath();
  const first = stroke[0]!;
  ctx.moveTo(first.x * width, first.y * HEIGHT);
  for (let i = 1; i < stroke.length; i++) {
    const p = stroke[i]!;
    ctx.lineTo(p.x * width, p.y * HEIGHT);
  }
  if (stroke.length === 1) ctx.lineTo(first.x * width + 0.1, first.y * HEIGHT + 0.1);
  ctx.stroke();
}

/** White-background PNG trimmed to the inked area; null when nothing was drawn. */
function exportPng(strokes: Point[][], width: number): string | null {
  if (strokes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      const x = p.x * width;
      const y = p.y * HEIGHT;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const outW = Math.max(160, Math.ceil(maxX - minX) + PAD * 2);
  const outH = Math.max(72, Math.ceil(maxY - minY) + PAD * 2);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.translate(PAD - minX, PAD - minY);
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) strokePath(ctx, stroke, width);
  return canvas.toDataURL('image/png');
}

/**
 * Draw-with-mouse/touch/pen signature pad. Reports a trimmed white PNG data URL
 * after each stroke (null when cleared). The page background does not scroll
 * while signing because the canvas sets `touch-action: none`.
 */
export function SignaturePad({ onChange, disabled }: { onChange: (dataUrl: string | null) => void; disabled?: boolean }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Point[][]>([]);
  const active = useRef<Point[] | null>(null);
  const [width, setWidth] = useState(0);
  const [hasInk, setHasInk] = useState(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    canvas.style.width = '100%';
    canvas.style.height = `${HEIGHT}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, HEIGHT);

    ctx.save();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(16, HEIGHT - 42);
    ctx.lineTo(width - 16, HEIGHT - 42);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes.current) strokePath(ctx, stroke, width);
  }, [width]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setWidth(Math.round(box.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    paint();
  }, [paint]);

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic pointers; drawing still works.
    }
    const stroke = [pointOf(e)];
    strokes.current = [...strokes.current, stroke];
    active.current = stroke;
    setHasInk(true);
    paint();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = active.current;
    const canvas = canvasRef.current;
    if (!stroke || !canvas) return;
    const p = pointOf(e);
    const prev = stroke[stroke.length - 1]!;
    stroke.push(p);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x * width, prev.y * HEIGHT);
    ctx.lineTo(p.x * width, p.y * HEIGHT);
    ctx.stroke();
    ctx.restore();
  }

  function onPointerUp() {
    if (!active.current) return;
    active.current = null;
    onChange(exportPng(strokes.current, width));
  }

  function clear() {
    strokes.current = [];
    active.current = null;
    setHasInk(false);
    onChange(null);
    paint();
  }

  return (
    <div ref={boxRef}>
      <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Signature drawing area. Draw with a mouse, finger or pen, or upload a scan instead."
          className="block w-full cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="hint mt-0">
          {hasInk ? 'Signature captured. Use Clear to start again.' : 'Draw your signature above the line.'}
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={clear} disabled={disabled || !hasInk}>
          Clear
        </button>
      </div>
    </div>
  );
}
