import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadSiteData } from '../src/lib/data/load';
import { derivativeWidths, withAssetRevision } from '../src/lib/media/paths';
import type { ImageManifest, AssetManifest, ImageVariant } from '../src/lib/media/types';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const data = loadSiteData();
const manifest: ImageManifest = {};
const audit: AssetManifest['images'][number][] = [];
for (const image of data.products.images) {
  const source = await readFile(image.source);
  const normalized = await sharp(source).rotate().toColourspace('srgb').png().toBuffer();
  const meta = await sharp(normalized).metadata();
  if (!meta.width || !meta.height || Math.max(meta.width, meta.height) < 1600)
    throw new Error(`${image.id}: source long edge must be >=1600`);
  const widths = derivativeWidths(meta.width);
  const variants: { avif: ImageVariant[]; webp: ImageVariant[] } = { avif: [], webp: [] };
  const dir = `public/media/products/${image.id}`;
  await mkdir(dir, { recursive: true });
  for (const format of ['avif', 'webp'] as const)
    for (const width of widths) {
      const { data: bytes, info } = await sharp(normalized)
        .resize({ width, withoutEnlargement: true })
        [format]({ quality: format === 'avif' ? 50 : 80 })
        .toBuffer({ resolveWithObject: true });
      const path = `${dir}/${width}.${format}`;
      await writeFile(path, bytes);
      const sha256 = hash(bytes);
      variants[format].push({
        src: withAssetRevision(path.slice(6), sha256),
        width: info.width,
        height: info.height,
        bytes: bytes.length,
        sha256,
      });
    }
  manifest[image.id] = {
    id: image.id,
    width: meta.width,
    height: meta.height,
    focalPoint: image.focalPoint,
    role: image.role,
    ...variants,
    fallback: variants.webp.find(v => v.width === 960) || variants.webp.at(-1)!,
  };
  audit.push({
    id: image.id,
    source: image.source,
    sourceSha256: hash(source),
    width: meta.width,
    height: meta.height,
    derivatives: [...variants.avif, ...variants.webp],
  });
}
await mkdir('verification', { recursive: true });
await writeFile('verification/image-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  'verification/asset-manifest.json',
  JSON.stringify({ schemaVersion: 1, images: audit }, null, 2) + '\n',
);
console.log(
  `Prepared ${audit.length} sources / ${audit.reduce((n, v) => n + v.derivatives.length, 0)} derivatives; no upscaling.`,
);
