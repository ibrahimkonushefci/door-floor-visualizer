"""Build a Studio room (tools/blender/rooms/<id>.py) as a .blend.

    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python tools/blender/build_room.py -- --room living-render-01 [--model flat] \
        [--preview out.png] [--samples 32] [--scale 25]

Requires the CC0 inputs from tools/blender/fetch_assets.py. Writes
tools/blender/out/<room>/<model>/room.blend (door models: room_spec.DOOR_MODELS).
The shell, window, door assembly, skirting, lights and camera are shared; each
room module adds its furniture in `furnish(kit, ctx)`. Editable surfaces carry
a custom property `studio_surface` (surface id); door hardware carries
`studio_protected`. render_layers.py swaps their materials per pass.
"""
import math
import sys
from pathlib import Path
from types import SimpleNamespace

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import kit as k  # noqa: E402
import room_spec as spec  # noqa: E402


def argv():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def opt(name, default=None):
    a = argv()
    return a[a.index(name) + 1] if name in a else default


ROOM = spec.load(opt("--room", spec.ROOMS[0]))
MODEL = opt("--model", ROOM.DEFAULT_MODEL)
if MODEL not in spec.DOOR_MODELS:
    raise SystemExit(f"Unknown door model {MODEL}")
OUT = HERE / "out" / ROOM.SCENE_ID / MODEL


def side_wall(name, side, W, T, D, H, window, shell):
    """Left (x = 0) or right (x = W) wall, split around a window if it has one."""
    wt = window["wall"] if window else T

    def bx(n, a0, a1, y0, y1, z0, z1):
        # a0..a1 measured outwards from the room face of this wall
        x0, x1 = (-a1, -a0) if side == "left" else (W + a0, W + a1)
        return k.box(n, x0, x1, y0, y1, z0, z1, shell)

    if not window:
        return [bx(name, 0, wt, -T, D + T, 0, H)]
    wn = window
    return [
        bx(f"{name}-a", 0, wt, -T, wn["y0"], 0, H),
        bx(f"{name}-b", 0, wt, wn["y1"], D + T, 0, H),
        bx(f"{name}-low", 0, wt, wn["y0"], wn["y1"], 0, wn["z0"]),
        bx(f"{name}-high", 0, wt, wn["y0"], wn["y1"], wn["z1"], H),
    ]


