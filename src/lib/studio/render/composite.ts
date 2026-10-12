import type { RGB } from '../../data/types';
import { clamp } from './color';
export function compositePixel(base: RGB, layers: readonly { rgb: RGB; coverage: number }[]): RGB {
  const total = layers.reduce((n, l) => n + l.coverage, 0);
  if (total > 1 + 1 / 255 || layers.some(l => l.coverage < 0 || !Number.isFinite(l.coverage)))
    throw new Error('Composite: overlapping/invalid masks');
  const factor = total > 1 ? 1 / total : 1;
  return base.map((v, i) =>
    clamp(
      v * (1 - Math.min(1, total)) + layers.reduce((n, l) => n + l.rgb[i] * l.coverage * factor, 0),
    ),
  ) as unknown as RGB;
}
