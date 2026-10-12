# Phase 3 evidence — Porta & Dysheme

Date: 11 October 2026. Scope: BUILD_PLAN §13, with §1 execution boundaries, §4 contracts, §5 tokens/layout and §7.3 component behavior. Status: **PASS — ready for explicit Phase 4 authorization**, with physical-device checks pending below. No Studio renderer, authored scene calibration, offline implementation, deployment or outgoing messaging was added.

## Implemented

All six published seed products have static `/sq/products/<slug>/`, `/en/products/<slug>/` and `/de/products/<slug>/` routes. `generateStaticParams` enumerates published slugs; awaited params and invalid lookup use `notFound`. Localized titles, descriptions, heading, SKU, gallery, default selectors, useful semantic specifications and related links are present in exported HTML. Demo noindex/nofollow and absent production canonical remain intentional while `siteUrl` is null. Unknown products return the standalone branded HTTP 404.

The prescribed product component files implement two-image galleries, specifications, door variants and at most four unique published related products. Related IDs resolve first, then category/kind and stable display order fill remaining slots; self and unpublished entries are excluded. Catalog image/title links are native anchors; favorites remain sibling buttons. Return links retain valid category/saved filters. Floor pages use their single linked collection.

Door variants validate against each product's actual size/finish IDs. Native History push/replace synchronizes controls, language links and Back/Forward without forced scrolling. Invalid/default variant params are normalized away. Product context drives both its inquiry action and the header/mobile contacts; clean inquiry URLs remove catalog/tracking keys and reopen the selected product/variant. Related navigation replaces the previous SKU/context. Gallery activation never sets inquiry context.

Door tables include type, frame, core, surface and leaf sizes. Unverified leaf thickness and rough-opening values are omitted. Laminate has thickness, board dimensions, **separate AC and usage class**, bevel and pattern. Parquet has thickness, board dimensions, construction, wood, wear layer and herringbone pattern, **no AC/usage rating**. Origins and specifications stay explicitly demo values.

Mobile source/focus order is first photo → facts/variants/inquiry/specs → remaining photo → related grid. The gallery's original public call remains supported; an optional ReactNode facts slot permits this reading order without duplicate lightboxes or a CSS-only focus-order mismatch. Desktop uses the 60/40 gallery/facts grid; facts stick at 72px below the 56px header and stop before related products. Title and color/radius tokens follow §5. Back links retain a 44px accessible target. PhotoSwipe's `mainClass` applies the specified z-index 100 without shipping its core CSS early.

## Executed checks

All finite commands completed with exit 0 after repairs. Preview started successfully, served the final static output, and was deliberately stopped through its own session with Ctrl+C/SIGINT after QA (exit 130 is expected cleanup).

| Command | Final result |
| --- | --- |
| `pnpm assets:images` | 12 sources, 120 AVIF/WebP derivatives, no upscaling |
| `pnpm validate:data --phase=3` | 6 products / 0 scenes / demo=true |
| `pnpm verify:assets --phase=3` | Source/derivative hashes, dimensions, provenance, inventory and byte budget PASS |
| `pnpm lint` | 0 errors / warnings |
| `pnpm typecheck` | Route generation and strict TypeScript PASS |
| `pnpm test` | **8 files / 82 tests PASS** |
| `pnpm build` | Static export PASS; 18 details, three catalogs and root |
| `pnpm verify:export --phase=3` | **22 navigable pages / 25 HTML files / 2,614 references / 16 JS chunks** |
| `pnpm preview --port 43871` | Final production `out/` served at `http://127.0.0.1:43871/` |

Node 24.19.0 / pnpm 11.25.0 / macOS arm64. PhotoSwipe **5.4.4** is an exact runtime dependency; Sharp remains 0.35.5. Existing dependency versions were retained. Final build ID: `vOqqm_LHIfORyBnCHydfR`. Lockfile SHA-256: `00bf68e2a09898d665655d2774d9a67babc548ca94965584d49ec59c8a3f044e`.

