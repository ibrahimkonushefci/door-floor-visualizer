// Dev tool: time the compositing kernel for every scene at a given frame width.
// Usage: tsx scripts/bench-studio.ts [width=1600] [runs=3]
import { loadSiteData } from '../src/lib/data/load';
import { prepareSceneWith, createMaterialLoader } from '../src/lib/studio/asset-loader';
import { renderRows, prepareRender } from '../src/lib/studio/render/kernel';
import { sceneScaleFor } from '../src/lib/studio/presentation';
import { decodeNode, bytesNode } from './prepare-scenes';
const width = Number(process.argv[2] || 1600),
  runs = Number(process.argv[3] || 3),
  data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials },
  signal = new AbortController().signal;
for (const definition of data.materials.scenes) {
  const w = Math.min(width, definition.width),
    h = (w * 3) / 4,
    scale = sceneScaleFor(w, definition.width);
  const scene = await prepareSceneWith({ ...definition, doorInserts: [] }, signal, decodeNode, {
      loadBytes: bytesNode,
      scale,
    }),
    materials = await createMaterialLoader(decodeNode).prepare(definition.defaultSelection, catalog, signal),
    job = { id: 1, selection: definition.defaultSelection, width: w, height: h, quality: 'settled' as const, rendererVersion: 2 as const },
    out = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) },
    times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    renderRows(job, scene, materials, out, 0, h, prepareRender(job, scene, materials));
    times.push(Math.round(performance.now() - t));
  }
  console.log(definition.id, `${w}×${h}`, `scale ${scale}`, times.join(' / '), 'ms');
}
