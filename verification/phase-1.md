# Phase 1 evidence

Phase: 1 — Skeleton and foundation. Date: 11 October 2026 (Europe/Belgrade).

**Foundation complete; catalog assets, product detail, Studio and offline not implemented.** Phase 2 is ready for separate authorization and has not started. No deployment, publication or messages were sent. The source specification is preserved; BUILD_PLAN contains only the verified runtime/pnpm configuration correction.

## Implemented

Created the P1 file tree: Next.js App Router static export, TypeScript strict mode, Tailwind v4/PostCSS, locally bundled Manrope Latin/Latin-ext 400/500/600/700; the full §4 TypeScript contracts and strict Zod schemas; validated branding and SQ/EN/DE dictionaries with SQ fallback; two root layouts with prerendered document languages; immediate root replacement and fallback anchor; semantic design tokens and validated contrast.

The shell has a 56px sticky header, configurable logo/name, compact demo badge, keyboard language menu, inert saved zero, disabled Studio with accessible explanation, 64px mobile contact bar and desktop quote action. Four explicitly temporary, aria-hidden 4:3 skeleton slots live directly in the locale page. There are no product records, fake SKUs, marketing hero or corporate sections.

Every demo contact channel branches to a native dialog before constructing an external contact URL. Dialogs show the sample recipient, localized message/current-origin URL, copy action and permanently selectable textarea; they close via button/Escape/backdrop and restore focus. No active tel/WhatsApp/Viber anchors exist in demo DOM. Pure live-link fixtures test encoding and Viber bounds without launching or sending.

Build tools validate data and translations, generate/copy branding, noindex/nofollow metadata, standalone error documents and demo robots; no canonical/sitemap is emitted with null siteUrl. The secure static server supports GET/HEAD, MIME types, directory indexes, query-independent file lookup, decoding/containment and actual HTTP 404. The export auditor parses every HTML/CSS document and emitted JS chunk inventory, resolves local links/fonts, checks locale/title/headings/demo safety and expected routes.

## Data, assets and versions

- Products: 0; product images: 0; finishes: 0; floor collections: 0; scenes: 0.
- Local logo/favicon SVG source assets: 2, with generated public/export copies. No photographic sourcing or generation.
- Navigable HTML pages: 4 (`/`, `/sq/`, `/en/`, `/de/`). Total HTML files: 7, including `404.html`, `404/index.html`, `_not-found/index.html`.
- Export audit: 90 resolved local references; 13 emitted JS chunks. These are inventory counts, not performance measurements.
- Node 24.19.0 / pnpm 11.25.0 / Next 16.4.0 / React and React DOM 19.3.0 / TypeScript 5.9.3 / Tailwind 4.3.3. Exact manifest/lockfile versions and build identity: [dependency-versions.txt](dependency-versions.txt).
- Installed Node patch differs from the blueprint's Node 22 baseline but satisfies the verified Next/tooling requirements. pnpm 11 required `pnpm-workspace.yaml` for `allowBuilds` and `saveExact`; only esbuild and unrs-resolver scripts are approved. ESLint 9 registry deprecation and a transitive warning are recorded; the requested major is preserved.

## Commands and outcomes

| Command | Final outcome |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, exit 0 after dependency build approvals |
| `pnpm validate:data --phase=1` | PASS, exit 0; empty data accepted, demo true |
| `pnpm lint` | PASS, exit 0; zero warnings |
| `pnpm typecheck` | PASS, exit 0; Next route typegen + strict tsc |
| `pnpm test` | PASS, exit 0; 4 files / 38 tests |
| `pnpm build` | PASS, exit 0; export + deterministic finalization |
| `pnpm verify:export --phase=1` | PASS, exit 0; 4 navigable / 7 HTML / 90 references / 13 chunks |
| `pnpm preview` | PASS, server started at 127.0.0.1:4173; stopped by its own session |
| `pnpm preview --port 43871` | PASS; production browser verification on fresh origin; stopped by its own session after evidence |

