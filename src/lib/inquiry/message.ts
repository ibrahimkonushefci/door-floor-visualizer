import { serializeStudioQuery } from '../studio/query';
import type { InquiryContext, InquiryData } from './types';
import type { Locale, RoomScene } from '../data/types';
import { sceneShowsFloor, sceneShowsSkirting } from '../studio/compatibility';
/** The slim scene list inquiries need (names, and what each room lets you change). */
export const inquiryScenes = (scenes: readonly RoomScene[]): InquiryData['scenes'] =>
  scenes.map(s => ({
    id: s.id,
    name: s.name,
    showsFloor: sceneShowsFloor(s),
    showsSkirting: sceneShowsSkirting(s),
    defaultModelId: s.doorModels?.[0]?.modelId ?? null,
  }));
import { localize } from '../i18n/localize';
import type { Messages } from '../i18n/messages';
import { formatDoorSize, formatFloorSpec } from '../i18n/format';
export function buildInquiryUrl(
  context: InquiryContext,
  data: InquiryData,
  locale: Locale,
  canonicalUrl: string,
): string {
  const url = new URL(canonicalUrl);
  if (context.kind === 'product') {
    const p = data.products.find(p => p.id === context.productId && p.published);
    if (!p) throw new Error('Unknown inquiry product');
    url.pathname = `/${locale}/products/${p.slug}/`;
    url.search = '';
    url.hash = '';
    if (p.kind === 'door') {
      const sizeId = context.sizeId || p.defaultSizeId;
      const finishId = context.finishId || p.defaultFinishId;
      if (sizeId !== p.defaultSizeId) url.searchParams.set('size', sizeId);
      if (finishId !== p.defaultFinishId) url.searchParams.set('finish', finishId);
    }
  }
  if (context.kind === 'studio') {
    url.pathname = `/${locale}/studio/`;
    url.search = serializeStudioQuery(context.selection).toString();
    url.hash = '';
  }
  return url.href;
}
export function buildInquiryMessage(
  context: InquiryContext,
  data: InquiryData,
  locale: Locale,
  canonicalUrl: string,
  m: Messages,
): string {
  const lines = [m['inquiry.catalog']];
  const addProduct = (id: string, sizeId?: string, finishId?: string) => {
    const p = data.products.find(p => p.id === id);
    if (!p) throw new Error(`Unknown inquiry product: ${id}`);
    lines.push(`${m['inquiry.product']}: ${localize(p.name, locale)} (${p.sku})`);
    if (p.kind === 'door') {
      const size = p.sizes.find(s => s.id === (sizeId || p.defaultSizeId));
      const finish = data.materials.doorFinishes.find(
        f => f.id === (finishId || p.defaultFinishId),
      );
      if (!size || !finish || !p.finishIds.includes(finish.id))
        throw new Error('Invalid inquiry variant');
      lines.push(
        `${m['inquiry.size']}: ${formatDoorSize(size, locale)}`,
        `${m['inquiry.finish']}: ${localize(finish.name, locale)}`,
      );
    }
    if (p.kind === 'floor') {
      const c = data.materials.floorCollections.find(c => c.id === p.collectionId);
      if (!c) throw new Error('Unknown collection');
      lines.push(formatFloorSpec(c, locale));
    }
  };
  if (context.kind === 'catalog') context.productIds.forEach(id => addProduct(id));
  if (context.kind === 'product') addProduct(context.productId, context.sizeId, context.finishId);
  if (context.kind === 'studio') {
    const s = context.selection;
    const scene = data.scenes.find(v => v.id === s.sceneId);
    if (!scene) throw new Error('Unknown inquiry scene');
    lines.push(`${m['inquiry.scene']}: ${localize(scene.name, locale)}`);
    addProduct(s.doorProductId, undefined, s.doorFinishId);
    const model = data.materials.doorModels.find(d => d.id === s.doorModelId);
    if (model) lines.push(`${m['studio.model']}: ${localize(model.name, locale)}`);
    // A tiled bathroom shows only the door: no floor, skirting or laying direction.
    const floor = scene.showsFloor;
    if (floor) addProduct(s.floorProductId);
    lines.push(
      `${m['inquiry.frame']}: ${model?.frameType === 'concealed-aluminium' ? m['studio.concealedFrame'] : m[`studio.mode.${s.frameMode}`]}`,
    );
    if (scene.showsSkirting) lines.push(`${m['inquiry.skirting']}: ${m[`studio.mode.${s.skirtingMode}`]}`);
    if (floor)
      lines.push(`${m['studio.direction']}: ${m[s.floorRotationDeg === 90 ? 'studio.lengthwise' : 'studio.crosswise']}`);
  }
  lines.push(buildInquiryUrl(context, data, locale, canonicalUrl));
  return lines.join('\n');
}