def build_window(wn, W, shell, white_frame, sill_mat):
    """Frame set in the middle of the reveal, sill on the room side."""
    side = wn["side"]

    def bx(n, a0, a1, y0, y1, z0, z1):
        # a: distance into the room (negative = into the wall) from the wall face
        x0, x1 = (a0, a1) if side == "left" else (W - a1, W - a0)
        return k.box(n, x0, x1, y0, y1, z0, z1, shell)

    f, fx0, fx1 = wn["frame"], -0.19, -0.12
    mids = wn.get("mullions", 1)
    parts = [
        bx("wf-bottom", fx0, fx1, wn["y0"], wn["y1"], wn["z0"], wn["z0"] + f),
        bx("wf-top", fx0, fx1, wn["y0"], wn["y1"], wn["z1"] - f, wn["z1"]),
        bx("wf-a", fx0, fx1, wn["y0"], wn["y0"] + f, wn["z0"], wn["z1"]),
        bx("wf-b", fx0, fx1, wn["y1"] - f, wn["y1"], wn["z0"], wn["z1"]),
    ]
    for i in range(1, mids + 1):
        ym = wn["y0"] + (wn["y1"] - wn["y0"]) * i / (mids + 1)
        parts.append(bx("wf-mid" if mids == 1 else f"wf-mid-{i}", fx0, fx1, ym - f / 2, ym + f / 2, wn["z0"], wn["z1"]))
    frame = k.join("window-frame", parts)
    k.assign(frame, white_frame)
    k.bevel(frame, 0.004)
    glass = bx("window-glass", -0.158, -0.152, wn["y0"] + f, wn["y1"] - f, wn["z0"] + f, wn["z1"] - f)
    k.assign(glass, wn.get("glass") or k.window_glass())
    sill = bx("window-sill", -wn["wall"] + 0.02, 0.035, wn["y0"] - 0.03, wn["y1"] + 0.03, wn["z0"] - 0.025, wn["z0"])
    k.assign(sill, sill_mat)
    k.bevel(sill, 0.003)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    R = ROOM.ROOM
    W, D, H, T = R["width"], R["depth"], R["height"], R["wall"]
    shell = k.collection("shell")
    door_col = k.collection("door")
    trim_col = k.collection("trim")
    furniture = k.collection("furniture")

    wall_mat = k.principled("wall-plaster", ROOM.WALL["color"], roughness=ROOM.WALL.get("roughness", 0.92), specular=0.3)
    ceiling_mat = k.principled("ceiling", (0.90, 0.895, 0.885), roughness=0.95, specular=0.2)
    white_frame = k.principled("window-frame", (0.88, 0.88, 0.87), roughness=0.35)
    sill_mat = k.principled("sill-stone", (0.82, 0.81, 0.79), roughness=0.25)
    neutral = k.principled("editable-neutral", (0.5, 0.5, 0.5), roughness=0.9, specular=0.0)
    steel = k.principled("handle-steel", (0.62, 0.62, 0.62), roughness=0.28, metallic=1.0)
    hinge_mat = k.principled("hinge-steel", (0.55, 0.55, 0.55), roughness=0.35, metallic=1.0)
    for m in (steel, hinge_mat):
        m["studio_protected"] = True

    g = spec.door_geometry(ROOM, MODEL)
    model = spec.DOOR_MODELS[MODEL]
    ctx = SimpleNamespace(room=ROOM, model=MODEL, W=W, D=D, H=H, T=T, g=g, scene=scene,
                          cols={"shell": shell, "door": door_col, "trim": trim_col, "furniture": furniture},
                          mats={"wall": wall_mat, "ceiling": ceiling_mat, "window-frame": white_frame, "sill": sill_mat,
                                "neutral": neutral})

    # Floor runs into the door opening so the 8 mm gap under the leaf shows floor.
    floor = k.mesh_object("floor", [(0, 0, 0), (W, 0, 0), (W, D + T, 0), (0, D + T, 0)], [(0, 1, 2, 3)], shell)
    if ROOM.EDITABLE_FLOOR:
        floor["studio_surface"] = "floor"
        k.assign(floor, neutral)
    else:
        k.assign(floor, ROOM.floor_material(k, ctx))

    ox0, ox1, oh = g["opening"]
    wn = ROOM.WINDOW
    walls = [
        k.box("wall-back-l", -T, ox0, D, D + T, 0, H, shell),
        k.box("wall-back-r", ox1, W + T, D, D + T, 0, H, shell),
        k.box("wall-back-top", ox0, ox1, D, D + T, oh, H, shell),
        *side_wall("wall-right", "right", W, T, D, H, wn if wn and wn["side"] == "right" else None, shell),
        k.box("wall-front", -T, W + T, -T, 0, 0, H, shell),
        *side_wall("wall-left", "left", W, T, D, H, wn if wn and wn["side"] == "left" else None, shell),
    ]
    ctx.walls = {w.name: w for w in walls}
    for w in walls:
        k.assign(w, wall_mat)
    ceiling = k.box("ceiling", -T, W + T, -T, D + T, H, H + 0.12, shell)
    k.assign(ceiling, ceiling_mat)
    if wn:
        build_window(wn, W, shell, white_frame, sill_mat)

    # --- door assembly -----------------------------------------------------
    d = ROOM.DOOR
    lx0, lx1, lz0, lz1 = g["leaf"]
    ix0, ix1, iz = g["casing_inner"]
    cx0, cx1, cz = g["casing_outer"]
    cd = spec.CASING["depth"]
    lt = d["leaf_thickness"]
    leaf_parts = []
    if "grooves" in model:
        # Milled grooves: a recessed back slab shows between front slabs.
        gr = model["grooves"]
        gd, gw, n = gr["depth"], gr["width"], gr["count"]
        leaf_parts.append(k.box("leaf-back", lx0, lx1, D + gd, D + lt, lz0, lz1, door_col))
        edges = [lz0] + [z for i in range(1, n + 1) for z in (lz0 + (lz1 - lz0) * i / (n + 1) - gw / 2,
                                                             lz0 + (lz1 - lz0) * i / (n + 1) + gw / 2)] + [lz1]
        for i in range(0, len(edges), 2):
            leaf_parts.append(k.box(f"leaf-front-{i}", lx0, lx1, D, D + gd, edges[i], edges[i + 1], door_col))
    elif "glass" in model:
        # Centred satin-glass strip, glazed in the middle of the leaf thickness.
        gl = model["glass"]
        cxm = (lx0 + lx1) / 2
        gx0, gx1, gz0, gz1 = cxm - gl["width"] / 2, cxm + gl["width"] / 2, gl["z0"], gl["z1"]
        # One solid leaf with the opening cut out: joined part boxes would leave
        # internal faces whose bevels read as seams above and below the glass.
        solid = k.box("leaf", lx0, lx1, D, D + lt, lz0, lz1, door_col)
        cutter = k.box("leaf-cutter", gx0, gx1, D - 0.01, D + lt + 0.01, gz0, gz1, door_col)
        cut = solid.modifiers.new("opening", "BOOLEAN")
        cut.operation = "DIFFERENCE"
        cut.solver = "EXACT"
        cut.object = cutter
        with bpy.context.temp_override(object=solid, active_object=solid):
            bpy.ops.object.modifier_apply(modifier=cut.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
        leaf_parts.append(solid)
        pane = k.box("door-glass", gx0, gx1, D + lt / 2 - 0.004, D + lt / 2 + 0.004, gz0, gz1, door_col)
        k.assign(pane, k.satin_glass())
    else:
        leaf_parts.append(k.box("leaf", lx0, lx1, D, D + lt, lz0, lz1, door_col))
    leaf = k.join("leaf", leaf_parts) if len(leaf_parts) > 1 else leaf_parts[0]
    leaf["studio_surface"] = "leaf"
    k.assign(leaf, neutral)
    k.bevel(leaf, 0.0015 if "grooves" not in model else 0.001)
    gap = d["leaf_gap"]

    if model["casing"]:
        jamb_l = k.box("jamb-left", ox0, lx0 - gap, D, D + T, 0, oh, door_col)
        jamb_r = k.box("jamb-right", lx1 + gap, ox1, D, D + T, 0, oh, door_col)
        jamb_t = k.box("jamb-top", ox0, ox1, D, D + T, lz1 + gap, oh, door_col)
        cas_l = k.prism("casing-left", [(cx0, 0), (ix0, 0), (ix0, iz), (cx0, cz)], k.xz, D - cd, D, door_col)
        cas_r = k.prism("casing-right", [(ix1, 0), (cx1, 0), (cx1, cz), (ix1, iz)], k.xz, D - cd, D, door_col)
        cas_t = k.prism("casing-top", [(ix0, iz), (ix1, iz), (cx1, cz), (cx0, cz)], k.xz, D - cd, D, door_col)
        for name, pieces in (("frame-left", [cas_l, jamb_l]), ("frame-right", [cas_r, jamb_r]), ("frame-top", [cas_t, jamb_t])):
            ob = k.join(name, pieces)
            ob["studio_surface"] = name
            k.assign(ob, neutral)
            k.bevel(ob, 0.0015)
    else:
        # Concealed aluminium frame: only its dark edge shows inside the shadow gap.
        fg = model["gap"]
        alu = k.principled("concealed-frame", (0.06, 0.06, 0.065), roughness=0.5, metallic=0.6)
        liner = k.join("concealed-frame", [
            k.box("cf-l", lx0 - fg, lx0, D + 0.010, D + T, 0, lz1 + fg, door_col),
            k.box("cf-r", lx1, lx1 + fg, D + 0.010, D + T, 0, lz1 + fg, door_col),
            k.box("cf-t", lx0, lx1, D + 0.010, D + T, lz1, lz1 + fg, door_col),
        ])
        k.assign(liner, alu)

    # Lever handle and key rosette on the side away from the hinges.
    hx = lx1 - 0.065 if d["hinge_side"] == "left" else lx0 + 0.065
    hz = d["handle_height"]
    lever_dir = -1 if d["hinge_side"] == "left" else 1
    hw = []
    hw.append(k.cylinder("rosette", 0.026, 0.009, (hx, D - 0.0045, hz), (math.pi / 2, 0, 0), door_col))
    hw.append(k.cylinder("neck", 0.009, 0.055, (hx, D - 0.032, hz), (math.pi / 2, 0, 0), door_col, 24))
    hw.append(k.cylinder("lever", 0.0095, 0.135, (hx + lever_dir * 0.062, D - 0.058, hz), (0, math.pi / 2, 0), door_col, 24))
    hw.append(k.cylinder("key-rosette", 0.024, 0.008, (hx, D - 0.004, hz - 0.075), (math.pi / 2, 0, 0), door_col))
    handle = k.join("handle", hw)
    handle["studio_protected"] = True
    k.assign(handle, steel)
    k.bevel(handle, 0.0012)
    if model["casing"]:
        hinge_x = lx0 - gap / 2 if d["hinge_side"] == "left" else lx1 + gap / 2
        hinges = [k.cylinder(f"hinge-{i}", 0.0075, 0.11, (hinge_x, D - 0.004, z), (0, 0, 0), door_col, 24)
                  for i, z in enumerate((0.25, 1.05, 1.80))]
        hinge = k.join("hinges", hinges)
        hinge["studio_protected"] = True
        k.assign(hinge, hinge_mat)

    # Short lit corridor behind the door (seen only through a glass insert).
    co = ROOM.CORRIDOR
    cxm = (lx0 + lx1) / 2
    y0c, y1c = D + T, D + T + co["depth"]
    xa, xb = cxm - co["half_width"], cxm + co["half_width"]
    corridor = [
        k.box("corr-floor", xa, xb, y0c, y1c, -0.02, 0, shell),
        k.box("corr-ceiling", xa, xb, y0c, y1c, H, H + 0.02, shell),
        k.box("corr-back", xa, xb, y1c, y1c + 0.02, 0, H, shell),
        k.box("corr-left", xa - 0.02, xa, y0c, y1c, 0, H, shell),
        k.box("corr-right", xb, xb + 0.02, y0c, y1c, 0, H, shell),
    ]
    for c_ in corridor:
        k.assign(c_, wall_mat)
    clight = bpy.data.lights.new("corridor-light", "AREA")
    clight.size = 0.6
    clight.energy = co["light"]
    clight.color = (1.0, 0.95, 0.88)
    cl_ob = bpy.data.objects.new("corridor-light", clight)
    cl_ob.location = (cxm, (y0c + y1c) / 2, H - 0.03)
    scene.collection.objects.link(cl_ob)

    # --- skirting (mitred at room corners, butting into the casing) ---------
    if ROOM.SKIRTING_WALLS:
        sd, sh = spec.SKIRTING["depth"], spec.SKIRTING["height"]
        skirt = {
            "skirting-left": [(0, 0), (sd, 0), (sd, D - sd), (0, D)],
            "skirting-back-left": [(0, D), (sd, D - sd), (cx0, D - sd), (cx0, D)],
            "skirting-back-right": [(cx1, D), (cx1, D - sd), (W - sd, D - sd), (W, D)],
            "skirting-right": [(W - sd, 0), (W, 0), (W, D), (W - sd, D - sd)],
        }
        for name, pts in skirt.items():
            ob = k.prism(name, pts, k.xy, 0, sh, trim_col)
            ob["studio_surface"] = name
            k.assign(ob, neutral)
            k.bevel(ob, 0.0015)
        front_skirt = k.prism("skirting-front", [(0, 0), (W, 0), (W - sd, sd), (sd, sd)], k.xy, 0, sh, trim_col)
        k.assign(front_skirt, wall_mat)

    # --- furniture ------------------------------------------------------------
    ROOM.furnish(k, ctx)

    # --- world and lights ---------------------------------------------------
    world = bpy.data.worlds.new("world")
    scene.world = world
    nt = world.node_tree
    bg = nt.nodes["Background"]
    if ROOM.HDRI:
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(next((k.CACHE / ROOM.HDRI["id"]).glob("*.hdr"))))
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value = (0, 0, math.radians(ROOM.HDRI["rotation_deg"]))
        nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs[0], env.inputs["Vector"])
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = ROOM.HDRI["strength"]
    else:
        bg.inputs["Color"].default_value = (0, 0, 0, 1)
        bg.inputs["Strength"].default_value = 0.0

    if ROOM.FILL:
        fsize = ROOM.FILL.get("size", (3.0, 4.0))
        fill = bpy.data.lights.new("fill", "AREA")
        fill.shape = "RECTANGLE"
        fill.size, fill.size_y = fsize
        fill.energy = ROOM.FILL["energy"]
        fill.color = ROOM.FILL.get("color", (1.0, 0.96, 0.9))
        fill_ob = bpy.data.objects.new("fill", fill)
        fill_ob.location = ROOM.FILL.get("location", (W / 2, D / 2, H - 0.02))
        fill_ob.visible_camera = False
        fill_ob.visible_glossy = False
        scene.collection.objects.link(fill_ob)

    # --- camera ---------------------------------------------------------------
    c = ROOM.CAMERA
    cam = bpy.data.cameras.new("camera")
    cam.lens = c["lens_mm"]
    cam.sensor_width = c["sensor_mm"]
    cam.sensor_fit = "HORIZONTAL"
    cam.shift_x = c.get("shift_x", 0.0)
    cam.shift_y = c["shift_y"]
    cam_ob = bpy.data.objects.new("camera", cam)
    scene.collection.objects.link(cam_ob)
    cam_ob.location = c["location"]
    direction = Vector(c["target"]) - Vector(c["location"])
    cam_ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_ob

    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = c["resolution"]
    r.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.cycles.film_exposure = ROOM.EXPOSURE
    scene.cycles.max_bounces = 12
    scene.cycles.diffuse_bounces = 6
    scene.cycles.glossy_bounces = 4
    scene.cycles.transparent_max_bounces = 16
    scene.cycles.sample_clamp_indirect = 8.0
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "room.blend"), compress=True)
    return scene


def use_metal(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for dev in prefs.devices:
        dev.use = dev.type == "METAL"
    scene.cycles.device = "GPU"


def preview(scene, path, samples, scale):
    use_metal(scene)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = scale
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    s = build()
    out = opt("--preview")
    if out:
        preview(s, out, int(opt("--samples", 32)), int(opt("--scale", 25)))
