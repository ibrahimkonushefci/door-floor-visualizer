// Perspective of an own-room photo. The visitor drags four corners onto a
// rectangle lying on the floor (far-left, far-right, near-right, near-left).
// The two pairs of opposite sides give two vanishing points and so the horizon;
// with the camera's focal length the horizon gives the floor's orientation, and
// an assumed camera height gives its scale. The visitor checks the scale on the
// plank preview and corrects it with one slider.
import type { Mat3, Quad, Vec2 } from '../../data/types';
import type { PixelBuffer } from '../render/sampling';
import { invertHomography, projectPoint, solveHomography } from '../render/homography';
import { luminanceOf, type FloorMask } from './segment';

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a: V3): V3 => scale(a, 1 / Math.hypot(...a));

/** Hand-held photos are taken at about chest height. */
export const DEFAULT_CAMERA_HEIGHT_MM = 1400;
/** A phone's main camera (≈ 26 mm equivalent) when the photo carries no focal length. */
export const defaultFocalPx = (width: number, height: number) => 0.76 * Math.max(width, height);

export interface FloorPlane {
  /** World millimetres of the four corners, in the quad's order (u along the room's depth). */
  worldQuadMm: Quad;
  /** World mm → image 0–1, and its inverse (what the renderer samples with). */
  toImage: Mat3;
  toWorld: Mat3;
}
export type PlaneResult = { ok: true; plane: FloorPlane } | { ok: false; reason: 'horizon' | 'degenerate' };

/**
 * Floor plane from a quad in 0–1 image coordinates ordered far-left, far-right,
 * near-right, near-left. Every corner must lie below the horizon its sides imply.
 */
export function floorPlane(
  quad: Quad,
  width: number,
  height: number,
  focalPx: number,
  cameraHeightMm = DEFAULT_CAMERA_HEIGHT_MM,
): PlaneResult {
  const cx = width / 2,
    cy = height / 2,
    f = focalPx,
    p = quad.map(([x, y]) => [x * width, y * height, 1] as V3);
  const lateral = cross(cross(p[0], p[1]), cross(p[3], p[2])),
    depth = cross(cross(p[0], p[3]), cross(p[1], p[2])),
    horizon = cross(lateral, depth);
  if (!(Math.hypot(...horizon) > 1e-12)) return { ok: false, reason: 'degenerate' };
  // Plane normal in camera coordinates (x right, y down, z forward): n ∝ Kᵀ·l.
  let n = unit([f * horizon[0], f * horizon[1], cx * horizon[0] + cy * horizon[1] + horizon[2]]);
  const rays = p.map(q => [(q[0] - cx) / f, (q[1] - cy) / f, 1] as V3),
    side = rays.map(r => dot(n, r));
  if (!(side.every(s => s > 1e-6) || side.every(s => s < -1e-6))) return { ok: false, reason: 'horizon' };
  if (side[0] > 0) n = scale(n, -1);
  // A floor seen from above: the camera looks down onto it (normal points up, against +y).
  if (n[1] > 0) return { ok: false, reason: 'horizon' };
  const points = rays.map(r => scale(r, -cameraHeightMm / dot(n, r)));
  const e1 = unit(sub(points[0], points[3]));
  let e2 = unit(cross(n, e1));
  if (dot(sub(points[2], points[3]), e2) < 0) e2 = scale(e2, -1);
  const worldQuadMm = points.map(X => [dot(sub(X, points[3]), e1), dot(sub(X, points[3]), e2)] as Vec2) as unknown as Quad;
  try {
    const toImage = solveHomography(worldQuadMm, quad);
    return { ok: true, plane: { worldQuadMm, toImage, toWorld: invertHomography(toImage) } };
  } catch {
    return { ok: false, reason: 'degenerate' };
  }
}

