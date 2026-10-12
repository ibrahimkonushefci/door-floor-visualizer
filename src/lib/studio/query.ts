import type { StudioSelection } from '../data/types';
import type { StudioCatalog } from './types';
import { normalizeSelection } from './state';
export function serializeStudioQuery(s: StudioSelection) {
  return new URLSearchParams({
    v: '1',
    scene: s.sceneId,
    door: s.doorProductId,
    finish: s.doorFinishId,
    floor: s.floorProductId,
    frame: s.frameMode,
    skirting: s.skirtingMode,
    rot: String(s.floorRotationDeg),
  });
}
export function parseStudioQuery(p: URLSearchParams, c: StudioCatalog) {
  if (p.toString().length > 2048 || (p.has('v') && p.get('v') !== '1'))
    return { selection: c.materials.scenes[0].defaultSelection, warnings: ['query'] };
  const get = (key: string) => p.get(key) || undefined;
  return normalizeSelection(
    {
      version: 1,
      sceneId: get('scene'),
      doorProductId: get('door'),
      doorFinishId: get('finish'),
      floorProductId: get('floor'),
      frameMode: get('frame') as StudioSelection['frameMode'],
      skirtingMode: get('skirting') as StudioSelection['skirtingMode'],
      floorRotationDeg: p.has('rot') ? (Number(get('rot')) as 0 | 90) : undefined,
    },
    c,
  );
}
