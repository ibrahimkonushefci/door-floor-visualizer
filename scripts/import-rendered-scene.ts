// Import a Blender-rendered room (tools/blender/render_layers.py output) as a
// Studio scene:
//   tsx scripts/import-rendered-scene.ts [scene-id ...]    (default: every room in ROOMS)
// Reads tools/blender/out/<id>/<model>/layers/ (one render per door model,
// render_layers.py --model; non-default models may be cropped to a border
// around the door), writes brand/assets/scenes/<id>/ in the existing scene
// format (masks, light plates, calibration.json) extended with the floor
// position map, reflection plates, light tint and render metadata. The room's
// default model's layers are the scene's own; every model (the default too, for
// fast switching back) also gets crops of all its layers inside one shared
// region around the door (`doorModels`). Records every layer plus the CC0
// render inputs in brand/asset-sources.json and sets each product's
// compatibleSceneIds from the room rules below.
// Then run `pnpm assets:scenes` to publish it.
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { calibrationSchema } from '../src/lib/data/schemas';
import { projectPoint, solveHomography } from '../src/lib/studio/render/homography';
import type { LocalizedText, Quad, RenderedSceneCalibration, RoomScene, RoomType, Vec2 } from '../src/lib/data/types';
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
  defaultModel?: string; // absent in the Phase 1/2 living room (flat)
  models?: string[];
  border?: [number, number, number, number] | null; // x0, y0, x1, y1 of a cropped render
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
// Door models rendered for every room (tools/blender/room_spec.py DOOR_MODELS);
// each room lists them with its default first in layers.json.
export const MODELS = ['flat', 'grooved', 'glass-insert', 'filomuro'] as const;
const CONCEALED = new Set(['filomuro']);
// Every opaque door line has a rendered model in every room.
const DOORS = ['dera-bardhe', 'dera-lis', 'dera-kashmir', 'dera-antracit'];
const DEFAULT_FLOOR = 'kronotex-d4955';
interface RoomMeta {
  name: LocalizedText;
  description: LocalizedText;
  roomType: RoomType;
  /** Laminate rooms show every published floor; a bathroom keeps its fixed tiles. */
  floors: 'all' | 'none';
  door: { productId: string; finishId: string };
  geometry: string; // AUTHORING.md summary (true scale)
}
// Rooms in Studio order; ids match tools/blender/room_spec.py ROOMS.
export const ROOMS: Record<string, RoomMeta> = {
  'living-render-01': {
    name: { sq: 'Dhoma e ndenjes', en: 'Living room', de: 'Wohnzimmer' },
    description: {
      sq: 'Dhomë ndenjeje e mobiluar me dritë dite',
      en: 'Furnished living room in daylight',
      de: 'Möbliertes Wohnzimmer bei Tageslicht',
    },
    roomType: 'living',
    floors: 'all',
    door: { productId: 'dera-bardhe', finishId: 'bardhe-mat' },
    geometry: 'Room 5.2 × 6.0 × 2.7 m, window in the left wall; sofa, lounge chair, coffee table, rug, sideboard.',
  },
  'kitchen-render-01': {
    name: { sq: 'Kuzhina dhe ngrënia', en: 'Kitchen & dining', de: 'Küche & Essbereich' },
    description: {
      sq: 'Kuzhinë e hapur me tavolinë ngrënieje dhe dritë dite',
      en: 'Open kitchen with a dining table in daylight',
      de: 'Offene Küche mit Esstisch bei Tageslicht',
    },
    roomType: 'kitchen',
    floors: 'all',
    door: { productId: 'dera-bardhe', finishId: 'bardhe-mat' },
    geometry: 'Room 4.6 × 6.2 × 2.7 m, window in the left wall; L-shaped kitchen (back and right walls), dining table for four.',
  },
  'bedroom-render-01': {
    name: { sq: 'Dhoma e gjumit', en: 'Bedroom', de: 'Schlafzimmer' },
    description: {
      sq: 'Dhomë gjumi me shtrat dopio dhe perde liri',
      en: 'Bedroom with a double bed and linen curtains',
      de: 'Schlafzimmer mit Doppelbett und Leinenvorhängen',
    },
    roomType: 'bedroom',
    floors: 'all',
    door: { productId: 'dera-lis', finishId: 'lis-natyral' },
    geometry: 'Room 4.2 × 4.8 × 2.65 m, window in the right wall; upholstered double bed, nightstands, dresser with round mirror.',
  },
  'hallway-render-01': {
    name: { sq: 'Korridori', en: 'Hallway', de: 'Flur' },
    description: {
      sq: 'Korridor banese me ndriçim spotesh',
      en: 'Apartment hallway with ceiling spots',
      de: 'Wohnungsflur mit Deckenspots',
    },
    roomType: 'hallway',
    floors: 'all',
    door: { productId: 'dera-bardhe', finishId: 'gri-celet' },
    geometry: 'Hallway 1.7 × 5.6 × 2.65 m, no window (three ceiling spots); console with round mirror, bench, shoe cabinet.',
  },
  'hallway-render-02': {
    name: { sq: 'Hyrja me derë filomuro', en: 'Entrance with flush door', de: 'Eingang mit flächenbündiger Tür' },
    description: {
      sq: 'Hyrje minimaliste me derë filomuro në nivel me murin',
      en: 'Minimal entrance hall with a wall-flush filomuro door',
      de: 'Minimalistischer Eingang mit wandbündiger Filomuro-Tür',
    },
    roomType: 'hallway',
    floors: 'all',
    door: { productId: 'dera-kashmir', finishId: 'kashmir' },
    geometry: 'Entrance hall 2.4 × 5.0 × 2.7 m, no window (linear ceiling light); floating oak console, oak slat panel, shoe cabinet.',
  },
  'kids-render-01': {
    name: { sq: 'Dhoma e fëmijëve', en: "Kids' room", de: 'Kinderzimmer' },
    description: {
      sq: 'Dhomë fëmijësh me tavolinë pune dhe lodra',
      en: "Children's room with a desk and toys",
      de: 'Kinderzimmer mit Schreibtisch und Spielzeug',
    },
    roomType: 'kids',
    floors: 'all',
    door: { productId: 'dera-bardhe', finishId: 'bardhe-mat' },
    geometry: 'Room 3.6 × 4.3 × 2.6 m, window in the right wall; single bed, bookcase, desk, round rug with toys.',
  },
  'bathroom-render-01': {
    name: { sq: 'Banjo', en: 'Bathroom', de: 'Badezimmer' },
    description: {
      sq: 'Banjo me pllaka; ndryshohet vetëm dera (laminati nuk vendoset në banjo)',
      en: 'Tiled bathroom; only the door changes (laminate does not go into bathrooms)',
      de: 'Gefliestes Bad; nur die Tür wechselt (Laminat gehört nicht ins Bad)',
    },
    roomType: 'bathroom',
    floors: 'none',
    door: { productId: 'dera-bardhe', finishId: 'bardhe-mat' },
    geometry: 'Bathroom 2.6 × 3.3 × 2.6 m, no window; fixed 60 × 60 porcelain floor and 60 × 120 wall tiles (not editable, no skirting), bathtub, floating vanity.',
  },
};
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

