# Porta & Dysheme — Execution Blueprint

Planning date: 11 October 2026 (Europe/Belgrade). Status: architecture only; implementation has not started.

Read this entire document together with `doors_laminate_catalog.md` before executing a phase. The workspace contained only that specification when inspected. This plan is the sole new deliverable of the planning session. All code blocks below are future contracts, not implemented files. Paths are relative to `/Users/ibrahimi/Doors & laminate` unless absolute.

## 1. Execution contract and decisions

1. Build a catalog that opens directly onto products. No homepage hero, onboarding wizard, corporate sections, testimonials, counters, newsletter, or navigation gateway.
2. Next.js App Router, TypeScript strict mode, Tailwind CSS **v4**, static export. No server at deployment, database, accounts, API routes, external visualizer SDK, Three.js, WebGL, WebGPU, or AI inference at runtime.
3. “Zero external runtime dependencies” means no external services/CDNs/network dependencies after same-origin assets load. React/Next and the explicitly requested, locally bundled PhotoSwipe remain dependencies. Do not interpret this as banning all npm packages.
4. Three language routes: `/sq/`, `/en/`, `/de/`. Albanian is the content fallback. Stable language-independent IDs/slugs. All product pages prerendered.
5. Use **@Browser, the built-in browser** for browser research and verification. Never access Firefox or request its control. Do not silently launch a separate browser automation stack.
6. Two authored photographic scenes, fixed camera, measured planar geometry. Door leaf, frame, skirting, and floor are independent regions. Actual geometry changes select a compatible scene/door insert; they are not simulated by recoloring.
7. Primary renderer: CPU inverse homography sampling into RGBA buffers, linear-light shading, Canvas 2D presentation. Worker acceleration is an enhancement; the same pure renderer also runs in short main-thread batches. No animation loop when idle.
8. Rebrand only through `brand/` and referenced assets. JSON is validated at build time. A visualizer combination uses actual catalog IDs so title, technical data, selected thumbnail, rendered surface, and inquiry never disagree.
9. Demo mode is visible, emits noindex/nofollow, and converts **all** contact actions, including telephone, to message/contact previews. It never launches messaging apps or placeholder numbers. Copying a preview is allowed.
10. Complete exactly one authorized phase, verify it, report, then stop. A successful phase does not authorize the next phase, deployment, publication, or sending a message.
11. Phase 1 may use an explicitly temporary four-card skeleton. Phase 2 must replace it with real local preview imagery; no placeholder grid counts as a finished feed. Asset/calibration work is part of later implementation, not this planning session.
12. Product data is representative demo data unless tied to verified supplier evidence. The brief's Kosovo sizes are demo variants, not independently verified universal construction standards. Never claim every 200 cm leaf requires a 205 cm rough opening.

### Resolved ambiguities

| Brief issue | Binding implementation decision |
|---|---|
| FloorExplorer described as a visualizer | Benchmark Quick-Step **RoomViewer** for rendering UX; FloorExplorer only for filtering ideas. |
| Vendors “avoid WebGL” | Unverified vendor-internal claim. Our Canvas-only choice is a project constraint, not a researched fact about competitors. |
| Original floor luminance preserves everything | Only after removing old albedo/seams and separating reusable illumination/reflections. Raw floor luminance is insufficient. |
| Chevron / herringbone used interchangeably | Separate pattern enums and artwork. Phase 4 scene 2 defaults to **herringbone**. Chevron is not falsely labeled or enabled without its own calibrated tile. |
| Smoke glass in a finish palette | Dedicated photographic glass door insert, with its own profile, hardware, and fixed-view reflection. Never a transparent tint over an opaque door. |
| Standard versus hidden frame | Phase 4 remediation: both scenes use standard casing. Hidden-door products stay in the catalog without Studio links; living also supports its glass insert. |
| Matching frame to floor | Match a seam-free trim texture/color from the chosen floor collection, not the floor's plank-layout atlas. |
| AC / class for all floors | AC only for laminate. Usage class is separate, never inferred. Engineered parquet has wear-layer/wood information and no invented AC rating. |
| Offline unspecified | Phase 5 supplies an offline visited-page cache plus explicit “Save Studio offline”; never promise a cold offline first visit. |
| Licensing statement in brief | Demo can use commissioned/generated/appropriately licensed assets. A planning statement does not confer rights to competitors' photographs. Record provenance; do not copy benchmark assets. |

## 2. Benchmark research, evidence, and conclusions

Research used official sources and live @Browser inspection on 11 October 2026. No private photos were uploaded, account created, sample ordered, or inquiry sent. Performance was observed qualitatively; no measured competitor latency or mobile battery claims are made.

### 2.1 Live observations

