import { describe, it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import { resolveContactAction, copyInquiryText } from '../src/lib/inquiry/links';
import { buildInquiryMessage } from '../src/lib/inquiry/message';
import { getMessages } from '../src/lib/i18n/messages';
const brand = loadSiteData().brand;
describe('contact safety', () => {
  it.each(['phone', 'whatsapp', 'viber'] as const)('always previews demo %s', channel => {
    const action = resolveContactAction(
      channel,
      brand,
      'ë ç ß & +\nhttps://x/?a=1&b=2',
      'https://x/',
    );
    expect(action.kind).toBe('preview');
    expect(action).not.toHaveProperty('href');
  });
  it('encodes live WhatsApp once without losing punctuation or link', () => {
    const message = 'ë ç ß & +\nhttps://example.com/sq/?a=1&b=2';
    const action = resolveContactAction(
      'whatsapp',
      { ...brand, demoMode: false, contact: { ...brand.contact, whatsapp: '+38344123456' } },
      message,
      'https://example.com',
    );
    if (action.kind !== 'external') throw new Error('Expected external');
    const url = new URL(action.href);
    expect(url.pathname).toBe('/38344123456');
    expect(url.searchParams.get('text')).toBe(message);
  });
  it('keeps full Viber text, bounds forwarding and refuses overlong URL', () => {
    const live = {
      ...brand,
      demoMode: false,
      contact: { ...brand.contact, viber: '+38344123456' },
    };
    const action = resolveContactAction('viber', live, 'x'.repeat(500), 'https://example.com/sq/');
    if (action.kind !== 'external') throw new Error('Expected external');
    expect(new URL(action.href).searchParams.get('text')!.length).toBeLessThanOrEqual(200);
    expect(action.fullMessage.length).toBe(500);
    expect(action.copyRequired).toBe(true);
    expect(
      resolveContactAction('viber', live, 'x'.repeat(500), 'https://x/' + 'x'.repeat(300)).kind,
    ).toBe('preview');
  });
  it('handles unavailable and rejected clipboard without throwing', async () => {
    expect(await copyInquiryText('text', null)).toBe(false);
    expect(
      await copyInquiryText('text', {
        writeText: async () => {
          throw new Error('denied');
        },
      }),
    ).toBe(false);
    let actual = '';
    expect(
      await copyInquiryText('ë ç ß', {
        writeText: async text => {
          actual = text;
        },
      }),
    ).toBe(true);
    expect(actual).toBe('ë ç ß');
  });
  it('catalog inquiry is localized and contains current canonical link', () => {
    const d = loadSiteData();
    const message = buildInquiryMessage(
      { kind: 'catalog', productIds: [] },
      { brand: d.brand, products: [], materials: d.materials, scenes: [] },
      'de',
      'http://127.0.0.1:4173/de/',
      getMessages('de'),
    );
    expect(message).toContain('Hallo');
    expect(message).toContain('/de/');
  });
});
