import type { RGB } from '../../data/types';
import { clamp } from './color';
export function shadeAt(y: number, baseline: number) {
  if (!Number.isFinite(y) || !Number.isFinite(baseline) || baseline <= 0.02)
    throw new Error('Lighting: invalid baseline/luminance');
  return clamp(y / baseline, 0.18, 1.65);
}
export function shadeMaterial(a: RGB, shade: number, specular: RGB, strength: number): RGB {
  return a.map((v, i) => clamp(v * shade + specular[i] * strength)) as unknown as RGB;
}
