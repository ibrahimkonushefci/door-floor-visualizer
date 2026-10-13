import type { RGB } from '../../data/types';
import { clamp } from './color';
export function shadeAt(y: number, baseline: number, min = 0.18, max = 1.65) {
  if (!Number.isFinite(y) || !Number.isFinite(baseline) || baseline <= 0.02)
    throw new Error('Lighting: invalid baseline/luminance');
  return clamp(y / baseline, min, max);
}
// Highlight shoulder shared with tools/blender/render_layers.py (tone()): linear
// below k, then an exponential roll-off towards 1 instead of a hard clip.
export function toneShoulder(x: number, k: number) {
  return x <= k ? Math.max(0, x) : k + (1 - k) * (1 - Math.exp(-(x - k) / (1 - k)));
}
export function shadeMaterial(a: RGB, shade: number, specular: RGB, strength: number): RGB {
  return a.map((v, i) => clamp(v * shade + specular[i] * strength)) as unknown as RGB;
}
