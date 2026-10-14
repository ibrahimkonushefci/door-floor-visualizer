# Phase 4 design — render controller, frame cache and memory

Status: **design, written before any Phase 4 UI work** (plan, Phase 4 "Before the UI work", item 2). The physical-iPad baseline was deferred by the owner (2026-10-14). For the sales demo, Phase 4 was built with the simpler approach in **§7 Demo implementation** below; §3 remains the reference if device testing later shows the demo approach is not enough. Numbers below are from `scripts/profile-studio-assets.ts` with corrected accounting (2026-10-14): the analytical owned-buffer bound, not a heap measurement.

## 1. What exists today

- `createRenderController` runs **one job at a time**. Every `render()` cancels the previous job, so nothing can be rendered next to the on-screen frame (A/B, export).
- The prepared scene is held **twice**: the controller keeps it on the main thread (door-model patching, main-thread fallback) and posts a structured-clone **copy** to the worker. Material mip chains are held in the controller's texture cache (28 MiB) **and** copied to the worker (current set plus the incoming one).
- The result cache is a 16 MiB byte LRU. A 1928-px frame is 11.2 MB (one fits) and a 2400-px frame is 17.3 MB (never cached), so "switch back" re-renders on laptops.
- No viewport in `RenderJob`; the kernel samples the base plate and reflections **nearest-neighbour** (fine at ≤ 1:1, blocky when zoomed).
- No hit test; masks exist only inside the prepared scene.
- No watchdog. A worker that stops answering without an `error` event leaves the stage busy forever.

### Bug found and fixed during this design (pre-existing)

Turbopack starts a module worker from a bootstrap script that reads its chunk list from the URL fragment (`turbopack-worker-*.js#params=…`). The offline pack stores that script under its plain URL. With a saved offline pack, the service worker answered from the pack, the worker started without `#params` ("Missing worker bootstrap config"), the controller fell back to the **main thread** for every frame. Reproduced in headless Chrome (old `sw.js` + saved pack → `mode: main`; fixed → `mode: worker`). Fix: `workerScriptResponse()` in `src/lib/offline/cache.ts` re-wraps worker-script responses so they take the page's request URL (fragment included). Whether Safari behaves the same is checked by the iPad baseline (its `mode` column after the offline save).

## 2. Memory today (corrected accounting)

Worst room per variant (kitchen; MiB):

| Term | Full (≤ 2400 px) | Light (≤ 1200 px) |
|---|---|---|
| Scene, controller + worker copy | 63.5 | 16.7 |
| Controller texture cache | 28.0 | 28.0 |
| Two worker material sets | 38.9 | 38.9 |
| Result cache | 16.0 | 16.0 |
| Incoming mip build | 19.5 | 19.5 |
| Four transient frames (output, back canvas, 2 display canvases) | 65.9 | 16.5 |
| Three material decode buffers | 12.0 | 12.0 |
| Fallback + compare images | 19.1 | 6.8 |
| Door-model switch (second scene) | 31.7 | 8.4 |
| **Total** (limit) | **294.7** (320) | **162.8** (200) |

Adding what Phase 4 needs on top of this design (three stage frames instead of the 16 MiB cache: +33.4; export composition canvas + JPEG: +20; door-model crops in flight: up to one crop) gives ≈ 336 MiB full, **over the 320 MiB limit**. Limits stay unchanged, so the duplications go.

## 3. Design

### 3.1 The worker owns the scene and the materials (no copies)

The renderer's state lives in exactly one place: the worker (or, after a failure, the main thread — never both).

- **Engine.** The code that prepares and renders (today split between the controller and `studio.worker.ts`) becomes one `createRenderEngine(decode, loadBytes)` module: scene preparation (`prepareSceneWith`, unchanged), door-model switching (`switchDoorModel`, unchanged), the material loader and cache (`createMaterialLoader`, unchanged), hit-map building and `renderRows`. The worker hosts one engine; the main-thread fallback hosts one engine directly. Same code, same results.
- **Decode proxy.** Image decoding needs the DOM (`createImageBitmap` + canvas colour conversion, as today), so the worker's `decode(path)` is a request to the main thread: the main thread decodes with the existing `decodeAsset` and **transfers** the RGBA buffer to the worker. The loader awaits decodes one at a time today and keeps doing so, so at most one decoded layer is in flight (door-model crops are 34–66 MiB per model in total but 1.9–2.8 MB each). Position maps are fetched in the worker (`fetchBytes` already works there).
- **Main thread keeps** only: the scene *definition* ids (to key frames), the hit map (§3.5), the frame cache (§3.3) and the decode service.
- **Savings:** the scene copy (31.7 MiB) and the duplicated material sets (38.9 MiB).

### 3.2 Job lanes instead of "every render cancels everything"

