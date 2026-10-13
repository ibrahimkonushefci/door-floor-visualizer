import { it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import { parseStudioQuery, serializeStudioQuery } from '../src/lib/studio/query';
import { normalizeSelection, reduceSelection } from '../src/lib/studio/state';
import { buildInquiryMessage, buildInquiryUrl } from '../src/lib/inquiry/message';
import { syntheticScene } from '../scripts/render-fixtures';
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
      'v=1&scene=corridor-hidden&door=dera-kashmir&finish=antracit&floor=arre-klasike-12&rot=90',
    ),
    catalog,
  );
  const first = data.materials.scenes[0];
  expect(parsed.selection).toMatchObject({
    sceneId: first.id,
    doorFinishId: 'antracit',
    floorProductId: 'arre-klasike-12',
    floorRotationDeg: 90,
  });
  expect(parsed.warnings).toContain('sceneId');
  expect(serializeStudioQuery(parsed.selection).get('scene')).toBe(first.id);
});
it('hallway preserves standard pairs and rejects hidden/glass geometry', () => {
  const initial = {
    ...data.materials.scenes[0].defaultSelection,
    doorProductId: 'dera-lis',
    doorFinishId: 'arre-erret',
    floorProductId: 'arre-klasike-12',
    floorRotationDeg: 90 as const,
  };
  const next = reduceSelection(initial, { type: 'scene', sceneId: 'corridor-standard' }, catalog);
  expect(next).toMatchObject({ ...initial, sceneId: 'corridor-standard' });
  for (const productId of ['dera-kashmir', 'dera-antracit', 'dera-xham'])
    expect(
      reduceSelection(next, { type: 'door', productId, finishId: 'kashmir' }, catalog)
        .doorProductId,
    ).toBe('dera-bardhe');
  expect(
    data.products.products
      .filter(p => p.kind === 'door' && p.doorType === 'hidden')
      .every(p => p.kind === 'door' && !p.compatibleSceneIds.length),
  ).toBe(true);
});
it('glass uses explicit product pair and black profile; leaving glass has deterministic opaque mode', () => {
  // Glass doors ship only with the photo living room's insert.
  const base = data.materials.scenes.find(s => s.id === 'living-standard')!.defaultSelection;
  const glass = reduceSelection(
    base,
    { type: 'door', productId: 'dera-xham', finishId: 'xham-erret' },
    catalog,
  );
  expect(glass.frameMode).toBe('black');
  expect(
    reduceSelection(
      glass,
      { type: 'door', productId: 'dera-bardhe', finishId: 'bardhe-mat' },
      catalog,
    ).frameMode,
  ).toBe('door');
  expect(
    reduceSelection(
      base,
      { type: 'door', productId: 'dera-bardhe', finishId: 'xham-erret' },
      catalog,
    ).doorFinishId,
  ).toBe('bardhe-mat');
});
it('completed Studio inquiry contains exact IDs, modes and reopenable canonical selection URL', () => {
  const selection = {
    ...data.materials.scenes.find(s => s.id === 'corridor-standard')!.defaultSelection,
    doorProductId: 'dera-bardhe',
    doorFinishId: 'antracit',
    skirtingMode: 'black' as const,
    floorRotationDeg: 90 as const,
  };
  const input = {
    brand: data.brand,
    products: data.products.products,
    materials: data.materials,
    scenes: data.materials.scenes,
  };
  const url = buildInquiryUrl(
    { kind: 'studio', selection },
    input,
    'de',
    'https://demo.example/sq/?saved=1&tracking=x',
  );
  expect(new URL(url).pathname).toBe('/de/studio/');
  expect(parseStudioQuery(new URL(url).searchParams, catalog).selection).toEqual(selection);
  const text = buildInquiryMessage({ kind: 'studio', selection }, input, 'de', url);
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
  const c = createRenderController(catalog, {
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
    c = createRenderController(catalog, {
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
  const c = createRenderController(catalog, {
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
