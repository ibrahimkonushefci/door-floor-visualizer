# Studio realism plan

Living plan for making the Studio good enough to pitch as a paid service. Each phase runs in its **own chat session**. A session reads this file, does exactly one phase, updates the status table and handoff log at the bottom, commits, and stops at the phase gate for the owner's review.

Research behind this plan: [../research/VISUALIZER_COMPETITORS.md](../research/VISUALIZER_COMPETITORS.md). Original product brief: `doors_laminate_catalog.md` and `BUILD_PLAN.md` on `main` (`82697de`). Earlier verification: `docs/archive/`.

## Status

| Phase | Title | Status | Commit (on `main`) | Gate approved |
|---|---|---|---|---|
| 1 | One 3D proof room | awaiting review | `8dd0121` | |
| 2 | Real supplier décors and door models | not started | | |
| 3 | More rooms | not started | | |
| 4 | Studio rebuilt for presenting | not started | | |
| 5 | Own-room photo upload (AI + touch-up) | not started | | |
| 6 | Pitch kit | not started | | |

Status values: `not started` → `in progress` → `awaiting review` → `done`.

## Context every session needs

- **Product:** a mobile-first lookbook catalog plus "Studio e Kombinimit" (door + floor + trim matching) for Kosovo interior-door and laminate showrooms. It is static Next.js export in SQ (default) / EN / DE, rebrandable through `brand/`, with an offline presenter pack and WhatsApp/Viber inquiries. `demoMode: true` stays on.
- **Buyer:** showroom owners and importers (Prishtinë, Fushë Kosovë, Ferizaj, Prizren, Pejë).
- **Users:** a sales rep on iPad/laptop in the showroom; diaspora customers via WhatsApp links.
- **Pitch devices:** iPad, laptop, PC. Sharpness on large screens matters.
- **Owner's complaints to fix:** rooms look fake/empty; floors and doors look pasted; Studio layout and flow; too few rooms and products.
- **Budget:** total cash spend ≤ **$25**. Prefer free tools and assets (Blender, Poly Haven CC0, free serverless credits). Ask before spending anything.
- **Machine:** Apple M4, 16 GB RAM, macOS. Blender **5.2.2 LTS** (build 2026-09-15, hash `d13f752e3b9c`) at `/Applications/Blender.app`; Cycles uses the Metal GPU (10-core).
- **Next.js:** this repo's Next.js has breaking changes. Read `node_modules/next/dist/docs/` before touching framework code (see `AGENTS.md`).
- **Toolchain:** Node 24.19.0, pnpm 11.25.0 (pinned). See README for commands. This machine has no global pnpm and runs Node 26; the pinned pair lives in `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/{node/bin,bin/fallback}` (put both on `PATH`).

### Decisions already made (do not reopen without the owner)

1. **Baseline** is the `redesign/showroom` line of work (`0c41e9d`) plus this plan.
2. **Rooms are 3D-rendered** in Blender as layers and composited in the browser. No cleaned-up stock photos for demo rooms.
3. **Floors map through a per-pixel world-position layer** (not a fitted homography) for exact scale and any laying angle. Existing homography scenes must keep working until retired.
4. **Rendering stays client-side** (Web Worker + Canvas 2D fallback), instant and offline. A server is used **only** where it measurably does better, i.e. customer-photo processing in Phase 5.
5. **Real supplier décors** (one brand the target showrooms sell, e.g. Egger / Kronotex / Classen), sourced from official décor downloads or the showroom. Never from competitors' visualizer endpoints. Private pitch use only until written permission exists.
6. **Upload = AI first guess + manual touch-up + perspective grid** (the Roomvo/Egger pattern).
7. **Keep from Codex's plan:** the labelled-JPEG export spec (Phase 4), asset provenance discipline, board-aligned seamless atlases, and full verification runs.

### Key files

