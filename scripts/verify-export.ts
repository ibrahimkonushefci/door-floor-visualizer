import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha } from './offline-export';
import type { OfflineManifest } from '../src/lib/offline/messages';
import { load } from 'cheerio';
import { resolveExportPath } from './serve-export.mjs';
import { loadSiteData } from '../src/lib/data/load';
import { buildSpecRows } from '../src/lib/catalog/selectors';
import { localize } from '../src/lib/i18n/messages';
export { resolveExportPath } from './serve-export.mjs';
async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(e =>
        e.isDirectory() ? walk(resolve(root, e.name)) : Promise.resolve([resolve(root, e.name)]),
      ),
    )
  ).flat();
}
export async function verifyExport() {
  const data = loadSiteData();
  const root = resolve('out');
  const files = await walk(root);
  let references = 0;
  async function check(value: string, base: string) {
    if (value.startsWith('data:') || value.startsWith('#')) return;
    if (/^(tel:|viber:|https?:\/\/(wa\.me|api\.whatsapp))/i.test(value)) {
      if (data.brand.demoMode) throw new Error(`Active demo contact: ${value}`);
      return;
    }
    if (!data.brand.demoMode && data.brand.siteUrl && value.startsWith(data.brand.siteUrl + '/')) {
      await check(new URL(value).pathname, base);
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//'))
      throw new Error(`External runtime reference: ${value}`);
    let target = resolveExportPath(root, value, base);
    if (!target) return;
    try {
      if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
      await stat(target);
    } catch {
      throw new Error(`Missing reference ${value} from ${base}`);
    }
    references++;
  }
  const routes = [
    '/',
    '/sq/',
    '/en/',
    '/de/',
    ...(data.materials.scenes.length ? ['/sq/studio/', '/en/studio/', '/de/studio/'] : []),
    ...['sq', 'en', 'de'].flatMap(locale =>
      data.products.products.filter(p => p.published).map(p => `/${locale}/products/${p.slug}/`),
    ),
  ];
  for (const route of routes) await check(route, '/');
  for (const file of files.filter(f => f.endsWith('.html'))) {
    const pathname = '/' + relative(root, file);
    const html = await readFile(file, 'utf8');
    const $ = load(html);
    if (!$('title').text().trim()) throw new Error(`Missing title ${pathname}`);
    if (!$('html').attr('lang')) throw new Error(`Missing lang ${pathname}`);
    const locale = pathname.match(/^\/(sq|en|de)\//)?.[1];
    if (locale && $('html').attr('lang') !== locale) throw new Error(`Wrong language ${pathname}`);
    if (data.brand.demoMode) {
      const robots = $('meta[name="robots"]').attr('content') || '';
      if (!robots.includes('noindex') || !robots.includes('nofollow'))
        throw new Error(`Missing demo robots ${pathname}`);
      if (!data.brand.siteUrl && $('link[rel="canonical"]').length)
        throw new Error('Unexpected demo canonical');
    }
    if (!$('h1').length && pathname !== '/index.html')
      throw new Error(`Missing heading ${pathname}`);
    if (/^\/(sq|en|de)\/index.html$/.test(pathname)) {
      const cards = $('[data-product-id]');
      if (cards.length !== data.products.products.filter(p => p.published).length)
        throw new Error('Missing server-rendered seed cards');
      const expectedIds = data.products.products
        .filter(p => p.published)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(p => p.id);
      cards.each((i, el) => {
        const card = $(el);
        const img = card.find('img');
        if (
          card.attr('data-product-id') !== expectedIds[i] ||
          !img.attr('alt')?.trim() ||
          Number(img.attr('width')) <= 0 ||
          Number(img.attr('height')) <= 0 ||
          img.attr('loading') !== (i < 4 ? 'eager' : 'lazy') ||
          img.attr('fetchpriority') !== (i === 0 ? 'high' : 'auto') ||
          card.find('source[type="image/avif"]').length !== 1 ||
          card.find('source[type="image/webp"]').length !== 1 ||
          !img.attr('sizes') ||
          !img.attr('srcset')
        )
          throw new Error('Invalid catalog cover contract');
      });
    }
    if (pathname.match(/^\/(sq|en|de)\/products\/([^/]+)\/index.html$/)) {
      const match = pathname.match(/^\/(sq|en|de)\/products\/([^/]+)\/index.html$/)!;
      const locale = match[1];
      if (locale !== 'sq' && locale !== 'en' && locale !== 'de') throw new Error('Invalid locale');
      const p = data.products.products.find(p => p.published && p.slug === match[2]);
      if (!p) throw new Error('Unexpected product route');
      if (
        $('[data-detail-id]').attr('data-detail-id') !== p.id ||
        $('h1').text() !== localize(p.name, locale) ||
        !$('title').text().includes(localize(p.name, locale))
      )
        throw new Error('Missing localized static product content');
      const photos = $('.gallery-photo img');
      if (
        photos.length !== p.imageIds.length ||
        !$('table caption').text() ||
        (p.kind === 'door'
          ? $('[data-variant="size"] button').length !== p.sizes.length ||
            $('[data-variant="finish"] button').length !== p.finishIds.length
          : $('[data-variant]').length !== 0)
      )
        throw new Error('Invalid detail contract');
      const stack = $('.product-gallery').children();
      if (
        !stack.eq(0).hasClass('gallery-photo') ||
        !stack.eq(1).hasClass('product-info') ||
        (p.imageIds.length > 1 && !stack.eq(2).hasClass('gallery-rest'))
      )
        throw new Error('Wrong mobile reading order');
      photos.each((i, el) => {
        const img = $(el);
        if (
          !img.attr('alt')?.trim() ||
          !img.attr('src')?.includes(`/products/${p.imageIds[i]}/`) ||
          Number(img.attr('width')) <= 0 ||
          Number(img.attr('height')) <= 0 ||
          img.attr('loading') !== (i === 0 ? 'eager' : 'lazy')
        )
          throw new Error('Invalid detail gallery');
      });
      const rows = buildSpecRows(p, data.materials, locale);
      if ($('.product-specs tr').length !== rows.length) throw new Error('Wrong spec row count');
      rows.forEach((row, i) => {
        const tr = $('.product-specs tr').eq(i);
        if (
          tr.find('th').attr('scope') !== 'row' ||
          tr.find('th').text() !== row.label ||
          tr.find('td').text() !== row.value
        )
          throw new Error('Wrong static engineering value');
      });
      const related = $('[data-product-id]')
        .toArray()
        .map(el => $(el).attr('data-product-id'));
      if (related.length > 4 || related.includes(p.id) || new Set(related).size !== related.length)
        throw new Error('Invalid related products');
    }
    const base = pathname.endsWith('/index.html') ? pathname.slice(0, -10) : pathname;
    for (const el of $('[href],[src],[srcset]').toArray()) {
      for (const attr of ['href', 'src']) {
        const value = $(el).attr(attr);
        if (value) await check(value, base);
      }
      const srcset = $(el).attr('srcset');
      if (srcset)
        for (const part of srcset.split(',')) await check(part.trim().split(/\s+/)[0], base);
    }
    for (const style of $('style').toArray())
      for (const match of $(style)
        .text()
        .matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g))
        await check(match[1], base);
    if (html.includes('/_next/image')) throw new Error('Unexpected server image optimizer');
  }
  for (const file of files.filter(f => f.endsWith('.css'))) {
    const css = await readFile(file, 'utf8');
    for (const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g))
      await check(match[1], '/' + relative(root, file));
  }
  // Discover every emitted JS chunk, even ones absent from script tags.
  const chunks = files.filter(f => f.endsWith('.js'));
  for (const file of chunks) {
    const js = await readFile(file, 'utf8');
    for (const match of js.matchAll(
      /["']((?:\/_next\/|static\/chunks\/)[a-zA-Z0-9._/-]+\.js)["']/g,
    )) {
      const value = match[1].startsWith('/') ? match[1] : '/_next/' + match[1];
      await check(value, '/');
    }
  }
  const galleryChunks: string[] = [];
  for (const file of chunks)
    if ((await readFile(file, 'utf8')).includes('pswp__scroll-wrap'))
      galleryChunks.push('/' + relative(root, file));
  {
    if (galleryChunks.length === 0) throw new Error('Missing lazy gallery module');
    for (const file of files.filter(f => f.endsWith('.html'))) {
      const $ = load(await readFile(file, 'utf8'));
      for (const script of $('script[src]').toArray())
        if (galleryChunks.includes($(script).attr('src') || ''))
          throw new Error('PhotoSwipe eagerly loaded');
      for (const link of $('link[rel="stylesheet"]').toArray()) {
        const href = $(link).attr('href');
        if (href && (await readFile(resolve(root, '.' + href), 'utf8')).includes('.pswp'))
          throw new Error('PhotoSwipe CSS eagerly loaded');
      }
    }
  }
  if (data.materials.scenes.length) {
    const worker = chunks.filter(f => f.includes('/static/') && f.endsWith('.js'));
    let found = false;
    for (const f of worker)
      if ((await readFile(f, 'utf8')).includes('Worker not prepared')) found = true;
    if (!found) throw new Error('Missing emitted worker asset');
  }
  const robots = await readFile(resolve(root, 'robots.txt'), 'utf8');
  if (data.brand.demoMode && !robots.includes('Disallow: /'))
    throw new Error('Demo robots not disallowed');
  if (data.brand.demoMode && files.some(f => f.endsWith('/sitemap.xml')))
    throw new Error('Unexpected demo sitemap');
  const expected = routes.map(r => (r === '/' ? 'index.html' : r.slice(1) + 'index.html'));
  const actual = files
    .filter(f => f.endsWith('.html'))
    .map(f => relative(root, f))
    .filter(
      f =>
        ![
          '404.html',
          '404/index.html',
          '_not-found/index.html',
          '500.html',
          'offline.html',
        ].includes(f),
    );
  if (actual.length !== expected.length || expected.some(v => !actual.includes(v)))
    throw new Error(`Unexpected route inventory: ${actual.join(', ')}`);
  {
    const manifest: OfflineManifest = JSON.parse(
      await readFile('out/offline-manifest.json', 'utf8'),
    );
    const info = JSON.parse(await readFile('out/build-info.json', 'utf8'));
    if (
      info.buildId !== manifest.buildId ||
      info.catalogVersion !== data.brand.catalogVersion ||
      info.sourceHash !== manifest.sourceHash
    )
      throw new Error('Offline build identity mismatch');
    if (data.brand.offline.enabled) await check('/sw.js', '/');
    let total = 0;
    for (const set of [manifest.shell, manifest.studio]) {
      if (new Set(set.map(a => a.url)).size !== set.length)
        throw new Error('Duplicate offline asset');
      for (const a of set) {
        await check(a.url, '/');
        const target = resolveExportPath(root, a.url, '/')!;
        const bytes = await readFile(
          a.url.split('?')[0].endsWith('/') ? resolve(target, 'index.html') : target,
        );
        if (bytes.length !== a.bytes || sha(bytes) !== a.sha256)
          throw new Error('Offline hash drift ' + a.url);
        if (set === manifest.studio) total += a.bytes;
      }
    }
    if (total !== manifest.studioBytes || total > data.brand.offline.maxStudioDownloadBytes)
      throw new Error('Offline byte total invalid');
    for (const locale of data.brand.locales)
      if (!manifest.studio.some(a => a.url === `/${locale}/studio/`))
        throw new Error('Missing Studio locale in pack');
    if (
      manifest.studio.some(a => a.url.startsWith('/media/') && !/\?rev=[a-f0-9]{64}$/.test(a.url))
    )
      throw new Error('Unrevisioned Studio media');
  }
  return {
    navigablePages: actual.length,
    htmlFiles: files.filter(f => f.endsWith('.html')).length,
    references,
    jsChunks: chunks.length,
    lazyGalleryChunks: galleryChunks,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyExport();
  console.log('Static export verified:', result);
}
