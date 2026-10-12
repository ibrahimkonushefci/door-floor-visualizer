# Phase 1 browser checklist — 11 October 2026

Only @Browser (Codex In-app Browser) was used. Production static HTML served from `out/`, not a development server.

| Check | Result / evidence |
| --- | --- |
| Root `/` → `/sq/` | PASS; preserved allowed category/saved keys, removed tracking key |
| Direct SQ/EN/DE and refresh | PASS; document lang correct in export and browser |
| Back/forward after locale switch | PASS; matching locale and query restored |
| Invalid locale/product route | PASS; standalone 404 visible; HTTP status 404 independently measured |
| SQ/EN/DE at 320×740, 390×667, 390×844, 768×1024, 1280×900 | PASS; all 15 combinations; 56px header; scrollWidth equals clientWidth |
| Skeleton grid density | PASS; 2/3/4 columns; four mobile slots fit above contact bar |
| German 320px controls/dialog | PASS; compact quote label, side icons, accessible full labels; dialog fits |
| Language menu | PASS; SQ/EN/DE, native route anchors, keyboard arrow selection/Enter; query retained |
| Studio / saved | PASS; disabled, accessible later-phase explanation; saved zero; no nonexistent route |
| Phone / WhatsApp / Viber in demo | PASS; all preview dialogs, no active external app links or outgoing app opened |
| Desktop/tablet quote | PASS; preview opens, mobile contact bar hidden |
| Dialog close / Escape / focus restoration | PASS; close focus first, text and copy keyboard reachable; Escape returns to triggering button |
| Visible keyboard focus | PASS; blue ring observed on desktop quote button |
| Clipboard success | PASS; SQ “U kopjua” and DE “Kopiert” observed |
| Clipboard failure | UNIT PASS with unavailable/rejecting dependency; selectable textarea always present. Browser denial injection not supported and remains pending |
| Console diagnostics | PASS; no error/warn entries returned on fresh catalog origin |
| 200% text zoom | PENDING; @Browser keyboard zoom shortcuts did not change viewport/font metrics. No enlarged-text pass is claimed |
| Physical phones / safe areas / touch | PENDING; no physical iPhone/Android was available |
| Product filters, favorites persistence, gallery, Studio, offline | NOT IMPLEMENTED; owning phases not started |

Verification origin: `http://127.0.0.1:43871/`. Requested `pnpm preview` successfully bound port 4173, but @Browser displayed an unrelated older showroom on 4173 and 4174 while direct HTTP returned the catalog. A fresh origin fixed the identity mismatch. Cause was not independently established; no user cache or unrelated process was cleared.

Screenshots: `screenshots/p1-sq-390.png`, `p1-de-320.png`, `p1-en-1280.png`, `p1-de-768.png`, `p1-inquiry-390.png`. The browser supplies JPEG captures; PNG evidence was produced by lossless format conversion of those captured pixels, without visual editing. Temporary viewport overrides were reset after verification.

# Phase 2 browser checklist — 11 October 2026

The Phase 1 section above is historical. Current Phase 2 verification is in `phase-2.md` and supersedes its unimplemented filters/favorites rows.

| Check | Current result |
| --- | --- |
| SQ/EN/DE × 320×740, 390×667, 390×844, 768×1024, 1280×900 | PASS; 15 combinations, no horizontal body overflow, header 56px |
| Four complete mobile cards above bar at both 390px heights | PASS; bottom 582.25px, bar top 603 / 780px |
| 2/3/4 columns at 320/768/1280px | PASS |
| Category URL / Back / Forward / keyboard / clearable empty | PASS |
| Favorites / saved-only / reload / locale change / cross-tab | PASS |
| Direct category+saved URL after hydration | PASS |
| Native saved-filter query click at scrollTop 230.5 | PASS; click and Back preserve scroll |
| Saved inquiry exact localized product/SKU / desktop context | PASS |
| Phone / WhatsApp / Viber demo dialogs and Escape | PASS; DE 320px dialog fits |
| Actual image srcset selection / eager-lazy / priority | PASS; 320w AVIF selected; first four eager, rest lazy, first high priority |
| Root query forwarding / static direct locales / 404 | PASS |
| Console error/warning | PASS; none returned |
| Blocked/corrupt storage and quota | UNIT PASS; browser injection pending |
| Physical phones / touch / safe areas / text zoom | PENDING; no hardware or text-zoom certification |
| Product details / gallery / Studio / offline | NOT IMPLEMENTED; next owning phases |

