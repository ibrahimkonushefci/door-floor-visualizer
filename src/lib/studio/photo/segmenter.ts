// Browser floor segmenters. Only the on-device provider exists today: the
// server provider of the plan (Phase 5 task 2b) stays out until the owner's
// photo benchmark shows it is clearly better and its upload is disclosed.
import type { PixelBuffer } from '../render/sampling';
import { floorMaskFromLogits, segformerInput, SEGFORMER, type FloorMask, type FloorSegmenter } from './segment';
import { SEGMENTATION_FILES } from './model-files';

export type SegmentRequest =
  | { type: 'load'; runtime: string; wasm: string; model: string }
  | { type: 'run'; id: number; input: Float32Array; size: number };
export type SegmentResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'logits'; id: number; logits: Float32Array; dims: number[]; ms: number }
  | { type: 'error'; id?: number; message: string };

/** No progress for this long while the model downloads or runs counts as a failure. */
export const SEGMENT_STALL_MS = 60_000;

export interface OnDeviceSegmenter extends FloorSegmenter {
  /** Starts the runtime and model download early (e.g. while the photo decodes). */
  warmUp(): Promise<void>;
  dispose(): void;
}

export function createOnDeviceSegmenter(
  options: {
    onProgress?: (fraction: number) => void;
    workerFactory?: () => Worker;
    stallMs?: number;
    origin?: string;
  } = {},
): OnDeviceSegmenter {
  let worker: Worker | null = null,
    loading: Promise<void> | null = null,
    nextId = 0;
  const abs = (p: string) => new URL(p, options.origin ?? self.location.href).href;
  const listen = (onMessage: (m: SegmentResponse) => void, onFail: (e: Error) => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onFail(new Error('Segmentation stopped responding')), options.stallMs ?? SEGMENT_STALL_MS);
    };
    arm();
    worker!.onmessage = (e: MessageEvent<SegmentResponse>) => {
      arm();
      onMessage(e.data);
    };
    worker!.onerror = e => onFail(new Error(e.message || 'Segmentation worker failed'));
    return () => clearTimeout(timer);
  };
  const fail = () => {
    worker?.terminate();
    worker = null;
    loading = null;
  };
  const warmUp = () =>
    (loading ??= new Promise<void>((resolve, reject) => {
      worker =
        options.workerFactory?.() ??
        new Worker(new URL('../../../workers/segment.worker.ts', import.meta.url), { type: 'module' });
      const stop = listen(
        m => {
          if (m.type === 'progress' && m.total) options.onProgress?.(m.loaded / m.total);
          if (m.type === 'ready') {
            stop();
            resolve();
          }
          if (m.type === 'error') {
            stop();
            fail();
            reject(new Error(m.message));
          }
        },
        e => {
          stop();
          fail();
          reject(e);
        },
      );
      worker.postMessage({
        type: 'load',
        runtime: abs(SEGMENTATION_FILES.runtime),
        wasm: abs(SEGMENTATION_FILES.runtimeWasm),
        model: abs(SEGMENTATION_FILES.model),
      } satisfies SegmentRequest);
    }));
  return {
    id: 'on-device',
    warmUp,
    dispose: fail,
    async segment(image: PixelBuffer, signal?: AbortSignal): Promise<FloorMask> {
      await warmUp();
      signal?.throwIfAborted();
      const id = ++nextId,
        input = segformerInput(image);
      const logits = await new Promise<Float32Array>((resolve, reject) => {
        const abort = () => {
          stop();
          reject(new DOMException('Segmentation cancelled', 'AbortError'));
        };
        const stop = listen(
          m => {
            if (m.type === 'logits' && m.id === id) {
              stop();
              signal?.removeEventListener('abort', abort);
              resolve(m.logits);
            }
            if (m.type === 'error' && m.id === id) {
              stop();
              signal?.removeEventListener('abort', abort);
              reject(new Error(m.message));
            }
          },
          e => {
            stop();
            fail();
            reject(e);
          },
        );
        signal?.addEventListener('abort', abort, { once: true });
        worker!.postMessage({ type: 'run', id, input, size: SEGFORMER.size } satisfies SegmentRequest, [input.buffer]);
      });
      signal?.throwIfAborted();
      return floorMaskFromLogits(logits, image);
    },
  };
}
