# Door & Floor Visualizer

A web catalog and room visualizer for interior-door and flooring showrooms. Customers pick a door, its finish and a floor and see them together in a furnished room on their phone, tablet or laptop, then send the exact combination to the showroom on WhatsApp, instead of flipping through a heavy PDF catalog.

A static site in Albanian (default), English and German. No backend, no accounts, and it keeps working offline after one save.

> **Status: sales demo.** All products, prices and contacts are demo content under the **Dyer & Dysheme** demo brand (`demoMode: true`): nothing is sent and nothing is indexed. Read the [licensing reminder](#licensing-reminder) before showing it to customers.

## Features

- **Catalog homepage.** Opens with a small Studio: tap one of the laminate colours and the room photo changes. Then the catalog in chapters: all doors side by side as one wall, laminates as sample planks with a room preview, and casing, skirting and parquet pointed out in a real room photo. Category filters, saved items, and product pages with finish swatches, sizes and specifications.
- **Studio.** Seven furnished rooms rendered in Blender (living room, kitchen, bedroom, hallway, entrance, kids' room, bathroom). Change the door model and finish, the casing, the skirting and the floor, and the room updates in about a second, at true board scale with real shadows.
- **Presenting tools.** Full screen, tap a surface to edit it, zoom and pan, A/B compare, product details, a labelled image download, and a share link with a QR code.
- **Own-room photo** (experimental). Upload a photo of a room, mark the floor (AI first guess plus a brush) and see a new floor in it. Everything runs on the device.
- **Offline.** A hidden presenter sheet saves the whole Studio (about 31 MB) for meetings without internet and lists a 3-minute demo route.
- **Rebrandable.** Everything company-specific (name, logo, colours, contacts, texts, products, décors) lives in `brand/`. Name, logo, colours and contacts change with one command: `pnpm rebrand --name "Company" --logo logo.png --primary "#1F4E3D" --phone "+383 44 123 456"` (about a minute including the checks; `pnpm rebrand --reset` undoes it).

## Quick start

Requires Node 24 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm build      # only needed after changing something
pnpm preview    # http://127.0.0.1:4173/sq/
```

- **Development** with hot reload: `pnpm dev` (http://127.0.0.1:3000/sq/).
- **On a phone** on the same Wi-Fi: `pnpm preview --host 0.0.0.0`, then open `http://<your-computer-ip>:4173/sq/`. Offline saving and sharing need HTTPS, so they are hidden there.
- **Presenter sheet:** press and hold the logo for about a second, or add `?presenter=1` to any URL.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm validate:data && pnpm verify:assets && pnpm assets:scenes --check
pnpm build && pnpm verify:export && pnpm verify:budgets
```

`verify:budgets` enforces size limits (for example 200 KiB of initial JavaScript on the homepage) from `verification/budgets.json`.

## Project layout

| Path | What it holds |
|---|---|
| `src/` | Next.js app: pages, components, the Studio renderer (`lib/studio/`), workers, service worker, styles |
| `brand/` | Everything company-specific: name, colours, contacts, translations, products, materials, room assets |
| `public/` | Generated images, scene layers, textures and the photo tool's AI model |
| `scripts/` | Asset pipelines, data validation, export and budget checks |
| `tools/` | Blender scripts that build and render the rooms; supplier décor manifests |
| `tests/` | Vitest unit tests |
| `verification/` | Image and scene manifests, size budgets, golden render fixtures |

## Hosting

Serve `out/` from any static host with directory `index.html` resolution and a real 404. Serve `/sw.js`, `/offline-manifest.json`, `/build-info.json` and HTML with `no-cache`; `/_next/static/` is immutable; serve `.wasm` as `application/wasm`. Do not use a single-page-app catch-all rewrite. Going live (`demoMode: false`) requires a public HTTPS `siteUrl` and verified contacts.

## Licensing reminder

Two permissions are still open. Review them before any customer-facing commercial use:

- **Own-room photo AI (SegFormer-B0):** licensed for non-commercial research or evaluation only. Whether a sales demonstration is allowed has not been reviewed. Review the licence or replace the model behind `FloorSegmenter` before showing, selling or deploying the photo tool. The showroom Studio does not use this model.
- **Supplier décors (Kronotex):** images from official product pages with no reuse licence, marked `private-pitch-only`. Get written permission, or use the showroom's own licensed images, before customer use.

Every image, model and texture is recorded with its source and licence in `brand/asset-sources.json`. Fonts (Cormorant Garamond, DM Sans) are self-hosted under the OFL.

## Tech

Next.js 16 (static export), React 19, TypeScript, plain CSS, Canvas 2D rendering in a Web Worker, ONNX Runtime Web for the photo tool, Blender (Cycles) for the rooms, Vitest for tests.
