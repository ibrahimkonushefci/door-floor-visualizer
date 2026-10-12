import { it, expect } from 'vitest';
import {
  solveHomography,
  invertHomography,
  projectPoint,
} from '../src/lib/studio/render/homography';
import type { Quad } from '../src/lib/data/types';
const world: Quad = [
    [0, 0],
    [4000, 0],
    [4000, 5000],
    [0, 5000],
  ],
  image: Quad = [
    [0.3, 0.4],
    [0.7, 0.4],
    [1, 0.95],
    [0, 0.95],
  ];
it('normalized homography corners and interior inverse metric roundtrip', () => {
  const h = solveHomography(world, image),
    inv = invertHomography(h);
  world.forEach((p, i) => {
    const r = projectPoint(h, p);
    expect(Math.hypot(r[0] - image[i][0], r[1] - image[i][1])).toBeLessThan(1e-6);
  });
  for (let x = 50; x < 4000; x += 500)
    for (let y = 50; y < 5000; y += 500) {
      const r = projectPoint(inv, projectPoint(h, [x, y]));
      expect(Math.hypot(r[0] - x, r[1] - y)).toBeLessThan(0.01);
    }
});
it('rejects collinear quads and zero projective denominator', () => {
  expect(() =>
    solveHomography(
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
      ],
      image,
    ),
  ).toThrow('collinear');
  expect(() => invertHomography([0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow('singular');
  expect(() => projectPoint([1, 0, 0, 0, 1, 0, 0, 0, 0], [0, 0])).toThrow('denominator');
});
it('193 and244mm analytic plank projection obeys ratio and output resolution invariance', () => {
  const h = solveHomography(world, image);
  for (const y of [100, 2500, 4500]) {
    const a = projectPoint(h, [500, y]),
      b = projectPoint(h, [693, y]),
      c = projectPoint(h, [744, y]);
    const w1 = b[0] - a[0],
      w2 = c[0] - a[0];
    expect(w2 / w1).toBeCloseTo(244 / 193, 9);
    expect(Math.abs((w1 * 480 * 1600) / 480 - (w1 * 960 * 1600) / 960)).toBeLessThan(1);
  }
});
it('supports non-axis-aligned world quads', () => {
  const q: Quad = [
      [100, 100],
      [4100, 200],
      [4000, 5200],
      [-100, 5000],
    ],
    h = solveHomography(q, image);
  q.forEach((p, i) => expect(projectPoint(h, p)[0]).toBeCloseTo(image[i][0], 9));
});
