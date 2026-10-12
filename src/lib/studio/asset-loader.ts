import type { RoomScene, StudioSelection } from '../data/types';
import type { PreparedScene, PreparedMaterials, StudioCatalog } from './types';
import { buildMipChain, type PixelBuffer } from './render/sampling';
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
// The photographed door's own leaf/frame gap is left uncovered by both masks, so
// it would keep the original paint colour. Mark pixels that are near both the
// leaf and a frame, uncovered and unprotected; the kernel shades them as shadow.
const REVEAL_RADIUS = 5;
function dilate(src: Uint8Array, w: number, h: number, r: number) {
  const row = new Uint8Array(w * h),
    out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && m < 255; k++)
        m = Math.max(m, src[y * w + k]);
      row[y * w + x] = m;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && m < 255; k++)
        m = Math.max(m, row[k * w + x]);
      out[y * w + x] = m;
    }
  return out;
}
export function revealMask(
  surfaces: readonly PreparedScene['surfaces'][number][],
  protectedMask: Uint8Array,
  sceneWidth: number,
): PreparedScene['reveal'] {
  const leaf = surfaces.filter(s => s.definition.role === 'door-leaf'),
    frames = surfaces.filter(s => s.definition.role === 'frame');
  if (!leaf.length || !frames.length) return null;
  const around = [...leaf, ...frames].map(s => s.bounds),
    x0 = Math.max(0, Math.min(...around.map(b => b[0])) - REVEAL_RADIUS),
    y0 = Math.max(0, Math.min(...around.map(b => b[1])) - REVEAL_RADIUS),
    x1 = Math.min(sceneWidth, Math.max(...around.map(b => b[0] + b[2])) + REVEAL_RADIUS),
    y1 = Math.max(...around.map(b => b[1] + b[3])) + REVEAL_RADIUS,
    w = x1 - x0,
    h = y1 - y0;
  const paint = (list: typeof surfaces) => {
    const out = new Uint8Array(w * h);
    for (const s of list) {
      const [bx, by, bw, bh] = s.bounds;
      for (let j = 0; j < bh; j++)
        for (let i = 0; i < bw; i++) {
          const x = bx + i - x0,
            y = by + j - y0;
          if (x >= 0 && y >= 0 && x < w && y < h)
            out[y * w + x] = Math.min(255, out[y * w + x] + s.mask[j * bw + i]);
        }
    }
    return out;
  };
  const covered = paint(surfaces),
    nearLeaf = dilate(paint(leaf), w, h, REVEAL_RADIUS),
    nearFrame = dilate(paint(frames), w, h, REVEAL_RADIUS),
    mask = new Uint8Array(w * h);
  let any = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        open = 255 - covered[i],
        guard = protectedMask[(y + y0) * sceneWidth + x + x0];
      if (open > 0 && guard < 128 && nearLeaf[i] > 127 && nearFrame[i] > 127) {
        mask[i] = open;
        any = true;
      }
    }
  return any ? { mask, bounds: [x0, y0, w, h] } : null;
}
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
  const surfaces = [];
  for (const definition of scene.surfaces) {
    const bounds = definition.mask.boundsPx,
      mask = red(await load(definition.mask.alpha), bounds),
      diffuse = red(await load(definition.lighting.diffuse), bounds);
    let specular: PixelBuffer | null = null;
    if (definition.lighting.specular) {
      const p = await load(definition.lighting.specular),
        [x, y, w, h] = bounds,
        data = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++)
        data.set(
          p.data.subarray(((y + j) * p.width + x) * 4, ((y + j) * p.width + x + w) * 4),
          j * w * 4,
        );
      specular = { width: w, height: h, data };
    }
    surfaces.push({
      definition,
      inverse: invertHomography(
        solveHomography(definition.mapping.worldQuadMm, definition.mapping.imageQuad01),
      ),
      mask,
      diffuse,
      specular,
      bounds,
    });
  }
  const reveal = revealMask(surfaces, protectedMask, scene.width);
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
