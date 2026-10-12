import type { RoomScene, StudioSelection } from '../data/types';
import type { PreparedScene, PreparedMaterials, StudioCatalog } from './types';
import { buildMipChain, type PixelBuffer } from './render/sampling';
import { decode } from './render/color';
import { invertHomography, solveHomography } from './render/homography';
// Floor atlases are authored up to 2048px; the float mip chain of the largest
// active set (atlas + finish + trims) stays well under the cache budget.
export const TEXTURE_MAX_EDGE = 2048;
export const TEXTURE_CACHE_BYTES = 28 * 1024 * 1024;
export type DecodeAsset = (
  path: string,
  signal: AbortSignal,
  maxEdge?: number,
) => Promise<PixelBuffer>;
export const decodeAsset: DecodeAsset = async (path, signal, maxEdge) => {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('Studio requires same-origin assets');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Asset ${response.status}: ${path}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'default',
  });
  try {
    signal.throwIfAborted();
    const scale = maxEdge ? Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height)) : 1,
      canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    return { width: pixels.width, height: pixels.height, data: pixels.data };
  } finally {
    bitmap.close();
  }
};
export function red(
  p: PixelBuffer,
  bounds: readonly [number, number, number, number] = [0, 0, p.width, p.height],
) {
  const [x, y, w, h] = bounds,
    a = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) a[j * w + i] = p.data[((j + y) * p.width + i + x) * 4];
  return a;
}
// The authored leaf and casing masks leave the photograph's own jambs, mitre
// joints and leaf gap uncovered, so those pixels would keep the original paint.
// Unify the door assembly: every uncovered pixel enclosed by the leaf/casing
// (horizontally or vertically) joins the nearest casing piece, continuing that
// piece's lighting; only a hairline band against the leaf stays a shadow reveal.
const REVEAL_PX = 2,
  JAMB_SHADE = 0.92;
