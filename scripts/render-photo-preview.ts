// Own-room photo pipeline without the browser: AI floor mask → first-guess
// perspective → photo lighting plate → the Studio kernel. For a quick look at
// a batch of photos before scoring them in the app (where the touch-up happens).
//
//   tsx scripts/render-photo-preview.ts <photo|dir> <out-dir> [floorProductId] [--rotation 90]
//
// Writes <name>-guess.jpg (photo with the AI mask, the corner quad and the
// plank preview) and <name>-render.jpg (the floor replaced) per photo.
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web';
import { loadSiteData } from '../src/lib/data/load';
import { createMaterialLoader } from '../src/lib/studio/asset-loader';
import { renderRows } from '../src/lib/studio/render/kernel';
import { decodeNode } from './prepare-scenes';
import { floorMaskFromLogits, segformerInput, SEGFORMER } from '../src/lib/studio/photo/segment';
import { defaultFocalPx, floorPlane, guessQuad, plankPreviewLines } from '../src/lib/studio/photo/perspective';
import { photoLightingPlate } from '../src/lib/studio/photo/lighting';
import { photoCatalog, photoSceneDefinition, photoSelection, preparePhotoScene } from '../src/lib/studio/photo/scene';
import { focalPxFrom35mm, PHOTO_MAX_EDGE, readExif } from '../src/lib/studio/photo/intake';
import { SEGMENTATION_FILES } from '../src/lib/studio/photo/model-files';

const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const [input, outDir, floorArg] = args;
if (!outDir) throw new Error('Usage: render-photo-preview <photo|dir> <out-dir> [floorProductId] [--rotation 90]');
const rotation = process.argv.includes('--rotation') && process.argv[process.argv.indexOf('--rotation') + 1] === '90' ? 90 : 0;
const data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials },
  floorId = floorArg ?? data.materials.scenes[0].defaultSelection.floorProductId;
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(await readFile('public' + SEGMENTATION_FILES.model));
const files = (await stat(input)).isDirectory()
  ? (await readdir(input)).filter(f => /\.(jpe?g|png|webp)$/i.test(f) && !/\.(mask|ai)\./.test(f)).map(f => join(input, f))
  : [input];
await mkdir(outDir, { recursive: true });
const materialLoader = createMaterialLoader(decodeNode);
for (const file of files) {
  const name = basename(file, extname(file)),
    exif = readExif(new Uint8Array(await readFile(file)));
  const { data: raw, info } = await sharp(file)
    .rotate()
    .resize({ width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const photo = { width: info.width, height: info.height, data: new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length) };
  const focal = exif.focal35 ? focalPxFrom35mm(exif.focal35, photo.width, photo.height) : defaultFocalPx(photo.width, photo.height);
  const t0 = performance.now();
  const result = await session.run({
    [session.inputNames[0]]: new ort.Tensor('float32', segformerInput(photo), [1, 3, SEGFORMER.size, SEGFORMER.size]),
  });
  const mask = floorMaskFromLogits(result[session.outputNames[0]].data as Float32Array, photo);
  const quad = guessQuad(photo, mask, focal),
    planeResult = floorPlane(quad, photo.width, photo.height, focal),
    plate = photoLightingPlate(photo, mask);
  const t1 = performance.now();
  if (!planeResult.ok || !plate) {
    console.log(`${name}: no floor found (${planeResult.ok ? 'empty mask' : planeResult.reason})`);
    continue;
  }
  const scene = { photo, mask, plate, quad, plane: planeResult.plane, light: 1, revision: 1 },
    definition = photoSceneDefinition(scene, catalog, floorId),
    prepared = preparePhotoScene(scene, definition),
    pcat = photoCatalog(catalog, () => definition),
    selection = photoSelection(catalog, floorId, rotation),
    materials = await materialLoader.prepare(selection, pcat, new AbortController().signal);
  const out = { width: photo.width, height: photo.height, data: new Uint8ClampedArray(photo.width * photo.height * 4) };
  renderRows({ id: 1, selection, width: photo.width, height: photo.height, quality: 'settled', rendererVersion: 2 }, prepared, materials, out, 0, photo.height);
  const t2 = performance.now();
  // Guess overlay: mask tint, quad, plank joints.
  const product = catalog.products.find(p => p.id === floorId);
  const collection = data.materials.floorCollections.find(c => product?.kind === 'floor' && c.id === product.collectionId)!;
  const W = photo.width,
    H = photo.height,
    lines = plankPreviewLines(
      planeResult.plane,
      { lengthMm: collection.atlas.boardSizeMm.length, widthMm: collection.atlas.boardSizeMm.width },
      rotation,
      { top: plate.bounds[1] / H, bottom: 1 },
    );
  const tint = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    tint[i * 4] = 40;
    tint[i * 4 + 1] = 200;
    tint[i * 4 + 2] = 160;
    tint[i * 4 + 3] = Math.round(mask.data[i] * 0.4);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <g stroke="white" stroke-opacity="0.7" stroke-width="${W / 900}">${lines.map(([a, b]) => `<line x1="${a[0] * W}" y1="${a[1] * H}" x2="${b[0] * W}" y2="${b[1] * H}"/>`).join('')}</g>
    <polygon points="${quad.map(p => `${p[0] * W},${p[1] * H}`).join(' ')}" fill="none" stroke="#ffcc00" stroke-width="${W / 300}"/></svg>`;
  await sharp(Buffer.from(raw), { raw: { width: W, height: H, channels: 4 } })
    .composite([{ input: tint, raw: { width: W, height: H, channels: 4 } }, { input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toFile(join(outDir, `${name}-guess.jpg`));
  await sharp(Buffer.from(out.data.buffer), { raw: { width: W, height: H, channels: 4 } })
    .jpeg({ quality: 90 })
    .toFile(join(outDir, `${name}-render.jpg`));
  console.log(`${name}: ${W}×${H}, focal ${focal.toFixed(0)} px, AI + guess ${(t1 - t0).toFixed(0)} ms, render ${(t2 - t1).toFixed(0)} ms`);
}
