import type { RGB } from '../../data/types';
import { clamp, decode, encodeByte } from './color';
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export interface FloatTexture {
  width: number;
  height: number;
  data: Float32Array;
}
export const wrap = (v: number, n: number) => ((v % n) + n) % n;
export function buildMipChain(image: PixelBuffer): readonly FloatTexture[] {
  if (image.width < 1 || image.height < 1 || image.data.length !== image.width * image.height * 4)
    throw new Error('Texture: invalid dimensions');
  const first = {
    width: image.width,
    height: image.height,
    data: new Float32Array(image.width * image.height * 3),
  };
  for (let i = 0; i < image.width * image.height; i++)
    for (let c = 0; c < 3; c++) first.data[i * 3 + c] = decode[image.data[i * 4 + c]];
  const chain = [first];
  while (chain.at(-1)!.width > 1 || chain.at(-1)!.height > 1) {
    const p = chain.at(-1)!,
      w = Math.max(1, Math.ceil(p.width / 2)),
      h = Math.max(1, Math.ceil(p.height / 2)),
      next = { width: w, height: h, data: new Float32Array(w * h * 3) };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < 3; c++) {
          let v = 0;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++)
              v +=
                p.data[(wrap(y * 2 + dy, p.height) * p.width + wrap(x * 2 + dx, p.width)) * 3 + c];
          next.data[(y * w + x) * 3 + c] = v / 4;
        }
    chain.push(next);
  }
  return chain;
}
function bilinear(t: FloatTexture, u: number, v: number): RGB {
  const x = wrap(u, 1) * t.width - 0.5,
    y = wrap(v, 1) * t.height - 0.5,
    x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const out = [0, 0, 0];
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const i = (wrap(y0 + dy, t.height) * t.width + wrap(x0 + dx, t.width)) * 3,
        w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      for (let c = 0; c < 3; c++) out[c] += t.data[i + c] * w;
    }
  return out as unknown as RGB;
}
export function sampleTrilinear(
  mips: readonly FloatTexture[],
  u: number,
  v: number,
  lod: number,
): RGB {
  if (!mips.length || ![u, v, lod].every(Number.isFinite))
    throw new Error('Sampling: invalid coordinates');
  const l = clamp(lod, 0, mips.length - 1),
    i = Math.floor(l),
    a = bilinear(mips[i], u, v),
    b = bilinear(mips[Math.min(i + 1, mips.length - 1)], u, v);
  return a.map((x, c) => x + (b[c] - x) * (l - i)) as unknown as RGB;
}
// Allocation-free sampler used by the compositor. Public scalar tests use the
// same wrapping and interpolation semantics; output is owned by one render job.
export function sampleTrilinearInto(
  mips: readonly FloatTexture[],
  u: number,
  v: number,
  lod: number,
  out: number[],
) {
  const l = clamp(lod, 0, mips.length - 1),
    low = Math.floor(l),
    fraction = l - low;
  for (let level = 0; level < (fraction ? 2 : 1); level++) {
    const t = mips[Math.min(low + level, mips.length - 1)],
      x = wrap(u, 1) * t.width - 0.5,
      y = wrap(v, 1) * t.height - 0.5,
      ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    const a = (wrap(iy, t.height) * t.width + wrap(ix, t.width)) * 3,
      b = (wrap(iy, t.height) * t.width + wrap(ix + 1, t.width)) * 3,
      c = (wrap(iy + 1, t.height) * t.width + wrap(ix, t.width)) * 3,
      d = (wrap(iy + 1, t.height) * t.width + wrap(ix + 1, t.width)) * 3;
    for (let k = 0; k < 3; k++) {
      const value =
        (t.data[a + k] * (1 - fx) + t.data[b + k] * fx) * (1 - fy) +
        (t.data[c + k] * (1 - fx) + t.data[d + k] * fx) * fy;
      if (level) out[k] += (value - out[k]) * fraction;
      else out[k] = value;
    }
  }
  return out;
}
// Plank sheets are stored as sRGB bytes (a quarter of a float chain) with
// mips averaged in linear light. Boards are not tiled, so edges clamp.
export interface ByteTexture {
  width: number;
  height: number;
  data: Uint8Array; // RGB, sRGB-encoded
}
export function buildByteMipChain(image: PixelBuffer): readonly ByteTexture[] {
  if (image.width < 1 || image.height < 1 || image.data.length !== image.width * image.height * 4)
    throw new Error('Texture: invalid dimensions');
  const first = { width: image.width, height: image.height, data: new Uint8Array(image.width * image.height * 3) };
  for (let i = 0; i < image.width * image.height; i++)
    for (let c = 0; c < 3; c++) first.data[i * 3 + c] = image.data[i * 4 + c];
  const chain: ByteTexture[] = [first];
  while (chain.at(-1)!.width > 1 || chain.at(-1)!.height > 1) {
    const p = chain.at(-1)!,
      w = Math.max(1, Math.ceil(p.width / 2)),
      h = Math.max(1, Math.ceil(p.height / 2)),
      next = { width: w, height: h, data: new Uint8Array(w * h * 3) };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < 3; c++) {
          let v = 0;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++)
              v += decode[p.data[(Math.min(y * 2 + dy, p.height - 1) * p.width + Math.min(x * 2 + dx, p.width - 1)) * 3 + c]];
          next.data[(y * w + x) * 3 + c] = encodeByte(v / 4);
        }
    chain.push(next);
  }
  return chain;
}
/**
 * Trilinear sample of a vertical band of a byte chain (one board image of a
 * plank sheet). tx/ty are level-0 texel coordinates; rows outside
 * [band0, band1) are never read, so neighbouring boards do not bleed in.
 */
export function sampleBandInto(
  mips: readonly ByteTexture[],
  tx: number,
  ty: number,
  lod: number,
  band0: number,
  band1: number,
  out: number[],
) {
  const l = clamp(lod, 0, mips.length - 1),
    low = Math.floor(l),
    fraction = l - low,
    w0 = mips[0].width,
    h0 = mips[0].height;
  for (let level = 0; level < (fraction ? 2 : 1); level++) {
    const t = mips[Math.min(low + level, mips.length - 1)],
      sx = t.width / w0,
      sy = t.height / h0,
      top = band0 * sy + 0.5,
      bottom = band1 * sy - 0.5,
      x = clamp(tx * sx - 0.5, 0, t.width - 1),
      y = (bottom > top ? clamp(ty * sy, top, bottom) : (top + bottom) / 2) - 0.5,
      ix = Math.floor(x),
      iy = Math.max(0, Math.floor(y)),
      fx = x - ix,
      fy = Math.max(0, y - iy),
      ix1 = Math.min(ix + 1, t.width - 1),
      iy1 = Math.min(iy + 1, t.height - 1),
      a = (iy * t.width + ix) * 3,
      b = (iy * t.width + ix1) * 3,
      c = (iy1 * t.width + ix) * 3,
      d = (iy1 * t.width + ix1) * 3;
    for (let k = 0; k < 3; k++) {
      const value =
        (decode[t.data[a + k]] * (1 - fx) + decode[t.data[b + k]] * fx) * (1 - fy) +
        (decode[t.data[c + k]] * (1 - fx) + decode[t.data[d + k]] * fx) * fy;
      if (level) out[k] += (value - out[k]) * fraction;
      else out[k] = value;
    }
  }
  return out;
}