Only @Browser used. Preview, test favorites and browser viewport/tab cleanup completed. See `phase-2.md` for source provenance, exact commands, image-byte accounting and screenshots.

# Phase 3 browser checklist — 11 October 2026

The Phase 1/2 sections above are historical. Current product routes and gallery behavior are verified in `phase-3.md`.

| Check | Current result |
| --- | --- |
| All 18 detail URLs and explicit static refresh | PASS; SQ/EN/DE, first photo loaded, useful specs; independent HTTP200/HTML proof |
| Details at 320/390/768/1280px, including 390×667/844 | PASS; correct mobile reading order, 56px header, no body overflow or essential photo crop |
| Full DE parquet table at 320px and final related card/bar clearance | PASS; table y78.5–571.5, bar y676; final card bottom647.75 |
| Desktop sticky facts and related boundary | PASS; top72 at scroll117; stops 32px before related section |
| Catalog SQ/EN/DE × five viewports | PASS; 15 combinations; same four-card mobile clearance and 2/3/4 columns |
| Door size/finish, invalid normalization, Back/Forward | PASS |
| Locale switch and deep-link reload | PASS; same slug and selected variants; translated labels |
| Detail favorite, reload, locale, filtered catalog return, remove/clear | PASS; native links; no favorite navigation; temporary state removed |
| Gallery correct first/second image, local zoom, arrows, pointer swipe | PASS; pointer swipe is not physical touch certification |
| Gallery close/Escape/focus return, navigation after close | PASS |
| PhotoSwipe initial absence and first-activation JS/CSS | PASS; actual exported and browser-inserted local chunks recorded |
| Exact selected inquiry after gallery; related product and desktop header context | PASS; own SKU/specs and clean variant URL |
| Phone/WhatsApp/Viber DE 320px previews | PASS; dialog296×444, no active external links, no app launch |
| Copy status and full selectable text | PASS; native clipboard contents/denial remain device/manual checks |
| Laminate AC/usage versus parquet wood/wear layer | PASS; parquet has no AC; unknown door rough opening omitted |
| Unknown product/Studio 404 | PASS; product 404 visually inspected |
| Product/catalog/contact console | PASS; no warning/error entries returned before intentional 404 |
| Physical phones / touch/pinch / mobile screen reader / safe areas / text zoom | PENDING; no hardware certification |
| Studio renderer / offline | NOT IMPLEMENTED; Phase 4/5 not started |

Only @Browser used against production `out/`. Final required Phase 3 screenshots saved and inspected. Preview stopped, temporary tab closed, viewport reset, test favorite removed. See `phase-3.md` for exact routes, commands, versions, hashes and remaining device checks.

# Phase 4 browser checklist — 11 October 2026

Earlier sections are historical. Studio is now implemented, but **Phase4 acceptance is incomplete**. See phase-4.md for commands, actual measurements, screenshots and all limitations.

| Check | Current result |
| --- | --- |
| Living6 opaque finishes plus photographic smoke-glass insert | Browser exercised; matched390px evidence saved; glass fixes frame toblack |
| Hidden4 compatible finishes | Browser exercised; unsupported finish/casing visibly disabled |
| All5 floor collections in both rooms | Browser exercised; separate seam-free trims and0/90° rotation |
| Independent standard frame/skirting modes | Browser exercised; hidden frame fixed |
| Requested/rendered separation and pending inquiries | Observed previous completed title/frame retained; contacts disabled pending |
|20 rapid changes + scene +390×667 resize | Latest requested/rendered JSON identical; stale frame did not replace final selection |
| Product selected finish → Studio / shared reload | Same selected walnut and canonical IDs after refresh; representative room-size copy present |
| Scene Back/Forward / locale preservation | Browser exercised; stale locale-link event found and corrected |
| Compare/reset | Observed; comparison disables combination inquiry |
|320/390/768/1280 controls and stage | Evidence saved; no horizontal overflow observed;4:3 stage; desktop rotation pair same bounds |
| Keyboard / exact inquiry / Escape | Surface focus reached; selected products, modes, rotation and URL in demo preview; Escape focus returned |
| Worker mode / development fallback | Both completed; fallback observed max batch6.8ms; development Strict Mode cleanup repaired |
| Idle / final console | Timing list unchanged during idle observation; no warning/error entries returned |
| Independent metric calibration | INCOMPLETE; virtual photo fits lack measured same-plane reference |
| Floor>=30% of scene | Living34.63%; corridor29.68%, below threshold |
|100% mask / grain / glass / lighting realism | Diagnostic review and fixes performed; human visual acceptance remains pending |
| Performance | Desktop mixed20 preview/20 settled sample p95199.2/315.6ms; phone targets and decode-separated benchmark pending |
| Physical phone / touch / safe area / screen reader / clipboard / heap profile | PENDING |
| Phase5/offline/deployment/live contacts | NOT STARTED / NOT ENABLED |

