"""Render every compositing layer of a room built by build_room.py.

    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python tools/blender/render_layers.py -- --room living-render-01 [--model flat] \
        [--samples 512] [--scale 100] [--crop] [--post-only]

Three Cycles renders on the Metal GPU, same seed, adaptive sampling off so every
pass sees identical camera samples:

  light    editable surfaces are a 50 % grey Lambertian. Combined / 0.5 is the
           colour-independent diffuse light (direct + indirect, denoised) that
           replaces hand-cleaned lighting plates. Also carries Position and one
           shader AOV per editable surface, which gives antialiased coverage.
  light-dim  the same with a 25 % grey; light minus light-dim (less the
           furniture's own bounce change, taken from its neighbours) is the
           editable share of each edge pixel, used to build the base plate.
  gloss    editable surfaces are a black dielectric (F0 0.04, GGX). Combined is
           the reflection plate; the runtime scales it by each material's gloss.
The base plate is the light pass with each editable surface's neutral share
(coverage x 0.5 x its own dilated light) subtracted and unpremultiplied, so
furniture edges composite exactly. (Holdouts were tried first: Cycles then shows
them black in reflections, e.g. on the chrome chair base.)

Post-processing (numpy, Blender's bundled OpenImageIO for EXR input) writes
8-bit masks with jointly quantised (partitioned) coverage, per-surface light and
reflection plates dilated past their edges, the tone-mapped base plate, the
16-bit floor world-position map and layers.json / render-manifest.json into
tools/blender/out/<scene>/<model>/layers/. scripts/import-rendered-scene.ts turns
that into a Studio scene (the default model) plus a door-model patch per other
model. Non-default models encode their plates with the default model's light
scale (and floor/skirting reflection scales), so their pixels can be pasted
over the default layers.

--crop (non-default models only) renders just a border around the default
model's door assembly (CROP_MARGIN_PX past it, so the denoiser sees the same
neighbourhood where the importer cuts its patch). Cycles samples each pixel
from its own coordinates and the seed, so the pixels inside are the same as a
full render's; everything outside stays black and is never used.
"""
import json
import math
import struct
import sys
import time
import zlib
from pathlib import Path

import bpy
import numpy as np
import OpenImageIO as oiio
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import room_spec as spec  # noqa: E402

SEED = 1729
NEUTRAL_ALBEDO = 0.5
DIM_ALBEDO = 0.25  # second light pass; the difference isolates editable light at edges
GLOSS_ROUGHNESS = {"floor": 0.30, "door-leaf": 0.38, "frame": 0.38, "skirting": 0.38}
# Filmic shoulder shared with the runtime kernel (RoomScene.render.toneShoulder).
TONE_SHOULDER = 0.6
POSITION_UNIT_MM = 0.1
# One position sample every STEP pixels: a planar floor's map is smooth, so
# bilinear reconstruction stays far inside the 0.5 mm budget (measured in post)
# while the file is ~16x smaller than a per-pixel map.
POSITION_STEP_PX = 4
# Border for --crop: the importer's patch reaches 176 px past the door assembly
# (scripts/import-rendered-scene.ts SEARCH_PX + MARGIN_PX); the rest is
# denoiser context.
CROP_MARGIN_PX = 320


def argv():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def opt(name, default=None):
    a = argv()
    return a[a.index(name) + 1] if name in a else default


ROOM = spec.load(opt("--room", spec.ROOMS[0]))
MODEL = opt("--model", ROOM.DEFAULT_MODEL)
SURFACES = spec.surfaces_for(ROOM, MODEL)
OUT = HERE / "out" / ROOM.SCENE_ID / MODEL
LAYERS = OUT / "layers"
REFERENCE = HERE / "out" / ROOM.SCENE_ID / ROOM.DEFAULT_MODEL / "layers" / "layers.json"


# --- PNG writer (deterministic, no colour chunks) ----------------------------


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = np.abs(p - a), np.abs(p - b), np.abs(p - c)
    return np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, b, c))


