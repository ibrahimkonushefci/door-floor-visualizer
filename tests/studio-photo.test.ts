// Own-room photo tool (Phase 5): intake, segmentation post-processing, mask
// touch-up, perspective, lighting plate and the render through the kernel.
import { describe, it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import type { Quad } from '../src/lib/data/types';
import { buildMipChain, type PixelBuffer } from '../src/lib/studio/render/sampling';
import { renderRows } from '../src/lib/studio/render/kernel';
import { createRenderController } from '../src/lib/studio/render-controller';
import type { PreparedScene } from '../src/lib/studio/types';
import type { RoomScene } from '../src/lib/data/types';
import { fitSize, focalPxFrom35mm, readExif } from '../src/lib/studio/photo/intake';
import {
  classProbability,
  maskFromProbability,
  maskIoU,
  segformerInput,
  SEGFORMER,
  snapToEdges,
} from '../src/lib/studio/photo/segment';
import { applyStamp, createMaskHistory, stampBounds } from '../src/lib/studio/photo/mask-edit';
import { floorPlane, guessQuad, plankPreviewLines } from '../src/lib/studio/photo/perspective';
import { maskBounds, photoLightingPlate } from '../src/lib/studio/photo/lighting';
import {
  photoCatalog,
  photoSceneDefinition,
  photoSelection,
  preparePhotoScene,
  PHOTO_SCENE_ID,
} from '../src/lib/studio/photo/scene';

const data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials };

