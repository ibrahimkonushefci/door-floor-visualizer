// Put a showroom's name, logo, colours and contacts into the demo in one command:
//   pnpm rebrand --name "Company" [--short "Short"] [--logo logo.svg|png] [--icon icon.png]
//                [--primary #hex] [--accent #hex] [--background #hex]
//                [--phone "+383 44 123 456"] [--whatsapp …] [--viber …]
//                [--city "Prishtinë"] [--tagline "…" [--tagline-en "…"] [--tagline-de "…"]]
//                [--no-check]
//   pnpm rebrand --reset    (back to the demo brand last committed in git, rebuilt)
// Only the given fields change. It writes brand/brand.json, brand/assets/{logo,favicon}.svg
// and their public/brand copies, then runs the data, test, build and export checks.
// The logo is fitted into a square (header and Studio download draw it square); without
// --logo a new --name gets a letter mark in the primary colour. A phone given only as
// --phone is used for WhatsApp and Viber too. demoMode, siteUrl and id never change.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { brandSchema } from '../src/lib/data/schemas';
import { buildThemeVars } from '../src/lib/brand/theme';
import type { BrandConfig, HexColor, LocalizedText } from '../src/lib/data/types';

const BRAND_FILE = 'brand/brand.json';
const ASSETS = ['brand/assets/logo.svg', 'brand/assets/favicon.svg'];
const PUBLIC_ASSETS = ['public/brand/logo.svg', 'public/brand/favicon.svg'];
const BUDGET_REPORT = 'verification/performance.json';
const SIZE = 28;
const MAX_INLINE_SVG = 24 * 1024; // larger SVGs are rasterised (first-screen budget)
const RASTER_PX = 128;
const CHECKS = [
  'validate:data',
  'test',
  'verify:assets',
  'build',
  'verify:export',
  'verify:budgets',
];

export interface RebrandOptions {
  name?: string;
  short?: string;
  primary?: string;
  accent?: string;
  background?: string;
  phone?: string;
  whatsapp?: string;
  viber?: string;
  city?: string;
  tagline?: string;
  'tagline-en'?: string;
  'tagline-de'?: string;
}

const phone = (v: string) => v.replace(/[\s()-]/g, '');
// Every text ships in sq, en and de; untranslated ones repeat the Albanian.
const allLanguages = (sq: string, en = sq, de = en): LocalizedText => ({
  sq: sq.trim(),
  en: en.trim(),
  de: de.trim(),
});
const hex = (v: string) => (v.startsWith('#') ? v : `#${v}`).toUpperCase() as HexColor;

// Throws with a readable message if the result would not build.
export function applyBrand(current: BrandConfig, o: RebrandOptions): BrandConfig {
  const companyName = o.name?.trim() || current.companyName;
  const shortName = o.short?.trim() || (o.name ? companyName : current.shortName);
  if (shortName.length > 18)
    throw new Error(`Short name "${shortName}" is over 18 characters; pass --short "…"`);
  const tel = o.phone ? phone(o.phone) : undefined;
  const next: BrandConfig = {
    ...current,
    companyName,
    shortName,
    tagline: o.tagline
      ? allLanguages(o.tagline, o['tagline-en'], o['tagline-de'] ?? o['tagline-en'])
      : current.tagline,
    logo: { ...current.logo, alt: { sq: companyName, en: companyName, de: companyName } },
    colors: {
      primary: o.primary ? hex(o.primary) : current.colors.primary,
      accent: o.accent ? hex(o.accent) : current.colors.accent,
      background: o.background ? hex(o.background) : current.colors.background,
    },
    contact: {
      phone: tel ?? current.contact.phone,
      whatsapp: o.whatsapp ? phone(o.whatsapp) : (tel ?? current.contact.whatsapp),
      viber: o.viber ? phone(o.viber) : (tel ?? current.contact.viber),
    },
    city: o.city ? allLanguages(o.city) : current.city,
  };
  const parsed = brandSchema.safeParse(next);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n') +
        '\n(colours are six-digit hex like #1F3A5F; phones start with + and the country code)',
    );
  try {
    buildThemeVars(next);
  } catch {
    throw new Error(
      'Colours: the primary colour needs readable button text, and the background must be light enough for dark text. Try a darker --primary or a lighter --background.',
    );
  }
  return next;
}

// Letters only, so the result is safe to put straight into the SVG.
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(w => /^\p{L}/u.test(w));
  return (
    words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)
  ).toLocaleUpperCase();
}