The route was built successfully before adding PhotoSwipe, then rebuilt and audited after final integration. Initial test failures came from passing nested SiteData instead of flattened InquiryData in new test fixtures; fixtures were corrected, and all gates rerun. The final export checker checks actual HTML content/spec values, gallery loading/size/alt attributes, mobile reading order, related uniqueness, local references, metadata, phase route inventory and absence of eager gallery chunks/CSS. Earlier phase evidence is historical, not the current route inventory.

New tests cover two distinct owned views per product; valid/invalid/oversized variant queries; language/query roundtrips; retained return filters; omitted unknown door dimensions; localized typed specification rows; AC separation/parquet omission; related exclusion/order/fill; exact selected SKU/size/finish and clean variant URL; replacing product identity; invalid inquiry variants; and live **fixture-only** WhatsApp/Viber encoding. Existing data, favorites, media, i18n, export safety, clipboard failure and demo-contact tests remain active.

## Assets and on-demand gallery

Six `brand/assets/products/<seed-id>/02.jpg` files were generated with the built-in OpenAI ImageGen tool, each referencing its own inspected Phase 2 cover. All actual second-view sources are 1774×887. They show white/oak/hidden-cashmere hardware and jamb details, straight natural/rustic oak grain/joints, and natural herringbone detail. Every result was visually inspected. No other SKU's image was reused. They are illustrative demo artwork, not evidence of supplier construction or stocked inventory. Prompts, attribution and source hashes are recorded in `brand/asset-sources.json`.

The established Sharp pipeline preserves source aspect, strips metadata, converts to sRGB and creates local AVIF quality 50 / WebP quality 80 at 320/640/960/1600/original widths without enlargement. Both manifests are regenerated. Total derivative bytes: **6,523,530**. The unchanged first-four 640w covers total **56,578 AVIF / 115,830 WebP bytes**, below the 245,760-byte budget in either format. Local originals and derivative provenance remain inspectable; runtime needs no external image service.

PhotoSwipe and `photoswipe/style.css` use dynamic imports only on intentional gallery activation. Export inspection identifies core chunk `/_next/static/chunks/0iy78bt_292rf.js`; it appears in no initial HTML script list. @Browser confirmed both catalog and fresh detail initially omit that core script. Fresh detail loads only common stylesheet `/_next/static/chunks/3naldk9-iki9b.css`. First activation adds the core chunk and local stylesheet `/_next/static/chunks/0z8fsym78c3tc.css`; exported initial stylesheets contain no `.pswp` core rules. The common stylesheet includes only the named z-layer override.

The first inline view is eager/high priority and the remaining view lazy. Local srcsets supply responsive inline images; at 390px the observed first source was 960w AVIF. This is a product-detail source, not a catalog thumbnail. Lightbox uses the largest manifest WebP with actual source dimensions; observed white-door views were 1774w WebP with correct alt text and selected index. No cold-cache network timing or physical-device memory claim is made.

## Built-in browser evidence

Only **@Browser (Codex In-app Browser)** was used, against production static `out/` on the already established fresh origin at port 43871. No development HMR, external automation browser, unrelated process termination or user cache clearing was used.

All **18** product URLs were opened and explicitly reloaded after the final build. Independent direct HTTP checks returned 200 and confirmed SKU/table HTML for every route. For each locale, the following product/viewport assignments were measured; each has two images, four related products, header 56px, zero horizontal body overflow and the correct first-photo/facts/second-photo DOM order. The first image was loaded in all cases; below-fold remaining views retain native lazy behavior.

| Product | Requested viewport | Actual client width | Gallery image width × height |
| --- | --- | --- | --- |
| `dera-bardhe` | 390×667 | 375 | 351×175.5 |
| `lis-natyral-10` | 390×844 | 375 | 351×175.5 |
| `dera-lis` | 768×1024 | 753 | 413.40×206.70 |
| `dushk-fshatar-8` | 1280×900 | 1265 | 715.80×357.90 |
| `dera-kashmir` | 320×740 | 305 | 281×140.5 |
| `peshk-natyral-12` | 390×844 | 375 | 351×175.5 |

The desktop browser reserves a 15px scrollbar on long detail pages, so client widths are separated from requested viewports. Inline photos retain intrinsic aspect and do not crop the door/material subject. Additional German parquet at 320×740: after scrollTop=444 its full table spans y=78.5–571.5, above the bar at y=676. At page end the last related card ends at y=647.75, leaving 28.25px before the bar. English oak door at 1280×900: facts start at y=186; after scrollTop=117 they stick at y=72. At page end facts bottom=482.80 and related top=514.80, preserving the 32px section gap.

