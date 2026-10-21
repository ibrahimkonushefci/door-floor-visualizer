# Door & Floor Visualizer

A web catalog and room visualizer for interior-door and flooring showrooms. Customers pick a door, a finish and a floor and see them together in a furnished room on their phone, tablet or laptop, instead of browsing a heavy PDF catalog.

Built as a static site in Albanian (default), English and German. No backend and no account; it works offline after one save.

> **Status: sales demo.** All products, prices and contacts are demo content under the **Dyer & Dysheme** demo brand (`demoMode: true`). Nothing is sent and nothing is indexed. See [Licensing reminder](#licensing-reminder) before showing it to customers.

## Features

- **Catalog**: product grid with category filters, saved items, and product pages with finish swatches, sizes and specifications.
- **Studio**: seven furnished rooms rendered in Blender (living room, kitchen, bedroom, hallway, entrance, kids' room, bathroom). Change the door model and finish, the casing, the skirting and the floor; the room updates in about a second.
- **Presenting tools**: full-screen mode, tap a surface to edit it, zoom and pan, A/B compare, product details, image download, and a share link with a QR code.
- **Own-room photo** (experimental): upload a photo of a room, mark the floor (AI first guess plus a brush), and see a new floor in it.
- **Offline**: a hidden presenter sheet saves the whole Studio (about 31 MB) for meetings without internet, and lists a 3-minute demo route.

## Quick start

Requires Node 24 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm build      # only needed after changing something
pnpm preview    # http://127.0.0.1:4173/sq/studio/
```

To open it on a phone on the same Wi-Fi, run `pnpm preview --host 0.0.0.0` and visit `http://<your-mac-ip>:4173/sq/studio/` (find the IP with `ipconfig getifaddr en0`). Offline saving and sharing need HTTPS, so they are hidden there.

For development with hot reload: `pnpm dev` (http://127.0.0.1:3000/sq/).

**Presenter sheet:** press and hold the logo for about a second, or add `?presenter=1` to any URL.

## Project layout

| Path | What it holds |
|---|---|
| `src/` | Next.js app: pages, components, the Studio renderer (`lib/studio/`), workers, service worker |
| `brand/` | Everything company-specific: name, colours, contacts, translations, products, materials, room assets |
| `public/` | Generated images, scene layers, textures and the photo tool's AI model |
| `scripts/` | Asset pipelines, data validation, export and budget checks |
| `tools/blender/` | Blender scripts that build and render the rooms |
| `tests/` | Vitest unit tests |
| `docs/` | Plans, pitch kit, research and the development guide |

## Documentation

- [Development guide](docs/DEVELOPMENT.md): checks, rooms, Blender rendering, décor import, photo tool, rebranding, hosting.
- [Pitch kit](docs/pitch/): 3-minute demo script, offer draft and rebrand checklist.
- [Project plan](docs/plan/STUDIO_REALISM_PLAN.md): phases, decisions and handoff log.

## Licensing reminder

Two permissions are still open. Review them before any customer-facing commercial use:

- **Own-room photo AI (SegFormer-B0):** licensed for non-commercial research or evaluation only. Whether a sales demonstration is allowed has not been reviewed. Review the licence or replace the model behind `FloorSegmenter` before showing, selling or deploying the photo tool. The showroom Studio does not use this model.
- **Supplier décors (Kronotex):** images from official product pages with no reuse licence, marked `private-pitch-only`. Get written permission, or use the showroom's own licensed images, before customer use.

## Tech

Next.js 16 static export, React 19, TypeScript, plain CSS, Canvas 2D rendering in a Web Worker, ONNX Runtime Web for the photo tool, Blender (Cycles) for the rooms, Vitest for tests.
