import type {
  RenderController,
  StudioCatalog,
  PreparedScene,
  PreparedMaterials,
  WorkerResponse,
  RenderJob,
} from './types';
import { prepareScene, createMaterialLoader, type prepareMaterials } from './asset-loader';
import { renderRows, prepareRender } from './render/kernel';
import { createByteLru } from './render/cache';
import type { PixelBuffer } from './render/sampling';
import { selectionEqual } from './compatibility';
export const RESULT_CACHE_BYTES = 16 * 1024 * 1024;
const aborted = () => new DOMException('Superseded render', 'AbortError');
export async function renderBatched(
  job: RenderJob,
  scene: PreparedScene,
  materials: PreparedMaterials,
  isCurrent: () => boolean,
  onBatch?: (ms: number) => void,
) {
  const output: PixelBuffer = {
    width: job.width,
    height: job.height,
    data: new Uint8ClampedArray(job.width * job.height * 4),
  };
  const compiled = prepareRender(job, scene, materials);
  let y = 0;
  while (y < job.height) {
    if (!isCurrent()) throw aborted();
    const t = performance.now();
    do {
      renderRows(job, scene, materials, output, y, ++y, compiled);
    } while (y < job.height && performance.now() - t < 6);
    onBatch?.(performance.now() - t);
    await new Promise(r => setTimeout(r, 0));
  }
  return output;
}
// Leave a 2ms margin for the final indivisible row to keep observed batches within 8ms.
// Test injection only. No URL or production setting can disable worker support.
export function createRenderController(
  catalog: StudioCatalog,
  options: {
    workerFactory?: () => Worker;
    sceneLoader?: typeof prepareScene;
    materialLoader?: typeof prepareMaterials;
    onTiming?: (entry: {
      quality: string;
      ms: number;
      mode: string;
      batchMs?: number;
      prepareMs?: number;
      renderMs?: number;
      cacheHit?: boolean;
      textureBytes?: number;
    }) => void;
  } = {},
): RenderController {
  let id = 0,
    disposed = false,
    abort = new AbortController(),
    scene: PreparedScene | null = null,
    materials: PreparedMaterials | null = null,
    materialKey = '',
    worker: Worker | null = null,
    workerFailed = false,
    pending: { reject: (e: unknown) => void } | null = null;
  // Holds two full-resolution frames so toggling back to a combination is instant.
  const cache = createByteLru<PixelBuffer>(RESULT_CACHE_BYTES, () => {}),
    textureCache = createMaterialLoader();
  let workerScene: PreparedScene | null = null,
    workerMaterials: PreparedMaterials | null = null;
  const cancel = () => {
    id++;
    abort.abort();
    abort = new AbortController();
    worker?.postMessage({ type: 'cancel', latestId: id });
    pending?.reject(aborted());
    pending = null;
  };
  const teardown = () => {
    worker?.terminate();
    worker = null;
    workerScene = null;
    workerMaterials = null;
  };
  const cacheKey = (job: Omit<RenderJob, 'id'>) => {
    const definition = catalog.materials.scenes.find(s => s.id === job.selection.sceneId)!;
    return JSON.stringify([
      definition.id,
      definition.assetRevision,
      job.selection,
      job.width,
      job.height,
      job.quality,
      job.rendererVersion,
    ]);
  };
  const controller: RenderController = {
    cancel,
    dispose() {
      cancel();
      disposed = true;
      teardown();
      scene = null;
      materials = null;
      cache.clear();
      textureCache.clear();
    },
    async render(input) {
      if (disposed) throw new Error('Renderer disposed');
      cancel();
      const job = { ...input, id },
        mine = id,
        signal = abort.signal,
        start = performance.now(),
        definition = catalog.materials.scenes.find(s => s.id === job.selection.sceneId)!;
      const key = cacheKey(job);
      const cached = cache.get(key);
      if (cached) {
        options.onTiming?.({
          quality: job.quality,
          ms: performance.now() - start,
          mode: 'cache',
          prepareMs: 0,
          renderMs: 0,
          cacheHit: true,
          textureBytes: textureCache.bytes(),
        });
        return { jobId: mine, pixels: cached, selection: job.selection };
      }
      const needsGlass =
        catalog.materials.doorFinishes.find(f => f.id === job.selection.doorFinishId)?.kind ===
        'glass';
      if (
        scene?.scene.id !== definition.id ||
        scene.scene.assetRevision !== definition.assetRevision ||
        (needsGlass && !scene.inserts.size)
      ) {
        teardown();
        scene = null;
        materials = null;
        materialKey = '';
        cache.clear();
        const next = await (options.sceneLoader || prepareScene)(
          needsGlass ? definition : { ...definition, doorInserts: [] },
          signal,
        );
        if (mine !== id) throw aborted();
        scene = next;
      }
      const mk = JSON.stringify([job.selection.doorFinishId, job.selection.floorProductId]);
      if (mk !== materialKey) {
        const next = await (options.materialLoader || textureCache.prepare)(
          job.selection,
          catalog,
          signal,
        );
        if (mine !== id) throw aborted();
        materials = next;
        materialKey = mk;
      }
      if (!scene || !materials) throw new Error('Renderer preparation failed');
      const preparedAt = performance.now();
      let pixels: PixelBuffer | undefined;
      if (!workerFailed && (typeof Worker !== 'undefined' || !!options.workerFactory)) {
        try {
          if (!worker)
            worker = options.workerFactory
              ? options.workerFactory()
              : new Worker(new URL('../../workers/studio.worker.ts', import.meta.url), {
                  type: 'module',
                });
          const current = worker;
          pixels = await new Promise<PixelBuffer>((resolve, reject) => {
            pending = { reject };
            current.onerror = () => reject(new Error('Worker unavailable'));
            current.onmessage = (e: MessageEvent<WorkerResponse>) => {
              const m = e.data;
              if (m.type === 'result' && m.jobId === mine) {
                if (
                  m.width !== job.width ||
                  m.height !== job.height ||
                  m.buffer.byteLength !== job.width * job.height * 4 ||
                  !selectionEqual(m.selection, job.selection)
                ) {
                  reject(new Error('Invalid worker frame'));
                  return;
                }
                resolve({
                  width: m.width,
                  height: m.height,
                  data: new Uint8ClampedArray(m.buffer),
                });
              }
              if (m.type === 'error' && m.jobId === mine) reject(new Error(m.message));
            };
            if (workerScene !== scene) {
              current.postMessage({ type: 'prepare-scene', scene });
              workerScene = scene;
            }
            if (workerMaterials !== materials) {
              current.postMessage({ type: 'prepare-materials', materials });
              workerMaterials = materials;
            }
            current.postMessage({ type: 'render', job });
          });
        } catch (e) {
          if (mine !== id || signal.aborted) throw aborted();
          workerFailed = true;
          teardown();
          if (e instanceof DOMException && e.name === 'AbortError') throw e;
        } finally {
          if (mine === id) pending = null;
        }
      }
      if (!pixels)
        pixels = await renderBatched(
          job,
          scene,
          materials,
          () => mine === id && !disposed,
          ms =>
            options.onTiming?.({
              quality: job.quality,
              ms: performance.now() - start,
              mode: 'main',
              batchMs: ms,
            }),
        );
      if (mine !== id) throw aborted();
      cache.set(key, pixels, pixels.data.byteLength);
      options.onTiming?.({
        quality: job.quality,
        ms: performance.now() - start,
        mode: workerFailed || !worker ? 'main' : 'worker',
        prepareMs: preparedAt - start,
        renderMs: performance.now() - preparedAt,
        cacheHit: false,
        textureBytes: textureCache.bytes(),
      });
      return { jobId: mine, pixels, selection: job.selection };
    },
  };
  return controller;
}
