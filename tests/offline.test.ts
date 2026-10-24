import { describe, it, expect } from 'vitest';
import {
  createOfflineStore,
  navigationKey,
  verifyResponse,
  VISITED_LIMIT,
  VISITED_BYTES,
  rememberNetworkResponse,
  cachePrefix,
  assetResponse,
  workerScriptResponse,
} from '../src/lib/offline/cache';
import { workerRequest } from '../src/lib/offline/register';
import type {
  OfflineManifest,
  OfflineAsset,
  WorkerCommand,
  WorkerReply,
} from '../src/lib/offline/messages';
const origin = 'https://catalog.test';
class MemoryCache {
  values = new Map<string, Response>();
  key(r: Request | string) {
    return typeof r === 'string' ? new URL(r, origin).href : r.url;
  }
  async match(r: Request | string) {
    return this.values.get(this.key(r))?.clone();
  }
  async put(r: Request | string, v: Response) {
    this.values.set(this.key(r), v.clone());
  }
  async delete(r: Request | string) {
    return this.values.delete(this.key(r));
  }
  async keys() {
    return [...this.values.keys()].map(url => new Request(url));
  }
}
function storage() {
  const values = new Map<string, MemoryCache>();
  return {
    values,
    open: async (name: string) => {
      if (!values.has(name)) values.set(name, new MemoryCache());
      return values.get(name)!;
    },
    keys: async () => [...values.keys()],
    delete: async (name: string) => values.delete(name),
  };
}
async function asset(url: string, body: string): Promise<OfflineAsset> {
  return {
    url,
    bytes: new TextEncoder().encode(body).byteLength,
    sha256: [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))),
    ]
      .map(v => v.toString(16).padStart(2, '0'))
      .join(''),
  };
}
async function setup() {
  const a = await asset('/sq/studio/', 'studio'),
    b = await asset('/media/floor?rev=abc', 'floor');
  const manifest: OfflineManifest = {
    schemaVersion: 1,
    brandId: 'test',
    buildId: 'build-a',
    sourceHash: 'hash',
    maxStudioDownloadBytes: 20 * 1048576,
    shell: [],
    studio: [a, b],
    studioBytes: a.bytes + b.bytes,
  };
  const memory = storage();
  let fail = false,
    concurrent = 0,
    maxConcurrent = 0,
    seq = 0;
  const fetch = async (url: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    concurrent++;
    maxConcurrent = Math.max(concurrent, maxConcurrent);
    await Promise.resolve();
    concurrent--;
    if (fail && url === b.url) return new Response('missing', { status: 404 });
    return new Response(url === a.url ? 'studio' : 'floor');
  };
  const store = createOfflineStore(manifest, {
    storage: memory as unknown as CacheStorage,
    origin,
    nonce: () => String(++seq),
    fetch,
  });
  return {
    manifest,
    memory,
    store,
    fetch,
    setFail: (v: boolean) => {
      fail = v;
    },
    max: () => maxConcurrent,
  };
}
describe('offline pack integrity and lifecycle', () => {
  it('commits only complete hash-verified downloads with bounded concurrency', async () => {
    const s = await setup();
    const progress: number[] = [];
    await s.store.save(p => progress.push(p.done));
    expect(await s.store.ready()).toBe(true);
    expect(progress.at(-1)).toBe(2);
    expect(s.max()).toBeLessThanOrEqual(3);
    expect(await (await s.store.match(origin + '/sq/studio/'))!.text()).toBe('studio');
    expect(await s.store.match(origin + '/media/floor?rev=different')).toBeUndefined();
  });
  it('failed replacement retains prior ready pack and removes staging only', async () => {
    const s = await setup();
    await s.store.save(() => {});
    const before = await s.memory.keys();
    s.setFail(true);
    await expect(s.store.save(() => {})).rejects.toThrow('Download failed');
    expect(await s.store.ready()).toBe(true);
    expect(await s.memory.keys()).toEqual(before);
    expect(await (await s.store.match(origin + '/sq/studio/'))!.text()).toBe('studio');
  });
  it('uses at most three simultaneous fetches for a larger pack', async () => {
    const s = await setup();
    s.manifest.studio = Array.from({ length: 10 }, (_, i) => ({
      ...s.manifest.studio[1],
      url: '/media/floor-' + i + '?rev=abc',
    }));
    s.manifest.studioBytes = s.manifest.studio.reduce((n, a) => n + a.bytes, 0);
    await s.store.save(() => {});
    expect(s.max()).toBe(3);
    expect(await s.store.ready()).toBe(true);
  });
  it('evicts visited entries when their byte quota is exceeded', async () => {
    const s = await setup(),
      body = 'x'.repeat(VISITED_BYTES / 2 + 1);
    await s.store.remember(origin + '/old', new Response(body));
    await s.store.remember(origin + '/new', new Response(body));
    expect(await s.store.match(origin + '/old')).toBeUndefined();
    expect(await s.store.match(origin + '/new')).toBeDefined();
  });
  it('cancelled download never marks ready and can be retried', async () => {
    const s = await setup();
    await expect(
      s.store.save(p => {
        if (p.done === 1) s.store.cancel();
      }),
    ).rejects.toThrow();
    expect(await s.store.ready()).toBe(false);
    await s.store.save(() => {});
    expect(await s.store.ready()).toBe(true);
  });
  it('rejects corrupt bytes and valid-length wrong hashes', async () => {
    const a = await asset('/x', 'correct');
    await expect(verifyResponse(new Response('short'), a)).rejects.toThrow('Size mismatch');
    await expect(verifyResponse(new Response('corrupt'), a)).rejects.toThrow('Hash mismatch');
  });
  it('refuses oversized packs before downloads', async () => {
    const s = await setup();
    s.manifest.maxStudioDownloadBytes = 1;
    await expect(s.store.save(() => {})).rejects.toThrow('limit');
    expect(await s.store.ready()).toBe(false);
  });
  it('bounds visited responses, retains newest, and preserves query-specific media', async () => {
    const s = await setup();
    for (let i = 0; i < VISITED_LIMIT + 2; i++)
      await s.store.remember(origin + '/media/' + i, new Response('x'));
    expect(await s.store.match(origin + '/media/0')).toBeUndefined();
    expect(await s.store.match(origin + '/media/' + (VISITED_LIMIT + 1))).toBeDefined();
  });
  it('evicts visited responses by bytes, including ones kept by an earlier worker', async () => {
    const s = await setup(),
      half = () => new Response(new Uint8Array(VISITED_BYTES / 2 + 1));
    await s.store.remember(origin + '/media/a', half());
    // A restarted service worker builds a new store over the same caches.
    const restarted = createOfflineStore(s.manifest, {
      storage: s.memory as unknown as CacheStorage,
      origin,
      nonce: () => 'restart',
      fetch: s.fetch,
    });
    await restarted.remember(origin + '/media/b', half());
    expect(await restarted.match(origin + '/media/a')).toBeUndefined();
    expect((await restarted.match(origin + '/media/b'))?.headers.get('X-Visited-Bytes')).toBe(
      String(VISITED_BYTES / 2 + 1),
    );
  });
  it('removes only current pack, retains unrelated app caches and visited pages', async () => {
    const s = await setup();
    await s.memory.open('another-app');
    await s.store.remember(origin + '/en/', new Response('catalog'));
    await s.store.save(() => {});
    await s.store.remove();
    expect(await s.store.ready()).toBe(false);
    expect(await s.memory.keys()).toContain('another-app');
    expect(await s.store.cachedPages()).toEqual(['/en/']);
  });
  it('normalizes navigation query only; content assets remain exact', () => {
    expect(navigationKey(new Request(origin + '/sq/studio/?door=kashmir'))).toBe(
      origin + '/sq/studio/',
    );
  });
  it.each([200, 404])(
    'never returns an HTML fallback for an asset, network status %s',
    async status => {
      const result = assetResponse(
        new Response('<h1>Fallback</h1>', { status, headers: { 'Content-Type': 'text/html' } }),
      );
      expect(result.status).toBe(status === 200 ? 502 : 404);
      expect(result.headers.get('content-type')).toContain('text/plain');
      expect(await result.text()).not.toContain('<h1>');
    },
  );
  it('serves worker scripts without the cached URL, so the bootstrap keeps its #params', async () => {
    const cached = new Response('bootstrap()', {
      status: 200,
      headers: { 'Content-Type': 'text/javascript' },
    });
    // A cached response remembers the URL it was stored under (no fragment).
    Object.defineProperty(cached, 'url', { value: origin + '/_next/static/chunks/turbopack-worker.js' });
    const served = workerScriptResponse('worker', cached);
    expect(served).not.toBe(cached);
    expect(served.url).toBe('');
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('text/javascript');
    expect(await served.text()).toBe('bootstrap()');
    const script = new Response('x');
    expect(workerScriptResponse('script', script)).toBe(script);
  });
  it('cache prefixes cannot overlap different rebrands', () => {
    expect(cachePrefix('demo-client').startsWith(cachePrefix('demo'))).toBe(false);
  });
  it('returns a good network response even when visited-cache storage is full', async () => {
    const response = new Response('network works');
    const result = await rememberNetworkResponse(
      {
        remember: async () => {
          throw new DOMException('Full', 'QuotaExceededError');
        },
      },
      origin + '/en/',
      response,
    );
    expect(await result.text()).toBe('network works');
  });
  it('new build has independent pointer, leaving old pack intact', async () => {
    const s = await setup();
    await s.store.save(() => {});
    const next = createOfflineStore(
      { ...s.manifest, buildId: 'build-b' },
      { storage: s.memory as unknown as CacheStorage, origin, nonce: () => 'next', fetch: s.fetch },
    );
    expect(await next.ready()).toBe(false);
    await next.save(() => {});
    expect(await s.store.ready()).toBe(true);
    expect(await next.ready()).toBe(true);
  });
  it('quota failure removes staging and reports an error without false readiness', async () => {
    const s = await setup(),
      original = s.memory.open;
    s.memory.open = async (name: string) => {
      const c = await original(name);
      if (name.includes('pack-'))
        c.put = async () => {
          throw new DOMException('Not enough space', 'QuotaExceededError');
        };
      return c;
    };
    await expect(s.store.save(() => {})).rejects.toThrow('Not enough space');
    expect(await s.store.ready()).toBe(false);
    expect((await s.memory.keys()).some(n => n.includes('pack-'))).toBe(false);
  });
});
// A slow connection: every pack file takes `delayMs`; `stall()` holds every
// later download until `release()` (or until the save is cancelled).
async function slowPack(files: number, delayMs: number) {
  const s = await setup(),
    body = 'plank';
  s.manifest.studio = await Promise.all(
    Array.from({ length: files }, (_, i) => asset(`/media/slow-${i}?rev=abc`, body)),
  );
  s.manifest.studioBytes = s.manifest.studio.reduce((n, a) => n + a.bytes, 0);
  let gate: Promise<void> | null = null,
    open = () => {};
  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason);
      });
    });
  const store = createOfflineStore(s.manifest, {
    storage: s.memory as unknown as CacheStorage,
    origin,
    nonce: () => crypto.randomUUID(),
    fetch: async (_url, signal) => {
      await wait(delayMs, signal);
      if (gate)
        await Promise.race([
          gate,
          new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
        ]);
      return new Response(body);
    },
  });
  return {
    store,
    stall: () => {
      gate = new Promise(r => (open = r));
    },
    release: () => {
      gate = null;
      open();
    },
  };
}
// The service worker's message handling (src/service-worker/sw.ts) around a real store.
function fakeWorker(store: ReturnType<typeof createOfflineStore>) {
  const posted: string[] = [];
  const active = {
    postMessage(command: WorkerCommand, ports?: MessagePort[]) {
      posted.push(command.type);
      const send = (reply: WorkerReply) => ports?.[0]?.postMessage(reply);
      if (command.type === 'CANCEL_SAVE') store.cancel();
      else if (command.type === 'SAVE_STUDIO')
        store
          .save(progress => send({ type: 'PROGRESS', progress }))
          .then(
            () => send({ type: 'READY', ready: true }),
            (e: Error) =>
              send({ type: e.name === 'AbortError' ? 'CANCELLED' : 'ERROR', error: e.message }),
          );
      // STATUS is left unanswered: a worker busy elsewhere.
    },
  };
  return { registration: { active } as unknown as ServiceWorkerRegistration, posted };
}
describe('offline saving on a slow connection', () => {
  it('a slow download that keeps making progress never times out', async () => {
    // 24 files × 40 ms, three at a time: about 320 ms in all, against a 150 ms idle limit.
    const pack = await slowPack(24, 40),
      worker = fakeWorker(pack.store),
      start = performance.now(),
      progress: number[] = [];
    const reply = await workerRequest(
      worker.registration,
      { type: 'SAVE_STUDIO' },
      p => progress.push(p.done),
      undefined,
      150,
    );
    expect(reply.type).toBe('READY');
    expect(performance.now() - start).toBeGreaterThan(150);
    expect(progress.at(-1)).toBe(24);
    expect(worker.posted).not.toContain('CANCEL_SAVE');
    expect(await pack.store.ready()).toBe(true);
  });
  it('a stalled download times out, cancels the worker save, and a retry completes', async () => {
    const pack = await slowPack(12, 5),
      worker = fakeWorker(pack.store);
    pack.stall();
    await expect(
      workerRequest(worker.registration, { type: 'SAVE_STUDIO' }, undefined, undefined, 80),
    ).rejects.toThrow('timed out');
    expect(worker.posted).toEqual(['SAVE_STUDIO', 'CANCEL_SAVE']);
    expect(await pack.store.ready()).toBe(false);
    // The connection recovers; "Try again" saves the whole pack.
    pack.release();
    const reply = await workerRequest(
      worker.registration,
      { type: 'SAVE_STUDIO' },
      undefined,
      undefined,
      80,
    );
    expect(reply.type).toBe('READY');
    expect(await pack.store.ready()).toBe(true);
  });
  it('a retry supersedes a save the worker is still running', async () => {
    const pack = await slowPack(6, 5);
    pack.stall();
    const first = pack.store.save(() => {});
    await new Promise(r => setTimeout(r, 20));
    pack.release();
    const second = pack.store.save(() => {});
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await second;
    expect(await pack.store.ready()).toBe(true);
  });
  it('cancelling a slow save from the page stops the worker download', async () => {
    const pack = await slowPack(12, 30),
      worker = fakeWorker(pack.store),
      abort = new AbortController();
    const request = workerRequest(
      worker.registration,
      { type: 'SAVE_STUDIO' },
      p => p.done === 2 && abort.abort(),
      abort.signal,
      1000,
    );
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.posted).toContain('CANCEL_SAVE');
    await new Promise(r => setTimeout(r, 60));
    expect(await pack.store.ready()).toBe(false);
  });
  it('a status request that times out does not cancel a running save', async () => {
    const pack = await slowPack(3, 5),
      worker = fakeWorker(pack.store);
    await expect(
      workerRequest(worker.registration, { type: 'STATUS' }, undefined, undefined, 30),
    ).rejects.toThrow('timed out');
    expect(worker.posted).toEqual(['STATUS']);
  });
});
