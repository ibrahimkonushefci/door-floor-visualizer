import type {
  RenderController,
  StudioCatalog,
  PreparedScene,
  PreparedMaterials,
  WorkerResponse,
  RenderJob,
  SurfaceRole,
} from './types';
import {
  prepareScene,
  createMaterialLoader,
  sceneLoadFor,
  type prepareMaterials,
} from './asset-loader';
import { renderRows, prepareRender } from './render/kernel';
import { createByteLru } from './render/cache';
import type { PixelBuffer } from './render/sampling';
import { selectionEqual } from './compatibility';
export const RESULT_CACHE_BYTES = 16 * 1024 * 1024;
/** A worker that sends nothing for this long is treated as crashed (main-thread fallback). */
export const WORKER_TIMEOUT_MS = 15_000;
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
    workerTimeoutMs?: number;
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
      job.sceneScale ?? 1,
    ]);
  };
  const controller: RenderController = {
    cancel,
    prepared: () =>
      scene ? { sceneId: scene.scene.id, scale: scene.scale === 0.5 ? 0.5 : 1 } : null,
    hitTest(sceneId, x, y) {
      if (!scene || scene.scene.id !== sceneId || !(x >= 0 && x < 1 && y >= 0 && y < 1)) return null;
      const W = scene.base.width,
        px = Math.floor(x * W),
        py = Math.floor(y * scene.base.height);
      // Photo rooms protect furniture standing on the floor.
      if (scene.protectedMask.length === W * scene.base.height && scene.protectedMask[py * W + px] > 127)
        return null;
      let best: { role: SurfaceRole; coverage: number } | null = null;
      for (const s of scene.surfaces) {
        const [bx, by, w, h] = s.bounds;
        if (px < bx || py < by || px >= bx + w || py >= by + h) continue;
        const coverage = s.mask[(py - by) * w + (px - bx)];
        if (coverage > 127 && (!best || coverage > best.coverage))
          best = { role: s.definition.role, coverage };
      }
      return best?.role ?? null;
    },
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
      const { glass: needsGlass, scene: toLoad } = sceneLoadFor(definition, job.selection, catalog);
      const sceneScale = job.sceneScale ?? 1,
        modelId = job.selection.doorModelId;
      if (
        scene?.scene.id !== definition.id ||
        scene.scene.assetRevision !== definition.assetRevision ||
        (scene.scale ?? 1) !== sceneScale ||
        (scene.modelId ?? modelId) !== modelId ||
        (needsGlass && !scene.inserts.size)
      ) {
        const sameScene =
          scene?.scene.id === definition.id &&
          scene.scene.assetRevision === definition.assetRevision &&
          (scene.scale ?? 1) === sceneScale;
        // A door-model switch keeps the worker, materials and frame cache.
        if (!sameScene) {
          teardown();
          materials = null;
          materialKey = '';
          cache.clear();
        }
        // An aborted model switch leaves the previous model prepared.
        const previous = sameScene ? scene : null;
        if (!sameScene) scene = null;
        // A model switch on the same scene rebuilds only the door region from `previous`.
        const next = await (options.sceneLoader || prepareScene)(toLoad, signal, {
          scale: sceneScale,
          modelId,
          previous,
        });
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
          let watchdog: ReturnType<typeof setTimeout> | undefined;
          pixels = await new Promise<PixelBuffer>((done, fail) => {
            const resolve = (p: PixelBuffer) => (clearTimeout(watchdog), done(p)),
              reject = (e: unknown) => (clearTimeout(watchdog), fail(e));
            pending = { reject };
            // A worker that dies silently (no error event) must not leave the stage busy.
            watchdog = setTimeout(
              () => reject(new Error('Worker stopped answering')),
              options.workerTimeoutMs ?? WORKER_TIMEOUT_MS,
            );
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
