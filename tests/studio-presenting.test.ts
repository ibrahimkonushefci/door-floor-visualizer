import { it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import { getMessages } from '../src/lib/i18n/messages';
import { reduceSelection, type TrimPreference } from '../src/lib/studio/state';
import { createRenderController } from '../src/lib/studio/render-controller';
import { exportFileName, exportLabel, exportStripHeight } from '../src/lib/studio/export-image';
import { NO_ZOOM, clampZoom, maxZoomFor, panBy, sceneAt, zoomAt, zoomTransform } from '../src/lib/studio/zoom';
import type { PreparedScene, PreparedSurface } from '../src/lib/studio/types';
import { syntheticScene } from '../scripts/render-fixtures';
import { legacyCatalog } from '../scripts/legacy-scenes';
const data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials },
  scene = (id: string) => data.materials.scenes.find(s => s.id === id)!;
it('keeps an explicit "match floor" frame and skirting choice across a room without laminate', () => {
  const kitchen = scene('kitchen-render-01'),
    bathroom = scene('bathroom-render-01');
  expect(kitchen.surfaces.some(s => s.role === 'floor')).toBe(true);
  expect(bathroom.surfaces.some(s => s.role === 'floor')).toBe(false);
  const skirting = kitchen.allowedSkirtingModes.find(m => m !== kitchen.defaultSelection.skirtingMode)!;
  const preference: TrimPreference = { frameMode: 'floor', skirtingMode: skirting };
  let s = reduceSelection(kitchen.defaultSelection, { type: 'frame', mode: 'floor' }, catalog, preference);
  s = reduceSelection(s, { type: 'skirting', mode: skirting }, catalog, preference);
  expect([s.frameMode, s.skirtingMode]).toEqual(['floor', skirting]);
  const inBathroom = reduceSelection(s, { type: 'scene', sceneId: bathroom.id }, catalog, preference);
  expect(inBathroom.frameMode).not.toBe('floor');
  const back = reduceSelection(inBathroom, { type: 'scene', sceneId: kitchen.id }, catalog, preference);
  expect([back.frameMode, back.skirtingMode]).toEqual(['floor', skirting]);
  // Without a recorded preference the room's normalization stands (previous behaviour).
  expect(reduceSelection(inBathroom, { type: 'scene', sceneId: kitchen.id }, catalog).frameMode).toBe(
    inBathroom.frameMode,
  );
});
it('zoom keeps the point under the fingers, stays inside the frame and maps taps to the scene', () => {
  expect(clampZoom({ scale: 5, x: 1, y: -9 }, 3)).toEqual({ scale: 3, x: 0, y: -2 });
  expect(clampZoom({ scale: 0.5, x: -1, y: -1 }, 3)).toEqual(NO_ZOOM);
  const z = zoomAt(NO_ZOOM, 2, 0.25, 0.75, 3);
  expect(sceneAt(z, 0.25, 0.75)).toEqual([0.25, 0.75]);
  const panned = panBy(z, -0.1, 0, 3),
    [sx] = sceneAt(panned, 0.25, 0.75);
  expect(sx).toBeCloseTo(0.3);
  expect(zoomAt(z, 1, 0.5, 0.5, 3)).toEqual(NO_ZOOM);
  expect(zoomTransform(NO_ZOOM)).toBeUndefined();
  expect(maxZoomFor(1)).toBe(3);
  expect(maxZoomFor(0.5)).toBe(2);
});
it('hit-tests the prepared room: surfaces by mask, furniture and other rooms give null', async () => {
  const f = syntheticScene(),
    prepared: PreparedScene = { ...f.scene },
    c = createRenderController(legacyCatalog(data), {
      workerFactory: () => {
        throw new Error('Worker intentionally unavailable in test');
      },
      sceneLoader: async () => prepared,
      materialLoader: async () => f.materials,
    });
  const id = f.scene.scene.id;
  expect(c.prepared()).toBeNull();
  expect(c.hitTest(id, 0.5, 0.5)).toBeNull();
  await c.render(f.job);
  expect(c.prepared()).toEqual({ sceneId: id, scale: 1 });
  expect(c.hitTest(id, 0.5, 0.5)).toBe(f.scene.surfaces[0].definition.role);
  const [base] = f.scene.surfaces,
    surface = (role: 'floor' | 'door-leaf', bounds: [number, number, number, number]): PreparedSurface => ({
      ...base,
      definition: { ...base.definition, role },
      bounds,
      mask: new Uint8Array(bounds[2] * bounds[3]).fill(255),
    });
  const protectedMask = new Uint8Array(64);
  protectedMask[6 * 8 + 6] = 255;
  Object.assign(prepared, {
    surfaces: [surface('door-leaf', [0, 0, 4, 4]), surface('floor', [0, 4, 8, 4])],
    protectedMask,
  });
  expect(c.hitTest(id, 0.1, 0.1)).toBe('door-leaf');
  expect(c.hitTest(id, 0.6, 0.1)).toBeNull();
  expect(c.hitTest(id, 0.1, 0.9)).toBe('floor');
  expect(c.hitTest(id, 6.5 / 8, 6.5 / 8)).toBeNull();
  expect(c.hitTest('another-room', 0.1, 0.9)).toBeNull();
  expect(c.hitTest(id, 1.2, 0.5)).toBeNull();
  c.dispose();
});
it('a worker that stops answering is terminated and the frame still arrives', async () => {
  const f = syntheticScene();
  let terminated = 0;
  const silent = {
    onmessage: null,
    onerror: null,
    postMessage() {},
    terminate() {
      terminated++;
    },
  };
  const c = createRenderController(legacyCatalog(data), {
    workerFactory: () => silent as unknown as Worker,
    workerTimeoutMs: 20,
    sceneLoader: async () => f.scene,
    materialLoader: async () => f.materials,
  });
  const result = await c.render(f.job);
  expect(result.pixels.width).toBe(8);
  expect(result.pixels.data[0]).toBe(102);
  expect(terminated).toBe(1);
  c.dispose();
});
it('labels exported images with room, door, floor and trim in the visitor language', () => {
  const kitchen = scene('kitchen-render-01'),
    bathroom = scene('bathroom-render-01'),
    en = getMessages('en');
  const label = exportLabel(catalog, kitchen.defaultSelection, 'en', en);
  expect(label.room).toBe(kitchen.name.en);
  expect(label.rows.map(r => r[0])).toEqual([en['studio.door'], en['studio.floor'], en['inquiry.frame'], en['inquiry.skirting']]);
  expect(label.rows.every(r => r[1].length > 0)).toBe(true);
  expect(label.notice).toBe(en['studio.disclaimer']);
  const bath = exportLabel(catalog, bathroom.defaultSelection, 'de', getMessages('de'));
  expect(bath.rows).toHaveLength(3);
  expect(bath.rows[1][1]).toBe(getMessages('de')['studio.fixedFloor']);
  expect(exportFileName('Porta & Dysheme', 'Kuzhinë & ngrënie', new Date('2026-10-14T12:00:00Z'))).toBe(
    'porta-dysheme-kuzhine-ngrenie-2026-10-14.jpg',
  );
  expect(exportStripHeight(2400)).toBe(356);
  expect(exportStripHeight(1200)).toBe(178);
});
