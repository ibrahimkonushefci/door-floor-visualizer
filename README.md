# Porta & Dysheme

Phase 5 is implemented. The demo has 12 products, 24 gallery views, SQ/EN/DE catalog and detail pages, two photographic Studio scenes, seven door finishes and five floors. Favorites, filters, variants, local PhotoSwipe galleries and exact demo inquiry previews remain available. Production supports visited-page caching and an explicit **Save Studio offline** pack, with progress, cancellation, removal and deliberate update/reload. Verification details and remaining acceptance checks are in [verification/REPORT.md](verification/REPORT.md).

All products, dimensions, origins and imagery are representative demo content. The user confirmed Phase 4 before authorizing Phase 5. Generated rooms still use declared virtual geometry; they do not establish independent physical plank measurements or supplier color matching. No site has been deployed and no inquiry has been sent.

## Local runtime

```sh
cd '/Users/ibrahimi/Doors & laminate'
export PATH='/Users/ibrahimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':"$PATH"
pnpm install --frozen-lockfile
pnpm dev
```

Open [the catalog](http://127.0.0.1:3000/sq/) or [Studio](http://127.0.0.1:3000/sq/studio/). Node 24.19.0 and pnpm 11.25.0 are pinned. Dependencies stay at their existing exact versions; Phase 5 adds esbuild 0.28.2 for the service-worker compiler. If an agent sandbox uses a different pnpm store, installation was verified with `--store-dir /Users/ibrahimi/Library/pnpm/store`.

Offline registration is deliberately disabled in development. Use the production export to test offline:

```sh
pnpm build
pnpm preview
```

Open [the production catalog](http://127.0.0.1:4173/sq/) or [production Studio](http://127.0.0.1:4173/sq/studio/). If 4173 is occupied, use `pnpm preview --port 43880`; CLI flags override defaults. The verification preview uses [port 43880](http://127.0.0.1:43880/sq/). Stop only the preview you started, using Ctrl+C in its terminal.

## Reproduce verification

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

The export auditor checks 43 navigable HTML pages, titles, languages, demo robots/contact safety, local references, lazy PhotoSwipe, worker output and offline file sizes/hashes. Budget measurements are written to `verification/performance.json`. Compressed file sizes are separate from LCP, INP and CLS measurements. A fresh installation/build from the frozen lockfile was also verified in a temporary copy; its source/config hash matched the working build. A reserved-domain live-mode fixture was built and audited only in that copy.

## Manual checks

1. Browse SQ/EN/DE at phone, tablet and desktop sizes. Check category pills, saved-only filtering, empty results, favorites after refresh and cross-tab synchronization. Test Back/Forward and malformed filter queries. At 390×667 and 390×844, four complete cards should fit above the contact bar.
2. Open both new trim products and their two photos. Check dimensions, German labels, zoom, Escape, focus return and scroll restoration. On a door, change size/finish, reload, switch language and compare the inquiry with the selected SKU and variants.
3. In Studio, switch both rooms, all compatible finishes and floors, both plank directions and every frame/skirting mode. Compare, reset, resize/orient, alternate controls quickly, copy a shared link after its URL has synchronized, and reopen it. Hidden doors remain catalog-only; smoke glass is living-room-only.
4. In a production Studio, choose **Save Studio offline** and wait for **ready**. Then disconnect and hard reload the catalog and Studio. Test both scenes, the full palette and all three Studio locales. Visit an unsaved product: it should explain that the page is unavailable and link to known saved pages. Copy a demo inquiry offline. External messaging in a future live build still needs the external service/network.
5. Test cancellation, retry, storage exhaustion and removal. A failed replacement must preserve any prior saved pack. Build a new version, reopen the app, wait for the update prompt and deliberately update/reload. The new version requires saving its own Studio pack.
6. On physical iPhone Safari, Android Chrome and the showroom tablet, test safe areas, touch, orientation, resume, offline reload, clipboard/native sharing and real performance. Also complete 200% text zoom/reflow and a screen-reader audit. These remain acceptance checks.

## Offline behavior

The first visit needs internet. The worker runs only on HTTPS or localhost. The shell is small; the explicit Studio pack is about 7.1 MiB, below its 20 MiB limit. It contains all three Studio HTML routes, locally bundled scripts/styles/fonts, the renderer worker and every referenced scene/material asset. Catalog/product pages are cached only when visited, with a 100-response / 12 MiB limit; older visited pages can be evicted.

The worker stages downloads with concurrency three and verifies byte length and SHA-256 before committing a ready pointer. Cancellation, corruption, failed downloads and quota errors never commit a partial pack. Network-first navigation has a three-second timeout, then checks the exact cached pathname; query selections restore in the client. Missing assets get an error response rather than offline HTML. Versioned media retains its `?rev=` cache key. A full visited cache does not break successful online responses.

Updates wait for the user to click update/reload. Cache names include brand and build; old caches in the current namespace are pruned only after controlled clients identify the new build. No service worker swaps a running scene's assets automatically. `out/build-info.json`, the HTML `porta-build` meta and `out/offline-manifest.json` provide diagnostics; build IDs are kept out of the sales interface.

## Rebranding and static hosting

Replace validated values in `brand/brand.json`, its logo/favicon, all three message dictionaries, product/finish/collection JSON and local images. Stable IDs keep products, thumbnails, Studio, specifications and inquiries aligned. Keep `demoMode: true` for a pitch. Rebuild images/scenes, run strict Phase 5 validation/audits and visually review the catalog and Studio. Adding a scene also requires its authored masks, lighting, insert and calibration evidence.

Live mode requires a public HTTPS origin and actual verified contact details, plus appropriate product evidence. Demo mode emits noindex/nofollow, disallows crawling, omits the sitemap and previews every contact channel. The live fixture uses `example.com` and synthetic contacts solely to test the code paths; those values are not supplier verification.

Serve **out/** alone from a static host. It needs directory `index.html` resolution, a true 404 for unknown paths, correct JS/CSS/font/image MIME types and a genuine asset error for missing files. Do not use a catch-all SPA HTML rewrite. Serve `/sw.js`, `/offline-manifest.json`, `/build-info.json` and HTML with revalidation/no-cache. Content-addressed `/_next/static/` files can be immutable; honor revisioned media query keys. The app is configured for the origin root, and all runtime assets are same-origin. HTTPS is required outside localhost. No deployment is part of this phase.

## Image provenance and next task

The built-in ImageGen tool generated the four new trim illustrations. Final files are `brand/assets/products/pervaze-mdf/{01,02}.jpg` and `brand/assets/products/lajsne-mdf/{01,02}.jpg`; no derivative was upscaled. The final prompt set is [verification/p5-image-prompts.json](verification/p5-image-prompts.json), with usage basis and source hashes in `brand/asset-sources.json`. Original generated paths are provenance only; the app consumes the copied workspace assets.

There is no Phase 6 in BUILD_PLAN.md. Next is physical-device, accessibility and target-network performance acceptance, followed by supplier/rebrand review and separately authorized static deployment.
