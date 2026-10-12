# Phase 2 evidence — Porta & Dysheme

Date: 11 October 2026. Scope: BUILD_PLAN §12 only. Status: **PASS — ready for explicit Phase 3 authorization**. No detail routes, gallery/lightbox, Studio renderer or offline implementation was added. No deployment or message sending occurred.

## Implemented

Six published seeds in the prescribed alternating door/floor order: `dera-bardhe`, `lis-natyral-10`, `dera-lis`, `dushk-fshatar-8`, `dera-kashmir`, `peshk-natyral-12`. Names, alt text and demo attribution exist in SQ/EN/DE. Door default leaf sizes are 90×200 / 80×200 / 80×200 cm; laminate cards show 10mm AC5 4V and 8mm AC4 4V. Parquet shows 12mm and localized oak, with no AC rating. Origin labels are representative demo values, not supplier claims.

CatalogClient, CategoryPills, ProductGrid, ProductCard and FavoriteButton replace all skeleton markup/styles. Categories derive from kind, door type and floor collection. Query filters use native History push/replace plus popstate; invalid values are normalized. Empty results and saved-only empty states are clearable. Product cards have no detail action yet. The optional `priority` flag on ProductCard/ResponsiveImage is additive to the specified signatures and supplies high fetch priority only to the first cover.

Favorites share one provider/store across feed and header, lazily hydrate under `pd:porta-dysheme:favorites:v1`, retain sorted known IDs only (max 200), catch denied/quota/corrupt storage and synchronize storage events between tabs. Catalog inquiry context uses all saved product IDs even when a category hides them; desktop quote and the mobile bar consume that context. All demo channels remain preview dialogs with selectable text/copy and Escape/focus restoration.

Six opaque finish and three floor-collection records are metadata only. Scene data is empty. Only known planned scene/finish IDs and pending texture paths are accepted in Phase 2/3. The Studio button is disabled and no pending texture is loaded by the feed. Wood swatch colors and atlas repeat metadata are provisional; actual albedo sampling, seam artwork and calibration belong to Phase 4.

## Executed checks

All finite validation/build commands completed with exit 0. Preview started successfully and was intentionally stopped with Ctrl+C (SIGINT). Node 24.19.0 / pnpm 11.25.0 / macOS arm64. Sharp 0.35.5 was added with an exact pin; existing dependencies were retained.

| Command | Final result |
| --- | --- |
| `pnpm assets:images` | 6 sources, 60 AVIF/WebP derivatives, no upscaling |
| `pnpm validate:data --phase=2` | 6 products, 0 scenes, demo=true |
| `pnpm verify:assets --phase=2` | hashes, dimensions, provenance, inventories, aspect and byte budget PASS |
| `pnpm lint` | 0 errors / warnings |
| `pnpm typecheck` | route generation and strict TypeScript PASS |
| `pnpm test` | 7 files / 71 tests PASS |
| `pnpm build` | static export PASS |
| `pnpm verify:export --phase=2` | 4 navigable pages / 7 HTML files / 381 checked references / 14 JS chunks |
| `pnpm preview --port 43871` | production `out/` served successfully; explicit flag overrides default 4173 |

Final build ID: `n9i5wAomFJyRxYYawJlDo`.
Lockfile SHA-256: `ce5aa96c672081c2250a2bc1ea0531f0ad649005495e6392640f45e7167be722`.

Tests cover all category predicates including glass/trim, publication/order/saved filtering, malformed and oversized queries, query roundtrip, localized card metadata, invalid image/finish/scene/default/texture references, future-phase completeness rejection, favorites normalization/toggle/limit/brand keys/cross-tab refresh/denied storage, derivative boundaries, path safety and actual source/derivative audit. Phase 1 tests remain active. Export audit checks actual srcsets/sizes, first-four eager and last-two lazy attributes, first-cover high priority, intrinsic dimensions, local references and absence of premature product/Studio links. Parquet's strict schema rejects laminate-only fields.

## Assets and provenance

Generated with the built-in OpenAI ImageGen tool and visually inspected. These are commissioned demo illustrations, not photographs of stocked supplier products. No competitor imagery was copied. Final JPEGs are at `brand/assets/products/<product-id>/01.jpg`; generation prompts, attribution, illustrative flags and source SHA-256 hashes are in `brand/asset-sources.json`. Local originals remain in the tool's generated-images directory.

The shared brief requested warm contemporary Kosovo interiors, distinct matte white / natural oak / hidden cashmere doors, straight natural oak / rustic oak laminate and natural herringbone parquet. Doors remain fully visible in the central card crop; flooring is the main visible surface. No text, watermark or logo. Initial 1448px outputs were rejected. Final wide compositions requested 2048×1024 with a minimum actual long edge of 1600px, using the inspected initial composition as reference. Final tool outputs are 1774×887, except `dera-lis` at 1773×887; no source was enlarged.

Sharp rotates, converts to sRGB with a lossless PNG intermediate, strips metadata and creates AVIF quality 50 / WebP quality 80 at widths 320, 640, 960, 1600 and the original width. Height follows original aspect, rounded by Sharp. Cards crop landscape covers into a stable 4:3 frame; tall product imagery supports contain. Local revisioned URLs use `?rev=<sha256>` only. `verification/image-manifest.json` and `asset-manifest.json` record intrinsic dimensions, derivative bytes and hashes. Source inputs are not exposed as runtime URLs; no optimizer/remote image service is needed.

