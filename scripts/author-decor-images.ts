// Catalog images for supplier floor décors (run after `pnpm assets:scenes`):
//   tsx scripts/author-decor-images.ts
// 01: the décor laid in the Blender proof room (living-render-01, default door),
//     rendered by the Studio kernel at full scene resolution;
// 02: a top-down view of the real boards (plank sheet, staggered, bevels shaded).
// Both are derived from the supplier's official décor image, so they carry the
// décor's usage (private pitch only) in the ledger and products.json images.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { materialsSchema } from '../src/lib/data/schemas';
import { prepareSceneWith, createMaterialLoader } from '../src/lib/studio/asset-loader';
import { renderRows } from '../src/lib/studio/render/kernel';
import type { FloorCollection, LocalizedText, Product } from '../src/lib/data/types';
import { decodeNode, bytesNode } from './prepare-scenes';
import { composeAtlas } from './import-decors';
import { upsertLedger, type LedgerEntry } from './asset-ledger';

const SCENE = 'living-render-01';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export async function authorDecorImages() {
  // Raw data: the products already list these images, so full site validation waits for them.
  const materials0 = materialsSchema.parse(JSON.parse(await readFile('brand/materials.json', 'utf8')));
  const products = JSON.parse(await readFile('brand/products.json', 'utf8'));
  const data = { materials: materials0, products: products as { products: Product[] } };
  const catalog = { products: data.products.products, materials: data.materials };
  const definition = data.materials.scenes.find(s => s.id === SCENE)!;
  const signal = new AbortController().signal;
  const scene = await prepareSceneWith(definition, signal, decodeNode, { loadBytes: bytesNode });
  const loader = createMaterialLoader(decodeNode);
  const ledger: LedgerEntry[] = [];
  const done = [];
  for (const p of data.products.products) {
    if (p.kind !== 'floor') continue;
    const c = data.materials.floorCollections.find(f => f.id === p.collectionId) as FloorCollection;
    if (!c.decor || !c.planks) continue;
    const dir = `brand/assets/products/${p.id}`;
    await mkdir(dir, { recursive: true });
    // 01: in the room.
    const selection = { ...definition.defaultSelection, floorProductId: p.id };
    const materials = await loader.prepare(selection, catalog, signal);
    const { width, height } = definition;
    const pixels = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    renderRows({ id: 1, selection, width, height, quality: 'settled', rendererVersion: 2 }, scene, materials, pixels, 0, height);
    const room = await sharp(pixels.data, { raw: { width, height, channels: 4 } }).removeAlpha().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    // 02: boards from above, 1.2 × 0.8 m at the sheet's density (no upscaling).
    const sheet = await sharp(`brand/assets/textures/floors/${c.id}/planks.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const [L, Wd] = c.planks.variantPx,
      boards = Array.from({ length: c.planks.variants }, (_, k) => sheet.data.subarray(k * L * Wd * 3, (k + 1) * L * Wd * 3));
    const rows = Math.ceil((800 * c.planks.pxPerMm) / Wd) + 1,
      laid = composeAtlas(boards, L, Wd, c.planks.pxPerMm, rows, 2);
    const cw = Math.round(1200 * c.planks.pxPerMm),
      ch = Math.round(800 * c.planks.pxPerMm);
    const detail = await sharp(laid.data, { raw: { width: laid.width, height: laid.height, channels: 3 } })
      .extract({ left: Math.round(L * 0.3), top: Math.round(Wd * 0.5), width: cw, height: ch })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    const name = p.name as LocalizedText;
    const images = [
      {
        id: `${p.id}-01`,
        source: `${dir}/01.jpg`,
        bytes: room,
        role: 'room',
        alt: {
          sq: `${name.sq} në dhomën e ndenjes 3D — pamje ilustruese`,
          en: `${name.en} in the 3D living room — illustrative view`,
          de: `${name.de} im 3D-Wohnzimmer — illustrative Ansicht`,
        },
        note: `Studio kernel render of ${SCENE} (Blender proof room, own) with this décor's plank sheet.`,
        illustrative: true,
      },
      {
        id: `${p.id}-02`,
        source: `${dir}/02.jpg`,
        bytes: detail,
        role: 'detail',
        alt: {
          sq: `${name.sq} — dërrasat nga lart`,
          en: `${name.en} — boards seen from above`,
          de: `${name.de} — Dielen von oben`,
        },
        note: `Boards from this décor's plank sheet laid straight (1.2 × 0.8 m at ${c.planks.pxPerMm} px/mm), bevels shaded.`,
        illustrative: false,
      },
    ];
    for (const img of images) {
      await writeFile(img.source, img.bytes);
      const entry = { id: img.id, source: img.source, alt: img.alt, focalPoint: [0.5, 0.5], role: img.role };
      const i = products.images.findIndex((x: { id: string }) => x.id === img.id);
      if (i >= 0) products.images[i] = entry;
      else products.images.push(entry);
      ledger.push({
        id: img.id,
        localPath: img.source,
        sourceUrl: c.decor.sourceUrl,
        author: `Porta & Dysheme from the ${c.decor.brand} décor ${c.decor.code} (scripts/author-decor-images.ts)`,
        usageBasis: c.decor.usage === 'private-pitch-only' ? 'private-pitch-only' : 'licensed',
        licenseNote: `${img.note} Décor © ${c.decor.brand}; ${c.decor.usage === 'private-pitch-only' ? 'private pitch only until written permission exists' : 'licensed'}.`,
        depictsProductId: p.id,
        isIllustrative: img.illustrative,
        sha256: sha(img.bytes),
      });
    }
    done.push(p.id);
  }
  await writeFile('brand/products.json', JSON.stringify(products, null, 2) + '\n');
  await upsertLedger(ledger);
  return done;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(await authorDecorImages());
