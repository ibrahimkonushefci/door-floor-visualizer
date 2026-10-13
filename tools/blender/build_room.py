"""Build the living-render-01 proof room as a .blend.

    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python tools/blender/build_room.py -- [--preview out.png] [--samples 32] [--scale 25]

Requires the CC0 inputs from tools/blender/fetch_assets.py. Writes
tools/blender/out/<scene>/room.blend. Editable surfaces carry a custom property
`studio_surface` (surface id); door hardware carries `studio_protected`.
render_layers.py swaps their materials per pass.
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import room_spec as spec  # noqa: E402

CACHE = HERE / ".cache" / "polyhaven"
OUT = HERE / "out" / spec.SCENE_ID


def argv():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def opt(name, default=None):
    a = argv()
    return a[a.index(name) + 1] if name in a else default


# --- geometry helpers -------------------------------------------------------


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def mesh_object(name, verts, faces, col):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


def box(name, x0, x1, y0, y1, z0, z1, col):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_object(name, v, f, col)


def prism(name, pts, to3d, t0, t1, col):
    n = len(pts)
    v = [to3d(a, b, t0) for a, b in pts] + [to3d(a, b, t1) for a, b in pts]
    f = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    f += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return mesh_object(name, v, f, col)


def join(name, objects):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    objects[0].data.name = name
    return objects[0]


def bevel(ob, width, segments=2):
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.harden_normals = False
    return m


def cylinder(name, radius, depth, location, rotation, col, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    ob = bpy.context.object
    ob.name = name
    for c in ob.users_collection:
        c.objects.unlink(ob)
    col.objects.link(ob)
    bpy.ops.object.shade_smooth()
    return ob


# --- materials --------------------------------------------------------------


def principled(name, color, roughness=0.5, metallic=0.0, specular=0.5):
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Specular IOR Level"].default_value = specular
    return m


def window_glass():
    """Mostly transparent with a faint camera reflection; shadow rays pass."""
    m = bpy.data.materials.new("window-glass")
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    glossy = nt.nodes.new("ShaderNodeBsdfGlossy")
    glossy.inputs["Roughness"].default_value = 0.02
    path = nt.nodes.new("ShaderNodeLightPath")
    fresnel = nt.nodes.new("ShaderNodeFresnel")
    fresnel.inputs["IOR"].default_value = 1.5
    mult = nt.nodes.new("ShaderNodeMath")
    mult.operation = "MULTIPLY"
    nt.links.new(fresnel.outputs[0], mult.inputs[0])
    nt.links.new(path.outputs["Is Camera Ray"], mult.inputs[1])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mult.outputs[0], mix.inputs[0])
    nt.links.new(transparent.outputs[0], mix.inputs[1])
    nt.links.new(glossy.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def rug_material():
    tex = CACHE / "wool_boucle"
    m = bpy.data.materials.new("rug-wool-boucle")
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    # Poly Haven lists the real-world tile as 315 x 390 mm.
    mapping.inputs["Scale"].default_value = (1 / 0.315, 1 / 0.390, 1)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def image(file, non_color):
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(tex / file))
        if non_color:
            node.image.colorspace_settings.name = "Non-Color"
        nt.links.new(mapping.outputs[0], node.inputs["Vector"])
        return node

    diffuse = image("wool_boucle_diff_2k.jpg", False)
    # Tint the boucle towards a warm oatmeal so the rug does not compete with floors.
    hsv = nt.nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Saturation"].default_value = 0.25
    hsv.inputs["Value"].default_value = 1.15
    nt.links.new(diffuse.outputs["Color"], hsv.inputs["Color"])
    nt.links.new(hsv.outputs[0], bsdf.inputs["Base Color"])
    rough = image("wool_boucle_rough_2k.jpg", True)
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    normal = image("wool_boucle_nor_gl_2k.jpg", True)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 1.0
    nt.links.new(normal.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs[0], bsdf.inputs["Normal"])
    bsdf.inputs["Sheen Weight"].default_value = 0.4
    return m


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


# --- assets -----------------------------------------------------------------


def append_blend(asset_id, col):
    path = next((CACHE / asset_id).glob("*.blend"))
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = list(src.objects)
    objs = [o for o in dst.objects if o is not None]
    for o in objs:
        col.objects.link(o)
    return objs


def place(objs, location, rot_z_deg, name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    root.location = location
    root.rotation_euler = (0, 0, math.radians(rot_z_deg))
    return root


def import_gltf(asset_id, col):
    path = next((CACHE / asset_id).glob("*.gltf"))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)
    return objs


# --- build ------------------------------------------------------------------


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    R, W, D, H, T = spec.ROOM, spec.ROOM["width"], spec.ROOM["depth"], spec.ROOM["height"], spec.ROOM["wall"]
    shell = collection("shell")
    door_col = collection("door")
    trim_col = collection("trim")
    furniture = collection("furniture")

    wall_mat = principled("wall-plaster", (0.86, 0.845, 0.815), roughness=0.92, specular=0.3)
    ceiling_mat = principled("ceiling", (0.90, 0.895, 0.885), roughness=0.95, specular=0.2)
    white_frame = principled("window-frame", (0.88, 0.88, 0.87), roughness=0.35)
    sill_mat = principled("sill-stone", (0.82, 0.81, 0.79), roughness=0.25)
    neutral = principled("editable-neutral", (0.5, 0.5, 0.5), roughness=0.9, specular=0.0)
    steel = principled("handle-steel", (0.62, 0.62, 0.62), roughness=0.28, metallic=1.0)
    hinge_mat = principled("hinge-steel", (0.55, 0.55, 0.55), roughness=0.35, metallic=1.0)
    for m in (steel, hinge_mat):
        m["studio_protected"] = True

    # Floor runs into the door opening so the 8 mm gap under the leaf shows floor.
    floor = mesh_object("floor", [(0, 0, 0), (W, 0, 0), (W, D + T, 0), (0, D + T, 0)], [(0, 1, 2, 3)], shell)
    floor["studio_surface"] = "floor"
    assign(floor, neutral)

    g = spec.door_geometry()
    ox0, ox1, oh = g["opening"]
    wn = spec.WINDOW
    walls = [
        box("wall-back-l", -T, ox0, D, D + T, 0, H, shell),
        box("wall-back-r", ox1, W + T, D, D + T, 0, H, shell),
        box("wall-back-top", ox0, ox1, D, D + T, oh, H, shell),
        box("wall-right", W, W + T, -T, D + T, 0, H, shell),
        box("wall-front", -T, W + T, -T, 0, 0, H, shell),
        box("wall-left-a", -wn["wall"], 0, -T, wn["y0"], 0, H, shell),
        box("wall-left-b", -wn["wall"], 0, wn["y1"], D + T, 0, H, shell),
        box("wall-left-low", -wn["wall"], 0, wn["y0"], wn["y1"], 0, wn["z0"], shell),
        box("wall-left-high", -wn["wall"], 0, wn["y0"], wn["y1"], wn["z1"], H, shell),
    ]
    for w in walls:
        assign(w, wall_mat)
    ceiling = box("ceiling", -T, W + T, -T, D + T, H, H + 0.12, shell)
    assign(ceiling, ceiling_mat)

    # Window: frame set in the middle of the reveal, sill on the room side.
    f, fx0, fx1 = wn["frame"], -0.19, -0.12
    parts = [
        box("wf-bottom", fx0, fx1, wn["y0"], wn["y1"], wn["z0"], wn["z0"] + f, shell),
        box("wf-top", fx0, fx1, wn["y0"], wn["y1"], wn["z1"] - f, wn["z1"], shell),
        box("wf-a", fx0, fx1, wn["y0"], wn["y0"] + f, wn["z0"], wn["z1"], shell),
        box("wf-b", fx0, fx1, wn["y1"] - f, wn["y1"], wn["z0"], wn["z1"], shell),
        box("wf-mid", fx0, fx1, (wn["y0"] + wn["y1"]) / 2 - f / 2, (wn["y0"] + wn["y1"]) / 2 + f / 2, wn["z0"], wn["z1"], shell),
    ]
    frame = join("window-frame", parts)
    assign(frame, white_frame)
    bevel(frame, 0.004)
    glass = box("window-glass", -0.158, -0.152, wn["y0"] + f, wn["y1"] - f, wn["z0"] + f, wn["z1"] - f, shell)
    assign(glass, window_glass())
    sill = box("window-sill", -wn["wall"] + 0.02, 0.035, wn["y0"] - 0.03, wn["y1"] + 0.03, wn["z0"] - 0.025, wn["z0"], shell)
    assign(sill, sill_mat)
    bevel(sill, 0.003)

    # --- door assembly -----------------------------------------------------
    d = spec.DOOR
    lx0, lx1, lz0, lz1 = g["leaf"]
    ix0, ix1, iz = g["casing_inner"]
    cx0, cx1, cz = g["casing_outer"]
    cd = spec.CASING["depth"]
    leaf = box("leaf", lx0, lx1, D, D + d["leaf_thickness"], lz0, lz1, door_col)
    leaf["studio_surface"] = "leaf"
    assign(leaf, neutral)
    bevel(leaf, 0.0015)
    gap = d["leaf_gap"]

    def xz(a, b, t):
        return (a, t, b)

    jamb_l = box("jamb-left", ox0, lx0 - gap, D, D + T, 0, oh, door_col)
    jamb_r = box("jamb-right", lx1 + gap, ox1, D, D + T, 0, oh, door_col)
    jamb_t = box("jamb-top", ox0, ox1, D, D + T, lz1 + gap, oh, door_col)
    cas_l = prism("casing-left", [(cx0, 0), (ix0, 0), (ix0, iz), (cx0, cz)], xz, D - cd, D, door_col)
    cas_r = prism("casing-right", [(ix1, 0), (cx1, 0), (cx1, cz), (ix1, iz)], xz, D - cd, D, door_col)
    cas_t = prism("casing-top", [(ix0, iz), (ix1, iz), (cx1, cz), (cx0, cz)], xz, D - cd, D, door_col)
    for name, pieces in (("frame-left", [cas_l, jamb_l]), ("frame-right", [cas_r, jamb_r]), ("frame-top", [cas_t, jamb_t])):
        ob = join(name, pieces)
        ob["studio_surface"] = name
        assign(ob, neutral)
        bevel(ob, 0.0015)

    # Lever handle and key rosette on the side away from the hinges.
    hx = lx1 - 0.065 if d["hinge_side"] == "left" else lx0 + 0.065
    hz = d["handle_height"]
    lever_dir = -1 if d["hinge_side"] == "left" else 1
    hw = []
    hw.append(cylinder("rosette", 0.026, 0.009, (hx, D - 0.0045, hz), (math.pi / 2, 0, 0), door_col))
    hw.append(cylinder("neck", 0.009, 0.055, (hx, D - 0.032, hz), (math.pi / 2, 0, 0), door_col, 24))
    hw.append(cylinder("lever", 0.0095, 0.135, (hx + lever_dir * 0.062, D - 0.058, hz), (0, math.pi / 2, 0), door_col, 24))
    hw.append(cylinder("key-rosette", 0.024, 0.008, (hx, D - 0.004, hz - 0.075), (math.pi / 2, 0, 0), door_col))
    handle = join("handle", hw)
    handle["studio_protected"] = True
    assign(handle, steel)
    bevel(handle, 0.0012)
    hinge_x = lx0 - gap / 2 if d["hinge_side"] == "left" else lx1 + gap / 2
    hinges = [cylinder(f"hinge-{i}", 0.0075, 0.11, (hinge_x, D - 0.004, z), (0, 0, 0), door_col, 24)
              for i, z in enumerate((0.25, 1.05, 1.80))]
    hinge = join("hinges", hinges)
    hinge["studio_protected"] = True
    assign(hinge, hinge_mat)

    # --- skirting (mitred at room corners, butting into the casing) ---------
    sd, sh = spec.SKIRTING["depth"], spec.SKIRTING["height"]

    def xy(a, b, t):
        return (a, b, t)

    skirt = {
        "skirting-left": [(0, 0), (sd, 0), (sd, D - sd), (0, D)],
        "skirting-back-left": [(0, D), (sd, D - sd), (cx0, D - sd), (cx0, D)],
        "skirting-back-right": [(cx1, D), (cx1, D - sd), (W - sd, D - sd), (W, D)],
        "skirting-right": [(W - sd, 0), (W, 0), (W, D), (W - sd, D - sd)],
    }
    for name, pts in skirt.items():
        ob = prism(name, pts, xy, 0, sh, trim_col)
        ob["studio_surface"] = name
        assign(ob, neutral)
        bevel(ob, 0.0015)
    front_skirt = prism("skirting-front", [(0, 0), (W, 0), (W - sd, sd), (sd, sd)], xy, 0, sh, trim_col)
    assign(front_skirt, wall_mat)

    # --- furniture (Poly Haven CC0) -----------------------------------------
    F = spec.FURNITURE
    for key, asset in (("sofa", "sofa_03"), ("pillows", "throw_pillows_01"),
                       ("armchair", "mid_century_lounge_chair"), ("coffee-table", "modern_coffee_table_01"),
                       ("side-table", "side_table_01"), ("pendant", "modern_ceiling_lamp_01")):
        place(append_blend(asset, furniture), F[key]["at"], F[key]["rot"], key)
    place(import_gltf("potted_plant_02", furniture), F["plant"]["at"], F["plant"]["rot"], "plant")

    rx0, rx1, ry0, ry1 = F["rug"]["rect"]
    rug = box("rug", rx0, rx1, ry0, ry1, 0, 0.012, furniture)
    assign(rug, rug_material())
    bevel(rug, 0.004, 3)

    # Procedural sideboard and framed print on the back wall (authored here, no external asset).
    sb = F["sideboard"]
    sx0, sx1, sdp, shh = sb["x0"], sb["x1"], sb["depth"], sb["height"]
    paint = principled("sideboard-paint", (0.20, 0.235, 0.215), roughness=0.45, specular=0.45)
    body = box("sideboard-body", sx0, sx1, D - sdp, D - 0.01, 0.12, shh, furniture)
    assign(body, paint)
    bevel(body, 0.004)
    legs = [box(f"sb-leg-{i}", x - 0.015, x + 0.015, y - 0.015, y + 0.015, 0, 0.12, furniture)
            for i, (x, y) in enumerate([(sx0 + 0.06, D - sdp + 0.06), (sx1 - 0.06, D - sdp + 0.06),
                                         (sx0 + 0.06, D - 0.07), (sx1 - 0.06, D - 0.07)])]
    legs_ob = join("sideboard-legs", legs)
    assign(legs_ob, principled("brass", (0.80, 0.62, 0.36), roughness=0.3, metallic=1.0))
    n = 3
    for i in range(1, n):
        x = sx0 + (sx1 - sx0) * i / n
        groove = box(f"sb-groove-{i}", x - 0.0015, x + 0.0015, D - sdp - 0.001, D - sdp + 0.002, 0.14, shh - 0.02, furniture)
        assign(groove, principled("groove", (0.03, 0.03, 0.03), roughness=0.8))
    art = F["art"]
    ax0, ax1, az0, az1 = art["rect"]
    frame_ob = box("art-frame", ax0, ax1, D - 0.03, D - 0.002, az0, az1, furniture)
    assign(frame_ob, principled("art-frame", (0.04, 0.04, 0.04), roughness=0.5))
    canvas = box("art-canvas", ax0 + 0.05, ax1 - 0.05, D - 0.032, D - 0.028, az0 + 0.05, az1 - 0.05, furniture)
    cmat = principled("art-canvas", (0.8, 0.75, 0.68), roughness=0.9, specular=0.2)
    cnt = cmat.node_tree
    wave = cnt.nodes.new("ShaderNodeTexNoise")
    wave.inputs["Scale"].default_value = 1.6
    wave.inputs["Detail"].default_value = 3.0
    ramp = cnt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.62, 0.46, 0.34, 1)
    ramp.color_ramp.elements[1].color = (0.86, 0.82, 0.74, 1)
    ramp.color_ramp.elements[0].position = 0.38
    ramp.color_ramp.elements[1].position = 0.62
    cnt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    cnt.links.new(ramp.outputs["Color"], cnt.nodes["Principled BSDF"].inputs["Base Color"])
    assign(canvas, cmat)
    vase = cylinder("vase", 0.07, 0.30, (sx0 + 0.25, D - sdp / 2, shh + 0.15), (0, 0, 0), furniture)
    assign(vase, principled("vase", (0.78, 0.74, 0.68), roughness=0.35))
    books = [box(f"book-{i}", sx1 - 0.55 + i * 0.045, sx1 - 0.512 + i * 0.045, D - sdp + 0.08, D - 0.08, shh, shh + 0.22 - (i % 3) * 0.025, furniture)
             for i in range(5)]
    for i, b in enumerate(books):
        assign(b, principled(f"book-{i}", [(0.55, 0.22, 0.16), (0.82, 0.78, 0.70), (0.18, 0.25, 0.32),
                                           (0.70, 0.58, 0.40), (0.25, 0.25, 0.24)][i], roughness=0.6))

    # Sheer curtains: gently folded translucent panels either side of the window.
    sheer = bpy.data.materials.new("sheer-curtain")
    snt = sheer.node_tree
    snt.nodes.clear()
    sout = snt.nodes.new("ShaderNodeOutputMaterial")
    diff = snt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (0.92, 0.91, 0.89, 1)
    trans = snt.nodes.new("ShaderNodeBsdfTranslucent")
    trans.inputs["Color"].default_value = (0.92, 0.91, 0.88, 1)
    clear = snt.nodes.new("ShaderNodeBsdfTransparent")
    m1 = snt.nodes.new("ShaderNodeMixShader")
    m1.inputs[0].default_value = 0.45
    snt.links.new(diff.outputs[0], m1.inputs[1])
    snt.links.new(trans.outputs[0], m1.inputs[2])
    m2 = snt.nodes.new("ShaderNodeMixShader")
    m2.inputs[0].default_value = 0.35
    snt.links.new(m1.outputs[0], m2.inputs[1])
    snt.links.new(clear.outputs[0], m2.inputs[2])
    snt.links.new(m2.outputs[0], sout.inputs["Surface"])
    for i, (y0, y1) in enumerate(F["curtains"]):
        cols, rows = 48, 2
        verts, faces = [], []
        for r in range(rows):
            z = 0.015 + r * (H - 0.06)
            for k in range(cols + 1):
                t = k / cols
                verts.append((0.10 + 0.035 * math.sin(t * math.pi * 9), y0 + (y1 - y0) * t, z))
        for k in range(cols):
            faces.append((k, k + 1, cols + 2 + k, cols + 1 + k))
        cur = mesh_object(f"curtain-{i}", verts, faces, furniture)
        assign(cur, sheer)
        for p in cur.data.polygons:
            p.use_smooth = True

    # --- world and lights ---------------------------------------------------
    world = bpy.data.worlds.new("world")
    scene.world = world
    nt = world.node_tree
    bg = nt.nodes["Background"]
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(next((CACHE / spec.HDRI["id"]).glob("*.hdr"))))
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(spec.HDRI["rotation_deg"]))
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs[0], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = spec.HDRI["strength"]

    fill = bpy.data.lights.new("fill", "AREA")
    fill.shape = "RECTANGLE"
    fill.size, fill.size_y = 3.0, 4.0
    fill.energy = spec.FILL["energy"]
    fill.color = (1.0, 0.96, 0.9)
    fill_ob = bpy.data.objects.new("fill", fill)
    fill_ob.location = (W / 2, D / 2, H - 0.02)
    fill_ob.visible_camera = False
    fill_ob.visible_glossy = False
    scene.collection.objects.link(fill_ob)

    # --- camera ---------------------------------------------------------------
    c = spec.CAMERA
    cam = bpy.data.cameras.new("camera")
    cam.lens = c["lens_mm"]
    cam.sensor_width = c["sensor_mm"]
    cam.sensor_fit = "HORIZONTAL"
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
    scene.cycles.film_exposure = spec.EXPOSURE
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
