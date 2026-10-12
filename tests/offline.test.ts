import { describe, it, expect } from 'vitest';
import {
  createOfflineStore,
  navigationKey,
  verifyResponse,
  VISITED_LIMIT,
  rememberNetworkResponse,
  cachePrefix,
  assetResponse,
} from '../src/lib/offline/cache';
import type { OfflineManifest, OfflineAsset } from '../src/lib/offline/messages';
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
      body = 'x'.repeat(7 * 1048576);
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
    expect(await s.store.match(origin + '/media/101')).toBeDefined();
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