- Renderer: `src/lib/studio/render/{kernel,homography,sampling,lighting,color,composite,cache}.ts`, `src/workers/studio.worker.ts`, `src/lib/studio/render-controller.ts`
- Scene loading: `src/lib/studio/asset-loader.ts` (`unifyDoorAssembly`), `src/lib/studio/types.ts`
- State/URL: `src/lib/studio/state.ts`, `src/lib/studio/query.ts`
- UI: `src/components/studio/{StudioClient,StudioStage,StudioPanel}.tsx`, `src/styles/studio.css`
- Data: `brand/materials.json`, `brand/products.json`, `brand/asset-sources.json`, `src/lib/data/{types,schemas,validate}.ts`
- Scene authoring: `brand/assets/scenes/<id>/` (`calibration.json`, `AUTHORING.md`), `scripts/prepare-scenes.ts` (`STUDIO_SCENES`), `scripts/author-photo-scene.mjs`
- Verification: `scripts/verify-*.ts`, `verification/budgets.json`, `scripts/render-fixtures.ts`, `scripts/render-preview.ts`

### Rules for every session

- Work only on the phase you were asked for. Stop at its gate.
- Run the full check before declaring done: `pnpm lint && pnpm typecheck && pnpm test && pnpm validate:data && pnpm verify:assets && pnpm assets:scenes --check && pnpm build && pnpm verify:export && pnpm verify:budgets`. Report real output; never claim a pass you did not see.
- Visually verify in the built-in browser at iPad (1024×768 and 768×1024), laptop (1440×900) and phone (390×844). Save screenshots to `docs/review/phase-N/`.
- Record every new asset (URL, author, licence, hash, transformation) in `brand/asset-sources.json`.
- Keep all three locales complete. Keep `demoMode: true`.
- Commit directly on `main` (never create branches or worktrees; see `AGENTS.md`) with clear messages. Do not push unless the owner asks.
- At the end, update the **Status** table and append to the **Handoff log**.

---

## Phase 1 — One 3D proof room

**Goal:** prove that a Blender-rendered, furnished room composited by our renderer looks clearly more real and sharper than today's rooms, before investing in more.

### Tasks

1. **Blender room builder** (`tools/blender/build_room.py`, run with `blender --background --python`):
   - Parametric shell in metres: floor, walls, ceiling, one window, and a door opening sized to Kosovo standard (leaf 900×2000 mm, rough opening 205 cm).
   - Real-millimetre casing (2200×70×16 profile) and skirting (2400×80×16), matching current trim products.
   - Door leaf as its own object with handle and hinges as protected objects.
   - Furniture from Poly Haven CC0 models: sofa or armchair, table, rug, plant, lamp. At least one piece must stand on and occlude the floor in the foreground.
   - Lighting: a Poly Haven CC0 HDRI through the window plus a soft fill. Use Cycles on the Metal GPU.
   - Camera at standing eye height (~1.55 m), with a slightly wide lens and a composition that shows door, floor and furniture.
2. **Layer renderer** (`tools/blender/render_layers.py`). One script renders all passes for a room:
   - `base`: beauty render with editable surfaces in neutral materials.
   - **Lighting plates** per editable surface from Cycles `Diffuse Direct + Diffuse Indirect` (colour-independent light, with real contact shadows and GI). This replaces hand-cleaned plates.
   - **Reflection plates** from `Glossy Direct + Indirect`, scaled at runtime by each material's gloss. This fills the currently `null` specular fields.
   - **Masks** via object index or Cryptomatte for `floor`, `door-leaf`, `frame-*`, `skirting-*` and `protected`, anti-aliased, with partitioned coverage (same conventions as `BUILD_PLAN.md` §6.2).
   - **World-position pass** for the floor (and door plane), quantised to 16-bit PNG (or half-float). Precision must be ≤ 0.5 mm across the room.
   - Optional AO pass. A per-room `render-manifest.json` records the Blender version, sample count, seed and camera.
