import sharp from 'sharp';
import { prepareScenes } from './prepare-scenes';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { loadSiteData } from '../src/lib/data/load';
import { derivativeWidths } from '../src/lib/media/paths';
import type { ImageManifest, AssetManifest } from '../src/lib/media/types';
export const sourceLedgerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  assets: z.array(
    z.strictObject({
      id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      localPath: z
        .string()
        .regex(
          /^brand\/assets\/(?:products\/[a-z0-9-]+\/[0-9]+\.jpg|scenes\/[a-z0-9-]+\/[a-z0-9-]+\.png|textures\/(?:doors\/[a-z0-9-]+|floors\/[a-z0-9-]+\/(?:atlas|trim|planks))\.png)$/,
        ),
      sourceUrl: z.url().nullable(),
      author: z.string().trim().min(1),
      usageBasis: z.enum(['owned', 'licensed', 'generated']),
      licenseNote: z.string().trim().min(1),
      depictsProductId: z.string().nullable(),
      isIllustrative: z.boolean(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  // Third-party inputs of Blender-rendered scenes (not shipped; hashes match tools/blender/assets.lock.json).
  renderInputs: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        type: z.enum(['model', 'texture', 'hdri']),
        sourceUrl: z.url(),
        author: z.string().trim().min(1),
        license: z.literal('CC0-1.0'),
        usedIn: z.array(z.string().min(1)).min(1),
        files: z
          .array(
            z.strictObject({
              path: z.string().min(1),
              url: z.url(),
              bytes: z.number().int().positive(),
              sha256: z.string().regex(/^[a-f0-9]{64}$/),
            }),
          )
          .min(1),
      }),
    )
    .optional(),
});
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export async function verifyAssets() {
  const data = loadSiteData();
  const ledger = sourceLedgerSchema.parse(
    JSON.parse(await readFile('brand/asset-sources.json', 'utf8')),
  );
  if (
    new Set(ledger.assets.map(a => a.id)).size !== ledger.assets.length ||
    new Set(ledger.assets.map(a => a.localPath)).size !== ledger.assets.length
  )
    throw new Error('Duplicate provenance');
  const manifest: ImageManifest = JSON.parse(
    await readFile('verification/image-manifest.json', 'utf8'),
  );
  const audit: AssetManifest = JSON.parse(
    await readFile('verification/asset-manifest.json', 'utf8'),
  );
  let bytes = 0;
  let derivatives = 0;
  for (const image of data.products.images) {
    const asset = ledger.assets.find(a => a.id === image.id && a.localPath === image.source);
    const owner = data.products.products.find(p => p.imageIds.includes(image.id));
    if (!asset || asset.depictsProductId !== owner?.id)
      throw new Error(`Missing/mismatched provenance ${image.id}`);
    if (asset.usageBasis === 'generated' && !asset.isIllustrative)
      throw new Error('Generated images must be illustrative');
    if (asset.usageBasis === 'licensed' && !asset.sourceUrl)
      throw new Error('Licensed image needs source URL');
    const source = await readFile(image.source);
    const meta = await sharp(source).metadata();
    const m = manifest[image.id];
    const a = audit.images.find(a => a.id === image.id);
    if (
      !m ||
      !a ||
      hash(source) !== asset.sha256 ||
      hash(source) !== a.sourceSha256 ||
      a.source !== image.source ||
      !meta.width ||
      !meta.height ||
      Math.max(meta.width, meta.height) < 1600 ||
      m.width !== meta.width ||
      m.height !== meta.height ||
      a.width !== m.width ||
      a.height !== m.height
    )
      throw new Error(`Source/manifest mismatch ${image.id}`);
    const widths = derivativeWidths(meta.width);
    for (const [format, variants] of Object.entries({ avif: m.avif, webp: m.webp })) {
      if (variants.map(v => v.width).join() !== widths.join())
        throw new Error('Missing derivative width');
      for (const v of variants) {
        if (
          !v.src.startsWith(`/media/products/${image.id}/`) ||
          !v.src.endsWith(`.${format}?rev=${v.sha256}`) ||
          v.src.includes('..')
        )
          throw new Error('Unsafe derivative');
        const b = await readFile('public' + v.src.split('?')[0]);
        const d = await sharp(b).metadata();
        if (
          hash(b) !== v.sha256 ||
          b.length !== v.bytes ||
          d.width !== v.width ||
          d.height !== v.height ||
          v.width > meta.width ||
          Math.abs(v.height - (v.width * meta.height) / meta.width) > 0.6 ||
          d.exif ||
          d.icc
        )
          throw new Error(`Invalid derivative ${v.src}`);
        if (!a.derivatives.some(x => JSON.stringify(x) === JSON.stringify(v)))
          throw new Error('Audit mismatch');
        bytes += b.length;
        derivatives++;
      }
    }
    if (!m.webp.some(v => JSON.stringify(v) === JSON.stringify(m.fallback)))
      throw new Error('Invalid fallback');
  }
  if (
    Object.keys(manifest).length !== data.products.images.length ||
    audit.images.length !== data.products.images.length ||
    ledger.assets.filter(a => a.depictsProductId).length !== data.products.images.length
  )
    throw new Error('Unexpected image inventory');
  const covers = data.products.products
    .filter(p => p.published)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .slice(0, 4)
    .map(p => manifest[p.imageIds[0]]);
  // 640w is conservative for a 195px card at up to 3x density.
  const firstScreenBytes = covers.reduce(
    (n, m) => n + (m.avif.find(v => v.width === 640)?.bytes || m.fallback.bytes),
    0,
  );
  const webpFirstScreenBytes = covers.reduce(
    (n, m) => n + (m.webp.find(v => v.width === 640)?.bytes || m.fallback.bytes),
    0,
  );
  if (Math.max(firstScreenBytes, webpFirstScreenBytes) > 240 * 1024)
    throw new Error('First four image byte budget exceeded');
  const sceneAudit = await prepareScenes(true);
  {
    for (const a of ledger.assets) {
      if (hash(await readFile(a.localPath)) !== a.sha256)
        throw new Error('Provenance hash drift ' + a.localPath);
    }
    if (ledger.renderInputs?.length) {
      const lock = JSON.parse(await readFile('tools/blender/assets.lock.json', 'utf8')) as {
        files: { asset: string; path: string; sha256: string }[];
      };
      for (const input of ledger.renderInputs)
        for (const f of input.files)
          if (!lock.files.some(l => l.asset === input.id && l.path === f.path && l.sha256 === f.sha256))
            throw new Error(`Render input not in lock file: ${input.id}/${f.path}`);
    }
    for (const c of data.materials.floorCollections) {
      const meta = await sharp('public' + c.atlas.image).metadata();
      if (meta.width !== c.atlas.repeatPixels[0] || meta.height !== c.atlas.repeatPixels[1])
        throw new Error('Atlas metadata mismatch');
    }
  }
  return {
    sceneAudit,
    sources: data.products.images.length,
    derivatives,
    totalDerivativeBytes: bytes,
    firstFour640AvifBytes: firstScreenBytes,
    firstFour640WebpBytes: webpFirstScreenBytes,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(
    'Assets verified:',
    await verifyAssets(),
  );