Final derivatives total **3,543,087 bytes**. First four combined at 640w: **56,578 AVIF bytes / 115,830 WebP bytes**, both below 245,760 bytes (240 KiB). In @Browser, the actual selected card sources were 320w AVIF, including at 1280px; first-four selected file bytes total **16,441 bytes**. This is file-byte accounting for observed currentSrc URLs, not a network timing or cold-cache transfer measurement. No selected cover used a 1600px thumbnail. Native lazy loading may fetch near-viewport cards early; the last two still have loading=lazy.

## Built-in browser verification

Used only **@Browser (Codex In-app Browser)** against production static `out/` at `http://127.0.0.1:43871/`. Fresh origin avoids the earlier Phase 1 identity/cache mismatch on default ports; no unrelated process or user cache was modified. All SQ/EN/DE combinations at the five viewports were measured after the final build and reviewed visually. Header height is 56px throughout; product image starts at y=148px. Mobile category strip is 48px with 44px minimum button targets, horizontal strip scrolling only. Titles reserve 40px and total metadata reserves 84px. No marketing hero.

| Requested viewport | Client width | Columns | Card width / image height | Fourth card bottom | Contact bar top | Body overflow |
| --- | --- | --- | --- | --- | --- | --- |
| 320×740 | 305 | 2 | 134.5 / 100.875 | 529.75 | 676 | 0 |
| 390×667 | 375 | 2 | 169.5 / 127.125 | 582.25 | 603 | 0 |
| 390×844 | 375 | 2 | 169.5 / 127.125 | 582.25 | 780 | 0 |
| 768×1024 | 768 | 3 | 232 / 174 | 680 | hidden | 0 |
| 1280×900 | 1280 | 4 | 296 / 222 | 454 | hidden | 0 |

Geometry was identical across all three languages, including long German names. The desktop browser reserves a 15px scrollbar at mobile dimensions; requested viewport and measured client width are explicitly separated. Four full cards clear the bar by 20.75px at 390×667 and 197.75px at 390×844. With an overlay scrollbar, CSS geometry at 390px gives 177px cards and a fourth-card bottom of 593.5px, still below a 603px bar; this is a calculation, not physical-device evidence.

| Scenario | Result |
| --- | --- |
| Category Laminate → 2; Back → 6; Forward → 2 | PASS; URL/filter agree without document reload |
| Hidden category by keyboard Enter | PASS; one hidden door, separate from interior doors |
| Trim / saved empty and Clear filters | PASS; returns six products and removes default query values |
| Unknown category/saved values | PASS; normalized safely to unfiltered URL |
| Direct `?category=laminate&saved=1` | PASS after hydration, with one saved floor; empty after removing it |
| Favorite reload and SQ→EN locale switch | PASS; state and query retained |
| Cross-tab SQ removal updates EN saved view | PASS; count/filter updated without reload |
| Heart interaction | PASS; toggles state without product navigation |
| Query change at nonzero scroll | PASS; native header-heart click and Back preserved scrollTop=230.5 with all six saved; locator auto-scroll was excluded from this measurement |
| Saved inquiry in SQ/EN | PASS; exact Lis natyral 10mm / Natural oak 10mm and PD-DEMO-02 |
| Desktop saved inquiry in DE | PASS; exact Matte weiße Tür, PD-DEMO-01, 90×200cm, Mattweiß |
| Phone / WhatsApp / Viber, DE at 320px | PASS; native previews 296×444px, no external app launched |
| Escape and focus restoration | PASS; trigger regains focus |
| Language menu | PASS; SQ/EN/DE native links preserve category/saved |
| Root forwarding | PASS; `/` forwards to SQ preserving category/saved and dropping tracking key |
| Direct HTTP / SQ / EN / DE | PASS; all 200 |
| Product / Studio / unknown locale | PASS; HTTP 404; standalone product-route 404 visually confirmed |
| Error/warning console logs | PASS; none returned |
| Corrupt/denied/quota storage | UNIT PASS; browser storage fault injection unavailable, no browser-fault-injection claim |

Screenshots: `screenshots/p2-feed-320.png`, `p2-feed-390x667.png`, `p2-feed-390x844.png`, `p2-feed-768.png`, `p2-feed-1280.png`, `p2-saved-empty.png`. Additional German checks: `p2-de-320.png`, `p2-inquiry-de-320.png`. The browser supplies JPEG captures; PNGs preserve those captured pixels through format conversion, with no visual editing.

## Limitations and next phase

Physical phones, touch, safe-area hardware behavior, denied browser storage/clipboard and 200% text zoom remain pending device/manual checks; unit storage failure coverage is complete. Browser emulation does not certify them. Illustrations, origins and specifications remain demo content; wood swatch/albedo and atlas metadata await Phase 4 calibration. These limitations are not claims of supplier or physical fidelity.

Phase 2's required checks are complete. Phase 3 is next: second useful views, 18 static product routes, gallery zoom, type-specific specifications, selected size/finish state and product inquiries. Stop here until authorized. Preview was stopped through its own session after QA; temporary tabs closed, viewport reset and test favorites removed.