3. **Importer** (`scripts/import-rendered-scene.ts`): converts the Blender output into a scene under `brand/assets/scenes/<id>/` in the existing format, extended with `positionMap` and `reflection`. Wire it into `scripts/prepare-scenes.ts`.
4. **Renderer upgrades** (keep homography scenes working):
   - New floor mapping mode `position-map`: world xy → board coordinates → atlas lookup. This supports arbitrary laying angle (0/45/90 for now) and the existing herringbone/chevron patterns.
   - **Per-plank variation:** a seeded hash of the plank index picks one of N plank images, so there is no visible repeat. Today the atlas repeats every 16 boards.
   - Specular/reflection term from the reflection plate × material gloss.
   - Scene resolution 2400×1800 for laptop/PC, a lighter variant for iPad/phone, with progressive `preview` → `settled` (already in `RenderJob.quality`). Measure memory against the existing 96 MiB controlled-array bound and update the bound deliberately if needed.
5. **Proof content:** the new room (`living-render-01`) with the existing 5 floors and 6 opaque finishes. Use existing textures for now, but at higher atlas resolution where possible (target ≥ 1.5 px/mm).

### Gate (owner approves before Phase 2)

- Side-by-side screenshots at 100% zoom on iPad and laptop: new room vs current `living-standard` vs Quick-Step reference (`docs/research/screens/quickstep.jpg`).
- Check: furniture occludes the floor correctly; contact shadows survive; the floor shows sheen; the planks are sharp up close; there is no visible repeat; the door edges are clean.
- Switching floor/door stays instant (record timings with `?debug=1`).
- All checks pass, or failures are reported honestly.

**Out of scope:** new décors, new door models, UI redesign, upload.

---

## Phase 2 — Real supplier décors and door models

**Goal:** the showroom owner recognises real products, and different doors look like different doors.

### Tasks

1. Ask the owner which brand and which target showroom. Obtain 6–8 floor décors and 6 door finishes from official décor downloads or the showroom, plus article data: code, size, thickness, AC class, bevel.
2. **Décor → plank atlas tool:** cut scans into individual planks at 1–2 px/mm, with N variants per décor, board-aligned and seamless. Store per-product gloss, bevel, board size and pattern.
3. **Door models** in Blender: flat, grooved/panel and glass-insert, plus a **flush filomuro** door. Each renders its own layer set in the proof room. Add a door-model choice separate from finish in data, state, URL and UI.
4. Fix the orphaned hidden-door products (`dera-kashmir`, `dera-antracit`) by giving them the filomuro model.
5. Provenance and licence notes for every décor. Mark "private pitch only" where no written permission exists.

**Gate:** the owner reviews each décor in the proof room on iPad and laptop. Door models switch correctly with all trim modes.

---

## Phase 3 — More rooms

**Goal:** 6–8 furnished rooms that feel like aspirational homes.

### Tasks

1. Using the Phase 1 tools: kitchen-dining, bedroom, hallway, filomuro hallway, kids' room, and optionally a bathroom (water-resistant décors only). Optional paid scene or furniture pack, but total spend stays ≤ $25.
2. A room-type filter in the room picker. Floor/door compatibility rules per room (`compatibleSceneIds`).
3. Offline pack strategy: the current limit is 20 MiB and new rooms are about 4 MB each. Either raise the limit or make saving per-room. Document the choice in `verification/budgets.json`.
4. Retire or keep the old generated rooms (owner decides).

**Gate:** the owner approves every room. Budgets pass with the new limits.

---

## Phase 4 — Studio rebuilt for presenting

**Goal:** a sales rep can drive a confident demo on iPad or laptop.

### Tasks

