# Phase 5 verification — 11 October 2026

**Implementation complete; automated and observed desktop browser checks pass. Physical-device, full accessibility and measured web-performance acceptance remain pending.** Phase 4 was confirmed by the user before this phase began. This report retains the demo's calibration limits without reopening that authorization. No deployment or message sending occurred.

Final production build: `tchNbWpuL6ly_VgYVxS8p`. Source/config SHA-256: `a417f6f6a370873289d9d4d09102e4bee33c425732b0b8ce9d31f6ee5c933dc4`. The saved build's HTML meta, `out/build-info.json` and offline manifest agree. Browser evidence below uses that build; the separate update screenshot records the waiting-state transition into it.

Implemented content: exactly 12 published demo products, 24 distinct source gallery views and 240 AVIF/WebP derivatives; 36 localized product routes, three catalogs, three Studio routes and root = **43 navigable HTML pages**. Export has 47 HTML files including framework/404 copies and the offline fallback. Studio keeps two scenes, seven door finishes and five floors, with 64 prepared scene/material outputs. Trims have the planned 2200×70×16 mm architrave and 2400×80×16 mm skirting demo profiles, no invented origin or manufacturer, and SQ/EN/DE content. Final validation rejects missing translations and additional/unpublished inventory.

Offline implementation: production-only registration; small shell; hash-verified atomic Studio saving; progress/cancel/retry/remove; concurrency three; bounded visited cache; exact revision matching; network-first HTML with a three-second timeout; uncached-page fallback with known saved links; waiting updates and deliberate reload; brand/build cache namespaces. Best-effort visited caching preserves a successful network response if storage is full. Both the preview server and worker reject HTML responses for missing assets. Studio runtime media now uses output SHA-256 revisions while authoritative calibration JSON stays bare.

Runtime: Node 24.19.0, pnpm 11.25.0, Next 16.4.0, React/React DOM 19.3.0, Tailwind 4.3.3, PhotoSwipe 5.4.4, TypeScript 5.9.3; new esbuild 0.28.2. Existing exact versions were retained. The known ESLint 9 deprecation warning during dependency installation was not hidden by an unrequested major upgrade.

| Command/check | Actual result |
|---|---|
| Frozen-lock installation | PASS, working copy and fresh temporary node_modules |
| `pnpm assets:images` | PASS, 24 sources / 240 derivatives, no upscaling |
| `pnpm assets:scenes` and `--check` | PASS, two scenes / 64 outputs / 6,251,418 bytes |
| `pnpm validate:data --phase=5` | PASS, exactly 12 products / complete translations / demo true |
| `pnpm verify:assets --phase=5` | PASS, dimensions, hashes, provenance, calibration consistency, derivatives |
| `pnpm lint` | PASS, no warnings |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 15 files / **129 tests** |
| `pnpm render:fixtures` | PASS, independent golden max byte error 0; scene diagnostics generated |
| `pnpm build` | PASS, static export plus offline output |
| `pnpm verify:export --phase=5` | PASS, 43 navigable / 47 HTML / 5,402 references / 22 JS outputs including SW; gallery stays lazy |
| `pnpm verify:budgets` | PASS, **63 file checks / zero failures** |
| Renderer owned-buffer profiling script | PASS, both analytical bounds below 96 MiB |
| Clean-room final build/export/budgets | PASS; source/config hash matches working build |
| Isolated live-mode final build/data/export | PASS; 42 localized sitemap entries, reserved `example.com`, synthetic contacts; never served or sent |

The offline tests exercise incomplete/corrupt downloads, cancellation, failed replacements, quotas, byte and entry eviction, concurrency, revision keys, independent build pointers, rebrand prefix isolation and successful online responses during cache failures. Existing catalog/product/media tests were advanced to final inventory. Numeric renderer fixtures and their independent golden were preserved.

**Measured file budgets**, from [performance.json](performance.json): each locale's feed initial JS is 196,353 bytes gzip (191.75 KiB; limit 200 KiB). CSS gzip plus WOFF2 bytes is 95,179 bytes (92.95 KiB; limit 140 KiB). First four conservative 640px images total 56,578 AVIF / 115,830 WebP bytes (limit 240 KiB). First-screen assets are about 424 KiB (limit 700 KiB). All 640px derivative and 960px scene-fallback gates pass. First useful default scene bytes, including its fallback, are 1,303,945 living / 1,999,941 hallway, below 2.5 MiB. Glass remains lazy until selected. The entire saved pack is **106 files / 7,472,380 bytes (7.13 MiB)**, below 20 MiB.

The controlled-array bounds were freshly checked: living 98,052,312 bytes (93.51 MiB), hallway 75,512,448 bytes (72.01 MiB), limit 100,663,296 bytes (96 MiB). See [p5-render-memory.json](p5-render-memory.json). These include controlled scene copies, texture/result caches and transient buffers; they are not browser heap or physical-device measurements. The earlier first-scene audit incorrectly counted a glass insert in the opaque default; the final auditor follows the controller's lazy insert behavior.

