// Import a supplier's floor décors from a manifest (tools/decors/<supplier>.json):
//   tsx scripts/import-decors.ts [tools/decors/kronotex.json] [--dry]
// The décor images (official top-down "area" images, boards running vertically)
// must already be in tools/decors/.cache/<supplier>/ (downloaded with the owner's
// approval; git-ignored). For each décor this:
//   1. finds the long-side joints (a comb over the column profile; the period is
//      the board width, which fixes px/mm) and, per board column, the end joints
//      (a comb at the board length),
//   2. cuts every complete board, insets past the printed V-groove, drops near
//      duplicates (décor prints repeat) and keeps up to MAX_VARIANTS,
//   3. writes brand/assets/textures/floors/<id>/{planks,atlas,trim}.png at
//      ≤ TARGET_PX_PER_MM (never upscaled): plank sheet for position-map rooms,
//      a board-aligned seamless atlas for homography rooms, a skirting texture,
//   4. upserts the floor collection (with `decor` provenance) and the floor
//      product, and records every derived file in brand/asset-sources.json.
// Swapping brand = another manifest + this command; ids are <supplier>-<code>.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { srgbToLinear, linearToSrgb } from '../src/lib/studio/render/color';
import { upsertLedger, type LedgerEntry } from './asset-ledger';

export const TARGET_PX_PER_MM = 1.5;
export const MAX_VARIANTS = 6;
const INSET_MM = 2; // printed V-groove shading at each board edge
const ATLAS_WIDTH_PX = 2048;
const ATLAS_ROWS = 4;
const ATLAS_PER_ROW = 4;
const ROW_OFFSETS = [0, 0.5, 0.25, 0.75];
const BEVEL_MM = 1.2;

interface Decor {
  code: string;
  name: string;
  collection: string;
  page: string;
  image: string;
  boardMm: [number, number];
  thicknessMm: 8 | 10 | 12;
  acClass: 'AC4' | 'AC5';
  usageClass: 32 | 33;
  structure: string;
}
interface Manifest {
  supplier: {
    id: string;
    brand: string;
    manufacturer: string;
    originCountry: 'DE' | 'AT' | 'SI' | 'TR' | 'CH';
    usage: 'private-pitch-only' | 'licensed';
    licenseNote: string;
    checkedAt: string;
  };
  decors: Decor[];
}
const lut = Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

function luminance(img: Raw) {
  const n = img.width * img.height,
    out = new Float32Array(n);
  for (let i = 0; i < n; i++)
    out[i] = 0.2126 * lut[img.data[i * 3]] + 0.7152 * lut[img.data[i * 3 + 1]] + 0.0722 * lut[img.data[i * 3 + 2]];
  return out;
}
/** Profile minus its moving average: joints are narrow dark dips. */
function highPass(profile: Float64Array, radius: number) {
  const n = profile.length,
    prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + profile[i];
  return profile.map((v, i) => {
    const a = Math.max(0, i - radius),
      b = Math.min(n, i + radius + 1);
    return v - (prefix[b] - prefix[a]) / (b - a);
  });
}
const dip = (hp: Float64Array, x: number) => {
  const i = Math.round(x);
  let m = Infinity;
  for (let k = i - 1; k <= i + 1; k++) if (k >= 0 && k < hp.length) m = Math.min(m, hp[k]);
  return m;
};
/** Best comb (period, phase) over a profile; score is the mean dip (negative = dark joints). */
function comb(hp: Float64Array, periods: number[]) {
  let best = { period: 0, phase: 0, score: Infinity };
  for (const p of periods)
    for (let phase = 0; phase < p; phase++) {
      let s = 0,
        n = 0;
      for (let x = phase; x < hp.length; x += p) {
        s += dip(hp, x);
        n++;
      }
      if (n && s / n < best.score) best = { period: p, phase, score: s / n };
    }
  return best;
}
const mad = (v: Float64Array) => {
  const s = Float64Array.from(v).sort(),
    med = s[s.length >> 1];
  return Float64Array.from(v.map(x => Math.abs(x - med))).sort()[v.length >> 1];
};

