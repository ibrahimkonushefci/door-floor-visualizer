// Import a Blender-rendered room (tools/blender/render_layers.py output) as a
// Studio scene:
//   tsx scripts/import-rendered-scene.ts [scene-id]        (default living-render-01)
// Reads tools/blender/out/<id>/<model>/layers/ (one render per door model,
// render_layers.py --model), writes brand/assets/scenes/<id>/ in the existing
// scene format (masks, light plates, calibration.json) extended with the floor
// position map, reflection plates, light tint and render metadata. The first
// model's layers are the scene's own; every model (the first too, for fast
// switching back) also gets crops of all its layers inside one shared region
// around the door (`doorModels`). Records every layer plus the CC0 render
// inputs in brand/asset-sources.json.
// Then run `pnpm assets:scenes` to publish it.
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { calibrationSchema } from '../src/lib/data/schemas';
import { projectPoint, solveHomography } from '../src/lib/studio/render/homography';
import type { Quad, RenderedSceneCalibration, RoomScene, Vec2 } from '../src/lib/data/types';
import { upsertLedger, type LedgerEntry } from './asset-ledger';

interface LayerSurface {
  id: string;
  role: RoomScene['surfaces'][number]['role'];
  boundsPx: [number, number, number, number];
  reflectionScale: number;
  tint: [number, number, number];
  mapping: { worldQuadMm: Quad; imageQuad01: Quad; uvRotationDeg: 0 | 90 };
}
interface Layers {
  scene: string;
  width: number;
  height: number;
  toneShoulder: number;
  lightScale: number;
  surfaces: LayerSurface[];
  floorPosition: {
    boundsPx: [number, number, number, number];
    originMm: Vec2;
    unitMm: number;
    stepPx: number;
  };
}
// Door models rendered for this room, default first (tools/blender/room_spec.py DOOR_MODELS).
export const MODELS = ['flat', 'grooved', 'glass-insert', 'filomuro'] as const;
const CONCEALED = new Set(['filomuro']);
const DOORS = ['dera-bardhe', 'dera-lis', 'dera-kashmir', 'dera-antracit'];
const DEFAULT_FLOOR = 'kronotex-d4955';
// Region search: door assembly grown by SEARCH_PX; pixels whose 9×9 mean
// change exceeds DIFF_LEVELS (8-bit) join; the result grows by MARGIN_PX.
const SEARCH_PX = 160,
  DIFF_LEVELS = 1,
  MARGIN_PX = 16;
type Box = [number, number, number, number];
interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}
async function raw(file: string): Promise<RawImage> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}
function boundsOf(img: RawImage): Box | null {
  let x0 = img.width,
    y0 = img.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * img.channels]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
const union = (a: Box | null, b: Box | null): Box | null =>
  !a
    ? b
    : !b
      ? a
      : [
          Math.min(a[0], b[0]),
          Math.min(a[1], b[1]),
          Math.max(a[0] + a[2], b[0] + b[2]) - Math.min(a[0], b[0]),
          Math.max(a[1] + a[3], b[1] + b[3]) - Math.min(a[1], b[1]),
        ];
