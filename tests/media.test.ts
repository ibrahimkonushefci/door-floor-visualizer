import { describe, it, expect } from 'vitest';
import { derivativeWidths, withAssetRevision } from '../src/lib/media/paths';
import { sourceLedgerSchema, verifyAssets } from '../scripts/verify-assets';
describe('media', () => {
  it('bounds and deduplicates derivatives without upscaling', () => {
    expect(derivativeWidths(1774)).toEqual([320, 640, 960, 1600, 1774]);
    expect(derivativeWidths(500)).toEqual([320, 500]);
    expect(derivativeWidths(1600)).toEqual([320, 640, 960, 1600]);
    expect(() => derivativeWidths(0)).toThrow();
  });
  it('revisions local assets only', () => {
    expect(withAssetRevision('/media/a.webp', 'a'.repeat(64))).toBe(
      '/media/a.webp?rev=' + 'a'.repeat(64),
    );
    for (const path of [
      'https://cdn/a',
      '/media/../a',
      '/media/%2e%2e/a',
      '/media/a?url=x',
      '/media/a#x',
      '/media/%5cfile',
    ])
      expect(() => withAssetRevision(path, 'a'.repeat(64))).toThrow();
  });
  it('rejects unsafe or unaccountable provenance', () => {
    expect(
      sourceLedgerSchema.safeParse({
        schemaVersion: 1,
        assets: [{ id: 'bad', localPath: '../../bad' }],
      }).success,
    ).toBe(false);
  });
  it('verifies actual dimensions, hashes, provenance and byte budget', async () => {
    const audit = await verifyAssets();
    expect(audit.sources).toBe(24);
    expect(audit.derivatives).toBe(240);
    expect(audit.firstFour640WebpBytes).toBeLessThanOrEqual(240 * 1024);
  }, 15000);
});
