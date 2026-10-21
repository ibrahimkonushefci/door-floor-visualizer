import { it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import { parseStudioQuery, serializeStudioQuery } from '../src/lib/studio/query';
import { normalizeSelection, reduceSelection } from '../src/lib/studio/state';
import { buildInquiryMessage, buildInquiryUrl, inquiryScenes } from '../src/lib/inquiry/message';
import { getMessages } from '../src/lib/i18n/messages';
import { syntheticScene } from '../scripts/render-fixtures';
import { legacyCatalog, legacyScene } from '../scripts/legacy-scenes';
import { createRenderController, renderBatched } from '../src/lib/studio/render-controller';
const data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials };
it('every normalized compatible door/finish/floor/mode/rotation roundtrips exactly', () => {
  for (const scene of data.materials.scenes)
    for (const id of scene.allowedDoorProductIds) {
      const p = data.products.products.find(p => p.id === id)!;
      if (p.kind !== 'door') throw Error('door');
      for (const finish of p.finishIds)
        for (const floor of scene.allowedFloorProductIds)
          for (const rot of [0, 90] as const) {
            const s = normalizeSelection(
              {
                ...scene.defaultSelection,
                doorProductId: id,
                doorFinishId: finish,
                floorProductId: floor,
                floorRotationDeg: rot,
              },
              catalog,
            ).selection;
            expect(parseStudioQuery(serializeStudioQuery(s), catalog).selection).toEqual(s);
          }
    }
});
it('invalid IDs/version and oversized URLs normalize safely and ignore arbitrary asset query', () => {
  for (const raw of [
    'v=99',
    'v=1&scene=nope&door=nope&finish=nope&floor=nope',
    'x=' + 'a'.repeat(2100),
  ])
    expect(parseStudioQuery(new URLSearchParams(raw), catalog).selection).toEqual(
      data.materials.scenes[0].defaultSelection,
    );
  const good = data.materials.scenes[0].defaultSelection;
  expect(
    parseStudioQuery(
      new URLSearchParams(serializeStudioQuery(good) + '&asset=https://bad'),
      catalog,
    ).selection,
  ).toEqual(good);
});
it('unknown scene URLs fall back to the first scene and keep compatible choices', () => {
  const parsed = parseStudioQuery(
    new URLSearchParams(
      'v=1&scene=corridor-hidden&door=dera-kashmir&finish=antracit&floor=kronotex-d80612&rot=90',
    ),
    catalog,
  );
  const first = data.materials.scenes[0];
  expect(parsed.selection).toMatchObject({
    sceneId: first.id,
    doorFinishId: 'antracit',
    floorProductId: 'kronotex-d80612',
    floorRotationDeg: 90,
  });
  expect(parsed.warnings).toContain('sceneId');
  expect(serializeStudioQuery(parsed.selection).get('scene')).toBe(first.id);
});
it('rendered rooms keep door, model and floor choices across rooms; glass needs a glass room', () => {
  const initial = {
    ...data.materials.scenes[0].defaultSelection,
    doorProductId: 'dera-lis',
    doorFinishId: 'dushk-hirte',
    doorModelId: 'grooved',
    floorProductId: 'kronotex-d80612',
    floorRotationDeg: 90 as const,
  };
  const next = reduceSelection(initial, { type: 'scene', sceneId: 'hallway-render-01' }, catalog);
  expect(next).toMatchObject({ ...initial, sceneId: 'hallway-render-01' });
  // Every rendered room carries the flush (filomuro) model, so hidden doors work everywhere.
  for (const scene of data.materials.scenes) {
    expect(scene.roomType).toBeDefined();
    for (const productId of ['dera-kashmir', 'dera-antracit'])
      expect(
        reduceSelection({ ...next, sceneId: scene.id }, { type: 'door', productId, finishId: 'kashmir' }, catalog),
      ).toMatchObject({ doorProductId: productId, doorModelId: 'filomuro' });
  }
  // No Studio room has the all-glass insert since the photo rooms were retired:
  // asking for the glass door falls back to the room's default door.
  for (const scene of data.materials.scenes)
    expect(
      reduceSelection({ ...next, sceneId: scene.id }, { type: 'door', productId: 'dera-xham', finishId: 'xham-erret' }, catalog)
        .doorProductId,
    ).toBe(scene.defaultSelection.doorProductId);
});
it('the tiled bathroom changes only the door and keeps the floor choice for the next room', () => {
  const bathroom = data.materials.scenes.find(s => s.roomType === 'bathroom')!;
  expect(bathroom.surfaces.map(s => s.role).sort()).toEqual(['door-leaf', 'frame', 'frame', 'frame']);
  expect(bathroom.allowedFloorProductIds).toEqual([]);
  expect(bathroom.allowedFrameModes).not.toContain('floor');
  for (const p of data.products.products)
    if (p.kind === 'floor') expect(p.compatibleSceneIds).not.toContain(bathroom.id);
  const start = { ...data.materials.scenes[0].defaultSelection, floorProductId: 'kronotex-d3179', skirtingMode: 'black' as const };
  const inBath = reduceSelection(start, { type: 'scene', sceneId: bathroom.id }, catalog);
  expect(inBath).toMatchObject({ sceneId: bathroom.id, floorProductId: 'kronotex-d3179', skirtingMode: 'black' });
  expect(parseStudioQuery(serializeStudioQuery(inBath), catalog).selection).toEqual(inBath);
  const back = reduceSelection(inBath, { type: 'scene', sceneId: data.materials.scenes[0].id }, catalog);
  expect(back).toMatchObject({ floorProductId: 'kronotex-d3179', skirtingMode: 'black' });
  const input = {
    brand: data.brand,
    products: data.products.products,
    materials: data.materials,
    scenes: inquiryScenes(data.materials.scenes),
  };
  const text = buildInquiryMessage({ kind: 'studio', selection: inBath }, input, 'en', 'https://demo.example/en/studio/', getMessages('en'));
  expect(text).toContain('Bathroom');
  expect(text).not.toContain('Kronotex');
  expect(text).not.toContain('Skirting');
});
it('glass uses explicit product pair and black profile; leaving glass has deterministic opaque mode', () => {
  // Only the retired photo living room carries the all-glass insert (fixture).
  const legacy = legacyCatalog(data),
    base = legacyScene('living-standard').defaultSelection;
  const glass = reduceSelection(
    base,
    { type: 'door', productId: 'dera-xham', finishId: 'xham-erret' },
    legacy,
  );
  expect(glass.frameMode).toBe('black');
  expect(
    reduceSelection(
      glass,
      { type: 'door', productId: 'dera-bardhe', finishId: 'bardhe-mat' },
      legacy,
    ).frameMode,
  ).toBe('door');
  expect(
    reduceSelection(
      base,
      { type: 'door', productId: 'dera-bardhe', finishId: 'xham-erret' },
      legacy,
    ).doorFinishId,
  ).toBe('bardhe-mat');
});
it('completed Studio inquiry contains exact IDs, modes and reopenable canonical selection URL', () => {
  const selection = {
    ...data.materials.scenes.find(s => s.id === 'hallway-render-01')!.defaultSelection,
    // Solid wood floor: its spec has no AC class.
    floorProductId: 'peshk-natyral-12',
    doorProductId: 'dera-bardhe',
    doorFinishId: 'antracit',
    skirtingMode: 'black' as const,
    floorRotationDeg: 90 as const,
  };
  const input = {
    brand: data.brand,
    products: data.products.products,
    materials: data.materials,
    scenes: inquiryScenes(data.materials.scenes),
  };
  const url = buildInquiryUrl(
    { kind: 'studio', selection },
    input,
    'de',
    'https://demo.example/sq/?saved=1&tracking=x',
  );
  expect(new URL(url).pathname).toBe('/de/studio/');
  expect(parseStudioQuery(new URL(url).searchParams, catalog).selection).toEqual(selection);
  const text = buildInquiryMessage({ kind: 'studio', selection }, input, 'de', url, getMessages('de'));
  expect(text).toContain('PD-DEMO-01');
  expect(text).toContain('Anthrazit');
  expect(text).toContain('Längs');
  expect(text).not.toContain('90°');
  expect(text).not.toContain('tracking');
  expect(text).not.toContain('AC');
});
it('slow decode followed by a newer job rejects stale work and only latest succeeds', async () => {
  const f = syntheticScene();
  let unblock: () => void = () => {};
  let calls = 0;
  const c = createRenderController(legacyCatalog(data), {
    sceneLoader: async () => {
      calls++;
      if (calls === 1) await new Promise<void>(r => (unblock = r));
      return f.scene;
    },
    materialLoader: async () => f.materials,
  });
  const first = c.render({ ...f.job, selection: f.scene.scene.defaultSelection });
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const last = c.render({ ...f.job, selection: f.scene.scene.defaultSelection });
  unblock();
  await rejected;
  expect((await last).pixels.width).toBe(8);
  c.dispose();
  await expect(c.render(f.job)).rejects.toThrow('disposed');
});
it('same main-thread kernel batches yield and cancellation aborts before publication', async () => {
  const f = syntheticScene();
  const result = await renderBatched(f.job, f.scene, f.materials, () => true);
  expect(result.data[0]).toBe(102);
  await expect(renderBatched(f.job, f.scene, f.materials, () => false)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
it('wrong-shaped scene asset rejects before render', async () => {
  const { prepareSceneWith } = await import('../src/lib/studio/asset-loader');
  await expect(
    prepareSceneWith(data.materials.scenes[0], new AbortController().signal, async () => ({
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(64),
    })),
  ).rejects.toThrow('shape');
});
it('worker construction failure uses the canonical batched fallback', async () => {
  const f = syntheticScene(),
    c = createRenderController(legacyCatalog(data), {
      workerFactory: () => {
        throw new Error('Worker intentionally unavailable in test');
      },
      sceneLoader: async () => f.scene,
      materialLoader: async () => f.materials,
    });
  const r = await c.render(f.job);
  expect(r.pixels.data[0]).toBe(102);
  c.dispose();
});
it('stale worker result cannot resolve latest job and dispose terminates worker', async () => {
  const f = syntheticScene();
  let terminated = 0;
  const mock = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null,
    postMessage(m: { type: string; job?: typeof f.job }) {
      if (m.type === 'render') {
        const job = m.job!,
          delay = job.id === 1 ? 30 : 0;
        setTimeout(
          () =>
            mock.onmessage?.({
              data: {
                type: 'result',
                jobId: job.id,
                width: 8,
                height: 8,
                buffer: new Uint8ClampedArray(256).fill(job.id).buffer,
                selection: job.selection,
              },
            }),
          delay,
        );
      }
    },
    terminate() {
      terminated++;
    },
  };
  const c = createRenderController(legacyCatalog(data), {
    workerFactory: () => mock as unknown as Worker,
    sceneLoader: async () => f.scene,
    materialLoader: async () => f.materials,
  });
  const old = c.render(f.job),
    rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
  await new Promise(r => setTimeout(r, 0));
  const latest = c.render(f.job);
  await rejected;
  const result = await latest;
  expect(result.pixels.data[0]).toBe(result.jobId);
  await new Promise(r => setTimeout(r, 35));
  expect(result.pixels.data[0]).toBe(result.jobId);
  c.dispose();
  expect(terminated).toBe(1);
});
