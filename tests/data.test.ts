import { loadSiteData } from '../src/lib/data/load';
import { describe, it, expect } from 'vitest';
import brand from './fixtures/brand.json';
import products from './fixtures/products.json';
import materials from './fixtures/materials.json';
import { validateSiteData } from '../src/lib/data/validate';
import { productsSchema, materialsSchema, assetPathSchema } from '../src/lib/data/schemas';
const input = () =>
  structuredClone({
    brand: { ...brand, siteUrl: brand.siteUrl as string | null },
    products,
    materials,
  });
describe('strict brand data', () => {
  it('accepts empty foundation and normalizes contacts', () => {
    const value = input();
    value.brand.contact.phone = '+383 44 123 456';
    expect(validateSiteData(value).brand.contact.phone).toBe('+38344123456');
  });
  it.each([
    'invalid-id',
    'missing-sq',
    'unknown-field',
    'malformed-color',
    'live-sample',
    'unsafe-path',
    'negative-size',
    'low-contrast',
  ])('rejects %s', kind => {
    const v = input();
    if (kind === 'invalid-id') v.brand.id = 'bad ID';
    if (kind === 'missing-sq') v.brand.tagline.sq = ' ';
    if (kind === 'unknown-field') Object.assign(v.brand, { unexpected: true });
    if (kind === 'malformed-color') v.brand.colors.primary = '#fff';
    if (kind === 'live-sample') {
      v.brand.demoMode = false;
      v.brand.siteUrl = 'https://example.com';
    }
    if (kind === 'unsafe-path') v.brand.logo.src = '/brand/../secret';
    if (kind === 'negative-size') v.brand.logo.width = -1;
    if (kind === 'low-contrast') v.brand.colors.background = '#202421';
    expect(() => validateSiteData(v)).toThrow();
  });
  it('rejects duplicate IDs', () => {
    const v = input();
    Object.assign(v.products, {
      images: [
        {
          id: 'door-01',
          source: 'brand/assets/products/door/01.jpg',
          alt: { sq: 'Derë' },
          focalPoint: [0.5, 0.5],
          role: 'product',
        },
        {
          id: 'door-01',
          source: 'brand/assets/products/door/02.jpg',
          alt: { sq: 'Derë' },
          focalPoint: [0.5, 0.5],
          role: 'product',
        },
      ],
    });
    expect(() => validateSiteData(v)).toThrow('duplicate');
  });
  it('rejects malformed product and contradictory parquet fields', () => {
    expect(
      productsSchema.safeParse({
        schemaVersion: 1,
        images: [],
        products: [{ id: 'test', kind: 'door' }],
      }).success,
    ).toBe(false);
    expect(
      materialsSchema.safeParse({
        schemaVersion: 1,
        doorFinishes: [],
        floorCollections: [{ id: 'test', kind: 'parquet', acClass: 'AC5' }],
        scenes: [],
      }).success,
    ).toBe(false);
  });
  it.each([
    '/media/../../secret',
    'https://cdn.example/test',
    '/brand/foo?url=https://x',
    '/brand/%2e%2e/secret',
  ])('rejects unsafe asset %s', v => expect(assetPathSchema.safeParse(v).success).toBe(false));
});

describe('catalog completeness', () => {
  it('accepts a catalog of any size', () => {
    const data = structuredClone(loadSiteData());
    const trims = new Set(data.products.products.filter(p => p.kind === 'trim').map(p => p.id));
    data.products.products = data.products.products.filter(p => !trims.has(p.id));
    data.products.products.forEach(p => {
      p.relatedProductIds = p.relatedProductIds.filter(id => !trims.has(id));
    });
    expect(validateSiteData(data).products.products.length).toBe(12 - trims.size);
  });
  it('requires real translations rather than relying on fallback', () => {
    const data = structuredClone(loadSiteData());
    data.products.products[0].name.de = ' ';
    expect(() => validateSiteData(data)).toThrow('missing translation');
  });
});
