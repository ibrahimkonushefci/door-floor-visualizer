import { it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import { checkDemoRoute, DEMO_ROUTE, demoStopHref, demoStopLabel } from '../src/lib/studio/demo-route';
import { parseStudioQuery } from '../src/lib/studio/query';
const data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials };
it('every demo stop is a valid Studio combination with labels in all three languages', () => {
  expect(DEMO_ROUTE.length).toBeGreaterThanOrEqual(3);
  expect(checkDemoRoute(catalog)).toEqual([]);
  for (const stop of DEMO_ROUTE)
    for (const locale of data.brand.locales) expect(demoStopLabel(stop, locale)).toBe(stop.label[locale]);
});
it('a demo link opens exactly its combination', () => {
  for (const stop of DEMO_ROUTE) {
    const href = demoStopHref('en', stop);
    expect(href.startsWith('/en/studio/?')).toBe(true);
    const parsed = parseStudioQuery(new URLSearchParams(href.split('?')[1]), catalog);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.selection).toEqual(stop.selection);
  }
});
it('reports a stop the Studio would change', () => {
  const [first] = DEMO_ROUTE;
  const broken = [
    { ...first, id: 'x', selection: { ...first.selection, doorFinishId: 'xham-erret' } },
    { ...first, id: 'x', selection: { ...first.selection, sceneId: 'no-such-room' } },
  ];
  const problems = checkDemoRoute(catalog, broken);
  expect(problems.some(p => p.includes('duplicate stop "x"'))).toBe(true);
  expect(problems.filter(p => p.includes('not a valid Studio combination'))).toHaveLength(2);
});
