import type { OfflineAsset, OfflineManifest, OfflineProgress } from './messages';
export const VISITED_LIMIT = 100,
  VISITED_BYTES = 12 * 1024 * 1024;
export function cachePrefix(brandId: string) {
  return `porta:${brandId}:`;
}
export function navigationKey(request: Request): string {
  const u = new URL(request.url);
  return u.origin + u.pathname;
}
export async function verifyResponse(response: Response, asset: OfflineAsset): Promise<Response> {
  if (!response.ok) throw new Error(`Download failed: ${asset.url} (${response.status})`);
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== asset.bytes) throw new Error(`Size mismatch: ${asset.url}`);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== asset.sha256) throw new Error(`Hash mismatch: ${asset.url}`);
  return response;
}
export interface OfflineEnvironment {
  storage: CacheStorage;
  fetch: (url: string, signal: AbortSignal) => Promise<Response>;
  origin: string;
  nonce: () => string;
}
// One active pointer is committed only after every staged file has been verified.
export function createOfflineStore(manifest: OfflineManifest, env: OfflineEnvironment) {
  const prefix = cachePrefix(manifest.brandId) + manifest.buildId + '-',
    metaName = prefix + 'meta',
    shellName = prefix + 'shell',
    runtimeName = prefix + 'visited';
  const marker = env.origin + '/__offline_pack__';
  let saveController: AbortController | null = null,
    saving: Promise<void> | null = null;
  const meta = () => env.storage.open(metaName);
  async function activePack() {
    const r = await (await meta()).match(marker);
    return r ? await r.text() : null;
  }
  async function ready() {
    const name = await activePack();
    return !!name && (await env.storage.keys()).includes(name);
  }
  async function download(
    cache: Cache,
    assets: OfflineAsset[],
    controller: AbortController,
    onProgress: (p: OfflineProgress) => void,
  ) {
    const signal = controller.signal;
    let cursor = 0,
      done = 0,
      bytes = 0;
    onProgress({ done, total: assets.length, bytes });
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(3, assets.length) }, async () => {
        try {
          while (cursor < assets.length) {
            signal.throwIfAborted();
            const asset = assets[cursor++],
              response = await verifyResponse(await env.fetch(asset.url, signal), asset);
            signal.throwIfAborted();
            await cache.put(new URL(asset.url, env.origin).href, response);
            done++;
            bytes += asset.bytes;
            onProgress({ done, total: assets.length, bytes });
          }
        } catch (e) {
          controller.abort();
          throw e;
        }
      }),
    );
    const failed =
      results.find(
        r =>
          r.status === 'rejected' && !(r.reason instanceof Error && r.reason.name === 'AbortError'),
      ) || results.find(r => r.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    signal.throwIfAborted();
  }
  async function install() {
    const c = await env.storage.open(shellName);
    try {
      await download(c, manifest.shell, new AbortController(), () => {});
    } catch (e) {
      await env.storage.delete(shellName);
      throw e;
    }
  }
  async function save(onProgress: (p: OfflineProgress) => void) {
    if (manifest.studioBytes > manifest.maxStudioDownloadBytes)
      throw new Error('Studio pack exceeds download limit');
    // A new save supersedes one still running or unwinding (a client that timed
    // out or was closed and retries); the older one ends as cancelled.
    while (saving) {
      saveController?.abort();
      await saving.catch(() => {});
    }
    const controller = new AbortController();
    saveController = controller;
    const run = (async () => {
      const name = prefix + 'pack-' + env.nonce(),
        previous = await activePack();
      try {
        const cache = await env.storage.open(name);
        await download(cache, manifest.studio, controller, onProgress);
        controller.signal.throwIfAborted();
        await (await meta()).put(marker, new Response(name));
        if (previous && previous !== name) await env.storage.delete(previous);
      } catch (error) {
        controller.abort();
        await env.storage.delete(name);
        throw error;
      }
    })();
    saving = run;
    try {
      await run;
    } finally {
      if (saving === run) {
        saving = null;
        saveController = null;
      }
    }
  }
  async function remove() {
    saveController?.abort();
    const previous = await activePack();
    await (await meta()).delete(marker);
    if (previous) await env.storage.delete(previous);
  }
  async function match(request: Request | string) {
    const pack = await activePack();
    for (const name of [pack, shellName, runtimeName])
      if (name) {
        const hit = await (await env.storage.open(name)).match(request);
        if (hit) return hit;
      }
    return undefined;
  }
  async function remember(request: Request | string, response: Response) {
    if (!response.ok || response.type === 'opaque') return;
    const size = (await response.clone().arrayBuffer()).byteLength;
    if (size > VISITED_BYTES) return;
    const cache = await env.storage.open(runtimeName);
    await cache.delete(request);
    await cache.put(request, response);
    const keys = [...(await cache.keys())];
    let total = 0;
    const sizes = await Promise.all(
      keys.map(async k => (await (await cache.match(k))!.arrayBuffer()).byteLength),
    );
    for (const n of sizes) total += n;
    while (keys.length > VISITED_LIMIT || total > VISITED_BYTES) {
      const oldest = keys.shift()!;
      total -= sizes.shift()!;
      await cache.delete(oldest);
    }
  }
  async function cachedPages() {
    const pack = await activePack(),
      pages = new Set<string>();
    for (const name of [pack, runtimeName])
      if (name)
        for (const key of await (await env.storage.open(name)).keys()) {
          const p = new URL(key.url).pathname;
          if (/^\/(sq|en|de)\/(?:studio\/|products\/[^/]+\/)?$/.test(p)) pages.add(p);
        }
    return [...pages].sort();
  }
  return {
    install,
    save,
    cancel: () => saveController?.abort(),
    remove,
    ready,
    match,
    remember,
    cachedPages,
    prefix,
  };
}

// A full visited cache must never turn a successful network response into an error.
export async function rememberNetworkResponse(
  store: { remember: (key: Request | string, response: Response) => Promise<void> },
  key: Request | string,
  response: Response,
): Promise<Response> {
  try {
    await store.remember(key, response.clone());
  } catch {
    /* Offline saving reports quota separately; visited caching is best effort. */
  }
  return response;
}

// Turbopack starts module workers from a bootstrap script that reads its chunk
// list from the URL fragment (#params=…). A response taken from the cache keeps
// the cached URL, which has no fragment, so the worker would start without its
// config (and the Studio would silently render on the main thread). A copy has
// no URL of its own and so takes the page's request URL, fragment included.
export function workerScriptResponse(destination: string, response: Response): Response {
  if (destination !== 'worker' && destination !== 'sharedworker') return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
export function assetResponse(response: Response): Response {
  return response.headers.get('content-type')?.includes('text/html')
    ? new Response('Invalid asset response', {
        status: response.ok ? 502 : response.status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    : response;
}
