import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { load } from 'cheerio';
import { loadSiteData } from '../src/lib/data/load';
import { walkFiles } from './offline-export';
import limits from '../verification/budgets.json';
import type { ImageManifest } from '../src/lib/media/types';
import type { OfflineManifest } from '../src/lib/offline/messages';
const data = loadSiteData(5),
  images: ImageManifest = JSON.parse(await readFile('verification/image-manifest.json', 'utf8')),
  sceneManifest = JSON.parse(await readFile('verification/scene-manifest.json', 'utf8')) as {
    assets: { output: string; bytes: number }[];
  };
const offline: OfflineManifest = JSON.parse(await readFile('out/offline-manifest.json', 'utf8'));
const failures: string[] = [],
  checks: Array<{ metric: string; value: number; limit: number; status: 'pass' | 'fail' }> = [];
function gate(metric: string, value: number, limit: number) {
  const status = value <= limit ? 'pass' : 'fail';
  checks.push({ metric, value, limit, status });
  if (status === 'fail') failures.push(`${metric}: ${value} > ${limit}`);
}
async function compressed(urls: Iterable<string>) {
  const paths = [...new Set(urls)].sort(),
    files = await Promise.all(
      paths.map(async url => {
        const bytes = await readFile('out' + url.split('?')[0]);
        return {
          url,
          raw: bytes.length,
          gzip: gzipSync(bytes).length,
          brotli: brotliCompressSync(bytes).length,
        };
      }),
    );
  return {
    files,
    raw: files.reduce((n, f) => n + f.raw, 0),
    gzip: files.reduce((n, f) => n + f.gzip, 0),
    brotli: files.reduce((n, f) => n + f.brotli, 0),
  };
}
const first = data.products.products
  .toSorted((a, b) => a.displayOrder - b.displayOrder)
  .slice(0, 4)
  .map(p => images[p.imageIds[0]]);
const firstImages = {
  avif: first.reduce((n, m) => n + m.avif.find(v => v.width === 640)!.bytes, 0),
  webp: first.reduce((n, m) => n + m.webp.find(v => v.width === 640)!.bytes, 0),
};
gate('firstFourImages', Math.max(firstImages.avif, firstImages.webp), limits.firstFourImages);
const routes = [];
for (const locale of data.brand.locales) {
  const html = await readFile(`out/${locale}/index.html`),
    $ = load(html.toString());
  const scripts = new Set(
    $('script[src]')
      .toArray()
      .map(e => $(e).attr('src')!),
  );
  const styles = new Set(
    $('link[rel="stylesheet"]')
      .toArray()
      .map(e => $(e).attr('href')!),
  );
  const fonts = new Set<string>();
  for (const url of styles) {
    const css = await readFile('out' + url, 'utf8');
    for (const match of css.matchAll(/url\(([^)]+\.woff2)\)/g)) {
      const raw = match[1].replace(/["']/g, '');
      fonts.add(new URL(raw, 'https://local.invalid' + url).pathname);
    }
  }
  const js = await compressed(scripts),
    css = await compressed(styles),
    font = await compressed(fonts);
  const cssAndFonts = css.gzip + font.raw;
  gate(`${locale}.feedInitialJsGzip`, js.gzip, limits.feedInitialJsGzip);
  gate(`${locale}.feedCssAndFonts`, cssAndFonts, limits.feedCssAndFonts);
  const firstScreen =
    js.gzip +
    cssAndFonts +
    Math.max(firstImages.avif, firstImages.webp) +
    gzipSync(html).length +
    (await readFile('out' + data.brand.logo.src)).length;
  gate(`${locale}.firstScreen`, firstScreen, limits.firstScreen);
  for (const file of js.files) {
    const content = await readFile('out' + file.url, 'utf8');
    if (content.includes('pswp__scroll-wrap') || content.includes('Worker not prepared'))
      failures.push(`Lazy renderer/gallery loaded on feed: ${file.url}`);
  }
  routes.push({ route: `/${locale}/`, js, css, fonts: font, cssAndFonts, firstScreen });
}
for (const [id, image] of Object.entries(images))
  for (const format of ['webp', 'avif'] as const) {
    const variant = image[format].find(v => v.width === 640)!;
    gate(
      `${id}.640.${format}`,
      variant.bytes,
      format === 'webp' ? limits.cardWebp640 : limits.cardAvif640,
    );
  }
const sizes = new Map(sceneManifest.assets.map(a => [a.output, a.bytes]));
const scenes = [];
for (const scene of data.materials.scenes) {
  gate(`${scene.id}.fallback`, sizes.get(scene.fallback)!, limits.sceneFallback960);
  const urls = new Set<string>([scene.base, scene.fallback, scene.protectedMask.alpha]);
  for (const s of scene.surfaces) {
    urls.add(s.mask.alpha);
    urls.add(s.lighting.diffuse);
    if (s.lighting.specular) urls.add(s.lighting.specular);
  }
  for (const i of data.materials.doorFinishes.find(
    f => f.id === scene.defaultSelection.doorFinishId,
  )?.kind === 'glass'
    ? scene.doorInserts
    : []) {
    urls.add(i.rgba);
    urls.add(i.replacementMask.alpha);
    urls.add(i.protectedMask.alpha);
  }
  if (scene.foreground) urls.add(scene.foreground);
  const floor = data.materials.floorCollections.find(
    c => c.id === scene.defaultSelection.floorProductId,
  )!;
  urls.add(floor.atlas.image);
  if (floor.trim.appearance.kind === 'texture') urls.add(floor.trim.appearance.texture);
  const bytes = [...urls].reduce((n, url) => n + sizes.get(url)!, 0);
  gate(`${scene.id}.firstUseful`, bytes, limits.studioFirstScene);
  scenes.push({ id: scene.id, bytes, files: [...urls] });
}
gate('studioOfflinePack', offline.studioBytes, limits.studioOfflinePack);
const allChunks = (await walkFiles('out/_next/static')).filter(f => f.endsWith('.js'));
const measurements = {
  schemaVersion: 1,
  buildId: offline.buildId,
  method:
    'Production export. Unique initial script tags per route; gzip and Brotli per file. CSS gzip plus used WOFF2 bytes. Images: conservative 640px variants at 390px viewport. File sizes do not establish LCP, INP, CLS or device latency.',
  limits,
  routes,
  firstImages,
  scenes,
  offlinePack: { files: offline.studio.length, bytes: offline.studioBytes },
  emittedJsChunks: allChunks.length,
  checks,
  failures,
  runtime: {
    cls: 'pending production browser observer',
    lcp: 'pending named mobile network/CPU conditions',
    inp: 'pending real interaction dataset',
    phoneFinalFrameP95: 'pending physical phone',
    ownedBuffers: 'See scripts/profile-studio-assets.ts; analytical bound, not heap profiling',
  },
};
await writeFile('verification/performance.json', JSON.stringify(measurements, null, 2) + '\n');
console.log(
  `Budget audit: ${checks.length} checks; ${failures.length} failures; ${offline.studioBytes} offline bytes`,
);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
