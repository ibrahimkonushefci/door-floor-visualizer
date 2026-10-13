// Build per-board plank sheets for position-map floors.
//   tsx scripts/author-plank-sheets.ts
// Each floor collection's grain comes from the generated door scan its atlas
// was made from (1380×460 px for 1380×460 mm, i.e. 1.0 px/mm native). Boards
// are cut from that scan at native resolution (no upscaling), colour-matched in
// linear light to the collection's current atlas, and stacked vertically into
// brand/assets/textures/floors/<id>/planks.png. At runtime every board picks one
// image by a seeded hash and may be flipped end-for-end or side-for-side, so a
// sheet of S images yields 4·S looks with no repeating tile.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { srgbToLinear, linearToSrgb } from '../src/lib/studio/render/color';
import type { FloorCollection } from '../src/lib/data/types';
import { upsertLedger } from './asset-ledger';

const GRAIN: Record<string, string> = {
  'peshk-natyral-12': 'lis-natyral',
};
const SCAN_MM = [1380, 460] as const;
const PX_PER_MM = 1;
const lut = Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));

async function rgb(path: string) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
// Linear mean and standard deviation per channel; the darkest 3 % of the atlas
// (its baked joints) is ignored so joints do not darken the target colour.
function stats(img: { data: Buffer }, skipDark: boolean) {
  const n = img.data.length / 3,
    lum = new Float64Array(n);
  for (let i = 0; i < n; i++)
    lum[i] = 0.2126 * lut[img.data[i * 3]] + 0.7152 * lut[img.data[i * 3 + 1]] + 0.0722 * lut[img.data[i * 3 + 2]];
  const cut = skipDark ? Float64Array.from(lum).sort()[Math.floor(n * 0.03)] : -1;
  const sum = [0, 0, 0],
    sq = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (lum[i] < cut) continue;
    count++;
    for (let c = 0; c < 3; c++) {
      const v = lut[img.data[i * 3 + c]];
      sum[c] += v;
      sq[c] += v * v;
    }
  }
  const mean = sum.map(v => v / count);
  return { mean, std: sq.map((v, c) => Math.sqrt(Math.max(1e-12, v / count - mean[c] ** 2))) };
}

export async function authorPlankSheets() {
  const materials = JSON.parse(await readFile('brand/materials.json', 'utf8'));
  const results = [];
  for (const c of materials.floorCollections as FloorCollection[]) {
    // Supplier décors get their sheets from scripts/import-decors.ts.
    if (c.decor) continue;
    const scanName = GRAIN[c.id];
    if (!scanName) throw new Error(`No grain scan for ${c.id}`);
    const scan = await rgb(`brand/assets/textures/doors/${scanName}.png`),
      atlas = await rgb(`brand/assets/textures/floors/${c.id}/atlas.png`);
    if (scan.width !== SCAN_MM[0] * PX_PER_MM || scan.height !== SCAN_MM[1] * PX_PER_MM)
      throw new Error(`Unexpected scan size ${scanName}`);
    const from = stats(scan, false),
      to = stats(atlas, true);
    const { length, width } = c.atlas.boardSizeMm,
      L = Math.round(length * PX_PER_MM),
      Wd = Math.round(width * PX_PER_MM);
    if (L > scan.width || Wd > scan.height) throw new Error(`Board larger than scan ${c.id}`);
    // Straight boards span the full scan length: three strips across its width.
    // Short herringbone boards: a 3×3 grid of non-overlapping cuts.
    const xs = c.atlas.pattern === 'straight' ? [0] : [0, 1, 2].map(i => Math.round((i * (scan.width - L)) / 2));
    const ys = [0, 1, 2].map(i => Math.round((i * (scan.height - Wd)) / 2));
    const crops = xs.flatMap(x => ys.map(y => [x, y] as const));
    const sheet = Buffer.alloc(L * Wd * crops.length * 3);
    crops.forEach(([x0, y0], k) => {
      for (let y = 0; y < Wd; y++)
        for (let x = 0; x < L; x++) {
          const s = ((y0 + y) * scan.width + x0 + x) * 3,
            d = ((k * Wd + y) * L + x) * 3;
          for (let ch = 0; ch < 3; ch++) {
            const v = (lut[scan.data[s + ch]] - from.mean[ch]) * (to.std[ch] / from.std[ch]) + to.mean[ch];
            sheet[d + ch] = Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255);
          }
        }
    });
    const png = await sharp(sheet, { raw: { width: L, height: Wd * crops.length, channels: 3 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const localPath = `brand/assets/textures/floors/${c.id}/planks.png`;
    await writeFile(localPath, png);
    const entry = materials.floorCollections.find((f: FloorCollection) => f.id === c.id);
    entry.planks = {
      image: `/media/textures/floors/${c.id}/planks.webp`,
      variants: crops.length,
      variantPx: [L, Wd],
      pxPerMm: PX_PER_MM,
    };
    results.push({
      id: c.id,
      localPath,
      scan: scanName,
      variants: crops.length,
      crops,
      sha256: createHash('sha256').update(png).digest('hex'),
    });
  }
  await writeFile('brand/materials.json', JSON.stringify(materials, null, 2) + '\n');
  await upsertLedger(
    results.map(r => ({
      id: `texture-${r.id}-planks`,
      localPath: r.localPath,
      sourceUrl: null,
      author: 'Porta & Dysheme asset authoring (scripts/author-plank-sheets.ts)',
      usageBasis: 'generated' as const,
      licenseNote: `Plank sheet: ${r.variants} board images cut at native 1.0 px/mm from the generated ${r.scan} albedo scan (brand/assets/textures/doors/${r.scan}.png, crops x,y mm ${r.crops.map(c => c.join(',')).join(' / ')}), colour-matched in linear light (mean/std per channel) to this collection's atlas. No upscaling. Illustrative décor, no supplier match.`,
      depictsProductId: null,
      isIllustrative: true,
      sha256: r.sha256,
    })),
  );
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await authorPlankSheets(), null, 2));
