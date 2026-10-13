import { describe, it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import { categoryForProduct, selectProducts, toProductCard } from '../src/lib/catalog/selectors';
import {
  parseCatalogQuery,
  serializeCatalogQuery,
  mergeCatalogQuery,
} from '../src/lib/catalog/query';
import { validateSiteData } from '../src/lib/data/validate';
import type { Product } from '../src/lib/data/types';
import type { ImageManifest } from '../src/lib/media/types';
import { readFileSync } from 'node:fs';
const data = loadSiteData();
const images: ImageManifest = JSON.parse(readFileSync('verification/image-manifest.json', 'utf8'));
describe('catalog', () => {
  it.each([
    ['all', 16],
    ['interior-doors', 3],
    ['hidden-doors', 2],
    ['laminate', 8],
    ['parquet', 1],
    ['trim', 2],
  ] as const)('filters %s', (category, n) =>
    expect(
      selectProducts(
        data.products.products,
        data.materials,
        { category, savedOnly: false },
        new Set(),
      ),
    ).toHaveLength(n),
  );
  it('classifies glass as interior and trims separately', () => {
    const door = data.products.products.find(p => p.kind === 'door')!;
    expect(categoryForProduct({ ...door, doorType: 'glass' } as Product, data.materials)).toBe(
      'interior-doors',
    );
    expect(categoryForProduct({ kind: 'trim' } as Product, data.materials)).toBe('trim');
  });
  it('respects publication, saved IDs and order', () => {
    expect(
      selectProducts(
        [...data.products.products].reverse(),
        data.materials,
        { category: 'all', savedOnly: true },
        new Set(['dera-bardhe', 'unknown', 'dera-lis']),
      ).map(p => p.id),
    ).toEqual(['dera-bardhe', 'dera-lis']);
    expect(
      selectProducts(
        data.products.products.map(p => ({ ...p, published: false })),
        data.materials,
        { category: 'all', savedOnly: false },
        new Set(),
      ),
    ).toHaveLength(0);
  });
  it.each(['category=oops&saved=yes', 'category=%00&saved=2', 'x=' + 'a'.repeat(2100)])(
    'safely parses malformed query',
    q =>
      expect(parseCatalogQuery(new URLSearchParams(q))).toEqual({
        category: 'all',
        savedOnly: false,
      }),
  );
  it('round trips and preserves unrelated state', () => {
    const q = { category: 'laminate' as const, savedOnly: true };
    expect(parseCatalogQuery(serializeCatalogQuery(q))).toEqual(q);
    expect(serializeCatalogQuery({ category: 'all', savedOnly: false }).toString()).toBe('');
    expect(mergeCatalogQuery(new URLSearchParams('size=900&category=bad'), q).get('size')).toBe(
      '900',
    );
  });
  it('formats localized covers and correct type-specific specs', () => {
    for (const p of data.products.products)
      for (const locale of ['sq', 'en', 'de'] as const) {
        const card = toProductCard(p, data, locale, images);
        expect(card.name).toBe(p.name[locale]);
        expect(card.image.alt).toBeTruthy();
        expect(card.image.id).toBe(p.imageIds[0]);
      }
    const p = data.products.products.find(p => p.id === 'peshk-natyral-12')!;
    expect(toProductCard(p, data, 'en', images).spec).not.toContain('AC');
  });
  it.each(['scene', 'finish', 'default', 'image'])(
    'rejects invalid %s references',
    kind => {
      const v = structuredClone(data);
      const p = v.products.products.find(p => p.kind === 'door')!;
      if (p.kind !== 'door') throw Error();
      if (kind === 'scene') p.compatibleSceneIds = ['invented'];
      if (kind === 'finish') p.finishIds = ['invented'];
      if (kind === 'default') p.defaultSizeId = 'invented';
      if (kind === 'image') v.products.images[0].source = 'brand/assets/products/other/01.jpg';
      expect(() => validateSiteData(v)).toThrow();
    },
  );
  it('rejects a published product without photographs', () => {
    const v = structuredClone(data);
    v.products.products[0].imageIds = [];
    expect(() => validateSiteData(v)).toThrow('gallery incomplete');
  });
});
