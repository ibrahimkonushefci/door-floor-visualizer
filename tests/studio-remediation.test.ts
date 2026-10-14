import { it, expect, vi, afterEach } from 'vitest';
import { finalFrameWidth, presentFrame } from '../src/lib/studio/presentation';
import { createMaterialLoader } from '../src/lib/studio/asset-loader';
import { createRenderController } from '../src/lib/studio/render-controller';
import {
  buildMipChain,
  sampleTrilinear,
  sampleTrilinearInto,
} from '../src/lib/studio/render/sampling';
import { loadSiteData } from '../src/lib/data/load';
import { syntheticScene } from '../scripts/render-fixtures';
import { legacyCatalog, legacyScene } from '../scripts/legacy-scenes';
const data = loadSiteData();
afterEach(() => vi.unstubAllGlobals());
it('uses final resolution on every selection, including narrow high-DPR stages', () => {
  expect(finalFrameWidth(900, 2)).toBe(1600);
  expect(finalFrameWidth(760, 2)).toBe(1520);
  expect(finalFrameWidth(390, 2)).toBe(780);
  expect(finalFrameWidth(390, 3)).toBe(780);
  expect(finalFrameWidth(768, 1)).toBe(768);
});
it('prepares pixels before changing front canvas; staging failure retains old sharp frame', () => {
  const calls: string[] = [];
  const front = {
      width: 960,
      height: 720,
      getContext: () => ({ drawImage: () => calls.push('present') }),
    },
    back = {
      width: 0,
      height: 0,
      getContext: () => ({
        putImageData: () => {
          calls.push('stage');
          expect(front.width).toBe(960);
        },
      }),
    };
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  );
  presentFrame(
    front as unknown as HTMLCanvasElement,
    { width: 8, height: 8, data: new Uint8ClampedArray(256) },
    () => back as unknown as HTMLCanvasElement,
  );
  expect(calls).toEqual(['stage', 'present']);
  expect(front.width).toBe(8);
  front.width = 960;
  front.height = 720;
  const broken = {
    ...back,
    getContext: () => ({
      putImageData: () => {
        throw new Error('Failed staging');
      },
    }),
  };
  expect(() =>
    presentFrame(
      front as unknown as HTMLCanvasElement,
      { width: 8, height: 8, data: new Uint8ClampedArray(256) },
      () => broken as unknown as HTMLCanvasElement,
    ),
  ).toThrow('staging');
  expect(front.width).toBe(960);
  expect(front.height).toBe(720);
});
it('allocation-free sampler matches reference for wrapping, all channels and fractional mip levels', () => {
  const pixels = {
      width: 3,
      height: 2,
      data: Uint8ClampedArray.from({ length: 24 }, (_, i) => (i * 37) % 256),
    },
    mips = buildMipChain(pixels),
    out = [0, 0, 0];
  for (const u of [-1.2, 0, 0.0001, 0.49, 1.1])
    for (const v of [-0.2, 0, 0.3, 1.5])
      for (const lod of [0, 0.3, 1, 1.9, 3]) {
        sampleTrilinearInto(mips, u, v, lod, out);
        const expected = sampleTrilinear(mips, u, v, lod);
        for (let i = 0; i < 3; i++) expect(out[i]).toBeCloseTo(expected[i], 12);
      }
});
it('reuses unchanged textures and evicts the oldest of three floor chains', async () => {
  const paths: string[] = [],
    loader = createMaterialLoader(async path => {
      paths.push(path);
      return { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(128) };
    }),
    signal = new AbortController().signal,
    // A photo room (homography floor): it loads the repeating atlas, not a plank sheet.
    legacy = legacyCatalog(data),
    base = legacyScene('living-standard').defaultSelection;
  await loader.prepare(base, legacy, signal);
  await loader.prepare({ ...base, doorFinishId: 'kashmir' }, legacy, signal);
  expect(paths.filter(p => p.endsWith('/kronotex-d4955/atlas.webp'))).toHaveLength(1);
  for (const floorProductId of ['kronotex-d80582', 'peshk-natyral-12', 'kronotex-d4955'])
    await loader.prepare({ ...base, floorProductId }, legacy, signal);
  expect(paths.filter(p => p.endsWith('/kronotex-d4955/atlas.webp'))).toHaveLength(2);
  expect(loader.bytes()).toBeLessThanOrEqual(6 * 1024 * 1024);
  loader.clear();
  expect(loader.bytes()).toBe(0);
});
it('prepares worker scene once, updates only changed materials, and reports cache hits', async () => {
  const f = syntheticScene(),
    messages: string[] = [],
    timings: unknown[] = [];
  const worker = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null,
    postMessage(m: { type: string; job?: typeof f.job }) {
      messages.push(m.type);
      if (m.type === 'render') {
        const job = m.job!;
        queueMicrotask(() =>
          worker.onmessage?.({
            data: {
              type: 'result',
              jobId: job.id,
              width: 8,
              height: 8,
              buffer: new Uint8ClampedArray(256).buffer,
              selection: job.selection,
            },
          }),
        );
      }
    },
    terminate() {},
  };
  const controller = createRenderController(legacyCatalog(data), {
    workerFactory: () => worker as unknown as Worker,
    sceneLoader: async () => f.scene,
    materialLoader: async () => ({ ...f.materials }),
    onTiming: t => timings.push(t),
  });
  await controller.render(f.job);
  await controller.render({ ...f.job, selection: { ...f.job.selection, frameMode: 'black' } });
  await controller.render({ ...f.job, selection: { ...f.job.selection, doorFinishId: 'kashmir' } });
  await controller.render(f.job);
  expect(messages.filter(m => m === 'prepare-scene')).toHaveLength(1);
  expect(messages.filter(m => m === 'prepare-materials')).toHaveLength(2);
  expect(messages.filter(m => m === 'render')).toHaveLength(3);
  expect(timings.at(-1)).toMatchObject({ cacheHit: true, mode: 'cache' });
  controller.dispose();
});
it('fractional shared edges interpolate zero outside cropped masks without overlaps or dark seams', async () => {
  const { renderRows } = await import('../src/lib/studio/render/kernel'),
    f = syntheticScene(),
    original = f.scene.surfaces[0];
  const surfaces = [0, 4].map(x => ({
    ...original,
    bounds: [x, 0, 4, 8] as const,
    mask: new Uint8Array(32).fill(255),
    diffuse: new Uint8Array(32).fill(128),
  }));
  const pixels = { width: 16, height: 16, data: new Uint8ClampedArray(1024) };
  expect(() =>
    renderRows(
      { ...f.job, width: 16, height: 16 },
      { ...f.scene, surfaces },
      f.materials,
      pixels,
      0,
      16,
    ),
  ).not.toThrow();
  for (const x of [7, 8])
    expect([...pixels.data.slice((8 * 16 + x) * 4, (8 * 16 + x) * 4 + 3)]).toEqual([128, 128, 128]);
});

it('rejects malformed current worker frames and completes only a validated canonical fallback', async () => {
  const f = syntheticScene();
  let terminated = 0;
  const worker = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null,
    postMessage(m: { type: string; job?: typeof f.job }) {
      if (m.type === 'render') {
        const job = m.job!;
        queueMicrotask(() =>
          worker.onmessage?.({
            data: {
              type: 'result',
              jobId: job.id,
              width: 4,
              height: 8,
              buffer: new Uint8ClampedArray(128).buffer,
              selection: job.selection,
            },
          }),
        );
      }
    },
    terminate() {
      terminated++;
    },
  };
  const controller = createRenderController(legacyCatalog(data), {
    workerFactory: () => worker as unknown as Worker,
    sceneLoader: async () => f.scene,
    materialLoader: async () => f.materials,
  });
  const result = await controller.render(f.job);
  expect(result.pixels.width).toBe(8);
  expect(result.pixels.data[0]).toBe(102);
  expect(terminated).toBe(1);
  controller.dispose();
});
