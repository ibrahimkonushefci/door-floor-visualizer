// Retired photo rooms (Phase 3): no longer in the Studio or published, but
// their calibrations stay in brand/assets/scenes/ as fixtures for the
// homography floor path and the all-glass door insert, which only these rooms
// exercise. Tests and the synthetic render fixture load them from here.
import { readFileSync } from 'node:fs';
import { calibrationSchema } from '../src/lib/data/schemas';
import type { RoomScene, SiteData } from '../src/lib/data/types';
import type { StudioCatalog } from '../src/lib/studio/types';
export const RETIRED_SCENES = ['living-standard', 'corridor-standard', 'bedroom-photo'] as const;
export type RetiredScene = (typeof RETIRED_SCENES)[number];
export function legacyScene(id: RetiredScene): RoomScene {
  const raw = JSON.parse(readFileSync(`brand/assets/scenes/${id}/calibration.json`, 'utf8'));
  return calibrationSchema.parse(raw).scene;
}
/** The live catalog plus the retired rooms, with products made compatible as the rooms allowed. */
export function legacyCatalog(data: SiteData): StudioCatalog {
  const scenes = RETIRED_SCENES.map(legacyScene);
  return {
    products: data.products.products.map(p =>
      p.kind === 'trim'
        ? p
        : {
            ...p,
            compatibleSceneIds: [
              ...p.compatibleSceneIds,
              ...scenes
                .filter(s => s.allowedDoorProductIds.includes(p.id) || s.allowedFloorProductIds.includes(p.id))
                .map(s => s.id),
            ],
          },
    ),
    materials: { ...data.materials, scenes: [...data.materials.scenes, ...scenes] },
  };
}