1. A full-screen presentation mode, with the panel as a collapsible drawer on iPad landscape and portrait.
2. **Tap-to-select:** tapping the floor or door in the image opens that surface's choices (hit-test via the masks).
3. Zoom and pan (pinch and wheel), sampled at full resolution.
4. A/B compare of two combinations (split slider), in addition to the existing compare-with-original.
5. A product card with real article details and a link to the catalog product page.
6. **Download image** (Codex spec):
   - `exportStudioImage(catalog, selection, locale): Promise<Blob>`.
   - Captures an immutable completed selection and renders it with an isolated controller.
   - JPEG at 0.92 quality with a branded label strip (room, floor, door, frame, skirting, illustrative notice).
   - Works offline, with progress, retry and cleanup.
7. Share link plus a **QR code** that moves the current combination from the showroom screen to the customer's phone.
8. Optional lightweight analytics hook: which combinations are tried. Off in demo mode unless the owner enables it.

**Gate:** the owner runs a 3-minute mock pitch on iPad and laptop without help.

---

## Phase 5 — Own-room photo upload (AI + touch-up)

**Goal:** a customer's own room photo produces a believable floor replacement. Reliability comes from human correction, not from trusting the model.

### Tasks

1. **Intake:** file, camera or drag-drop; HEIC; EXIF orientation; resize to 2048 px max (Egger's size). Process on the device by default.
2. **Floor segmentation behind an interface** (`segmentFloor(image) → mask`):
   - (a) an in-browser model (ONNX Runtime Web / WebGPU, ADE20K floor class);
   - (b) a server model on free serverless GPU credits (stronger segmentation, optionally plus depth).
   - Benchmark both on ~20 real Kosovo room photos (owner supplies them) and pick (b) only if it is clearly better.
3. **Touch-up editor:** brush, eraser, undo/redo, and edge snapping, sized for touch.
4. **Perspective grid:** four draggable corners, with an initial guess from vanishing lines or depth. A visible plank-scale preview so the user can sanity-check size.
5. **Lighting plate from the photo:** low-frequency luminance from the original floor with grain suppressed. Document the limits (strong original patterns may ghost).
6. Render through the same kernel (homography path). Floors only in this phase.
7. **Privacy:** photos stay on the device unless the server path is chosen and disclosed.

**Gate:** about 20 test photos scored by the owner as acceptable/unacceptable, with ≥ 80% acceptable after touch-up.

---

## Phase 6 — Pitch kit

1. Rebrand for the chosen target showroom (`brand/`), with their décors and contacts in demo mode.
2. A 3-minute demo script and a one-page pricing/offer draft (owner decides the pricing).
3. Deploy only when the owner explicitly asks.

---

## Handoff log

Append one entry per session: date, phase, commit, what changed, check results (real output), screenshots, open issues, and the exact next step.

- 2026-10-13 — Planning session. Competitor research (REA) and plan written. No code changed. Next: Phase 1.
- 2026-10-13 — **Phase 1 (one 3D proof room)**, branch `studio/phase-1-proof-room`, commit `8dd0121`. Status: awaiting review.
  - **Built:** `tools/blender/` (pinned CC0 Poly Haven inputs with md5/sha256 lock: sofa_03, mid_century_lounge_chair, modern_coffee_table_01, side_table_01, throw_pillows_01, modern_ceiling_lamp_01, potted_plant_02, wool_boucle rug texture, kloofendal_48d_partly_cloudy HDRI; 66 MB, $0). `build_room.py` builds a 5.2 × 6.0 × 2.7 m living room at true scale (leaf 900×2000×40 in a 1000×2050 opening, casing 70×16 mitred, skirting 80×16, lever handle + hinges as protected objects, window with sheer curtains, procedural sideboard/print), level 21 mm camera at 1.55 m with lens shift. `render_layers.py` renders three Cycles/Metal passes at 2400×1800, 512 spp, seed 1729, adaptive off, OIDN (light 395 s, light-dim 338 s, gloss 276 s): AOV coverage masks (antialiased, jointly quantised, sum ≤ 255), light plates = diffuse light of a 50 % grey pass (real contact shadows/GI, constant tint stored), reflection plates from a black-dielectric pass, base = light pass minus each surface's share (exact at edges from the 25 % grey pass, furniture bounce change removed), 16-bit floor position map (one sample / 4 px). Holdout passes were tried and rejected (Cycles shows holdouts black in reflections). `scripts/import-rendered-scene.ts` → `brand/assets/scenes/living-render-01/` + provenance (`renderInputs` in the ledger). Renderer: `position-map` floor mode (straight + procedural herringbone at +45°, any laying angle; chevron falls back to the atlas), per-board plank image (seeded hash, flips) + tone, antialiased bevel/joint shading, reflection × gloss, true-zero shadows, shared tone shoulder, partitioned masks, half-resolution variant for frames ≤ half the scene width, preview → settled when frames are slow (> 160 ms), row/pixel surface culling. Plank sheets for all 5 floors (`scripts/author-plank-sheets.ts`). New room is the first Studio tab; `dera-bardhe`, `dera-lis` and the 5 floors are compatible.
  - **Measured:** position map vs Cycles Position pass median 0.0015 mm / p99 0.008 mm; reconstruction from the 4-px map max 0.22 mm (budget 0.5). Base edge clamp p99 0.054, max 0.087 linear. Kernel (Node, one thread): new room 2400 px 545 ms, 1800 px 330 ms, phone variant 1200 px 160 ms; existing rooms 737 → 287 ms at 1600 px from the culling, outputs byte-identical (`assets:scenes --check`). Browser (`?debug=1`, laptop 1440×900, 1928-px frames, worker): floor switch shows the preview at ~225 ms, sharp frame ~670 ms (worker render ~440 ms); `living-standard` at its 1600 cap settles ~380 ms. Memory (analytical bound): rendered full 220 MiB (new explicit `ownedRenderBuffersRenderedFull` 240 MiB, laptop/PC only), phone variant 112 MiB (< 200 MiB). First useful bytes 1.81 MiB (< 2.5); offline pack 12.1 MiB (< 20).
  - **Checks (real output):** `pnpm lint` clean; `typecheck` clean; `test` 16 files / 134 tests passed; `validate:data` "12 products, 4 scenes; demo=true"; `verify:assets` passed (4 scenes, 117 scene assets); `assets:scenes --check` passed; `build` OK, offline pack 150 files / 12 707 921 bytes; `verify:export` passed; `verify:budgets` "67 checks; 0 failures".
  - **Screenshots** (local, `docs/review/` is git-ignored): `docs/review/phase-1/side-by-side-{ipad-landscape,ipad-portrait,laptop,phone}.png` (new | living-standard | Quick-Step, device pixels at 2×), per-viewport full-page and stage captures, `checks/1-6*.png` gate crops and `checks/full-*.png` (0°, 90°, 45°, herringbone, wood door).
  - **Open issues / limits:** (1) Plank detail is 1.0 px/mm native — the grain scans have no more; the ≥ 1.5 px/mm target needs real supplier scans (Phase 2). It already exceeds what the nearest board needs at 100 % (~0.6 px/mm). (2) Only 3 strips per décor (× 4 flips) for straight floors; real scans will allow more. (3) Switching is ~0.7 s to the sharp frame on laptop (preview at ~0.2 s); multi-worker rendering would cut it but needs more memory or cross-origin isolation. (4) Furniture styling (chesterfield sofa, plaid rug) is less aspirational than Quick-Step; worth restyling in Phase 3. (5) The compare label still says "original photograph" for a render (Phase 4 copy). (6) `skirting-left` is hidden behind the sofa and not exported. (7) On phones the door is small in this wide composition.
  - **Next step:** owner reviews the side-by-sides and gate crops on iPad and laptop and approves (or lists changes). Then Phase 2: ask which brand and showroom, and obtain 6–8 real décors + 6 door finishes.
- 2026-10-13 — **Repository consolidated onto `main`.** Phase 1 (`8dd0121`, `fce864d`) was fast-forwarded into `main`; all other branches and worktrees were removed. From now on every phase is committed directly on `main`.
