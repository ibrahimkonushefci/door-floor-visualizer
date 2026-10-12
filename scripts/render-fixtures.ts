import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { renderRows } from '../src/lib/studio/render/kernel';
import { decode } from '../src/lib/studio/render/color';
import { loadSiteData } from '../src/lib/data/load';
import { prepareSceneWith, prepareMaterialsWith } from '../src/lib/studio/asset-loader';
import { decodeNode } from './prepare-scenes';
import type { PreparedScene, PreparedMaterials, RenderJob } from '../src/lib/studio/types';
export function syntheticScene() {
  const data = loadSiteData(4),
    s = structuredClone(data.materials.scenes[0]),
    selection = { ...s.defaultSelection };
  s.width = s.height = 8;
  const def = {
    ...s.surfaces[0],
    mask: { alpha: '/media/test.png', boundsPx: [0, 0, 8, 8] as const },
    lighting: { ...s.surfaces[0].lighting, baselineLinear: decode[128] },
  };
  const base = new Uint8ClampedArray(256);
  for (let i = 0; i < 64; i++) base.set([64, 80, 96, 255], i * 4);
  const scene: PreparedScene = {
    scene: s,
    base: { width: 8, height: 8, data: base },
    surfaces: [
      {
        definition: def,
        inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        mask: new Uint8Array(64).fill(128),
        diffuse: new Uint8Array(64).fill(128),
        specular: null,
        bounds: [0, 0, 8, 8],
      },
    ],
    protectedMask: new Uint8Array(64),
    foreground: null,
    inserts: new Map(),
    insertMasks: new Map(),
  };
  const materials: PreparedMaterials = {
    data: {
      ...data.materials,
      floorCollections: data.materials.floorCollections.map(c => ({
        ...c,
        atlas: { ...c.atlas, image: '/media/test-atlas.png' },
      })),
    },
    products: data.products.products,
    textures: new Map([
      [
        '/media/test-atlas.png',
        [{ width: 1, height: 1, data: new Float32Array([decode[128], decode[128], decode[128]]) }],
      ],
    ]),
  };
  const job: RenderJob = {
    id: 1,
    selection,
    width: 8,
    height: 8,
    quality: 'settled',
    rendererVersion: 1,
  };
  return { scene, materials, job };
}
async function fixtures() {
  await mkdir('verification/render-fixtures', { recursive: true });
  const f = syntheticScene(),
    out = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
  renderRows(f.job, f.scene, f.materials, out, 0, 8);
  const expected = await sharp('tests/fixtures/render/expected.png').ensureAlpha().raw().toBuffer();
  let max = 0;
  for (let i = 0; i < 256; i++) max = Math.max(max, Math.abs(expected[i] - out.data[i]));
  if (max > 1) throw new Error(`Synthetic approved fixture differs by ${max}`);
  await sharp(out.data, { raw: { width: 8, height: 8, channels: 4 } })
    .png()
    .toFile('verification/render-fixtures/actual.png');
  const data = loadSiteData(4),
    catalog = { products: data.products.products, materials: data.materials },
    signal = new AbortController().signal;
  const timings = [];
  for (const s of data.materials.scenes) {
    const scene = await prepareSceneWith(s, signal, decodeNode),
      mat = await prepareMaterialsWith(s.defaultSelection, catalog, signal, decodeNode);
    for (const [name, quality, width] of [
      ['default', 'settled', 960],
      ['magenta', 'settled', 1600],
      ['scale-grid', 'settled', 1600],
      ...(s.id === 'living-standard' ? [['glass', 'settled', 1600] as const] : []),
    ] as const) {
      let m = mat,
        selection = s.defaultSelection;
      if (name === 'glass') {
        selection = {
          ...selection,
          doorProductId: 'dera-xham',
          doorFinishId: 'xham-erret',
          frameMode: 'black',
        };
        m = await prepareMaterialsWith(selection, catalog, signal, decodeNode);
      }
      if (name === 'magenta')
        m = {
          ...mat,
          data: {
            ...mat.data,
            doorFinishes: mat.data.doorFinishes.map(f =>
              f.kind === 'opaque'
                ? {
                    ...f,
                    appearance: { kind: 'solid', colorSrgb: '#FF00FF' },
                    trim: {
                      appearance: { kind: 'solid', colorSrgb: '#FF00FF' },
                      specularStrength: 0,
                    },
                  }
                : f,
            ),
            floorCollections: mat.data.floorCollections.map(c => ({
              ...c,
              atlas: { ...c.atlas, image: '/media/debug.png' },
              trim: { appearance: { kind: 'solid', colorSrgb: '#FF00FF' }, specularStrength: 0 },
            })),
          },
          textures: new Map([
            ...mat.textures,
            ['/media/debug.png', [{ width: 1, height: 1, data: new Float32Array([1, 0, 1]) }]],
          ]),
        };
      if (name === 'scale-grid') {
        const t = new Float32Array(128 * 128 * 3);
        for (let y = 0; y < 128; y++)
          for (let x = 0; x < 128; x++) {
            const v = x % 16 < 2 || y % 16 < 2 ? 0.05 : 0.8;
            t.set([v, v, v], (y * 128 + x) * 3);
          }
        m = {
          ...mat,
          data: {
            ...mat.data,
            floorCollections: mat.data.floorCollections.map(c => ({
              ...c,
              atlas: { ...c.atlas, image: '/media/debug.png', repeatSizeMm: [2000, 2000] },
            })),
          },
          textures: new Map([
            ...mat.textures,
            ['/media/debug.png', [{ width: 128, height: 128, data: t }]],
          ]),
        };
      }
      const output = {
          width,
          height: (width * 3) / 4,
          data: new Uint8ClampedArray(width * width * 3),
        },
        start = performance.now();
      renderRows(
        { id: 1, selection, width, height: output.height, quality, rendererVersion: 1 },
        scene,
        m,
        output,
        0,
        output.height,
      );
      timings.push({ scene: s.id, name, width, ms: performance.now() - start });
      await sharp(output.data, { raw: { width, height: output.height, channels: 4 } })
        .png()
        .toFile(`verification/render-fixtures/${s.id}-${name}.png`);
    }
  }
  await writeFile(
    'verification/render-fixtures/results.json',
    JSON.stringify(
      {
        maxByteError: max,
        approvedExpected:
          '50% byte128 albedo over64/80/96 base:102/107/113 (independent sRGB formula); fixed golden never overwritten',
        environment: 'Node24 macOS arm64; synchronous fixture kernel, not phone latency',
        timings,
      },
      null,
      2,
    ) + '\n',
  );
  console.log({ maxByteError: max, timings });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await fixtures();
