"""living-render-01: the Phase 1 proof living room (5.2 x 6.0 x 2.7 m)."""
import math

SCENE_ID = "living-render-01"

ROOM = {"width": 5.2, "depth": 6.0, "height": 2.7, "wall": 0.15}
WALL = {"color": (0.86, 0.845, 0.815), "roughness": 0.92}
DOOR = {"center_x": 3.85, "hinge_side": "left"}

# Window in the left wall (x = 0).
WINDOW = {"side": "left", "y0": 1.95, "y1": 4.75, "z0": 0.80, "z1": 2.48, "wall": 0.30, "frame": 0.060}

# Camera at standing eye height with a slightly wide lens. Values are tuned by
# preview; render_layers.py records the exact final matrix in render-manifest.json.
CAMERA = {
    "location": (2.30, 0.30, 1.55),
    # Level camera (straight verticals) with the frame shifted down via lens shift.
    "target": (2.95, 6.0, 1.55),
    "shift_y": -0.17,
    "lens_mm": 21.0,
    "sensor_mm": 36.0,
    "resolution": (2400, 1800),
}

HDRI = {"id": "kloofendal_48d_partly_cloudy", "strength": 1.0, "rotation_deg": 180.0}  # sun then shines in through the window
FILL = {"energy": 90.0}
EXPOSURE = 1.45  # Cycles film_exposure is a linear multiplier

# Placement of the Poly Haven models (root location, z rotation in degrees; the
# models face -y). Rects are x0, x1, y0, y1 (rug) or x0, x1, z0, z1 (art).
FURNITURE = {
    "sofa": {"at": (0.50, 3.65, 0.0), "rot": 90},
    "pillows": {"at": (0.40, 2.62, 0.47), "rot": 90},
    "armchair": {"at": (3.75, 2.70, 0.0), "rot": -55},
    "coffee-table": {"at": (2.10, 3.70, 0.012), "rot": 90},
    "side-table": {"at": (0.40, 1.95, 0.0), "rot": 0},
    "pendant": {"at": (2.10, 3.70, 2.7 - 1.173), "rot": 0},
    "plant": {"at": (4.80, 5.55, 0.0), "rot": 20},
    "rug": {"rect": (1.20, 3.10, 2.55, 4.85)},
    "sideboard": {"x0": 1.15, "x1": 2.85, "depth": 0.42, "height": 0.62},
    "art": {"rect": (1.45, 2.55, 1.15, 1.95)},
    "curtains": [(1.55, 2.25), (4.45, 5.15)],  # y ranges of the two sheer panels
}


def rug_material(k):
    import bpy

    tex = k.CACHE / "wool_boucle"
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


def furnish(k, ctx):
    furniture, D, H = ctx.cols["furniture"], ctx.D, ctx.H
    F = FURNITURE
    for key, asset in (("sofa", "sofa_03"), ("pillows", "throw_pillows_01"),
                       ("armchair", "mid_century_lounge_chair"), ("coffee-table", "modern_coffee_table_01"),
                       ("side-table", "side_table_01"), ("pendant", "modern_ceiling_lamp_01")):
        k.place(k.append_blend(asset, furniture), F[key]["at"], F[key]["rot"], key)
    k.place(k.import_gltf("potted_plant_02", furniture), F["plant"]["at"], F["plant"]["rot"], "plant")

    rx0, rx1, ry0, ry1 = F["rug"]["rect"]
    rug = k.box("rug", rx0, rx1, ry0, ry1, 0, 0.012, furniture)
    k.assign(rug, rug_material(k))
    k.bevel(rug, 0.004, 3)

    # Procedural sideboard and framed print on the back wall (authored here, no external asset).
    sb = F["sideboard"]
    sx0, sx1, sdp, shh = sb["x0"], sb["x1"], sb["depth"], sb["height"]
    paint = k.principled("sideboard-paint", (0.20, 0.235, 0.215), roughness=0.45, specular=0.45)
    body = k.box("sideboard-body", sx0, sx1, D - sdp, D - 0.01, 0.12, shh, furniture)
    k.assign(body, paint)
    k.bevel(body, 0.004)
    legs = [k.box(f"sb-leg-{i}", x - 0.015, x + 0.015, y - 0.015, y + 0.015, 0, 0.12, furniture)
            for i, (x, y) in enumerate([(sx0 + 0.06, D - sdp + 0.06), (sx1 - 0.06, D - sdp + 0.06),
                                         (sx0 + 0.06, D - 0.07), (sx1 - 0.06, D - 0.07)])]
    legs_ob = k.join("sideboard-legs", legs)
    k.assign(legs_ob, k.principled("brass", (0.80, 0.62, 0.36), roughness=0.3, metallic=1.0))
    n = 3
    for i in range(1, n):
        x = sx0 + (sx1 - sx0) * i / n
        groove = k.box(f"sb-groove-{i}", x - 0.0015, x + 0.0015, D - sdp - 0.001, D - sdp + 0.002, 0.14, shh - 0.02, furniture)
        k.assign(groove, k.principled("groove", (0.03, 0.03, 0.03), roughness=0.8))
    art = F["art"]
    ax0, ax1, az0, az1 = art["rect"]
    frame_ob = k.box("art-frame", ax0, ax1, D - 0.03, D - 0.002, az0, az1, furniture)
    k.assign(frame_ob, k.principled("art-frame", (0.04, 0.04, 0.04), roughness=0.5))
    canvas = k.box("art-canvas", ax0 + 0.05, ax1 - 0.05, D - 0.032, D - 0.028, az0 + 0.05, az1 - 0.05, furniture)
    cmat = k.principled("art-canvas", (0.8, 0.75, 0.68), roughness=0.9, specular=0.2)
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
    k.assign(canvas, cmat)
    vase = k.cylinder("vase", 0.07, 0.30, (sx0 + 0.25, D - sdp / 2, shh + 0.15), (0, 0, 0), furniture)
    k.assign(vase, k.principled("vase", (0.78, 0.74, 0.68), roughness=0.35))
    books = [k.box(f"book-{i}", sx1 - 0.55 + i * 0.045, sx1 - 0.512 + i * 0.045, D - sdp + 0.08, D - 0.08, shh, shh + 0.22 - (i % 3) * 0.025, furniture)
             for i in range(5)]
    for i, b in enumerate(books):
        k.assign(b, k.principled(f"book-{i}", [(0.55, 0.22, 0.16), (0.82, 0.78, 0.70), (0.18, 0.25, 0.32),
                                               (0.70, 0.58, 0.40), (0.25, 0.25, 0.24)][i], roughness=0.6))

    # Sheer curtains: gently folded translucent panels either side of the window.
    sheer = k.sheer_curtain()
    for i, (y0, y1) in enumerate(F["curtains"]):
        cols, rows = 48, 2
        verts, faces = [], []
        for r in range(rows):
            z = 0.015 + r * (H - 0.06)
            for j in range(cols + 1):
                t = j / cols
                verts.append((0.10 + 0.035 * math.sin(t * math.pi * 9), y0 + (y1 - y0) * t, z))
        for j in range(cols):
            faces.append((j, j + 1, cols + 2 + j, cols + 1 + j))
        cur = k.mesh_object(f"curtain-{i}", verts, faces, furniture)
        k.assign(cur, sheer)
        for p in cur.data.polygons:
            p.use_smooth = True
