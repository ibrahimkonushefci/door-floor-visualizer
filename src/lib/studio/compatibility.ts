import type { DoorProduct, RoomScene, StudioSelection } from '../data/types';
import type { StudioCatalog } from './types';
import { sceneModelIds } from './door-models';
/** Door models of a product that this scene can show. */
export function doorModelsIn(p: DoorProduct, scene: RoomScene) {
  const shown = sceneModelIds(scene);
  return p.modelIds.filter(id => shown.includes(id));
}
/** Rooms without laminate (a tiled bathroom) have no floor or skirting to change. */
export const sceneShowsFloor = (scene: RoomScene) => scene.surfaces.some(s => s.role === 'floor');
export const sceneShowsSkirting = (scene: RoomScene) => scene.surfaces.some(s => s.role === 'skirting');
export function compatibleDoor(p: DoorProduct, scene: RoomScene, c: StudioCatalog) {
  return (
    p.published &&
    p.compatibleSceneIds.includes(scene.id) &&
    scene.allowedDoorProductIds.includes(p.id) &&
    ((p.doorType !== 'glass' && doorModelsIn(p, scene).length > 0) ||
      (p.doorType === 'glass' &&
        scene.doorInserts.some(i =>
          c.materials.doorFinishes.some(
            f => f.kind === 'glass' && p.finishIds.includes(f.id) && f.variantKey === i.variantKey,
          ),
        )))
  );
}
export function selectionEqual(a: StudioSelection | null, b: StudioSelection | null) {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}