const grow = ([x, y, w, h]: Box, by: number, W: number, H: number): Box => {
  const x0 = Math.max(0, x - by),
    y0 = Math.max(0, y - by);
  return [x0, y0, Math.min(W, x + w + by) - x0, Math.min(H, y + h + by) - y0];
};
const intersects = (a: Box, b: Box) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const inside = (a: Box, b: Box) => a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];
/** Box (within `win`) of pixels whose 9×9 mean absolute difference exceeds DIFF_LEVELS. */
function changed(a: RawImage, b: RawImage, win: Box): Box | null {
  const [wx, wy, ww, wh] = win,
    c = a.channels,
    d = new Float32Array(ww * wh);
  for (let y = 0; y < wh; y++)
    for (let x = 0; x < ww; x++) {
      const i = ((y + wy) * a.width + x + wx) * c;
      let m = 0;
      for (let k = 0; k < Math.min(c, 3); k++) m = Math.max(m, Math.abs(a.data[i + k] - b.data[i + k]));
      d[y * ww + x] = m;
    }
  const r = 4,
    tmp = new Float32Array(ww * wh);
  for (let y = 0; y < wh; y++)
    for (let x = 0; x < ww; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += d[y * ww + Math.min(ww - 1, Math.max(0, x + k))];
      tmp[y * ww + x] = s / 9;
    }
  let box: Box | null = null;
  for (let y = 0; y < wh; y++)
    for (let x = 0; x < ww; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(wh - 1, Math.max(0, y + k)) * ww + x];
      if (s / 9 > DIFF_LEVELS) box = union(box, [x + wx, y + wy, 1, 1]);
    }
  return box;
}
/** Largest per-channel difference between two images along the inner edge of `box`. */
function borderDiff(a: RawImage, b: RawImage, [x, y, w, h]: Box) {
  let m = 0;
  const at = (img: RawImage, px: number, py: number, k: number) => img.data[(py * img.width + px) * img.channels + k];
  for (let i = 0; i < w; i++)
    for (const py of [y, y + h - 1])
      for (let k = 0; k < Math.min(a.channels, 3); k++) m = Math.max(m, Math.abs(at(a, x + i, py, k) - at(b, x + i, py, k)));
  for (let j = 0; j < h; j++)
    for (const px of [x, x + w - 1])
      for (let k = 0; k < Math.min(a.channels, 3); k++) m = Math.max(m, Math.abs(at(a, px, y + j, k) - at(b, px, y + j, k)));
  return m;
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function maskBounds(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width,
    y0 = info.height,
    x1 = -1,
    y1 = -1;
  for (let i = 0; i < data.length; i += 4)
    if (data[i]) {
      const x = (i / 4) % info.width,
        y = Math.floor(i / 4 / info.width);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return (x1 < 0 ? [0, 0, info.width, info.height] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1]) as [
    number,
    number,
    number,
    number,
  ];
}
// A same-plane reference segment that lies inside the frame (the schema keeps
// reference points in 0..1): the first of several chords of the plane quad.
function reference(world: Quad, image: Quad) {
  const h = solveHomography(world, image),
    lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const inside = (p: Vec2) => p[0] > 0.002 && p[0] < 0.998 && p[1] > 0.002 && p[1] < 0.998;
  for (const t of [0, 0.1, 0.25, 0.4])
    for (const [a, b] of [
      [lerp(world[0], world[3], t), lerp(world[1], world[2], t)],
      [lerp(world[3], world[0], t), lerp(world[2], world[1], t)],
      [lerp(world[0], world[1], 0.25 + t / 2), lerp(world[3], world[2], 0.25 + t / 2)],
    ] as [Vec2, Vec2][]) {
      const pa = projectPoint(h, a),
        pb = projectPoint(h, b);
      if (inside(pa) && inside(pb))
        return { world: [a, b] as [Vec2, Vec2], image: [pa, pb] as [Vec2, Vec2], length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    }
  throw new Error('No in-frame reference segment');
}

function defineSurface(
  s: LayerSurface,
  layers: Layers,
  media: string,
  files: { mask: string; light: string; reflection: string },
  boundsPx: Box,
  lighting: { reflectionScale: number; tint: [number, number, number] } = s,
): RoomScene['surfaces'][number] {
  const ref = reference(s.mapping.worldQuadMm, s.mapping.imageQuad01);
  return {
    id: s.id,
    role: s.role,
    mask: { alpha: `${media}/${files.mask}`, boundsPx },
    lighting: {
      diffuse: `${media}/${files.light}`,
      baselineLinear: 1 / layers.lightScale,
      shadeMin: 0,
      shadeMax: Math.ceil(layers.lightScale * 1000) / 1000,
      specular: `${media}/${files.reflection}`,
      specularIncludedInDiffuse: false,
      specularScale: lighting.reflectionScale,
      tint: lighting.tint,
    },
    mapping: {
      worldQuadMm: s.mapping.worldQuadMm,
      imageQuad01: s.mapping.imageQuad01,
      calibration: {
        method: 'measured-plane',
        note: 'Exact projection of the modelled plane through the Blender camera (tools/blender/render_layers.py).',
        referenceLengthMm: Math.round(ref.length * 1000) / 1000,
        referenceImageSegment01: ref.image,
        referenceWorldSegmentMm: ref.world,
      },
    },
    uvRotationDeg: s.mapping.uvRotationDeg,
    ...(s.role === 'floor'
      ? {
          positionMap: {
            image: `${media}/floor-position.png`,
            boundsPx: layers.floorPosition.boundsPx,
            originMm: layers.floorPosition.originMm,
            unitMm: layers.floorPosition.unitMm,
            stepPx: layers.floorPosition.stepPx,
          },
        }
      : {}),
  };
}

export async function importRenderedScene(id = 'living-render-01') {
  const out = (model: string) => `tools/blender/out/${id}/${model}/layers`,
    src = out(MODELS[0]),
    dir = `brand/assets/scenes/${id}`,
    media = `/media/scenes/${id}`;
  const layers: Layers = JSON.parse(await readFile(`${src}/layers.json`, 'utf8'));
  const manifest = JSON.parse(await readFile(`${src}/render-manifest.json`, 'utf8'));
  if (layers.width !== 2400 || layers.height !== 1800) throw new Error('Rendered scenes are 2400×1800');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const copies: Record<string, string> = {
    'base.png': 'base.png',
    'neutral.png': 'original.png',
    'protected-mask.png': 'protected-mask.png',
    'floor-position.png': 'floor-position.png',
  };
  for (const s of layers.surfaces)
    for (const kind of ['mask', 'light', 'reflection']) copies[`${s.id}-${kind}.png`] = `${s.id}-${kind}.png`;
  for (const [from, to] of Object.entries(copies)) await copyFile(`${src}/${from}`, `${dir}/${to}`);
  await sharp(`${src}/neutral.png`).resize(640, 480).png().toFile(`${dir}/thumbnail.png`);
  await copyFile(`${src}/render-manifest.json`, `${dir}/render-manifest.json`);

  // Every published floor is shown here (supplier décors carry plank sheets).
  const products = JSON.parse(await readFile('brand/products.json', 'utf8'));
  const floors: string[] = products.products
    .filter((p: { kind: string; published: boolean }) => p.kind === 'floor' && p.published)
    .map((p: { id: string }) => p.id);
  if (!floors.includes(DEFAULT_FLOOR)) throw new Error(`Default floor ${DEFAULT_FLOOR} is not published`);
  const surfaces: RoomScene['surfaces'][number][] = [];
  for (const s of layers.surfaces)
    surfaces.push(
      defineSurface(
        s,
        layers,
        media,
        { mask: `${s.id}-mask.png`, light: `${s.id}-light.png`, reflection: `${s.id}-reflection.png` },
        await maskBounds(`${dir}/${s.id}-mask.png`),
      ),
    );

  // --- door models -------------------------------------------------------------
  const W = layers.width,
    H = layers.height,
    modelLayers = new Map<string, Layers>(),
    modelManifests = new Map<string, { samples: number; renderSeconds: Record<string, number>; checks: Record<string, unknown> }>();
  for (const m of MODELS) {
    const l: Layers = JSON.parse(await readFile(`${out(m)}/layers.json`, 'utf8'));
    const man = JSON.parse(await readFile(`${out(m)}/render-manifest.json`, 'utf8'));
    if (l.width !== W || l.height !== H || man.samples !== manifest.samples || man.seed !== manifest.seed)
      throw new Error(`Door model ${m} rendered with different settings`);
    if (l.lightScale !== layers.lightScale) throw new Error(`Door model ${m} has its own light scale`);
    modelLayers.set(m, l);
    modelManifests.set(m, man);
  }
  // One region for every model: each model's door assembly and hardware, plus
  // every nearby pixel whose light or base changes against the default model.
  let door: Box | null = null;
  for (const m of MODELS) {
    door = union(door, boundsOf(await raw(`${out(m)}/protected-mask.png`)));
    for (const s of modelLayers.get(m)!.surfaces)
      if (s.role === 'door-leaf' || s.role === 'frame') door = union(door, boundsOf(await raw(`${out(m)}/${s.id}-mask.png`)));
  }
  const search = grow(door!, SEARCH_PX, W, H);
  let region: Box = door!;
  const maskPixelsOutside: Record<string, number> = {};
  const compared = ['base.png', 'neutral.png', ...layers.surfaces.map(s => `${s.id}-light.png`)];
  for (const m of MODELS.slice(1)) {
    const has = new Set(['base.png', 'neutral.png', ...modelLayers.get(m)!.surfaces.map(s => `${s.id}-light.png`)]);
    for (const file of compared.filter(f => has.has(f)))
      region = union(region, changed(await raw(`${src}/${file}`), await raw(`${out(m)}/${file}`), search))!;
    // Mask changes near the door join the region; stray differing pixels
    // elsewhere (BVH/sampling noise, e.g. under the sideboard) are counted in
    // door-models.json and keep the default model's coverage.
    for (const s of modelLayers.get(m)!.surfaces) {
      const own = await raw(`${out(m)}/${s.id}-mask.png`);
      if (!layers.surfaces.some(d => d.id === s.id)) continue;
      const base = await raw(`${src}/${s.id}-mask.png`);
      for (let i = 0; i < own.data.length; i += own.channels)
        if (own.data[i] !== base.data[i]) {
          const p = i / own.channels,
            x = p % W,
            y = Math.floor(p / W);
          if (x >= search[0] && y >= search[1] && x < search[0] + search[2] && y < search[1] + search[3])
            region = union(region, [x, y, 1, 1])!;
          else maskPixelsOutside[m] = (maskPixelsOutside[m] ?? 0) + 1;
        }
    }
  }
  region = grow(region, MARGIN_PX, W, H);
  // Even-aligned so the half-resolution variant pastes exactly.
  {
    const x0 = region[0] & ~1,
      y0 = region[1] & ~1,
      x1 = Math.min(W, (region[0] + region[2] + 1) & ~1),
      y1 = Math.min(H, (region[1] + region[3] + 1) & ~1);
    region = [x0, y0, x1 - x0, y1 - y0];
  }
  const crop = (from: string, to: string) =>
    sharp(from)
      .extract({ left: region[0], top: region[1], width: region[2], height: region[3] })
      .png({ compressionLevel: 9 })
      .toFile(`${dir}/${to}`);
  const defaults = new Map(surfaces.map(s => [s.id, s]));
  const doorModels: NonNullable<RoomScene['doorModels']>[number][] = [];
  const modelChecks: Record<string, unknown> = {};
  for (const m of MODELS) {
    const l = modelLayers.get(m)!,
      prefix = `model-${m}-`;
    await crop(`${out(m)}/base.png`, `${prefix}base.png`);
    await crop(`${out(m)}/neutral.png`, `${prefix}original.png`);
    await crop(`${out(m)}/protected-mask.png`, `${prefix}protected-mask.png`);
    const patchLayers: { image: string; over: string | null }[] = [];
    const modelSurfaces: RoomScene['surfaces'][number][] = [];
    const sum = new Uint16Array(region[2] * region[3]);
    let maskBorder = 0,
      lightBorder = 0;
    for (const s of l.surfaces) {
      const own = await raw(`${out(m)}/${s.id}-mask.png`),
        def = defaults.get(s.id),
        under = def ? await raw(`${src}/${s.id}-mask.png`) : null;
      // The surface as shown: default pixels outside the region, this model's inside.
      let bounds: Box | null = null;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const inR = x >= region[0] && y >= region[1] && x < region[0] + region[2] && y < region[1] + region[3],
            v = inR ? own.data[(y * W + x) * own.channels] : under ? under.data[(y * W + x) * under.channels] : 0;
          if (v) bounds = union(bounds, [x, y, 1, 1]);
          if (inR) sum[(y - region[1]) * region[2] + x - region[0]] += v;
        }
      if (!bounds) continue;
      if (!intersects(bounds, region)) {
        if (!def) throw new Error(`${m}/${s.id} lies outside the door region but has no default layers`);
        modelSurfaces.push(def);
        continue;
      }
      if (under) {
        maskBorder = Math.max(maskBorder, borderDiff(own, under, region));
        lightBorder = Math.max(lightBorder, borderDiff(await raw(`${out(m)}/${s.id}-light.png`), await raw(`${src}/${s.id}-light.png`), region));
      }
      const files = { mask: `${prefix}${s.id}-mask.png`, light: `${prefix}${s.id}-light.png`, reflection: `${prefix}${s.id}-reflection.png` };
      for (const kind of ['mask', 'light', 'reflection'] as const) {
        await crop(`${out(m)}/${s.id}-${kind}.png`, files[kind]);
        patchLayers.push({ image: `${media}/${files[kind]}`, over: def ? `${media}/${s.id}-${kind}.png` : null });
      }
      // Surfaces reaching outside the region keep the default plate encodings
      // (light scale and tint), so the floor does not shift tone per model.
      const whole = inside(bounds, region) || !def;
      modelSurfaces.push(
        defineSurface(s, l, media, files, bounds, whole ? s : { reflectionScale: def!.lighting.specularScale!, tint: def!.lighting.tint as [number, number, number] }),
      );
    }
    let overlap = 0;
    for (const v of sum) overlap = Math.max(overlap, v);
    if (overlap > 255) throw new Error(`${m}: surface masks overlap (${overlap})`);
    const protectedFull = await raw(`${out(m)}/protected-mask.png`),
      protectedDefault = await raw(`${src}/protected-mask.png`);
    let protectedBounds: Box | null = null;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const inR = x >= region[0] && y >= region[1] && x < region[0] + region[2] && y < region[1] + region[3],
          img = inR ? protectedFull : protectedDefault;
        if (img.data[(y * W + x) * img.channels]) protectedBounds = union(protectedBounds, [x, y, 1, 1]);
      }
    const baseBorder = borderDiff(await raw(`${out(m)}/base.png`), await raw(`${src}/base.png`), region);
    modelChecks[m] = {
      maskBorderMax: maskBorder,
      lightBorderMax: lightBorder,
      baseBorderMax: baseBorder,
      maskSumMax: overlap,
      maskPixelsDifferingOutsideRegion: maskPixelsOutside[m] ?? 0,
    };
    doorModels.push({
      modelId: m,
      frameType: CONCEALED.has(m) ? 'concealed-aluminium' : 'standard-casing',
      patch: {
        regionPx: region,
        // Published as WebP like the full base (scripts/prepare-scenes.ts).
        base: `${media}/${prefix}base.webp`,
        original: `${media}/${prefix}original.webp`,
        layers: patchLayers,
        surfaces: modelSurfaces,
        protectedMask: { alpha: `${media}/${prefix}protected-mask.png`, boundsPx: protectedBounds ?? [0, 0, W, H] },
        allowedFrameModes: CONCEALED.has(m) ? ['door'] : ['door', 'floor', 'black'],
      },
    });
  }
  await writeFile(
    `${dir}/door-models.json`,
    JSON.stringify(
      {
        regionPx: region,
        method: `Union of every model's door assembly and hardware, plus pixels within ${SEARCH_PX} px whose 9×9 mean change in base/neutral/light plates exceeds ${DIFF_LEVELS} level(s) of 255 against ${MODELS[0]}, grown by ${MARGIN_PX} px and even-aligned.`,
        models: Object.fromEntries(
          MODELS.map(m => [m, { renderSeconds: modelManifests.get(m)!.renderSeconds, samples: modelManifests.get(m)!.samples, checks: modelChecks[m] }]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  const scene: RoomScene = {
    id,
    name: { sq: 'Dhoma e ndenjes 3D', en: 'Living room 3D', de: 'Wohnzimmer 3D' },
    description: {
      sq: 'Dhomë e mobiluar, e renderuar në Blender me dritë dite',
      en: 'Furnished room rendered in Blender with daylight',
      de: 'Möbliertes Zimmer, in Blender mit Tageslicht gerendert',
    },
    width: layers.width,
    height: layers.height,
    base: `${media}/base.webp`,
    original: `${media}/original.webp`,
    render: { source: 'blender', partitionedMasks: true, toneShoulder: layers.toneShoulder },
    thumbnail: `${media}/thumbnail.webp`,
    fallback: `${media}/fallback.webp`,
    frameType: 'standard-casing',
    depictedDoorSizeMm: { width: 900, height: 2000 },
    surfaces,
    protectedMask: { alpha: `${media}/protected-mask.png`, boundsPx: await maskBounds(`${dir}/protected-mask.png`) },
    foreground: null,
    doorInserts: [],
    doorModels,
    allowedDoorProductIds: DOORS,
    allowedFloorProductIds: floors,
    allowedFrameModes: ['door', 'floor', 'black'],
    allowedSkirtingModes: ['door', 'floor', 'black'],
    defaultSelection: {
      version: 1,
      sceneId: id,
      doorProductId: 'dera-bardhe',
      doorModelId: MODELS[0],
      doorFinishId: 'bardhe-mat',
      floorProductId: DEFAULT_FLOOR,
      frameMode: 'door',
      skirtingMode: 'door',
      floorRotationDeg: 0,
    },
    assetRevision: 'pending',
  };
  const calibration: RenderedSceneCalibration = {
    schemaVersion: 1,
    kind: 'rendered',
    scene,
    renderManifest: 'render-manifest.json',
  };
  calibrationSchema.parse(calibration);
  await writeFile(`${dir}/calibration.json`, JSON.stringify(calibration, null, 2) + '\n');

  const checks = manifest.checks,
    position = manifest.floorPosition;
  await writeFile(
    `${dir}/AUTHORING.md`,
    `# ${id} — Blender-rendered proof room\n\n` +
      `Built by \`tools/blender/build_room.py\` and rendered by \`tools/blender/render_layers.py\` in Blender ${manifest.blender} (Cycles, ${manifest.devices.join(', ')}), ${manifest.samples} samples per pass, seed ${manifest.seed}, adaptive sampling off, OpenImageDenoise. Imported by \`scripts/import-rendered-scene.ts\`. Exact settings, camera matrix and render times: \`render-manifest.json\`.\n\n` +
      `**Geometry (true scale).** Room 5.2 × 6.0 × 2.7 m. Door leaf 900 × 2000 × 40 mm in a 1000 × 2050 mm rough opening; casing 70 × 16 mm, skirting 80 × 16 mm (products \`pervaze-mdf\`, \`lajsne-mdf\`). Camera ${manifest.camera.lens_mm} mm on a ${manifest.camera.sensor_mm} mm sensor at 1.55 m, level, lens shift ${manifest.camera.shift[1]}. Floor, door and trim mappings are exact projections of the modelled planes, so plank size is physically correct.\n\n` +
      `**Layers.** Masks are shader-AOV coverage (antialiased), jointly quantised so editable coverage never exceeds 255 per pixel. Light plates are Cycles diffuse light (Combined of a 50 % grey Lambertian pass ÷ 0.5), so contact shadows and bounce light are real; their constant light colour is stored as \`tint\`. Reflection plates are a black-dielectric (F0 0.04) pass, scaled at runtime by each material's gloss. The base plate is the light pass with each editable surface's share removed (exact at edges from a second pass at 25 % grey). \`original.png\` is the neutral render used by compare-with-original. \`floor-position.png\` is 16-bit world X/Y in ${position.unitMm} mm units (origin ${position.originMm.join(', ')} mm).\n\n` +
      `**Checks at render time.** Position map vs Cycles Position pass: median ${position.cyclesPositionPassMedianDiffMm.toFixed(3)} mm, p99 ${position.cyclesPositionPassP99DiffMm.toFixed(3)} mm; one sample every ${position.stepPx} px, bilinear reconstruction vs the exact plane max ${position.reconstructionMaxErrorMm.toFixed(3)} mm (p99 ${position.reconstructionP99ErrorMm.toFixed(3)} mm, includes quantisation). Base edge clamp: p99 ${checks.backdropClampP99Linear.toFixed(4)}, max ${checks.backdropClampMaxLinear.toFixed(4)} (linear). Hidden surfaces (not exported): ${checks.hiddenSurfaces.join(', ') || 'none'}.\n\n` +
      `**Door models.** ${MODELS.join(', ')} (\`tools/blender/room_spec.py\` DOOR_MODELS), each a full render with the same camera, seed and samples (\`render_layers.py --model\`), encoded with the ${MODELS[0]} light scale. The scene's own layers are ${MODELS[0]}; \`model-<id>-*.png\` are every model's layers cropped to one shared region (${region.join(', ')} px), pasted over the default layers at load time. Region method, border differences and render times: \`door-models.json\`. Filomuro is flush with the wall in a concealed aluminium frame with hidden hinges and no casing; its skirting runs to the opening. The glass insert is satin glass lit from a short corridor behind the door.\n\n` +
      `**Inputs.** CC0 models, texture and HDRI from Poly Haven (\`tools/blender/assets.json\`, hashes in \`tools/blender/assets.lock.json\`, ledger \`renderInputs\`). Sideboard, print, vase, books, curtains, window and the door assembly are modelled in the build script.\n`,
  );

  // Provenance: every scene layer, plus the third-party render inputs.
  const lock = JSON.parse(await readFile('tools/blender/assets.lock.json', 'utf8'));
  const inputs = JSON.parse(await readFile('tools/blender/assets.json', 'utf8'));
  const entries: LedgerEntry[] = [];
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.png')).sort())
    entries.push({
      id: `${id}-${file.replace('.png', '')}`,
      localPath: `${dir}/${file}`,
      sourceUrl: null,
      author: `Porta & Dysheme, rendered in Blender ${manifest.blender} (tools/blender)`,
      usageBasis: 'owned',
      licenseNote:
        'Own 3D render of a modelled room. Third-party inputs are CC0-1.0 Poly Haven assets listed in renderInputs (no attribution required). Illustrative room; layer derivation in the scene AUTHORING.md.',
      depictsProductId: null,
      isIllustrative: true,
      sha256: sha(await readFile(`${dir}/${file}`)),
    });
  const ledger = JSON.parse(await readFile('brand/asset-sources.json', 'utf8'));
  const stale = ledger.assets.filter(
    (a: LedgerEntry) => a.localPath.startsWith(`${dir}/`) && !entries.some(e => e.id === a.id),
  );
  if (stale.length) {
    ledger.assets = ledger.assets.filter((a: LedgerEntry) => !stale.includes(a));
    await writeFile('brand/asset-sources.json', JSON.stringify(ledger, null, 2) + '\n');
  }
  await upsertLedger(entries, {
    renderInputs: inputs.assets.map((a: { id: string; page: string; author: string; license: string; type: string }) => ({
      id: a.id,
      type: a.type,
      sourceUrl: a.page,
      author: a.author,
      license: a.license,
      usedIn: [id],
      files: lock.files
        .filter((f: { asset: string }) => f.asset === a.id)
        .map((f: { path: string; url: string; sha256: string; bytes: number }) => ({
          path: f.path,
          url: f.url,
          bytes: f.bytes,
          sha256: f.sha256,
        })),
    })),
  });

  // Make the room available to the proof products.
  for (const p of products.products)
    if ((DOORS.includes(p.id) || floors.includes(p.id)) && !p.compatibleSceneIds.includes(id))
      p.compatibleSceneIds = [id, ...p.compatibleSceneIds];
  await writeFile('brand/products.json', JSON.stringify(products, null, 2) + '\n');
  return { id, surfaces: surfaces.map(s => s.id), files: entries.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(await importRenderedScene(process.argv[2]));
