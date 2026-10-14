/// <reference lib="webworker" />
// Runs the on-device floor segmentation model (ONNX Runtime Web, WASM backend).
// The runtime and model are static files under /models/, loaded on first use;
// the photo never leaves this browser.
import type * as Ort from 'onnxruntime-web';
import type { SegmentRequest, SegmentResponse } from '../lib/studio/photo/segmenter';

let session: Ort.InferenceSession | null = null,
  ort: typeof Ort | null = null;
const send = (m: SegmentResponse, transfer: Transferable[] = []) => self.postMessage(m, transfer);

async function fetchWithProgress(url: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status})`);
  const total = Number(response.headers.get('content-length')) || 0,
    reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    send({ type: 'progress', loaded, total });
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

self.onmessage = async (event: MessageEvent<SegmentRequest>) => {
  const m = event.data;
  try {
    if (m.type === 'load') {
      if (!session) {
        // A static runtime file, not part of the app bundle.
        ort = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ m.runtime)) as typeof Ort;
        ort.env.wasm.wasmPaths = { wasm: m.wasm };
        // Threads need cross-origin isolation, which a static host does not give.
        ort.env.wasm.numThreads = 1;
        const model = await fetchWithProgress(m.model);
        session = await ort.InferenceSession.create(model, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
      }
      send({ type: 'ready' });
    } else if (m.type === 'run') {
      if (!session || !ort) throw new Error('Segmentation model not loaded');
      const start = performance.now(),
        input = new ort.Tensor('float32', m.input, [1, 3, m.size, m.size]),
        result = await session.run({ [session.inputNames[0]]: input }),
        output = result[session.outputNames[0]],
        logits = new Float32Array(output.data as Float32Array);
      send({ type: 'logits', id: m.id, logits, dims: output.dims as number[], ms: performance.now() - start }, [
        logits.buffer,
      ]);
    }
  } catch (e) {
    send({ type: 'error', id: m.type === 'run' ? m.id : undefined, message: e instanceof Error ? e.message : String(e) });
  }
};
