import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { calibrationSchema, materialsSchema } from '../src/lib/data/schemas';
import { srgbToLinear } from '../src/lib/studio/render/color';
import { solveHomography, projectPoint } from '../src/lib/studio/render/homography';
import { prepareSceneWith, prepareMaterialsWith } from '../src/lib/studio/asset-loader';
import { renderRows } from '../src/lib/studio/render/kernel';
import type { PixelBuffer } from '../src/lib/studio/render/sampling';
import type { StudioCatalog } from '../src/lib/studio/types';
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export async function decodeNode(
  path: string,
  _signal: AbortSignal,
  maxEdge?: number,
): Promise<PixelBuffer> {
  let img = sharp('public' + path.split('?')[0]);
  const meta = await img.metadata();
  if (maxEdge && Math.max(meta.width!, meta.height!) > maxEdge)
    img = img.resize({ width: maxEdge, height: maxEdge, fit: 'inside' });
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}
export async function prepareScenes(check = false) {
  const raw = JSON.parse(await readFile('brand/materials.json', 'utf8'));
  const products = JSON.parse(await readFile('brand/products.json', 'utf8')).products;
  const scenes = [];
  const manifest: {
    schemaVersion: 1;
    assets: {
      source: string;
      output: string;
      sha256: string;
      sourceSha256: string;
      bytes: number;
      width?: number;
      height?: number;
    }[];
    calibrationStatus: string;
  } = {
    schemaVersion: 1,
    assets: [],
    calibrationStatus: 'virtual-authoring; independent metric reference pending',
  };
  async function output(
    source: string,
    target: string,
    transform?: (b: Buffer) => Promise<Buffer>,
  ) {
    const b = await readFile(source),
      out = transform ? await transform(b) : b;
    if (check) {
      const existing = await readFile('public' + target);
      if (hash(existing) !== hash(out)) throw new Error(`Scene output drift ${target}`);
    } else {
      await mkdir(('public' + target).slice(0, ('public' + target).lastIndexOf('/')), {
        recursive: true,
      });
      if (transform) await writeFile('public' + target, out);
      else await copyFile(source, 'public' + target);
    }
    const meta = await sharp(out).metadata();
    manifest.assets.push({
      source,
      output: target,
      sha256: hash(out),
      sourceSha256: hash(b),
      bytes: out.length,
      width: meta.width,
      height: meta.height,
    });
  }
  for (const id of ['living-standard', 'corridor-standard']) {
    const dir = `brand/assets/scenes/${id}`,
      calBytes = await readFile(dir + '/calibration.json'),
      cal = calibrationSchema.parse(JSON.parse(calBytes.toString())),
      s = cal.scene;
    const entries = (await readdir(dir)).filter(f => f.endsWith('.png')).sort();
    const revision = createHash('sha256');
    revision.update(calBytes);
    for (const file of entries) revision.update(await readFile(dir + '/' + file));
    s.assetRevision = revision.digest('hex');
    if (s.width !== 1600 || s.height !== 1200) throw new Error('Canonical scene must be 1600×1200');
    for (const surface of s.surfaces) {
      const patch = cal.neutralPatches.find(p => p.surfaceId === surface.id);
      if (!patch || Math.abs(patch.medianLinear - surface.lighting.baselineLinear) > 1e-6)
        throw new Error(`Missing/mismatched neutral patch ${surface.id}`);
      const plate = await sharp(dir + '/' + surface.lighting.diffuse.split('/').at(-1))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (plate.info.width !== 1600 || plate.info.height !== 1200)
        throw new Error('Invalid diffuse dimensions');
      for (let i = 0; i < plate.data.length; i += 4)
        if (
          plate.data[i] !== plate.data[i + 1] ||
          plate.data[i] !== plate.data[i + 2] ||
          plate.data[i + 3] !== 255
        )
          throw new Error('Diffuse must be opaque grayscale');
      const poly = patch.polygon01,
        values: number[] = [];
      const minX = Math.max(0, Math.floor(Math.min(...poly.map(p => p[0])) * 1600)),
        maxX = Math.min(1599, Math.ceil(Math.max(...poly.map(p => p[0])) * 1600)),
        minY = Math.max(0, Math.floor(Math.min(...poly.map(p => p[1])) * 1200)),
        maxY = Math.min(1199, Math.ceil(Math.max(...poly.map(p => p[1])) * 1200));
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i],
              b = poly[j],
              px = (x + 0.5) / 1600,
              py = (y + 0.5) / 1200;
            if (
              a[1] > py !== b[1] > py &&
              px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]
            )
              inside = !inside;
          }
          if (inside) values.push(srgbToLinear(plate.data[(y * 1600 + x) * 4] / 255));
        }
      values.sort((a, b) => a - b);
      if (!values.length) throw new Error('Empty neutral patch');
      const median =
        values.length % 2
          ? values[(values.length - 1) / 2]
          : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
      if (Math.abs(median - patch.medianLinear) > 1e-6)
        throw new Error(`Neutral patch measurement drift ${surface.id}`);
      if (!cal.references.some(r => r.planeSurfaceId === surface.id))
        throw new Error(`Missing plane reference ${surface.id}`);
      const m = surface.mapping,
        h = solveHomography(m.worldQuadMm, m.imageQuad01);
      m.worldQuadMm.forEach((p, i) => {
        const q = projectPoint(h, p);
        if (Math.hypot(q[0] - m.imageQuad01[i][0], q[1] - m.imageQuad01[i][1]) > 1e-6)
          throw new Error('Corner reprojection failed');
      });
      for (let i = 0; i < 2; i++) {
        const p = projectPoint(h, m.calibration.referenceWorldSegmentMm[i]),
          q = m.calibration.referenceImageSegment01[i];
        if (Math.hypot((p[0] - q[0]) * 1600, (p[1] - q[1]) * 1200) > 1)
          throw new Error('Calibration reference reprojection failed');
      }
    }
    const masks = [];
    const maskDefs = [
      s.protectedMask,
      ...s.surfaces.map(t => t.mask),
      ...s.doorInserts.flatMap(t => [t.replacementMask, t.protectedMask]),
    ];
    for (const def of maskDefs) {
      const file = dir + '/' + def.alpha.split('/').at(-1),
        p = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (p.info.width !== 1600 || p.info.height !== 1200)
        throw new Error(`Wrong mask dimensions ${file}`);
      let minX = 1600,
        minY = 1200,
        maxX = -1,
        maxY = -1;
      for (let i = 0; i < p.data.length; i += 4) {
        if (p.data[i] !== p.data[i + 1] || p.data[i] !== p.data[i + 2] || p.data[i + 3] !== 255)
          throw new Error(`Mask alpha/channel convention ${file}`);
        if (p.data[i]) {
          const x = (i / 4) % 1600,
            y = Math.floor(i / 4 / 1600);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      const bounds = maxX < 0 ? [0, 0, 1600, 1200] : [minX, minY, maxX - minX + 1, maxY - minY + 1];
      if (JSON.stringify(bounds) !== JSON.stringify(def.boundsPx))
        throw new Error(`Mask bounds mismatch ${file}: ${bounds}`);
      masks.push(p.data);
    }
    for (let i = 0; i < 1600 * 1200; i++) {
      let sum = 0;
      for (let n = 1; n <= s.surfaces.length; n++) sum += masks[n][i * 4];
      if (sum > 256)
        throw new Error(`Surface overlap at ${i % 1600},${Math.floor(i / 1600)}: ${sum}`);
    }
    // Protection deliberately cuts fixed hardware from leaf coverage in kernel; geometric masks retain surface edges.
    for (const file of entries.filter(f => f !== 'glass-source.png')) {
      const meta = await sharp(dir + '/' + file).metadata();
      if (file !== 'thumbnail.png' && (meta.width !== 1600 || meta.height !== 1200))
        throw new Error('Wrong canonical layer dimensions');
      if (file === 'base.png')
        await output(dir + '/' + file, s.base, b => sharp(b).webp({ quality: 90 }).toBuffer());
      else if (file === 'thumbnail.png')
        await output(dir + '/' + file, s.thumbnail, b =>
          sharp(b).resize(320, 240).webp({ quality: 80 }).toBuffer(),
        );
      else await output(dir + '/' + file, `/media/scenes/${id}/${file}`);
    }
    scenes.push(s);
  }
  // Export compact lossless WebP runtime textures. Physical repeat dimensions
  // remain unchanged; repeatPixels records the actual derivative dimensions.
  for (const group of ['doors', 'floors']) {
    const dir = `brand/assets/textures/${group}`;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const files = entry.isDirectory() ? await readdir(dir + '/' + entry.name) : [entry.name];
      for (const file of files) {
        const source = entry.isDirectory() ? `${dir}/${entry.name}/${file}` : `${dir}/${file}`,
          target = entry.isDirectory()
            ? `/media/textures/${group}/${entry.name}/${file.replace('.png', '.webp')}`
            : `/media/textures/${group}/${file.replace('.png', '.webp')}`;
        const atlas =
          group === 'floors' && file === 'atlas.png'
            ? raw.floorCollections.find((c: { id: string }) => c.id === entry.name).atlas
            : null;
        await output(source, target, b =>
          atlas
            ? sharp(b)
                .resize(atlas.repeatPixels[0], atlas.repeatPixels[1])
                .webp({ lossless: true })
                .toBuffer()
            : sharp(b)
                .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
                .webp({ lossless: true })
                .toBuffer(),
        );
      }
    }
  }
  const materials = materialsSchema.parse({ ...raw, scenes });
  if (check) {
    if (JSON.stringify(raw.scenes) !== JSON.stringify(scenes))
      throw new Error('Generated scene entries drift from authoritative calibration');
  } else await writeFile('brand/materials.json', JSON.stringify(materials, null, 2) + '\n');
  const catalog: StudioCatalog = { products, materials };
  const signal = new AbortController().signal;
  for (const s of scenes) {
    const scene = await prepareSceneWith(s, signal, decodeNode),
      mat = await prepareMaterialsWith(s.defaultSelection, catalog, signal, decodeNode);
    const pixels = { width: 960, height: 720, data: new Uint8ClampedArray(960 * 720 * 4) };
    renderRows(
      {
        id: 1,
        selection: s.defaultSelection,
        width: 960,
        height: 720,
        quality: 'settled',
        rendererVersion: 1,
      },
      scene,
      mat,
      pixels,
      0,
      720,
    );
    const b = await sharp(pixels.data, { raw: { width: 960, height: 720, channels: 4 } })
      .webp({ quality: 85 })
      .toBuffer();
    if (b.length > 220 * 1024) throw new Error('Fallback byte budget');
    if (check) {
      if (hash(await readFile('public' + s.fallback)) !== hash(b))
        throw new Error('Fallback drift');
    } else await writeFile('public' + s.fallback, b);
    manifest.assets.push({
      source: `brand/assets/scenes/${s.id}/calibration.json`,
      output: s.fallback,
      sha256: hash(b),
      sourceSha256: hash(await readFile(`brand/assets/scenes/${s.id}/calibration.json`)),
      bytes: b.length,
      width: 960,
      height: 720,
    });
  }
  if (check) {
    const existing = JSON.parse(await readFile('verification/scene-manifest.json', 'utf8'));
    if (JSON.stringify(existing) !== JSON.stringify(manifest))
      throw new Error('Scene manifest drift');
  } else
    await writeFile('verification/scene-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  return {
    scenes: scenes.length,
    assets: manifest.assets.length,
    bytes: manifest.assets.reduce((n, a) => n + a.bytes, 0),
    calibrationStatus: manifest.calibrationStatus,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log('Scenes prepared:', await prepareScenes(process.argv.includes('--check')));