/** Rows of the mask: topmost row with real floor, bottom row, and the floor's x-extent per row. */
function maskRows(mask: FloorMask) {
  const { width: W, height: H, data } = mask;
  let top = -1,
    bottom = -1;
  const extent = (y: number): [number, number] | null => {
    let a = -1,
      b = -1;
    for (let x = 0; x < W; x++)
      if (data[y * W + x] >= 128) {
        if (a < 0) a = x;
        b = x;
      }
    return a < 0 ? null : [a, b];
  };
  for (let y = 0; y < H; y++) {
    let count = 0;
    for (let x = 0; x < W; x++) if (data[y * W + x] >= 128) count++;
    if (count > W * 0.02) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { top, bottom, extent };
}

interface Edgel {
  x: number;
  y: number;
  dx: number;
  dy: number;
}
/** Strong straight edges inside the floor (plank joints, the floor/wall line), at ≤ 640 px. */
export function floorEdgels(image: PixelBuffer, mask: FloorMask, maxEdge = 640): Edgel[] {
  const k = Math.max(1, Math.ceil(Math.max(image.width, image.height) / maxEdge)),
    w = Math.floor(image.width / k),
    h = Math.floor(image.height / k),
    Y = luminanceOf(image),
    g = new Float32Array(w * h),
    m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0,
        c = 255;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const idx = (y * k + j) * image.width + x * k + i;
          s += Math.sqrt(Y[idx]);
          c = Math.min(c, mask.data[idx]);
        }
      g[y * w + x] = s / (k * k);
      m[y * w + x] = c;
    }
  const cand: (Edgel & { mag: number })[] = [];
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      // Only well inside the floor: the 5×5 neighbourhood is floor.
      let inside = true;
      for (let j = -2; j <= 2 && inside; j++)
        for (let i = -2; i <= 2; i++)
          if (m[(y + j) * w + x + i] < 200) {
            inside = false;
            break;
          }
      if (!inside) continue;
      const at = (i: number, j: number) => g[(y + j) * w + x + i],
        gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1),
        gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1),
        mag = Math.hypot(gx, gy);
      if (mag > 0.02) cand.push({ x: (x + 0.5) * k, y: (y + 0.5) * k, dx: -gy / mag, dy: gx / mag, mag });
    }
  cand.sort((a, b) => b.mag - a.mag);
  return cand.slice(0, Math.min(4000, Math.max(200, Math.floor(cand.length * 0.15))));
}

/** Dominant vanishing point of non-horizontal edges above the floor (deterministic RANSAC). */
export function depthVanishingPoint(edgels: readonly Edgel[], floorTop: number, width: number, height: number) {
  const steep = edgels.filter(e => Math.abs(e.dy) > Math.sin((12 * Math.PI) / 180));
  if (steep.length < 30) return null;
  let seed = 0x2545f491;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const tolerance = Math.cos((1.5 * Math.PI) / 180);
  let best: { x: number; y: number; inliers: number } | null = null;
  for (let it = 0; it < 600; it++) {
    const a = steep[Math.floor(rand() * steep.length)],
      b = steep[Math.floor(rand() * steep.length)],
      den = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(den) < 1e-3) continue;
    const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / den,
      vx = a.x + a.dx * t,
      vy = a.y + a.dy * t;
    if (!(vy < floorTop && vy > -2 * height && vx > -2 * width && vx < 3 * width)) continue;
    let inliers = 0;
    for (const e of steep) {
      const ux = vx - e.x,
        uy = vy - e.y,
        len = Math.hypot(ux, uy);
      if (len > 1 && Math.abs((ux * e.dx + uy * e.dy) / len) > tolerance) inliers++;
    }
    if (!best || inliers > best.inliers) best = { x: vx, y: vy, inliers };
  }
  return best && best.inliers >= Math.max(30, steep.length * 0.2) ? best : null;
}

const clamp01 = (v: number) => Math.max(0.01, Math.min(0.99, v));

/**
 * First guess of the perspective quad: a rectangle on the floor whose sides
 * run towards the vanishing point of the floor's lines (plank joints, the wall
 * line), or towards the image centre when none is found, assuming a level
 * camera. Its near edge sits near the bottom of the floor and its far edge
 * towards the back of the room.
 */
