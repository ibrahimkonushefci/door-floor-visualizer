import { readFile, writeFile } from 'node:fs/promises';
import { loadSiteData } from '../src/lib/data/load';
import {
  prepareSceneWith,
  createMaterialLoader,
  TEXTURE_CACHE_BYTES,
  TEXTURE_MAX_EDGE,
} from '../src/lib/studio/asset-loader';
import { MAX_FRAME_WIDTH, MAX_RENDERED_FRAME_WIDTH } from '../src/lib/studio/presentation';
import { RESULT_CACHE_BYTES } from '../src/lib/studio/render-controller';
import budgets from '../verification/budgets.json';
const frameBytesFor = (width: number) => width * ((width * 3) / 4) * 4;
import { decodeNode, bytesNode } from './prepare-scenes';
const data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials },
  signal = new AbortController().signal,
  results = [];
const textureBytes = (m: Awaited<ReturnType<ReturnType<typeof createMaterialLoader>['prepare']>>) =>
  [...m.textures.values(), ...(m.sheets?.values() ?? [])].reduce(
    (n, chain) => n + chain.reduce((a, t) => a + t.data.byteLength, 0),
    0,
  );
// Rendered scenes are profiled twice: full resolution (frames up to 2400 px,
// laptop/PC) against their own explicit bound, and the half-resolution variant
// every frame of 1200 px or less uses (phones) against the general bound.
const variants = (rendered: boolean) =>
  rendered
    ? [
        { variant: 'full', scale: 1, maxFrame: MAX_RENDERED_FRAME_WIDTH, limit: budgets.ownedRenderBuffersRenderedFull },
        { variant: 'light', scale: 0.5, maxFrame: MAX_RENDERED_FRAME_WIDTH / 2, limit: budgets.ownedRenderBuffers },
      ]
    : [{ variant: 'full', scale: 1, maxFrame: MAX_FRAME_WIDTH, limit: budgets.ownedRenderBuffers }];
for (const definition of data.materials.scenes)
for (const { variant, scale, maxFrame, limit } of variants(!!definition.render)) {
  const frameBytes = frameBytesFor(maxFrame),
    W = Math.round(definition.width * scale),
    H = Math.round(definition.height * scale);
  const scene = await prepareSceneWith(definition, signal, decodeNode, {
      loadBytes: bytesNode,
      scale,
    }),
    loader = createMaterialLoader(decodeNode);
  let maxActiveMaterials = 0;
  for (const doorProductId of definition.allowedDoorProductIds) {
    const p = data.products.products.find(p => p.id === doorProductId)!;
    if (p.kind !== 'door') throw Error('door');
    for (const doorFinishId of p.finishIds)
      for (const floorProductId of definition.allowedFloorProductIds) {
        const materials = await loader.prepare(
          { ...definition.defaultSelection, doorProductId, doorFinishId, floorProductId },
          catalog,
          signal,
        );
        maxActiveMaterials = Math.max(maxActiveMaterials, textureBytes(materials));
      }
  }
  const sceneBytes =
    scene.base.data.byteLength +
    scene.protectedMask.byteLength +
    scene.surfaces.reduce(
      (n, s) =>
        n +
        s.mask.byteLength +
        s.diffuse.byteLength +
        (s.specular?.data.byteLength || 0) +
        (s.position?.data.byteLength || 0),
      0,
    ) +
    [...scene.inserts.values()].reduce((n, i) => n + i.data.byteLength, 0) +
    [...scene.insertMasks.values()].reduce(
      (n, i) => n + i.replacement.byteLength + i.protected.byteLength,
      0,
    ) +
    (scene.foreground?.data.byteLength || 0);
  const mask = scene.surfaces.find(s => s.definition.role === 'floor')!,
    [bx, by, w, h] = mask.bounds;
  let coverage = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      coverage +=
        (mask.mask[y * w + x] / 255) *
        (definition.render ? 1 : 1 - scene.protectedMask[(y + by) * W + x + bx] / 255);
  const budget = {
    controllerAndWorkerScene: sceneBytes * 2,
    controllerTextureCache: TEXTURE_CACHE_BYTES,
    twoWorkerMaterialSets: maxActiveMaterials * 2,
    resultCache: RESULT_CACHE_BYTES,
    incomingMipBuild: maxActiveMaterials,
    fourTransientFrames: 4 * frameBytes,
    threeMaterialDecodeBuffers: 3 * TEXTURE_MAX_EDGE * 512 * 4,
    displayedAndPreviousFallbackImages: W * H * 4 + 960 * 720 * 4,
    // A door-model switch builds the next scene while the previous one is still held.
    doorModelSwitch: definition.doorModels ? sceneBytes : 0,
  };
  const scenePreparationBytes = sceneBytes + TEXTURE_CACHE_BYTES + 3 * W * H * 4 + 960 * 720 * 4;
  const total = Math.max(
    scenePreparationBytes,
    Object.values(budget).reduce((n, b) => n + b, 0),
  );
  if (total > limit) {
    console.error(definition.id, variant, budget, { sceneBytes, scenePreparationBytes, total });
    throw Error(`Owned allocation bound ${definition.id} (${variant}): ${total} > ${limit}`);
  }
  const defaultMat = await loader.prepare(definition.defaultSelection, catalog, signal);
  const sourcePaths = new Set([
    definition.base,
    definition.protectedMask.alpha,
    ...definition.surfaces.flatMap(s => [
      s.mask.alpha,
      s.lighting.diffuse,
      ...(s.lighting.specular ? [s.lighting.specular] : []),
      ...(s.positionMap ? [s.positionMap.image] : []),
    ]),
    ...defaultMat.textures.keys(),
    ...(defaultMat.sheets?.keys() ?? []),
  ]);
  let firstUsefulBytes = 0;
  for (const path of sourcePaths) firstUsefulBytes += (await readFile('public' + path)).length;
  const leaf = definition.surfaces.find(s => s.role === 'door-leaf')!.mask.boundsPx;
  results.push({
    scene: definition.id,
    variant,
    editableFloorPercent: (coverage / (W * H)) * 100,
    doorLeafHeightPercent: (leaf[3] / definition.height) * 100,
    doorWithCasingHeightPercent:
      ((Math.max(
        ...definition.surfaces
          .filter(s => s.role === 'frame')
          .map(s => s.mask.boundsPx[1] + s.mask.boundsPx[3]),
      ) -
        Math.min(
          ...definition.surfaces.filter(s => s.role === 'frame').map(s => s.mask.boundsPx[1]),
        )) /
        definition.height) *
      100,
    firstUsefulBytes,
    firstUsefulTargetBytes: 2.5 * 1024 * 1024,
    ownedBytes: total,
    ownedLimitBytes: limit,
    scenePreparationBytes,
    budget,
  });
  loader.clear();
}
await writeFile(
  'verification/render-fixtures/p4-remediation-assets.json',
  JSON.stringify(
    {
      note: 'Conservative controlled pixel-storage bound, not a browser heap measurement. Rendering includes both scene copies (plus a third while a door-model switch builds the next scene), maximum cache limits, two worker material sets, incoming mip chains, four output/presentation buffers, bitmap/canvas/JS material decode buffers and displayed/previous fallback images. Scene preparation is separately bounded: the old worker/scene/result cache are released before three full-resolution decode buffers coexist with the new scene. Browser overhead, retained browser image caches and garbage-collection timing still require a physical heap profile. Runtime textures max512px; physical-scale calibration unresolved.',
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(results);