The catalog regression repeated **all 15 language × viewport combinations**, with six cards, 2/3/4 columns, no body overflow and header 56px. Fourth-card bottom remains 529.75 at 320px, 582.25 at both 390px heights, 680 at tablet and 454 at desktop. Mobile bar starts at 676 / 603 / 780 respectively; four full cards clear it. No hero or premature Studio link exists.

| Interaction | Result |
| --- | --- |
| SQ white door 70×200cm + Kashmir | PASS; URL and selects agree |
| Invalid size/finish with category/saved | PASS; defaults restored; bad params removed, return filters retained |
| Back/Forward between finish choices | PASS; 70cm size persists and default/Kashmir finish follows history |
| SQ→EN→reload and SQ→DE→reload | PASS; same slug, 70cm/Kashmir selection, localized labels and query retained |
| Detail favorite → locale/reload → filtered catalog | PASS; no favorite navigation, persisted favorite, category/saved retained; one matching card |
| Remove saved product and clear empty state | PASS; count/filter update; temporary favorite removed |
| Catalog image/title and related links | PASS; real static routes, selected new product identity |
| First and second gallery activation | PASS; correct 1/2 or 2/2 image, local full-size WebP |
| Left/Right and pointer drag | PASS; index updates; native pointer swipe advanced 1/2→2/2 |
| Zoom, close button and Escape | PASS; zoomed handle detail reviewed; lightbox removed |
| Focus restoration | PASS; originating image button receives focus; toolbar controls keyboard reachable |
| Browser Back/Forward after gallery close | PASS; normal locale/history navigation works |
| Inquiry after opening/closing gallery | PASS; exact PD-DEMO-01 / 70×200cm / Kashmir; clean URL drops category/saved |
| Related natural oak laminate inquiry | PASS; PD-DEMO-02, 10mm, AC5 and usage33; previous door identity absent |
| Desktop header quote | PASS; selected PD-DEMO-01 / 70cm / Cashmere, exact variant URL |
| All three German parquet contact channels at 320px | PASS; previews 296×444px; PD-DEMO-06 / 12mm / Eiche; no AC, no actionable external link |
| Copy action | PASS; localized copied status observed, selectable full textarea retained; system clipboard contents not independently certified |
| Console on product/catalog/contact matrix | PASS; no warning/error entries returned before intentional 404 navigation |
| Unknown product / Studio | PASS; HTTP404; invalid-product page visually confirmed |

Live WhatsApp/Viber syntax was tested with fixtures, never launched. Viber shares via `viber://forward?text=...` and requires the user to choose the recipient; it does not target the displayed contact automatically. Over-200-character full messages retain exact full copy text while forwarding a bounded brand + selected variant URL. An overlong compact URL falls back to a preview.

Required screenshots, captured from the final build and visually inspected:

- `screenshots/p3-door-sq-390.png`
- `screenshots/p3-floor-de-320.png`
- `screenshots/p3-detail-en-1280.png`
- `screenshots/p3-gallery-zoom.png`
- `screenshots/p3-inquiry-preview.png`

@Browser supplies JPEG captures; these PNG files preserve those pixels through format conversion, without visual editing. Production preview was stopped, temporary tab closed, viewport reset and test favorites removed.

## Limitations and next task

Physical iPhone/Android touch/pinch, mobile screen-reader focus cycles, safe-area hardware behavior, denied browser storage/clipboard and 200% text zoom remain pending manual/device checks. Desktop pointer swiping is not a physical-touch certification. Unit denied/quota/corrupt storage and clipboard failure handling pass. No physical color, supplier specification or renderer realism claim is made.

Phase 3 is complete within the available verification environment. Next is **Phase 4 — Studio visualizer**: authored two-scene assets, masks, separated illumination/albedo, material atlases, geometry/calibration and the Canvas/worker renderer. Planned material paths, provisional wood swatches/atlas metadata and empty scenes remain pending that phase. Start only after explicit authorization.
