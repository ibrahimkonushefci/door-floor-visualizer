import type { RoomScene, StudioSelection } from '../data/types';
import type { PreparedScene, PreparedMaterials, StudioCatalog } from './types';
import { buildMipChain, type PixelBuffer } from './render/sampling';
import { invertHomography, solveHomography } from './render/homography';
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
    textures.set(path, buildMipChain(await decode(path, signal, 768)));
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
        chain = buildMipChain(await decode(path, signal, 512));
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
    while (bytes > 6 * 1024 * 1024) {
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
