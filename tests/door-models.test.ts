import { it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import { prepareSceneWith } from '../src/lib/studio/asset-loader';
import { normalizeSelection, reduceSelection } from '../src/lib/studio/state';
import { parseStudioQuery, serializeStudioQuery } from '../src/lib/studio/query';
import { sceneModelIds } from '../src/lib/studio/door-models';
import { decodeNode, bytesNode } from '../scripts/prepare-scenes';
import type { PreparedScene } from '../src/lib/studio/types';

const data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials },
  room = data.materials.scenes.find(s => s.doorModels)!,
  signal = new AbortController().signal;

const load = (modelId: string, scale: 1 | 0.5, previous?: PreparedScene) =>
  prepareSceneWith(room, signal, decodeNode, { loadBytes: bytesNode, scale, modelId, previous });
function expectSame(a: PreparedScene, b: PreparedScene) {
  expect(a.scene.surfaces.map(s => s.id)).toEqual(b.scene.surfaces.map(s => s.id));
  expect(Buffer.from(a.base.data).equals(Buffer.from(b.base.data))).toBe(true);
  for (const [i, s] of a.surfaces.entries()) {
    const t = b.surfaces[i];
    expect(s.bounds).toEqual(t.bounds);
    expect(Buffer.from(s.mask).equals(Buffer.from(t.mask))).toBe(true);
    expect(Buffer.from(s.diffuse).equals(Buffer.from(t.diffuse))).toBe(true);
    expect(Buffer.from(s.specular!.data).equals(Buffer.from(t.specular!.data))).toBe(true);
    expect(s.definition.lighting).toEqual(t.definition.lighting);
  }
}

it('the proof room offers every door model, the default first', () => {
  expect(sceneModelIds(room)).toEqual(['flat', 'grooved', 'glass-insert', 'filomuro']);
  expect(room.defaultSelection.doorModelId).toBe('flat');
  const filomuro = room.doorModels!.find(m => m.modelId === 'filomuro')!;
  expect(filomuro.frameType).toBe('concealed-aluminium');
  expect(filomuro.patch!.surfaces.some(s => s.role === 'frame')).toBe(false);
  for (const m of room.doorModels!) expect(m.patch!.regionPx).toEqual(room.doorModels![0].patch!.regionPx);
});

for (const scale of [1, 0.5] as const)
  it(`switching door models from the prepared scene matches a full load (scale ${scale})`, async () => {
    const flat = await load('flat', scale);
    let previous = flat;
    for (const modelId of ['grooved', 'glass-insert', 'filomuro', 'flat']) {
      const fast = await load(modelId, scale, previous),
        full = await load(modelId, scale);
      expect(fast.modelId).toBe(modelId);
      expectSame(fast, full);
      previous = fast;
    }
    expectSame(previous, flat);
  }, 120_000);

it('hidden doors get the flush model and an inert concealed frame; models roundtrip in the URL', () => {
  const s = reduceSelection(
    { ...room.defaultSelection, frameMode: 'black' },
    { type: 'door', productId: 'dera-kashmir', finishId: 'kashmir' },
    catalog,
  );
  expect(s).toMatchObject({ doorProductId: 'dera-kashmir', doorModelId: 'filomuro', frameMode: 'door' });
  for (const modelId of ['flat', 'grooved', 'glass-insert'])
    for (const frameMode of ['door', 'floor', 'black'] as const) {
      const t = normalizeSelection({ ...room.defaultSelection, doorModelId: modelId, frameMode }, catalog).selection;
      expect(t).toMatchObject({ doorModelId: modelId, frameMode });
      expect(parseStudioQuery(serializeStudioQuery(t), catalog).selection).toEqual(t);
    }
  // A standard door asked for the flush model keeps its own default model.
  expect(normalizeSelection({ ...room.defaultSelection, doorModelId: 'filomuro' }, catalog).selection.doorModelId).toBe(
    'flat',
  );
  // Old links without a model open the door line's default model.
  const legacy = new URLSearchParams(serializeStudioQuery(room.defaultSelection));
  legacy.delete('model');
  expect(parseStudioQuery(legacy, catalog).selection).toEqual(room.defaultSelection);
});
