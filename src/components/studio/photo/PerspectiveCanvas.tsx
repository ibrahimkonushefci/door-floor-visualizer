'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { Quad, Vec2 } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import type { PixelBuffer } from '@/lib/studio/render/sampling';
import type { FloorMask } from '@/lib/studio/photo/segment';
import { plankPreviewLines, type FloorPlane } from '@/lib/studio/photo/perspective';
import { maskBounds } from '@/lib/studio/photo/lighting';
import { PhotoFrame } from './PhotoFrame';

// Overlays are drawn at up to this width (CSS scales them); lines stay crisp enough.
const OVERLAY_MAX = 1400;

export function PerspectiveCanvas({
  photo,
  mask,
  maskVersion,
  quad,
  plane,
  board,
  rotation,
  messages: m,
  onQuad,
}: {
  photo: PixelBuffer;
  mask: FloorMask;
  maskVersion: number;
  quad: Quad;
  plane: FloorPlane | null;
  board: { lengthMm: number; widthMm: number } | null;
  rotation: 0 | 90;
  messages: Messages;
  onQuad: (quad: Quad) => void;
}) {
  const dim = useRef<HTMLCanvasElement>(null),
    lines = useRef<HTMLCanvasElement>(null),
    frame = useRef<HTMLDivElement>(null);
  const k = Math.min(1, OVERLAY_MAX / photo.width),
    w = Math.round(photo.width * k),
    h = Math.round(photo.height * k);
  // The floor as an alpha image at overlay size (used to dim the rest and clip the lines).
  const floorAlpha = useMemo(() => {
    const full = document.createElement('canvas');
    full.width = mask.width;
    full.height = mask.height;
    const image = new ImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) image.data[i * 4 + 3] = mask.data[i];
    full.getContext('2d')!.putImageData(image, 0, 0);
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    small.getContext('2d')!.drawImage(full, 0, 0, w, h);
    full.width = full.height = 0;
    return small;
    // maskVersion stands for the mask's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mask, maskVersion, w, h]);
  const top = useMemo(() => (maskBounds(mask)?.[1] ?? 0) / mask.height, [mask, maskVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = dim.current?.getContext('2d');
    if (!c || !dim.current) return;
    dim.current.width = w;
    dim.current.height = h;
    c.fillStyle = 'rgb(18 23 17 / 0.45)';
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(floorAlpha, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }, [floorAlpha, w, h]);
  useEffect(() => {
    const canvas = lines.current,
      c = canvas?.getContext('2d');
    if (!canvas || !c) return;
    canvas.width = w;
    canvas.height = h;
    if (!plane || !board) return;
    c.strokeStyle = 'rgb(255 255 255 / 0.85)';
    c.lineWidth = Math.max(1, w / 900);
    c.beginPath();
    for (const [a, b] of plankPreviewLines(plane, board, rotation, { top, bottom: 1 })) {
      c.moveTo(a[0] * w, a[1] * h);
      c.lineTo(b[0] * w, b[1] * h);
    }
    c.stroke();
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(floorAlpha, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }, [plane, board, rotation, top, floorAlpha, w, h]);

  const move = (i: number, p: Vec2) => {
    const next = quad.map((q, j) => (j === i ? ([Math.max(0, Math.min(1, p[0])), Math.max(0, Math.min(1, p[1]))] as Vec2) : q));
    onQuad(next as unknown as Quad);
  };
  const at = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = frame.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const names = [m['photo.corner'] + ' 1', m['photo.corner'] + ' 2', m['photo.corner'] + ' 3', m['photo.corner'] + ' 4'];
  return (
    <PhotoFrame photo={photo}>
      <div ref={frame} className="photo-layer photo-perspective">
        <canvas ref={dim} className="photo-layer" aria-hidden="true" />
        <canvas ref={lines} className="photo-layer" aria-hidden="true" />
        <svg className="photo-layer" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            className={`photo-quad${plane ? '' : ' is-invalid'}`}
            points={quad.map(p => `${p[0]},${p[1]}`).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {quad.map((p, i) => (
          <button
            type="button"
            key={i}
            className={`photo-handle${plane ? '' : ' is-invalid'}`}
            style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }}
            aria-label={names[i]}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId);
              e.currentTarget.dataset.dragging = '1';
            }}
            onPointerMove={e => {
              if (e.currentTarget.dataset.dragging) move(i, at(e));
            }}
            onPointerUp={e => delete e.currentTarget.dataset.dragging}
            onPointerCancel={e => delete e.currentTarget.dataset.dragging}
            onKeyDown={e => {
              const step = e.shiftKey ? 0.02 : 0.004,
                d: Record<string, Vec2> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              if (!d[e.key]) return;
              e.preventDefault();
              move(i, [p[0] + d[e.key][0], p[1] + d[e.key][1]]);
            }}
          />
        ))}
      </div>
    </PhotoFrame>
  );
}