function columnProfile(lum: Float32Array, W: number, H: number, x0: number, x1: number) {
  const a = Math.ceil(x0 + (x1 - x0) * 0.15),
    b = Math.floor(x1 - (x1 - x0) * 0.15),
    rows = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = a; x < b; x++) s += lum[y * W + x];
    rows[y] = s / (b - a);
  }
  return highPass(rows, 15);
}
/** Local minimum of a profile within ±r of x. */
function refine(hp: Float64Array, x: number, r: number) {
  let best = Math.round(x);
  for (let k = Math.round(x) - r; k <= Math.round(x) + r; k++)
    if (k >= 0 && k < hp.length && hp[k] < hp[best]) best = k;
  return best;
}

export function findBoards(img: Raw, boardMm: readonly [number, number]) {
  const { width: W, height: H } = img,
    lum = luminance(img);
  const cols = new Float64Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cols[x] += lum[y * W + x];
  cols.forEach((v, i) => (cols[i] = v / H));
  const hpX = highPass(cols, 15),
    noiseX = mad(hpX);
  const periods: number[] = [];
  for (let p = W / 16; p <= W / 6; p += 0.05) periods.push(p);
  const coarse = comb(hpX, periods);
  if (!(coarse.score < -4 * noiseX)) throw new Error(`No long-side joints found (score ${coarse.score}, noise ${noiseX})`);
  const columnsAt = (period: number, phase: number) => {
    const xs: number[] = [];
    for (let x = phase; x + period <= W; x += period) xs.push(x);
    return xs;
  };
  // End joints are crisp across a whole board width, so the board length in
  // pixels (hence px/mm) comes from them; the width period only seeds it.
  const profiles = columnsAt(coarse.period, coarse.phase).map(x => columnProfile(lum, W, H, x, x + coarse.period));
  const guess = (boardMm[0] / boardMm[1]) * coarse.period;
  let lengthPx = guess,
    bestScore = Infinity;
  for (let l = guess * 0.9; l <= guess * 1.1; l += 0.5) {
    const score = profiles.reduce((n, hp) => n + comb(hp, [l]).score, 0);
    if (score < bestScore) [lengthPx, bestScore] = [l, score];
  }
  // Some official images are scaled slightly differently along x and y, so each
  // axis keeps its own scale; boards are resampled to true size when cut.
  const across = coarse,
    ppmX = across.period / boardMm[1],
    ppmY = lengthPx / boardMm[0];
  const boards: { x0: number; x1: number; y0: number; y1: number; strength: number }[] = [];
  const columns = columnsAt(across.period, across.phase);
  for (const x0 of columns) {
    const hpY = columnProfile(lum, W, H, x0, x0 + across.period),
      noise = mad(hpY),
      along = comb(hpY, [lengthPx]);
    // Joints that actually exist in this column (both ends of a board must be real).
    const joints: number[] = [];
    for (let y = along.phase; y < H; y += lengthPx) {
      const j = refine(hpY, y, 8);
      if (hpY[j] < -8 * noise) joints.push(j);
    }
    for (let k = 0; k + 1 < joints.length; k++)
      if (Math.abs(joints[k + 1] - joints[k] - lengthPx) < lengthPx * 0.004)
        boards.push({ x0, x1: x0 + across.period, y0: joints[k], y1: joints[k + 1], strength: along.score / noise });
  }
  return { pxPerMm: Math.min(ppmX, ppmY), ppmX, ppmY, periodPx: across.period, lengthPx, columns: columns.length, boards };
}