export async function importRenderedScene(id: string) {
  const meta = ROOMS[id];
  if (!meta) throw new Error(`Unknown room ${id}; add it to ROOMS`);
  // Every model's layers.json names the room's default model (the Phase 1/2
  // living room predates that field: its default is flat).
  let defaultModel: string = MODELS[0];
  for (const m of MODELS) {
    const l: Layers | null = await readFile(`tools/blender/out/${id}/${m}/layers/layers.json`, 'utf8')
      .then(t => JSON.parse(t))
      .catch(() => null);
    if (l?.defaultModel) {
      defaultModel = l.defaultModel;
      break;
    }
  }
  const out = (model: string) => `tools/blender/out/${id}/${model}/layers`,
    src = out(defaultModel),
    dir = `brand/assets/scenes/${id}`,
    media = `/media/scenes/${id}`;
  const layers: Layers = JSON.parse(await readFile(`${src}/layers.json`, 'utf8'));
  const models = layers.models ?? [...MODELS];
  if (models[0] !== defaultModel || [...models].sort().join() !== [...MODELS].sort().join())
    throw new Error(`${id}: unexpected model list ${models.join()}`);
  const manifest = JSON.parse(await readFile(`${src}/render-manifest.json`, 'utf8'));
  if (layers.width !== 2400 || layers.height !== 1800) throw new Error('Rendered scenes are 2400×1800');
  if (layers.border) throw new Error(`${id}: the default model must be rendered in full`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const copies: Record<string, string> = {
    'base.png': 'base.png',
    'neutral.png': 'original.png',
    'protected-mask.png': 'protected-mask.png',
  };
  const hasFloor = layers.surfaces.some(s => s.role === 'floor');
  if (hasFloor) copies['floor-position.png'] = 'floor-position.png';
  for (const s of layers.surfaces)
    for (const kind of ['mask', 'light', 'reflection']) copies[`${s.id}-${kind}.png`] = `${s.id}-${kind}.png`;
  for (const [from, to] of Object.entries(copies)) await copyFile(`${src}/${from}`, `${dir}/${to}`);
  await sharp(`${src}/neutral.png`).resize(640, 480).png().toFile(`${dir}/thumbnail.png`);
  await copyFile(`${src}/render-manifest.json`, `${dir}/render-manifest.json`);

  // Laminate rooms show every published floor (supplier décors carry plank sheets).
  const products = JSON.parse(await readFile('brand/products.json', 'utf8'));
  const published: string[] = products.products
    .filter((p: { kind: string; published: boolean }) => p.kind === 'floor' && p.published)
    .map((p: { id: string }) => p.id);
  if (!published.includes(DEFAULT_FLOOR)) throw new Error(`Default floor ${DEFAULT_FLOOR} is not published`);
  if (hasFloor !== (meta.floors === 'all')) throw new Error(`${id}: floor rule does not match the render`);
  const floors = meta.floors === 'all' ? published : [];
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
    modelManifests = new Map<
      string,
      { samples: number; renderSeconds: Record<string, number>; checks: { hiddenSurfaces: string[] } & Record<string, unknown> }
    >();
  for (const m of models) {
    const l: Layers = JSON.parse(await readFile(`${out(m)}/layers.json`, 'utf8'));
    const man = JSON.parse(await readFile(`${out(m)}/render-manifest.json`, 'utf8'));
    if (l.width !== W || l.height !== H || man.samples !== manifest.samples || man.seed !== manifest.seed)
      throw new Error(`Door model ${m} rendered with different settings`);
    if (l.lightScale !== layers.lightScale) throw new Error(`Door model ${m} has its own light scale`);
    modelLayers.set(m, l);
    modelManifests.set(m, man);
  }
  // Pixels a model's render covers: everything, or its crop border.
  const covered = (m: string): Box => {
    const b = modelLayers.get(m)!.border;
    return b ? [b[0], b[1], b[2] - b[0], b[3] - b[1]] : [0, 0, W, H];
  };
  const within = (x: number, y: number, [bx, by, bw, bh]: Box) => x >= bx && y >= by && x < bx + bw && y < by + bh;
  const clip = (a: Box, b: Box): Box => {
    const x0 = Math.max(a[0], b[0]),
      y0 = Math.max(a[1], b[1]);
    return [x0, y0, Math.min(a[0] + a[2], b[0] + b[2]) - x0, Math.min(a[1] + a[3], b[1] + b[3]) - y0];
  };
  // One region for every model: each model's door assembly and hardware, plus
  // every nearby pixel whose light or base changes against the default model.
  let door: Box | null = null;
  for (const m of models) {
    door = union(door, boundsOf(await raw(`${out(m)}/protected-mask.png`)));
    for (const s of modelLayers.get(m)!.surfaces)
      if (s.role === 'door-leaf' || s.role === 'frame') door = union(door, boundsOf(await raw(`${out(m)}/${s.id}-mask.png`)));
  }
  const search = grow(door!, SEARCH_PX, W, H);
  let region: Box = door!;
  const maskPixelsOutside: Record<string, number> = {};
  const compared = ['base.png', 'neutral.png', ...layers.surfaces.map(s => `${s.id}-light.png`)];
  for (const m of models.slice(1)) {
    const window = clip(search, covered(m));
    const has = new Set(['base.png', 'neutral.png', ...modelLayers.get(m)!.surfaces.map(s => `${s.id}-light.png`)]);
    for (const file of compared.filter(f => has.has(f)))
      region = union(region, changed(await raw(`${src}/${file}`), await raw(`${out(m)}/${file}`), window))!;
    // Mask changes near the door join the region; stray differing pixels
    // elsewhere (BVH/sampling noise, e.g. under the sideboard) are counted in
    // door-models.json and keep the default model's coverage. Pixels outside a
    // cropped render's border were never rendered and are not compared.
    for (const s of modelLayers.get(m)!.surfaces) {
      const own = await raw(`${out(m)}/${s.id}-mask.png`);
      if (!layers.surfaces.some(d => d.id === s.id)) continue;
      const base = await raw(`${src}/${s.id}-mask.png`);
      for (let i = 0; i < own.data.length; i += own.channels)
        if (own.data[i] !== base.data[i]) {
          const p = i / own.channels,
            x = p % W,
            y = Math.floor(p / W);
          if (!within(x, y, covered(m))) continue;
          if (within(x, y, search)) region = union(region, [x, y, 1, 1])!;
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
  for (const m of models)
    if (!inside(region, covered(m))) throw new Error(`${id}/${m}: crop border ${covered(m).join()} misses region ${region.join()}`);
  const crop = (from: string, to: string) =>
    sharp(from)
      .extract({ left: region[0], top: region[1], width: region[2], height: region[3] })
      .png({ compressionLevel: 9 })
      .toFile(`${dir}/${to}`);
  const defaults = new Map(surfaces.map(s => [s.id, s]));
  const doorModels: NonNullable<RoomScene['doorModels']>[number][] = [];
  const layered = new Map<string, Set<string>>(); // model -> surfaces with crops
  const modelChecks: Record<string, unknown> = {};
  for (const m of models) {
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
      if (!layered.has(m)) layered.set(m, new Set());
      layered.get(m)!.add(s.id);
      // Surfaces reaching outside the region keep the default plate encodings
      // (light scale and tint), so the floor does not shift tone per model.
      const whole = inside(bounds, region) || !def;
      modelSurfaces.push(
        defineSurface(s, layers, media, files, bounds, whole ? s : { reflectionScale: def!.lighting.specularScale!, tint: def!.lighting.tint as [number, number, number] }),
      );
    }
    // A cropped render hides surfaces that lie wholly outside its border (e.g.
    // a far skirting); those keep the default model's layers unchanged.
    for (const hid of modelManifests.get(m)!.checks.hiddenSurfaces ?? []) {
      const def = defaults.get(hid);
      if (!def || modelSurfaces.some(v => v.id === hid)) continue;
      if (intersects(def.mask.boundsPx as Box, region)) throw new Error(`${id}/${m}: ${hid} hidden inside the door region`);
      modelSurfaces.push(def);
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
      ...(l.border ? { renderBorderPx: l.border } : {}),
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
        allowedFrameModes: CONCEALED.has(m) ? ['door'] : frameModes(meta),
      },
    });
  }
  // Switching model pastes only the new model's crops over the prepared scene,
  // so a surface one model patches must be patched by every model that shows
  // it. Where a model keeps the default layers (the surface misses the region
  // there, or the cropped render hid it), its patch carries the default crop.
  const patchedIds = new Set([...layered.values()].flatMap(v => [...v]));
  for (const dm of doorModels) {
    const own = layered.get(dm.modelId) ?? new Set();
    for (const v of dm.patch!.surfaces)
      if (patchedIds.has(v.id) && !own.has(v.id) && defaults.get(v.id) === v)
        for (const kind of ['mask', 'light', 'reflection'] as const) {
          const file = `model-${dm.modelId}-${v.id}-${kind}.png`;
          await crop(`${src}/${v.id}-${kind}.png`, file);
          (dm.patch!.layers as { image: string; over: string | null }[]).push({
            image: `${media}/${file}`,
            over: `${media}/${v.id}-${kind}.png`,
          });
        }
  }
  await writeFile(
    `${dir}/door-models.json`,
    JSON.stringify(
      {
        regionPx: region,
        method: `Union of every model's door assembly and hardware, plus pixels within ${SEARCH_PX} px whose 9×9 mean change in base/neutral/light plates exceeds ${DIFF_LEVELS} level(s) of 255 against ${defaultModel}, grown by ${MARGIN_PX} px and even-aligned. Non-default models may be rendered only inside a border around the door (renderBorderPx); the region must lie inside it.`,
        models: Object.fromEntries(
          models.map(m => [m, { renderSeconds: modelManifests.get(m)!.renderSeconds, samples: modelManifests.get(m)!.samples, checks: modelChecks[m] }]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  const concealed = CONCEALED.has(defaultModel);
  const scene: RoomScene = {
    id,
    name: meta.name,
    description: meta.description,
    roomType: meta.roomType,
    width: layers.width,
    height: layers.height,
    base: `${media}/base.webp`,
    original: `${media}/original.webp`,
    render: { source: 'blender', partitionedMasks: true, toneShoulder: layers.toneShoulder },
    thumbnail: `${media}/thumbnail.webp`,
    fallback: `${media}/fallback.webp`,
    frameType: concealed ? 'concealed-aluminium' : 'standard-casing',
    depictedDoorSizeMm: { width: 900, height: 2000 },
    surfaces,
    protectedMask: { alpha: `${media}/protected-mask.png`, boundsPx: await maskBounds(`${dir}/protected-mask.png`) },
    foreground: null,
    doorInserts: [],
    doorModels,
    allowedDoorProductIds: DOORS,
    allowedFloorProductIds: floors,
    allowedFrameModes: concealed ? ['door'] : frameModes(meta),
    // Without skirting the mode is inert but kept, so it survives a visit.
    allowedSkirtingModes: ['door', 'floor', 'black'],
    defaultSelection: {
      version: 1,
      sceneId: id,
      doorProductId: meta.door.productId,
      doorModelId: defaultModel,
      doorFinishId: meta.door.finishId,
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
    `# ${id} — Blender-rendered room (${meta.roomType})\n\n` +
      `Built by \`tools/blender/build_room.py --room ${id}\` (room module \`tools/blender/rooms/${id.replaceAll('-', '_')}.py\`) and rendered by \`tools/blender/render_layers.py\` in Blender ${manifest.blender} (Cycles, ${manifest.devices.join(', ')}), ${manifest.samples} samples per pass, seed ${manifest.seed}, adaptive sampling off, OpenImageDenoise. Imported by \`scripts/import-rendered-scene.ts\`. Exact settings, camera matrix and render times: \`render-manifest.json\`.\n\n` +
      `**Geometry (true scale).** ${meta.geometry} Door leaf 900 × 2000 × 40 mm in a 1000 × 2050 mm rough opening; casing 70 × 16 mm${meta.floors === 'all' ? ', skirting 80 × 16 mm (products `pervaze-mdf`, `lajsne-mdf`)' : ' (product `pervaze-mdf`)'}. Camera ${manifest.camera.lens_mm} mm on a ${manifest.camera.sensor_mm} mm sensor, level, lens shift ${manifest.camera.shift[1]}. ${meta.floors === 'all' ? 'Floor, door and trim mappings are exact projections of the modelled planes, so plank size is physically correct.' : 'Door and casing mappings are exact projections of the modelled planes. The tiled floor is part of the base plate and is never replaced: laminate does not go into bathrooms.'}\n\n` +
      `**Layers.** Masks are shader-AOV coverage (antialiased), jointly quantised so editable coverage never exceeds 255 per pixel. Light plates are Cycles diffuse light (Combined of a 50 % grey Lambertian pass ÷ 0.5), so contact shadows and bounce light are real; their constant light colour is stored as \`tint\`. Reflection plates are a black-dielectric (F0 0.04) pass, scaled at runtime by each material's gloss. The base plate is the light pass with each editable surface's share removed (exact at edges from a second pass at 25 % grey). \`original.png\` is the neutral render used by compare-with-original.${position ? ` \`floor-position.png\` is 16-bit world X/Y in ${position.unitMm} mm units (origin ${position.originMm.join(', ')} mm).` : ''}\n\n` +
      `**Checks at render time.** ${position ? `Position map vs Cycles Position pass: median ${position.cyclesPositionPassMedianDiffMm.toFixed(3)} mm, p99 ${position.cyclesPositionPassP99DiffMm.toFixed(3)} mm; one sample every ${position.stepPx} px, bilinear reconstruction vs the exact plane max ${position.reconstructionMaxErrorMm.toFixed(3)} mm (p99 ${position.reconstructionP99ErrorMm.toFixed(3)} mm, includes quantisation). ` : ''}Base edge clamp: p99 ${checks.backdropClampP99Linear.toFixed(4)}, max ${checks.backdropClampMaxLinear.toFixed(4)} (linear). Hidden surfaces (not exported): ${checks.hiddenSurfaces.join(', ') || 'none'}.\n\n` +
      `**Door models.** ${models.join(', ')} (\`tools/blender/room_spec.py\` DOOR_MODELS), same camera, seed and samples (\`render_layers.py --model\`), encoded with the ${defaultModel} light scale. The scene's own layers are ${defaultModel}; \`model-<id>-*.png\` are every model's layers cropped to one shared region (${region.join(', ')} px), pasted over the default layers at load time. ${models.slice(1).some(m => modelLayers.get(m)!.border) ? 'The other models were rendered only inside a border around the door (`render_layers.py --crop`; Cycles samples each pixel from its own coordinates, so those pixels equal a full render). ' : ''}Region method, border differences and render times: \`door-models.json\`. Filomuro is flush with the wall in a concealed aluminium frame with hidden hinges and no casing${meta.floors === 'all' ? '; its skirting runs to the opening' : ''}. The glass insert is satin glass lit from a short corridor behind the door.\n\n` +
      `**Inputs.** CC0 models, textures and HDRI from Poly Haven used by this room are listed with \`usedIn\` in \`tools/blender/assets.json\` (hashes in \`tools/blender/assets.lock.json\`, ledger \`renderInputs\`). Everything else (shell, door assembly, ${meta.roomType === 'kitchen' ? 'kitchen units, table, ' : ''}procedural furniture, materials) is modelled in \`tools/blender/{build_room,props}.py\` and the room module.\n`,
  );

  // Provenance: every scene layer.
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
  await upsertLedger(entries, { renderInputs: await renderInputs() });

  // Room rules: every opaque door line everywhere; floors only in laminate rooms.
  for (const p of products.products) {
    const allowed = DOORS.includes(p.id) || floors.includes(p.id),
      has = p.compatibleSceneIds?.includes(id);
    if (allowed && !has) p.compatibleSceneIds.push(id);
    if (!allowed && has) p.compatibleSceneIds = p.compatibleSceneIds.filter((v: string) => v !== id);
  }
  await writeFile('brand/products.json', JSON.stringify(products, null, 2) + '\n');
  return { id, surfaces: surfaces.map(s => s.id), files: entries.length, region };
}

const frameModes = (meta: RoomMeta): ('door' | 'floor' | 'black')[] =>
  // "Like the floor" makes no sense where no laminate is shown.
  meta.floors === 'all' ? ['door', 'floor', 'black'] : ['door', 'black'];

/** Poly Haven render inputs (tools/blender/assets.json) with their pinned files. */
async function renderInputs() {
  const lock = JSON.parse(await readFile('tools/blender/assets.lock.json', 'utf8'));
  const inputs = JSON.parse(await readFile('tools/blender/assets.json', 'utf8'));
  return inputs.assets.map((a: { id: string; page: string; author: string; license: string; type: string; usedIn: string[] }) => ({
    id: a.id,
    type: a.type,
    sourceUrl: a.page,
    author: a.author,
    license: a.license,
    usedIn: a.usedIn,
    files: lock.files
      .filter((f: { asset: string }) => f.asset === a.id)
      .map((f: { path: string; url: string; sha256: string; bytes: number }) => ({
        path: f.path,
        url: f.url,
        bytes: f.bytes,
        sha256: f.sha256,
      })),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  for (const id of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(ROOMS))
    console.log(await importRenderedScene(id));
