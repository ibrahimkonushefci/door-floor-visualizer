"""hallway-render-02: minimal entrance hall with a flush filomuro door (2.4 x 5.0 x 2.7 m).

The default door model is filomuro (concealed frame, no casing). A floating
oak console with an LED strip underneath, a large print, a linear ceiling
light and a plant; the door is in the back wall, right of centre.
"""
import math

SCENE_ID = "hallway-render-02"
DEFAULT_MODEL = "filomuro"

ROOM = {"width": 2.4, "depth": 5.0, "height": 2.7, "wall": 0.15}
WALL = {"color": (0.88, 0.87, 0.85), "roughness": 0.9}
DOOR = {"center_x": 1.58, "hinge_side": "right"}

CAMERA = {
    "location": (1.05, 0.22, 1.50),
    "target": (1.30, 5.0, 1.50),
    "shift_y": -0.14,
    "lens_mm": 19.0,
    "sensor_mm": 36.0,
    "resolution": (2400, 1800),
}
FILL = {"energy": 3.0, "size": (1.8, 4.0)}
EXPOSURE = 1.55


def furnish(k, ctx):
    import props as p

    W, D, H = ctx.W, ctx.D, ctx.H
    col = ctx.cols["furniture"]
    # Linear recessed ceiling light along the hall.
    strip = k.box("ceiling-led", W / 2 - 0.025, W / 2 + 0.025, 0.8, D - 0.6, H - 0.004, H - 0.0005, col)
    k.assign(strip, k.emission("ceiling-led-mat", (1.0, 0.92, 0.80), 3.0))
    k.area_light("ceiling-led-light", 0.05, 8.0, (W / 2, D / 2 + 0.1, H - 0.01), size_y=D - 1.4, color=(1.0, 0.92, 0.80))
    k.area_light("room-behind", 1.6, 5.0, (W / 2, 0.05, 1.5), rotation=(math.radians(90), 0, 0), size_y=1.5,
                 color=(1.0, 0.95, 0.88))

    # Floating console (left wall) with a warm LED glow underneath.
    oak = p.wood("console-oak", (0.56, 0.42, 0.29), axis="y")
    c0, c1 = 1.55, 3.55
    con = p.wall_box("console", ctx, "left", c0, c1, 0.38, 0.62, 0.0, 0.36)
    k.assign(con, oak)
    k.bevel(con, 0.003)
    for i in range(1, 3):
        a = c0 + (c1 - c0) * i / 3
        gap = p.wall_box(f"console-gap-{i}", ctx, "left", a - 0.0015, a + 0.0015, 0.40, 0.60, 0.358, 0.3605)
        k.assign(gap, k.principled("console-gap-mat", (0.03, 0.03, 0.03), roughness=0.8))
    led = p.wall_box("console-led", ctx, "left", c0 + 0.05, c1 - 0.05, 0.376, 0.38, 0.03, 0.05)
    k.assign(led, k.emission("console-led-mat", (1.0, 0.82, 0.6), 3.0))
    k.area_light("console-led-light", 0.04, 2.0, (0.06, (c0 + c1) / 2, 0.37), rotation=(math.pi, 0, 0),
                 size_y=c1 - c0 - 0.1, color=(1.0, 0.82, 0.6))
    p.framed_print("hall-print", ctx, "left", c0 + 0.25, c1 - 0.25, 1.05, 2.05,
                   p.abstract_print("hall-print-art", (0.60, 0.40, 0.29), (0.91, 0.88, 0.82), scale=0.8, seed=21.0),
                   border=0.025, mat_border=0.07)
    k.asset("ceramic_vase_03", col, (0.18, c0 + 0.30, 0.62), 0, "console-vase-tall")
    k.asset("ceramic_vase_01", col, (0.18, c0 + 0.50, 0.62), 0, "console-vase")
    p.books("console-books", ctx, c1 - 0.55, 0.06, 0.28, 0.62, count=3, axis="y", height=0.16,
            colors=[(0.82, 0.80, 0.74), (0.30, 0.32, 0.30), (0.70, 0.62, 0.50)])
    k.asset("potted_plant_02", col, (0.38, D - 0.42, 0.0), -30, "plant")
    # Slim shoe cabinet in the right foreground, painted like the walls.
    sc = p.wall_box("shoe-cabinet", ctx, "right", 1.20, 2.20, 0.0, 0.95, 0.0, 0.32)
    k.assign(sc, k.principled("shoe-cabinet-mat", (0.80, 0.79, 0.76), roughness=0.5))
    k.bevel(sc, 0.002)
    seam = p.wall_box("shoe-cabinet-seam", ctx, "right", 1.699, 1.701, 0.02, 0.93, 0.318, 0.3205)
    k.assign(seam, k.principled("shoe-seam-mat", (0.05, 0.05, 0.05), roughness=0.6))
    k.asset("ceramic_vase_01", col, (W - 0.16, 1.95, 0.95), 0, "shoe-cabinet-vase")
    k.asset("hanging_picture_frame_01", col, (W - 0.012, 3.35, 1.15), -90, "print-right", scale=0.9)
    # Vertical oak slat panel on the back wall beside the flush door.
    slats = [k.box(f"slat-{i}", 0.12 + i * 0.036, 0.12 + i * 0.036 + 0.022, D - 0.032, D - 0.012, 0.0, H, col)
             for i in range(24)]
    k.assign(k.join("slats", slats), p.wood("slat-oak", (0.56, 0.42, 0.29), axis="z", scale=0.6))
    felt = k.box("slat-felt", 0.10, 0.12 + 24 * 0.036, D - 0.012, D - 0.002, 0.0, H, col)
    k.assign(felt, k.principled("slat-felt-mat", (0.04, 0.04, 0.04), roughness=0.9))