| Benchmark and source | Observed or documented behavior | Adopt here | Do not infer/copy |
|---|---|---|---|
| [EGGER Floor Visualizer](https://myfloor.egger.com/) | Inspected upload/project entry and four style groups. Opened EL2242 sample kitchen, saw large room image with searchable product drawer, format labels, 284 listed items. Selecting image for EL1007 changed the active product label. Room photo shows chair-leg occlusion and floor shadows. | Fixed room, compact material list, visible active product, same camera for comparing materials. | Internal renderer and exact scale algorithm were not inspected. No assertion that switching is zero-cost or that the drawer is ideal for small phones. |
| [Roomvo flooring solution](https://get.roomvo.com/solutions/visualizer-flooring-retailers/) and [public demo](https://www.roomvo.com/my/multisurface_demo/) | Entered demo bedroom. Sample-room/upload choices; room plus product catalog; surface choices; favorites; Compare, Zoom, Share, Download. Bedroom retains furniture and window-lit floor reflections. Catalog initially showed walls. Floor-switch timing and post-switch quality were not measured. | Persistent room, obvious target surface, names alongside swatches, comparison without losing camera position. | Marketing conversion statistics are not project acceptance targets. Photo segmentation backend and blend implementation are unknown. |
| [Quick-Step RoomViewer](https://www.quick-step.co.uk/en-gb/roomviewer) | Loaded embedded living room with Brushed oak natural, SIG4763, product information, choose-room/choose-floor actions, zoom and side-by-side comparison. Saw compatibility notice in UI. | Product identity travels with image; scene compatibility is explicit; offer product detail beside visual selection. | Do not copy the large marketing header, chat overlays, icon-only toolbar, or displayed unit formatting. Interactive floor changes were not timed. |
| [Quick-Step FloorExplorer](https://www.quick-step.co.uk/en-gb/floorexplorer) | Official page describes room → look → color → requirement questionnaire. | These are useful product attributes. | Do not put a questionnaire in front of this catalog. |

EGGER's [official visualizer explanation](https://www.egger.com/en/flooring/service-information/flooring-visualiser?country=GB) documents room upload, decor changes, download, and sample/dealer next steps. It also distinguishes screen reproduction from physical sample matching. Here, use a short product-level note: “Ngjyrat në ekran janë orientuese.” Keep it out of the main catalog heading.

**Architectural inference:** the convincing effect comes from keeping camera, furnishings, occlusion, and illumination consistent while changing one surface. Our controlled two-scene implementation can reproduce that interaction without reproducing upload segmentation or any proprietary vendor pipeline.

### 2.2 Technical sources and bounded use

- [Next.js static export](https://nextjs.org/docs/app/guides/static-exports): prerender routes; `output: 'export'`; no request-time services or default image optimizer. This plan's local image pipeline and phase structure are our design choices.
- [Next.js internationalization](https://nextjs.org/docs/app/guides/internationalization) and [route groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups): language segment and separate root-layout conventions. Use the concrete route tree below.
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation): verify the supported Node/framework peer requirements at Phase 1 bootstrap. Do not use obsolete `next lint` or `next export` commands.
- [Tailwind's Next.js installation](https://tailwindcss.com/docs/installation/framework-guides/nextjs): use `@tailwindcss/postcss` and `@import "tailwindcss"`; not a v3 configuration recipe.
- [OpenCV homography explanation](https://docs.opencv.org/4.13.0/d9/dab/tutorial_homography.html): a projective transform maps one plane to an image. OpenCV is research material, **not** an application dependency.
- [W3C CSS Color 4](https://www.w3.org/TR/css-color-4/#color-conversion-code): sRGB/linear conversion convention used below.
- [W3C compositing](https://www.w3.org/TR/compositing-1/) and [Canvas composite operations](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation): multiply cannot brighten; screen brightens; destination-in applies alpha. Our production pipeline computes the lighting numerically to avoid relying on an approximate blend stack.
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas): worker canvas capability must be feature-detected; it is not required by the pure pixel kernel.
- [PhotoSwipe](https://photoswipe.com/getting-started/): image width/height metadata and on-demand lightbox module. Bundle locally.
- [Viber share documentation](https://developers.viber.com/docs/tools/share-button/): forwarding selects a recipient; documented text limit is 200 characters. It does not guarantee a prefilled message to a configured phone number.
- [EGGER laminate technical sheet](https://www.egger.com/get_download/e8d53f86-8190-4f8a-894a-49b7b907a1c2/TDS_EGGER_Laminate_Flooring.pdf?country=LT): abrasion resistance and usage class are separate fields. Do not transfer ratings to unrelated demo parquet.

## 3. System architecture and complete file map

### 3.1 Data and execution flow

`brand/*.json` → build-time schema/reference validation → static route generation → server-rendered catalog/detail HTML → small client islands for filters/favorites/inquiries → lazy Studio controller → decoded local assets → worker/pure pixel renderer → Canvas 2D.

No fetch to a third-party service in the deployed application. Runtime asset fetches are same origin only. Local JSON is imported by server/build code; pass only the subset needed by a client island. Do not bundle full calibration/assets into the feed.

Dependencies allowed: Next/React/React DOM, Fontsource Manrope, PhotoSwipe (Phase 3). Build/dev: TypeScript, ESLint/config-next, Tailwind v4/PostCSS plugin, Vitest, tsx, Sharp, Zod (validation only), Cheerio (export audit only). No component mega-library, animation framework, global state package, or service-worker generator required.

Resolve supported stable patch versions at Phase 1 and save exact versions plus `pnpm-lock.yaml`. Baseline: Next 16.x, React 19.x compatible with the chosen Next release, Tailwind 4.x, TypeScript 5.x, Node 22 LTS compatible with all resolved tooling. The live Next documentation showed 16.4.0 during research; this is not a substitute for checking registry availability/peer dependencies. Pin the actual Node patch in `.node-version` and pnpm version in `packageManager`. Subsequent phases use the frozen lockfile and do not upgrade dependencies casually.

Phase 1 verified tooling corrections (11 October 2026): the specified runtime path supplies Node 24.19.0, compatible with Next 16.4.0 (Node >=20.9), rather than Node 22; `.node-version` pins the installed patch. pnpm 11.25.0 stores dependency build approvals and `saveExact` in `pnpm-workspace.yaml`, so this small configuration file is also required. Only esbuild and unrs-resolver build scripts are approved. All package versions remain exact. These corrections do not change phase scope or acceptance criteria.

### 3.2 Final tree

Labels: P1/P2/etc. identify first creation phase. Every later edit is listed in its phase. Directory patterns in assets expand only to IDs explicitly listed in §9; do not invent more files/routes.

```text
BUILD_PLAN.md                                  planning deliverable
 doors_laminate_catalog.md                     existing specification; preserve
 .gitignore                                    P1
 .node-version                                 P1
 .npmrc                                        P1 (save-exact=true)
 package.json                                  P1
 pnpm-lock.yaml                                P1 generated
 next-env.d.ts                                 P1 generated
 next.config.ts                                P1
 tsconfig.json                                 P1
 eslint.config.mjs                             P1
 postcss.config.mjs                            P1
 vitest.config.ts                              P1
 README.md                                     P1, update each phase
 brand/
   brand.json                                  P1
   products.json                               P1 empty; P2 seed; P5 final
   materials.json                              P1 empty; P2 seed; P4 final
   asset-sources.json                          P2
   messages/{sq,en,de}.json                     P1; grow each phase
   assets/logo.svg                             P1
   assets/favicon.svg                          P1
   assets/products/{productId}/{01,02}.jpg      P2 seed / P3 gallery / P5 final
   assets/scenes/{sceneId}/                    P4; exact inventory §8
   assets/textures/doors/{finishId}.png         P4 for three wood finishes listed in §9
   assets/textures/floors/{collectionId}/
     atlas.png                                 P4
     trim.png                                  P4
 scripts/
   validate-data.ts                            P1
   prepare-images.ts                           P2
   prepare-scenes.ts                           P4
   render-fixtures.ts                          P4
   verify-export.ts                            P1
   verify-assets.ts                            P2
   verify-budgets.ts                           P5
   finalize-export.ts                          P1; P5 adds SW
   serve-export.mjs                            P1
 src/
   app/
     globals.css                               P1
     (entry)/
       layout.tsx                              P1 root layout for /, lang=sq
       page.tsx                                P1 immediate /sq/ client replacement + fallback link
     [locale]/
       layout.tsx                              P1 root layout for localized routes, lang=locale
       page.tsx                                P1 shell; P2 feed
       not-found.tsx                           P1 localized navigation/error
       products/[slug]/page.tsx                 P3
       studio/page.tsx                         P4
   components/
     shell/{AppShell,Header,LanguageMenu,MobileContactBar,DemoBadge}.tsx P1
     ui/{Icon,Dialog,ResponsiveImage,EmptyState}.tsx                   P1 except ResponsiveImage P2
     catalog/{CatalogClient,CategoryPills,ProductGrid,ProductCard,FavoriteButton}.tsx P2
     product/{ProductGallery,ProductSpecs,ProductVariants,RelatedProducts}.tsx P3
     inquiry/{InquiryProvider,InquiryDialog,InquiryButton}.tsx         P1
     studio/{StudioLoader,StudioClient,ScenePicker,StudioCanvas,SurfaceTabs,MaterialPicker,TrimControls,CombinationSummary,RenderStatus}.tsx P4
     offline/{OfflineProvider,OfflineStatus,SaveStudioOffline}.tsx     P5
   lib/
     data/{types,schemas,load,validate}.ts       P1
     i18n/{locales,messages,format}.ts          P1
     brand/{theme,metadata}.ts                 P1
     catalog/{selectors,query}.ts              P2
     favorites/{store,useFavorites}.ts         P2
     inquiry/{types,message,links}.ts          P1
     media/{types,paths}.ts                    P2
     studio/{types,state,query,compatibility,asset-loader,render-controller}.ts P4
     studio/render/{color,homography,sampling,lighting,composite,kernel,cache}.ts P4
     offline/{register,messages}.ts            P5
   workers/studio.worker.ts                    P4
   service-worker/sw.ts                        P5; compiled by finalize-export
 tests/
   data.test.ts                                P1
   i18n.test.ts                                P1
   inquiry.test.ts                             P1
   export.test.ts                              P1 (unit tests for verifier helpers)
   catalog.test.ts                             P2
   favorites.test.ts                           P2
   media.test.ts                               P2
   product.test.ts                             P3
   studio-state.test.ts                        P4
   homography.test.ts                          P4
   color.test.ts                               P4
   composite.test.ts                           P4
   sampling.test.ts                            P4
   offline.test.ts                             P5
   fixtures/{brand,products,materials}.json     P1 minimal valid/invalid test inputs
   fixtures/render/{fixture.json,base.png,mask.png,light.png,atlas.png,expected.png} P4
 public/                                       generated/copied; don't hand-edit derivatives
   brand/{logo.svg,favicon.svg}                 P1
   media/products/{productId}/...               P2/P3/P5
   media/scenes/{sceneId}/...                   P4
   media/textures/...                           P4
 verification/
   phase-1.md                                  P1
   phase-2.md                                  P2
   phase-3.md                                  P3
   phase-4.md                                  P4
   REPORT.md                                   P5
   asset-manifest.json                         P2 generated
   scene-manifest.json                         P4 generated
   image-manifest.json                         P2 generated
   browser-checklist.md                        P1, grow each phase
   screenshots/                                each phase, names specified below
   render-fixtures/                            P4 generated
   budgets.json                                P5
   performance.json                            P5 measured evidence
   dependency-versions.txt                     P1
 out/                                          generated static export, ignored
```

Use ordinary native `<a>` links for inter-route navigation from Phase 1 onward; filters and Studio controls still update in place through the History API. This keeps static/offline navigation explicit and avoids an untested RSC prefetch cache.

No `src/app/layout.tsx`: two roots deliberately ensure EN/DE `<html lang>` is correct in the exported HTML. Both root layouts import globals and share AppShell behavior. `/` belongs only to `(entry)`; no competing page inside another group. Localized root layout awaits `params: Promise<{locale: string}>`, validates locale, implements `generateStaticParams()` for all three locales, sets `dynamicParams=false`, and returns `<html lang={locale}>`. Product routes statically enumerate all product slugs under each locale. Do not read request cookies, headers, or server searchParams.

Root `/` is a tiny static entry document with a normal `/sq/` link and client `location.replace('/sq/' + allowedQuery)` after mount. It is not a language chooser and does not wait for geolocation. Do not add Next redirects/middleware. `finalize-export.ts` writes a deterministic standalone `out/404.html` with escaped brand title, correct noindex and three locale links; it must work without a root App Router layout. Static host must return this with HTTP 404 rather than SPA-fallback 200.

### 3.3 Component boundaries

Server/build: JSON loading/validation, localization dictionaries, metadata, theme serialization, route generation, product content/specs/related data. Client: interactive header language menu, favorites, filter state, inquiry preview, product variants/lightbox, Studio, offline status. Never pass functions from server props to client; pass serializable data. Never import `fs`, Sharp, Zod, or catalog-wide source images into client code.

## 4. Authoritative TypeScript data contracts

Implement these shapes in `src/lib/data/types.ts` and matching strict Zod schemas in `schemas.ts`. All JSON roots have `schemaVersion: 1`. `type` unions below are intentional; interfaces alone cannot enforce conditional fields. Runtime validation must enforce constraints that TS aliases cannot.

```ts
export type Locale = 'sq' | 'en' | 'de';
export type LocalizedText = { sq: string; en?: string; de?: string };
export type Id = string;                       // /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export type HexColor = `#${string}`;           // runtime: exactly six hexadecimal digits
export type LocalAssetPath = string;           // /media/... or /brand/...; optional ?rev=<hex>; no traversal/remote URL
export type Vec2 = readonly [number, number];
export type Quad = readonly [Vec2, Vec2, Vec2, Vec2];
export type Mat3 = readonly [number,number,number,number,number,number,number,number,number];
export type RGB = readonly [number, number, number]; // linear RGB, unless name says Srgb
export type TrimMode = 'door' | 'floor' | 'black';
export type FrameType = 'standard-casing' | 'concealed-aluminium' | 'slim-aluminium';
export type FloorPattern = 'straight' | 'herringbone' | 'chevron';
export type ACClass = 'AC4' | 'AC5';
export type UsageClass = 32 | 33;
export type OriginCountry = 'DE' | 'SI' | 'TR' | 'CN' | 'AT' | 'CH' | 'XK';
export type CategoryId = 'all' | 'interior-doors' | 'hidden-doors' | 'laminate' | 'parquet' | 'trim';

export interface BrandConfig {
  schemaVersion: 1;
  id: Id;
  companyName: string;
  shortName: string;                          // <= 18 characters for 320px header
  tagline: LocalizedText;                    // metadata/footer only, never hero
  logo: { src: LocalAssetPath; width: number; height: number; alt: LocalizedText };
  favicon: LocalAssetPath;
  colors: { primary: HexColor; accent: HexColor; background: HexColor };
  contact: { phone: string | null; whatsapp: string | null; viber: string | null };
  siteUrl: string | null;                    // null in local demo; HTTPS origin in live build
  city: LocalizedText;
  locales: readonly ['sq', 'en', 'de'];
  defaultLocale: 'sq';
  demoMode: boolean;
  demoNotice: LocalizedText;
  catalogVersion: string;
  offline: { enabled: boolean; maxStudioDownloadBytes: number };
}

export interface ImageRef {
  id: Id;
  source: string;                            // brand/assets/... build input; stripped from client
  alt: LocalizedText;
  focalPoint: Vec2;                          // normalized 0..1, card crop only
  role: 'room' | 'product' | 'detail';
}
export interface Evidence {
  status: 'demo' | 'supplier-verified';
  sourceUrl: string | null;
  checkedAt: string | null;                  // ISO date, mandatory for supplier-verified
  note: LocalizedText;
}
export interface ProductBase {
  id: Id;
  slug: Id;
  sku: string;
  name: LocalizedText;
  summary: LocalizedText;                    // <= 200 chars per locale; no invented sales claims
  originCountry: OriginCountry | null;
  manufacturer: string | null;
  imageIds: readonly Id[];                   // resolves images[]; first is cover
  relatedProductIds: readonly Id[];
  evidence: Evidence;
  displayOrder: number;
  published: boolean;
}
export interface DoorSize {
  id: Id;
  leafWidthMm: 700 | 800 | 900;
  leafHeightMm: 2000;
  leafThicknessMm: number | null;
  roughOpeningWidthMm: number | null;        // unknown unless supplier confirms
  roughOpeningHeightMm: number | null;
}
export interface DoorProduct extends ProductBase {
  kind: 'door';
  doorType: 'standard' | 'hidden' | 'glass';
  frameType: FrameType;
  construction: 'mdf' | 'solid-core' | 'solid-wood' | 'aluminium-glass';
  surface: 'melamine' | 'cpl' | 'paint' | 'glass';
  roomUses: readonly ('living' | 'bedroom' | 'bathroom')[]; // suitability is demo unless verified
  sizes: readonly DoorSize[];
  defaultSizeId: Id;
  finishIds: readonly Id[];
  defaultFinishId: Id;
  compatibleSceneIds: readonly Id[];
}
export interface FloorProduct extends ProductBase {
  kind: 'floor';
  collectionId: Id;                           // all floor engineering facts live in materials.json
  compatibleSceneIds: readonly Id[];
}
export interface TrimProduct extends ProductBase {
  kind: 'trim';
  trimType: 'architrave' | 'skirting';
  dimensionsMm: { length: number; height: number; depth: number };
  material: 'mdf' | 'wood' | 'aluminium';
  supportedModes: readonly TrimMode[];
}
export type Product = DoorProduct | FloorProduct | TrimProduct;
export interface ProductsConfig {
  schemaVersion: 1;
  images: readonly ImageRef[];
  products: readonly Product[];
}

export type SurfaceAppearance =
  | { kind: 'solid'; colorSrgb: HexColor }
  | { kind: 'texture'; texture: LocalAssetPath; physicalSizeMm: Vec2;
      grainAxis: 'u' | 'v'; fit: 'repeat' | 'stretch-leaf'; fallbackColorSrgb: HexColor };
export interface TrimAppearance {
  appearance: SurfaceAppearance;              // texture without floor seams
  specularStrength: number;                    // 0..0.2; default .02
}
export interface OpaqueDoorFinish {
  id: Id;
  kind: 'opaque';
  name: LocalizedText;
  swatchColorSrgb: HexColor;
  appearance: SurfaceAppearance;
  sheen: 'matte' | 'satin';
  specularStrength: number;                    // 0..0.2
  trim: TrimAppearance;
}
export interface GlassDoorFinish {
  id: Id;
  kind: 'glass';
  name: LocalizedText;
  swatchColorSrgb: HexColor;
  variantKey: 'smoke-glass-black';
  trim: TrimAppearance;
}
export type DoorFinish = OpaqueDoorFinish | GlassDoorFinish;

export interface FloorAtlas {
  image: LocalAssetPath;                       // seamless, orthographic, color/albedo only
  repeatSizeMm: Vec2;                          // actual world area of entire repeat, NOT one board
  repeatPixels: readonly [number, number];
  boardSizeMm: { length: number; width: number };
  pattern: FloorPattern;
  boardsPerRepeat: number;                     // authored atlas metadata; verified against artwork
  bevelWidthMm: number;                        // 0 for flat; no additional runtime seam overlay
  chevronCutAngleDeg: 45 | 60 | null;           // non-null only for chevron
}
export interface FloorCollectionBase {
  id: Id;
  name: LocalizedText;
  thicknessMm: number;
  bevel: '4v' | 'flat';
  atlas: FloorAtlas;
  trim: TrimAppearance;
  swatchColorSrgb: HexColor;
  specularStrength: number;                    // 0..0.2; default .04
}
export interface LaminateCollection extends FloorCollectionBase {
  kind: 'laminate';
  thicknessMm: 8 | 10 | 12;
  acClass: ACClass;
  usageClass: UsageClass;
  wearLayerMm?: never;
  woodSpecies?: never;
}
export interface ParquetCollection extends FloorCollectionBase {
  kind: 'parquet';
  construction: 'engineered' | 'solid';
  woodSpecies: LocalizedText;
  wearLayerMm: number | null;
  acClass?: never;
  usageClass?: never;                         // expand only with future documented product evidence
}
export type FloorCollection = LaminateCollection | ParquetCollection;

export interface SurfaceMask {
  alpha: LocalAssetPath;                      // grayscale PNG; read red channel as coverage, alpha=255
  boundsPx: readonly [number, number, number, number]; // x,y,width,height at source resolution
}
export interface LightingPlate {
  diffuse: LocalAssetPath;                    // cleaned grayscale sRGB illumination, opaque PNG
  baselineLinear: number;                     // median Y of author-marked neutral patch, > .02
  shadeMin: 0.18;
  shadeMax: 1.65;
  specular: LocalAssetPath | null;             // opaque RGB image, black=no reflected contribution
  specularIncludedInDiffuse: false;           // fail validation if reused twice
}
export interface PlanarMapping {
  worldQuadMm: Quad;                         // ordered perimeter, non-self-intersecting, area > 0
  imageQuad01: Quad;                         // same corresponding points; normalized to photo bounds
  calibration: {
    method: 'measured-plane' | 'authored-reference';
    note: string;
    referenceLengthMm: number;
    referenceImageSegment01: readonly [Vec2, Vec2];
    referenceWorldSegmentMm: readonly [Vec2, Vec2];
  };
}
export interface SceneSurface {
  id: Id;
  role: 'floor' | 'door-leaf' | 'frame' | 'skirting';
  mask: SurfaceMask;
  lighting: LightingPlate;
  mapping: PlanarMapping;
  uvRotationDeg: 0 | 90;                      // grain on trim rail vs stile; floor rotation in state
}
export interface DoorInsert {
  variantKey: 'smoke-glass-black';
  rgba: LocalAssetPath;                       // aligned full-scene transparent PNG, prelit
  replacementMask: SurfaceMask;              // covers complete opaque leaf/profile being replaced
  protectedMask: SurfaceMask;                // variant-specific; permits replacing old handle/casing
  allowedFrameModes: readonly TrimMode[];     // ['black'] for this variant
  sourceNote: string;
}
export interface StudioSelection {
  version: 1;
  sceneId: Id;
  doorProductId: Id;
  doorFinishId: Id;
  floorProductId: Id;
  frameMode: TrimMode;
  skirtingMode: TrimMode;
  floorRotationDeg: 0 | 90;
}
export interface RoomScene {
  id: Id;
  name: LocalizedText;
  description: LocalizedText;
  width: number;                             // canonical 1600
  height: number;                            // canonical 1200
  base: LocalAssetPath;                      // immutable room photo
  thumbnail: LocalAssetPath;
  fallback: LocalAssetPath;                  // pre-rendered DEFAULT selection, not an arbitrary room
  frameType: 'standard-casing' | 'concealed-aluminium';
  depictedDoorSizeMm: { width: 800 | 900; height: 2000 };
  surfaces: readonly SceneSurface[];
  protectedMask: SurfaceMask;                // hardware/furniture/walls that must remain unchanged
  foreground: LocalAssetPath | null;         // transparent details if not already preserved by masks
  doorInserts: readonly DoorInsert[];
  allowedDoorProductIds: readonly Id[];
  allowedFloorProductIds: readonly Id[];
  allowedFrameModes: readonly TrimMode[];
  allowedSkirtingModes: readonly TrimMode[];
  defaultSelection: StudioSelection;
  assetRevision: string;                      // changes whenever pixels/calibration change
}
export interface MaterialsConfig {
  schemaVersion: 1;
  doorFinishes: readonly DoorFinish[];
  floorCollections: readonly FloorCollection[];
  scenes: readonly RoomScene[];
}
```

### 4.1 Mandatory validation beyond interfaces

- IDs/slugs unique; positive finite dimensions; URLs/paths validated; every referenced image, product, finish, collection, scene, fallback, mask, and insert exists by Phase 4. No `as BrandConfig` cast as a substitute for validation.
- `sq` nonempty everywhere; whitespace-only translations count as missing. Fallback function: requested locale nonempty → Albanian. Do not fall back on English. Full EN/DE coverage required at Phase 5 even though fallback remains supported.
- P1 validates brand/messages and permits empty products/materials. P2/P3 allow Studio references to planned scene/finish IDs from §9; mark them pending and keep Studio entry disabled. P4/P5 require all references, nonempty assets and compatible defaults. Never use the early relaxed mode in final verification.
- `--phase` controls expected completeness only, never relaxes malformed values, duplicate IDs, invalid paths or contradictory kind fields.
- Category derives from product kind/doorType and resolved floor collection. No duplicated arbitrary category strings that can drift.
- Each floor product has exactly one collection; a collection can support multiple products only if deliberately configured. Do not duplicate thickness/AC fields in product JSON.
- Standard/hidden/glass door type must agree with frame/construction. Glass finish requires a scene insert AND allowed product. Hidden scene supports only its allowed finishes/products; no standard-casing mode silently drawn there.
- Surface masks all match scene dimensions, grayscale data has alpha=255, bounding boxes are correct, protected areas don't intersect editable coverage beyond antialias tolerance. Sum of disjoint surface coverages <= 1 + 1/255 at shared edges.
- Mapping quads convex, paired order consistent, no collinear triples, determinants well conditioned after normalization; calibrated reference reprojects within 1 source pixel. Missing calibration is a blocker, not permission to guess coordinates.
- Atlas aspect ratio matches physical repeat aspect within 0.5%; repeat size differs from plank size when there is more than one board. Minimum board-size and seam checks described in §8. Do not use square swatch images as real floor atlases.
- Contact entries normalize to E.164-like +digits (8–15 digits) or null; demo may retain sample numbers but never activates them. Live build rejects known sample number `+38344000000`, empty contacts, null siteUrl, and supplier claims without evidence.
- `siteUrl` may be null in demo; sharing uses current origin after mount. Never emit localhost as production canonical. Unknown availability, prices, stock, installation suitability and lead times are omitted, never invented.

## 5. Design system: enforce the lookbook

### 5.1 Exact tokens

Define semantic variables once in `globals.css`. `theme.ts` applies validated brand primary/accent/background to the localized root body. Tailwind v4 `@theme inline` maps semantic color/font/radius tokens to CSS variables. Use literal utility classes; never build runtime strings like `bg-${brandColor}`. No `tailwind.config.js` unless an actual later plugin requires it.

| Token | Value / rule |
|---|---|
| Font | Locally bundled `@fontsource/manrope`, Latin + Latin-ext, weights 400, 500, 600, 700; `font-display: swap`. Includes ë/ç/ä/ö/ü/ß. |
| `--color-bg` | brand background, default `#F7F5F0` |
| `--color-surface` | `#FFFFFF` |
| `--color-text` | `#202421` |
| `--color-muted` | `#62665F` |
| `--color-line` | `#DEDCD5` |
| `--color-primary` | brand primary, default `#202421` |
| `--color-accent` | brand accent, default `#A37D52`; decorative, not small white-on-accent text |
| `--color-focus` | `#255DB5`; 2px ring, 2px offset |
| `--color-error` | `#9B2525` |
| Type small | 12px / 16px, weight 500; badges/origin only |
| Type body | 14px / 20px, weight 400/500 |
| Type controls | 14px / 20px, weight 600; inputs at least 16px on touch to prevent zoom |
| Card title | 16px / 20px, weight 600; reserve 2 lines = 40px; never shrunk to fit |
| Section/product title | 22px / 28px mobile, 28px / 34px desktop, weight 600 |
| Maximum display text | 28px anywhere; no decorative huge typography |
| Spacing | 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48px only |
| Card radius | 8px; clip image only, not the focus ring |
| Button radius | 8px; category pills 999px |
| Header | exactly 56px, sticky top 0, z-index 40 |
| Mobile bottom bar | 64px + `env(safe-area-inset-bottom)`, z-index 40 |
| Content width | max 1280px centered |
| Z layers | content 0; favorite 10; sticky 40; dialog backdrop 80; dialog 90; PhotoSwipe 100 |
| Touch target | >=44 × 44 CSS px; visible icon may be 20px |
| Motion | selection opacity <=120ms; reduced-motion removes transitions; no entrance animations |

Validate contrast >=4.5:1 for ordinary text, >=3:1 for controls/focus borders against adjacent backgrounds. Derive primary button foreground as whichever of white or `#202421` passes; reject a rebrand if neither achieves 4.5:1. Do not silently change approved brand hex values.

### 5.2 Feed geometry and measurable density

- Breakpoints: **<768px = 2 columns**, **768–1199px = 3**, **>=1200px = 4**. Tailwind v4 define a custom `--breakpoint-catalog-wide: 75rem`; don't use default `xl=1280` by accident.
- Outer padding 12px mobile, 20px tablet, 24px desktop. Grid gap 12px mobile, 16px tablet/desktop. Grid items `min-width:0`; product area uses CSS grid `repeat(n,minmax(0,1fr))`.
- Category row 48px high below header, one horizontal scroll row; pills have 44px hit area, 8px gap. Sticky at top 56px. Hide scrollbar visually without preventing keyboard/touch scrolling.
- Only one compact catalog label/count row, maximum 32px, below filters. No tagline paragraph. Product images begin no lower than y=148px at 390px width (normal font zoom).
- Card image ratio **4:3**. At 390px: inner width 366; `(366-12)/2=177px`, image height 132.75px. Metadata: 40px title + 16px spec + 16px origin/demo + 12px total internal gaps = 84px. Card <=217px; two rows plus gap <=446px.
- At **390 × 844**, header/filter/count + top/bottom gaps <=148px and two full product rows end <=594px. Four complete cards must be above the mobile bar (top around 746–780 depending safe area); part of a third row should be visible. Six complete cards are a stretch goal, not a false width-only guarantee. At **390 × 667**, four complete cards must still fit above the 64px bar without an extra demo banner. At 320px and text zoom, legibility wins over card-count targets; still two columns at normal text size.
- Badge is a compact overlay at top-left of image; heart button is top-right. Product link and heart are **siblings**, not nested interactive elements. Crop room photographs using focalPoint; product-only tall door photos use contain on a warm neutral background so the entire door remains visible.
- Header at 320px: logo/shortName gets remaining width; Studio control 52px, language button 44px, favorites 44px, 4px gaps. Header title is one line, max 18 chars, ellipsis allowed with accessible full brand name. Language button opens SQ/EN/DE menu, not three permanent buttons.
- Bottom bar columns 52px / `minmax(0,1fr)` / 52px. Side controls have phone/Viber icons and accessible names; center text compact “Kërko ofertë”. Full WhatsApp context in accessible label/dialog. No forced wrapping on 320px. Show contact labels at >=390 when space permits. At >=768 use compact header/detail contact action, not the mobile bar.
- Body bottom padding equals bar height + safe area + 16px. Set `scroll-padding-top:120px`; section/focus scroll margins avoid sticky occlusion.
- Demo marker is a short badge beside brand or in metadata. Product attribution goes under image/specs; do not add a 100px warning block over the grid.
- Favorites button toggles `?saved=1` catalog filter; no separate favorites route. Empty saved/filter result has one sentence and a “Clear filters” button.

### 5.3 Product and Studio layout

Product mobile: breadcrumb/back link (32px), title + SKU, first photo, compact variant selectors and inquiry, technical table, remaining vertical photos, related products (same 2-column grid). No autoplay carousel. Desktop: 60% vertical gallery / 40% sticky facts; facts stop before related section. Images don't crop essential door features. PhotoSwipe only on deliberate image activation; Escape/backdrop/button close and focus returns to originating image.

Studio mobile: header → two scene chips → 4:3 photo/canvas stage → compact combination title → surface tabs → swatch grid → frame/skirting controls → inquiry. Keep controls in normal document flow; do not cover half the room with a floating drawer. At >=1024: stage and 320px control column. Stage shows full 4:3 image with contain; never use independent CSS cover crops for different layers. Toolbar has compare-original hold/toggle and reset only; no fake 3D orbit, free zoom, upload or room geometry editor.

## 6. Renderer: exact model, equations, and failure handling

Everything in this section is the proposed project algorithm, not a claim about proprietary benchmark implementations.

### 6.1 What a single photograph can and cannot do

A floor is approximately planar. A homography can place metrically consistent boards on it from a fixed camera. A wall/door plane needs its own homography. Skirting on two walls needs two mappings; door header rail needs its own grain direction. A uniform CSS skew or scaling rows linearly is not perspective-correct.

Fixed photos cannot provide new viewpoints, transmitted scenery behind an opaque door, correct material-dependent global illumination, or arbitrary new mirror reflections. The result is a calibrated visual approximation. Color matching still needs physical samples. Restrict materials to matte/satin and the authored smoke-glass insert; do not pretend this is a physically based renderer.

### 6.2 Scene preparation before renderer integration

Use a canonical **1600 × 1200**, sRGB room plate for each scene. Author at higher resolution if desired, then normalize every exported layer with the SAME crop and resample transform. Record that transform in scene authoring notes. One door and one contiguous floor plane per scene; occluding furniture can split the floor mask into disconnected visible areas.

For each editable surface supply:

1. An opaque grayscale mask: byte 0 excluded; byte 255 fully editable; red channel is coverage. PNG alpha must be 255 everywhere. This convention avoids the common “black is still opaque” destination-in bug.
2. A cleaned diffuse lighting plate. Starting from a neutral surface photograph is preferred. Remove old wood grain, knots, seams, brand color and baked bevels **without deleting contact shadow and sun boundaries**. A blur alone will smear lighting edges and is not an acceptable universal solution. Author manually or use a neutral-material render pass.
3. A baseline measured from a marked neutral, unoccluded patch in that cleaned plate; store its median **linear** luminance. Record patch polygon in the scene's calibration document. Avoid highlights and deep shadow.
4. Separate reusable reflection/specular image on black, if appropriate. If already present in diffuse, remove it there before setting `specularIncludedInDiffuse:false`. Otherwise use `null` and no specular contribution.
5. Measured plane-to-photo mapping and calibration evidence. Never invent quadrilateral coordinates before the selected image exists.
6. Protected mask for walls, hardware, furniture, threshold gaps and unswitchable regions. Fixed handle/keyhole pixels must not recolor with the leaf.

Masks must include subpixel edge coverage. Start with about 0.6–1.0 source-pixel feathering, inspect at 100%, and adjust locally; no uniform broad blur. Shared boundaries partition coverage rather than independently overlapping soft masks. At most one surface owns each fully covered pixel. Author furniture cutouts in floor mask so original leg pixels remain; keep their floor contact shadow in floor lighting. Do not paste old floor-colored shadows back over new wood.

### 6.3 Linear color and luminance math

For an sRGB byte channel `b`, let `c=b/255`:

```text
srgbToLinear(c) = c/12.92                         if c <= 0.04045
                 ((c+0.055)/1.055)^2.4          otherwise

linearToSrgb(l) = 12.92*l                        if l <= 0.0031308
                 1.055*l^(1/2.4)-0.055         otherwise

Y = 0.2126*Rlinear + 0.7152*Glinear + 0.0722*Blinear
shade = clamp(Yclean / baselineLinear, 0.18, 1.65)
D = TalbedoLinear * shade                        componentwise
S = specularLinear * materialSpecularStrength
surfaceRGB = clamp(D + S, 0, 1)                  componentwise
```

The baseline is constant per authored surface; **never recalculate it for each selected material**. White must look lighter than walnut under the same lighting. `T` is either a decoded texture sample or decoded solid finish; it is not the old room RGB. Multiplying by raw original RGB double-tints the new material.

Use 256-entry sRGB decode LUT and a sufficiently dense encode LUT (4096+ samples, interpolate) in the inner loop. Average colors for mipmaps in linear space. Numeric test tolerances below allow 1–2 final byte values. The 0.18 shadow floor is the brief's deliberate artistic clamp; it can lift extremely dark shadows, so truly opaque gaps remain outside masks. Never lower it per finish just to make a swatch look attractive.

Numeric fixture: cleaned neutral byte 128 decodes to approximately 0.215861. With identical baseline, shade=1. A solid byte 128 must return byte 128 (±1). With shade=.5, its output is approximately byte 92, **not 64**. `baseline=.2, Y=.6` must clamp to 1.65; `Y=.01` must clamp to .18. A black specular plate contributes exactly zero.

### 6.4 Mask composition and blend modes

Production kernel performs all illumination and edge mixing in linear RGB, then encodes once into an **opaque final canvas buffer**. Let original room pixel `B`, mutually partitioned coverages `m_i`, and computed surface pixels `C_i`:

```text
m_i = maskByte_i/255 * (1 - protectedByte/255)
M = sum(m_i)                 // validation requires M <= 1 + quantization tolerance
outLinear = (1-M)*Blinear + sum(m_i*C_i)
outByte = round(255*linearToSrgb(clamp(outLinear,0,1)))
outAlpha = 255
```

Clamp/normalize only <=1/255 numerical overlap; larger overlap is an asset error. Pixels with zero total editable coverage are copied **byte-for-byte** from base, avoiding conversion drift. Keep alpha coverage linear; do not apply sRGB transfer to masks. An optional foreground image is a premultiplied-alpha source-over blend in linear space, once, after editable surfaces. Prelit glass is composited once with its replacement coverage; exclude replaced opaque leaf/frame surfaces first.

Canvas calls: staging image buffers via `putImageData`; presentation `drawImage`/`putImageData`, `globalCompositeOperation='source-over'`. `putImageData` ignores current transform/composite mode, so do not try to mask it with a context setting.

| Blend mode | Exact role / caution |
|---|---|
| `source-over` | Present a fully composed opaque buffer; or compose an authored transparent foreground. Reset state after every pass. |
| `destination-in` | Only for a debug/authoring preview: first turn grayscale red values into actual alpha on a white RGBA mask. Never draw the opaque grayscale PNG directly as a mask. Do not reapply alpha after the production kernel, or edges darken twice. |
| `multiply` | `Cb*Cs`, darkening only. Useful for visualizing a shadow layer. Cannot represent shade >1 and is not the production linear-light calculation. |
| `screen` | `1-(1-Cb)*(1-Cs)`, an artistic brightening approximation. Not equal to additive specular light and not used for the canonical render. |
| `overlay`, `soft-light`, `color`, `luminosity` | Not the final material algorithm; they do not implement the stated linear-light shade equation and may preserve old material luminance. |

Do not mix a browser multiply result with the numeric shader and call it exact. The user-requested shade formula is implemented explicitly, including its brightening range.

### 6.5 Metric floor homography

Define world floor axes `(X,Y)` in **millimeters**. The scene mapping holds four measured, corresponding points in perimeter order. Image coordinates are normalized `(x,y)` with origin top-left. Mapping is:

```text
[x',y',w']ᵀ = H * [X,Y,1]ᵀ
x = x'/w'; y = y'/w'
H = [h11 h12 h13; h21 h22 h23; h31 h32 1]
```

For each pair `(X,Y)→(x,y)`, solve the eight unknown coefficients with two rows:

```text
[X Y 1  0 0 0  -xX -xY] h = x
[0 0 0  X Y 1  -yX -yY] h = y
```

Normalize both point sets to centroid zero/mean distance sqrt(2), solve using Gaussian elimination with partial pivoting, denormalize, and normalize H. Reject pivots <1e-10 in normalized space, nonfinite results, or near-zero denominators across the editable region. Compute inverse once per scene/surface/output size; do not solve per pixel. This is a small TypeScript implementation, no math framework needed.

For output `(px,py)` at render size `(W,Hout)`, evaluate at pixel centers `x=(px+.5)/W`, `y=(py+.5)/Hout`; apply inverse H to get world `(X,Y)`. Do not forward-splat pixels: it leaves holes. A floor quad may describe a virtual measured rectangle extending beyond the visible image; normalized corner coordinates can lie outside [0,1] in that case. Mask data controls what is visible. Door masks remain within scene bounds.

**Scale calibration rule:** a quadrilateral alone only gives perspective up to a metric choice. Set its world dimensions from a known rectangular floor area or authored camera/reference geometry. Use an independent measured segment **on that same floor plane**, e.g. a threshold width, to check scale. A vertical 2000mm door height cannot simply be divided into floor pixels. If only an arbitrary photo exists without sufficient references, scene preparation remains incomplete; don't advertise physically accurate plank size.

Reference fixture (synthetic, not production coordinates): world rectangle `(0,0),(4000,0),(4000,5000),(0,5000)` → image `(.30,.40),(.70,.40),(1,.95),(0,.95)`. Corners round-trip within 1e-6 normalized units. A world checker grid must narrow continuously toward the far edge; its projected edges share vanishing points. Tests additionally use non-axis-aligned world quads.

### 6.6 Texture coordinates, plank size and patterns

Rotate in **world space**, never rotate the already-composited photo:

```text
[Xr,Yr] = R(-theta) * ([X,Y] - worldOrigin)
U = Xr / repeatWidthMm
V = Yr / repeatHeightMm
u = U - floor(U); v = V - floor(V)             // correct for negative coordinates
sampleX = u*atlasWidth - .5
sampleY = v*atlasHeight - .5
```

Use deterministic origin `(0,0)` from the calibrated floor mapping; rotation is 0° or 90°. No arbitrary percentage “scale” slider. Flooring product dimensions and atlas repeat determine scale. Resizing a browser changes render resolution, not board dimensions.

- **Straight planks:** atlas authors place multiple boards with correctly staggered joints, modest color variation, 4V or flat seams, at their true mm ratio. A 1380 × 193mm board represented by an atlas 5520 × 772mm covers four board lengths by four widths (16 board-area equivalents). Actual staggered cropped boards may straddle repeat edges; `boardsPerRepeat` documents artwork rather than driving rendering.
- **Herringbone:** rectangular boards meet at right angles in a zigzag; build a seamless orthographic repeating tile with the actual board dimensions and both grain orientations. Its world repeat bounds are measured from the authored pattern, not guessed as one plank. Validate seamless repeats in a 3 × 3 tiling before use.
- **Chevron:** cut-ended boards meet point-to-point. Separate artwork, cut angle, physical repeat. Do not get chevron by rotating the herringbone tile or rename either pattern.
- Atlas includes its intended bevel shading and seams once; do not layer procedural seams over it. It must not contain room shadows, perspective, or window reflections.
- Minimum texture source: enough pixels for <=1mm/pixel near-camera board detail where feasible; start max 2048px long edge for atlas, inspect repeating knots. If variation still looks repetitive, enlarge authored repeat rather than randomize every render.
- Door wood: independent door-plane mapping. Grain vertical on leaf/stiles, horizontal on frame rail. Full-leaf scan may use `stretch-leaf` only for its declared leaf size/aspect; texture repeats use actual mm scale. Product dimension variants change inquiries; the scene remains its documented 900×2000 or 800×2000 display size.
- Skirting: one plane per visible wall segment. Use floor/door `trim` appearance; no floor board joints on vertical skirting. Hidden-frame reveal remains a protected shadow gap; frame controls disabled where no paintable frame exists.

### 6.7 Sampling and anti-aliasing

Bilinear wrap sampling: fetch four neighboring texels modulo width/height, convert to linear, interpolate. Precompute linear mip pyramid with 2×2 averaging until 1×1. At each pixel, estimate UV derivatives by inverse-mapping neighboring pixel centers. With atlas dimensions `(Tw,Th)`:

```text
rhoX = length((dUdx*Tw, dVdx*Th))
rhoY = length((dUdy*Tw, dVdy*Th))
lod = clamp(log2(max(rhoX,rhoY,1)), 0, maxMip)
```

Use **unwrapped** U/V derivatives, or tile seams cause huge erroneous LOD. Trilinear sample floor(lod)/ceil(lod). Initial version uses this isotropic filter; if far-floor detail blurs excessively, add up to 4 samples along the major derivative axis, retaining the same shader/math. Do not sharpen the far plane until it shimmers. Floor mask and light sampling are bilinear at scene pixel centers. Preserve high-frequency contact boundaries in authored maps, not by sharpening every texture.

### 6.8 Render lifecycle and memory

- Show local `fallback.webp` immediately; it depicts the scene default selection. While a shared nondefault selection is loading, explicitly label preview as loading and do not claim fallback is that selected combination.
- `StudioLoader` is a client boundary that dynamically imports StudioClient; feed routes never import renderer or PhotoSwipe. Import worker only after Studio mounts. Construct `new Worker(new URL('../workers/...', import.meta.url), {type:'module'})` using the correct relative path from its owner; verify exported worker chunk URL exists.
- Decode images through same-origin image assets and a staging 2D canvas; `getImageData` once per loaded asset, not per swatch click. Use sRGB 8-bit contexts. Do not depend on Display-P3 Canvas defaults.
- Worker may receive typed arrays and pure render jobs without OffscreenCanvas. Transfer its result ArrayBuffer to main for ImageData. Prefer this universal design; use OffscreenCanvas only if both worker 2D support and transfer semantics pass capability checks.
- Store mask/light channels as cropped Uint8Arrays plus bounds, not full RGBA canvases for each component. Keep only active scene decoded; at most two floor mip chains in a byte-accounted 6MiB texture cache; decode runtime materials at max512px. Result cache is bounded to3MiB. Downsample decoded albedo before mip creation when necessary (a square 2048px Float32 RGB pyramid alone is about 64MiB; a 1024px pyramid is about 16MiB). Release the source RGBA decode after creating each chain. Byte-accounted LRU, target <=96MiB owned render allocations (browser/framework overhead measured separately).
- Single final pass: width min(960, CSS width×min(DPR,2)), 4:3. No visible 480px preview or delayed second pass. Retain the previous sharp canvas, prepare the new pixels offscreen, and present only the latest complete frame atomically. Only that presentation updates completed selection/inquiry.
- Each selection/scene/resize increments `requestId`. Results with stale IDs are dropped and transferred buffers released. Worker processes 16–32 rows then yields to its event loop, checks latest job ID, and cancels obsolete work. A synchronous entire-frame loop would prevent cancellation messages from being handled.
- Main-thread fallback uses the same kernel in <=8ms batches scheduled with `setTimeout(0)` between batches; final pass <=960px. No recursive microtask yielding (it can still starve painting).
- Cache key: scene ID + assetRevision + selection IDs/modes/rotation + output dimensions + quality + renderer version. Do not include locale; changing language only changes labels.
- ResizeObserver debounced 100ms; render only if integer pixel dimensions changed. Do not stretch by altering just canvas CSS width without matching logical aspect. Cancel and dispose worker, close ImageBitmaps, revoke temporary object URLs, clear listeners on unmount.
- If any required asset fails, preserve last fully completed image, display concise retry status, and show the **rendered** combination title. Disable “send this combination” while selection and completed frame differ. Never quietly use a different material under the new name.
- Compare-original toggles base photo only while active and announces comparison; it does not mutate selected product state. Reset uses scene defaults and updates URL once.

## 7. Core public signatures and state behavior

The following are contracts for file owners, not extra application files. `ReactNode`, `RefObject`, `Dispatch`, and HTML types come from React as appropriate. All components return JSX/React elements. Every callback is supplied within a client boundary. Ambient `declare function` notation specifies the callable contract; implementations export normal functions. Component defaults: Icon size 20/decorative true; ResponsiveImage eager false/fit cover; InquiryButton channel whatsapp.

### 7.1 Foundation, data, internationalization

```ts
// data/load.ts — server/build only
declare function loadSiteData(phase: 1 | 2 | 3 | 4 | 5): SiteData;
interface SiteData { brand: BrandConfig; products: ProductsConfig; materials: MaterialsConfig }
// data/validate.ts
declare function validateSiteData(input: unknown, phase: 1 | 2 | 3 | 4 | 5): SiteData;
// i18n/locales.ts
declare function isLocale(value: string): value is Locale;
// i18n/messages.ts
declare function getMessages(locale: Locale): Messages;
declare function localize(value: LocalizedText, locale: Locale): string;
// i18n/format.ts
declare function formatDoorSize(size: DoorSize, locale: Locale): string; // display cm, store mm
declare function formatFloorSpec(collection: FloorCollection, locale: Locale): string;
declare function formatOrigin(country: OriginCountry | null, locale: Locale): string | null;
// brand/theme.ts
declare function buildThemeVars(brand: BrandConfig): Record<`--${string}`, string>;
// brand/metadata.ts
declare function buildMetadata(brand: BrandConfig, locale: Locale, path: string,
  title?: string, description?: string): Metadata;
```

`Messages` is `Record<keyof typeof sqMessages, string>` (import the SQ JSON with resolveJsonModule), a strict flat map of keys derived from SQ messages, with EN/DE typed/validated against it. Initial keys: `nav.studio`, `nav.saved`, `nav.language`, `contact.call`, `contact.quote`, `contact.viber`, `contact.copy`, `contact.demoTitle`, `contact.demoBody`, `common.close`, `common.retry`, `common.loading`, `common.clear`, `demo.badge`, `catalog.title`, six category labels and empty-state labels. Add product and Studio labels in their owning phases; never scatter literals in JSX. `getMessages` returns SQ-overlaid requested dictionary, ignoring empty translations.

```ts
interface AppShellProps { brand: BrandConfig; locale: Locale; messages: Messages; children: ReactNode; studioEnabled: boolean }
type IconName = 'phone'|'whatsapp'|'viber'|'heart'|'studio'|'close'|'chevron-down'|'copy'|'rotate'|'compare'|'download'|'check'|'arrow-left';
declare function AppShell({ brand, locale, messages, children, studioEnabled }: AppShellProps): ReactNode;
declare function Header({ brand, locale, messages, studioEnabled }: Omit<AppShellProps,'children'>): ReactNode;
declare function LanguageMenu({ locale, messages }: { locale: Locale; messages: Messages }): ReactNode;
declare function MobileContactBar({ locale, messages }: { locale: Locale; messages: Messages }): ReactNode;
declare function DemoBadge({ label }: { label: string }): ReactNode;
declare function Icon({ name, size, decorative }: { name: IconName; size?: number; decorative?: boolean }): ReactNode;
declare function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }): ReactNode;
declare function EmptyState({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }): ReactNode;
```

Native `<dialog>` with showModal/close, Escape/cancel handling, named heading, focus restore, body scrolling appropriate to mobile. Avoid nesting dialogs. LanguageMenu preserves current route suffix and allowed query keys, changes only locale, and has SQ/EN/DE text options. It must work from product and Studio deep links. Root layouts set `studioEnabled=false` through P3 and true in P4, using one build-level `IMPLEMENTATION_PHASE` constant in `data/load.ts` rather than scattered flags. It starts at 1 and increments only in an authorized phase; scripts accept explicit phase overrides for stricter final audits.

### 7.2 Catalog and favorites

```ts
interface CatalogQuery { category: CategoryId; savedOnly: boolean }
interface ProductCardData {
  id: Id; slug: Id; name: string; badge: string; spec: string;
  origin: string | null; demo: boolean; image: ResponsiveImageData;
}
interface ImageVariant { src: LocalAssetPath; width: number; height: number; bytes:number; sha256:string }
interface ResponsiveImageData {
  id: Id; alt: string; width: number; height: number; focalPoint: Vec2; role: ImageRef['role'];
  avif: readonly ImageVariant[]; webp: readonly ImageVariant[]; fallback: ImageVariant;
}
declare function parseCatalogQuery(params: URLSearchParams): CatalogQuery;
declare function serializeCatalogQuery(query: CatalogQuery): URLSearchParams;
declare function selectProducts(products: readonly Product[], materials: MaterialsConfig,
  query: CatalogQuery, favoriteIds: ReadonlySet<Id>): readonly Product[];
declare function toProductCard(product: Product, data: SiteData, locale: Locale,
  images: ImageManifest): ProductCardData;
declare function CatalogClient({ products, locale, messages }: { products: readonly ProductCardDataWithCategory[]; locale: Locale; messages: Messages }): ReactNode;
declare function CategoryPills({ value, onChange, messages }: { value: CategoryId; onChange: (id: CategoryId) => void; messages: Messages }): ReactNode;
declare function ProductGrid({ products, locale }: { products: readonly ProductCardData[]; locale: Locale }): ReactNode;
declare function ProductCard({ product, locale, eager }: { product: ProductCardData; locale: Locale; eager: boolean }): ReactNode;
declare function FavoriteButton({ productId, productName }: { productId: Id; productName: string }): ReactNode;
declare function ResponsiveImage({ image, sizes, eager, fit }:
 { image: ResponsiveImageData; sizes: string; eager?: boolean; fit?: 'cover' | 'contain' }): ReactNode;
// favorites/store.ts
declare function readFavorites(storage: Pick<Storage,'getItem'> | null, key: string,
  validIds: ReadonlySet<Id>): ReadonlySet<Id>;
declare function toggleFavorite(ids: ReadonlySet<Id>, id: Id): ReadonlySet<Id>;
// favorites/useFavorites.ts
declare function useFavorites(): { ids: ReadonlySet<Id>; ready: boolean; toggle: (id: Id) => void };
```

Define `ProductCardDataWithCategory = ProductCardData & { category: Exclude<CategoryId,'all'> }`; no undocumented type remains. `ImageManifest` is `Record<Id, Omit<ResponsiveImageData,'alt'>>`; merge localized alt at the server boundary. Use `<picture>` with AVIF/WebP srcsets and WebP `<img>` fallback; no `/_next/image` requests. Card sizes: `(min-width:1200px) 300px, (min-width:768px) 33vw, 50vw`; first cover high fetch priority, next three eager, rest lazy. Gallery gets separate larger derivatives.

URL is filter authority after mount; static HTML defaults to all products so there is no server query dependency. Use native History API for filter updates and dispatch an app-owned event; subscribe to popstate. `pushState` on discrete filter changes, `replaceState` only when sanitizing invalid parameters. Preserve unrelated recognized keys when switching locale. No page reload; no scroll jump. For savedOnly, wait for storage read before declaring no results.

In `src/lib/media/paths.ts` implement `withAssetRevision(path:LocalAssetPath, sha256:string):LocalAssetPath`: set only the `rev` query key, preserve pathname, reject nonlocal input. Enable revisioned asset URLs from P2 so P5 does not change their contract.

Favorites key `pd:<brand.id>:favorites:v1`; sorted array of known product IDs, try/catch storage read/write, max 200 IDs, deduplicate. SSR snapshot empty; hydrate after mount, avoid mismatched HTML. Persist across locale changes; handle `storage` event. On denied storage, retain in-memory state for the tab and show no alarming blocking dialog.

### 7.3 Inquiries and product details

```ts
// inquiry/types.ts
export type InquiryContext =
 | { kind: 'catalog'; productIds: readonly Id[] }
 | { kind: 'product'; productId: Id; sizeId?: Id; finishId?: Id }
 | { kind: 'studio'; selection: StudioSelection };
export interface InquiryData {
  brand: BrandConfig;
  products: readonly Product[];
  materials: Pick<MaterialsConfig, 'doorFinishes'|'floorCollections'>;
  scenes: readonly {id:Id; name:LocalizedText}[];
}
export type ContactChannel = 'phone' | 'whatsapp' | 'viber';
export type ContactAction =
 | { kind: 'preview'; title: string; message: string; copyText: string }
 | { kind: 'external'; href: string; fullMessage: string; copyRequired: boolean };
declare function buildInquiryMessage(context: InquiryContext, data: InquiryData, locale: Locale,
  canonicalUrl: string): string;
declare function resolveContactAction(channel: ContactChannel, brand: BrandConfig,
  message: string, canonicalUrl: string): ContactAction;
declare function InquiryProvider({ data, locale, messages, children }:
 { data: InquiryData; locale: Locale; messages: Messages; children: ReactNode }): ReactNode;
declare function InquiryDialog({ action, onClose }: { action: ContactAction | null; onClose: () => void }): ReactNode;
declare function InquiryButton({ context, channel, label }:
 { context: InquiryContext; channel?: ContactChannel; label: string }): ReactNode;
// product
declare function ProductGallery({ images, productName }: { images: readonly ResponsiveImageData[]; productName: string }): ReactNode;
declare function ProductSpecs({ rows, caption }: { rows: readonly { label: string; value: string }[]; caption: string }): ReactNode;
declare function ProductVariants({ product, finishes, locale, onChange }:
 { product: DoorProduct; finishes: readonly DoorFinish[]; locale: Locale;
   onChange?: (value: {sizeId: Id; finishId: Id}) => void }): ReactNode;
declare function RelatedProducts({ products, locale, title }:
 { products: readonly ProductCardData[]; locale: Locale; title: string }): ReactNode;
declare function buildSpecRows(product: Product, materials: MaterialsConfig, locale: Locale): readonly {label:string;value:string}[];
```

The localized server layout wraps AppShell in InquiryProvider and supplies only `InquiryData`: no scene masks/calibration, image sources, renderer or asset decoding. Its brand is `data.brand`. Put `buildSpecRows` in `catalog/selectors.ts`. ProductVariants is a client island that owns its own variant state and product inquiry selection; its optional onChange is used only by a client parent. It synchronizes InquiryProvider's current context. InquiryProvider has a single `useInquiry()` hook in the same file returning `{context,setContext,open}`. Catalog sets context to selected favorites if present, otherwise empty catalog inquiry; product sets selected SKU/finish/size; Studio registers only completed rendered selection. Cleanup restores the route's default. Prevent stale context when navigating back from Studio to a product.

Demo mode resolves preview **before** constructing clickable external hrefs; DOM must contain no active `tel:`, `wa.me`, `api.whatsapp`, or `viber:` links. Live WhatsApp URL: `https://wa.me/<digits>?text=<encodeURIComponent(message)>`. One encode pass; test ë, ç, ß, `&`, `+`, line breaks and URL query characters. Messaging opens a draft; sending is the user's action.

Viber: use documented `viber://forward?text=...`; clarify “Choose the showroom contact in Viber.” Full message is always available to copy. If full text >200 characters, use a compact label plus share URL only when it fits; otherwise provide copy-only fallback. Do not chop off a URL or silently promise delivery to `brand.contact.viber`. Show configured Viber contact as copyable text. Web Share API, if used, is optional and invoked only by user gesture; clipboard failure displays a selectable textarea.

Product query keys `size` and `finish` validate against that product; default invalid values without crashes and sanitize URL. Product→Studio carries allowed `door`, `finish` or `floor` IDs. Product detail explicitly says room preview size is representative when selected physical dimension differs. No fabricated price calculator or instant quote total.

### 7.4 Studio UI, state and renderer contracts

```ts
interface StudioCatalog { products: readonly Product[]; materials: MaterialsConfig }
interface StudioSnapshot {
  requested: StudioSelection;
  rendered: StudioSelection | null;
  status: 'idle' | 'loading' | 'rendering' | 'ready' | 'error';
  error: string | null;
}
type StudioAction =
 | { type:'restore'; selection: StudioSelection }
 | { type:'scene'; sceneId:Id }
 | { type:'door'; productId:Id; finishId:Id }
 | { type:'floor'; productId:Id }
 | { type:'frame'; mode:TrimMode }
 | { type:'skirting'; mode:TrimMode }
 | { type:'rotate'; degrees:0|90 }
 | { type:'reset' };
declare function normalizeSelection(candidate: Partial<StudioSelection>, catalog: StudioCatalog):
 { selection: StudioSelection; warnings: readonly string[] };
declare function reduceSelection(state: StudioSelection, action: StudioAction, catalog: StudioCatalog): StudioSelection;
declare function parseStudioQuery(params: URLSearchParams, catalog: StudioCatalog): ReturnType<typeof normalizeSelection>;
declare function serializeStudioQuery(selection: StudioSelection): URLSearchParams;
declare function buildCombinationTitle(selection: StudioSelection, catalog: StudioCatalog, locale:Locale): string;
declare function StudioLoader({ catalog, locale, messages }: { catalog: StudioCatalog; locale:Locale; messages:Messages }): ReactNode;
declare function StudioClient(props: Parameters<typeof StudioLoader>[0]): ReactNode;
declare function ScenePicker({ scenes, value, locale, onChange }:
 { scenes:readonly RoomScene[]; value:Id; locale:Locale; onChange:(id:Id)=>void }): ReactNode;
declare function StudioCanvas({ controller, selection, scene, onComplete, onError }:
 { controller:RenderController; selection:StudioSelection; scene:RoomScene;
   onComplete:(selection:StudioSelection)=>void; onError:(message:string)=>void }): ReactNode;
declare function SurfaceTabs({ value, onChange, messages }:
 { value:'door'|'floor'; onChange:(surface:'door'|'floor')=>void; messages:Messages }): ReactNode;
declare function MaterialPicker({ items, selectedId, onSelect, label }:
 { items:readonly {id:Id; label:string; swatch:string; disabledReason?:string}[];
   selectedId:Id; onSelect:(id:Id)=>void; label:string }): ReactNode;
declare function TrimControls({ frameMode, skirtingMode, allowedFrameModes, allowedSkirtingModes, onFrameChange, onSkirtingChange, messages }:
 { frameMode:TrimMode; skirtingMode:TrimMode; allowedFrameModes:readonly TrimMode[];
   allowedSkirtingModes:readonly TrimMode[]; onFrameChange:(m:TrimMode)=>void;
   onSkirtingChange:(m:TrimMode)=>void; messages:Messages }): ReactNode;
declare function CombinationSummary({ selection, title, pending }:
 { selection:StudioSelection|null; title:string; pending:boolean }): ReactNode;
declare function RenderStatus({ status, message, onRetry }:
 { status:StudioSnapshot['status']; message:string; onRetry:()=>void }): ReactNode;
```

Canonical Studio query keys, in this order: `v=1&scene=<id>&door=<id>&finish=<id>&floor=<id>&frame=door&skirting=floor&rot=0`. Strict allowlist; bound total query input to 2048 chars; reject oversized or unknown versions to scene default with a notice. Parse percent encoding once with URLSearchParams. Never interpret arbitrary JSON or asset URLs from query strings.

Scene change keeps current products/modes only if compatible; otherwise use new scene defaults, explain changed choices once in aria-live polite. Door-finish change selects only compatible door product/finish pair; palette item IDs encode that pair in UI adapter, not by concatenating labels. Hidden products cannot acquire standard casing. Legacy scene=corridor-hidden normalizes to corridor-standard with compatible finish/floor/modes retained and a compatible standard product substituted; announce changed choices. Floor rotations remain only 0/90; user labels are Lengthwise (90) / Crosswise (0), localized SQ/EN/DE, with plank icons. URL uses `replaceState` after 150ms swatch debounce to avoid 40 back-button entries; scene changes use pushState. Popstate restores state without writing another entry. Locale changes preserve all these IDs.

```ts
// studio/render/color.ts
declare function srgbToLinear(value: number): number;          // normalized 0..1 input/output
declare function linearToSrgb(value: number): number;
declare function luminance(rgb: RGB): number;
// homography.ts
declare function solveHomography(world: Quad, image: Quad): Mat3;
declare function invertHomography(matrix: Mat3): Mat3;
declare function projectPoint(matrix: Mat3, point: Vec2): Vec2;
// sampling.ts
interface PixelBuffer { width:number; height:number; data:Uint8ClampedArray }
interface FloatTexture { width:number; height:number; data:Float32Array } // RGB interleaved
declare function buildMipChain(image: PixelBuffer): readonly FloatTexture[];
declare function sampleTrilinear(mips: readonly FloatTexture[], u:number, v:number, lod:number): RGB;
// lighting.ts
declare function shadeAt(cleanLuminance:number, baseline:number): number;
declare function shadeMaterial(albedo:RGB, shade:number, specular:RGB, strength:number): RGB;
// composite.ts
declare function compositePixel(base:RGB, layers:readonly {rgb:RGB; coverage:number}[]): RGB;
// kernel.ts
interface PreparedScene { scene:RoomScene; base:PixelBuffer; surfaces:readonly PreparedSurface[];
  protectedMask:Uint8Array; foreground:PixelBuffer|null; inserts:ReadonlyMap<string,PixelBuffer>;
  insertMasks:ReadonlyMap<string,{replacement:Uint8Array;protected:Uint8Array}> }
interface PreparedSurface { definition:SceneSurface; inverse:Mat3; mask:Uint8Array;
  diffuse:Uint8Array; specular:PixelBuffer|null; bounds:readonly [number,number,number,number] }
interface RenderJob { id:number; selection:StudioSelection; width:number; height:number;
  quality:'preview'|'settled'; rendererVersion:1|2 }
interface PreparedMaterials { textures:ReadonlyMap<Id,readonly FloatTexture[]>;
  data:MaterialsConfig; products:readonly Product[] }
declare function renderRows(job:RenderJob, scene:PreparedScene, materials:PreparedMaterials,
  output:PixelBuffer, startRow:number, endRow:number): void;
// asset-loader.ts
declare function prepareScene(scene:RoomScene, signal:AbortSignal): Promise<PreparedScene>;
declare function prepareMaterials(selection:StudioSelection, catalog:StudioCatalog, signal:AbortSignal): Promise<PreparedMaterials>;
// render-controller.ts
interface RenderController {
  render(job:Omit<RenderJob,'id'>): Promise<{jobId:number; pixels:PixelBuffer; selection:StudioSelection}>;
  cancel():void;
  dispose():void;
}
declare function createRenderController(catalog:StudioCatalog): RenderController;
// cache.ts
declare function createByteLru<T>(maxBytes:number, dispose:(value:T)=>void): {
  get(key:string):T|undefined; set(key:string,value:T,bytes:number):void; clear():void; bytes():number;
};
```

PreparedSurface arrays use the documented cropped bounds, row-major, one byte per mask/diffuse channel; specular stores only cropped pixels. Do not assume full-image array indexes. Base/protectedMask are full-frame; prepared geometry remains normalized and works at both render sizes. `prepareScene` stores variant replacement/protection coverage in the typed insertMasks field, each full-frame row-major Uint8Array.

Worker protocol in `studio/types.ts`: discriminated union requests `{type:'prepare-scene',scene}` and `{type:'prepare-materials',materials}` (sent only when changed), `{type:'render',job}`, `{type:'cancel',latestId}`, `{type:'dispose'}`; responses `{type:'prepared'}`, `{type:'result',jobId,width,height,buffer,selection}`, `{type:'error',jobId,message}`. Worker sends only serializable data, never React values. `render()` rejects canceled work with an AbortError the UI ignores; only actual failures show error state.

## 8. Asset pipeline and authored-scene deliverables

### 8.1 Catalog media

`prepare-images.ts` reads `brand/products.json`, never scrapes sites. Normalize orientation, strip metadata, convert sRGB. Generate widths **320, 640, 960, 1600** bounded by source width, deduplicating repeated bounded sizes; no upscaling. The largest original-size derivative is always included. A portrait source need not produce a 1600px-wide image to qualify as a 1600px-long-edge zoom asset. AVIF quality start 50, WebP 80; visually adjust per asset. Output `/media/products/<productId>/<imageId>-<width>.{avif,webp}`; derivative manifest stores actual width/height/filesize and SHA-256. Source must be >=1600px long edge for detail zoom; reject tiny upscaled placeholders.

An ImageRef source belongs to its product. Use IDs `<productId>-01` and `<productId>-02`, not one generic image across all products. P2 requires cover only for seed records; P3 requires both images for every then-published product; P5 all 12 products have two views. Distinct product details must visually correspond to title/construction; stock interiors must be labeled illustrative. Never attach a steel security door photo to an interior-door SKU.

`asset-sources.json` has records `{id,localPath,sourceUrl|null,author,usageBasis:'owned'|'licensed'|'generated',licenseNote,depictsProductId|null,isIllustrative:boolean,sha256}`. Generated imagery is disclosed; no unsupported claims of photographed stock or real manufacturer certification. Assets remain local and deterministic.

### 8.2 Exact scene inputs and outputs

Scene IDs: `living-standard`, `corridor-standard`.

Common source inputs at `brand/assets/scenes/<sceneId>/`:

- `base.png`, `protected-mask.png`, `thumbnail.png`, `calibration.json`, `AUTHORING.md`.
- For each surface ID below: `<surfaceId>-mask.png`, `<surfaceId>-diffuse.png`, `<surfaceId>-specular.png` only when specular is non-null.
- Optional `foreground.png` only if referenced.
- Scene 1 additionally: `smoke-glass-black.png`, `smoke-glass-black-mask.png`, `smoke-glass-black-protected-mask.png` (variant-specific protection; preserves room but permits replacing original handle/casing).

Surface IDs:

- `living-standard`: `floor`, `leaf`, `frame-left`, `frame-right`, `frame-top`, `skirting-back-left`, `skirting-back-right`, `skirting-right`.
- `corridor-standard`: `floor`, `leaf`, three independent casing surfaces, `skirting-back-left`, `skirting-back-right`, `skirting-left`, `skirting-right`, `skirting-left-near`, `skirting-right-near`. Other doors/hardware stay protected.

The exact `calibration.json` root implements the following build-only type in `src/lib/data/types.ts`:

```ts
export interface SceneCalibration {
  schemaVersion: 1;
  scene: RoomScene;
  sourceCrop: { originalWidth:number; originalHeight:number;
    cropPx:readonly [number,number,number,number]; outputWidth:1600; outputHeight:1200 };
  neutralPatches: readonly {surfaceId:Id; polygon01:readonly Vec2[];
    medianLinear:number; measurementNote:string}[];
  references: readonly {label:string; planeSurfaceId:Id; lengthMm:number;
    imageSegment01:readonly [Vec2,Vec2]; provenance:string}[];
}
```

`scene` includes only declared output paths and measured data, not binary contents. For a source already at canonical size, cropPx is `[0,0,1600,1200]`. Every lit surface needs one patch; every geometric plane needs reference evidence. `prepare-scenes.ts` merges it into validated `materials.json` data or checks equality; **choose one source of truth: calibration.json is authoritative for geometry, materials.json stores the generated scene entries**. The script validates the calibration type above, requires baselineLinear to match the neutral-patch median within 1e-6, and must never invent calibration or rewrite manually authored evidence. Door/floor collection definitions stay manually authored in materials.json.

Outputs preserve mask/light PNGs losslessly, copying names under `public/media/scenes/<sceneId>/`. `base.webp`, `thumbnail.webp`, `fallback.webp` are quality-checked color images; glass remains lossless RGBA PNG. Fallback is rendered from scene default selection using the canonical kernel and encoded WebP only after all assets validate. All source dimensions are 1600×1200; thumbnail is derived 320×240; stage fallback 960×720. Texture atlases/trim are lossless WebP or PNG under `/media/textures/`; no AVIF for masks/data maps.

The `DoorInsert.protectedMask` and `PreparedScene.insertMasks` fields carry variant-specific coverage. When active, insert protection overrides base protection inside the replacement region. The prelit insert has adequate opaque coverage over every removed original hardware/profile pixel. No transparent window into the original opaque door is acceptable.

### 8.3 Asset acceptance gate before finishing Phase 4

- Both photos are compositionally suitable: door fully visible, floor >=30% of image, useful floor depth, plausible daylight, no distorted door proportions, no unreadable details or watermarks.
- Matte white, near-black, saturated debug magenta, and checkerboard diagnostic renders reveal zero wall/furniture bleed; seams align at threshold; floor ends under skirting. Inspect 100% and phone fit-to-width.
- Compare clean light plate alone with base: no old planks, knots or door panels remain, but lighting/contact boundaries remain. Herringbone over straight-floor base must not show a second set of seams.
- Homography checker grid supports measured calibration; selected 193mm versus 244mm widths visibly differ at the same position by their ratio within raster tolerance. Test actual world projection, not manual eyeballing alone.
- Test each texture 3×3 repeat; grain direction and repeat bounds match schema. Thumbnail/swatch and rendered material are generated from the same artwork.
- Scene 1's glass insert preserves camera, opening, lighting and exterior wall pixels; no original handle remains. If it fails, Phase 4 is incomplete until repaired; don't remove the requested finish silently.
- Asset choice, masks and calibration have an explicit evidence entry in `verification/phase-4.md`. Automated checks alone do not certify realism. A junior model must show matched screenshots for human review.

## 9. Fixed demo content inventory

Use exactly **12 published products** at Phase 5. These are fictional demo SKUs with illustrative imagery, not claims to stock a real manufacturer's line. Supplier-provided verified replacements can use the same schema later. Origin values below are sample attributes labeled demo.

| Product ID = slug | Kind / initial SQ name | Main technical content | P2 seed? |
|---|---|---|---|
| `dera-bardhe` | door / Derë e bardhë mat | standard casing; MDF/CPL; 700/800/900×2000mm; default 900; sample TR | yes |
| `lis-natyral-10` | floor / Lis natyral 10mm | laminate; 1380×193×10; AC5; class 33; 4V; sample DE | yes |
| `dera-lis` | door / Derë lis natyral | standard casing; solid-core/CPL; 700/800/900×2000; default 800; sample SI | yes |
| `dushk-fshatar-8` | floor / Dushk fshatar 8mm | laminate; 1380×244×8; AC4; class 32; 4V; sample AT | yes |
| `dera-kashmir` | door / Derë e fshehur Kashmir | concealed aluminum; MDF/paint; 800/900×2000; default 800; sample TR | yes |
| `peshk-natyral-12` | floor / Parket natyral ribë peshku | engineered oak; 600×120×12; 3mm demo wear layer; herringbone; no AC; sample DE | yes |
| `dera-antracit` | door / Derë e fshehur antracit | concealed aluminum; MDF/paint; 800/900×2000; default 800; sample DE | P5 |
| `arre-klasike-12` | floor / Arrë klasike 12mm | laminate; 1380×193×12; AC5; class 33; 4V; sample TR | P5 |
| `dera-xham` | door / Xham i errët, profil i zi | slim aluminum/glass; 900×2000; smoke-glass finish only; sample TR | P5 content, required Studio record P4 |
| `hirte-skandinave-8` | floor / Hirtë skandinave 8mm | laminate; 1380×193×8; AC4; class 32; flat; sample DE | P5 |
| `pervaze-mdf` | trim / Pervaza MDF | architrave, 2200×70×16mm demo profile | P5 |
| `lajsne-mdf` | trim / Lajsne MDF | skirting, 2400×80×16mm demo profile | P5 |

P2 creates six published records. P4 adds the other Studio-dependent products (`dera-antracit`, `arre-klasike-12`, `dera-xham`, `hirte-skandinave-8`) with imagery/specs immediately; P5 adds trims and final content audit. Do not delay essential Studio data until P5 while claiming P4 complete.

Door finish IDs: `bardhe-mat`, `kashmir`, `lis-natyral`, `arre-erret`, `dushk-hirte`, `antracit`, `xham-erret`. Only `lis-natyral`, `arre-erret`, `dushk-hirte` need wood texture PNGs. Solid swatch starting values (visual calibration still required): white `#E7E5DF`, Kashmir `#BBAE9B`, anthracite `#333737`, black trim `#202321`. Wood swatch colors are sampled from actual albedo assets, not invented replacements.

Collections use the five floor-product IDs as collection IDs. Their art uses exactly the declared board dimensions. Scene 1 allows all five floors, standard opaque doors plus its glass insert; scene 2 allows all five floors and the two standard opaque door products. Hidden products remain catalog-only. Scene 2 defaults to herringbone but users may compare straight planks. It is not a different geometric floor plane for each pattern.

Default Studio selections:

- `living-standard`: `dera-bardhe` + `bardhe-mat` + `lis-natyral-10`, frame `door`, skirting `floor`, rotation 0.
- `corridor-standard`: `dera-bardhe` + `kashmir` + `peshk-natyral-12`, frame `door`, skirting `floor`, rotation 0.

Opaque standard door products can offer all six opaque finishes with their respective defaults; hidden products offer white/Kashmir/anthracite/natural oak only if imagery/material preparation supports them. Glass product offers only glass. Scene normalization retains a compatible opaque product when switching finish; it must choose `dera-xham` when selecting glass. The slim-aluminium glass product is allowed in living-standard only through its declared whole-door insert; this is the explicit exception to base-scene frameType equality. Frame mode `floor` or `door` on glass is unsupported; auto-normalize to black with a short explanation. Return to last allowed opaque mode when leaving glass only if explicitly stored in local UI state; otherwise deterministic default `door`.

No chevron product is required in the final 12: the brief permits chevron/herringbone and this plan chooses true herringbone. The schema supports adding a genuine chevron collection later; don't show an empty or mislabeled chevron choice.

## 10. Build scripts and verification command contract

Create scripts only in the phase where introduced; commands below are requirements for future implementation and were **not run as application checks during planning**.

### 10.1 Runtime bootstrap

During planning, `node` was absent from normal PATH; bundled Node exists at the path below, and a pnpm shim was discoverable. In each future shell, first run:

```sh
cd '/Users/ibrahimi/Doors & laminate'
export PATH='/Users/ibrahimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':"$PATH"
node --version
pnpm --version
```

If these versions do not satisfy the chosen dependencies, obtain a supported installed runtime through the app's dependency discovery before installing packages; do not rewrite system-wide shell files or silently install a new Node manager. Record actual runtime, package-manager and dependency versions in `verification/dependency-versions.txt`.

Phase 1 manually creates a minimal package.json (private name `porta-dysheme`, version 0.1.0, scripts below); do not run a scaffold generator that may overwrite the brief/plan. Then install once with exact saving:

```sh
pnpm add --save-exact next@16 react@19 react-dom@19 @fontsource/manrope
pnpm add -D --save-exact typescript@5 @types/node@22 @types/react@19 @types/react-dom@19 eslint@9 eslint-config-next@16 tailwindcss@4 @tailwindcss/postcss@4 postcss@8 vitest tsx zod cheerio
```

Align `eslint-config-next` with resolved Next version; verify peers. Vitest/tsx/Zod/Cheerio resolve compatible stable versions at bootstrap and then remain pinned. Do not use `--force`, ignore peer failures, or substitute a different framework. The framework documentation version is not an instruction to install an unavailable registry version.

### 10.2 Scripts in package.json

| Script | Exact command | First phase |
|---|---|---|
| `dev` | `next dev --hostname 127.0.0.1 --port 3000` | P1 |
| `lint` | `eslint . --max-warnings=0` | P1 |
| `typecheck` | `next typegen && tsc --noEmit` | P1 |
| `test` | `vitest run` | P1 |
| `validate:data` | `tsx scripts/validate-data.ts` | P1 |
| `build` | `next build && tsx scripts/finalize-export.ts` | P1 |
| `verify:export` | `tsx scripts/verify-export.ts` | P1 |
| `preview` | `node scripts/serve-export.mjs --host 127.0.0.1 --port 4173` | P1 |
| `assets:images` | `tsx scripts/prepare-images.ts` | P2 |
| `verify:assets` | `tsx scripts/verify-assets.ts` | P2 |
| `assets:scenes` | `tsx scripts/prepare-scenes.ts` | P4 |
| `render:fixtures` | `tsx scripts/render-fixtures.ts` | P4 |
| `verify:budgets` | `tsx scripts/verify-budgets.ts` | P5 |

Script argument convention: `pnpm validate:data --phase=2`; scripts parse `--phase=N` and default to current completed implementation phase from one constant. Final CI/report always passes `--phase=5`. Every script exits nonzero on a violated gate. No `--passWithNoTests` or ignored failures. `build` validates the applicable data phase via imports; P4+ requires scene manifest. Explicit asset preparation precedes builds; do not fetch media during build.

`next.config.ts`: `output:'export'`, `trailingSlash:true`, `images:{unoptimized:true}`, `poweredByHeader:false`. No redirects, rewrites, runtime route handlers, middleware/proxy, or experimental cache settings. Ordinary `<picture>` is intentional; ESLint's img warning may be disabled **only** in ResponsiveImage/ProductGallery with comment explaining static local derivatives, never blanket-disable ESLint.

`serve-export.mjs`: Node built-in HTTP server, correct MIME types, directory → index.html, URL decoding/path containment, 404.html with status 404, query ignored for file lookup, no SPA fallback, GET/HEAD only, cache-control no-cache locally. It is a verification tool, not the deployed runtime. Accept CLI host/port flags; reject path traversal. Do not use `next start` for exported `out/`.

`finalize-export.ts`: copy validated branding; generate 404 and robots (`Disallow: /` in demo); no sitemap in demo; live sitemap includes only known canonical routes. P5 adds offline files. This build-generated output must be covered by verify-export and not rely on a deployed Node process.

## 11. Phase 1 — Skeleton and foundation

**Goal:** reproducible static app shell in all three locales, schema validation, compact design system and demo-safe contact previews. No renderer, real product gallery or remote asset sourcing in this phase.

### Target files

Create all P1 paths from §3.2, explicitly:

- Root: `.gitignore`, `.node-version`, `.npmrc`, `package.json`, generated `pnpm-lock.yaml`, generated `next-env.d.ts`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `README.md`.
- Brand: `brand/brand.json`, `brand/products.json`, `brand/materials.json`, `brand/messages/sq.json`, `brand/messages/en.json`, `brand/messages/de.json`, `brand/assets/logo.svg`, `brand/assets/favicon.svg`; copy logos into `public/brand/`.
- Routes: `src/app/globals.css`, `src/app/(entry)/layout.tsx`, `src/app/(entry)/page.tsx`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/not-found.tsx`.
- Shell: `src/components/shell/AppShell.tsx`, `Header.tsx`, `LanguageMenu.tsx`, `MobileContactBar.tsx`, `DemoBadge.tsx` in that same directory.
- UI: `src/components/ui/Icon.tsx`, `Dialog.tsx`, `EmptyState.tsx`.
- Inquiry: `src/components/inquiry/InquiryProvider.tsx`, `InquiryDialog.tsx`, `InquiryButton.tsx`; `src/lib/inquiry/types.ts`, `message.ts`, `links.ts`.
- Libraries: `src/lib/data/types.ts`, `schemas.ts`, `load.ts`, `validate.ts`; `src/lib/i18n/locales.ts`, `messages.ts`, `format.ts`; `src/lib/brand/theme.ts`, `metadata.ts`.
- Scripts/tests: `scripts/validate-data.ts`, `verify-export.ts`, `finalize-export.ts`, `serve-export.mjs`; `tests/data.test.ts`, `i18n.test.ts`, `inquiry.test.ts`, `export.test.ts`; `tests/fixtures/brand.json`, `products.json`, `materials.json`.
- Evidence: `verification/phase-1.md`, `browser-checklist.md`, `dependency-versions.txt`; screenshots `verification/screenshots/p1-sq-390.png`, `p1-de-320.png`, `p1-en-1280.png`.

Do not edit the source brief. Update BUILD_PLAN only if a verified implementation constraint requires a documented correction, never to lower a failed acceptance criterion silently.

### Core logic

Implement §4 data types/schemas, §5 tokens, §7.1 shell/i18n, §7.3 preview-first inquiry, §10 scripts. Inquiry's Studio union may exist before Studio runtime; it must not import renderer modules. Empty products/materials are valid at phase 1. Header saved count is inert zero until P2; Studio control has an accessible “available in next phase” state rather than linking to a nonexistent page.

### Micro-task execution sequence

1. Read current instructions, brief and this plan. Inventory files; preserve any user additions. Record versions/phase scope in README. Do not initialize Git or change remotes unless requested.
2. Verify runtime; create package.json and configs; install dependency set. Write exact resolved versions to manifest/lockfile. Configure strict TS, alias `@/*` → `src/*`, `resolveJsonModule`, consistent NodeNext-compatible script execution through tsx; Next application module resolution remains bundler.
3. Define complete JSON contracts and stage-aware validation. Create brand default config with demoMode true, null siteUrl, sample contacts, colors from spec, city Prishtinë. Empty arrays in products/materials.
4. Create SQ dictionary first, translate EN/DE, implement fallback and unit tests. Validate headers and document language at build time, not only after hydration.
5. Create locally bundled font imports, tokens and baseline CSS. Clear framework starter styles; body margin zero; layout 100% width; no minimum width that breaks 320px.
6. Implement two root layouts and locale generation exactly as §3. Avoid middleware. Root entry replaces to `/sq/`; no redirect API. Build early now to catch routing/export errors before styling.
7. Build shell with compact header/language menu/demo badge/mobile bar. Add four clearly temporary 4:3 non-product skeleton slots directly in locale page; `aria-hidden` placeholders and concise catalog loading label. No fake SKU or completed feed claim.
8. Add inquiry dialog infrastructure. Every demo contact click shows preview and copy, with sample recipient visible but not actionable. Use event handlers rather than a disabled-looking live anchor.
9. Implement metadata, robots and 404 finalization; demo noindex on root, localized pages and 404. Site title defaults to brand, language-specific description; canonical absent while siteUrl null.
10. Implement minimal export auditor and secure static preview server. Auditor resolves HTML/CSS local assets and follows route anchors without mistaking fragment/query links for filenames. Tests cover URI decoding and traversal rejection; no need to test static JSX snapshots.
11. Run the commands below, inspect production `out/` in @Browser, save screenshots and phase evidence. Stop after reporting Phase 1.

### Commands

```sh
pnpm validate:data --phase=1
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:export --phase=1
pnpm preview
```

Run preview in a separate terminal/session; do not block later verification on its foreground process. Shut it down by its own session when finished, not with a broad process kill.

### Pass criteria and @Browser checks

- `/` loads then reaches `/sq/`; `/sq/`, `/en/`, `/de/` survive direct refresh on static server. Exported `<html lang>` matches each route. Invalid locale/product path yields actual 404 from static server.
- At 320×740, 390×844, 768×1024 and 1280×900: 56px header, no horizontal body scroll, bar does not cover content, menu/preview dialog usable by keyboard, visible focus, Escape closes and focus returns. German labels fit.
- All contact channels in demo open previews. No outgoing app opens. Preview copy failure remains usable. No localStorage/window access during build or hydration mismatch.
- No hero/corporate sections/large display type. Skeleton density intentionally previews the future feed, not an accepted product catalog.
- Automated tests prove schema invalidity, locale fallback, safe contact branching, encoding, 404/link resolution. Build + export pass independently of development server.
- Evidence states clearly: “Foundation complete; catalog assets, product detail, Studio and offline not implemented.”

## 12. Phase 2 — Lookbook feed and catalog grid

**Goal:** useful, fast six-product seed catalog with filters, favorites and real local previews. Layout acceptance becomes mandatory here.

### Target files

Create:

- `src/components/catalog/CatalogClient.tsx`, `CategoryPills.tsx`, `ProductGrid.tsx`, `ProductCard.tsx`, `FavoriteButton.tsx`.
- `src/components/ui/ResponsiveImage.tsx`; `src/lib/media/types.ts`, `paths.ts`.
- `src/lib/catalog/selectors.ts`, `query.ts`; `src/lib/favorites/store.ts`, `useFavorites.ts`.
- `scripts/prepare-images.ts`, `scripts/verify-assets.ts`; `tests/catalog.test.ts`, `favorites.test.ts`, `media.test.ts`.
- `brand/asset-sources.json`; six `brand/assets/products/<P2-product-id>/01.jpg` files from §9; generated `public/media/products/` derivatives.
- `verification/image-manifest.json`, `asset-manifest.json`, `phase-2.md`; screenshots `p2-feed-320.png`, `p2-feed-390x667.png`, `p2-feed-390x844.png`, `p2-feed-768.png`, `p2-feed-1280.png`, `p2-saved-empty.png`.

Edit: `package.json`, `pnpm-lock.yaml` (add Sharp dev dependency), `brand/products.json`, `brand/materials.json` (seed referenced floor collections/opaque finishes with planned asset paths; scenes still empty), all three message files, locale page, Header, InquiryProvider, data validation, verify-export, browser-checklist and README. No renderer code.

### Core logic

Implement §7.2 exactly. Product category is derived; favorites count/filter shares the same store. Data accepts future scene references only under phase 2/3 rules. Until P3, ProductCard renders image/title with no link to nonexistent detail route; favorite interaction still works. Include an accessible “product details coming next” only if necessary; don't litter every card with development copy.

### Micro-task execution sequence

1. Add Sharp via `pnpm add -D --save-exact sharp`. Populate the six seed records in alternating door/floor order from §9 and required collection/finish metadata.
2. Prepare six distinct cover assets with correct dimensions/provenance and Albanian names; translate metadata. Reject misleading or low-resolution imagery before styling cards.
3. Implement deterministic image derivatives/manifest. Verify there is no remote URL or optimizer dependency in generated `<picture>`.
4. Replace P1 placeholders entirely. Build ProductCard layout by numeric rules, before adding filters. Check 390×667 and long German names immediately.
5. Add category pills, URL parsing, push/popstate behavior; test empty category gracefully. Derived “hidden doors” is separate from standard interior doors; glass belongs interior doors. “All” includes future trims.
6. Implement favorites with lazy hydration, storage failures and cross-tab events. Header heart toggles saved-only query rather than navigating to an unimplemented page.
7. Implement catalog inquiry context; selected favorite IDs produce localized exact names, not stale sample text. Full list limited to known valid IDs; copy remains available.
8. Add image and export audits for all seed references; enforce image intrinsic dimensions, alt text and first-screen bytes.
9. Run phase commands and browser scenarios; document exact four-card geometry, screenshots and any pending content limitations. Stop.

### Commands

```sh
pnpm assets:images
pnpm validate:data --phase=2
pnpm verify:assets --phase=2
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:export --phase=2
pnpm preview
```

### Pass criteria

- Six real local product previews, correct specs and demo attribution; no starter art or “image coming soon”. At 390×667 and 390×844 four full cards visible above the bar; widths 320/768/1280 meet 2/3/4 columns and no body overflow.
- Clicking a category changes only matching products and URL; browser Back/Forward restores filter with no full reload or scroll-to-top. Direct `?category=laminate&saved=1` correctly resolves after favorite hydration.
- Unknown query values safe; empty state clearable; filters keyboard navigable. Heart doesn't activate product action. Favorites survive locale change/reload, remove missing IDs, and don't crash with malformed/blocked storage.
- Image loading uses actual srcset variants; first four eager, remainder lazy; intrinsic ratio prevents jumps. Desktop doesn't download all 1600px images for card thumbnails.
- Unit tests: every category predicate, malformed query, roundtrip, favorites toggle/dedup/brand isolation, derivative aspect/provenance; no fragile “class name snapshot” tests.

## 13. Phase 3 — Product detail and inquiries

**Goal:** every published seed product has a complete static detail route, relevant technical facts, local zoom and working demo-safe inquiry context.

### Target files

Create:

- `src/app/[locale]/products/[slug]/page.tsx`.
- `src/components/product/ProductGallery.tsx`, `ProductSpecs.tsx`, `ProductVariants.tsx`, `RelatedProducts.tsx`.
- `tests/product.test.ts`; six `brand/assets/products/<P2-product-id>/02.jpg` sources and corresponding generated derivatives.
- `verification/phase-3.md`; screenshots `p3-door-sq-390.png`, `p3-floor-de-320.png`, `p3-detail-en-1280.png`, `p3-gallery-zoom.png`, `p3-inquiry-preview.png`.

Edit: package/lock (PhotoSwipe), product data/gallery references, source ledger, image manifests, three dictionaries, ProductCard (activate real links), selectors/spec formatting, query helpers for product variants (in catalog/query.ts), inquiry message/context, metadata and export checker, browser checklist, README.

### Core logic

Use §7.3. Product route receives `params:Promise<{locale:string;slug:string}>`; await before lookup. `generateStaticParams` enumerates published slugs; invalid lookup calls notFound, never loads a catch-all runtime database. Render technical tables as semantic `<table><caption>...`; avoid empty filler rows. Related IDs resolve to max four published items excluding self; if insufficient related entries, fill by kind/category then stable display order, no duplicates.

### Micro-task execution sequence

1. Add `photoswipe` exact version. Add second useful view to each seed product and prepare derivatives. Never assign another SKU's image just to satisfy count.
2. Implement static product route and metadata; build before adding lightbox. Confirm 6×3=18 product HTML pages plus three catalogs and root.
3. Build vertical photo stack; first photo eager, others lazy. Photos use width/height from manifest. Lazy import PhotoSwipe and local CSS on first gallery activation (record actual chunk behavior).
4. Implement door variants for size and finish; floor page uses the single linked collection; trims later use trim dimensions. Query-selected invalid size/finish falls back and is sanitized. Keep physical dimensions in mm internally.
5. Build spec rows: door type/frame/core/surface/leaf sizes/origin; laminate thickness/board size/AC/usage/bevel/pattern/origin; parquet thickness/board size/wood/wear layer/pattern/origin, **no AC**.
6. Add product inquiry whose message includes exact SKU, selected finish/size or floor rating and canonical URL. Gallery opening must not overwrite inquiry context.
7. Add related grid, back-to-catalog with retained filter state where known, and locale changes preserving same slug/variant.
8. Test lightbox touch/keyboard/focus and inquiries as previews. Build and static-refresh all routes. Stop with report.

### Commands

```sh
pnpm assets:images
pnpm validate:data --phase=3
pnpm verify:assets --phase=3
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:export --phase=3
pnpm preview
```

### Pass criteria

- All 18 seed detail routes refresh directly; source HTML includes useful product content without JS. Invalid slug returns 404, not blank page.
- Door/floor specs are correct by type; AC absent from parquet; selected variant persists through locale/deep-link reload. Unknown rough-opening dimensions absent.
- Lightbox opens the right image/index, supports close/Escape, restores focus, and does not trap browser navigation after close. No overflowing photo crops or bar overlap.
- Demo WhatsApp, phone and Viber remain previews. Unit fixtures validate live link syntax without actually launching/sending. Long Viber text gets full copy and bounded share text; recipient-selection behavior is accurately described.
- Inquiry from related product uses that product, not previous page state; encoded URL reopens correct detail variant. Product and material identity remains synchronized.

## 14. Phase 4 — Studio visualizer

**Authorized remediation assumption:** generated illustrative plates are accepted for this demo; independent physical-scale calibration remains unresolved and must be reported separately. Two standard-casing scenes replace the original hidden-frame corridor; no Phase 5 authorization follows from remediation.

**Goal:** both authored scenes, every required door finish and all five floors, correct perspective/lighting, shareable combination URLs and truthful rendered-state inquiries.

### Target files

Create:

- `src/app/[locale]/studio/page.tsx`.
- `src/components/studio/StudioLoader.tsx`, `StudioClient.tsx`, `ScenePicker.tsx`, `StudioCanvas.tsx`, `SurfaceTabs.tsx`, `MaterialPicker.tsx`, `TrimControls.tsx`, `CombinationSummary.tsx`, `RenderStatus.tsx`.
- `src/lib/studio/types.ts`, `state.ts`, `query.ts`, `compatibility.ts`, `asset-loader.ts`, `render-controller.ts`.
- `src/lib/studio/render/color.ts`, `homography.ts`, `sampling.ts`, `lighting.ts`, `composite.ts`, `kernel.ts`, `cache.ts`.
- `src/workers/studio.worker.ts`; `scripts/prepare-scenes.ts`, `render-fixtures.ts`.
- `tests/studio-state.test.ts`, `homography.test.ts`, `color.test.ts`, `composite.test.ts`, `sampling.test.ts`; `tests/fixtures/render/fixture.json`, `base.png`, `mask.png`, `light.png`, `atlas.png`, `expected.png`.
- All exact scene/texture source files in §8.2, three door wood textures under `brand/assets/textures/doors/`, five floor `atlas.png` and `trim.png` pairs under `brand/assets/textures/floors/<collectionId>/`.
- Covers/second photos for the four newly published Studio products from §9; generated product/scene/texture derivatives and `verification/scene-manifest.json`.
- `verification/phase-4.md`, `verification/render-fixtures/` numeric diagnostic PNGs and JSON results; screenshots listed in §14 acceptance.

Edit: materials.json (including generated scene entries), products.json, source ledger, messages in all locales, package scripts, data validation (strict scene references), image/asset/export verifiers, Header/studioEnabled, product detail Studio links, inquiry message/context, README, browser-checklist. No additional 3D, upload, segmentation or pricing feature.

### Core logic

Implement §§6–8 as a single renderer path. Separate pure math from asset loading, worker scheduling, React, URL and inquiry. Scene geometry is data, never array literals embedded in canvas components. Materials and products resolve by ID once before the pixel loop. `CombinationSummary` uses completed frame state, while controls indicate pending selections.

### Micro-task execution sequence

1. Author/select the two scene photos and material textures; document provenance and illustrative status. Create neutral lighting plates, masks, per-surface mappings and calibration evidence. This is real work with a visual acceptance gate, not a placeholder to be filled by guessed numbers.
2. Add all five floor collection records and seven finishes; create/publish the four missing product records with both gallery images. Confirm default combinations resolve fully.
3. Implement `prepare-scenes` validation/copying and geometry merge. Use a `--check` mode that detects drift without rewriting files. Scene authoring is rerun only when source files change; assetRevision derives from source hashes and calibration.
4. Implement color conversion and homography pure modules first. Pass numeric fixtures before opening a photographic scene. Add checked error cases: singular/collinear quads, divide-by-zero, invalid baseline, NaN, wrapping negative UVs.
5. Implement linear mip generation/trilinear wrapped sampling and a synthetic checkerboard floor. Render via Node fixture runner with Sharp for image encoding; use the **same** pixel kernel as browser. Do not create an independent test renderer that can pass while production is wrong.
6. Implement opaque door/floor/frame/skirting lighting and coverage composition. First render solid magenta/checkerboard debug materials; inspect zero bleed. Then render actual white/oak/walnut materials.
7. Integrate smoke-glass insert with replacement/variant protection. Hide incompatible frame modes; verify original leaf and handle do not survive behind glass. Add explicit product/scene/finish compatibility tests.
8. Implement worker preparation/render/cancel/result protocol and main-thread fallback. Resolve worker import path from `src/lib/studio/render-controller.ts` as `../../workers/studio.worker.ts`. Browser build must emit a self-contained worker asset under out. Exercise intentional worker-unavailable fallback via a local test setting in development only, never an undocumented public query parameter.
9. Build StudioClient UI, lazy boundary, scene tabs and material controls. Bind URL normalization/reducer. Add original/combined comparison and reset; preserve scroll position on swatches. No unnecessary continuous transitions.
10. Add requested/rendered state split, stale-job protection and error handling. Simulate slow decode/repeated changes using a test stub in unit tests; in browser click 20 material choices quickly then switch scene and resize. The final displayed title and photo must be the last selection.
11. Generate each scene's default fallback with canonical kernel. Integrate immediate authored fallback and single sharp final-frame presentation. Avoid flashes to an unrelated room or blank white canvas.
12. Add product→Studio links, combination title and inquiry/share URL. Parse freshly reopened shared link and prove same scene/products/modes/rotation. Locale switch must not render another material.
13. Complete the full test and visual matrix below, profile on available hardware, produce evidence, and stop. If calibration/glass quality fails, report Phase 4 incomplete with the specific artifact gap instead of claiming completion based on build success.

### Commands

```sh
pnpm assets:images
pnpm assets:scenes
pnpm assets:scenes --check
pnpm validate:data --phase=4
pnpm verify:assets --phase=4
pnpm lint
pnpm typecheck
pnpm test
pnpm render:fixtures
pnpm build
pnpm verify:export --phase=4
pnpm preview
```

`render:fixtures` compares against approved synthetic expected data; it must not overwrite `expected.png` on every run. Updating expected fixtures is an explicit reviewed action after explaining the change. Full photographic comparisons use before/after evidence and human judgment, not a brittle exact screenshot hash.

### Numeric and behavior acceptance

- Homography corner reprojection max error <=1e-6 normalized units; inverse roundtrip <=0.01mm on the synthetic interior grid; calibration reference <=1 source pixel. Degenerate mappings throw a descriptive data-validation error.
- Byte-preserving zero-mask region; coverage .5 correctly mixes in linear light; mask is not squared; black specular adds zero; shade clamp extremes exact; linear roundtrip <=1 byte.
- Analytic plank-width projection differs appropriately between 193mm/244mm and stays invariant across output sizes within 1 source pixel. Herringbone is distinguishable from straight, with no old seams.
- Texture tile edge continuity and negative-coordinate wrap; mip sampling crosses boundaries with no jump. No perspective mesh seams because inverse mapping uses one continuous homography.
- Restoring any normalized Studio selection then serializing/parsing yields identical state. Invalid IDs/version gracefully normalize; product and finish cannot mismatch. Hidden/glass incompatibility is visible and deterministic.
- Stale job results never replace latest result. Worker errors use fallback or retain last good frame. Repeated resize/dispose doesn't retain live workers or grow owned render cache beyond 96MiB.

### Required @Browser photographic matrix

Use same scene framing, display size and zoom for comparison. Save:

- `p4-living-white-oak-390.png`
- `p4-living-walnut-grey-390.png`
- `p4-living-glass-390.png`
- `p4-corridor-kashmir-herringbone-390.png`
- `p4-corridor-anthracite-herringbone-1280.png`
- `p4-floor-rotation-0.png`, `p4-floor-rotation-90.png`
- `p4-debug-mask-100pct.png`, `p4-debug-scale-grid.png`
- `p4-de-320-controls.png`, `p4-tablet-768.png`, `p4-inquiry-combination.png`

At 320/390/768/1280: controls legible, focus visible, stage uncropped, selected option announced, render status nonblocking, inquiry disabled while requested and completed differ. Compare floor depth, board scale, grain direction, window lighting, hardware edges, threshold, skirting corners and floor contact shadows. Reject flat color washes, repeated obvious knots, double seams, floating furniture, light halos, and white doors that turn into uniform clipped patches.

Target performance (measure, do not assume): final displayed frame p95 <=250ms after selection on target phone (visible-preview metric retired by authorized remediation); immediate visible fallback <=500ms after its bytes are available; no single main-thread batch >50ms attributable to compositor; zero rendering while idle. A desktop @Browser pass cannot certify these phone targets. Record actual measurements and device; if hardware is unavailable, mark physical performance pending without disguising it as passed.

## 15. Phase 5 — Content, offline, polish and verification

**Goal:** complete 12-product catalog, consistent translations/assets, offline behavior within stated limits, repeatable static build and a truthful final verification report. This phase does not deploy the site.

### Target files

Create:

- `src/components/offline/OfflineProvider.tsx`, `OfflineStatus.tsx`, `SaveStudioOffline.tsx`.
- `src/lib/offline/register.ts`, `messages.ts`; `src/service-worker/sw.ts`; `tests/offline.test.ts`.
- `scripts/verify-budgets.ts`; `verification/budgets.json`, `performance.json`, `REPORT.md`.
- Two trim products' sources `brand/assets/products/pervaze-mdf/{01,02}.jpg`, `brand/assets/products/lajsne-mdf/{01,02}.jpg` and generated derivatives.
- Generated `out/sw.js`, `out/offline.html`, `out/offline-manifest.json`, `out/build-info.json`, plus final robots/404; these are export artifacts, not application API endpoints.
- Screenshots `p5-feed-{320,390,768,1280}.png`, `p5-product-de-390.png`, `p5-studio-sq-390.png`, `p5-offline-ready.png`, `p5-offline-reload.png`, `p5-update-available.png` under verification/screenshots.

Edit: brand/products/materials/messages/source ledger as needed, image/scene manifests, AppShell/StudioClient for offline UI, package/lock (add esbuild dev dependency to compile SW), finalize-export, data/asset/export audits, browser-checklist and README. Only repair earlier application modules when a specific failed check justifies the change; rerun their affected tests.

### Core offline contracts

```ts
type OfflineState = 'unsupported'|'online'|'offline'|'saving'|'ready'|'update-available'|'error';
interface OfflineProgress { done:number; total:number; bytes:number }
declare function registerOfflineWorker(): Promise<ServiceWorkerRegistration | null>;
declare function requestStudioCache(registration:ServiceWorkerRegistration,
  onProgress:(value:OfflineProgress)=>void, signal:AbortSignal): Promise<void>;
declare function OfflineProvider({ enabled, children }: { enabled:boolean; children:ReactNode }): ReactNode;
declare function OfflineStatus({ state, onUpdate }: { state:OfflineState; onUpdate:()=>void }): ReactNode;
declare function SaveStudioOffline({ state, progress, onSave, onCancel }:
 { state:OfflineState; progress:OfflineProgress|null; onSave:()=>void; onCancel:()=>void }): ReactNode;
```

Use [standard service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers); supported only over HTTPS or localhost. Do not register in `next dev`. No push notifications, background sync or account data. Offline UI is compact text near Studio controls; not a feed-blocking banner.

### Micro-task execution sequence

1. Finish exactly 12 products from §9, two images each, correct SQ/EN/DE labels and accurate mapping to finishes. Audit all claims; retain demo labeling. Supplier proof absent means demo, not “verified”.
2. Human-read every Albanian product/CTA and long German label. Ensure herringbone/chevron and door types are correctly named. Repair accessibility, visual overflow, lightbox and no-JS content issues.
3. Add esbuild via `pnpm add -D --save-exact esbuild`. `finalize-export` bundles service-worker TS to plain JS and injects a manifest derived from actual output hashes. No hardcoded chunk filenames.
4. Generate `build-info.json` containing brand ID, catalogVersion, source/config hash and build ID. Surface build ID only in diagnostics/report, not main sales interface.
5. Generate offline manifest with two sets: minimum shell (offline.html, logos, local fonts and small UI resources) and Studio pack (all three Studio HTML files, required Next scripts/styles, worker chunk, both scenes/maps, all seven finishes/five floor textures). Include file byte sizes and hashes; total Studio pack must fit configured 20MiB. Do not claim ready if a manifest file failed.
6. Use native `<a>` for inter-route navigation throughout this small catalog (detail, locale, Studio); preserve zero-reload History API filters/swatches. This deliberately avoids relying on uncached Next RSC-prefetch responses offline. Do not mix in Link prefetch midway without adding verified RSC cache support.
7. Service worker intercepts same-origin GET only. Navigations: network-first with a bounded 3s timeout, then exact cached pathname HTML (query state is applied by client), otherwise offline.html with links to known cached pages. Unknown paths must still be 404 online. Never return HTML for missing JS/images.
8. Content-addressed scripts/fonts: cache-first in build-namespaced caches. Media URLs include a generated hash query `?rev=<asset-sha>` through media/path helpers (source metadata may retain bare pathname); cache match includes revision. Stable build metadata/worker bypass long-lived caches. HTML/network updates must never pair new maps with stale unversioned textures.
9. Visited page/resource caching is bounded (max 100 responses plus byte quota); explicit Studio pack is separate and atomic. Fetch pack with limited concurrency 3; stage entries, verify all successes, then mark pack ready. On cancel/failure, delete only that staging pack and keep prior ready pack. Handle QuotaExceededError with a useful retry/remove-offline-pack action.
10. Version updates wait; present “Përditësim i gatshëm”. On deliberate update click, tell waiting worker to activate then reload once. Do not change scene assets mid-render. Retain previous cache until no clients use old build, or until the deliberate reload handshake has completed; prune only this app's cache prefix.
11. Test offline on a controlled loaded origin, then hard reload catalog and Studio, change every stored finish/scene and reopen shared combination URL. Uncached product/locale routes show the explicit offline fallback. Copy inquiry works offline; live sending needs the external service/network.
12. Run complete commands, browser/device matrix and performance budgets. Fix failures before final report; do not invent numeric results for inaccessible tools/devices.
13. Write `verification/REPORT.md` with pass/fail/pending evidence, versions, routes/assets counts, screenshots, renderer calibration, reproducible commands and real-device limitations. README includes rebranding instructions and static-host requirements. Stop; no deployment.

### Commands

```sh
pnpm install --frozen-lockfile
pnpm assets:images
pnpm assets:scenes
pnpm assets:scenes --check
pnpm validate:data --phase=5
pnpm verify:assets --phase=5
pnpm lint
pnpm typecheck
pnpm test
pnpm render:fixtures
pnpm build
pnpm verify:export --phase=5
pnpm verify:budgets
pnpm preview
```

These run after the dependency lock is updated for this phase. For a clean-room reproducibility check, use a temporary directory with project files and the same lockfile, not destructive deletion of the working copy. Generated out/public media may be rebuilt; never delete source assets or the source brief.

### Final pass criteria

- Exactly 12 published products, 24 gallery images with valid local derivatives, two complete calibrated scenes, seven door finishes, five floor collections, and three locales.
- Route expectation: root + 3 catalogs + 36 product pages + 3 Studio pages = **43 navigable HTML pages**, plus standalone 404 and offline fallback. Framework implementation files/route payloads are not counted as extra product pages. Auditor checks expectations from data, not a stale hardcoded success count.
- `out/` alone works without Node runtime/server features. No runtime remote image/fonts/scripts, missing local assets, `/_next/image`, undefined JSON references, server actions, or backend endpoints. Outbound contact links only exist in a live-mode fixture, never active demo DOM.
- Demo noindex/nofollow present in every indexed page; robots disallows; sitemap absent in demo. Live-mode build tested from isolated fixture config, never accidentally enabling real contacts in working demo. No invented public origin.
- All @Browser checks in §16 complete or explicitly failed/pending. Real device touch/share/offline/performance still require physical devices; lack of them is a report limitation, not silently waived acceptance.
- Offline ready is displayed only after full manifest success, uncached routes have useful fallback, update test loads new build ID, and no stale service-worker screenshot is used as proof of current code.
- Zero critical/major rendering defects in required screenshot matrix; no catastrophic perf regressions; no unreported accessibility failures.

## 16. Cross-phase verification specification

### 16.1 What the auditing scripts must actually inspect

`validate-data.ts`: parse JSON, strict schema errors with JSON path, duplicate IDs, cross-references, compatibility, all translations, staged content counts, demo/live safeguards.

`verify-assets.ts`: open media headers; positive intrinsic dimensions; no missing source; expected derivative variants; no EXIF orientation drift; masks/light/protection dimensions/channels; alpha conventions; bounds; source hashes; texture aspect/physical size; full scene references; source provenance. Decode numeric arrays for mask-overlap/coverage assertions; don't merely check filenames exist.

`verify-export.ts`: parse all generated HTML with Cheerio, titles/lang/robots/headings, referenced href/src/srcset/stylesheets, local CSS url() fonts/images, known static routes, expected product counts and absence of active demo contacts. Strip hash/query safely for local path lookup, percent-decode path once, ensure containment in out. Validate worker/offline-manifest references. Discover JS chunks from build output/manifests, not just static script tags. Do not falsely fail harmless external research links in README; README is not served app content.

`verify-budgets.ts`: file-based gzip/brotli measurements of route chunk sets and image variants; write measurements, limits and failures to verification/performance.json. Do not sum every shared chunk multiple times. Route initial chunk sets must exclude lazy PhotoSwipe/Studio worker on feed. File budgets are not LCP/INP measurements.

### 16.2 Budgets (targets, not researched benchmark measurements)

| Metric | Gate |
|---|---|
| Feed initial JS, gzip | <=200KiB per locale route, excluding lazy gallery/Studio; if framework baseline alone exceeds, report measured baseline and decide before extra JS is added |
| Feed CSS + fonts, compressed | <=140KiB; no unused font weights/subsets |
| First four feed images combined at 390px | <=240KiB transferred image bytes |
| First-screen route assets combined | <=700KiB cold, excluding images below first two rows |
| One 640px card derivative | WebP <=80KiB, AVIF <=60KiB target; visual quality must not be destroyed to pass |
| One scene fallback 960px | <=220KiB |
| Studio first useful scene bytes | <=2.5MiB additional; second scene/full palette lazy |
| Studio explicit offline pack | <=20MiB actual stored file bytes, manifest and progress shown |
| Owned render arrays/cache | <=96MiB; release active-scene allocations on scene change |
| CLS | <=0.1 measured on production load |
| LCP | <=2.5s target with documented mobile/network conditions |
| INP | <=200ms target on real interaction dataset; lab single-click delay is not field INP |
| Final-frame latency | single final-frame p95 <=250ms on named target phone; ≥20 switches, separate decode/cold time |

If a budget fails, first reduce unused fonts, eager assets, inappropriate image sizes, duplicated modules or oversized render resolution. Do not remove masks/lighting quality just to shrink a number. If the framework baseline makes a target impossible, document proposed revised target and rationale for review; do not mark a failed original target as passed.

### 16.3 Browser execution checklist

Only @Browser. Read its current local-development/viewport documentation when beginning browser verification. Use the actual production URL `http://127.0.0.1:4173/sq/`, not HMR. Read currently visible state before choosing controls; don't reuse stale element indexes. Reset temporary viewport overrides afterwards.

For each phase applicable checks:

1. Fresh direct load, deep-link refresh, back/forward; root and unknown-route behavior.
2. SQ/EN/DE at 320×740, 390×667, 390×844, 768×1024, 1280×900. 200% text zoom/reflow separately; don't force the normal card-count target at enlarged text.
3. Filter pills via tap/keyboard; favorites; malformed URL; denied/corrupt storage; empty results.
4. Contact preview for catalog, selected door variant, floor and completed Studio combination; copy fallback and Viber long-message path. No real sends during QA.
5. Gallery open/close/focus/scroll; intrinsic image size; no layout jumps when font/images finish loading.
6. Studio every finish in both compatible scenes, 0/90 rotation, frame/skirting modes, glass/hidden incompatibility, rapid changes, resize, locale switch, shared URL restore and retry on failed assets.
7. Keyboard-only navigation: all actionable controls reachable, labels announced, aria-pressed/selected accurate; no focus hidden under sticky bars; dialog focus returns; escape behavior. Images meaningful alt, decorative icons hidden.
8. Console/resource errors reviewed through available browser diagnostics; no unsupported assumption that empty UI means no network errors. If built-in browser cannot emulate network/storage failure, use dependency-injected unit tests and mark browser failure-mode check pending rather than another browser.
9. Offline after explicit ready; hard reload; all saved palette assets; update from build A to build B; build-info match. A successful in-memory render while disconnected is not sufficient offline proof.
10. On physical iPhone Safari and an Android Chrome phone when available: touch targets, scrolling, safe area, external WhatsApp/Viber draft behavior (without sending), offline reload, worker fallback and latency/thermal behavior. iPad portrait/landscape is useful for showroom use. Emulated viewport alone does not certify these.

### 16.4 Unit tests worth writing

Focus on real risks: schema/reference constraints; URL roundtrips; compatibility; contact safety/encoding; storage failure; homography/inverse numerical stability; metric scaling; gamma conversion; partial-mask coverage; stale-worker races; cache disposal; offline atomic download/update. Avoid tests that merely repeat constants or snapshot the same Tailwind classes from implementation.

Minimum synthetic fixture set: identity warp, trapezoid warp, rotated floor, negative UV, 50% coverage, fully protected hardware, shadow clamp extremes, black reflection, wrong-shaped asset rejection, and stale render cancellation. Golden fixture generation must be independently reviewed once with known math values before it can become regression evidence.

### 16.5 Evidence/report template (use at each phase)

```text
Phase and date:
Implemented files/features:
Data/asset counts:
Dependency/runtime/build ID:
Commands run and actual exit outcomes:
Browser URLs, viewports, scenarios and screenshots:
Visual acceptance notes (when relevant):
Measured performance, environment and method:
Known failures / pending physical-device or human checks:
How to run: exact commands:
Next phase (not started):
```

Never fill “passed” from a planned command. The current BUILD_PLAN contains no executed application tests because the application does not yet exist.

## 17. Rebranding and scope limits

Target 15–20 minutes means an already-prepared replacement brand/catalog asset pack. It does not include inventing product information, translating a new catalog, photographing rooms, masking surfaces, or calibrating a new camera.

Rebrand sequence: duplicate/replace brand config values → swap local logo/icon → replace products/finishes/collections with validated IDs and supplied images → rebuild assets → validate strict references → build/export audit → visual spot-check 390px and Studio combinations → keep demoMode true for pitch. Adding a new scene requires full §8 asset preparation and visual gate, not just changing a filename.

Phase 1 alone does not implement the full product. Phase 4 visual quality depends on approved authored assets. No plan can guarantee photographic realism from arbitrary unprepared photos; this blueprint makes that dependency testable rather than hiding it in a “magic blend mode”.

Out of scope: upload-your-room segmentation, live room measurement, 3D models, camera movement, automatic pricing, stock synchronization, CRM, checkout, live publishing and actual message sending. Revisit only with explicit new scope.

## 18. Next action after this planning session

Present architecture and Phase 1 scope to the user. Stop. On explicit Phase 1 authorization, execute §11 only, carry forward this document's contracts, report evidence, and stop again before Phase 2.
