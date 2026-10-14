// Lighting plate from an own-room photo: the low-frequency luminance of the
// original floor, so window light, lamp pools and soft furniture shadows carry
// over while the old planks' grain and joints do not.
//
// The blur (σ ≈ 3 % of the long edge, about 60 px on a 2048-px photo) is wider
// than a near board (≈ 5 % of the frame), so board-to-board tone differences
// fade to a few percent. Limits: a strongly patterned original floor (dark and
// light boards, tiles with dark grout, a printed pattern) still prints through
// as faint broad blotches, and contact shadows narrower than the blur are
// softened. Reflections of
// the old floor are part of its luminance and stay as soft bright areas.
import type { PixelBuffer } from '../render/sampling';
import { encodeByte } from '../render/color';
import type { FloorMask } from './segment';
import { luminanceOf } from './segment';

export interface PhotoPlate {
  /** sRGB grey bytes over `bounds` (same crop as the floor mask). */
  diffuse: Uint8Array;
  bounds: readonly [number, number, number, number];
  /** Median linear luminance of the floor: the level that shows a material at its true colour. */
  baselineLinear: number;
}

/** Bounding box of the mask's coverage, or null when the mask is empty. */
export function maskBounds(mask: FloorMask): [number, number, number, number] | null {
  const { width: W, height: H, data } = mask;
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[y * W + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

function blur3(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  let a: Float32Array = src,
    b: Float32Array = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[y * w + Math.max(0, Math.min(w - 1, k))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / (2 * r + 1);
        sum += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
      for (let y = 0; y < h; y++) {
        b[y * w + x] = sum / (2 * r + 1);
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    [a, b] = [b, a === src ? new Float32Array(w * h) : a];
  }
  return a;
}

/**
 * Mask-normalised low-pass of the floor's luminance (three box passes ≈ a
 * Gaussian of σ ≈ `sigmaFrac` × the long edge), solved on a grid of at most
 * `grid` cells on the long edge and interpolated back to full resolution.
 */
export function photoLightingPlate(image: PixelBuffer, mask: FloorMask, sigmaFrac = 0.03, grid = 512): PhotoPlate | null {
  const bounds = maskBounds(mask);
  if (!bounds) return null;
  const W = image.width,
    H = image.height,
    k = Math.max(1, Math.ceil(Math.max(W, H) / grid)),
    w = Math.ceil(W / k),
    h = Math.ceil(H / k),
    Y = luminanceOf(image),
    num = new Float32Array(w * h),
    den = new Float32Array(w * h);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const m = mask.data[y * W + x] / 255;
      if (!m) continue;
      const c = Math.floor(y / k) * w + Math.floor(x / k);
      num[c] += Y[y * W + x] * m;
      den[c] += m;
    }
  // Weighted median of the floor's (unblurred) cell means: robust to a sunlit patch.
  const cells: [number, number][] = [];
  for (let i = 0; i < w * h; i++) if (den[i] > 0) cells.push([num[i] / den[i], den[i]]);
  cells.sort((a, b) => a[0] - b[0]);
  const total = cells.reduce((n, c) => n + c[1], 0);
  let acc = 0,
    median = cells[0]?.[0] ?? 0.2;
  for (const [v, wt] of cells) {
    acc += wt;
    if (acc >= total / 2) {
      median = v;
      break;
    }
  }
  // σ of three box passes of radius r is r·√((2r+1)²−1)/(2r+1)·… ≈ r for r ≥ 2.
  const r = Math.max(1, Math.round((sigmaFrac * Math.max(W, H)) / k)),
    bn = blur3(num, w, h, r),
    bd = blur3(den, w, h, r),
    low = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) low[i] = bd[i] > 1e-3 ? bn[i] / bd[i] : median;
  const [bx, by, bw, bh] = bounds,
    diffuse = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const fy = Math.max(0, Math.min(h - 1, (by + y + 0.5) / k - 0.5)),
      iy = Math.min(Math.floor(fy), Math.max(0, h - 2)),
      ty = h > 1 ? fy - iy : 0;
    for (let x = 0; x < bw; x++) {
      const fx = Math.max(0, Math.min(w - 1, (bx + x + 0.5) / k - 0.5)),
        ix = Math.min(Math.floor(fx), Math.max(0, w - 2)),
        tx = w > 1 ? fx - ix : 0,
        i = iy * w + ix,
        j = Math.min(i + 1, w * h - 1),
        u = Math.min(i + w, w * h - 1),
        v = Math.min(i + w + 1, w * h - 1),
        L = (low[i] * (1 - tx) + low[j] * tx) * (1 - ty) + (low[u] * (1 - tx) + low[v] * tx) * ty;
      diffuse[y * bw + x] = encodeByte(L);
    }
  }
  // The renderer needs a baseline above 0.02 (a very dark original floor).
  return { diffuse, bounds, baselineLinear: Math.max(0.025, median) };
}
