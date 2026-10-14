// Static files of the own-room photo tool: the floor segmentation runtime
// (public/models/) and the sample room photo (public/media/studio-photo/), with
// their provenance in brand/asset-sources.json (`runtimeModels`, `photoSamples`).
//
//   tsx scripts/prepare-photo-tool.ts           copy + record (needs tools/segmentation/.cache, see below)
//   tsx scripts/prepare-photo-tool.ts --check   verify the shipped files against the ledger
//
// Inputs (free downloads, $0):
//   tools/segmentation/.cache/model_quantized.onnx  https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model_quantized.onnx
//   tools/segmentation/.cache/LICENSE-segformer.txt https://raw.githubusercontent.com/NVlabs/SegFormer/master/LICENSE
//   node_modules/onnxruntime-web/dist/{ort.wasm.bundle.min.mjs, ort-wasm-simd-threaded.wasm} (pinned in package.json)
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { SEGMENTATION_FILES, PHOTO_SAMPLE } from '../src/lib/studio/photo/model-files';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ORT_VERSION = '1.30.0';
const sources = [
  {
    to: SEGMENTATION_FILES.model,
    from: 'tools/segmentation/.cache/model_quantized.onnx',
    url: 'https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model_quantized.onnx',
    sha256: '9a98d6daf3d926869ab8cc4c2ed7374a2bc23b889bb7ca3b0915d15e3c4756bb',
  },
  {
    to: SEGMENTATION_FILES.modelLicense,
    from: 'tools/segmentation/.cache/LICENSE-segformer.txt',
    url: 'https://raw.githubusercontent.com/NVlabs/SegFormer/master/LICENSE',
    sha256: null,
  },
  {
    to: SEGMENTATION_FILES.runtime,
    from: 'node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs',
    url: `https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-${ORT_VERSION}.tgz`,
    sha256: null,
  },
  {
    to: SEGMENTATION_FILES.runtimeWasm,
    from: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
    url: `https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-${ORT_VERSION}.tgz`,
    sha256: null,
  },
];
const ORT_NOTICE = `ONNX Runtime Web ${ORT_VERSION} (onnxruntime-web on npm)
Copyright (c) Microsoft Corporation. MIT License.
https://github.com/microsoft/onnxruntime/blob/main/LICENSE
`;

export interface RuntimeModel {
  id: string;
  kind: 'segmentation-model' | 'runtime';
  sourceUrl: string;
  author: string;
  license: string;
  usageBasis: 'licensed' | 'evaluation-only';
  note: string;
  files: { path: string; url: string; bytes: number; sha256: string }[];
}

async function fileEntry(path: string, url: string) {
  const bytes = await readFile('public' + path);
  return { path, url, bytes: bytes.length, sha256: sha(bytes) };
}

export interface PhotoSample {
  path: string;
  sourceAssetId: string;
  transformation: string;
  bytes: number;
  sha256: string;
}
// The real bedroom photograph (Unsplash, already in the ledger) as the sample room.
const SAMPLE_SOURCE = { id: 'brand-assets-scenes-bedroom-photo-base', path: 'brand/assets/scenes/bedroom-photo/base.png' };

export async function checkPhotoTool(ledger?: { runtimeModels?: RuntimeModel[]; photoSamples?: PhotoSample[] }) {
  const data = ledger ?? JSON.parse(await readFile('brand/asset-sources.json', 'utf8'));
  const models: RuntimeModel[] = data.runtimeModels ?? [];
  const listed = models.flatMap(m => m.files.map(f => f.path));
  for (const path of Object.values(SEGMENTATION_FILES))
    if (!listed.includes(path)) throw new Error(`Segmentation file not in ledger: ${path}`);
  for (const f of models.flatMap(m => m.files)) {
    const bytes = await readFile('public' + f.path).catch(() => {
      throw new Error(`Segmentation file missing: public${f.path}`);
    });
    if (bytes.length !== f.bytes || sha(bytes) !== f.sha256) throw new Error(`Segmentation file drift: ${f.path}`);
  }
  const samples: PhotoSample[] = data.photoSamples ?? [];
  if (!samples.some(s => s.path === PHOTO_SAMPLE)) throw new Error(`Photo sample not in ledger: ${PHOTO_SAMPLE}`);
  for (const s of samples) {
    const bytes = await readFile('public' + s.path);
    if (bytes.length !== s.bytes || sha(bytes) !== s.sha256) throw new Error(`Photo sample drift: ${s.path}`);
  }
  return listed.length + samples.length;
}