export function guessQuad(image: PixelBuffer, mask: FloorMask, focalPx: number): Quad {
  const W = image.width,
    H = image.height,
    rows = maskRows(mask),
    fallback: Quad = [
      [0.3, 0.6],
      [0.7, 0.6],
      [0.85, 0.92],
      [0.15, 0.92],
    ];
  if (rows.top < 0 || rows.bottom - rows.top < H * 0.08) return fallback;
  const vp = depthVanishingPoint(floorEdgels(image, mask), rows.top, W, H);
  // Without lines, assume the camera looks 15° down (a typical hand-held room photo).
  const horizonY = Math.min(vp ? vp.y : H / 2 - focalPx * Math.tan((15 * Math.PI) / 180), rows.top - H * 0.04),
    vx = vp ? vp.x : W / 2;
  const nearY = rows.top + 0.82 * (rows.bottom - rows.top);
  let farY = rows.top + 0.22 * (rows.bottom - rows.top);
  farY = Math.max(farY, horizonY + H * 0.08);
  if (farY >= nearY - H * 0.05) return fallback;
  const ext = rows.extent(Math.round(nearY));
  if (!ext) return fallback;
  const inset = (ext[1] - ext[0]) * 0.15,
    xl = ext[0] + inset,
    xr = ext[1] - inset,
    at = (x: number, y: number) => vx + ((x - vx) * (y - horizonY)) / (nearY - horizonY);
  const quad = [
    [at(xl, farY) / W, farY / H],
    [at(xr, farY) / W, farY / H],
    [xr / W, nearY / H],
    [xl / W, nearY / H],
  ].map(([x, y]) => [clamp01(x), clamp01(y)] as Vec2) as unknown as Quad;
  return floorPlane(quad, W, H, focalPx).ok ? quad : fallback;
}

/**
 * Board joints for the plank-scale preview: segments in 0–1 image coordinates
 * covering the floor seen in the photo. Long joints every board width, end
 * joints every board length with the rows offset by a third.
 */
export function plankPreviewLines(
  plane: FloorPlane,
  board: { lengthMm: number; widthMm: number },
  rotationDeg: 0 | 90,
  region: { top: number; bottom: number },
  maxLines = 3000,
) {
  const H = plane.toImage,
    toWorld = (x: number, y: number) => projectPoint(plane.toWorld, [x, y]);
  // World area seen between the floor's top row and the bottom of the photo.
  const samples = [0, 0.25, 0.5, 0.75, 1].flatMap(x => [toWorld(x, region.top), toWorld(x, region.bottom)]);
  const center = projectPoint(plane.toWorld, [0.5, (region.top + region.bottom) / 2]);
  const ws = (x: number, y: number) => H[6] * x + H[7] * y + H[8],
    front = Math.sign(ws(center[0], center[1]));
  let u0 = Infinity,
    u1 = -Infinity,
    v0 = Infinity,
    v1 = -Infinity;
  const rot = rotationDeg === 90;
  for (const [X, Y] of samples) {
    if (!Number.isFinite(X) || !Number.isFinite(Y) || front * ws(X, Y) <= 0) continue;
    const [u, v] = rot ? [Y, -X] : [X, Y];
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const lines: [Vec2, Vec2][] = [];
  if (!Number.isFinite(u0)) return lines;
  // Rows near the horizon reach far away; 15 m around the centre is plenty to judge scale.
  const [cu, cv] = rot ? [center[1], -center[0]] : center;
  u0 = Math.max(u0, cu - 15000);
  u1 = Math.min(u1, cu + 15000);
  v0 = Math.max(v0, cv - 15000);
  v1 = Math.min(v1, cv + 15000);
  const world = (u: number, v: number): [number, number] => (rot ? [-v, u] : [u, v]);
  const push = (a: [number, number], b: [number, number]) => {
    // Clip to the half-plane in front of the camera.
    const wa = front * ws(...a),
      wb = front * ws(...b),
      eps = 1e-9;
    if (wa <= eps && wb <= eps) return;
    if (wa <= eps || wb <= eps) {
      const t = (eps - wa) / (wb - wa),
        c: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (wa <= eps) a = c;
      else b = c;
    }
    if (lines.length < maxLines) lines.push([projectPoint(H, a), projectPoint(H, b)]);
  };
  const L = board.lengthMm,
    Wd = board.widthMm;
  for (let r = Math.floor(v0 / Wd); r <= Math.ceil(v1 / Wd); r++) {
    push(world(u0, r * Wd), world(u1, r * Wd));
    const offset = (((r * 0.381966) % 1) + 1) % 1;
    for (let c = Math.floor(u0 / L) - 1; c <= Math.ceil(u1 / L); c++) {
      const u = (c + offset) * L;
      if (u >= u0 && u <= u1) push(world(u, r * Wd), world(u, (r + 1) * Wd));
    }
  }
  return lines;
}