Only @Browser used against production out/ on43872. Development-only fallback used43874; diagnostic PNGs used a temporary local43873 server. No Firefox or separate browser stack. Required screenshot filenames are listed in phase-4.md; JPEG captures converted toPNG without retouching. Browser scrollbar/full-page capture behavior can affect saved image width/sticky-control placement; live overflow and exact desktop rotation bounds were checked separately.

## Phase4 remediation — current

The earlier Phase4 results are historical. Current scene IDs are `living-standard` and `corridor-standard`, both with standard casing. The new hallway is distinct from the living room. Hidden product pages remain available, with no Studio compatibility or product-specific Studio links.

| Check | Current result |
|---|---|
|Required commands|All PASS;14test files/111tests; independent golden max byte error0|
|Production @Browser320/390/768/1280 and SQ/EN/DE|PASS observed layouts, final frames, language preservation and readable direction labels|
|Rapid swatches / scenes / resize / history / compare / reset|PASS; one final frame, previous completed frame retained while pending|
|Legacy corridor migration / exact demo inquiries / hidden variants/favorites|PASS; standard substitute announced; hidden catalog identity retained|
|Retry / worker fallback|PASS isolated failure check; final main batches<=6.1ms on this desktop|
|20 warm uncached switches|p95 123.8ms; cached revisit0.7ms; cold glass319.5ms exceeds250ms|
|Masks / grid / glass at1600×1200|Inspected in @Browser at actual source resolution; human showroom approval pending|
|Physical calibration / physical phones / paint latency / actual heap|PENDING; controlled-buffer estimate is not a measured browser heap|

Fresh prescribed PNGs and `p4-remediation-*` captures are in `screenshots/`; raw measurements/provenance/diagnostics are in `render-fixtures/`. Earlier captures are preserved in `screenshots/phase-4-before/`. See the appended remediation section of `phase-4.md` for exact checks, timing definitions, source limitations, manual handoff and remaining acceptance. Phase5 and deployment remain unauthorized.

## Phase 5 — final build tchNbWpuL6ly_VgYVxS8p

- [x] Exactly 12 cards, 24 source views and three complete locales; strict final export/data audits.
- [x] SQ/EN/DE normal responsive matrix, correct columns and four-card phone density; no observed overflow.
- [x] Trim category/details/favorites, German copy/specs, exact demo inquiry, lightbox Escape/focus return.
- [x] Explicit verified offline pack; waiting update and deliberate reload; final build ID checked.
- [x] Stop own server, verify no listener, hard reload catalog/Studio; all palette assets and all Studio locales.
- [x] Offline trim/direction/share/copy; uncached product fallback with saved links.
- [x] Unit failure-mode checks for cancellation, corruption, quotas, cache bounds and previous-pack retention.
- [x] Clean-room build/source hash and isolated reserved-domain live-mode fixture.
- [ ] Physical iPhone/Android/tablet: touch, safe areas, resume, native drafts, offline, latency/heap/thermal.
- [ ] 200% text zoom and full screen-reader/keyboard audit.
- [ ] Measured LCP/INP/CLS and ≥20-switch target-phone final-frame p95 with named conditions.

Evidence and exact limits: REPORT.md. No deployment or send occurred.