`render(job, { lane })` with lanes `stage` (default), `compare` and `export`.

- A new job **cancels only the previous job in its own lane** (queued: dropped; running: cancelled in the worker by job id).
- One executor runs jobs serially against the engine, priority `stage` > `compare` > `export` (FIFO within a lane; at most one queued per lane).
- **Scene changes:** a job needs the engine prepared for its (room, revision, scale, door model). A different door model of the same room is a cheap in-worker model switch (≈ 0.2–0.4 s, as today). A different room or scale is a full prepare; when the **stage** lane switches room, queued `compare`/`export` jobs for the old room are rejected with `SceneChanged` (A/B re-requests for the new room; export shows "try again"). Export is modal, so in practice this only happens on errors.
- `cancel(lane?)` cancels one lane or all; `dispose()` as today.

### 3.3 Frame cache sized by stage frames

- Byte LRU of finished frames keyed as today plus the viewport (§3.4). Budget = `FRAME_CACHE_FRAMES` (3) × the bytes of the largest settled `stage` frame seen (re-sized on stage resize): **A, B and the previous frame** at the stage's own resolution (1928 px: 33.4 MiB; 2400 px: 49.4 MiB).
- Frames on screen (`pin(keys)`: the stage frame, or A and B while comparing) are never evicted.
- Frames survive a room switch (switching back to the previous room is instant); the old design cleared them to keep scene preparation lean, and with the copies gone preparation stays far under the limit (§4).
- `export` frames are not cached (one-off, released after encoding).

### 3.4 Viewport for zoom

- `RenderJob.viewport?: [x, y, w, h]` in scene-normalised units (default `[0, 0, 1, 1]`). The kernel maps output pixel centres into the viewport; texture LOD (`footprint`, homography derivatives) uses the effective frame width `job.width / w`.
- When a pixel samples the scene at more than 1:1 (zoomed), the base plate, reflections and reveal are sampled **bilinearly**. Unzoomed jobs keep today's code path, so fixtures and `assets:scenes --check` stay byte-identical.
- Zoom never changes the scene variant: the stage's unzoomed width picks full or light (phones stay on the light variant and its 200 MiB bound). Max zoom 3× on the full variant, 2× on the light one (scene layers then upsample ≤ 2.4×; floor boards keep full detail from the 1.5 px/mm plank sheets).
- Interaction: pinch/wheel scales the current canvas with a CSS transform at once; ~150 ms after the gesture settles, the visible viewport is rendered sharp at stage resolution (lane `stage`, cached like any frame).

### 3.5 Hit map for tap-to-select

- After each prepare or door-model switch the engine builds a **role map** at ¼ of the full scene size (600×450 bytes for 2400×1800 rooms): per cell the role (`floor`, `door-leaf`, `frame`, `skirting`, none) with the largest mask coverage ≥ 50 %. It is transferred to the main thread (≈ 0.26 MB).
- `controller.hitTest(sceneId, modelId, x01, y01)` maps a stage point (through the current viewport) to a role, or `null` if the map belongs to another room/model or the point is on furniture. Door-leaf/frame open the door tab, floor/skirting the floor tab. The bathroom has no floor role.

### 3.6 Watchdog and recovery