async function prepare() {
  await mkdir('public/models/segformer-b0-ade', { recursive: true });
  await mkdir('public/models/ort', { recursive: true });
  for (const s of sources) {
    const bytes = await readFile(s.from);
    if (s.sha256 && sha(bytes) !== s.sha256) throw new Error(`Unexpected download: ${s.from}`);
    await copyFile(s.from, 'public' + s.to);
  }
  await writeFile('public' + SEGMENTATION_FILES.runtimeLicense, ORT_NOTICE);
  const models: RuntimeModel[] = [
    {
      id: 'segformer-b0-ade20k',
      kind: 'segmentation-model',
      sourceUrl: 'https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512',
      author: 'NVIDIA (SegFormer, Xie et al. 2021, nvidia/segformer-b0-finetuned-ade-512-512); ONNX int8 export by Xenova',
      license: 'NVIDIA Source Code License for SegFormer (non-commercial: research or evaluation only)',
      usageBasis: 'evaluation-only',
      note: 'Floor class (ADE20K id 3) is the on-device first guess for own-room photos. The licence allows research or evaluation only, so it is used for the private pitch demo; before the Studio is sold or deployed for customers it must be replaced by a commercially licensed model (or the server path) behind the same FloorSegmenter interface. The licence text ships next to the model, as section 3.1 requires.',
      files: [
        await fileEntry(SEGMENTATION_FILES.model, sources[0].url),
        await fileEntry(SEGMENTATION_FILES.modelLicense, sources[1].url),
      ],
    },
    {
      id: 'onnxruntime-web',
      kind: 'runtime',
      sourceUrl: 'https://www.npmjs.com/package/onnxruntime-web/v/' + ORT_VERSION,
      author: 'Microsoft Corporation',
      license: 'MIT',
      usageBasis: 'licensed',
      note: `ONNX Runtime Web ${ORT_VERSION}, WASM backend only (ort.wasm.bundle.min.mjs + ort-wasm-simd-threaded.wasm), copied unchanged from the pinned npm package. Loaded only when a visitor opens the own-room photo tool.`,
      files: [
        await fileEntry(SEGMENTATION_FILES.runtime, sources[2].url),
        await fileEntry(SEGMENTATION_FILES.runtimeWasm, sources[3].url),
        await fileEntry(SEGMENTATION_FILES.runtimeLicense, 'https://github.com/microsoft/onnxruntime/blob/main/LICENSE'),
      ],
    },
  ];
  await mkdir('public/media/studio-photo', { recursive: true });
  const ledger = JSON.parse(await readFile('brand/asset-sources.json', 'utf8'));
  if (!ledger.assets.some((a: { id: string; localPath: string }) => a.id === SAMPLE_SOURCE.id && a.localPath === SAMPLE_SOURCE.path))
    throw new Error('Sample source missing from the ledger');
  await sharp(SAMPLE_SOURCE.path).jpeg({ quality: 88, mozjpeg: true }).toFile('public' + PHOTO_SAMPLE);
  const sample = await readFile('public' + PHOTO_SAMPLE);
  ledger.runtimeModels = models;
  ledger.photoSamples = [
    {
      path: PHOTO_SAMPLE,
      sourceAssetId: SAMPLE_SOURCE.id,
      transformation: 'Unchanged 1600×1200 pixels of the frozen base.png, re-encoded as JPEG (q88, mozjpeg) so it loads like a phone photo.',
      bytes: sample.length,
      sha256: sha(sample),
    },
  ];
  await writeFile('brand/asset-sources.json', JSON.stringify(ledger, null, 2) + '\n');
  console.log(`Photo tool: ${models.flatMap(m => m.files).length} runtime files and 1 sample recorded`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  (process.argv.includes('--check') ? checkPhotoTool().then(n => console.log(`Photo tool files verified (${n})`)) : prepare()).catch(e => {
    console.error(e);
    process.exit(1);
  });