/** Bilinear crop of a rotated board: output u (length) runs down the source column. */
function cutBoard(
  img: Raw,
  b: { x0: number; x1: number; y0: number; y1: number },
  inset: readonly [number, number],
  L: number,
  Wd: number,
) {
  const out = Buffer.alloc(L * Wd * 3),
    sx0 = b.x0 + inset[0],
    sx1 = b.x1 - inset[0],
    sy0 = b.y0 + inset[1],
    sy1 = b.y1 - inset[1];
  for (let v = 0; v < Wd; v++)
    for (let u = 0; u < L; u++) {
      // Area-average when downsampling: sample a 2x2 grid inside the footprint.
      const acc = [0, 0, 0];
      for (const [du, dv] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const fy = sy0 + ((u + du) / L) * (sy1 - sy0) - 0.5,
          fx = sx0 + ((v + dv) / Wd) * (sx1 - sx0) - 0.5,
          ix = Math.max(0, Math.min(img.width - 2, Math.floor(fx))),
          iy = Math.max(0, Math.min(img.height - 2, Math.floor(fy))),
          tx = fx - ix,
          ty = fy - iy;
        for (let c = 0; c < 3; c++) {
          const p = (y: number, x: number) => lut[img.data[(y * img.width + x) * 3 + c]];
          acc[c] +=
            (p(iy, ix) * (1 - tx) + p(iy, ix + 1) * tx) * (1 - ty) + (p(iy + 1, ix) * (1 - tx) + p(iy + 1, ix + 1) * tx) * ty;
        }
      }
      for (let c = 0; c < 3; c++) out[(v * L + u) * 3 + c] = Math.round(linearToSrgb(acc[c] / 4) * 255);
    }
  return out;
}
function signature(board: Buffer, L: number, Wd: number, flip: boolean) {
  const sw = 96,
    sh = 6,
    s = new Float64Array(sw * sh);
  for (let v = 0; v < Wd; v++)
    for (let u = 0; u < L; u++) {
      const i = (v * L + u) * 3,
        su = Math.min(sw - 1, Math.floor((flip ? L - 1 - u : u) / (L / sw))),
        sv = Math.min(sh - 1, Math.floor((flip ? Wd - 1 - v : v) / (Wd / sh)));
      s[sv * sw + su] += lut[board[i]] + lut[board[i + 1]] + lut[board[i + 2]];
    }
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    s[i] -= mean;
    n += s[i] * s[i];
  }
  return s.map(v => v / Math.sqrt(n || 1));
}
const correlation = (a: Float64Array, b: Float64Array) => a.reduce((s, v, i) => s + v * b[i], 0);

