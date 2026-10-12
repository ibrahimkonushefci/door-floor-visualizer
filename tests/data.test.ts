import { loadSiteData } from '../src/lib/data/load';
import { describe, it, expect } from 'vitest';
import brand from './fixtures/brand.json';
import products from './fixtures/products.json';
import materials from './fixtures/materials.json';
import { validateSiteData, parsePhase } from '../src/lib/data/validate';
import { productsSchema, materialsSchema, assetPathSchema } from '../src/lib/data/schemas';
const input = () =>
  structuredClone({
    brand: { ...brand, siteUrl: brand.siteUrl as string | null },
    products,
    materials,
  });
describe('strict Phase 1 data', () => {
  it('accepts empty foundation and normalizes contacts', () => {
    const value = input();
    value.brand.contact.phone = '+383 44 123 456';
    expect(validateSiteData(value, 1).brand.contact.phone).toBe('+38344123456');
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
    expect(() => validateSiteData(v, 1)).toThrow();
  });
  it('rejects duplicate IDs before phase completeness', () => {
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
    expect(() => validateSiteData(v, 1)).toThrow('duplicate');
  });
  it('cannot certify a later phase with empty data', () =>
    expect(() => validateSiteData(input(), 2)).toThrow('incomplete'));
  it('rejects malformed product and contradictory parquet fields even at P1', () => {
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
  it('rejects malformed phase flags', () => {
    expect(parsePhase([], 1)).toBe(1);
    expect(() => parsePhase(['--phase=6'], 1)).toThrow();
  });
});

describe('final catalog completeness', () => {
  it('rejects extra or unpublished inventory', () => {
    const data = structuredClone(loadSiteData(5));
    data.products.products[0].published = false;
    expect(() => validateSiteData(data, 5)).toThrow('catalog incomplete');
  });
  it('requires real translations rather than relying on final fallback', () => {
    const data = structuredClone(loadSiteData(5));
    data.products.products[0].name.de = ' ';
    expect(() => validateSiteData(data, 5)).toThrow('missing final translation');
  });
});
