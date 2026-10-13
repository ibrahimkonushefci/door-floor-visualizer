# Porta & Dysheme

A mobile-first lookbook catalog and room Studio for interior-door and flooring showrooms in Kosovo, built to replace heavy PDF catalogs. It is a static Next.js export in Albanian (default), English and German, with no backend.

- **Catalog**: editorial product grid with category filters, saved items, and product pages showing finish swatches, sizes and specifications.
- **Studio**: shows any door finish, casing, skirting and floor in four rooms (one furnished 3D render), composited in a Web Worker with a Canvas 2D fallback. It includes a compare slider against the original photograph and sends the combination in one tap.
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

Press and hold the logo for about a second, or open any page with `?presenter=1`. The sheet saves all Studio rooms and finishes to the device (about 12 MB), shows progress, and offers cancel, update and remove. Customers never see it.

Offline needs HTTPS (or localhost). If setup is impossible, the sheet says so rather than reporting an error. A small notice appears only when the device is offline or a new version is waiting.

## Studio rooms

Each room lives in `brand/assets/scenes/<id>/` (frozen `base.png`, masks, light plates, `calibration.json`, `AUTHORING.md`). `pnpm assets:scenes` publishes them to `public/media/scenes/` and regenerates the scene entries in `brand/materials.json`. The scene list is `STUDIO_SCENES` in `scripts/prepare-scenes.ts`.

- `living-render-01`: a furnished room rendered in Blender (see below). 2400×1800, true scale.
- `living-standard`, `corridor-standard`: generated neutral plates, authored by `scripts/author-remediation-scenes.mjs`.
- `bedroom-photo`: a real photograph (Alex Tyson, Unsplash License), authored by `scripts/author-photo-scene.mjs`.

**Rendering a room in Blender** (Blender 5.2 LTS at `/Applications/Blender.app`; free CC0 inputs from Poly Haven):
1. `python3 tools/blender/fetch_assets.py` downloads the pinned models, rug texture and HDRI (md5-verified) into the git-ignored `tools/blender/.cache/`.
2. `Blender --background --factory-startup --python tools/blender/build_room.py -- --model <model> [--preview out.png]` builds `tools/blender/out/<id>/<model>/room.blend` from `tools/blender/room_spec.py` (metres; door, casing and skirting at product sizes). Door models (`DOOR_MODELS`): `flat` (default), `grooved`, `glass-insert`, `filomuro`.
3. `Blender --background --factory-startup --python tools/blender/render_layers.py -- --model <model> --samples 512` renders (render `flat` first: the other models reuse its light scale) the light, light-dim and gloss passes on the Metal GPU (about 20 minutes at 2400×1800 on an M4) and writes masks, light and reflection plates, the base plate and the 16-bit floor position map. `--post-only` reprocesses existing EXRs.
4. `tsx scripts/import-rendered-scene.ts <id>` writes `brand/assets/scenes/<id>/`, records provenance and adds the room to the proof products. Every door model is stored as crops of one shared region around the door (`doorModels` in the scene), so switching model in the Studio only pastes that region. Then run `pnpm assets:scenes` and `tsx scripts/author-decor-images.ts` (catalog images of supplier floors in this room).

Supplier floor décors come from a manifest per brand (`tools/decors/<supplier>.json`: official product page, décor image URL, code, board size, thickness, AC/usage class, structure, licence note). After the owner approves the download, put the images in the git-ignored `tools/decors/.cache/<supplier>/` and run `tsx scripts/import-decors.ts tools/decors/<supplier>.json`: it finds the board joints, cuts the complete boards (up to 6 unique per décor, ≤ 1.5 px/mm, never upscaled), builds the plank sheet, a seamless atlas and a skirting texture, and upserts the floor collections (`decor` provenance) and products. Switching brand is a new manifest plus this command. Décors without written permission are marked `private-pitch-only` in the data and the asset ledger.

Rendered floors are laid board by board from the position map: each board picks one of the décor's plank images (`planks` in `materials.json`, built by `tsx scripts/author-plank-sheets.ts`) by a seeded hash, so there is no repeating tile. Straight and herringbone layouts are procedural; chevron falls back to the atlas.

**Adding a room from a real photograph.** Copy the config block in `scripts/author-photo-scene.mjs`:
1. Record the source, crop, measured edges and both walls' vanishing points.
2. Run `node scripts/author-photo-scene.mjs --from <photo.jpg>`.
3. Add the id to the scene list and to the compatible products' `compatibleSceneIds`.
4. Run `pnpm assets:scenes`.

The camera model derives focal length and camera height, so floor planks have true scale.

Door assemblies of photo scenes are unified at load time (`unifyDoorAssembly` in `src/lib/studio/asset-loader.ts`); rendered scenes have complete, partitioned masks and skip this. Gaps the authored masks leave (mitre joints, jambs, the leaf gap) take the casing's own light, and only a 2 px shadow line remains. Casing and skirting pieces are normalised by their median light, so one material renders at one tone.

**Review tools**
- `tsx scripts/render-preview.ts <scene> <door> <finish> <floor> <out.png> [0|90|45] [frame] [skirting]` renders a full-resolution PNG (45° works on rendered floors; the Studio offers 0/90).
- `tsx scripts/bench-studio.ts [width] [runs]` times the compositing kernel for every room.
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