export function meanSrgb(buf: Buffer) {
  const sum = [0, 0, 0];
  for (let i = 0; i < buf.length; i += 3) for (let c = 0; c < 3; c++) sum[c] += lut[buf[i + c]];
  const n = buf.length / 3;
  return (
    '#' +
    sum
      .map(v => Math.round(linearToSrgb(v / n) * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Lay boards straight (seamless and board-aligned when rows × perRow tiles):
 * `rows` rows of `perRow` boards, ends staggered by ROW_OFFSETS, bevels shaded.
 */
export function composeAtlas(boards: Buffer[], L: number, Wd: number, ppm: number, rows = ATLAS_ROWS, perRow = ATLAS_PER_ROW) {
  const RW = L * perRow,
    RH = Wd * rows,
    out = Buffer.alloc(RW * RH * 3),
    bevel = Math.max(1, BEVEL_MM * ppm);
  for (let r = 0; r < rows; r++)
    for (let y = 0; y < Wd; y++)
      for (let x = 0; x < RW; x++) {
        const shifted = (x + Math.round(ROW_OFFSETS[r % ROW_OFFSETS.length] * L)) % RW,
          k = Math.floor(shifted / L),
          u = shifted - k * L,
          slot = r * perRow + k,
          board = boards[slot % boards.length],
          flip = (slot >> 1) & 1,
          su = flip ? L - 1 - u : u,
          sv = flip ? Wd - 1 - y : y,
          edge = Math.min(u, L - 1 - u, y, Wd - 1 - y),
          shade = edge < bevel ? 0.72 + 0.28 * (edge / bevel) : 1,
          s = (sv * L + su) * 3,
          d = ((r * Wd + y) * RW + x) * 3;
        for (let c = 0; c < 3; c++) out[d + c] = Math.round(linearToSrgb(lut[board[s + c]] * shade) * 255);
      }
  return { data: out, width: RW, height: RH };
}

export async function importDecors(manifestPath = 'tools/decors/kronotex.json', dry = false) {
  const manifest: Manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const sup = manifest.supplier,
    cache = `tools/decors/.cache/${sup.id}`;
  const materials = JSON.parse(await readFile('brand/materials.json', 'utf8'));
  const products = JSON.parse(await readFile('brand/products.json', 'utf8'));
  const ledger: LedgerEntry[] = [];
  const report = [];
  let order = 1;
  for (const d of manifest.decors) {
    const id = `${sup.id}-${d.code.toLowerCase()}`,
      file = `${cache}/${d.image.split('/').at(-1)}`,
      source = await readFile(file);
    const { data, info } = await sharp(source).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const img = { data, width: info.width, height: info.height };
    const found = findBoards(img, d.boardMm);
    const ppm = Math.min(TARGET_PX_PER_MM, Math.floor(found.pxPerMm * 100) / 100),
      L = Math.round(d.boardMm[0] * ppm),
      Wd = Math.round(d.boardMm[1] * ppm),
      anisotropy = found.ppmY / found.ppmX - 1;
    if (Math.abs(anisotropy) > 0.05) throw new Error(`${d.code}: board aspect mismatch ${anisotropy}`);
    const kept: { buf: Buffer; sig: Float64Array; at: (typeof found.boards)[number] }[] = [];
    for (const b of found.boards) {
      const buf = cutBoard(img, b, [INSET_MM * found.ppmX, INSET_MM * found.ppmY], L, Wd),
        sig = signature(buf, L, Wd, false),
        flipped = signature(buf, L, Wd, true);
      if (kept.some(k => Math.max(correlation(k.sig, sig), correlation(k.sig, flipped)) > 0.9)) continue;
      kept.push({ buf, sig, at: b });
      if (kept.length === MAX_VARIANTS) break;
    }
    if (kept.length < 3) throw new Error(`${d.code}: only ${kept.length} unique full boards`);
    const boards = kept.map(k => k.buf),
      dir = `brand/assets/textures/floors/${id}`,
      sheet = Buffer.concat(boards),
      atlas = composeAtlas(boards, L, Wd, ppm),
      atlasPx = [ATLAS_WIDTH_PX, Math.round((ATLAS_WIDTH_PX * atlas.height) / atlas.width)] as const;
    // Skirting in floor décor: 1200 x 80 mm at 1 px/mm, cut along one board.
    const trim = await sharp(boards[0], { raw: { width: L, height: Wd, channels: 3 } })
      .extract({ left: 0, top: Math.round((Wd - 80 * ppm) / 2), width: Math.min(L, Math.round(1200 * ppm)), height: Math.round(80 * ppm) })
      .resize(1200, 80)
      .png({ compressionLevel: 9 })
      .toBuffer();
    const planksPng = await sharp(sheet, { raw: { width: L, height: Wd * boards.length, channels: 3 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const atlasPng = await sharp(atlas.data, { raw: { width: atlas.width, height: atlas.height, channels: 3 } })
      .resize(atlasPx[0], atlasPx[1], { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const swatch = meanSrgb(sheet);
    report.push({
      id,
      nativePxPerMm: +found.pxPerMm.toFixed(3),
      anisotropyPct: +(anisotropy * 100).toFixed(2),
      pxPerMm: ppm,
      columns: found.columns,
      fullBoards: found.boards.length,
      variants: boards.length,
      swatch,
    });
    if (dry) continue;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/planks.png`, planksPng);
    await writeFile(`${dir}/atlas.png`, atlasPng);
    await writeFile(`${dir}/trim.png`, trim);

    const name = { sq: d.name, en: d.name, de: d.name };
    const collection = {
      id,
      name,
      thicknessMm: d.thicknessMm,
      bevel: '4v',
      atlas: {
        image: `/media/textures/floors/${id}/atlas.webp`,
        repeatSizeMm: [d.boardMm[0] * ATLAS_PER_ROW, d.boardMm[1] * ATLAS_ROWS],
        repeatPixels: atlasPx,
        boardSizeMm: { length: d.boardMm[0], width: d.boardMm[1] },
        pattern: 'straight',
        boardsPerRepeat: ATLAS_ROWS * ATLAS_PER_ROW,
        bevelWidthMm: BEVEL_MM,
        chevronCutAngleDeg: null,
      },
      planks: { image: `/media/textures/floors/${id}/planks.webp`, variants: boards.length, variantPx: [L, Wd], pxPerMm: ppm },
      trim: {
        appearance: {
          kind: 'texture',
          texture: `/media/textures/floors/${id}/trim.webp`,
          physicalSizeMm: [1200, 80],
          grainAxis: 'u',
          fit: 'repeat',
          fallbackColorSrgb: swatch,
        },
        specularStrength: 0.02,
      },
      swatchColorSrgb: swatch,
      specularStrength: 0.04,
      kind: 'laminate',
      acClass: d.acClass,
      usageClass: d.usageClass,
      decor: {
        supplier: sup.id,
        brand: sup.brand,
        code: d.code,
        collection: d.collection,
        structure: d.structure,
        sourceUrl: d.page,
        checkedAt: sup.checkedAt,
        usage: sup.usage,
      },
    };
    const ci = materials.floorCollections.findIndex((c: { id: string }) => c.id === id);
    if (ci >= 0) materials.floorCollections[ci] = collection;
    else materials.floorCollections.push(collection);

    const pitch = sup.usage === 'private-pitch-only';
    const product = {
      id,
      slug: id,
      sku: `${sup.brand} ${d.code}`,
      name,
      summary: {
        sq: `Laminat ${sup.brand} ${d.collection}, ${d.thicknessMm} mm, ${d.acClass} / klasa ${d.usageClass}, dërrasë ${d.boardMm[0]} × ${d.boardMm[1]} mm me V-fugë në 4 anë.`,
        en: `${sup.brand} ${d.collection} laminate, ${d.thicknessMm} mm, ${d.acClass} / class ${d.usageClass}, ${d.boardMm[0]} × ${d.boardMm[1]} mm boards with a 4-sided V-groove.`,
        de: `${sup.brand} ${d.collection} Laminat, ${d.thicknessMm} mm, ${d.acClass} / Klasse ${d.usageClass}, Dielen ${d.boardMm[0]} × ${d.boardMm[1]} mm mit 4-seitiger V-Fuge.`,
      },
      originCountry: sup.originCountry,
      manufacturer: sup.manufacturer,
      imageIds: [`${id}-01`, `${id}-02`],
      relatedProductIds: [],
      evidence: {
        status: 'supplier-verified',
        sourceUrl: d.page,
        checkedAt: sup.checkedAt,
        note: pitch
          ? {
              sq: 'Të dhënat e artikullit nga faqja zyrtare e prodhuesit. Dekori vetëm për prezantim privat — pa leje botimi.',
              en: "Article data from the manufacturer's official page. Décor for private pitch only — no publication permission yet.",
              de: 'Artikeldaten von der offiziellen Herstellerseite. Dekor nur für private Präsentation — noch keine Veröffentlichungsfreigabe.',
            }
          : {
              sq: 'Të dhënat e artikullit nga faqja zyrtare e prodhuesit.',
              en: "Article data from the manufacturer's official page.",
              de: 'Artikeldaten von der offiziellen Herstellerseite.',
            },
      },
      displayOrder: order++,
      published: true,
      kind: 'floor',
      collectionId: id,
      compatibleSceneIds: [] as string[],
    };
    const pi = products.products.findIndex((p: { id: string }) => p.id === id);
    if (pi >= 0) product.compatibleSceneIds = products.products[pi].compatibleSceneIds;
    if (pi >= 0) products.products[pi] = { ...products.products[pi], ...product };
    else products.products.push(product);

    const derivation = `Cut by scripts/import-decors.ts from the official décor image (${d.image}, sha256 ${sha(source)}): long-side joints by comb fit (period ${found.periodPx.toFixed(2)} px = ${d.boardMm[1]} mm), end joints by comb fit (${found.lengthPx.toFixed(1)} px = ${d.boardMm[0]} mm); native ${found.ppmX.toFixed(3)} × ${found.ppmY.toFixed(3)} px/mm (x × y, resampled to square), ${boards.length} unique complete boards of ${found.boards.length}, inset ${INSET_MM} mm past the printed V-groove, resampled to ${ppm} px/mm (no upscaling).`;
    for (const [kind, buf] of [
      ['planks', planksPng],
      ['atlas', atlasPng],
      ['trim', trim],
    ] as const)
      ledger.push({
        id: `texture-${id}-${kind}`,
        localPath: `${dir}/${kind}.png`,
        sourceUrl: d.page,
        author: `${sup.manufacturer}; derived by Porta & Dysheme asset authoring`,
        usageBasis: pitch ? 'private-pitch-only' : 'licensed',
        licenseNote: `${sup.licenseNote} ${derivation}${kind === 'atlas' ? ` Atlas: ${ATLAS_ROWS} rows × ${ATLAS_PER_ROW} boards, row offsets ${ROW_OFFSETS.join('/')} of a board, ${BEVEL_MM} mm bevel shading baked.` : ''}${kind === 'trim' ? ' Trim: 1200 × 80 mm strip of one board at 1 px/mm.' : ''}`,
        depictsProductId: null, // textures, not catalog images (verify-assets counts those)
        isIllustrative: false,
        sha256: sha(buf),
      });
  }
  if (!dry) {
    await writeFile('brand/materials.json', JSON.stringify(materials, null, 2) + '\n');
    await writeFile('brand/products.json', JSON.stringify(products, null, 2) + '\n');
    await upsertLedger(ledger);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  console.table(await importDecors(args.find(a => !a.startsWith('--')), args.includes('--dry')));
}