def write_png(path, arr):
    arr = np.ascontiguousarray(arr)
    if arr.ndim == 2:
        arr = arr[:, :, None]
    h, w, ch = arr.shape
    depth = 16 if arr.dtype == np.uint16 else 8
    color = {1: 0, 2: 4, 3: 2, 4: 6}[ch]
    raw = (arr.astype(">u2").view(np.uint8) if depth == 16 else arr.astype(np.uint8)).reshape(h, -1)
    bpp = ch * depth // 8
    cur = raw.astype(np.int16)
    up = np.vstack([np.zeros((1, cur.shape[1]), np.int16), cur[:-1]])
    left = np.hstack([np.zeros((h, bpp), np.int16), cur[:, :-bpp]])
    upleft = np.hstack([np.zeros((h, bpp), np.int16), up[:, :-bpp]])
    candidates = [cur, cur - left, cur - up, cur - ((left + up) >> 1), cur - _paeth(left, up, upleft)]
    candidates = [(c % 256).astype(np.uint8) for c in candidates]
    cost = np.stack([np.abs(c.astype(np.int8).astype(np.int32)).sum(axis=1) for c in candidates])
    best = cost.argmin(axis=0)
    rows = np.stack(candidates)[best, np.arange(h)]
    payload = np.hstack([best.astype(np.uint8)[:, None], rows]).tobytes()

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, depth, color, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(payload, 9)) + chunk(b"IEND", b"")
    Path(path).write_bytes(png)


def srgb_encode(lin):
    lin = np.clip(lin, 0.0, 1.0)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)


def to_byte(lin):
    return np.round(srgb_encode(lin) * 255).astype(np.uint8)


def tone(x, k=TONE_SHOULDER):
    x = np.maximum(x, 0.0)
    return np.where(x <= k, x, k + (1 - k) * (1 - np.exp(-(x - k) / (1 - k))))


# --- scene setup ---------------------------------------------------------------


