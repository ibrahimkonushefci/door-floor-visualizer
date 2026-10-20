# Rebrand checklist — when a target showroom is chosen

Phase 6 task 1. Until a showroom is chosen, the demo keeps the **Porta & Dysheme** demo brand. Keep `demoMode: true` throughout: in demo mode nothing is sent, pages are not indexed, and contact messages are previewed.

## 1. Collect from the showroom

- [ ] Company name and short name; tagline in SQ (EN/DE can be translated)
- [ ] Logo as SVG (PNG at least 512 px works for a demo) and a square icon for the favicon
- [ ] Brand colours: primary, accent, background (the build rejects low-contrast pairs)
- [ ] Phone, WhatsApp and Viber numbers; city
- [ ] Door lines they sell: names, finishes, models (flat / grooved / glass insert / flush), sizes
- [ ] Floor brand and 6–8 décors: product codes, board size, thickness, AC/usage class, bevel
- [ ] **Written permission** to use their or their supplier's décor images and product photos

## 2. Apply (files under `brand/`)

1. `brand/brand.json`: `id`, `companyName`, `shortName`, `tagline`, `logo.alt`, `colors`, `contact`, `city`. Leave `demoMode: true` and `siteUrl: null`.
2. `brand/assets/logo.svg` and `brand/assets/favicon.svg` (keep the file names, or update `logo.src` / `favicon`).
3. Products and finishes: `brand/products.json` and `brand/materials.json`. Every localized field needs SQ (EN/DE fall back to SQ but should be filled).
4. Décors: a manifest `tools/decors/<supplier>.json` (copy `tools/decors/kronotex.json`), images in `tools/decors/.cache/<supplier>/` (download only after approval), then `tsx scripts/import-decors.ts tools/decors/<supplier>.json`. See "Supplier floor décors" in the [development guide](../DEVELOPMENT.md).
5. **Known limit:** `scripts/import-rendered-scene.ts` hard-codes the four door lines (`DOORS`), the default floor (`DEFAULT_FLOOR`) and each room's default door (`ROOMS`). If the showroom's door line ids differ, edit those, re-run the importer and `pnpm assets:scenes`. (Pre-Phase 4 review, deferred finding 12.)
6. Demo route: `brand/demo-route.json` (the four stops in the presenter sheet and [DEMO_SCRIPT.md](DEMO_SCRIPT.md)). Point each stop at the showroom's products; `pnpm validate:data` fails if a stop is not a valid Studio combination.
7. Images and scenes: `pnpm assets:images`, `pnpm assets:scenes`.
8. Asset provenance: every new image goes into `brand/asset-sources.json` (URL, author, licence, hash). Mark décors without written permission `private-pitch-only`.

## 3. Check

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm validate:data && pnpm verify:assets && pnpm assets:scenes --check && pnpm build && pnpm verify:export && pnpm verify:budgets
```

Then run the [demo script](DEMO_SCRIPT.md) once end to end with the new brand, and update the product names in the script's "They see" column.

## Not part of a demo rebrand

- Deployment, a domain, `demoMode: false` — only when the owner asks (needs a public HTTPS `siteUrl` and verified contacts).
- New furnished rooms (Blender renders, see "Rendering a room in Blender" in the [development guide](../DEVELOPMENT.md)).
- The own-room photo AI — its commercial-use licence is unresolved ([README](../../README.md#licensing-reminder)).
