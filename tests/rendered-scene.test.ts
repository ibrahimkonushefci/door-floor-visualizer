import { it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { decodePng } from '../src/lib/studio/render/png';
import {
  bandCoverage,
  hash32,
  jointShade,
  locateHerringbone,
  locateStraight,
  type BoardHit,
} from '../src/lib/studio/render/floor';
import { buildByteMipChain, sampleBandInto } from '../src/lib/studio/render/sampling';
import { renderRows } from '../src/lib/studio/render/kernel';
import { toneShoulder } from '../src/lib/studio/render/lighting';
import { scaleBounds } from '../src/lib/studio/asset-loader';
import { finalFrameWidth, sceneScaleFor } from '../src/lib/studio/presentation';
import { decode, encodeByte } from '../src/lib/studio/render/color';
import { loadSiteData } from '../src/lib/data/load';
import { syntheticScene } from '../scripts/render-fixtures';
import type { PreparedMaterials } from '../src/lib/studio/types';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
// Reference encoder that cycles through all five filter types, row by row.
function png16(width: number, height: number, values: number[][]) {
  const bpp = 4,
    stride = width * bpp,
    raw = Buffer.alloc(height * stride),
    out: number[] = [];
  values.forEach((px, i) => {
    raw.writeUInt16BE(px[0], i * 4);
    raw.writeUInt16BE(px[1], i * 4 + 2);
  });
  for (let y = 0; y < height; y++) {
    const f = y % 5;
    out.push(f);
    for (let x = 0; x < stride; x++) {
      const v = raw[y * stride + x],
        a = x >= bpp ? raw[y * stride + x - bpp] : 0,
        b = y ? raw[(y - 1) * stride + x] : 0,
        c = x >= bpp && y ? raw[(y - 1) * stride + x - bpp] : 0,
        p = a + b - c,
        paeth =
          Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
            ? a
            : Math.abs(p - b) <= Math.abs(p - c)
              ? b
              : c;
      out.push((v - [0, a, b, (a + b) >> 1, paeth][f] + 256) & 255);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]),
      len = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([16, 4, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(out))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

it('decodes 16-bit grey+alpha position maps exactly for every PNG filter type', async () => {
  const width = 7,
    height = 10,
    values = Array.from({ length: width * height }, (_, i) => [(i * 9973) % 65536, 65535 - ((i * 4093) % 65536)]);
  const png = await decodePng(new Uint8Array(png16(width, height, values)));
  expect(png).toMatchObject({ width, height, channels: 2, depth: 16 });
  expect(Array.from(png.data)).toEqual(values.flat());
  await expect(decodePng(new Uint8Array([1, 2, 3]))).rejects.toThrow('signature');
});

it('herringbone puts every point on exactly one board, matching a brute-force lattice search', () => {
  const hit: BoardHit = { a: 0, b: 0, c: 0, lu: 0, lv: 0 };
  for (const [L, W] of [
    [600, 120],
    [480, 120],
    [400, 100],
  ]) {
    const n = L / W;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 40000 - 20000;
    for (let i = 0; i < 4000; i++) {
      const u = rnd(),
        v = rnd();
      locateHerringbone(u, v, L, W, hit);
      const found: string[] = [];
      for (let a = hit.a - 6; a <= hit.a + 6; a++)
        for (let b = hit.b - 6; b <= hit.b + 6; b++) {
          const qx = u / W - a - b * n,
            qy = v / W - a + b * n;
          if (qx >= 0 && qx < n && qy >= 0 && qy < 1) found.push(`${a},${b},0`);
          if (qx >= n && qx < n + 1 && qy >= 1 - n && qy < 1) found.push(`${a},${b},1`);
        }
      expect(found).toEqual([`${hit.a},${hit.b},${hit.c}`]);
      expect(hit.lu).toBeGreaterThanOrEqual(0);
      expect(hit.lu).toBeLessThan(L);
      expect(hit.lv).toBeGreaterThanOrEqual(0);
      expect(hit.lv).toBeLessThan(W);
    }
  }
});

it('straight rows stagger end joints by at least a quarter board, deterministically', () => {
  const hit: BoardHit = { a: 0, b: 0, c: 0, lu: 0, lv: 0 },
    L = 1380,
    W = 193;
  const offset = (row: number) => {
    locateStraight(0, row * W + 1, L, W, hit);
    return hit.lu;
  };
  for (let row = -40; row < 40; row++) {
    const d = Math.abs(offset(row) - offset(row + 1)),
      gap = Math.min(d, L - d);
    expect(gap).toBeGreaterThan(0.25 * L);
  }
  expect(hash32(3, 4, 0)).toBe(hash32(3, 4, 0));
  expect(hash32(3, 4, 0)).not.toBe(hash32(4, 3, 0));
});

it('joint shading is crisp up close and fades with distance', () => {
  expect(bandCoverage(0, 1, 1.2)).toBe(1);
  expect(bandCoverage(5, 1, 1.2)).toBe(0);
  expect(bandCoverage(0, 24, 1.2)).toBeCloseTo(0.1, 6);
  const near = jointShade(0.1, 90, 1380, 193, 1.2, 0.5),
    mid = jointShade(600, 90, 1380, 193, 1.2, 0.5),
    far = jointShade(0.1, 90, 1380, 193, 1.2, 30);
  expect(mid).toBe(1);
  expect(near).toBeLessThan(0.6);
  expect(far).toBeGreaterThan(0.9);
});

it('board sampling never reads a neighbouring board image at any mip level', () => {
  // Two 8×4 boards: red above, blue below.
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) data.set(y < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * 8 + x) * 4);
  const mips = buildByteMipChain({ width: 8, height: 8, data }),
    out = [0, 0, 0];
  for (const lod of [0, 0.5, 1, 1.5])
    for (const ty of [0, 0.4, 3.9]) {
      sampleBandInto(mips, 3.3, ty, lod, 0, 4, out);
      expect(out[2]).toBe(0);
      sampleBandInto(mips, 3.3, 4 + ty, lod, 4, 8, out);
      expect(out[0]).toBe(0);
    }
});

it('tone shoulder is identity below the knee and rolls off smoothly above it', () => {
  expect(toneShoulder(0.3, 0.6)).toBe(0.3);
  expect(toneShoulder(0.6, 0.6)).toBe(0.6);
  expect(toneShoulder(1, 0.6)).toBeCloseTo(0.8528, 3);
  expect(toneShoulder(3, 0.6)).toBeLessThan(1);
  expect(toneShoulder(50, 0.6)).toBeLessThanOrEqual(1);
});

it('lighter variant bounds grow outwards and frames choose the half decode only when small', () => {
  expect(scaleBounds([101, 51, 11, 9], 0.5, 1200, 900)).toEqual([49, 24, 8, 7]);
  expect(scaleBounds([0, 0, 2400, 1800], 0.5, 1200, 900)).toEqual([0, 0, 1200, 900]);
  expect(finalFrameWidth(1200, 2, 2400)).toBe(2400);
  expect(finalFrameWidth(900, 2)).toBe(1600);
  expect(sceneScaleFor(780, 2400)).toBe(0.5);
  expect(sceneScaleFor(1600, 2400)).toBe(1);
});

it('position-map floor lays individual boards with true zero shadows, tint and partitioned masks', () => {
  const data = loadSiteData(),
    f = syntheticScene(),
    collection = data.materials.floorCollections.find(c => c.id === 'kronotex-d4955')!;
  // 8×8 output; the map spans 0..1400 mm in X so one board end joint is in view.
  const pm = new Uint16Array(8 * 8 * 2);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) pm.set([x * 2000, 4000 + y * 200], (y * 8 + x) * 2);
  const s = f.scene.surfaces[0];
  s.definition = {
    ...s.definition,
    lighting: { ...s.definition.lighting, baselineLinear: 0.5, shadeMin: 0, shadeMax: 4, tint: [1, 1, 1] },
  };
  s.position = {
    data: pm,
    bounds: [0, 0, 8, 8],
    stepPx: 1,
    samples: [8, 8],
    originMm: [0, 0],
    unitMm: 0.1,
    sceneWidth: 8,
    sceneHeight: 8,
  };
  s.mask.fill(255);
  s.diffuse.fill(0);
  s.diffuse[9] = 128;
  f.scene.protectedMask.fill(255);
  f.scene.scene = { ...f.scene.scene, render: { source: 'blender', partitionedMasks: true, toneShoulder: 0.6 } };
  const sheet = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < 8; i++) sheet.set(i < 4 ? [200, 150, 100, 255] : [100, 150, 200, 255], i * 4);
  const materials: PreparedMaterials = {
    ...f.materials,
    data: {
      ...f.materials.data,
      floorCollections: f.materials.data.floorCollections.map(c =>
        c.id === collection.id
          ? { ...c, planks: { image: '/media/sheet.png', variants: 2, variantPx: [4, 1] as const, pxPerMm: 4 / 1380 } }
          : c,
      ),
    },
    sheets: new Map([['/media/sheet.png', buildByteMipChain({ width: 4, height: 2, data: sheet })]]),
  };
  const job = { ...f.job, selection: { ...f.job.selection, floorProductId: 'kronotex-d4955' } },
    out = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
  renderRows(job, f.scene, materials, out, 0, 8);
  // Zero light renders black (no 0.18 floor), protection is ignored (partitioned),
  // and the lit pixel shows a board colour.
  expect(Array.from(out.data.slice(0, 3))).toEqual([0, 0, 0]);
  const lit = Array.from(out.data.slice(9 * 4, 9 * 4 + 3));
  expect(lit.some(v => v > 30)).toBe(true);
  expect(encodeByte(decode[128])).toBe(128);
});