Initial failures were repaired: wrong relative JSON imports; test fixture's null-only TypeScript inference; native-anchor lint rule conflicting with the explicit blueprint navigation contract; missing lang/noindex on extra Next-generated 404 HTML; overly strict rejection of contained relative CSS font paths. Native-anchor rule is narrowly documented; other Next lint rules remain enabled. pnpm/tsx sandbox IPC restrictions required approved execution outside the sandbox. No failures were ignored.

Tests cover malformed/strict schema inputs, duplicate IDs, unsafe local asset paths, blank SQ and SQ-only translation fallback, live sample-contact rejection, color contrast, higher-phase completeness rejection, locale/deep-link query preservation, demo branching for all contact channels, Unicode/special-character encoding, Viber long-message copy behavior, clipboard rejection/unavailability, URI decoding/traversal, contained relative font paths, directory pages, GET/HEAD/405 and real HTTP 404.

## Browser evidence

Only @Browser, using the production static output at `http://127.0.0.1:43871/`. The usual 4173/4174 origins showed an unrelated old showroom in the browser despite correct catalog HTML via HTTP. A fresh origin established the correct title/logo/build. The cause was not confirmed; no existing cache or unrelated process was cleared.

SQ/EN/DE were checked across all five dimensions below. `scrollWidth === clientWidth` throughout. At 390×667, the desktop browser's 15px vertical scrollbar leaves 375px content width; this is recorded rather than described as horizontal overflow.

| Requested viewport | Header | Layout / mobile bar | Last mobile card bottom / bar top |
| --- | --- | --- | --- |
| 320×740 | 56px | 2 columns; 64px bar; German fits | 526px / 676px |
| 390×667 | 56px | 2 columns; 64px bar | 567.25px / 603px |
| 390×844 | 56px | 2 columns; 64px bar | 578.5px / 780px |
| 768×1024 | 56px | 3 columns; mobile bar hidden; header quote | n/a |
| 1280×900 | 56px | 4 columns; mobile bar hidden; header quote | n/a |

At 390×844 the skeleton images begin at y=132px. The skeleton previews density only; it is not a finished product feed. No hero exists. Mobile phone/WhatsApp/Viber, desktop/tablet quote, keyboard language switching, document lang, direct refresh, root query allowlist, back/forward, Escape/focus return, visible blue focus and successful copying were observed. Export/DOM contain no active demo contacts. Console diagnostics returned no error/warn entries on the fresh origin.

Independent HTTP reads: `/`, `/sq/`, `/en/`, `/de/` return 200; `/fr/` and `/sq/products/missing/` return 404 with the standalone localized-navigation error page.

Screenshots (actual captured dimensions verified):

- [SQ 390×844](screenshots/p1-sq-390.png)
- [DE 320×740](screenshots/p1-de-320.png)
- [EN 1280×900](screenshots/p1-en-1280.png)
- [DE 768×1024](screenshots/p1-de-768.png)
- [Contact preview 390×844](screenshots/p1-inquiry-390.png)

Detailed scenarios: [browser-checklist.md](browser-checklist.md). Temporary viewport overrides were reset.

## Limits

No phone performance, touch, safe-area or native-app integration claim is made. Clipboard denial is covered by dependency-injected unit tests; browser denial could not be forced through available controls. 200% text zoom remains pending because the built-in browser zoom shortcuts did not change measured viewport/font metrics. No LCP/INP, 4G, screen-reader or physical-device measurements were available. There are no known failing required normal-viewport Phase 1 checks.

## Reproduce and continue

```sh
cd '/Users/ibrahimi/Doors & laminate'
export PATH='/Users/ibrahimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':"$PATH"
pnpm install --frozen-lockfile
pnpm validate:data --phase=1
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:export --phase=1
pnpm preview --port 43871
```

For development: `pnpm dev` (127.0.0.1:3000). Default preview remains `pnpm preview` (4173); CLI port override avoids occupied/cached origins. Static deployment requires serving `out/` directory indexes and 404.html with status 404, and is not authorized by this phase.

Next phase, not started: Phase 2 — six seed products with local preview imagery, product-grid/category/filter/favorites logic, image pipeline and asset verification. Increment IMPLEMENTATION_PHASE only during authorized execution of that phase.
