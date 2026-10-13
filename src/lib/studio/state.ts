import type { StudioSelection, Locale } from '../data/types';
import type { StudioCatalog, StudioAction } from './types';
import { compatibleDoor, doorModelsIn } from './compatibility';
import { allowedFrameModes } from './door-models';
import { localize } from '../i18n/messages';
export const isGlass = (finishId: string, catalog: StudioCatalog) =>
  catalog.materials.doorFinishes.find(f => f.id === finishId)?.kind === 'glass';
export function normalizeSelection(candidate: Partial<StudioSelection>, catalog: StudioCatalog) {
  const warnings: string[] = [];
  const scene =
    catalog.materials.scenes.find(s => s.id === candidate.sceneId) || catalog.materials.scenes[0];
  if (!scene) throw new Error('Studio: no scenes');
  if (candidate.version !== undefined && candidate.version !== 1)
    return { selection: scene.defaultSelection, warnings: ['version'] };
  const d = scene.defaultSelection;
  const door = catalog.products.find(
    p => p.id === candidate.doorProductId && p.kind === 'door' && compatibleDoor(p, scene, catalog),
  );
  const p = door?.kind === 'door' ? door : catalog.products.find(p => p.id === d.doorProductId)!;
  if (p.kind !== 'door') throw new Error('Studio: invalid default door');
  const floor = catalog.products.find(
    p =>
      p.id === candidate.floorProductId &&
      p.kind === 'floor' &&
      p.published &&
      p.compatibleSceneIds.includes(scene.id) &&
      scene.allowedFloorProductIds.includes(p.id),
  );
  const finish =
    catalog.materials.doorFinishes.find(
      f => f.id === candidate.doorFinishId && p.finishIds.includes(f.id),
    ) || catalog.materials.doorFinishes.find(f => f.id === p.defaultFinishId)!;
  const models = doorModelsIn(p, scene),
    model =
      candidate.doorModelId && models.includes(candidate.doorModelId)
        ? candidate.doorModelId
        : models.includes(p.defaultModelId)
          ? p.defaultModelId
          : models[0];
  const frameModes =
    finish.kind === 'glass'
      ? scene.doorInserts.find(i => i.variantKey === finish.variantKey)!.allowedFrameModes
      : allowedFrameModes(scene, model);
  const selection: StudioSelection = {
    version: 1,
    sceneId: scene.id,
    doorProductId: p.id,
    doorModelId: model,
    doorFinishId: finish.id,
    floorProductId: floor?.id || d.floorProductId,
    frameMode:
      candidate.frameMode && frameModes.includes(candidate.frameMode)
        ? candidate.frameMode
        : frameModes[0],
    skirtingMode:
      candidate.skirtingMode && scene.allowedSkirtingModes.includes(candidate.skirtingMode)
        ? candidate.skirtingMode
        : d.skirtingMode,
    floorRotationDeg: candidate.floorRotationDeg === 90 ? 90 : 0,
  };
  for (const k of Object.keys(selection) as (keyof StudioSelection)[])
    if (candidate[k] !== undefined && candidate[k] !== selection[k]) warnings.push(k);
  return { selection, warnings };
}
export function reduceSelection(s: StudioSelection, a: StudioAction, c: StudioCatalog) {
  const scene = c.materials.scenes.find(v => v.id === s.sceneId)!;
  switch (a.type) {
    case 'restore':
      return normalizeSelection(a.selection, c).selection;
    case 'reset':
      return scene.defaultSelection;
    case 'scene':
      return normalizeSelection({ ...s, sceneId: a.sceneId }, c).selection;
    case 'door':
      return normalizeSelection(
        {
          ...s,
          doorProductId: a.productId,
          doorModelId: a.modelId ?? s.doorModelId,
          doorFinishId: a.finishId,
          frameMode: isGlass(a.finishId, c) ? 'black' : isGlass(s.doorFinishId, c) ? 'door' : s.frameMode,
        },
        c,
      ).selection;
    case 'floor':
      return normalizeSelection({ ...s, floorProductId: a.productId }, c).selection;
    case 'frame':
      return normalizeSelection({ ...s, frameMode: a.mode }, c).selection;
    case 'skirting':
      return normalizeSelection({ ...s, skirtingMode: a.mode }, c).selection;
    case 'rotate':
      return { ...s, floorRotationDeg: a.degrees };
  }
}
export function buildCombinationTitle(s: StudioSelection, c: StudioCatalog, l: Locale) {
  const door = c.products.find(p => p.id === s.doorProductId)!,
    model = c.materials.doorModels.find(m => m.id === s.doorModelId),
    finish = c.materials.doorFinishes.find(f => f.id === s.doorFinishId)!,
    floor = c.products.find(p => p.id === s.floorProductId)!;
  return `${localize(door.name, l)}${model ? ` (${localize(model.name, l)})` : ''} · ${localize(finish.name, l)} + ${localize(floor.name, l)}`;
}
