// Import a Blender-rendered room (tools/blender/render_layers.py output) as a
// Studio scene:
//   tsx scripts/import-rendered-scene.ts [scene-id]        (default living-render-01)
// Reads tools/blender/out/<id>/layers/, writes brand/assets/scenes/<id>/ in the
// existing scene format (masks, light plates, calibration.json) extended with
// the floor position map, reflection plates, light tint and render metadata,
// and records every layer plus the CC0 render inputs in brand/asset-sources.json.
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
const FLOORS = ['lis-natyral-10', 'dushk-fshatar-8', 'peshk-natyral-12', 'arre-klasike-12', 'hirte-skandinave-8'];
const DOORS = ['dera-bardhe', 'dera-lis'];
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

export async function importRenderedScene(id = 'living-render-01') {
  const src = `tools/blender/out/${id}/layers`,
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

  const surfaces: RoomScene['surfaces'][number][] = [];
  for (const s of layers.surfaces) {
    const ref = reference(s.mapping.worldQuadMm, s.mapping.imageQuad01);
    surfaces.push({
      id: s.id,
      role: s.role,
      mask: { alpha: `${media}/${s.id}-mask.png`, boundsPx: await maskBounds(`${dir}/${s.id}-mask.png`) },
      lighting: {
        diffuse: `${media}/${s.id}-light.png`,
        baselineLinear: 1 / layers.lightScale,
        shadeMin: 0,
        shadeMax: Math.ceil(layers.lightScale * 1000) / 1000,
        specular: `${media}/${s.id}-reflection.png`,
        specularIncludedInDiffuse: false,
        specularScale: s.reflectionScale,
        tint: s.tint,
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
    });
  }
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
    allowedDoorProductIds: DOORS,
    allowedFloorProductIds: FLOORS,
    allowedFrameModes: ['door', 'floor', 'black'],
    allowedSkirtingModes: ['door', 'floor', 'black'],
    defaultSelection: {
      version: 1,
      sceneId: id,
      doorProductId: 'dera-bardhe',
      doorFinishId: 'bardhe-mat',
      floorProductId: 'lis-natyral-10',
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
  const products = JSON.parse(await readFile('brand/products.json', 'utf8'));
  for (const p of products.products)
    if ((DOORS.includes(p.id) || FLOORS.includes(p.id)) && !p.compatibleSceneIds.includes(id))
      p.compatibleSceneIds = [id, ...p.compatibleSceneIds];
  await writeFile('brand/products.json', JSON.stringify(products, null, 2) + '\n');
  return { id, surfaces: surfaces.map(s => s.id), files: entries.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(await importRenderedScene(process.argv[2]));
