# living-render-01 — Blender-rendered proof room

Built by `tools/blender/build_room.py` and rendered by `tools/blender/render_layers.py` in Blender 5.2.2 LTS (Cycles, Apple M4 (GPU - 10 cores)), 512 samples per pass, seed 1729, adaptive sampling off, OpenImageDenoise. Imported by `scripts/import-rendered-scene.ts`. Exact settings, camera matrix and render times: `render-manifest.json`.

**Geometry (true scale).** Room 5.2 × 6.0 × 2.7 m. Door leaf 900 × 2000 × 40 mm in a 1000 × 2050 mm rough opening; casing 70 × 16 mm, skirting 80 × 16 mm (products `pervaze-mdf`, `lajsne-mdf`). Camera 21 mm on a 36 mm sensor at 1.55 m, level, lens shift -0.17000000178813934. Floor, door and trim mappings are exact projections of the modelled planes, so plank size is physically correct.

**Layers.** Masks are shader-AOV coverage (antialiased), jointly quantised so editable coverage never exceeds 255 per pixel. Light plates are Cycles diffuse light (Combined of a 50 % grey Lambertian pass ÷ 0.5), so contact shadows and bounce light are real; their constant light colour is stored as `tint`. Reflection plates are a black-dielectric (F0 0.04) pass, scaled at runtime by each material's gloss. The base plate is the light pass with each editable surface's share removed (exact at edges from a second pass at 25 % grey). `original.png` is the neutral render used by compare-with-original. `floor-position.png` is 16-bit world X/Y in 0.1 mm units (origin -300, -300 mm).

**Checks at render time.** Position map vs Cycles Position pass: median 0.001 mm, p99 0.008 mm; one sample every 4 px, bilinear reconstruction vs the exact plane max 0.225 mm (p99 0.125 mm, includes quantisation). Base edge clamp: p99 0.0543, max 0.0869 (linear). Hidden surfaces (not exported): skirting-left.

**Inputs.** CC0 models, texture and HDRI from Poly Haven (`tools/blender/assets.json`, hashes in `tools/blender/assets.lock.json`, ledger `renderInputs`). Sideboard, print, vase, books, curtains, window and the door assembly are modelled in the build script.
