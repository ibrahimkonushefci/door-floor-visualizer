import { describe, it, expect } from 'vitest';
import { localize, getMessages, validateMessages } from '../src/lib/i18n/messages';
import { localeHref, isLocale } from '../src/lib/i18n/locales';
describe('localization', () => {
  it('uses only Albanian fallback for missing/blank translations', () => {
    expect(localize({ sq: 'Shqip', en: 'English', de: ' ' }, 'de')).toBe('Shqip');
    expect(localize({ sq: 'Shqip', en: ' English ' }, 'en')).toBe('English');
  });
  it('has exact message keys and rejects unknown locales', () => {
    validateMessages();
    expect(Object.keys(getMessages('de'))).toEqual(Object.keys(getMessages('sq')));
    expect(isLocale('fr')).toBe(false);
  });
  it('preserves deep route and allowed query only', () => {
    expect(
      localeHref(
        '/sq/products/dera-bardhe/',
        new URLSearchParams('size=900&finish=lis&tracking=bad'),
        'de',
      ),
    ).toBe('/de/products/dera-bardhe/?size=900&finish=lis');
    expect(
      localeHref(
        '/en/studio/',
        new URLSearchParams('v=1&scene=living-standard&door=dera-bardhe&rot=90'),
        'sq',
      ),
    ).toBe('/sq/studio/?v=1&scene=living-standard&door=dera-bardhe&rot=90');
  });
  it('bounds incoming query data', () =>
    expect(localeHref('/sq/', new URLSearchParams('door=' + 'a'.repeat(3000)), 'en')).toBe('/en/'));
});