export function monogramSvg(name: string, primary: HexColor, text: string): string {
  const letters = initials(name),
    size = letters.length > 1 ? 11 : 15;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="6" fill="${primary}"/><text x="14" y="14" dy="0.36em" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${size}" font-weight="700" fill="${text}">${letters}</text></svg>\n`;
}

// Any logo shape, centred in a square without stretching.
export function squareSvg(dataUri: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><image href="${dataUri}" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid meet"/></svg>\n`;
}

export async function logoDataUri(file: string): Promise<string> {
  const input = await readFile(file);
  if (file.toLowerCase().endsWith('.svg') && input.length <= MAX_INLINE_SVG) {
    if (/<script|\son\w+\s*=|<foreignObject/i.test(input.toString('utf8')))
      throw new Error(`${file}: SVG contains scripts; export a plain SVG or a PNG`);
    return `data:image/svg+xml;base64,${input.toString('base64')}`;
  }
  const png = await sharp(input, { density: 300 })
    .trim()
    .resize(RASTER_PX, RASTER_PX, { fit: 'inside' })
    .png({ palette: true })
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

// verify:budgets rewrites its committed report; a demo rebrand shouldn't leave that change.
async function runChecks(): Promise<boolean> {
  const report = await readFile(BUDGET_REPORT, 'utf8');
  try {
    for (const script of CHECKS) {
      console.log(`\n▶ pnpm ${script}`);
      if (spawnSync('pnpm', [script], { stdio: 'inherit' }).status !== 0) {
        console.error(`\n✗ pnpm ${script} failed. Undo with: pnpm rebrand --reset`);
        return false;
      }
    }
    return true;
  } finally {
    await writeFile(BUDGET_REPORT, report);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      short: { type: 'string' },
      logo: { type: 'string' },
      icon: { type: 'string' },
      primary: { type: 'string' },
      accent: { type: 'string' },
      background: { type: 'string' },
      phone: { type: 'string' },
      whatsapp: { type: 'string' },
      viber: { type: 'string' },
      city: { type: 'string' },
      tagline: { type: 'string' },
      'tagline-en': { type: 'string' },
      'tagline-de': { type: 'string' },
      'no-check': { type: 'boolean' },
      reset: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help || process.argv.length <= 2) {
    console.log((await readFile(new URL(import.meta.url), 'utf8')).match(/^(\/\/.*\n)+/)![0]);
    return;
  }
  if (values.reset) {
    const files = [BRAND_FILE, ...ASSETS, ...PUBLIC_ASSETS];
    const r = spawnSync(
      'git',
      ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...files],
      {
        stdio: 'inherit',
      },
    );
    if (r.status !== 0) process.exit(1);
    console.log('Brand restored to the last committed version.');
    // Rebuild too, so out/ (what pnpm preview serves) no longer shows the client.
    if (!values['no-check'] && !(await runChecks())) process.exit(1);
    return;
  }
  const current = JSON.parse(await readFile(BRAND_FILE, 'utf8')) as BrandConfig;
  const next = applyBrand(current, values);
  const textOnPrimary = buildThemeVars(next)['--color-primary-text'];
  // Build both images before writing anything, so a bad file leaves the brand untouched.
  const logo = values.logo
    ? squareSvg(await logoDataUri(values.logo))
    : values.name
      ? monogramSvg(next.companyName, next.colors.primary, textOnPrimary)
      : null;
  const icon = values.icon ? squareSvg(await logoDataUri(values.icon)) : logo;

  await writeFile(BRAND_FILE, JSON.stringify(next, null, 2) + '\n');
  for (const [i, svg] of [logo, icon].entries())
    if (svg) {
      await writeFile(ASSETS[i], svg);
      await copyFile(ASSETS[i], PUBLIC_ASSETS[i]);
    }
  console.log(
    [
      `Rebranded to ${next.companyName} (header: ${next.shortName})`,
      `  colours  ${next.colors.primary} · ${next.colors.accent} · ${next.colors.background}`,
      `  contact  ${next.contact.phone} · WhatsApp ${next.contact.whatsapp} · Viber ${next.contact.viber}`,
      `  logo     ${values.logo ?? (logo ? `letter mark "${initials(next.companyName)}"` : 'unchanged')}${values.icon ? `, icon ${values.icon}` : ''}`,
      `  demoMode stays ${next.demoMode}. Don't commit a client's brand; undo with: pnpm rebrand --reset`,
    ].join('\n'),
  );
  if (values['no-check']) return;
  if (!(await runChecks())) process.exit(1);
  console.log('\n✓ All checks passed. Show it with: pnpm preview');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
