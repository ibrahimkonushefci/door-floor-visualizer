// Touch-up of the floor mask: soft round brush and eraser, optional edge
// snapping (the brush only paints pixels that look like the colour under its
// centre, so strokes stop at the edge of a sofa or a wall), undo and redo.
import type { PixelBuffer } from '../render/sampling';
import type { FloorMask } from './segment';

export interface BrushStamp {
  x: number;
  y: number;
  /** Radius in photo pixels. */
  radius: number;
  mode: 'paint' | 'erase';
  /** Edge snapping: only affect pixels whose colour is close to the colour under the centre. */
  snap: boolean;
}
/** Colour distance (sRGB units) at which snapping lets a pixel through at half strength. */
export const SNAP_DISTANCE = 34;

/** Bounding box of a stroke's stamps, clipped to the mask. */
export function stampBounds(stamps: readonly BrushStamp[], width: number, height: number) {
  let x0 = width,
    y0 = height,
    x1 = 0,
    y1 = 0;
  for (const s of stamps) {
    x0 = Math.min(x0, Math.floor(s.x - s.radius - 1));
    y0 = Math.min(y0, Math.floor(s.y - s.radius - 1));
    x1 = Math.max(x1, Math.ceil(s.x + s.radius + 1));
    y1 = Math.max(y1, Math.ceil(s.y + s.radius + 1));
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(width, x1);
  y1 = Math.min(height, y1);
  return x1 > x0 && y1 > y0 ? ([x0, y0, x1 - x0, y1 - y0] as const) : null;
}

/** Applies one stamp in place; returns nothing. Coverage moves towards 255 (paint) or 0 (erase). */
export function applyStamp(mask: FloorMask, image: PixelBuffer, s: BrushStamp) {
  const { width: W, height: H, data } = mask,
    d = image.data,
    cx = Math.round(Math.max(0, Math.min(W - 1, s.x))),
    cy = Math.round(Math.max(0, Math.min(H - 1, s.y))),
    ci = (cy * W + cx) * 4,
    [r0, g0, b0] = [d[ci], d[ci + 1], d[ci + 2]],
    x0 = Math.max(0, Math.floor(s.x - s.radius)),
    x1 = Math.min(W - 1, Math.ceil(s.x + s.radius)),
    y0 = Math.max(0, Math.floor(s.y - s.radius)),
    y1 = Math.min(H - 1, Math.ceil(s.y + s.radius)),
    soft = Math.max(1, s.radius * 0.25);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - s.x, y - s.y);
      if (dist > s.radius) continue;
      // Soft rim, full strength inside.
      let w = Math.min(1, (s.radius - dist) / soft);
      if (s.snap) {
        const i = (y * W + x) * 4,
          dc = Math.hypot(d[i] - r0, d[i + 1] - g0, d[i + 2] - b0);
        w *= 1 / (1 + (dc / SNAP_DISTANCE) ** 4);
      }
      if (w <= 0.004) continue;
      const k = y * W + x,
        target = s.mode === 'paint' ? 255 : 0;
      data[k] = Math.round(data[k] + (target - data[k]) * w);
    }
}

/** Stamps along a segment, spaced at a quarter radius, so fast strokes leave no gaps. */
export function strokeStamps(from: BrushStamp, to: { x: number; y: number }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y),
    steps = Math.max(1, Math.ceil(len / Math.max(1, from.radius * 0.25))),
    out: BrushStamp[] = [];
  for (let i = 1; i <= steps; i++)
    out.push({ ...from, x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  return out;
}

interface Edit {
  bounds: readonly [number, number, number, number];
  before: Uint8Array;
  after: Uint8Array;
}
const crop = (mask: FloorMask, [x, y, w, h]: readonly [number, number, number, number]) => {
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) out.set(mask.data.subarray((y + r) * mask.width + x, (y + r) * mask.width + x + w), r * w);
  return out;
};
const paste = (mask: FloorMask, [x, y, w, h]: readonly [number, number, number, number], src: Uint8Array) => {
  for (let r = 0; r < h; r++) mask.data.set(src.subarray(r * w, (r + 1) * w), (y + r) * mask.width + x);
};

/**
 * Undo/redo of mask edits. Each entry keeps only the changed rectangle before
 * and after, and the history is capped by bytes (a full 2048×1536 replacement
 * is 3 MB per side), so long touch-up sessions stay small on an iPad.
 */
export function createMaskHistory(mask: FloorMask, maxBytes = 48 * 1024 * 1024) {
  const undo: Edit[] = [],
    redo: Edit[] = [];
  let open: { bounds: readonly [number, number, number, number]; before: Uint8Array } | null = null;
  const bytes = () => undo.reduce((n, e) => n + e.before.length * 2, 0);
  const push = (e: Edit) => {
    undo.push(e);
    redo.length = 0;
    while (undo.length > 1 && bytes() > maxBytes) undo.shift();
  };
  return {
    mask,
    /** Records the area a stroke may touch before it is painted. */
    begin(bounds: readonly [number, number, number, number]) {
      open = { bounds, before: crop(mask, bounds) };
    },
    /** Widens the open stroke's area (a long stroke grows beyond its first rectangle). */
    extend(bounds: readonly [number, number, number, number]) {
      if (!open) return this.begin(bounds);
      const [ax, ay, aw, ah] = open.bounds,
        [bx, by, bw, bh] = bounds;
      const x = Math.min(ax, bx),
        y = Math.min(ay, by),
        w = Math.max(ax + aw, bx + bw) - x,
        h = Math.max(ay + ah, by + bh) - y;
      if (x === ax && y === ay && w === aw && h === ah) return;
      // Pixels outside the old rectangle have not been painted yet: read them now.
      const before = crop(mask, [x, y, w, h]);
      for (let r = 0; r < ah; r++) before.set(open.before.subarray(r * aw, (r + 1) * aw), (ay - y + r) * w + (ax - x));
      open = { bounds: [x, y, w, h], before };
    },
    end() {
      if (!open) return;
      const after = crop(mask, open.bounds);
      if (after.some((v, i) => v !== open!.before[i])) push({ bounds: open.bounds, before: open.before, after });
      open = null;
    },
    /** Replaces the whole mask (AI result, clear, fill) as one undoable step. */
    replace(data: Uint8Array) {
      const bounds = [0, 0, mask.width, mask.height] as const;
      push({ bounds, before: mask.data.slice(), after: data.slice() });
      mask.data.set(data);
    },
    undo() {
      const e = undo.pop();
      if (!e) return false;
      paste(mask, e.bounds, e.before);
      redo.push(e);
      return true;
    },
    redo() {
      const e = redo.pop();
      if (!e) return false;
      paste(mask, e.bounds, e.after);
      undo.push(e);
      return true;
    },
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
  };
}
export type MaskHistory = ReturnType<typeof createMaskHistory>;

/** Share of the photo covered by the mask (0–1). */
export function maskShare(mask: FloorMask) {
  let sum = 0;
  for (let i = 0; i < mask.data.length; i++) sum += mask.data[i];
  return sum / 255 / mask.data.length;
}
