// Scores floor segmentation against ground-truth floor masks.
//
//   tsx scripts/bench-floor-segmentation.ts [--model public/models/segformer-b0-ade/model.onnx] [--photos <dir>]
//
// Built-in cases: the real bedroom photograph (Unsplash) with its authored floor
// mask, and every rendered room's `original` with its exact floor coverage (rugs
// and furniture excluded, like ADE20K's floor class). `--photos <dir>` adds the
// owner's own photos: `<name>.jpg` plus an optional `<name>.mask.png` (white =
// floor); photos without a mask get the AI mask written next to them for review.
// Run on the same code the browser uses (src/lib/studio/photo/segment.ts).
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web';
import { floorMaskFromLogits, maskIoU, segformerInput, SEGFORMER } from '../src/lib/studio/photo/segment';
import type { PixelBuffer } from '../src/lib/studio/render/sampling';
import type { MaterialsConfig } from '../src/lib/data/types';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const MAX_EDGE = 2048;
async function loadPixels(path: string): Promise<PixelBuffer> {
  const img = sharp(path).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
async function maskAt(path: string, width: number, height: number, bounds?: readonly number[], full?: readonly [number, number]) {
  const out = new Uint8Array(width * height);
  if (bounds && full) {
    // Cropped scene mask → full scene size → the photo's (capped) size.
    const { data, info } = await sharp('public' + path.split('?')[0]).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    const [bx, by, bw] = bounds,
      scene = new Uint8Array(full[0] * full[1]);
    // Masks are stored either full-size or cropped to their bounds.
    if (info.width === full[0] && info.height === full[1]) scene.set(data);
    else for (let i = 0; i < data.length; i++) scene[(by + Math.floor(i / bw)) * full[0] + bx + (i % bw)] = data[i];
    const resized = await sharp(Buffer.from(scene), { raw: { width: full[0], height: full[1], channels: 1 } })
      .resize(width, height, { fit: 'fill' })
      .extractChannel(0)
      .raw()
      .toBuffer();
    out.set(resized);
    return out;
  }
  const { data } = await sharp(path).resize(width, height, { fit: 'fill' }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  out.set(data);
  return out;
}
interface Case {
  name: string;
  image: string;
  truth: () => Promise<Uint8Array | null>;
  pixels: PixelBuffer;
}
async function builtInCases(): Promise<Case[]> {
  const cases: Case[] = [];
  const photo = await loadPixels('brand/assets/scenes/bedroom-photo/base.png');
  const cal = JSON.parse(await readFile('brand/assets/scenes/bedroom-photo/calibration.json', 'utf8'));
  const floor = cal.scene.surfaces.find((s: { role: string }) => s.role === 'floor');
  cases.push({
    name: 'bedroom-photo (real photo)',
    image: 'brand/assets/scenes/bedroom-photo/base.png',
    pixels: photo,
    truth: async () => {
      const m = await sharp('brand/assets/scenes/bedroom-photo/floor-mask.png').extractChannel(0).raw().toBuffer({ resolveWithObject: true });
      const out = new Uint8Array(photo.width * photo.height);
      const [bx, by, bw, bh] = floor.mask.boundsPx;
      if (m.info.width === photo.width && m.info.height === photo.height) out.set(m.data);
      else for (let i = 0; i < bw * bh; i++) out[(by + Math.floor(i / bw)) * photo.width + bx + (i % bw)] = m.data[i];
      return out;
    },
  });
  const materials = JSON.parse(await readFile('brand/materials.json', 'utf8')) as MaterialsConfig;
  for (const scene of materials.scenes) {
    const f = scene.surfaces.find(s => s.role === 'floor');
    if (!f || !scene.original) continue;
    const pixels = await loadPixels('public' + scene.original.split('?')[0]);
    cases.push({
      name: `${scene.id} (render)`,
      image: scene.original,
      pixels,
      truth: () => maskAt(f.mask.alpha, pixels.width, pixels.height, f.mask.boundsPx, [scene.width, scene.height]),
    });
  }
  return cases;
}
async function ownerCases(dir: string): Promise<Case[]> {
  const files = (await readdir(dir)).filter(f => /\.(jpe?g|png|heic|webp)$/i.test(f) && !f.includes('.mask.') && !f.includes('.ai.'));
  return Promise.all(
    files.map(async f => {
      const pixels = await loadPixels(join(dir, f)),
        maskPath = join(dir, basename(f, extname(f)) + '.mask.png');
      return {
        name: f,
        image: join(dir, f),
        pixels,
        truth: async () =>
          access(maskPath).then(
            () => maskAt(maskPath, pixels.width, pixels.height),
            () => null,
          ),
      };
    }),
  );
}
async function main() {
  const modelPath = arg('--model') ?? 'public/models/segformer-b0-ade/model.onnx';
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(await readFile(modelPath), { executionProviders: ['wasm'] });
  const cases = [...(await builtInCases()), ...(arg('--photos') ? await ownerCases(arg('--photos')!) : [])];
  console.log(`Model ${modelPath} — ${cases.length} photos`);
  const scores: number[] = [];
  for (const c of cases) {
    const t0 = performance.now();
    const input = new ort.Tensor('float32', segformerInput(c.pixels), [1, 3, SEGFORMER.size, SEGFORMER.size]);
    const result = await session.run({ [session.inputNames[0]]: input });
    const logits = result[session.outputNames[0]].data as Float32Array;
    const t1 = performance.now();
    const mask = floorMaskFromLogits(logits, c.pixels);
    const t2 = performance.now();
    const truth = await c.truth();
    if (truth) {
      const iou = maskIoU(mask.data, truth);
      scores.push(iou);
      console.log(`${c.name.padEnd(34)} IoU ${(iou * 100).toFixed(1).padStart(5)} %   model ${(t1 - t0).toFixed(0)} ms, post ${(t2 - t1).toFixed(0)} ms`);
    } else {
      const out = c.image.replace(/\.[^.]+$/, '.ai.png');
      await sharp(Buffer.from(mask.data), { raw: { width: mask.width, height: mask.height, channels: 1 } }).png().toFile(out);
      console.log(`${c.name.padEnd(34)} no ground truth; AI mask written to ${out}`);
    }
  }
  if (scores.length) {
    const sorted = [...scores].sort((a, b) => a - b);
    console.log(
      `Mean IoU ${((scores.reduce((a, b) => a + b, 0) / scores.length) * 100).toFixed(1)} %, median ${(sorted[Math.floor(sorted.length / 2)] * 100).toFixed(1)} %, worst ${(sorted[0] * 100).toFixed(1)} %`,
    );
  }
  if (arg('--json')) await writeFile(arg('--json')!, JSON.stringify({ modelPath, scores }, null, 2));
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
