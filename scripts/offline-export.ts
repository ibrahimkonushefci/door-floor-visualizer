import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { revisionStudioAssets } from '../src/lib/studio/revisions';
import { build } from 'esbuild';
import type { SiteData } from '../src/lib/data/types';
import type { OfflineAsset, OfflineManifest } from '../src/lib/offline/messages';
export async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(e =>
        e.isDirectory()
          ? walkFiles(resolve(directory, e.name))
          : Promise.resolve([resolve(directory, e.name)]),
      ),
    )
  )
    .flat()
    .sort();
}
export const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
export async function finalizeOffline(data: SiteData) {
  const root = resolve('out'),
    buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
  const sources = [
    ...(await walkFiles('brand')),
    ...(await walkFiles('src')),
    ...(await walkFiles('scripts')),
    resolve('package.json'),
    resolve('pnpm-lock.yaml'),
    resolve('next.config.ts'),
  ];
  const hasher = createHash('sha256');
  for (const file of sources)
    hasher.update(relative(process.cwd(), file)).update(await readFile(file));
  const sourceHash = hasher.digest('hex');
  for (const file of (await walkFiles(root)).filter(f => f.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    await writeFile(
      file,
      html.replace('</head>', `<meta name="porta-build" content="${buildId}"></head>`),
    );
  }
  await writeFile(
    'out/build-info.json',
    JSON.stringify(
      {
        schemaVersion: 1,
        brandId: data.brand.id,
        catalogVersion: data.brand.catalogVersion,
        sourceHash,
        buildId,
      },
      null,
      2,
    ) + '\n',
  );
  const text = `<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Offline · Porta &amp; Dysheme</title><style>body{max-width:640px;margin:0 auto;padding:24px;background:#F7F5F0;color:#202421;font:16px/24px system-ui}h1{font-size:28px}a{display:inline-flex;align-items:center;min-height:44px;overflow-wrap:anywhere}a:focus-visible{outline:2px solid #255DB5}li{padding:4px 0}</style></head><body><main><h1>Je offline · Offline</h1><p lang="sq">Kjo faqe nuk është ruajtur. Lidhu me internetin ose hap një faqe të ruajtur më poshtë.</p><p lang="en">This page has not been saved. Reconnect or open a saved page below.</p><p lang="de">Diese Seite ist nicht gespeichert. Stelle die Verbindung wieder her oder öffne unten eine gespeicherte Seite.</p><ul><!-- CACHED_PAGES --></ul></main></body></html>`;
  await writeFile(
    'out/offline.html',
    text.replace(
      'Porta &amp; Dysheme',
      data.brand.companyName.replace(
        /[&<>]/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!,
      ),
    ),
  );
  const files = await walkFiles(root),
    urls = new Set<string>();
  for (const file of files) {
    const p = '/' + relative(root, file);
    if (p.startsWith('/_next/static/') && /\.(js|css|woff2?)$/.test(p)) urls.add(p);
  }
  for (const locale of data.brand.locales) urls.add(`/${locale}/studio/`);
  const collect = (v: unknown) => {
    if (typeof v === 'string' && /^\/media\//.test(v)) urls.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(revisionStudioAssets(data.materials));
  // Branding is used by all three independently exported root layouts.
  urls.add(data.brand.logo.src);
  urls.add(data.brand.favicon);
  const entry = async (url: string): Promise<OfflineAsset> => {
    const path = new URL(url, 'https://local.invalid').pathname;
    const file = resolve(root, '.' + path + (path.endsWith('/') ? 'index.html' : ''));
    const bytes = await readFile(file);
    return { url, bytes: (await stat(file)).size, sha256: sha(bytes) };
  };
  const studio = await Promise.all([...urls].sort().map(entry));
  const shell = await Promise.all(
    [
      '/offline.html',
      data.brand.logo.src,
      data.brand.favicon,
      ...[...urls].filter(p => /\.woff2$/.test(p)),
    ].map(entry),
  );
  const manifest: OfflineManifest = {
    schemaVersion: 1,
    brandId: data.brand.id,
    buildId,
    sourceHash,
    maxStudioDownloadBytes: data.brand.offline.maxStudioDownloadBytes,
    shell,
    studio,
    studioBytes: studio.reduce((n, v) => n + v.bytes, 0),
  };
  if (manifest.studioBytes > manifest.maxStudioDownloadBytes)
    throw new Error(`Offline pack exceeds 20MiB: ${manifest.studioBytes}`);
  await writeFile('out/offline-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  if (data.brand.offline.enabled)
    await build({
      entryPoints: ['src/service-worker/sw.ts'],
      outfile: 'out/sw.js',
      bundle: true,
      minify: true,
      target: 'es2022',
      format: 'iife',
      define: { __OFFLINE_MANIFEST__: JSON.stringify(manifest) },
    });
  console.log(
    `Offline pack: ${studio.length} verified files, ${manifest.studioBytes} bytes; build ${buildId}`,
  );
  return { manifest, buildId };
}