function image(w: number, h: number, color: (x: number, y: number) => [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = color(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

// A level camera tilted down by `pitch`, `height` mm above the floor (x right, y down, z forward).
function project(X: number, Z: number, o: { w: number; h: number; f: number; height: number; pitch: number }) {
  const c = Math.cos(o.pitch),
    s = Math.sin(o.pitch),
    y = o.height,
    yc = y * c - Z * s,
    zc = y * s + Z * c;
  return [(o.w / 2 + (o.f * X) / zc) / o.w, (o.h / 2 + (o.f * yc) / zc) / o.h] as const;
}

describe('intake', () => {
  it('reads EXIF orientation and the 35 mm focal length from a JPEG', () => {
    // SOI, APP1 "Exif\0\0", little-endian TIFF: IFD0 {Orientation=6, ExifIFD→26}, ExifIFD {0xA405=26}.
    const tiff = [
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // header, IFD0 at 8
      0x02, 0x00, // 2 entries
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, // Orientation = 6
      0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00, // ExifIFD at 38
      0x00, 0x00, 0x00, 0x00, // next IFD
      0x01, 0x00, // 1 entry
      0x05, 0xa4, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, // FocalLengthIn35mmFilm = 26
      0x00, 0x00, 0x00, 0x00,
    ];
    const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff],
      bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, app1.length + 2, ...app1, 0xff, 0xd9]);
    expect(readExif(bytes)).toEqual({ orientation: 6, focal35: 26 });
    expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({});
  });
  it('caps photos at 2048 px on the long edge and never enlarges', () => {
    expect(fitSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitSize(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(fitSize(1600, 1200)).toEqual({ width: 1600, height: 1200 });
    // A 26 mm-equivalent lens on a 4:3 frame: f ≈ 0.75 × long edge.
    expect(focalPxFrom35mm(26, 2048, 1536) / 2048).toBeCloseTo(0.751, 2);
  });
});

describe('segmentation post-processing', () => {
  it('prepares a normalised 512×512 NCHW input', () => {
    const input = segformerInput(image(640, 480, () => [124, 116, 104]));
    expect(input.length).toBe(3 * SEGFORMER.size * SEGFORMER.size);
    // ImageNet mean colour maps to about zero in every channel.
    for (const c of [0, 1, 2]) expect(Math.abs(input[c * 512 * 512 + 1000])).toBeLessThan(0.02);
  });
  it('turns floor logits into a soft mask at the photo size', () => {
    const w = 4,
      h = 4,
      logits = new Float32Array(SEGFORMER.classes * w * h);
    // Bottom half: floor wins clearly; top half: wall (class 0).
    for (let i = 0; i < w * h; i++) logits[(i >= 8 ? SEGFORMER.floorClass : 0) * w * h + i] = 8;
    const prob = classProbability(logits, SEGFORMER.classes, w, h, SEGFORMER.floorClass);
    expect(prob[12]).toBeGreaterThan(0.9);
    expect(prob[0]).toBeLessThan(0.01);
    const mask = maskFromProbability(prob, w, h, 40, 40);
    expect(mask[39 * 40 + 20]).toBe(255);
    expect(mask[0]).toBe(0);
  });
  it('snaps a blocky mask edge onto the photo edge', () => {
    // Dark wall above y = 60, light floor below; the coarse mask starts 8 px too high.
    const photo = image(160, 120, (_, y) => (y < 60 ? [60, 60, 60] : [200, 170, 130])),
      truth = new Uint8Array(160 * 120).map((_, i) => (Math.floor(i / 160) >= 60 ? 255 : 0)),
      coarse = new Uint8Array(160 * 120).map((_, i) => (Math.floor(i / 160) >= 52 ? 255 : 0));
    const snapped = snapToEdges({ width: 160, height: 120, data: coarse }, photo, 24, 0.0004, 2);
    expect(maskIoU(snapped.data, truth)).toBeGreaterThan(maskIoU(coarse, truth));
    expect(maskIoU(snapped.data, truth)).toBeGreaterThan(0.97);
  });
});

describe('mask touch-up', () => {
  it('paints, erases, undoes and redoes strokes exactly', () => {
    const photo = image(100, 80, () => [128, 128, 128]),
      history = createMaskHistory({ width: 100, height: 80, data: new Uint8Array(8000) });
    const stamp = { x: 50, y: 40, radius: 10, mode: 'paint' as const, snap: false };
    history.begin(stampBounds([stamp], 100, 80)!);
    applyStamp(history.mask, photo, stamp);
    const moved = { ...stamp, x: 70 };
    history.extend(stampBounds([moved], 100, 80)!);
    applyStamp(history.mask, photo, moved);
    history.end();
    const painted = history.mask.data.slice();
    expect(painted[40 * 100 + 50]).toBe(255);
    expect(painted[40 * 100 + 70]).toBe(255);
    history.replace(new Uint8Array(8000));
    expect(history.undo()).toBe(true);
    expect(history.mask.data).toEqual(painted);
    expect(history.undo()).toBe(true);
    expect(history.mask.data.every(v => v === 0)).toBe(true);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(history.mask.data).toEqual(painted);
  });
  it('stops a snapping brush at a strong colour edge', () => {
    // Floor (light) left of x = 50, sofa (dark) right of it.
    const photo = image(100, 60, x => (x < 50 ? [200, 170, 130] : [50, 40, 35])),
      mask = { width: 100, height: 60, data: new Uint8Array(6000) };
    applyStamp(mask, photo, { x: 45, y: 30, radius: 15, mode: 'paint', snap: true });
    expect(mask.data[30 * 100 + 40]).toBe(255);
    expect(mask.data[30 * 100 + 55]).toBe(0);
    applyStamp(mask, photo, { x: 45, y: 30, radius: 15, mode: 'paint', snap: false });
    expect(mask.data[30 * 100 + 55]).toBe(255);
  });
});

describe('perspective', () => {
  const cam = { w: 1600, h: 1200, f: 1200, height: 1400, pitch: (20 * Math.PI) / 180 };
  const rect = [
    [-1000, 5000],
    [1000, 5000],
    [1000, 2500],
    [-1000, 2500],
  ] as const;
  const quad = rect.map(([X, Z]) => project(X, Z, cam)) as unknown as Quad;
  it('recovers a floor rectangle at true size from four corners', () => {
    const r = floorPlane(quad, cam.w, cam.h, cam.f, cam.height);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b, c, d] = r.plane.worldQuadMm,
      len = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    expect(len(a, d)).toBeCloseTo(2500, -1); // depth
    expect(len(c, d)).toBeCloseTo(2000, -1); // width
    expect(len(a, b)).toBeCloseTo(2000, -1);
    // Depth runs along u (lengthwise planks run into the room).
    expect(Math.abs(a[0] - d[0])).toBeGreaterThan(2490);
    // Image → world → image round trip.
    expect(plankPreviewLines(r.plane, { lengthMm: 1375, widthMm: 188 }, 0, { top: 0.3, bottom: 1 }).length).toBeGreaterThan(20);
  });
  it('rejects corners that describe a ceiling or cross the horizon', () => {
    // Far edge wider than the near edge: the sides meet below, so this plane is seen from beneath.
    const ceiling: Quad = [
      [0.1, 0.5],
      [0.9, 0.5],
      [0.6, 0.9],
      [0.4, 0.9],
    ];
    expect(floorPlane(ceiling, cam.w, cam.h, cam.f).ok).toBe(false);
    // Self-intersecting corners give no plane either.
    const crossed = [quad[0], quad[2], quad[1], quad[3]] as unknown as Quad;
    expect(floorPlane(crossed, cam.w, cam.h, cam.f).ok).toBe(false);
  });
  it('guesses corners that form a valid floor rectangle', () => {
    // Floor below a straight wall line, with plank joints converging on (800, 160).
    const W = 800,
      H = 600,
      vp = [400, 80],
      photo = image(W, H, (x, y) => {
        if (y < 260) return [235, 232, 226];
        const t = (x - vp[0]) / (y - vp[1]),
          stripe = Math.abs(((t * 6) % 1) + 1) % 1 < 0.08;
        return stripe ? [110, 80, 50] : [170, 130, 90];
      }),
      mask = { width: W, height: H, data: new Uint8Array(W * H).map((_, i) => (Math.floor(i / W) >= 260 ? 255 : 0)) };
    const q = guessQuad(photo, mask, 0.76 * W);
    expect(floorPlane(q, W, H, 0.76 * W).ok).toBe(true);
    for (const p of q) expect(p[1]).toBeGreaterThan(260 / H);
  });
});

describe('lighting plate', () => {
  it('keeps the light and drops the plank grain', () => {
    // Floor with a soft light gradient (window left) and strong board-to-board
    // tone differences (±15 %); a near board is about 5 % of the frame wide.
    const W = 400,
      H = 300,
      photo = image(W, H, (x, y) => {
        const light = 0.6 + 0.4 * (1 - x / W),
          grain = Math.floor(x / 19) % 2 ? 1.15 : 0.85,
          v = Math.round(150 * light * grain);
        return y < 100 ? [240, 240, 240] : [v, v, v];
      }),
      mask = { width: W, height: H, data: new Uint8Array(W * H).map((_, i) => (Math.floor(i / W) >= 100 ? 255 : 0)) };
    const plate = photoLightingPlate(photo, mask)!;
    expect(maskBounds(mask)).toEqual([0, 100, 400, 200]);
    expect(plate.bounds).toEqual([0, 100, 400, 200]);
    const row = 100,
      at = (x: number) => plate.diffuse[row * 400 + x];
    // Light falls off from left to right, but neighbouring planks no longer alternate.
    expect(at(40)).toBeGreaterThan(at(360));
    // Board-to-board alternation (second difference, which ignores the light
    // gradient): about 80 sRGB levels in the photo, a few in the plate.
    const alternation = (v: (x: number) => number, x: number) => Math.abs(2 * v(x) - v(x - 19) - v(x + 19));
    expect(alternation(x => photo.data[(200 * W + x) * 4], 200)).toBeGreaterThan(60);
    for (let x = 124; x < 300; x += 19) expect(alternation(at, x)).toBeLessThanOrEqual(8);
    expect(plate.baselineLinear).toBeGreaterThan(0.025);
  });
});

describe('photo scene', () => {
  it('renders the new floor through the kernel and leaves the rest of the photo untouched', () => {
    const W = 160,
      H = 120,
      photo = image(W, H, (x, y) => (y < 60 ? [220, 215, 205] : [120, 90, 60])),
      mask = { width: W, height: H, data: new Uint8Array(W * H).map((_, i) => (Math.floor(i / W) >= 60 ? 255 : 0)) },
      quad: Quad = [
        [0.3, 0.6],
        [0.7, 0.6],
        [0.9, 0.95],
        [0.1, 0.95],
      ],
      result = floorPlane(quad, W, H, 0.76 * W),
      plate = photoLightingPlate(photo, mask)!;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const floor = catalog.products.find(p => p.kind === 'floor' && p.published)!,
      input = { photo, mask, plate, quad, plane: result.plane, light: 1, revision: 7 },
      definition = photoSceneDefinition(input, catalog, floor.id),
      scene = preparePhotoScene(input, definition),
      selection = photoSelection(catalog, floor.id, 0);
    expect(definition.id).toBe(PHOTO_SCENE_ID);
    expect(definition.assetRevision).toBe('photo-7');
    expect(photoCatalog(catalog, () => definition).materials.scenes).toEqual([definition]);
    const collection = data.materials.floorCollections.find(c => floor.kind === 'floor' && c.id === floor.collectionId)!,
      texture = image(32, 32, () => [40, 160, 220]);
    const materials = {
      textures: new Map([[collection.atlas.image, buildMipChain(texture)]]),
      sheets: new Map(),
      data: data.materials,
      products: catalog.products,
    };
    const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
    renderRows({ id: 1, selection, width: W, height: H, quality: 'settled', rendererVersion: 2 }, scene, materials, out, 0, H);
    // Wall: byte-identical to the photo.
    for (let i = 0; i < W * 50; i++) for (let c = 0; c < 3; c++) expect(out.data[i * 4 + c]).toBe(photo.data[i * 4 + c]);
    // Floor: the new (blue) material under the photo's light.
    const i = (100 * W + 80) * 4;
    expect(out.data[i + 2]).toBeGreaterThan(out.data[i]);
  });
  it('re-prepares the photo scene in the shared controller when its revision changes', async () => {
    const W = 64,
      H = 48,
      photo = image(W, H, (_, y) => (y < 24 ? [220, 215, 205] : [120, 90, 60])),
      mask = { width: W, height: H, data: new Uint8Array(W * H).map((_, i) => (Math.floor(i / W) >= 24 ? 255 : 0)) },
      quad: Quad = [
        [0.3, 0.6],
        [0.7, 0.6],
        [0.9, 0.95],
        [0.1, 0.95],
      ],
      plane = floorPlane(quad, W, H, 0.76 * W),
      plate = photoLightingPlate(photo, mask)!;
    if (!plane.ok) throw new Error('plane');
    const floor = catalog.products.find(p => p.kind === 'floor' && p.published)!;
    let current: { definition: RoomScene; prepared: PreparedScene } | null = null,
      loads = 0;
    const build = (light: number, revision: number) => {
      const input = { photo, mask, plate, quad, plane: plane.plane, light, revision },
        definition = photoSceneDefinition(input, catalog, floor.id);
      current = { definition, prepared: preparePhotoScene(input, definition) };
    };
    const collection = data.materials.floorCollections.find(c => floor.kind === 'floor' && c.id === floor.collectionId)!;
    const controller = createRenderController(
      photoCatalog(catalog, () => current?.definition ?? null),
      {
        sceneLoader: async () => (loads++, current!.prepared),
        materialLoader: async () => ({
          textures: new Map([[collection.atlas.image, buildMipChain(image(16, 16, () => [200, 120, 60]))]]),
          sheets: new Map(),
          data: data.materials,
          products: catalog.products,
        }),
      },
    );
    const job = { selection: photoSelection(catalog, floor.id, 0), width: W, height: H, quality: 'settled' as const, rendererVersion: 2 as const };
    build(1, 1);
    const a = await controller.render(job);
    build(1.3, 2);
    const b = await controller.render(job);
    expect(loads).toBe(2);
    // Brighter light → a brighter floor; the wall stays the photo.
    const i = (40 * W + 32) * 4;
    expect(b.pixels.data[i]).toBeGreaterThan(a.pixels.data[i]);
    expect(b.pixels.data[0]).toBe(photo.data[0]);
    controller.dispose();
  });
});