interface FullSurface {
  definition: RoomScene['surfaces'][number];
  mask: Uint8Array;
  diffuse: Uint8Array;
}
export function unifyDoorAssembly(
  surfaces: readonly FullSurface[],
  others: readonly { mask: Uint8Array; bounds: readonly [number, number, number, number] }[],
  protectedMask: Uint8Array,
  base: PixelBuffer,
): PreparedScene['reveal'] {
  const W = base.width,
    leaves = surfaces.filter(s => s.definition.role === 'door-leaf'),
    frames = surfaces.filter(s => s.definition.role === 'frame');
  if (!leaves.length || !frames.length) return null;
  const boxes = frames.map(f => f.definition.mask.boundsPx),
    x0 = Math.min(...boxes.map(b => b[0])),
    y0 = Math.min(...boxes.map(b => b[1])),
    x1 = Math.max(...boxes.map(b => b[0] + b[2])),
    y1 = Math.max(...boxes.map(b => b[1] + b[3])),
    w = x1 - x0,
    h = y1 - y0,
    at = (x: number, y: number) => (y + y0) * W + x + x0;
  const covered = new Uint16Array(w * h),
    solid = new Uint8Array(w * h),
    leafDist = new Int32Array(w * h).fill(-1),
    frameDist = new Int32Array(w * h).fill(-1),
    frameOf = new Int8Array(w * h).fill(-1);
  const leafQueue: number[] = [],
    frameQueue: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        p = at(x, y);
      let sum = 0;
      for (const s of surfaces) sum += s.mask[p];
      for (const o of others) {
        const [bx, by, bw, bh] = o.bounds,
          ox = x + x0 - bx,
          oy = y + y0 - by;
        if (ox >= 0 && oy >= 0 && ox < bw && oy < bh) sum += o.mask[oy * bw + ox];
      }
      covered[i] = sum;
      if (leaves.some(l => l.mask[p] > 127)) {
        solid[i] = 1;
        leafDist[i] = 0;
        leafQueue.push(i);
      }
      const f = frames.findIndex(f => f.mask[p] > 127);
      if (f >= 0) {
        solid[i] = 1;
        frameDist[i] = 0;
        frameOf[i] = f;
        frameQueue.push(i);
      }
    }
  // Chebyshev breadth-first distances inside the assembly box.
  const spread = (queue: number[], dist: Int32Array, label?: Int8Array) => {
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q],
        x = i % w,
        y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (dist[n] >= 0) continue;
          dist[n] = dist[i] + 1;
          if (label) label[n] = label[i];
          queue.push(n);
        }
    }
  };
  spread(leafQueue, leafDist);
  spread(frameQueue, frameDist, frameOf);
  const jambLevel = frames.map(f => {
    const median = medianLevel(f.mask, f.diffuse);
    if (median === null) return 0;
    const target = decode[median] * JAMB_SHADE;
    let level = 0;
    while (level < 255 && decode[level + 1] <= target) level++;
    return level;
  });
  // Repeat until stable: filled jamb strips enclose the mitre corners above them.
  const reveal = new Uint8Array(w * h),
    filled = new Uint8Array(w * h);
  let any = false,
    changed = true;
  for (let pass = 0; changed && pass < 4; pass++) {
    changed = false;
    const rowMin = new Int32Array(h).fill(w),
      rowMax = new Int32Array(h).fill(-1),
      colMin = new Int32Array(w).fill(h),
      colMax = new Int32Array(w).fill(-1);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (solid[y * w + x]) {
          rowMin[y] = Math.min(rowMin[y], x);
          rowMax[y] = Math.max(rowMax[y], x);
          colMin[x] = Math.min(colMin[x], y);
          colMax[x] = Math.max(colMax[x], y);
        }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x,
          p = at(x, y),
          open = 255 - Math.min(255, covered[i]);
        // Partially covered antialiased edge pixels inside the assembly are
        // completed too, otherwise sloped edges leave a dotted original line.
        if (filled[i] || open <= 0 || protectedMask[p] >= 128) continue;
        const enclosed = (rowMin[y] < x && x < rowMax[y]) || (colMin[x] < y && y < colMax[x]);
        if (!enclosed) continue;
        filled[i] = 1;
        solid[i] = 1;
        covered[i] = 255;
        changed = true;
        if (leafDist[i] >= 0 && leafDist[i] <= REVEAL_PX) {
          reveal[i] = open;
          any = true;
        } else if (frameOf[i] >= 0) {
          // Jambs and mitres take an even, slightly shaded tone of their piece's
          // median face light. Copying photo pixels would extend the source
          // image's one-sided bevel shading into a dark band on one side only.
          const f = frameOf[i];
          frames[f].mask[p] += open;
          if (!frames[f].diffuse[p]) frames[f].diffuse[p] = jambLevel[f];
        }
      }
  }
  return any ? { mask: reveal, bounds: [x0, y0, w, h] } : null;
}
function medianLevel(mask: Uint8Array, diffuse: Uint8Array) {
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < mask.length; i++)
    if (mask[i] >= 200) {
      histogram[diffuse[i]]++;
      count++;
    }
  if (!count) return null;
  let seen = 0,
    level = 0;
  while (level < 255 && (seen += histogram[level]) < count / 2) level++;
  return level;
}
// Casing and skirting are each split into several pieces of one material. A
// per-piece baseline from a 3×3 sample makes pieces render at different tones;
// normalising each by the median of its whole surface keeps them matched while
// preserving each piece's own light gradient.
function trimBaseline(definition: RoomScene['surfaces'][number], mask: Uint8Array, diffuse: Uint8Array) {
  if (definition.role !== 'frame' && definition.role !== 'skirting') return undefined;
  const level = medianLevel(mask, diffuse);
  return level === null ? undefined : Math.max(0.03, decode[level]);
}
function boundsOf(mask: Uint8Array, width: number, fallback: readonly [number, number, number, number]) {
  const [fx, fy, fw, fh] = fallback;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -1,
    y1 = -1;
  for (let y = Math.max(0, fy - 64); y < Math.min(mask.length / width, fy + fh + 64); y++)
    for (let x = Math.max(0, fx - 64); x < Math.min(width, fx + fw + 64); x++)
      if (mask[y * width + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? fallback : ([x0, y0, x1 - x0 + 1, y1 - y0 + 1] as const);
}
const crop = (full: Uint8Array, width: number, [x, y, w, h]: readonly number[]) => {
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) out.set(full.subarray((y + j) * width + x, (y + j) * width + x + w), j * w);
  return out;
};
export async function prepareSceneWith(
  scene: RoomScene,
  signal: AbortSignal,
  decode: DecodeAsset,
): Promise<PreparedScene> {
  const load = async (path: string) => {
    const p = await decode(path, signal);
    if (p.width !== scene.width || p.height !== scene.height)
      throw new Error(`Wrong scene asset shape ${path}`);
    return p;
  };
  const base = await load(scene.base),
    protectedMask = red(await load(scene.protectedMask.alpha));
  // Leaf and casing layers are kept full-size until the assembly is unified.
  const door = new Set(['door-leaf', 'frame']);
  const full: FullSurface[] = [],
    loaded: {
      definition: RoomScene['surfaces'][number];
      mask: Uint8Array;
      diffuse: Uint8Array;
      bounds: readonly [number, number, number, number];
      specular: PixelBuffer | null;
      full?: FullSurface;
    }[] = [];
  for (const definition of scene.surfaces) {
    const bounds = definition.mask.boundsPx;
    const specularImage = definition.lighting.specular ? await load(definition.lighting.specular) : null;
    if (door.has(definition.role)) {
      const entry = {
        definition,
        mask: red(await load(definition.mask.alpha)),
        diffuse: red(await load(definition.lighting.diffuse)),
      };
      full.push(entry);
      loaded.push({ definition, mask: entry.mask, diffuse: entry.diffuse, bounds, specular: specularImage, full: entry });
    } else
      loaded.push({
        definition,
        mask: red(await load(definition.mask.alpha), bounds),
        diffuse: red(await load(definition.lighting.diffuse), bounds),
        bounds,
        specular: specularImage,
      });
  }
  const reveal = unifyDoorAssembly(
    full,
    loaded.filter(l => !l.full),
    protectedMask,
    base,
  );
  const surfaces = loaded.map(l => {
    let { mask, diffuse, bounds } = l;
    if (l.full) {
      bounds = boundsOf(l.full.mask, scene.width, l.bounds);
      mask = crop(l.full.mask, scene.width, bounds);
      diffuse = crop(l.full.diffuse, scene.width, bounds);
    }
    let specular: PixelBuffer | null = null;
    if (l.specular) {
      const p = l.specular,
        [x, y, w, h] = bounds,
        data = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++)
        data.set(
          p.data.subarray(((y + j) * p.width + x) * 4, ((y + j) * p.width + x + w) * 4),
          j * w * 4,
        );
      specular = { width: w, height: h, data };
    }
    return {
      definition: l.definition,
      baseline: trimBaseline(l.definition, mask, diffuse),
      inverse: invertHomography(
        solveHomography(l.definition.mapping.worldQuadMm, l.definition.mapping.imageQuad01),
      ),
      mask,
      diffuse,
      specular,
      bounds,
    };
  });
  const inserts = new Map(),
    insertMasks = new Map();
  for (const insert of scene.doorInserts) {
    inserts.set(insert.variantKey, await load(insert.rgba));
    insertMasks.set(insert.variantKey, {
      replacement: red(await load(insert.replacementMask.alpha)),
      protected: red(await load(insert.protectedMask.alpha)),
    });
  }
  return {
    reveal,
    scene,
    base,
    protectedMask,
    surfaces,
    inserts,
    insertMasks,
    foreground: scene.foreground ? await load(scene.foreground) : null,
  };
}
export const prepareScene = (scene: RoomScene, signal: AbortSignal) =>
  prepareSceneWith(scene, signal, decodeAsset);