- The worker sends a heartbeat (`progress {jobId, rows}`) at least every 250 ms while rendering and answers every prepare/decode step. If a request gets **no message for 10 s**, or the worker fires `error`/`messageerror`, the controller terminates it.
- Recovery: the first failure restarts a fresh worker (re-prepares the current room: ≈ 1 s plus decode); a second failure in the session switches to the main-thread engine for good (batched rendering, as today's fallback). The stage shows its normal progress state, never a frozen frame. Each event is reported through `onTiming` (`mode: 'recovered' | 'main'`), so `?debug=1` and the baseline record it.

### 3.7 Image export (Codex spec)

- `exportStudioImage(catalog, selection, locale, { controller, signal, onProgress }): Promise<Blob>`. The first three parameters are the spec's signature; the controller comes in as an option.
- The selection is captured immutably when the rep presses Download. It renders in lane `export` against the **already prepared scene**, at that scene's native resolution (2400×1800 full, 1200×900 light), without cancelling the stage. No second controller and no second scene copy, so the "isolated controller" option in the plan is not used.
- Composition: one canvas of frame + label strip (room, floor, door, frame, skirting, illustrative notice, brand logo), `toBlob('image/jpeg', 0.92)`, then the canvas is released (`width = 0`). Progress: render rows → compose → encode. Works offline (everything is local; the logo and fonts are in the shell cache). Failure → "try again". Cancel/close → `AbortSignal` cancels the export lane.
- Saving: a second tap shows Download (and Share on iPad, where the Web Share API can save to Photos), because Safari requires a fresh user gesture after the asynchronous render.

## 4. Memory after the change (analytical, same method)

Kitchen (worst), MiB:

| Term | Full | Light |
|---|---|---|
| Scene, once (worker) | 31.7 | 8.4 |
| Door-model switch in the worker (previous + new, shared layers counted in full) | 31.7 | 8.4 |
| One decoded layer in flight (crop or plate) | 16.5 | 4.1 |
| Worker texture cache (holds the active set) | 28.0 | 28.0 |
| Incoming mip build | 19.5 | 19.5 |
| Frame cache: 3 stage frames | 49.4 | 12.4 |
| Four transient frames | 65.9 | 16.5 |
| Export canvas + JPEG | 20.0 | 5.5 |
| Hit map (worker + main) | 0.5 | 0.5 |
| Three material decode buffers | 12.0 | 12.0 |
| Fallback + compare images | 19.1 | 6.8 |
| **Total** (limit) | **≈ 294** (320) | **≈ 122** (200) |

`scripts/profile-studio-assets.ts` is updated with these terms when the change lands, and must stay under both limits. No limit changes.

## 5. Tests to add with the implementation

- Lanes: an export/compare job never cancels the stage job and vice versa; a stage room switch rejects stale compare/export jobs; at most one queued job per lane.
- Frame cache: holds three stage frames at 2400 px; pinned frames survive eviction; switch back is a cache hit.
- Ownership: after a prepare, the main thread holds no scene or mip buffer (the engine's scene lives in the fake worker); decode requests are serialised (one in flight).
- Viewport: `[0,0,1,1]` output is byte-identical to today; a 2× viewport equals the matching crop of a 2× wide frame within rounding; zoomed base sampling is bilinear.
- Hit map: role at known points of a legacy fixture and a rendered room; null over protected furniture; follows a door-model switch.
- Watchdog: a silent worker is terminated after the timeout and the frame still arrives (restart, then main thread); an `error` event recovers.
- Export: JPEG at 0.92 with the label strip, the stage frame untouched, cleanup on abort.

## 6. What the iPad baseline decides

1. **Any tab reload or worker crash in the baseline** → stop: §3.1 lands first, the baseline is repeated, and only then the UI work.
2. **`mode: main` after the offline save** → Safari does not keep the worker URL fragment through the service-worker fix; fix that before anything else (e.g. stop serving worker scripts from the pack while online).
3. **Sharp-frame times** are the reference for presentation mode, whose stage is wider (1024-px landscape iPad: ≈ 2048-px frames instead of ≈ 1272 today, about 2.6× the pixels). If the baseline's floor/door switches are already slow, the owner decides whether presentation mode caps iPad frames (e.g. 2048 px).
4. **Safari memory peak** is the reference for the gate run: the Phase 4 gate run should not exceed it by more than the analytical change above (≈ 0).

## 7. Demo implementation (2026-10-14)

The owner asked for a working sales demo using simple, reliable solutions, with physical-device testing deferred. Phase 4 therefore keeps today's controller (one job at a time, scene held on the main thread and copied to the worker, 16 MiB result cache) and adds only what the presentation features need:

| Need | §3 design | Demo implementation |
|---|---|---|
| A/B compare | `compare` lane rendering B next to A | A is a **snapshot** of the frame on screen (one canvas at stage resolution); the stage renders B as usual. Closed on a room change and before an export. |
| Image export | `export` lane, no stage cancel | `exportStudioImage` renders through the shared controller **while the stage is idle** (Download is enabled only on a settled frame), at the prepared variant's own size (2400×1800 / 1200×900), then composes the label strip and encodes JPEG 0.92. A stage render started meanwhile supersedes it; the dialog offers "Try again". |
| Zoom | `RenderJob.viewport`, bilinear when zoomed | CSS transform on the frame layers (3× full, 2× light); ~0.2 s after zooming, one re-render at the **variant's full width** (e.g. 1928 → 2400 px). The variant follows the unzoomed stage, so phones stay on the light variant. No kernel change. |
| Tap-to-select | ¼-scale role map | `controller.hitTest` reads the prepared surface masks the main thread already holds (largest coverage ≥ 50 %; protected furniture and other rooms → null). No extra memory. |
| Watchdog | heartbeat, restart once, then main thread | A worker job with no answer for 15 s is treated like a worker error: the worker is terminated and the frame finishes on the main thread. |
| Frame cache, ownership, lanes | §3.1–3.3 | Not done. Switching back to a room re-renders (≈ 1 s on the laptop). |

Memory (analytical, `scripts/profile-studio-assets.ts`): one new term, `presentationExtras = max(A/B snapshot frame, export canvas + strip + JPEG)`, since the two never coexist. Worst rooms: kitchen **316.5 / 320 MiB** full, **168.2 / 200 MiB** light. All limits unchanged. Not a Safari heap measurement.
