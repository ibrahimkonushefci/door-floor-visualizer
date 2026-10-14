// An own-room photo as a Studio scene: the photo is the base, the corrected
// mask is the floor, the perspective quad is its planar (homography) mapping and
// the photo's own low-frequency luminance is its lighting plate. It renders
// through the same kernel and controller as the showroom rooms (floors only).
import type { LocalizedText, Quad, RoomScene, StudioSelection } from '../../data/types';
import type { PreparedScene, StudioCatalog } from '../types';
import type { PixelBuffer } from '../render/sampling';
import type { FloorMask } from './segment';
import type { FloorPlane } from './perspective';
import type { PhotoPlate } from './lighting';

export const PHOTO_SCENE_ID = 'own-photo';
export const PHOTO_ROOM_NAME: LocalizedText = { sq: 'Dhoma juaj', en: 'Your room', de: 'Ihr Raum' };
/** Shade range of photo plates (as authored photo rooms; slightly deeper shadows allowed). */
export const PHOTO_SHADE: readonly [number, number] = [0.1, 1.65];

export interface PhotoSceneInput {
  photo: PixelBuffer;
  mask: FloorMask;
  plate: PhotoPlate;
  quad: Quad;
  plane: FloorPlane;
  /** Brightness of the new floor relative to the photo's light (1 = as measured). */
  light: number;
  /** Changes whenever pixels, mask, perspective or light change (cache key). */
  revision: number;
}

/** Floors a photo can show: every published floor (the visitor's own room has no rules). */
export const photoFloorIds = (catalog: StudioCatalog) =>
  catalog.products.filter(p => p.kind === 'floor' && p.published).map(p => p.id);

export function photoSelection(catalog: StudioCatalog, floorProductId: string, rotation: 0 | 90): StudioSelection {
  // A door is required by the selection type; the photo has no door surface.
  const base = catalog.materials.scenes[0].defaultSelection;
  return { ...base, sceneId: PHOTO_SCENE_ID, floorProductId, floorRotationDeg: rotation };
}

export function photoSceneDefinition(input: PhotoSceneInput, catalog: StudioCatalog, floorProductId: string): RoomScene {
  const { photo, plate, quad, plane } = input,
    W = photo.width,
    H = photo.height,
    near: [readonly [number, number], readonly [number, number]] = [quad[3], quad[2]],
    nearMm: [readonly [number, number], readonly [number, number]] = [plane.worldQuadMm[3], plane.worldQuadMm[2]];
  const selection = photoSelection(catalog, floorProductId, 0);
  return {
    id: PHOTO_SCENE_ID,
    name: PHOTO_ROOM_NAME,
    description: PHOTO_ROOM_NAME,
    width: W,
    height: H,
    base: '',
    thumbnail: '',
    fallback: '',
    frameType: 'standard-casing',
    depictedDoorSizeMm: { width: 900, height: 2000 },
    surfaces: [
      {
        id: 'floor',
        role: 'floor',
        mask: { alpha: '', boundsPx: plate.bounds },
        lighting: {
          diffuse: '',
          baselineLinear: plate.baselineLinear / input.light,
          shadeMin: PHOTO_SHADE[0],
          shadeMax: PHOTO_SHADE[1],
          specular: null,
          specularIncludedInDiffuse: false,
        },
        mapping: {
          worldQuadMm: plane.worldQuadMm,
          imageQuad01: quad,
          calibration: {
            method: 'authored-reference',
            note: 'Own-room photo: corners set by the visitor, scale from an assumed camera height.',
            referenceLengthMm: Math.hypot(nearMm[1][0] - nearMm[0][0], nearMm[1][1] - nearMm[0][1]),
            referenceImageSegment01: near,
            referenceWorldSegmentMm: nearMm,
          },
        },
        uvRotationDeg: 0,
      },
    ],
    protectedMask: { alpha: '', boundsPx: [0, 0, W, H] },
    foreground: null,
    doorInserts: [],
    allowedDoorProductIds: [selection.doorProductId],
    allowedFloorProductIds: photoFloorIds(catalog),
    allowedFrameModes: ['door'],
    allowedSkirtingModes: ['door'],
    defaultSelection: selection,
    assetRevision: `photo-${input.revision}`,
  };
}

/** The prepared form the renderer works on (no network: everything is in memory). */
export function preparePhotoScene(input: PhotoSceneInput, definition: RoomScene): PreparedScene {
  const { photo, mask, plate, plane } = input,
    [bx, by, bw, bh] = plate.bounds,
    cropped = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++)
    cropped.set(mask.data.subarray((by + y) * mask.width + bx, (by + y) * mask.width + bx + bw), y * bw);
  return {
    scene: definition,
    base: photo,
    surfaces: [
      {
        definition: definition.surfaces[0],
        inverse: plane.toWorld,
        mask: cropped,
        diffuse: plate.diffuse,
        specular: null,
        bounds: plate.bounds,
        baseline: plate.baselineLinear / input.light,
      },
    ],
    protectedMask: new Uint8Array(photo.width * photo.height),
    foreground: null,
    inserts: new Map(),
    insertMasks: new Map(),
    reveal: null,
    scale: 1,
  };
}

/**
 * A catalog whose only room is the current photo scene. The render controller
 * looks the room up on every render, so a new revision (edited mask, moved
 * corner, light) re-prepares the scene without a new controller.
 */
export function photoCatalog(catalog: StudioCatalog, current: () => RoomScene | null): StudioCatalog {
  const materials = catalog.materials;
  return {
    products: catalog.products,
    materials: {
      schemaVersion: materials.schemaVersion,
      doorModels: materials.doorModels,
      doorFinishes: materials.doorFinishes,
      floorCollections: materials.floorCollections,
      get scenes() {
        const scene = current();
        return scene ? [scene] : [];
      },
    },
  };
}
