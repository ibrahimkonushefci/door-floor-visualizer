import type { RoomScene, StudioSelection } from '../data/types';
import type { PreparedScene, PreparedMaterials, PreparedPositionMap, StudioCatalog } from './types';
import { buildMipChain, buildByteMipChain, type ByteTexture, type FloatTexture, type PixelBuffer } from './render/sampling';
import { decodePng } from './render/png';
import { decode } from './render/color';
import { invertHomography, solveHomography } from './render/homography';
import { modelPatch, sceneForModel, switchPatch } from './door-models';
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
export type LoadBytes = (path: string, signal: AbortSignal) => Promise<Uint8Array>;
export const fetchBytes: LoadBytes = async (path, signal) => {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) throw new Error('Studio requires same-origin assets');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Asset ${response.status}: ${path}`);
  return new Uint8Array(await response.arrayBuffer());
};
export interface SceneLoadOptions {
  /** 1 = full resolution; 0.5 decodes every layer at half size (lighter phone variant). */
  scale?: number;
  loadBytes?: LoadBytes;
  /** Door model to draw (rendered scenes); its region crops are pasted over the default layers. */
  modelId?: string;
  /**
   * The same scene and scale already prepared with another door model. All
   * models agree outside the shared patch region, so only the region's crops
   * are decoded and pasted (no full-size layer is decoded again).
   */
  previous?: PreparedScene | null;
}
/** Copy of `under` (or zeros) with `crop` written at (x, y). */
export function pasteRegion(under: PixelBuffer | null, crop: PixelBuffer, x: number, y: number, W: number, H: number) {
  const data = under ? new Uint8ClampedArray(under.data) : new Uint8ClampedArray(W * H * 4);
  if (!under) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  if (x < 0 || y < 0 || x + crop.width > W || y + crop.height > H) throw new Error('Patch outside scene');
  for (let j = 0; j < crop.height; j++)
    data.set(crop.data.subarray(j * crop.width * 4, (j + 1) * crop.width * 4), ((y + j) * W + x) * 4);
  return { width: W, height: H, data };
}
/** Bounds at a decoded scale, grown outwards (plus a pixel for resampling spill) so no coverage is lost. */
export function scaleBounds(
  b: readonly [number, number, number, number],
  scale: number,
  width: number,
  height: number,
): readonly [number, number, number, number] {
  if (scale === 1) return b;
  const x0 = Math.max(0, Math.floor(b[0] * scale) - 1),
    y0 = Math.max(0, Math.floor(b[1] * scale) - 1),
    x1 = Math.min(width, Math.ceil((b[0] + b[2]) * scale) + 1),
    y1 = Math.min(height, Math.ceil((b[1] + b[3]) * scale) + 1);
  return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
}
async function loadPositionMap(
  map: NonNullable<RoomScene['surfaces'][number]['positionMap']>,
  scene: RoomScene,
  signal: AbortSignal,
  loadBytes: LoadBytes,
): Promise<PreparedPositionMap> {
  const png = await decodePng(await loadBytes(map.image, signal));
  signal.throwIfAborted();
  const gw = Math.floor((map.boundsPx[2] - 1) / map.stepPx) + 2,
    gh = Math.floor((map.boundsPx[3] - 1) / map.stepPx) + 2;
  if (png.depth !== 16 || png.channels !== 2 || png.width !== gw || png.height !== gh)
    throw new Error(`Invalid position map ${map.image}`);
  return {
    data: png.data as Uint16Array,
    bounds: map.boundsPx,
    stepPx: map.stepPx,
    samples: [gw, gh],
    originMm: map.originMm,
    unitMm: map.unitMm,
    sceneWidth: scene.width,
    sceneHeight: scene.height,
  };
}
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
  source: RoomScene,
  signal: AbortSignal,
  decode: DecodeAsset,
  options: SceneLoadOptions = {},
): Promise<PreparedScene> {
  const prev = options.previous;
  if (
    prev &&
    options.modelId &&
    prev.modelId &&
    prev.scene.id === source.id &&
    prev.scene.assetRevision === source.assetRevision &&
    (prev.scale ?? 1) === (options.scale ?? 1) &&
    switchPatch(source, options.modelId) &&
    switchPatch(source, prev.modelId)
  )
    return switchDoorModel(prev, source, options.modelId, signal, decode);
  const scale = options.scale ?? 1,
    W = Math.round(source.width * scale),
    H = Math.round(source.height * scale),
    rendered = !!source.render,
    decoded = new Map<string, Promise<PixelBuffer>>(),
    patch = options.modelId ? modelPatch(source, options.modelId) : null,
    scene = options.modelId ? sceneForModel(source, options.modelId) : source;
  // Rendered scenes share light plates between layers; decode each file once.
  const fullLayer = (path: string) => {
    let pending = decoded.get(path);
    if (!pending) {
      pending = decode(path, signal, scale === 1 ? undefined : Math.max(W, H)).then(p => {
        if (p.width !== W || p.height !== H) throw new Error(`Wrong scene asset shape ${path}`);
        return p;
      });
      decoded.set(path, pending);
    }
    return pending;
  };
  // A door model's crops cover regionPx (even-aligned, so exact at half scale).
  const patched = new Map<string, Promise<PixelBuffer>>();
  // With a door model, the region always comes from that model's crops (the
  // default model's too), so a full load equals a model switch pixel for pixel.
  const switching = options.modelId ? switchPatch(source, options.modelId) : null;
  const region = (crop: string, over: string | null) => {
    let pending = patched.get(crop);
    if (!pending) {
      const [rx, ry, rw, rh] = switching!.regionPx;
      pending = Promise.all([
        decode(crop, signal, scale === 1 ? undefined : Math.max(rw, rh) * scale),
        over ? fullLayer(over) : Promise.resolve(null),
      ]).then(([c, under]) => {
        if (c.width !== Math.round(rw * scale) || c.height !== Math.round(rh * scale))
          throw new Error(`Wrong patch shape ${crop}`);
        return pasteRegion(under, c, Math.round(rx * scale), Math.round(ry * scale), W, H);
      });
      patched.set(crop, pending);
    }
    return pending;
  };
  const overs = new Map(patch?.layers.map(l => [l.image, l.over]) ?? []),
    ownCrops = new Map(
      switching && !patch ? switching.layers.flatMap(l => (l.over ? [[l.over, l.image] as const] : [])) : [],
    );
  const load = (path: string) =>
    overs.has(path)
      ? region(path, overs.get(path)!)
      : ownCrops.has(path)
        ? region(ownCrops.get(path)!, path)
        : fullLayer(path);
  const sb = (b: readonly [number, number, number, number]) => scaleBounds(b, scale, W, H);
  // Partitioned (rendered) scenes never read the protected mask at runtime.
  const base = switching ? await region(switching.base, scene.base) : await load(scene.base),
    protectedMask = rendered ? new Uint8Array(0) : red(await load(scene.protectedMask.alpha));
  // Leaf and casing layers are kept full-size until the assembly is unified.
  // Rendered scenes have complete, partitioned door masks and skip that step.
  const door = new Set(rendered ? [] : ['door-leaf', 'frame']);
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
    const bounds = sb(definition.mask.boundsPx);
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
      bounds = boundsOf(l.full.mask, W, l.bounds);
      mask = crop(l.full.mask, W, bounds);
      diffuse = crop(l.full.diffuse, W, bounds);
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
      baseline: rendered ? undefined : trimBaseline(l.definition, mask, diffuse),
      position: null as PreparedPositionMap | null,
      inverse: invertHomography(
        solveHomography(l.definition.mapping.worldQuadMm, l.definition.mapping.imageQuad01),
      ),
      mask,
      diffuse,
      specular,
      bounds,
    };
  });
  if (scale !== 1) renormaliseCoverage(surfaces, W, H);
  for (const surface of surfaces)
    if (surface.definition.positionMap)
      surface.position = await loadPositionMap(
        surface.definition.positionMap,
        scene,
        signal,
        options.loadBytes ?? fetchBytes,
      );
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
    scale,
    scene,
    modelId: options.modelId,
    base,
    protectedMask,
    surfaces,
    inserts,
    insertMasks,
    foreground: scene.foreground ? await load(scene.foreground) : null,
  };
}
/** Rebuild a prepared scene for another door model from the region crops alone. */
async function switchDoorModel(
  prev: PreparedScene,
  source: RoomScene,
  modelId: string,
  signal: AbortSignal,
  decode: DecodeAsset,
): Promise<PreparedScene> {
  const scale = prev.scale ?? 1,
    W = prev.base.width,
    H = prev.base.height,
    patch = switchPatch(source, modelId)!,
    scene = sceneForModel(source, modelId),
    [rx, ry, rw, rh] = patch.regionPx.map(v => Math.round(v * scale)),
    crops = new Map(patch.layers.map(l => [l.image, l.over]));
  const crop = async (path: string) => {
    const c = await decode(path, signal, scale === 1 ? undefined : Math.max(rw, rh));
    if (c.width !== rw || c.height !== rh) throw new Error(`Wrong patch shape ${path}`);
    return c;
  };
  const base = pasteRegion(prev.base, await crop(patch.base), rx, ry, W, H);
  const inRegion = (x: number, y: number) => x >= rx && y >= ry && x < rx + rw && y < ry + rh;
  // One layer at `bounds`: the previous model's pixels, then this model's crop over the region.
  const rebase = async (
    bounds: readonly [number, number, number, number],
    old: { data: ArrayLike<number>; bounds: readonly [number, number, number, number] } | null,
    channels: 1 | 4,
    path: string,
  ) => {
    const [bx, by, bw, bh] = bounds,
      out = channels === 1 ? new Uint8Array(bw * bh) : new Uint8ClampedArray(bw * bh * 4);
    if (old) {
      const [ox, oy, ow, oh] = old.bounds;
      for (let y = Math.max(by, oy); y < Math.min(by + bh, oy + oh); y++)
        for (let x = Math.max(bx, ox); x < Math.min(bx + bw, ox + ow); x++)
          if (!inRegion(x, y))
            for (let k = 0; k < channels; k++)
              out[((y - by) * bw + x - bx) * channels + k] = old.data[((y - oy) * ow + x - ox) * channels + k];
    }
    if (crops.has(path)) {
      const c = await crop(path);
      for (let y = Math.max(by, ry); y < Math.min(by + bh, ry + rh); y++)
        for (let x = Math.max(bx, rx); x < Math.min(bx + bw, rx + rw); x++)
          for (let k = 0; k < channels; k++)
            out[((y - by) * bw + x - bx) * channels + k] =
              c.data[((y - ry) * rw + x - rx) * 4 + (channels === 1 ? 0 : k)];
    } else if (old === null) throw new Error(`Door model layer without source ${path}`);
    return out;
  };
  const surfaces: PreparedScene['surfaces'][number][] = [];
  // The patch's surfaces name the crops; the drawn definitions are the scene's
  // (identical for the default model apart from naming its full-size layers).
  for (const layer of patch.surfaces) {
    signal.throwIfAborted();
    const definition = scene.surfaces.find(s => s.id === layer.id) ?? layer,
      bounds = scaleBounds(layer.mask.boundsPx, scale, W, H),
      old = prev.surfaces.find(s => s.definition.id === layer.id) ?? null;
    const mask = (await rebase(bounds, old && { data: old.mask, bounds: old.bounds }, 1, layer.mask.alpha)) as Uint8Array,
      diffuse = (await rebase(bounds, old && { data: old.diffuse, bounds: old.bounds }, 1, layer.lighting.diffuse)) as Uint8Array;
    const spec = layer.lighting.specular;
    const specular = spec
      ? {
          width: bounds[2],
          height: bounds[3],
          data: (await rebase(bounds, old?.specular ? { data: old.specular.data, bounds: old.bounds } : null, 4, spec)) as Uint8ClampedArray,
        }
      : null;
    surfaces.push({
      definition,
      baseline: undefined,
      position: old?.position ?? null,
      inverse: invertHomography(solveHomography(definition.mapping.worldQuadMm, definition.mapping.imageQuad01)),
      mask,
      diffuse,
      specular,
      bounds,
    });
  }
  if (scale !== 1) renormaliseCoverage(surfaces, W, H);
  return { ...prev, scene, modelId, base, surfaces, reveal: null };
}
// Resampling each mask on its own (and rounding it to bytes) can let adjacent
// surfaces sum past full coverage along shared edges; scale such pixels back.
function renormaliseCoverage(
  surfaces: readonly { mask: Uint8Array; bounds: readonly [number, number, number, number] }[],
  W: number,
  H: number,
) {
  const sum = new Uint16Array(W * H);
  const each = (fn: (mask: Uint8Array, i: number, p: number) => void) => {
    for (const { mask, bounds: [bx, by, bw, bh] } of surfaces)
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) fn(mask, y * bw + x, (y + by) * W + x + bx);
  };
  each((mask, i, p) => (sum[p] += mask[i]));
  each((mask, i, p) => {
    if (sum[p] > 255) mask[i] = Math.floor((mask[i] * 255) / sum[p]);
  });
}
export const prepareScene = (scene: RoomScene, signal: AbortSignal, options?: SceneLoadOptions) =>
  prepareSceneWith(scene, signal, decodeAsset, options);
/**
 * The scene definition the renderer prepares for a selection: glass inserts are
 * decoded only while a glass finish is shown. Shared by the render controller and
 * the first-load budget (scripts/verify-budgets.ts), so both count the same files.
 */
export function sceneLoadFor(definition: RoomScene, s: StudioSelection, c: StudioCatalog) {
  const glass = c.materials.doorFinishes.find(f => f.id === s.doorFinishId)?.kind === 'glass';
  return { glass, scene: glass ? definition : { ...definition, doorInserts: [] } };
}
/** Whether the selection's room shows a laminate floor at all (a bathroom does not). */
function floorShown(s: StudioSelection, c: StudioCatalog) {
  const scene = c.materials.scenes.find(v => v.id === s.sceneId);
  return !scene || scene.surfaces.some(v => v.role === 'floor');
}
/** Plank sheet of the selected floor when the scene lays boards from a position map. */
export function sheetFor(s: StudioSelection, c: StudioCatalog) {
  const product = c.products.find(p => p.id === s.floorProductId),
    scene = c.materials.scenes.find(v => v.id === s.sceneId);
  if (product?.kind !== 'floor' || !scene) return null;
  const floor = c.materials.floorCollections.find(f => f.id === product.collectionId)!;
  const positional = scene.surfaces.some(v => v.role === 'floor' && v.positionMap);
  return positional && floor.planks && floor.atlas.pattern !== 'chevron' ? floor.planks.image : null;
}
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
  const sheet = sheetFor(s, c);
  const paths = new Set(sheet || !floorShown(s, c) ? [] : [floor.atlas.image]);
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
  const sheets = new Map<string, readonly ByteTexture[]>();
  if (sheet) sheets.set(sheet, buildByteMipChain(await decode(sheet, signal)));
  return { textures, sheets, data: c.materials, products: c.products };
}
export const prepareMaterials = (s: StudioSelection, c: StudioCatalog, signal: AbortSignal) =>
  prepareMaterialsWith(s, c, signal, decodeAsset);

// One controller owns this cache. Whole chains are evicted by bytes; only two
// floor atlases may be retained. Aborted decodes are never inserted.
export function createMaterialLoader(decode: DecodeAsset = decodeAsset) {
  const cached = new Map<string, readonly (FloatTexture | ByteTexture)[]>();
  let bytes = 0;
  const size = (chain: readonly (FloatTexture | ByteTexture)[]) =>
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
    const sheet = sheetFor(s, c);
    const paths = new Set(sheet ? [sheet] : floorShown(s, c) ? [floor.atlas.image] : []);
    for (const a of [
      finish.kind === 'opaque' ? finish.appearance : null,
      finish.trim.appearance,
      floor.trim.appearance,
    ])
      if (a?.kind === 'texture') paths.add(a.texture);
    const textures = new Map<string, readonly FloatTexture[]>(),
      sheets = new Map<string, readonly ByteTexture[]>();
    for (const path of paths) {
      signal.throwIfAborted();
      let chain = cached.get(path);
      if (chain) {
        cached.delete(path);
        cached.set(path, chain);
      } else {
        chain =
          path === sheet
            ? buildByteMipChain(await decode(path, signal))
            : buildMipChain(await decode(path, signal, TEXTURE_MAX_EDGE));
        signal.throwIfAborted();
        cached.set(path, chain);
        bytes += size(chain);
      }
      if (path === sheet) sheets.set(path, chain as readonly ByteTexture[]);
      else textures.set(path, chain as readonly FloatTexture[]);
    }
    const atlases = new Set(
      c.materials.floorCollections.flatMap(f => [f.atlas.image, ...(f.planks ? [f.planks.image] : [])]),
    );
    while ([...cached.keys()].filter(p => atlases.has(p)).length > 2) {
      const path = [...cached.keys()].find(p => atlases.has(p) && !paths.has(p))!;
      remove(path);
    }
    while (bytes > TEXTURE_CACHE_BYTES) {
      const path = [...cached.keys()].find(p => !paths.has(p));
      if (!path) throw new Error('Active texture set exceeds cache budget');
      remove(path);
    }
    return { textures, sheets, data: c.materials, products: c.products };
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