**Built-in browser evidence only:** production origin `http://127.0.0.1:43880`, not HMR; no Firefox or other browser stack. The working preview was stopped by its own PID and the absence of a listener was checked before final offline testing. The app then hard reloaded and decoded/rendered saved assets, rather than merely continuing an in-memory scene. This tests origin network failure on desktop; it does not substitute for airplane-mode behavior on a phone.

| Browser scenario | Observed result |
|---|---|
| SQ/EN/DE × 320×740, 390×667, 390×844, 768×1024, 1280×900 | PASS, 15 checks, correct 2/3/4 columns, 12 cards, no horizontal overflow |
| Mobile density | PASS, image begins y=148; fourth card ends y=582.25, above bar y=603 at 390×667 and y=780 at 390×844 |
| Root entry / online unknown route | PASS, root opens SQ; unknown route HTTP 404 |
| Missing script | PASS, HTTP 404 and text/plain; worker tests reject HTML asset responses |
| New trim filter / favorite / reload / language | PASS, two trim results, selection persisted, test favorite restored to original empty state |
| German trim detail / exact inquiry | PASS, correct 2200×70×16 mm and PD-DEMO-11; demo preview only; no overflow |
| Gallery / Escape / focus return | PASS, second view loaded; Escape returned focus to its image button; no clean-run warnings/errors returned |
| Build updates | PASS, waiting prompt shown; deliberate click reloaded into next build; final update reaches `tchNbWpuL6ly_VgYVxS8p` and requires its own pack save |
| Final pack readiness | PASS only after complete hash/byte verification |
| Final catalog and Studio hard reload without server | PASS; same final build ID retained |
| Final offline palettes | PASS, 23 completed selections: seven living finishes, six hallway finishes, five floors in each; hallway glass disabled |
| Final offline frame/skirting / rotation / shared URL | PASS, all modes; `rot=90` and both black trims survived synchronized URL reload |
| Final offline copy | PASS, clipboard contained the exact shared selection; previous clipboard restored |
| English and German Studio hard reload offline | PASS, each reports ready / completed render / same final build ID |
| Uncached English product offline | PASS, explicit three-language fallback and links only to known saved pages |
| Cancel/corruption/quota/replacement/storage denial | PASS in injected tests; full browser storage/network throttling controls unavailable |
| 200% text zoom and full screen reader / keyboard audit | PENDING; Escape/focus and accessible control-state smoke checks passed |
| Physical iPhone/Android/iPad | PENDING |

Machine-readable evidence: [p5-browser-matrix.json](p5-browser-matrix.json), [p5-offline-selections.json](p5-offline-selections.json), [p5-offline-behavior.json](p5-offline-behavior.json), [p5-offline-locales.json](p5-offline-locales.json), [p5-repro.json](p5-repro.json). Studio queries are debounced; shared-link verification waited for the URL to synchronize before reloading. No measured renderer or cold-network result was invented from a viewport simulation.

Screenshots under `screenshots/`: `p5-feed-{320,390,768,1280}.png`, extra `p5-feed-390-667.png`, `p5-product-de-390.png`, `p5-studio-sq-390.png`, `p5-offline-ready.png`, `p5-offline-reload.png`, `p5-update-available.png`, `p5-offline-catalog-reload.png`, `p5-offline-uncached-route.png`. They were captured as browser JPEGs and converted to PNG without visual editing. Update evidence shows the waiting prompt; final content/ready/reload screenshots and the matrix identify the final build.

The built-in ImageGen tool produced the four new trim images. Final sources: `brand/assets/products/pervaze-mdf/{01,02}.jpg` and `brand/assets/products/lajsne-mdf/{01,02}.jpg`, each 1774×887; [p5-image-prompts.json](p5-image-prompts.json) contains the final prompts. Provenance and source hashes are in `brand/asset-sources.json`. All imagery is illustrative, with no supplier-photograph claim. Herringbone is distinct from chevron; hidden doors keep catalog details without Studio links; glass uses the existing dedicated photographic insert.

**Remaining acceptance gaps:** physical touch/safe-area/orientation/resume, native WhatsApp/Viber drafts without sending, device clipboard and offline reload; target-phone final-frame p95 over at least 20 switches, separated cold/decode/network conditions, long tasks, heap and thermal behavior; measured LCP ≤2.5s under named mobile conditions, INP ≤200ms on a real interaction dataset, and CLS ≤0.1; 200% text zoom and full screen-reader/keyboard review. No numerical LCP/INP/CLS or target-phone result is claimed. Generated scene geometry remains internally consistent virtual calibration; independent measured camera geometry and physical color matching require reference/supplier evidence if needed for a live showroom. Screen realism on the actual pitch display still needs human review.

To run, use the runtime PATH and commands in [../README.md](../README.md): `pnpm dev` for port 3000, or `pnpm build` then `pnpm preview` for 4173. Production is required for offline tests. For the complete command matrix and static-host cache/MIME/404 requirements, use that README. Rebranding remains through brand/config/assets followed by strict validation, asset generation, build/audits and visual review.

**Next task:** physical-device, accessibility and measured performance acceptance, then supplier/rebrand review and separately authorized static deployment. BUILD_PLAN.md has no Phase 6. Phase 5 does not authorize publication, enabling live contacts in this working demo, or actual message sending.
