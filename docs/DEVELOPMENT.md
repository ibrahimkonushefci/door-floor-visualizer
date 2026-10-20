# Development guide

A mobile-first lookbook catalog and room Studio for interior-door and flooring showrooms in Kosovo, built to replace heavy PDF catalogs. It is a static Next.js export in Albanian (default), English and German, with no backend.

- **Catalog**: editorial product grid with category filters, saved items, and product pages showing finish swatches, sizes and specifications.
- **Studio**: shows any door model and finish, casing, skirting and floor in seven furnished rooms rendered in Blender (living room, kitchen and dining, bedroom, hallway, entrance with a flush door, kids' room, bathroom), with a room-type filter. Rendering happens in a Web Worker with a Canvas 2D fallback. It includes a compare slider against the neutral render and sends the combination in one tap. The bathroom keeps its tiled floor (laminate does not go into bathrooms); only the door changes there.
- **Offline**: a hidden presenter tool saves the Studio and visited catalog pages for meetings without internet.

All products, dimensions and imagery are demo content (`brand.json` → `demoMode: true`).

## Licensing reminder

**Review before any customer-facing commercial use.** Two permissions are still open, and none of the demo's uses is assumed to be covered:

- **Own-room photo AI (SegFormer-B0):** its licence grants non-commercial research or evaluation use only. **Commercial-use permission is unresolved** — including whether showing the tool in a sales demonstration is allowed. The owner has deferred the licence/replacement decision until a customer opportunity arises; the implementation is unchanged until then. Before the photo tool is shown to customers, sold or deployed, have the licence reviewed or replace the model behind `FloorSegmenter`. The showroom Studio (rooms, doors, floors) does not use this model.
- **Supplier décors (KRONOTEX):** taken from official product pages with no reuse licence; marked `private-pitch-only` in the data and ledger. Get written permission from the supplier or the showroom (or use the showroom's own licensed décor images) before customer use.

Status and decisions: [docs/plan/STUDIO_REALISM_PLAN.md](plan/STUDIO_REALISM_PLAN.md) (Phase 5). The pitch kit repeats this in [docs/pitch/](pitch/).

## Roadmap

Studio realism work is phased in [docs/plan/STUDIO_REALISM_PLAN.md](plan/STUDIO_REALISM_PLAN.md) (status table and handoff log inside). Competitor research is in [docs/research/VISUALIZER_COMPETITORS.md](research/VISUALIZER_COMPETITORS.md).

**Pitch kit** (sales demo): [docs/pitch/](pitch/) — the 3-minute demo script, a one-page offer draft (prices left for the owner) and the rebrand checklist.

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

Press and hold the logo for about a second, or open any page with `?presenter=1`. The sheet saves all Studio rooms and finishes to the device (about 31 MB; limit 48 MiB), shows progress, and offers cancel, update and remove. It also lists the **3-minute demo** stops (`brand/demo-route.json`): each opens one scripted room and combination, in place when the Studio is already open. `pnpm validate:data` fails if a stop is not a valid Studio combination. Customers never see it.

Offline needs HTTPS (or localhost). If setup is impossible, the sheet says so rather than reporting an error. A small notice appears only when the device is offline or a new version is waiting.

## Studio rooms

Each room lives in `brand/assets/scenes/<id>/` (frozen `base.png`, masks, light plates, `calibration.json`, `AUTHORING.md`). `pnpm assets:scenes` publishes them to `public/media/scenes/` and regenerates the scene entries in `brand/materials.json`. The scene list is `STUDIO_SCENES` in `scripts/prepare-scenes.ts`.

All Studio rooms are rendered in Blender at 2400×1800 and true scale (see below), each with a `roomType` for the room picker's filter: `living-render-01`, `kitchen-render-01`, `bedroom-render-01`, `hallway-render-01`, `hallway-render-02` (flush filomuro door by default), `kids-render-01` and `bathroom-render-01` (fixed tiles, no editable floor or skirting). Which products a room offers is set by `compatibleSceneIds`, written by the importer: every opaque door line in every room, floors in every room except the bathroom.

The retired photo rooms (`living-standard`, `corridor-standard`, `bedroom-photo`, `corridor-hidden`) are no longer published. Their folders stay as fixtures for the homography floor path and the all-glass door insert (`scripts/legacy-scenes.ts`). The all-glass door (`dera-xham`) therefore has no Studio room for now.

**Rendering a room in Blender** (Blender 5.2 LTS at `/Applications/Blender.app`; free CC0 inputs from Poly Haven):
1. `python3 tools/blender/fetch_assets.py` downloads the pinned models, rug texture and HDRI (md5-verified) into the git-ignored `tools/blender/.cache/`.
2. `Blender --background --factory-startup --python tools/blender/build_room.py -- --room <id> --model <model> [--preview out.png]` builds `tools/blender/out/<id>/<model>/room.blend`. The shell, window, door assembly, skirting, lights and camera are shared (`build_room.py`, `room_spec.py`: metres; door, casing and skirting at product sizes); each room is one module in `tools/blender/rooms/` (dimensions, door position, window, camera, lighting, `furnish()`), with procedural furniture in `tools/blender/props.py` and helpers in `tools/blender/kit.py`. Door models (`DOOR_MODELS`): `flat`, `grooved`, `glass-insert`, `filomuro`; a room's `DEFAULT_MODEL` is `flat` unless it says otherwise. New CC0 inputs: `python3 tools/blender/add_assets.py <polyhaven-id>[:1k] --used-in <room>` pins them in `assets.json`.
3. `Blender --background --factory-startup --python tools/blender/render_layers.py -- --room <id> --model <model> --samples 512 [--crop]` renders the light, light-dim and gloss passes on the Metal GPU (about 20 minutes at 2400×1800 on an M4) and writes masks, light and reflection plates, the base plate and the 16-bit floor position map. Render the room's default model first and in full: the other models reuse its light scale, and `--crop` renders them only in a border around the door (same pixels, about a third of the time). `--post-only` reprocesses existing EXRs. `python3 tools/blender/render_rooms.py <id> [...]` does steps 2–3 for every model of the given rooms.
4. `tsx scripts/import-rendered-scene.ts [<id> ...]` writes `brand/assets/scenes/<id>/` (room names, types and product rules: `ROOMS` in that script), records provenance and sets the products' `compatibleSceneIds`. Every door model is stored as crops of one shared region around the door (`doorModels` in the scene), so switching model in the Studio only pastes that region. Then run `pnpm assets:scenes` and `tsx scripts/author-decor-images.ts` (catalog images of supplier floors in this room).

Supplier floor décors come from a manifest per brand (`tools/decors/<supplier>.json`: official product page, décor image URL, code, board size, thickness, AC/usage class, structure, licence note). After the owner approves the download, put the images in the git-ignored `tools/decors/.cache/<supplier>/` and run `tsx scripts/import-decors.ts tools/decors/<supplier>.json`: it finds the board joints, cuts the complete boards (up to 6 unique per décor, ≤ 1.5 px/mm, never upscaled), builds the plank sheet, a seamless atlas and a skirting texture, and upserts the floor collections (`decor` provenance) and products. Switching brand is a new manifest plus this command. Décors without written permission are marked `private-pitch-only` in the data and the asset ledger.

Rendered floors are laid board by board from the position map: each board picks one of the décor's plank images (`planks` in `materials.json`, built by `tsx scripts/author-plank-sheets.ts`) by a seeded hash, so there is no repeating tile. Straight and herringbone layouts are procedural; chevron falls back to the atlas.

**Adding a room from a real photograph.** Copy the config block in `scripts/author-photo-scene.mjs`:
1. Record the source, crop, measured edges and both walls' vanishing points.
2. Run `node scripts/author-photo-scene.mjs --from <photo.jpg>`.
3. Add the id to the scene list and to the compatible products' `compatibleSceneIds`.
4. Run `pnpm assets:scenes`.

The camera model derives focal length and camera height, so floor planks have true scale.

Door assemblies of photo scenes are unified at load time (`unifyDoorAssembly` in `src/lib/studio/asset-loader.ts`); rendered scenes have complete, partitioned masks and skip this. Gaps the authored masks leave (mitre joints, jambs, the leaf gap) take the casing's own light, and only a 2 px shadow line remains. Casing and skirting pieces are normalised by their median light, so one material renders at one tone.

**Own-room photo tool** (`/<locale>/studio/photo/`, linked from the Studio's room list). A visitor's photo goes through four steps, all on the device: photo (file, camera or drag-and-drop; EXIF orientation; resized to 2048 px) → floor area (AI first guess, then brush/eraser with edge snapping, undo/redo) → perspective (four corners on a floor rectangle, plank-scale preview, size slider) → result (any published floor, plank direction, brightness, compare with the photo, labelled JPEG download, WhatsApp request). The floor renders through the Studio's own kernel (homography path) with a lighting plate taken from the photo. Code: `src/lib/studio/photo/`, `src/components/studio/photo/`, `src/workers/segment.worker.ts`.
- The AI is SegFormer-B0 (ADE20K floor class, int8 ONNX, 4.4 MB) on ONNX Runtime Web (WASM, 14 MB), served from `public/models/` and fetched only when the tool opens (not part of the offline pack). **Its licence (NVIDIA Source Code License for SegFormer) grants non-commercial research or evaluation use only, and commercial-use permission is unresolved** (see [Licensing reminder](../README.md#licensing-reminder)). Replacing it means swapping the provider behind `FloorSegmenter`. The host must serve `.wasm` as `application/wasm`.
- `tsx scripts/prepare-photo-tool.ts` copies the runtime and model (from `tools/segmentation/.cache/`, see the script header) and the sample photo, and records them in `brand/asset-sources.json`; `--check` (also run by `pnpm verify:assets`) verifies their hashes.
- `tsx scripts/bench-floor-segmentation.ts [--photos <dir>]` scores the AI against ground-truth masks (the real bedroom photo, the rendered rooms, and optionally your own photos: `<name>.jpg` + `<name>.mask.png`, white = floor).
- `tsx scripts/render-photo-preview.ts <photo|dir> <out-dir> [floorId] [--rotation 90]` runs the whole pipeline without the browser (AI mask, corner guess, render) for a quick look at a batch of photos.

**Review tools**
- `tsx scripts/render-preview.ts <scene> <door> <finish> <floor> <out.png> [0|90|45] [frame] [skirting]` renders a full-resolution PNG (45° works on rendered floors; the Studio offers 0/90).
- `tsx scripts/bench-studio.ts [width] [runs]` times the compositing kernel for every room.
- Append `?debug=1` to a Studio URL to write render timings into the DOM.

## Rebranding

Everything company-specific is under `brand/`:
- `brand.json`: name, tagline, colours, contacts, locales.
- Logo and favicon.
- `messages/{sq,en,de}.json`.
- `demo-route.json`: the presenter's demo stops (see [docs/pitch/REBRAND_CHECKLIST.md](pitch/REBRAND_CHECKLIST.md)).
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

Build history and the original phase evidence are archived in [archive/](archive/).
