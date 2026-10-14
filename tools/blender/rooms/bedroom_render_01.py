"""bedroom-render-01: main bedroom (4.2 x 4.8 x 2.65 m).

Upholstered double bed against a soft greige left wall, nightstands with
lamps, a low dresser with a round mirror on the back wall, linen curtains at
a window in the right wall. The door is in the back wall, right of centre.
"""

SCENE_ID = "bedroom-render-01"

ROOM = {"width": 4.2, "depth": 4.8, "height": 2.65, "wall": 0.15}
WALL = {"color": (0.87, 0.86, 0.835), "roughness": 0.92}
DOOR = {"center_x": 3.25, "hinge_side": "right"}
WINDOW = {"side": "right", "y0": 1.55, "y1": 3.25, "z0": 0.90, "z1": 2.40, "wall": 0.30, "frame": 0.060}

CAMERA = {
    "location": (3.05, 0.25, 1.50),
    "target": (1.55, 4.8, 1.50),
    "shift_y": -0.15,
    "lens_mm": 19.0,
    "sensor_mm": 36.0,
    "resolution": (2400, 1800),
}
# Window faces the other way from the living room: turn the sky so the sun still enters.
HDRI = {"id": "kloofendal_48d_partly_cloudy", "strength": 0.9, "rotation_deg": 0.0}
FILL = {"energy": 70.0}
EXPOSURE = 1.5

BED = {"x0": 0.14, "x1": 2.19, "y0": 1.72, "y1": 3.32}


def furnish(k, ctx):
    import props as p

    W, D, H = ctx.W, ctx.D, ctx.H
    col = ctx.cols["furniture"]
    accent = k.principled("wall-greige", (0.66, 0.62, 0.56), roughness=0.92, specular=0.3)
    k.assign(ctx.walls["wall-left"], accent)

    linen = k.textured("bed-linen", "rough_linen", (0.27, 0.27), tint=(0.93, 0.90, 0.85), saturation=0.2, value=1.05, sheen=0.3)
    pillow = k.textured("pillow-linen", "rough_linen", (0.27, 0.27), tint=(0.96, 0.95, 0.92), saturation=0.1, value=1.1, sheen=0.3)
    throw = k.textured("throw-linen", "rough_linen", (0.27, 0.27), tint=(0.62, 0.50, 0.40), saturation=0.4, sheen=0.4)
    # Poly Haven's "wool_boucle" diffuse is a woven check, so upholstery uses linen.
    boucle = k.textured("headboard-fabric", "rough_linen", (0.27, 0.27), tint=(0.58, 0.54, 0.48), saturation=0.2, sheen=0.4)
    B = BED
    p.bed("bed", ctx, B["x0"], B["x1"], B["y0"], B["y1"], frame_mat=boucle, mattress_mat=pillow, duvet_mat=linen,
          pillow_mat=pillow, head="left", headboard_mat=boucle, throw_mat=throw)
    for i, y in enumerate((1.18, 3.86)):
        k.asset("painted_wooden_nightstand", col, (0.30, y, 0.0), -90, f"nightstand-{i}")
        p.table_lamp(f"bedside-lamp-{i}", ctx, 0.30, y, 0.615)
    mid = (BED["y0"] + BED["y1"]) / 2
    for i, y in enumerate((mid - 0.36, mid + 0.36)):
        k.asset("hanging_picture_frame_01", col, (0.012, y, 1.28), 90, f"print-bed-{i}", scale=0.82)

    # Rug from under the bed into the room.
    rug = k.rounded_box("rug", 1.30, 3.05, 1.35, 3.70, 0.0, 0.014, col, 0.006, 2)
    k.assign(rug, p.fabric("rug-wool", (0.78, 0.74, 0.67), roughness=0.95, sheen=0.8))

    # Low dresser with a round mirror and a few objects on the back wall.
    oak = p.wood("dresser-oak", (0.50, 0.37, 0.25), axis="x")
    dx0, dx1 = 0.85, 2.15
    body = p.wall_box("dresser", ctx, "back", dx0, dx1, 0.10, 0.82, 0.0, 0.45)
    k.assign(body, oak)
    k.bevel(body, 0.003)
    for i in range(1, 3):
        x = dx0 + (dx1 - dx0) * i / 3
        line = p.wall_box(f"dresser-gap-{i}", ctx, "back", x - 0.0015, x + 0.0015, 0.12, 0.80, 0.448, 0.4505)
        k.assign(line, k.principled("dresser-gap-mat", (0.03, 0.03, 0.03), roughness=0.8))
    legs = [p.wall_box(f"dresser-leg-{i}", ctx, "back", x - 0.015, x + 0.015, 0.0, 0.10, d - 0.015, d + 0.015)
            for i, (x, d) in enumerate([(dx0 + 0.06, 0.06), (dx1 - 0.06, 0.06), (dx0 + 0.06, 0.39), (dx1 - 0.06, 0.39)])]
    k.assign(k.join("dresser-legs", legs), k.principled("dresser-legs-mat", (0.05, 0.05, 0.05), roughness=0.5))
    p.round_mirror("dresser-mirror", ctx, "back", (dx0 + dx1) / 2, 1.42, 0.40)
    p.books("dresser-books", ctx, dx1 - 0.40, D - 0.36, D - 0.14, 0.82, count=4, height=0.20)
    k.asset("ceramic_vase_01", col, (dx0 + 0.25, D - 0.22, 0.82), 0, "dresser-vase")
    k.asset("anthurium_botany_01", col, (0.35, D - 0.32, 0.0), 15, "plant")

    # Linen curtains either side of the window.
    lin = k.textured("curtain-linen", "rough_linen", (0.27, 0.27), saturation=0.2, value=1.2, sheen=0.3)
    wn = WINDOW
    p.curtain("curtain-0", ctx, "right", wn["y0"] - 0.45, wn["y0"] + 0.15, depth=0.11, mat=lin)
    p.curtain("curtain-1", ctx, "right", wn["y1"] - 0.15, wn["y1"] + 0.45, depth=0.11, mat=lin)
