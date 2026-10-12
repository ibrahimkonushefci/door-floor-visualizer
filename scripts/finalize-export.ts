import { copyFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { loadSiteData } from '../src/lib/data/load';
import { getMessages } from '../src/lib/i18n/messages';
import { locales } from '../src/lib/i18n/locales';
import { finalizeOffline } from './offline-export';
const data = loadSiteData();
const { brand } = data;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
for (const directory of ['public/brand', 'out/brand']) {
  await mkdir(directory, { recursive: true });
  for (const name of ['logo.svg', 'favicon.svg'])
    await copyFile(`brand/assets/${name}`, `${directory}/${name}`);
}
await writeFile(
  'out/404.html',
  `<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 · ${escape(brand.companyName)}</title><meta name="robots" content="noindex, nofollow"><link rel="icon" href="${escape(brand.favicon)}"><style>body{margin:0;padding:24px;background:${brand.colors.background};color:#202421;font:16px/24px system-ui}h1{font-size:28px;line-height:34px}a{display:inline-flex;min-height:44px;align-items:center;margin-right:16px;color:inherit}a:focus-visible{outline:2px solid #255DB5;outline-offset:2px}</style></head><body><main><h1>${escape(getMessages('sq')['error.title'])}</h1><nav aria-label="Language">${locales.map(l => `<a href="/${l}/" lang="${l}">${l.toUpperCase()} · ${escape(getMessages(l)['error.back'])}</a>`).join('')}</nav></main></body></html>`,
);
// Next emits an additional 404 directory with multiple-root layouts; normalize it too.
for (const directory of ['404', '_not-found']) {
  await mkdir(`out/${directory}`, { recursive: true });
  await copyFile('out/404.html', `out/${directory}/index.html`);
}
await writeFile(
  'out/robots.txt',
  brand.demoMode ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n',
);
if (brand.demoMode) await rm('out/sitemap.xml', { force: true });
else
  await writeFile(
    'out/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locales
      .flatMap(l => [
        `/${l}/`,
        `/${l}/studio/`,
        ...data.products.products.filter(p => p.published).map(p => `/${l}/products/${p.slug}/`),
      ])
      .map(route => `<url><loc>${escape(brand.siteUrl!)}${route}</loc></url>`)
      .join('')}</urlset>`,
  );
console.log('Finalized branding, standalone 404 and robots');

await finalizeOffline(data);
