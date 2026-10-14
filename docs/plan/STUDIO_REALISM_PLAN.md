# Studio realism plan

Living plan for making the Studio good enough to pitch as a paid service. Each phase runs in its **own chat session**. A session reads this file, does exactly one phase, updates the status table and handoff log at the bottom, commits, and stops at the phase gate for the owner's review.

Research behind this plan: [../research/VISUALIZER_COMPETITORS.md](../research/VISUALIZER_COMPETITORS.md). Original product brief: `doors_laminate_catalog.md` and `BUILD_PLAN.md` on `main` (`82697de`). Earlier verification: `docs/archive/`.

## Status

| Phase | Title | Status | Commit (on `main`) | Gate approved |
|---|---|---|---|---|
| 1 | One 3D proof room | done | `8dd0121` | 2026-10-13 (owner) |
| 2 | Real supplier décors and door models | done | `6dcac3d` | 2026-10-14 (owner) |
| 3 | More rooms | awaiting review | `97aacc9` | |
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
- Blender rooms (Phase 3): `tools/blender/rooms/<id>.py` (one module per room), `tools/blender/{build_room,render_layers,room_spec,kit,props,render_rooms,add_assets}.py`, `scripts/import-rendered-scene.ts` (`ROOMS`: names, room type, product rules), retired photo rooms as fixtures in `scripts/legacy-scenes.ts`
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
- 2026-10-13 — **Phase 1 gate approved by the owner** ("the new studio looks awesome"). Phase 1 is done. Next: Phase 2, which starts by asking the owner for the supplier brand, target showroom and décor/door sources. If those are not ready, the owner may choose to run Phase 3 first (rooms would then need re-rendering for the Phase 2 door models).
- 2026-10-13 — **Phase 2 (real supplier décors and door models)**, on `main`, commit `6dcac3d`. Status: awaiting review.
  - **Brand (owner: "pick Kronotex or Egger, it should look good and real"): KRONOTEX** (SWISS KRONO TEX, Heiligengrabe, DE). Regional evidence (official retailer sites only): Verona Laminat, Gjilan (lists Kronotex Robusto décors next to Krono Original/Egger/Kaindl), Vrohoriti Tirana, Merkur Slovenia. Chosen because the official product pages publish article data and a top-down "Area frontal" décor image (4725×7559 px, ≈2.35 px/mm); no comparable official Egger/Kaindl scans were found. No visualizer endpoint was used. No reuse licence on the site → every décor is `private-pitch-only` (data `decor.usage`, ledger `usageBasis`, product evidence note).
  - **Décors (8):** Robusto 12 mm 1375×188: D4955 Premium Eiche Natur (default floor), D4954 Premium Eiche, D80582 Norfolk Oak Beige, D80612 Norfolk Oak Kaffee, D4956 Premium Eiche Grau; Exquisit 8 mm 1380×193: D4763 Pettersson Eiche Beige; Mammut 12 mm 1845×188: D3179 Everest Oak Weiß, D81162 Eiche Eleganz Creme. All V4 (4-sided V-groove). Robusto/Mammut formats and AC5 / class 33 confirmed by the technical datasheets. **D4763: the product page says AC5/33 but the Exquisit datasheet (rev 8) says AC4/32 — the data uses AC4/32 until the supplier confirms.** D3073 Phalsbourg and D4765 Pettersson Grau were dropped with the owner's approval (their images showed only 2 complete boards) and replaced by D4954/D4956. Manifest: `tools/decors/kronotex.json`.
  - **Downloads (all approved, $0):** Poly Haven CC0 render inputs re-fetched (40 files, 66.1 MB, md5-verified, lock unchanged); 10 Kronotex décor images (≈74 MB; 2 later discarded) and 3 datasheets (≈1 MB) into git-ignored `tools/decors/.cache/kronotex/`.
  - **Décor tool** `scripts/import-decors.ts`: comb fits for long-side joints (board width) and end joints (board length) measure x and y scale separately (some official images are 2–3 % anisotropic; corrected on resampling), cuts complete boards inset 2 mm past the printed groove, drops near-duplicates (décor print repeats), keeps 6 unique boards per décor (8–15 complete boards found), writes plank sheet (1.5 px/mm, never upscaled; native 2.29–2.36), a seamless 4×4 board atlas (homography rooms) and a skirting texture, and upserts collections (`decor` provenance) and products. Brand swap = new manifest + one command. Sheets ship as WebP q90. The four generated demo floors were removed (products, collections, textures, images, ledger); the herringbone demo stays. Catalog images per décor: `scripts/author-decor-images.ts` (proof-room render + boards from above, both own derivatives).
  - **Door models:** `tools/blender/room_spec.py` `DOOR_MODELS` — flat; grooved (4 horizontal milled grooves 8×3 mm); glass-insert (centred 260×1500 mm satin glass, boolean-cut leaf, lit corridor behind); filomuro (flush with the wall, concealed aluminium frame, no casing, hidden hinges, skirting runs to the opening). Each rendered at 2400×1800, 512 spp, seed 1729 (light/light-dim/gloss ≈ 366/321/272 s per model). Importer: one shared region (598×862 px at 1118,184) holds every model's crops (`doorModels` in the scene, `door-models.json`); border mismatch vs flat: masks 0, light ≤1, base ≤4 levels of 255; 2 stray mask pixels outside the region (filomuro, keep flat coverage). Loader pastes crops on full load and switches model from the prepared scene; a test proves both give byte-identical layers at scale 1 and 0.5.
  - **Data/state/URL/UI:** `materials.doorModels`, product `modelIds`/`defaultModelId`, `selection.doorModelId`, `model=` in the URL (old links fall back to the line's default model), model picker with line icons, concealed-frame label for filomuro (frame mode inert), model in the inquiry message, catalog specs list models and the décor code. `dera-kashmir` and `dera-antracit` are filomuro and now usable in the 3D room. Finishes: white, cream (new), light grey (new), cashmere, anthracite, natural oak CPL, grey oak CPL; dark walnut removed.
  - **Measured (browser, laptop 1440×900, `?debug=1`):** model switch preview 0.32–0.45 s (patch prepare 156–270 ms), sharp frame ≈0.5 s later; first load prepare 0.64 s. Kernel (Node) full 2400×1800 render 0.50–0.61 s. First useful bytes 3D room 2,400,468 (< 2,621,440); offline pack 18,692,456 bytes (< 20 MiB). Owned-buffer bound (analytical): 3D room full 307 MB — **`ownedRenderBuffersRenderedFull` raised deliberately 240 → 320 MiB** (real plank sheets ≈19 MB mip chain each, held twice + incoming; a model switch briefly holds two scenes; now counted); phone variant 170 MB (< 200 MiB); photo rooms 179–202 MB (< 200 MiB).
  - **Checks (real output):** `pnpm lint` clean; `typecheck` clean; `test` 17 files / 138 tests passed; `validate:data` "16 products, 4 scenes; demo=true"; `verify:assets` passed (4 scenes, 215 scene assets, 32 sources / 320 derivatives); `assets:scenes --check` passed; `build` OK, offline pack 248 files / 18,692,456 bytes; `verify:export` passed (55 pages); `verify:budgets` "83 checks; 0 failures".
  - **Screenshots** (local, `docs/review/` is git-ignored; this phase in `docs/review/phase-2/studio-realism/` because `phase-2/` holds an older plan's captures): `viewport-{laptop,ipad-landscape,ipad-portrait,phone}.png` (2×), `model-{flat,grooved,glass-insert,filomuro}-{laptop,ipad-landscape}.png`, `model-filomuro-phone-sq.png`, `door-models-x-trim.png` (each model × frame door/floor/black, 1:1 crops) plus `door-*-2400.png`, `decors-in-room.png`, `decors-near-floor-1to1.png`, and `decors/kronotex-*-{laptop,ipad-landscape}.png` + `kronotex-*-room-2400.png`.
  - **Open issues / limits:** (1) Décor use is private pitch only until written permission from SWISS KRONO or the showroom. (2) D4763 AC class conflict (page vs datasheet) — confirm with the supplier. (3) Light décors read slightly warmer in the room than the swatches (room daylight tint). (4) The lit glass strip's faint reflection in the window frame is not carried into the patch. (5) Door models exist only in the 3D room; photo rooms show their authored door (flat, or the all-glass insert). (6) Choosing a finish the current line lacks can switch line and model (e.g. grey oak from filomuro → flat). (7) Phone frames still show a small door (Phase 1 limit).
  - **Next step:** the owner reviews each décor and each door model on iPad and laptop (screenshots above, or `pnpm preview` → Studio) and approves or lists changes; then Phase 3 (more rooms), which should render every room with `DOOR_MODELS`.
- 2026-10-14 — **Phase 2 gate approved by the owner** ("visually it was acceptable"). Phase 2 is done. Owner decisions for Phase 3: retire `living-standard`, `corridor-standard` and `bedroom-photo` from the Studio; raise the offline pack limit to 48 MiB (single save); add a bathroom with fixed floor tiles (laminate never goes into a bathroom) and the normal doors; CC0 Poly Haven downloads approved ($0).
- 2026-10-14 — **Phase 3 (more rooms)**, on `main`, commit `97aacc9`. Status: awaiting review.
  - **Owner decisions (this session):** retire `living-standard`, `corridor-standard`, `bedroom-photo` from the Studio; raise the offline limit to 48 MiB (single save); add a bathroom with fixed floor tiles (laminate never goes into a bathroom) and the normal doors; CC0 Poly Haven downloads approved.
  - **Tools:** the Phase 1/2 builder was split into a shared kit (`kit.py` helpers and materials, `props.py` procedural furniture, `build_room.py` shell/window/door/skirting/lights/camera) and one module per room in `tools/blender/rooms/`. `build_room.py` and `render_layers.py` take `--room`. The living room rebuilds identically: object/material/light/camera fingerprints match the Phase 2 `.blend` files for all four models, and its re-imported layers are byte-identical (only name, description and `roomType` changed in `calibration.json`). New `render_layers.py --crop` renders non-default door models only inside a border 320 px around the default door assembly (Cycles samples per pixel coordinates and seed, so the pixels are a full render's); `render_rooms.py` runs a room's models; `add_assets.py` pins Poly Haven files with their published md5.
  - **Rooms (all 2400×1800, true scale, 512 spp, seed 1729, all four door models):** `kitchen-render-01` (4.6 × 6.2 m, L-shaped sage kitchen, dining table for four, daylight); `bedroom-render-01` (4.2 × 4.8 m, upholstered double bed, nightstands, dresser with round mirror, linen curtains; default door Lis natyral); `hallway-render-01` (1.7 × 5.6 m, no window, three ceiling spots, console + mirror, bench, shoe cabinet); `hallway-render-02` (2.4 × 5.0 m entrance, **filomuro is the default model**, oak slat panel, linear ceiling light, floating console with LED; default door `dera-kashmir`); `kids-render-01` (3.6 × 4.3 m, single bed, bookcase, desk, round rug with toys, paper lantern, sage wall); `bathroom-render-01` (2.6 × 3.3 m, procedural marble-look 60 × 60 floor and 60 × 120 wall porcelain, bathtub with screen, floating vanity, backlit mirror; **no editable floor or skirting**, only leaf and casing). With the living room that is 7 rooms. Furniture: 13 new pinned CC0 inputs (dining_chair_02, potted_plant_04, ceramic_vase_01/03, rough_linen, painted_wooden_nightstand, hanging_picture_frame_01, anthurium_botany_01, brass_vase_01, rubber_duck_toy; downloaded but unused and removed from the manifest: Shelf_01, wooden_stool_02, side_table_tall_01, terry_cloth, grey_cartago_01, whose textures turned out plaid/rusty or rustic); beds, kitchen, bookcase, consoles, vanity, tiles, lamps, prints modelled in code. Spend $0.
  - **Render time (M4 Metal):** 24 renders, 12,274 s total: full default models 828–1,641 s, cropped models 201–543 s (about 25–33 % of a full render). Patch-border checks vs the full default render (door-models.json): masks 0 everywhere; light plates ≤ 5 levels of 255 (ring p99 ≤ 2); base ≤ 16 levels except single anti-aliased furniture-edge pixels (kids' room grooved: 1 pixel at 55, filomuro: 3 pixels ≤ 27; ring p99 ≤ 3), where unpremultiplying amplifies noise; neutral renders differ ≤ 5 levels on the border.
  - **Data / app:** `RoomScene.roomType` (living, kitchen, bedroom, hallway, kids, bathroom) and a room-type filter (chips, SQ/EN/DE) above the room thumbnails. Product rules per room are written by the importer into `compatibleSceneIds`: every opaque door line (bardhe, lis, kashmir, antracit) in every room, every published floor in every room except the bathroom. In a room without laminate the floor tab, skirting control and the floor/skirting/direction inquiry lines are hidden, the summary reads "Tiles – laminate does not go into bathrooms", the frame offers door/black only, and the visitor's floor choice is kept for the next room. Door products' "Try in Studio" opens the first room drawn with their own model (flush doors → the filomuro hall). Importer fix: a surface patched by one door model is now patched by every model (the default's crop where it keeps the default), so switching models never leaves another model's pixels behind.
  - **Retired rooms:** not published any more (`prepare-scenes` deletes stale `public/media/scenes/*`, including the old `corridor-hidden` output). Their folders stay as fixtures for the homography floor path and the all-glass insert (`scripts/legacy-scenes.ts`, used by the glass, loader and controller tests and the synthetic golden fixture).
  - **Offline:** single pack, limit 20 → 48 MiB (`brand.json` and `verification/budgets.json`, decision recorded there as `studioOfflinePackDecision`). Measured pack 30,780,518 bytes (855 files).
  - **Measured:** kernel (Node) 2400×1800 frame 108–758 ms per room. Browser (headless Chrome, software GL, laptop 1440×900, 1928-px frames, `?debug=1`) in the kitchen: model switch preview 0.42–0.57 s, sharp 0.91–1.06 s; floor switch preview 0.30 s, sharp 0.78 s; switching to a not-yet-loaded room 1.56 s (kids), to the bathroom 0.47 s. First useful bytes 0.55–2.48 MB (living 2,476,512, unchanged; < 2,621,440). Owned-buffer bound (analytical, `scripts/profile-studio-assets.ts`): full 272–295 MiB (< 320 MiB), light variant 98–163 MiB (< 200 MiB). Editable floor share of the frame: kitchen 38.6 %, living 27.8 %, kids 23.4 %, filomuro hall 22.1 %, bedroom 15.7 %, hallway 15.4 %, bathroom 0 %.
  - **Checks (real output):** `pnpm lint` clean; `typecheck` clean; `test` 17 files / 146 tests passed; `validate:data` "16 products, 7 scenes; demo=true"; `verify:assets` passed (7 scenes, 820 scene assets, 32 sources / 320 derivatives); `assets:scenes --check` passed; `build` OK, offline pack 855 files / 30,780,518 bytes; `verify:export` passed (55 pages); `verify:budgets` "89 checks; 0 failures".
  - **Screenshots** (local, git-ignored, `docs/review/phase-3/studio-realism/` because `phase-3/` holds an older plan's captures): `all-rooms-sheet.png` and `rooms/<room>-2400.png` (each room with a different Kronotex décor and door), `door-models-by-room.png` plus `models/<room>-<model>-1to1.png` (every room × flat/grooved/glass-insert/filomuro, light grey), `viewports/{laptop,ipad-landscape,ipad-portrait,phone}-<room>.png` (28, SQ, 2×), `picker-filter-hallway-laptop-en.png`, `bathroom-door-only-ipad-landscape-sq.png`, `phone-kids-full-page-sq.png`.
  - **Open issues / limits:** (1) The all-glass door `dera-xham` has no Studio room since its only room (photo living room) was retired; its product page hides "Try in Studio". An all-glass door model would bring it back. (2) Beds, kitchen units and textiles are procedural and read slightly CG up close (boxy duvets/throws); Poly Haven has no modern beds or kitchens. A paid furniture pack (≤ $25) would help. (3) Mirrors and glossy furniture reflect the neutral render, so they don't follow the chosen floor or door (bedroom and hallway mirrors, bathroom mirror). (4) A fast door-model switch can differ from a full load in reflection padding bytes no mask covers (invisible; the test compares covered pixels). (5) Opening a room by `scene=` alone keeps the current door rather than the room's default finish (e.g. the hallway opens in matte white, not light grey). (6) The living room keeps its Phase 1 furniture (less aspirational than the new rooms). (7) `verification/render-fixtures/*` images of retired rooms are stale (`pnpm render:fixtures` not rerun; not part of the full check). (8) Phone frames still show a small door. (9) Décor use remains private pitch only.
  - **Next step:** the owner reviews every room (screenshots above, or `pnpm preview` → Studio: filter chips, each room, door models, floors; bathroom door-only) and approves or lists changes; then Phase 4 (Studio rebuilt for presenting).
