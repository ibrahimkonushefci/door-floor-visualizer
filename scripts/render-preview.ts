// Dev tool: render one Studio combination at full scene resolution to a PNG.
// Usage: tsx scripts/render-preview.ts <scene> <door> <finish> <floor> <out.png> [rotation 0|90|45] [frame] [skirting] [model]
// The renderer lays position-map floors at any angle; the Studio UI offers 0/90.
import sharp from 'sharp';
import type { TrimMode } from '../src/lib/data/types';
import { loadSiteData } from '../src/lib/data/load';
import { prepareSceneWith, createMaterialLoader } from '../src/lib/studio/asset-loader';
import { renderRows } from '../src/lib/studio/render/kernel';
import { decodeNode, bytesNode } from './prepare-scenes';
const [sceneId, door, finish, floor, out, rotation = '0', frame, skirting, model] = process.argv.slice(2);
if (!out) throw new Error('Usage: render-preview <scene> <door> <finish> <floor> <out.png> [0|90|45] [frame] [skirting] [model]');
const data = loadSiteData();
const catalog = { products: data.products.products, materials: data.materials };
const definition = data.materials.scenes.find(s => s.id === sceneId);
if (!definition) throw new Error(`Unknown scene ${sceneId}`);
const signal = new AbortController().signal;
const glass = data.materials.doorFinishes.find(f => f.id === finish)?.kind === 'glass';
const doorModelId = model || definition.defaultSelection.doorModelId;
const scene = await prepareSceneWith(
  glass ? definition : { ...definition, doorInserts: [] }, signal, decodeNode, { loadBytes: bytesNode, modelId: doorModelId });
const selection = {
  ...definition.defaultSelection,
  doorProductId: door,
  doorModelId,
  doorFinishId: finish,
  floorProductId: floor,
  floorRotationDeg: Number(rotation) as 0 | 90,
  ...(frame ? { frameMode: frame as TrimMode } : {}),
  ...(skirting ? { skirtingMode: skirting as TrimMode } : {}),
};
const materials = await createMaterialLoader(decodeNode).prepare(selection, catalog, signal);
const { width, height } = definition;
const pixels = { width, height, data: new Uint8ClampedArray(width * height * 4) };
const start = performance.now();
renderRows(
  { id: 1, selection, width, height, quality: 'settled', rendererVersion: 2 },
  scene,
  materials,
  pixels,
  0,
  height,
);
console.log(`Rendered ${width}×${height} in ${Math.round(performance.now() - start)}ms → ${out}`);
await sharp(pixels.data, { raw: { width, height, channels: 4 } }).png().toFile(out);
