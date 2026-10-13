# Floor visualizer research: Egger, Roomvo, Quick-Step

Research date: 13 October 2026. Method: REA (reverse-engineering MCP) attached to an isolated Chrome profile over a loopback DevTools endpoint. Shipped JavaScript was exported and read statically. No customer photo was uploaded to any service, so server-side behaviour is **inferred**, not observed. Raw REA evidence bundles lived in the research session's scratchpad and are not in this repo; the facts below cite the vendor file and line instead.

Screenshots: [egger.jpg](screens/egger.jpg), [roomvo.jpg](screens/roomvo.jpg), [quickstep.jpg](screens/quickstep.jpg).

## Egger — myfloor.egger.com

- **Stack:** jQuery 3.4.1, scripts under `/js/custgroup/vds_online/` (`room.js`, `texture.js`, `mapping.js`, `editor.js`, `upload.js`, `togglerotate.js`, `dwn.js`).
- **Rendering:** hybrid. The server returns mapped texture/room images; the browser composites them with masks and a light/shadow overlay.
  - Prepared room image: `image.php?image=1&Mode=1&…&MP=…&Texture=…&TextureRot=…&TextureOffsetType=…&TextureMirrorType=…&ImgShadow=…` (`mapping.js:542-559`).
  - Mapped texture plane for edited projects: `image.php?…&Mode=10006…` (`editor_functions.js:1461, 2060, 2158`).
  - Client compositing functions: `create_alpha_img`, `merge_master_image`, `render_object` (`editor.js:1611, 1719, 3444`).
  - Output widths up to 3840 px (`mapping.js:11`).
- **Own-room upload:** the photo is resized to 2048 px (`editor.js:192, 974`), POSTed as a JPEG to `save_ki_image_data.php` ("KI" is German for AI) and returns a project `unique` ID that reloads the room (`room_list.js:400-454, 887-900`). The server returns camera/floor geometry: `AI_data.heading/pitch/roll/fov/pos_*/floor_length/floor_width` (`editor_functions.js:1757-1765`).
- **Correction tools exist in code:** `create_mask`, `color_fill`, `editor_back`/`editor_forward` (undo/redo), plus brightness/contrast "average" sliders.
- **Rotation:** 90° steps only (`togglerotate.js:40`).
- **Customer takeaway:** branded, labelled JPEG download (logo plus text, `toDataURL("image/jpeg", 0.9)`, `dwn.js:24-55`), save/share, reload by project ID.
- **Content:** 4 style worlds × 3 furnished rooms. A separate Codex audit observed 284 catalog items with filters (not re-verified here).

## Roomvo — www.roomvo.com/my/multisurface_demo/

- **Stack:** Next.js app (`pages/[vendorUrlPath]`) with a ~5 MB `_app` chunk. It includes **Three.js** (`WebGLRenderer` ×41) and WebXR (`immersive-ar`).
- **Rendering:** client-side WebGL shaders that consume a `segmentationTexture` and a `depthMapTextureContext`, with normal-based lighting (`flatDiffuse = max(dot(normal, normalize(flatLightDir)), 0.0)`).
- **No in-browser ML was found** (no onnx, tfjs or mediapipe), so segmentation and depth are almost certainly produced on Roomvo's servers.
- **Upload:** drag-and-drop, choose from library, take a photo, HEIC, and "Upload from mobile" via QR. Corrections: "Undo Erase", "PaintedPoint" (brush/erase touch-up).
- **APIs:** `/services/room/rooms/`, `room_shares` (including `email_share_link`), `room/measurements`, `crm/leads`, `visitor/visitor_favorites`, `event/events/bulk_create`, vendor themes.
- **UI features in bundle strings:** Rotate Surface, Compare Products, Compare Slider Handle, Zoom room image, Pattern, Grout Color/Size, Roomvo measure ("Scan the QR code to start measuring"), Price, Order Sample, Request Sample, Book Appointment, Share via Email, Download, Favorites.
- **Product types enum** includes Floors, Walls, Countertops, Cabinets, **Doors (9)** and **Trims (10)**, so doors are supported at platform level.
- **Content:** 17 demo rooms with a room-type filter.

## Quick-Step RoomViewer — quick-step.co.uk/en-gb/roomviewer

- **Stack:** an iframe to `quickstep.esignserver1.com/gallery.do` (jQuery, jQuery-File-Upload).
- **Rendering:** fully server-rendered. The whole result is one image, `image?maxwidth=1920&maxheight=1920&id=unilin_Livingroom02irregular~SIG4763~0.0_#cccccc`, meaning room ~ product SKU ~ angle _ wall colour. Floor textures come from `texture?id=Quick-Step_<SKU>`, and images cross-fade (`zonefx.js`).
- **Room naming hints at authored renders per room:** `LivingRoom-1-SIG4760`, `LivingRoom-3-BACL40026`.
- **UI (`scripts/init.js`):** upload room, choose floor, choose room, split-pane A/B floor compare (`requestSplitPane`, `commercial_code_b`), zoom & pan (`requestZoomAndPan`), installation direction (`sendGTMDataAngle`), wall colour anchors (`getSurfaceColorValues`), in-scene hotspots, product card (SKU, dimensions, water resistant, Discover), project code, print, "Room changed due to floor compatibility", GTM event per action.

## Best practices to adopt

1. Furnished, professionally lit rooms where furniture occludes the floor. This is the single largest realism cue.
2. Real décor scans tied to real article data.
3. High output resolution (Egger requests up to 3840 px wide; Quick-Step 1920).
4. Own-room upload = automatic first guess **plus** manual touch-up (brush/erase/undo) **plus** a checkable perspective step. None of the three trusts automation alone.
5. Takeaways: labelled image download, share link, project code/QR to phone.
6. Presentation UX: tap surfaces in the image, zoom/pan, product-vs-product compare, product card.
7. Measure which combinations are tried (analytics events).

## This project's verified gaps (at `0c41e9d`)

- No upload anywhere in `src/`.
- 3 Studio rooms (`STUDIO_SCENES` in `scripts/prepare-scenes.ts`); two generated, empty rooms; one photo.
- Floor atlas resolution is about **0.37 px/mm** (`repeatPixels` 2048 for 5520 mm). A 193 mm plank is about 71 px, so near planks are upsampled and soft, and the 16-board repeat is visible.
- All 26 `specular` fields in `brand/materials.json` are `null`, so floors have no sheen.
- Rotation is 0°/90° only. One fixed door geometry per room. `dera-kashmir` and `dera-antracit` have no compatible scene.
- Generated rooms' millimetres are "artist-fitted" (`brand/assets/scenes/living-standard/AUTHORING.md:7`), so true scale is not established.
- Canonical scene size is 1600×1200.
- No image download, zoom, tap-to-select, product compare or analytics.

**Strengths to keep:** instant client-side rendering in a Web Worker, offline presenter pack, door + casing + skirting coordination, SQ/EN/DE, WhatsApp/Viber inquiries, rebrandable `brand/` folder.
