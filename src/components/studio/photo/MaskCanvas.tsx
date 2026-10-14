'use client';
import { useEffect, useRef, useState } from 'react';
import type { PixelBuffer } from '@/lib/studio/render/sampling';
import { applyStamp, stampBounds, strokeStamps, type BrushStamp, type MaskHistory } from '@/lib/studio/photo/mask-edit';
import type { BrushSettings } from './PhotoStudio';
import { PhotoFrame, photoPoint } from './PhotoFrame';

// Floor tint over the photo (teal reads clearly on wood, tiles and carpet).
const TINT = [36, 196, 160] as const,
  ALPHA = 0.45;

function paintTint(image: ImageData, mask: Uint8Array, x0 = 0, y0 = 0, w = image.width, h = image.height) {
  const W = image.width,
    d = image.data;
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const i = y * W + x;
      d[i * 4] = TINT[0];
      d[i * 4 + 1] = TINT[1];
      d[i * 4 + 2] = TINT[2];
      d[i * 4 + 3] = mask[i] * ALPHA;
    }
}

export function MaskCanvas({
  photo,
  history,
  version,
  brush,
  busy,
  onEdit,
}: {
  photo: PixelBuffer;
  history: MaskHistory;
  version: number;
  brush: BrushSettings;
  busy: boolean;
  onEdit: () => void;
}) {
  const overlay = useRef<HTMLCanvasElement>(null),
    tint = useRef<ImageData | null>(null),
    last = useRef<BrushStamp | null>(null),
    [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const mask = history.mask;
  // Full repaint whenever the mask changed outside a stroke (AI, undo, clear).
  useEffect(() => {
    const c = overlay.current;
    if (!c) return;
    c.width = mask.width;
    c.height = mask.height;
    tint.current = new ImageData(mask.width, mask.height);
    paintTint(tint.current, mask.data);
    c.getContext('2d')?.putImageData(tint.current, 0, 0);
  }, [mask, version]);
  const draw = (stamps: BrushStamp[]) => {
    const b = stampBounds(stamps, mask.width, mask.height),
      ctx = overlay.current?.getContext('2d');
    if (!b || !tint.current || !ctx) return;
    history.extend(b);
    for (const s of stamps) applyStamp(mask, photo, s);
    paintTint(tint.current, mask.data, ...b);
    ctx.putImageData(tint.current, 0, 0, ...b);
  };
  const stampAt = (e: React.PointerEvent) => {
    const p = photoPoint(e, e.currentTarget, photo);
    return { x: p.x, y: p.y, radius: (brush.size / 2) * p.scale, mode: brush.mode, snap: brush.snap } satisfies BrushStamp;
  };
  return (
    <PhotoFrame photo={photo} className={busy ? 'is-busy' : ''}>
      <canvas
        ref={overlay}
        className="photo-layer photo-paint"
        aria-hidden="true"
        onPointerDown={e => {
          if (!e.isPrimary || busy) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const s = stampAt(e);
          last.current = s;
          history.begin(stampBounds([s], mask.width, mask.height) ?? [0, 0, 1, 1]);
          draw([s]);
        }}
        onPointerMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
          if (!last.current || !e.isPrimary) return;
          const s = stampAt(e),
            stamps = strokeStamps(last.current, s);
          last.current = s;
          draw(stamps);
        }}
        onPointerUp={() => {
          if (!last.current) return;
          last.current = null;
          history.end();
          onEdit();
        }}
        onPointerCancel={() => {
          if (!last.current) return;
          last.current = null;
          history.end();
          onEdit();
        }}
        onPointerLeave={() => setCursor(null)}
      />
      {cursor && (
        <span
          className={`photo-brush-cursor is-${brush.mode}`}
          aria-hidden="true"
          style={{ left: cursor.x, top: cursor.y, width: brush.size, height: brush.size }}
        />
      )}
      {busy && <span className="studio-progress" aria-hidden="true" />}
    </PhotoFrame>
  );
}
