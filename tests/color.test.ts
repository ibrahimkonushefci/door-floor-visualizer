import { it, expect } from 'vitest';
import { decode, encodeByte, srgbToLinear, linearToSrgb } from '../src/lib/studio/render/color';
import { shadeAt, shadeMaterial } from '../src/lib/studio/render/lighting';
it('roundtrips every byte within one byte', () => {
  for (let i = 0; i < 256; i++) expect(Math.abs(encodeByte(decode[i]) - i)).toBeLessThanOrEqual(1);
  expect(srgbToLinear(128 / 255)).toBeCloseTo(0.2158605, 6);
  expect(linearToSrgb(0.2158605) * 255).toBeCloseTo(128, 3);
});
it('half neutral shade gives92 not64, clamps and black reflection adds zero', () => {
  const a: [number, number, number] = [decode[128], decode[128], decode[128]];
  expect(encodeByte(shadeMaterial(a, 0.5, [0, 0, 0], 0.2)[0])).toBe(92);
  expect(shadeAt(0.6, 0.2)).toBe(1.65);
  expect(shadeAt(0.01, 0.2)).toBe(0.18);
  expect(shadeMaterial(a, 1, [0, 0, 0], 0.2)).toEqual(a);
  expect(() => shadeAt(1, 0)).toThrow();
  expect(() => shadeAt(NaN, 0.2)).toThrow();
});
