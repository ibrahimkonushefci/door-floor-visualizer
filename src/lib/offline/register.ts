import type { OfflineProgress, WorkerCommand, WorkerReply } from './messages';
export async function registerOfflineWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    process.env.NODE_ENV !== 'production' ||
    !window.isSecureContext ||
    !('serviceWorker' in navigator)
  )
    return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
}
// A request fails only after this long without any reply. Progress resets it, so
// a slow but moving pack download (31 MB at showroom Wi-Fi speeds can take
// minutes) never times out, while a stalled one does.
export const WORKER_IDLE_TIMEOUT_MS = 120000;
export function workerRequest(
  registration: ServiceWorkerRegistration,
  command: WorkerCommand,
  onProgress?: (p: OfflineProgress) => void,
  signal?: AbortSignal,
  idleMs = WORKER_IDLE_TIMEOUT_MS,
): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    const worker = registration.active;
    if (!worker) {
      reject(new Error('Offline worker unavailable'));
      return;
    }
    const channel = new MessageChannel();
    // A stalled save is cancelled in the worker too, so a retry starts cleanly.
    const expire = () => {
      if (command.type === 'SAVE_STUDIO') worker.postMessage({ type: 'CANCEL_SAVE' });
      finish(new Error('Offline download timed out'));
    };
    let timer = setTimeout(expire, idleMs);
    const abort = () => {
      worker.postMessage({ type: 'CANCEL_SAVE' });
      finish(new DOMException('Cancelled', 'AbortError'));
    };
    function finish(error?: Error, reply?: WorkerReply) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      channel.port1.close();
      if (error) reject(error);
      else resolve(reply!);
    }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    channel.port1.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type === 'PROGRESS') {
        clearTimeout(timer);
        timer = setTimeout(expire, idleMs);
        onProgress?.(reply.progress!);
        return;
      }
      if (reply.type === 'ERROR') finish(new Error(reply.error));
      else if (reply.type === 'CANCELLED') finish(new DOMException('Cancelled', 'AbortError'));
      else finish(undefined, reply);
    };
    worker.postMessage(command, [channel.port2]);
  });
}
export async function requestStudioCache(
  registration: ServiceWorkerRegistration,
  onProgress: (p: OfflineProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  await workerRequest(registration, { type: 'SAVE_STUDIO' }, onProgress, signal);
}
