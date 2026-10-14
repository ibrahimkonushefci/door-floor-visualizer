import {
  createOfflineStore,
  cachePrefix,
  navigationKey,
  rememberNetworkResponse,
  assetResponse,
  workerScriptResponse,
} from '../lib/offline/cache';
import type { OfflineManifest, WorkerCommand, WorkerReply } from '../lib/offline/messages';
declare const __OFFLINE_MANIFEST__: OfflineManifest;
interface Client {
  id: string;
  postMessage: (v: unknown) => void;
}
interface Lifetime {
  waitUntil: (p: Promise<unknown>) => void;
}
interface WorkerScope {
  location: Location;
  skipWaiting: () => Promise<void>;
  clients: { claim: () => Promise<void>; matchAll: () => Promise<Client[]> };
  addEventListener: (name: string, callback: (event: never) => void) => void;
}
const scope = self as unknown as WorkerScope,
  manifest = __OFFLINE_MANIFEST__;
const store = createOfflineStore(manifest, {
  storage: caches,
  origin: scope.location.origin,
  fetch: (url, signal) => fetch(url, { signal, cache: 'no-store' }),
  nonce: () => crypto.randomUUID(),
});
const clientBuilds = new Map<string, string>();
scope.addEventListener('install', (event: Lifetime) => event.waitUntil(store.install()));
scope.addEventListener('activate', (event: Lifetime) => event.waitUntil(scope.clients.claim()));
async function offlinePage() {
  const template = await store.match(scope.location.origin + '/offline.html');
  const pages = await store.cachedPages();
  const links = pages.map(p => `<li><a href="${p}">${p}</a></li>`).join('');
  return new Response(
    (template
      ? await template.text()
      : '<!doctype html><title>Offline</title><h1>Offline</h1>'
    ).replace('<!-- CACHED_PAGES -->', links),
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
async function navigate(request: Request) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(request, { signal: controller.signal, cache: 'no-store' });
    if (response.ok) await rememberNetworkResponse(store, navigationKey(request), response);
    return response;
  } catch {
    const cached = await store.match(navigationKey(request));
    return cached || offlinePage();
  } finally {
    clearTimeout(timer);
  }
}
async function resource(request: Request) {
  const url = new URL(request.url),
    immutable = url.pathname.startsWith('/_next/static/') || url.searchParams.has('rev');
  if (immutable) {
    const hit = await store.match(request);
    if (hit) return hit;
  }
  try {
    const r = assetResponse(await fetch(request));
    if (r.ok && !r.headers.get('content-type')?.includes('text/html'))
      await rememberNetworkResponse(store, request, r);
    return r;
  } catch {
    return (await store.match(request)) || Response.error();
  }
}
scope.addEventListener(
  'fetch',
  (event: { request: Request; respondWith: (p: Promise<Response>) => void }) => {
    const { request } = event,
      url = new URL(request.url);
    if (
      request.method !== 'GET' ||
      url.origin !== scope.location.origin ||
      ['/sw.js', '/build-info.json', '/offline-manifest.json'].includes(url.pathname)
    )
      return;
    event.respondWith(
      request.mode === 'navigate'
        ? navigate(request)
        : resource(request).then(r => workerScriptResponse(request.destination, r)),
    );
  },
);
scope.addEventListener(
  'message',
  (event: Lifetime & { data: WorkerCommand; ports: MessagePort[]; source: Client | null }) => {
    const send = (reply: WorkerReply) => event.ports[0]?.postMessage(reply),
      command = event.data;
    if (command.type === 'CANCEL_SAVE') {
      store.cancel();
      return;
    }
    if (command.type === 'ACTIVATE') {
      event.waitUntil(scope.skipWaiting());
      return;
    }
    if (command.type === 'CLIENT_BUILD' && event.source) {
      clientBuilds.set(event.source.id, command.buildId || '');
      event.waitUntil(
        (async () => {
          const clients = await scope.clients.matchAll();
          if (clients.length && clients.every(c => clientBuilds.get(c.id) === manifest.buildId)) {
            const own = cachePrefix(manifest.brandId);
            for (const name of await caches.keys())
              if (name.startsWith(own) && !name.startsWith(store.prefix)) await caches.delete(name);
          }
        })(),
      );
      return;
    }
    event.waitUntil(
      (async () => {
        try {
          if (command.type === 'SAVE_STUDIO') {
            await store.save(progress => send({ type: 'PROGRESS', progress }));
            send({ type: 'READY', ready: true, buildId: manifest.buildId });
          } else {
            if (command.type === 'REMOVE_STUDIO') await store.remove();
            send({ type: 'STATUS', ready: await store.ready(), buildId: manifest.buildId });
          }
        } catch (e) {
          send({
            type: e instanceof Error && e.name === 'AbortError' ? 'CANCELLED' : 'ERROR',
            error:
              e instanceof Error
                ? e.name === 'QuotaExceededError'
                  ? e.name
                  : e.message
                : String(e),
          });
        }
      })(),
    );
  },
);