def use_metal(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    names = []
    for dev in prefs.devices:
        dev.use = dev.type == "METAL"
        if dev.use:
            names.append(dev.name)
    scene.cycles.device = "GPU"
    return names


def editable_objects():
    return {o["studio_surface"]: o for o in bpy.data.objects if "studio_surface" in o}


def role_of(surface_id):
    return next(s["role"] for s in SURFACES if s["id"] == surface_id)


def material_with_aov(name, shader_builder, aov):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(shader_builder(nt).outputs[0], out.inputs["Surface"])
    a = nt.nodes.new("ShaderNodeOutputAOV")
    a.aov_name = aov
    a.inputs["Value"].default_value = 1.0
    return m


def neutral_shader(albedo):
    def build(nt):
        n = nt.nodes.new("ShaderNodeBsdfDiffuse")
        n.inputs["Color"].default_value = (albedo, albedo, albedo, 1)
        return n

    return build


def gloss_shader(roughness):
    def build(nt):
        n = nt.nodes.new("ShaderNodeBsdfPrincipled")
        n.inputs["Base Color"].default_value = (0, 0, 0, 1)
        n.inputs["Roughness"].default_value = roughness
        n.inputs["Specular IOR Level"].default_value = 0.5
        n.inputs["IOR"].default_value = 1.5
        return n

    return build


def crop_border(scene):
    """Border (pixels x0, y0, x1, y1 from the top left) around the default
    model's door assembly and hardware, grown by CROP_MARGIN_PX."""
    ref = json.loads(REFERENCE.read_text())
    boxes = [s["boundsPx"] for s in ref["surfaces"] if s["role"] in ("door-leaf", "frame")] + [ref["protectedBoundsPx"]]
    W, H = ref["width"], ref["height"]
    x0 = max(0, min(b[0] for b in boxes) - CROP_MARGIN_PX)
    y0 = max(0, min(b[1] for b in boxes) - CROP_MARGIN_PX)
    x1 = min(W, max(b[0] + b[2] for b in boxes) + CROP_MARGIN_PX)
    y1 = min(H, max(b[1] + b[3] for b in boxes) + CROP_MARGIN_PX)
    r = scene.render
    r.use_border = True
    r.use_crop_to_border = False
    r.border_min_x, r.border_max_x = x0 / W, x1 / W
    # Blender's border y runs from the bottom.
    r.border_min_y, r.border_max_y = 1 - y1 / H, 1 - y0 / H
    return [x0, y0, x1, y1]


def configure(scene, samples, scale):
    devices = use_metal(scene)
    c = scene.cycles
    c.samples = samples
    c.seed = SEED
    c.use_animated_seed = False
    c.use_adaptive_sampling = False
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    c.denoising_prefilter = "ACCURATE"
    c.denoising_quality = "HIGH"
    scene.render.resolution_percentage = scale
    scene.render.film_transparent = False
    vl = scene.view_layers[0]
    vl.use_pass_position = True
    existing = {a.name for a in vl.aovs}
    for s in SURFACES + [{"id": "protected"}]:
        name = spec.aov_name(s["id"])
        if name not in existing:
            a = vl.aovs.add()
            a.name = name
            a.type = "VALUE"
    img = scene.render.image_settings
    img.media_type = "MULTI_LAYER_IMAGE"
    img.file_format = "OPEN_EXR_MULTILAYER"
    img.color_depth = "32"
    img.exr_codec = "ZIP"
    # Hardware writes the protected AOV in every pass.
    for m in {s.material for o in bpy.data.objects if "studio_protected" in o for s in o.material_slots}:
        if not any(n.type == "OUTPUT_AOV" for n in m.node_tree.nodes):
            a = m.node_tree.nodes.new("ShaderNodeOutputAOV")
            a.aov_name = spec.PROTECTED_AOV
            a.inputs["Value"].default_value = 1.0
    return devices


def render_pass(scene, name):
    objs = editable_objects()
    for sid, ob in objs.items():
        if name in ("light", "light-dim"):
            albedo = NEUTRAL_ALBEDO if name == "light" else DIM_ALBEDO
            mat = material_with_aov(f"{name}-{sid}", neutral_shader(albedo), spec.aov_name(sid))
        else:
            mat = material_with_aov(f"{name}-{sid}", gloss_shader(GLOSS_ROUGHNESS[role_of(sid)]), spec.aov_name(sid))
        ob.data.materials.clear()
        ob.data.materials.append(mat)
    scene.render.filepath = str(OUT / f"{name}.exr")
    start = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - start


# --- camera geometry -------------------------------------------------------------


def camera_info(scene):
    cam = scene.camera
    W = scene.render.resolution_x * scene.render.resolution_percentage // 100
    H = scene.render.resolution_y * scene.render.resolution_percentage // 100
    frame = [Vector(v) for v in cam.data.view_frame(scene=scene)]
    tl = next(v for v in frame if v.x < 0 and v.y > 0)
    tr = next(v for v in frame if v.x > 0 and v.y > 0)
    bl = next(v for v in frame if v.x < 0 and v.y < 0)
    rot = cam.matrix_world.to_3x3()
    return {
        "W": W,
        "H": H,
        "origin": np.array(cam.matrix_world.translation),
        "tl": np.array(rot @ tl),
        "right": np.array(rot @ (tr - tl)),
        "down": np.array(rot @ (bl - tl)),
        "matrix_world": [list(r) for r in cam.matrix_world],
        "lens_mm": cam.data.lens,
        "sensor_mm": cam.data.sensor_width,
        "shift": [cam.data.shift_x, cam.data.shift_y],
    }


def project01(scene, p):
    v = world_to_camera_view(scene, scene.camera, Vector(p))
    if v.z <= 0:
        raise ValueError(f"point behind camera {p}")
    return [v.x, 1 - v.y]


def floor_positions(cam, bounds):
    """World xy (metres) of the z = 0 plane at every pixel centre inside bounds."""
    x0, y0, w, h = bounds
    u = (np.arange(x0, x0 + w) + 0.5) / cam["W"]
    v = (np.arange(y0, y0 + h) + 0.5) / cam["H"]
    uu, vv = np.meshgrid(u, v)
    d = cam["tl"][None, None, :] + uu[..., None] * cam["right"] + vv[..., None] * cam["down"]
    with np.errstate(divide="ignore", invalid="ignore"):
        t = -cam["origin"][2] / d[..., 2]
    t = np.where(t > 0, t, np.nan)
    return cam["origin"][0] + t * d[..., 0], cam["origin"][1] + t * d[..., 1]


def planar_mappings(scene):
    """Exact homography quads (plane mm <-> image01) for each editable surface."""
    g = spec.door_geometry(ROOM, MODEL)
    D, W = ROOM.ROOM["depth"], ROOM.ROOM["width"]
    lx0, lx1, lz0, lz1 = g["leaf"]
    ix0, ix1, iz = g["casing_inner"]
    cx0, cx1, cz = g["casing_outer"]
    cd, sd, sh = spec.CASING["depth"], spec.SKIRTING["depth"], spec.SKIRTING["height"]
    near = ROOM.CAMERA["location"][1] + 0.9
    mm = lambda a: round(a * 1000, 3)  # noqa: E731
    rects = {
        # surface: (top-left, top-right, bottom-right, bottom-left) in 3D, plane size (mm), uv rotation
        "leaf": ([(lx0, D, lz1), (lx1, D, lz1), (lx1, D, lz0), (lx0, D, lz0)], (lx1 - lx0, lz1 - lz0), 90),
        "frame-left": ([(cx0, D - cd, cz), (ix0, D - cd, cz), (ix0, D - cd, 0), (cx0, D - cd, 0)], (ix0 - cx0, cz), 90),
        "frame-right": ([(ix1, D - cd, cz), (cx1, D - cd, cz), (cx1, D - cd, 0), (ix1, D - cd, 0)], (cx1 - ix1, cz), 90),
        "frame-top": ([(cx0, D - cd, cz), (cx1, D - cd, cz), (cx1, D - cd, iz), (cx0, D - cd, iz)], (cx1 - cx0, cz - iz), 0),
        "skirting-back-left": ([(0, D - sd, sh), (cx0, D - sd, sh), (cx0, D - sd, 0), (0, D - sd, 0)], (cx0, sh), 0),
        "skirting-back-right": ([(cx1, D - sd, sh), (W, D - sd, sh), (W, D - sd, 0), (cx1, D - sd, 0)], (W - cx1, sh), 0),
        "skirting-left": ([(sd, D, sh), (sd, near, sh), (sd, near, 0), (sd, D, 0)], (D - near, sh), 0),
        "skirting-right": ([(W - sd, near, sh), (W - sd, D, sh), (W - sd, D, 0), (W - sd, near, 0)], (D - near, sh), 0),
        "floor": ([(0, D, 0), (W, D, 0), (W, near, 0), (0, near, 0)], (W, D - near), 0),
    }
    out = {}
    present = {s["id"] for s in SURFACES}
    for sid, (corners, (a, b), rot) in rects.items():
        if sid not in present:
            continue
        world = [[0, 0], [mm(a), 0], [mm(a), mm(b)], [0, mm(b)]]
        image = [project01(scene, p) for p in corners]
        out[sid] = {"worldQuadMm": world, "imageQuad01": image, "uvRotationDeg": rot, "corners3d": corners}
    return out


# --- EXR + post ---------------------------------------------------------------------


def read_exr(path):
    inp = oiio.ImageInput.open(str(path))
    if inp is None:
        raise RuntimeError(f"cannot open {path}: {oiio.geterror()}")
    channels, i = {}, 0
    while inp.seek_subimage(i, 0):
        spec_ = inp.spec()
        px = np.array(inp.read_image(format=oiio.FLOAT)).reshape(spec_.height, spec_.width, -1)
        for c, n in enumerate(spec_.channelnames):
            channels[n.split(".", 1)[1] if n.startswith("ViewLayer.") else n] = px[:, :, c]
        i += 1
    inp.close()
    return channels


def rgb(ch, name):
    return np.stack([ch[f"{name}.R"], ch[f"{name}.G"], ch[f"{name}.B"]], axis=-1)


def luminance(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def dilate(values, valid, steps):
    """Grow `values` (H,W[,C]) from `valid` pixels outwards by `steps` pixels."""
    v = np.where(valid[..., None] if values.ndim == 3 else valid, values, 0).astype(np.float64)
    ok = valid.astype(np.float64)
    for _ in range(steps):
        pad_v = np.pad(v * (ok[..., None] if v.ndim == 3 else ok), [(1, 1), (1, 1)] + ([(0, 0)] if v.ndim == 3 else []))
        pad_o = np.pad(ok, 1)
        acc = sum(pad_v[1 + dy : pad_v.shape[0] - 1 + dy, 1 + dx : pad_v.shape[1] - 1 + dx]
                  for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        cnt = sum(pad_o[1 + dy : pad_o.shape[0] - 1 + dy, 1 + dx : pad_o.shape[1] - 1 + dx]
                  for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        grow = (ok == 0) & (cnt > 0)
        fill = acc / np.maximum(cnt, 1)[..., None] if v.ndim == 3 else acc / np.maximum(cnt, 1)
        v = np.where(grow[..., None] if v.ndim == 3 else grow, fill, v)
        ok = np.where(grow, 1.0, ok)
    return v


def quantise_partition(cov):
    """cov (S,H,W) floats with sum <= 1 -> uint8 with per-pixel sum <= 255."""
    scaled = cov * 255.0
    q = np.floor(scaled + 1e-6)
    total = np.minimum(np.round(scaled.sum(axis=0)), 255)
    extra = (total - q.sum(axis=0)).astype(np.int32)
    order = np.argsort(-(scaled - q), axis=0)
    rank = np.empty_like(order)
    np.put_along_axis(rank, order, np.arange(cov.shape[0])[:, None, None].repeat(cov.shape[1], 1).repeat(cov.shape[2], 2), axis=0)
    q = q + (rank < extra[None]).astype(q.dtype)
    return np.clip(q, 0, 255).astype(np.uint8)


def bounds_of(mask):
    ys, xs = np.nonzero(mask)
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]


def crop_box(mask, pad, H, W):
    x0, y0, w, h = bounds_of(mask)
    return max(0, y0 - pad), min(H, y0 + h + pad), max(0, x0 - pad), min(W, x0 + w + pad)


def post(scene, cam, manifest):
    LAYERS.mkdir(parents=True, exist_ok=True)
    light = read_exr(OUT / "light.exr")
    gloss = read_exr(OUT / "gloss.exr")
    dim = read_exr(OUT / "light-dim.exr")
    H, W = light["Combined.R"].shape
    ids = [s["id"] for s in SURFACES]
    # Non-default models share the default model's encodings (see module doc).
    ref = json.loads(REFERENCE.read_text()) if MODEL != ROOM.DEFAULT_MODEL else None
    ref_refl = {s["id"]: s["reflectionScale"] for s in ref["surfaces"]} if ref else {}
    cov = np.stack([np.clip(light[f"{spec.aov_name(i)}.X"], 0, 1) for i in ids])
    total = cov.sum(axis=0)
    stats = {"coverageSumMax": float(total.max())}
    cov = cov / np.maximum(total, 1.0)[None]
    total = cov.sum(axis=0)
    masks = quantise_partition(cov)
    hidden = [sid for k, sid in enumerate(ids) if int(masks[k].astype(np.int64).sum()) < 255 * 50]
    stats["hiddenSurfaces"] = hidden
    stats["maskSumMax"] = int(masks.astype(np.int32).sum(axis=0).max())
    protected = np.clip(light[f"{spec.PROTECTED_AOV}.X"], 0, 1)
    write_png(LAYERS / "protected-mask.png", np.round(protected * 255).astype(np.uint8))

    neutral_rgb = rgb(light, "Combined")
    light_rgb = neutral_rgb / NEUTRAL_ALBEDO
    gloss_rgb = np.maximum(rgb(gloss, "Combined"), 0)
    lum = luminance(light_rgb)
    surfaces = {}
    for k, sid in enumerate(ids):
        if sid in hidden:
            continue
        interior = cov[k] >= 0.995
        if interior.sum() <= 32:
            interior = masks[k] > 200
        surfaces[sid] = {"k": k, "mask": masks[k], "interior": interior}
    l_scale = float(np.quantile(np.concatenate([lum[s_["interior"]] for s_ in surfaces.values()]), 0.9995)) * 1.02
    if ref:
        stats["ownLightScale"] = l_scale
        l_scale = ref["lightScale"]
    chroma, contribution = {}, np.zeros_like(neutral_rgb)
    for sid, sfc in surfaces.items():
        k, interior = sfc["k"], sfc["interior"]
        y0, y1, x0, x1 = crop_box(sfc["mask"] > 0, 10, H, W)
        crop_in = interior[y0:y1, x0:x1]
        # Light continues past the surface edge from its own interior, so edge
        # pixels never mix in the neighbouring object's light.
        lit_rgb = dilate(light_rgb[y0:y1, x0:x1], crop_in, 8)
        support = dilate(np.ones((y1 - y0, x1 - x0)), sfc["mask"][y0:y1, x0:x1] > 0, 4) > 0
        c = light_rgb[interior]
        tint = (c / np.maximum(luminance(c), 1e-6)[:, None]).mean(axis=0)
        ratio = c / np.maximum(luminance(c), 1e-6)[:, None]
        chroma[sid] = {"tint": tint.round(4).tolist(), "p95AbsDev": float(np.quantile(np.abs(ratio - tint), 0.95))}
        plate = np.zeros((H, W), np.uint8)
        plate[y0:y1, x0:x1] = to_byte(np.clip(luminance(lit_rgb) / l_scale, 0, 1)) * support
        write_png(LAYERS / f"{sid}-light.png", plate)
        refl = dilate(gloss_rgb[y0:y1, x0:x1], crop_in, 8)
        r_scale = float(max(refl[support].max() if support.any() else 0.0, 1e-4))
        if ref and role_of(sid) in ("floor", "skirting") and sid in ref_refl:
            r_scale = ref_refl[sid]
        rplate = np.zeros((H, W, 3), np.uint8)
        rplate[y0:y1, x0:x1] = to_byte(np.clip(refl / r_scale, 0, 1)) * support[..., None]
        write_png(LAYERS / f"{sid}-reflection.png", rplate)
        write_png(LAYERS / f"{sid}-mask.png", sfc["mask"])
        contribution[y0:y1, x0:x1] += cov[k][y0:y1, x0:x1, None] * NEUTRAL_ALBEDO * lit_rgb
        sfc.update({"bounds": bounds_of(sfc["mask"]), "reflectionScale": r_scale, "tint": tint.round(5).tolist()})

    # Base: the light pass with the neutral editable surfaces subtracted, so
    # partially covered edge pixels hold only the furniture/wall share. Fully
    # editable pixels keep the neutral render (shown by compare-with-original).
    rest = 1.0 - total
    edge = (rest > 0.02) & (total > 0)
    # At edges the two light passes isolate the editable share:
    # C(a) = backdrop(a) + a * E. The backdrop itself also changes with the
    # floor albedo (less bounce onto furniture in the dim pass), so that change
    # is taken from neighbouring non-editable pixels and removed first;
    # otherwise furniture edges get a dark outline.
    diff = neutral_rgb - rgb(dim, "Combined")
    y0, y1, x0, x1 = crop_box(edge, 6, H, W)
    bounce = np.zeros_like(diff)
    bounce[y0:y1, x0:x1] = dilate(diff[y0:y1, x0:x1], (total < 1e-4)[y0:y1, x0:x1], 4)
    exact = (diff - rest[..., None] * bounce) / (NEUTRAL_ALBEDO - DIM_ALBEDO) * NEUTRAL_ALBEDO
    contribution = np.where(edge[..., None], np.maximum(exact, 0), contribution)
    with np.errstate(invalid="ignore", divide="ignore"):
        backdrop = (neutral_rgb - contribution) / rest[..., None]
    stats["backdropNegativeEdgePixels"] = int((backdrop[edge] < -0.01).any(axis=-1).sum())
    stats["edgePixels"] = int(edge.sum())
    # Clamping a negative backdrop changes the pixel by at most rest * |backdrop|.
    clamp_err = (np.maximum(-backdrop, 0) * rest[..., None])[edge]
    stats["backdropClampMaxLinear"] = float(clamp_err.max()) if clamp_err.size else 0.0
    if "--debug" in argv():
        err_full = np.where(edge, (np.maximum(-backdrop, 0) * rest[..., None]).max(axis=-1), 0)
        order = np.argsort(err_full.ravel())[::-1][:12]
        for i in order:
            yy, xx = divmod(int(i), W)
            print("clamp", xx, yy, round(float(err_full[yy, xx]), 3), "rest", round(float(rest[yy, xx]), 3),
                  "cov", {ids[k]: round(float(cov[k, yy, xx]), 2) for k in range(len(ids)) if cov[k, yy, xx] > 0.01},
                  "C", neutral_rgb[yy, xx].round(3).tolist())
    stats["backdropClampP99Linear"] = float(np.quantile(clamp_err.max(axis=-1), 0.99)) if clamp_err.size else 0.0
    base_lin = np.where(edge[..., None], np.maximum(backdrop, 0), neutral_rgb)
    write_png(LAYERS / "base.png", to_byte(tone(base_lin)))
    write_png(LAYERS / "neutral.png", to_byte(tone(neutral_rgb)))

    # Floor world positions: exact plane intersection, checked against Cycles.
    # Rooms with a fixed floor (bathroom tiles) have none.
    position = None
    if "floor" in surfaces:
        fb = surfaces["floor"]["bounds"]
        x0, y0, w, h = fb
        step = POSITION_STEP_PX
        D = ROOM.ROOM["depth"]
        origin = [-300.0, -300.0]
        # Samples sit on every step-th pixel centre; one extra row/column covers the edge.
        gw, gh = (w - 1) // step + 2, (h - 1) // step + 2
        sx = x0 + np.arange(gw) * step
        sy = y0 + np.arange(gh) * step
        u = (sx + 0.5) / cam["W"]
        v = (sy + 0.5) / cam["H"]
        uu, vv = np.meshgrid(u, v)
        d = cam["tl"][None, None, :] + uu[..., None] * cam["right"] + vv[..., None] * cam["down"]
        with np.errstate(divide="ignore", invalid="ignore"):
            t = -cam["origin"][2] / d[..., 2]
        t = np.where(t > 0, t, np.nan)
        gX = (cam["origin"][0] + t * d[..., 0]) * 1000.0
        gY = (D - (cam["origin"][1] + t * d[..., 1])) * 1000.0
        qx = np.clip(np.round((np.nan_to_num(gX, nan=origin[0]) - origin[0]) / POSITION_UNIT_MM), 0, 65535).astype(np.uint16)
        qy = np.clip(np.round((np.nan_to_num(gY, nan=origin[1]) - origin[1]) / POSITION_UNIT_MM), 0, 65535).astype(np.uint16)
        write_png(LAYERS / "floor-position.png", np.stack([qx, qy], axis=-1))
        # Reconstruct exactly as the runtime kernel does and compare with the exact plane.
        X, Y = floor_positions(cam, fb)
        Xmm, Ymm = X * 1000.0, (D - Y) * 1000.0
        py_, px_ = np.mgrid[0:h, 0:w]
        mx, my = px_ / step, py_ / step
        ix = np.minimum(np.floor(mx).astype(int), gw - 2)
        iy = np.minimum(np.floor(my).astype(int), gh - 2)
        fx, fy = mx - ix, my - iy

        def bilinear(q):
            q = q.astype(np.float64) * POSITION_UNIT_MM
            return (q[iy, ix] * (1 - fx) + q[iy, ix + 1] * fx) * (1 - fy) + (q[iy + 1, ix] * (1 - fx) + q[iy + 1, ix + 1] * fx) * fy

        rx, ry = bilinear(qx) + origin[0], bilinear(qy) + origin[1]
        floor_in = surfaces["floor"]["interior"][y0 : y0 + h, x0 : x0 + w]
        recon = np.hypot(rx - Xmm, ry - Ymm)[floor_in]
        px, py = light["Position.X"][y0 : y0 + h, x0 : x0 + w], light["Position.Y"][y0 : y0 + h, x0 : x0 + w]
        err = np.hypot(px - X, py - Y)[floor_in] * 1000
        in_range = (Xmm[floor_in].min() > origin[0]) and (Ymm[floor_in].max() < origin[1] + 65535 * POSITION_UNIT_MM)
        position = {
            "boundsPx": fb,
            "originMm": origin,
            "unitMm": POSITION_UNIT_MM,
            "stepPx": step,
            "samples": [int(gw), int(gh)],
            "reconstructionMaxErrorMm": float(recon.max()),
            "reconstructionP99ErrorMm": float(np.quantile(recon, 0.99)),
            "cyclesPositionPassMedianDiffMm": float(np.median(err)),
            "cyclesPositionPassP99DiffMm": float(np.quantile(err, 0.99)),
            "floorWithinEncodedRange": bool(in_range),
            "visibleFloorXmm": [float(Xmm[floor_in].min()), float(Xmm[floor_in].max())],
            "visibleFloorYmm": [float(Ymm[floor_in].min()), float(Ymm[floor_in].max())],
        }

    stats["lightScale"] = l_scale
    stats["lightChroma"] = chroma

    mappings = planar_mappings(scene)
    layers = {
        "scene": ROOM.SCENE_ID,
        "model": MODEL,
        "defaultModel": ROOM.DEFAULT_MODEL,
        "models": spec.models_for(ROOM),
        "border": manifest.get("borderPx"),
        "width": W,
        "height": H,
        "toneShoulder": TONE_SHOULDER,
        "lightScale": l_scale,
        "surfaces": [
            {
                "id": sid,
                "role": role_of(sid),
                "boundsPx": surfaces[sid]["bounds"],
                "reflectionScale": surfaces[sid]["reflectionScale"],
                "tint": surfaces[sid]["tint"],
                "mapping": {k: v for k, v in mappings[sid].items() if k != "corners3d"},
                "corners3d": mappings[sid]["corners3d"],
            }
            for sid in ids
            if sid not in hidden
        ],
        "protectedBoundsPx": bounds_of(protected > 0.5 / 255) if (protected > 0.5 / 255).any() else [0, 0, W, H],
        "floorPosition": position,
        "door": {"depictedSizeMm": [round(ROOM.DOOR["leaf_width"] * 1000), round(ROOM.DOOR["leaf_height"] * 1000)]},
    }
    (LAYERS / "layers.json").write_text(json.dumps(layers, indent=2) + "\n")
    manifest["checks"] = stats
    manifest["floorPosition"] = position
    (LAYERS / "render-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"checks": stats, "floorPosition": position}, indent=2))


def main():
    bpy.ops.wm.open_mainfile(filepath=str(OUT / "room.blend"))
    scene = bpy.context.scene
    samples = int(opt("--samples", 512))
    scale = int(opt("--scale", 100))
    devices = configure(scene, samples, scale)
    border = None
    if "--crop" in argv():
        if MODEL == ROOM.DEFAULT_MODEL:
            raise SystemExit("--crop needs the default model's layers; render the default model in full")
        border = crop_border(scene)
    cam = camera_info(scene)
    manifest_path = OUT / "render-manifest.partial.json"
    if "--post-only" in argv():
        manifest = json.loads(manifest_path.read_text())
    else:
        times = {}
        for name in ("light", "light-dim", "gloss"):
            times[name] = round(render_pass(scene, name), 1)
            print(f"{name}: {times[name]} s")
        manifest = {
            "scene": ROOM.SCENE_ID,
            "doorModel": MODEL,
            "blender": bpy.app.version_string,
            "blenderBuild": bpy.app.build_hash.decode() if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
            "engine": "CYCLES",
            "devices": devices,
            "samples": samples,
            "seed": SEED,
            "adaptiveSampling": False,
            "denoiser": "OPENIMAGEDENOISE (albedo+normal, accurate prefilter)",
            "resolution": [cam["W"], cam["H"]],
            "borderPx": border,
            "renderSeconds": times,
            "passes": {
                "light": f"editable = {NEUTRAL_ALBEDO} grey Lambertian; plate = Combined / {NEUTRAL_ALBEDO}",
                "light-dim": f"editable = {DIM_ALBEDO} grey; (light - light-dim) isolates editable light at edges",
                "gloss": f"editable = black dielectric IOR 1.5, GGX roughness {GLOSS_ROUGHNESS}",
                "base": "light Combined minus coverage x 0.5 x dilated surface light, unpremultiplied at edges",
            },
            "camera": {k: cam[k] for k in ("matrix_world", "lens_mm", "sensor_mm", "shift")},
            "hdri": ROOM.HDRI,
            "corridor": ROOM.CORRIDOR,
            "fill": ROOM.FILL,
            "filmExposure": ROOM.EXPOSURE,
            "viewTransform": "Standard (linear EXR); tone shoulder applied in post and at runtime",
            "toneShoulder": TONE_SHOULDER,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    post(scene, cam, manifest)


if __name__ == "__main__":
    main()