export async function prepareMaterialsWith(
  s: StudioSelection,
  c: StudioCatalog,
  signal: AbortSignal,
  decode: DecodeAsset,
): Promise<PreparedMaterials> {
  const finish = c.materials.doorFinishes.find(f => f.id === s.doorFinishId)!,
    p = c.products.find(p => p.id === s.floorProductId);
  if (p?.kind !== 'floor') throw new Error('Unknown floor');
  const floor = c.materials.floorCollections.find(f => f.id === p.collectionId)!;
  const paths = new Set([floor.atlas.image]);
  for (const a of [
    finish.kind === 'opaque' ? finish.appearance : null,
    finish.trim.appearance,
    floor.trim.appearance,
  ])
    if (a?.kind === 'texture') paths.add(a.texture);
  const textures = new Map();
  for (const path of paths) {
    signal.throwIfAborted();
    textures.set(path, buildMipChain(await decode(path, signal, TEXTURE_MAX_EDGE)));
  }
  return { textures, data: c.materials, products: c.products };
}
export const prepareMaterials = (s: StudioSelection, c: StudioCatalog, signal: AbortSignal) =>
  prepareMaterialsWith(s, c, signal, decodeAsset);

// One controller owns this cache. Whole chains are evicted by bytes; only two
// floor atlases may be retained. Aborted decodes are never inserted.
export function createMaterialLoader(decode: DecodeAsset = decodeAsset) {
  const cached = new Map<string, readonly import('./render/sampling').FloatTexture[]>();
  let bytes = 0;
  const size = (chain: readonly import('./render/sampling').FloatTexture[]) =>
    chain.reduce((n, t) => n + t.data.byteLength, 0);
  const remove = (path: string) => {
    const chain = cached.get(path);
    if (chain) {
      bytes -= size(chain);
      cached.delete(path);
    }
  };
  const prepare: typeof prepareMaterials = async (s, c, signal) => {
    const finish = c.materials.doorFinishes.find(f => f.id === s.doorFinishId)!,
      product = c.products.find(p => p.id === s.floorProductId);
    if (product?.kind !== 'floor') throw new Error('Unknown floor');
    const floor = c.materials.floorCollections.find(f => f.id === product.collectionId)!;
    const paths = new Set([floor.atlas.image]);
    for (const a of [
      finish.kind === 'opaque' ? finish.appearance : null,
      finish.trim.appearance,
      floor.trim.appearance,
    ])
      if (a?.kind === 'texture') paths.add(a.texture);
    const textures = new Map<string, readonly import('./render/sampling').FloatTexture[]>();
    for (const path of paths) {
      signal.throwIfAborted();
      let chain = cached.get(path);
      if (chain) {
        cached.delete(path);
        cached.set(path, chain);
      } else {
        chain = buildMipChain(await decode(path, signal, TEXTURE_MAX_EDGE));
        signal.throwIfAborted();
        cached.set(path, chain);
        bytes += size(chain);
      }
      textures.set(path, chain);
    }
    const atlases = new Set(c.materials.floorCollections.map(f => f.atlas.image));
    while ([...cached.keys()].filter(p => atlases.has(p)).length > 2) {
      const path = [...cached.keys()].find(p => atlases.has(p) && p !== floor.atlas.image)!;
      remove(path);
    }
    while (bytes > TEXTURE_CACHE_BYTES) {
      const path = [...cached.keys()].find(p => !paths.has(p));
      if (!path) throw new Error('Active texture set exceeds cache budget');
      remove(path);
    }
    return { textures, data: c.materials, products: c.products };
  };
  return {
    prepare,
    clear() {
      cached.clear();
      bytes = 0;
    },
    bytes: () => bytes,
  };
}
