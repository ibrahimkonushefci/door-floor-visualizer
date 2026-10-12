import manifest from '../../../verification/scene-manifest.json';
import { withAssetRevision } from '../media/paths';
import type { MaterialsConfig } from '../data/types';
// Build-only: keep authoritative calibration JSON bare, revision every runtime byte asset.
export function revisionStudioAssets(materials: MaterialsConfig): MaterialsConfig {
  const result = structuredClone(materials),
    hashes = new Map(manifest.assets.map(a => [a.output, a.sha256]));
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(object)) {
      if (typeof item === 'string' && item.startsWith('/media/')) {
        const hash = hashes.get(item);
        if (!hash) throw new Error(`Missing Studio asset revision: ${item}`);
        object[key] = withAssetRevision(item, hash);
      } else visit(item);
    }
  };
  visit(result);
  return result;
}
