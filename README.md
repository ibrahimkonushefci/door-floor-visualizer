# Porta & Dysheme

A mobile-first lookbook catalog and room Studio for interior-door and flooring showrooms in Kosovo, built to replace heavy PDF catalogs. It is a static Next.js export in Albanian (default), English and German, with no backend.

- **Catalog**: editorial product grid with category filters, saved items, and product pages showing finish swatches, sizes and specifications.
- **Studio**: shows any door finish, casing, skirting and floor in three rooms, rendered in a Web Worker with a Canvas 2D fallback. It includes a compare slider against the original photograph and sends the combination in one tap.
- **Offline**: a hidden presenter tool saves the Studio and visited catalog pages for meetings without internet.

All products, dimensions and imagery are demo content (`brand.json` → `demoMode: true`).

## Roadmap

Studio realism work is phased in [docs/plan/STUDIO_REALISM_PLAN.md](docs/plan/STUDIO_REALISM_PLAN.md) (status table and handoff log inside). Competitor research is in [docs/research/VISUALIZER_COMPETITORS.md](docs/research/VISUALIZER_COMPETITORS.md).

## Run locally

Node 24.19.0 and pnpm 11.25.0 are pinned.

```sh
pnpm install --frozen-lockfile
pnpm dev                     # http://127.0.0.1:3000/sq/
```

Offline saving only runs in a production export:

```sh
pnpm build && pnpm preview   # http://127.0.0.1:4173/sq/
```

## Verify

```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm validate:data && pnpm verify:assets
pnpm assets:scenes --check   # scene derivatives are deterministic
pnpm render:fixtures         # writes verification/render-fixtures/*
pnpm build && pnpm verify:export && pnpm verify:budgets
```

## Presenter tools (offline)

Press and hold the logo for about a second, or open any page with `?presenter=1`. The sheet saves all Studio rooms and finishes to the device (about 10 MB), shows progress, and offers cancel, update and remove. Customers never see it.

Offline needs HTTPS (or localhost). If setup is impossible, the sheet says so rather than reporting an error. A small notice appears only when the device is offline or a new version is waiting.

## Studio rooms

Each room lives in `brand/assets/scenes/<id>/` (frozen `base.png`, masks, light plates, `calibration.json`, `AUTHORING.md`). `pnpm assets:scenes` publishes them to `public/media/scenes/` and regenerates the scene entries in `brand/materials.json`. The scene list is `STUDIO_SCENES` in `scripts/prepare-scenes.ts`.

- `living-standard`, `corridor-standard`: generated neutral plates, authored by `scripts/author-remediation-scenes.mjs`.
- `bedroom-photo`: a real photograph (Alex Tyson, Unsplash License), authored by `scripts/author-photo-scene.mjs`.

**Adding a room from a real photograph.** Copy the config block in `scripts/author-photo-scene.mjs`:
1. Record the source, crop, measured edges and both walls' vanishing points.
2. Run `node scripts/author-photo-scene.mjs --from <photo.jpg>`.
3. Add the id to the scene list and to the compatible products' `compatibleSceneIds`.
4. Run `pnpm assets:scenes`.

The camera model derives focal length and camera height, so floor planks have true scale.

Door assemblies are unified at load time (`unifyDoorAssembly` in `src/lib/studio/asset-loader.ts`). Gaps the authored masks leave (mitre joints, jambs, the leaf gap) take the casing's own light, and only a 2 px shadow line remains. Casing and skirting pieces are normalised by their median light, so one material renders at one tone.

**Review tools**
- `tsx scripts/render-preview.ts <scene> <door> <finish> <floor> <out.png> [0|90] [frame] [skirting]` renders a full-resolution PNG.
- Append `?debug=1` to a Studio URL to write render timings into the DOM.

## Rebranding

Everything company-specific is under `brand/`:
- `brand.json`: name, tagline, colours, contacts, locales.
- Logo and favicon.
- `messages/{sq,en,de}.json`.
- `products.json`, `materials.json` and their images and textures.

Validation is structural and has no fixed inventory: any number of products, finishes and rooms works, and every localized field needs all three languages. Rebuild images with `pnpm assets:images` and scenes with `pnpm assets:scenes`, then run the verification above.

Live mode (`demoMode: false`) requires a public HTTPS `siteUrl` and verified contacts. Demo mode emits noindex/nofollow, disallows crawling and previews contact messages instead of sending them.

## Design system

Styles live in `src/styles/`:
- `tokens.css`: type scale, spacing, radii, motion, brand colours (overridden by `buildThemeVars`).
- `base.css`.
- `ui.css`: Swatch, SegmentedControl, IconButton, Toast.
- `shell.css`, `catalog.css`, `product.css`, `studio.css`, `dialog.css`.

Type is Cormorant Garamond for display and DM Sans for interface text, both self-hosted (OFL, `src/styles/fonts/`).

## Hosting

Serve **out/** from any static host with directory `index.html` resolution and a real 404. Serve `/sw.js`, `/offline-manifest.json`, `/build-info.json` and HTML with `no-cache`. `/_next/static/` is immutable, and revisioned media keeps its `?rev=` key. Don't use an SPA catch-all rewrite.

Build history and the original phase evidence are archived in `docs/archive/`.
