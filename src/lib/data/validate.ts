import { solveHomography, projectPoint } from '../studio/render/homography';
import { compatibleDoor } from '../studio/compatibility';
import { normalizeSelection } from '../studio/state';
import { z } from 'zod';
import { brandSchema, productsSchema, materialsSchema } from './schemas';
import { validateMessages } from '../i18n/messages';
import { buildThemeVars } from '../brand/theme';
import type { SiteData } from './types';
const siteSchema = z.strictObject({
  brand: brandSchema,
  products: productsSchema,
  materials: materialsSchema,
});
function unique(values: readonly string[], path: string) {
  if (new Set(values).size !== values.length) throw new Error(`${path}: duplicate IDs`);
}
export function validateSiteData(input: unknown): SiteData {
  const data = siteSchema.parse(input);
  const { brand, products, materials } = data;
  validateMessages();
  buildThemeVars(brand);
  if (
    !brand.demoMode &&
    (brand.siteUrl === null || Object.values(brand.contact).some(v => !v || v === '+38344000000'))
  )
    throw new Error('brand: live mode requires verified contacts and public siteUrl');
  unique(
    products.products.map(p => p.id),
    'products',
  );
  unique(
    products.products.map(p => p.slug),
    'slugs',
  );
  unique(
    products.images.map(p => p.id),
    'images',
  );
  for (const [key, values] of Object.entries(materials))
    if (Array.isArray(values))
      unique(
        values.map(v => v.id),
        key,
      );
  const ids = new Set(products.products.map(p => p.id));
  const images = new Set(products.images.map(p => p.id));
  for (const p of products.products) {
    unique(p.imageIds, `${p.id}.imageIds`);
    for (const id of p.imageIds)
      if (!images.has(id)) throw new Error(`${p.id}: missing image ${id}`);
    for (const id of p.relatedProductIds)
      if (!ids.has(id) || id === p.id) throw new Error(`${p.id}: invalid related product ${id}`);
    if (p.kind === 'door')
      unique(
        p.sizes.map(s => s.id),
        `${p.id}.sizes`,
      );
    if (p.kind === 'floor' && !materials.floorCollections.some(c => c.id === p.collectionId))
      throw new Error(`${p.id}: missing collection`);
  }
  const scenes = new Set(materials.scenes.map(s => s.id));
  for (const p of products.products) {
    if (p.kind === 'door') {
      unique(p.finishIds, `${p.id}.finishIds`);
      if (!p.sizes.some(s => s.id === p.defaultSizeId) || !p.finishIds.includes(p.defaultFinishId))
        throw new Error(`${p.id}: invalid default size/finish`);
      for (const id of p.finishIds) {
        const f = materials.doorFinishes.find(f => f.id === id);
        if (!f) throw new Error(`${p.id}: unknown finish ${id}`);
        if ((p.doorType === 'glass') !== (f.kind === 'glass'))
          throw new Error('Glass/opaque finish mismatch');
      }
    }
    if (p.kind !== 'trim')
      for (const id of p.compatibleSceneIds)
        if (!scenes.has(id)) throw new Error(`${p.id}: unknown scene ${id}`);
    for (const id of p.imageIds) {
      const image = products.images.find(i => i.id === id)!;
      if (!image.source.startsWith(`brand/assets/products/${p.id}/`))
        throw new Error(`${p.id}: mismatched image source`);
    }
    if (p.published && p.imageIds.length === 0) throw new Error(`${p.id}: gallery incomplete`);
  }
  const catalog = { products: products.products, materials };
  for (const scene of materials.scenes) {
    unique(
      scene.surfaces.map(s => s.id),
      `${scene.id}.surfaces`,
    );
    if (scene.width !== 1600 || scene.height !== 1200)
      throw new Error('Wrong canonical scene dimensions');
    for (const id of scene.allowedDoorProductIds) {
      const p = products.products.find(p => p.id === id);
      if (p?.kind !== 'door' || !compatibleDoor(p, scene, catalog))
        throw new Error('Incompatible allowed door');
    }
    for (const id of scene.allowedFloorProductIds) {
      const p = products.products.find(p => p.id === id);
      if (p?.kind !== 'floor' || !p.compatibleSceneIds.includes(scene.id))
        throw new Error('Incompatible allowed floor');
    }
    if (
      scene.frameType === 'concealed-aluminium' &&
      (scene.surfaces.some(s => s.role === 'frame') || scene.allowedFrameModes.join() !== 'door')
    )
      throw new Error('Hidden frame must remain inert');
    const normal = normalizeSelection(scene.defaultSelection, catalog);
    if (normal.warnings.length || normal.selection.sceneId !== scene.id)
      throw new Error('Incompatible default selection');
    for (const surface of scene.surfaces) {
      const m = surface.mapping,
        h = solveHomography(m.worldQuadMm, m.imageQuad01);
      for (let i = 0; i < 2; i++) {
        const p = projectPoint(h, m.calibration.referenceWorldSegmentMm[i]),
          q = m.calibration.referenceImageSegment01[i];
        if (Math.hypot((p[0] - q[0]) * scene.width, (p[1] - q[1]) * scene.height) > 1)
          throw new Error('Calibration reference mismatch');
      }
    }
  }
  // Every localized field ships in all three languages; fallback is a safety net, not content.
  const translations = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => translations(v, `${path}[${i}]`));
      return;
    }
    const obj = value as Record<string, unknown>;
    if ('sq' in obj)
      for (const locale of ['sq', 'en', 'de'])
        if (typeof obj[locale] !== 'string' || !(obj[locale] as string).trim())
          throw new Error(`${path}.${locale}: missing translation`);
    for (const [k, v] of Object.entries(obj)) translations(v, `${path}.${k}`);
  };
  translations(data, 'data');
  validateMessages(true);
  return data;
}
