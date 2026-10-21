import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import brand from './fixtures/brand.json';
import { applyBrand, initials, monogramSvg, squareSvg, logoDataUri } from '../scripts/rebrand';
import type { BrandConfig } from '../src/lib/data/types';

const current = () => structuredClone(brand) as unknown as BrandConfig;

describe('rebrand', () => {
  it('changes only the given fields and keeps demo mode', () => {
    const next = applyBrand(current(), { name: 'Parket Shtëpia', primary: '1f3a5f' });
    expect(next.companyName).toBe('Parket Shtëpia');
    expect(next.shortName).toBe('Parket Shtëpia');
    expect(next.logo.alt).toEqual({
      sq: 'Parket Shtëpia',
      en: 'Parket Shtëpia',
      de: 'Parket Shtëpia',
    });
    expect(next.colors.primary).toBe('#1F3A5F');
    expect(next.colors.background).toBe(brand.colors.background);
    expect(next.contact).toEqual(brand.contact);
    expect(next.demoMode).toBe(brand.demoMode);
    expect(next.id).toBe(brand.id);
  });
  it('fills every language for city and tagline', () => {
    const next = applyBrand(current(), {
      city: 'Prizren',
      tagline: 'Dyer dhe dysheme',
      'tagline-en': 'Doors and floors',
    });
    expect(next.city).toEqual({ sq: 'Prizren', en: 'Prizren', de: 'Prizren' });
    expect(next.tagline).toEqual({
      sq: 'Dyer dhe dysheme',
      en: 'Doors and floors',
      de: 'Doors and floors',
    });
  });
  it('uses --phone for WhatsApp and Viber unless they are given', () => {
    const next = applyBrand(current(), { phone: '+383 44 123 456', viber: '+383 49 000 111' });
    expect(next.contact).toEqual({
      phone: '+38344123456',
      whatsapp: '+38344123456',
      viber: '+38349000111',
    });
  });
  it.each([
    [{ name: 'A Very Long Company Name Ltd' }, /--short/],
    [{ primary: '#808080' }, /darker --primary/],
    [{ background: '#333333' }, /lighter --background/],
    [{ accent: 'blue' }, /six-digit hex/],
    [{ phone: '044 123 456' }, /country code/],
  ])('rejects %o with a readable message', (options, message) => {
    expect(() => applyBrand(current(), options)).toThrow(message);
  });
  it('makes a letter mark from the name', () => {
    expect(initials('Dyer & Dysheme')).toBe('DD');
    expect(initials('çelik')).toBe('ÇE');
    const svg = monogramSvg('Tom & <Co>', '#1F3A5F', '#FFFFFF');
    expect(svg).toContain('fill="#1F3A5F"');
    expect(svg).toContain('fill="#FFFFFF">TO</text>');
  });
  it('fits any logo into a square without stretching', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rebrand-'));
    const wide = join(dir, 'wide.png');
    await sharp({ create: { width: 600, height: 150, channels: 4, background: '#A37D52' } })
      .png()
      .toFile(wide);
    const uri = await logoDataUri(wide);
    const meta = await sharp(Buffer.from(uri.split(',')[1], 'base64')).metadata();
    expect([meta.width, meta.height]).toEqual([128, 32]);
    expect(squareSvg(uri)).toContain('preserveAspectRatio="xMidYMid meet"');
    const unsafe = join(dir, 'unsafe.svg');
    await writeFile(
      unsafe,
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await expect(logoDataUri(unsafe)).rejects.toThrow(/scripts/);
  });
});
