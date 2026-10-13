// Procedural board layout for position-map floors. World millimetres go in;
// out comes which board a point lies on (a stable id), where inside the board
// it is, and how far it is from the board's joints. Every board picks one of
// the décor's plank images by a seeded hash, so there is no repeating tile.
export interface BoardHit {
  /** Stable board identity (row/column or lattice coordinates and orientation). */
  a: number;
  b: number;
  c: number;
  /** Position along the board length and across its width, in mm. */
  lu: number;
  lv: number;
}
export function hash32(a: number, b: number, c: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h ^= Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
// Straight (stretcher) layout: rows of boards across v, each row offset by a
// golden-ratio step plus jitter, so end joints of neighbouring rows stay at
// least ~0.26 board lengths apart, as installers require.
export function locateStraight(u: number, v: number, length: number, width: number, out: BoardHit) {
  const row = Math.floor(v / width),
    jitter = hash32(row, 0x51ed, 7) / 4294967296,
    offset = length * (((row * 0.381966 + jitter * 0.12) % 1) + 1),
    along = u + offset,
    column = Math.floor(along / length);
  out.a = row;
  out.b = column;
  out.c = 0;
  out.lu = along - column * length;
  out.lv = v - row * width;
  return out;
}
// Right-angle herringbone of n = length / width boards. In board-width units the
// tiling is H0 = [0,n)x[0,1) and V0 = [n,n+1)x[1-n,1) repeated on the lattice
// a(1,1) + b(n,-n); the zig-zag runs along (1,1), so callers lay it at +45°.
// For a given b, a follows directly from one axis, so at most six tests run.
export function locateHerringbone(u: number, v: number, length: number, width: number, out: BoardHit) {
  const n = length / width,
    px = u / width,
    py = v / width,
    b0 = Math.floor((px - py) / (2 * n));
  for (let k = 0; k < 3; k++) {
    const b = k === 0 ? b0 : k === 1 ? b0 - 1 : b0 + 1,
      qx = px - b * n,
      qy = py + b * n;
    let a = Math.floor(qy);
    if (qx - a >= 0 && qx - a < n) {
      out.a = a;
      out.b = b;
      out.c = 0;
      out.lu = (qx - a) * width;
      out.lv = (qy - a) * width;
      return out;
    }
    a = Math.floor(qx - n);
    if (qy - a >= 1 - n && qy - a < 1) {
      out.a = a;
      out.b = b;
      out.c = 1;
      out.lu = (qy - a - (1 - n)) * width;
      out.lv = (qx - a - n) * width;
      return out;
    }
  }
  throw new Error('Herringbone: point outside lattice');
}
/** Fraction of a pixel footprint (f mm wide, centred e mm from a joint) inside the band |d| < half. */
export function bandCoverage(e: number, f: number, half: number) {
  const lo = Math.max(e - f / 2, -half),
    hi = Math.min(e + f / 2, half);
  return hi > lo ? (hi - lo) / f : 0;
}
// Bevel and joint shading as a multiplier on albedo. A 4V bevel is a narrow
// strip tilted away from the light with a dark hairline joint at its centre;
// flat (micro-bevel) boards keep only the hairline. Coverage is integrated over
// the pixel footprint, so joints stay crisp up close and fade with distance.
export function jointShade(lu: number, lv: number, length: number, width: number, bevelMm: number, footprintMm: number) {
  const f = Math.max(footprintMm, 1e-3),
    side = Math.min(lv, width - lv),
    end = Math.min(lu, length - lu),
    joint = 0.15,
    bevel = Math.max(bevelMm, joint);
  const strip = Math.max(bandCoverage(side, f, bevel), bandCoverage(end, f, bevel)),
    line = Math.max(bandCoverage(side, f, joint), bandCoverage(end, f, joint));
  return 1 - strip * (bevelMm > 0 ? 0.3 : 0.45) - line * (bevelMm > 0 ? 0.35 : 0.2);
}
