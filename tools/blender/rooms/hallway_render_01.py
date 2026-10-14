"""hallway-render-01: apartment hallway (1.7 x 5.6 x 2.65 m), door at the end.

No window: three warm ceiling spots and light from the room behind the
camera. A floating oak console with a round mirror on the left, prints and a
bench on the right, a plant by the door.
"""
import math

SCENE_ID = "hallway-render-01"

ROOM = {"width": 1.7, "depth": 5.6, "height": 2.65, "wall": 0.15}
WALL = {"color": (0.86, 0.85, 0.82), "roughness": 0.92}
DOOR = {"center_x": 0.85, "hinge_side": "left"}

CAMERA = {
    "location": (0.98, 0.18, 1.48),
    "target": (0.80, 5.6, 1.48),
    "shift_y": -0.13,
    "lens_mm": 18.0,
    "sensor_mm": 36.0,
    "resolution": (2400, 1800),
}
FILL = {"energy": 6.0, "size": (1.2, 4.6)}
EXPOSURE = 1.6
SPOTS = [1.35, 2.85, 4.35]


def furnish(k, ctx):
    import props as p

    W, D, H = ctx.W, ctx.D, ctx.H
    col = ctx.cols["furniture"]
    # Recessed ceiling spots: a warm downlight plus its visible trim ring.
    trim = k.principled("spot-trim", (0.9, 0.9, 0.88), roughness=0.4)
    glow = k.emission("spot-glow", (1.0, 0.86, 0.68), 6.0)
    for i, y in enumerate(SPOTS):
        k.spot_light(f"spot-{i}", 9.0, (W / 2, y, H - 0.03), angle_deg=95, blend=0.8, radius=0.04)
        ring = k.cylinder(f"spot-ring-{i}", 0.045, 0.006, (W / 2, y, H - 0.003), (0, 0, 0), col, 48)
        k.assign(ring, trim)
        lens = k.cylinder(f"spot-lens-{i}", 0.032, 0.004, (W / 2, y, H - 0.0065), (0, 0, 0), col, 48)
        k.assign(lens, glow)
    # Light spilling in from the living room behind the camera.
    k.area_light("room-behind", 1.2, 14.0, (W / 2, 0.05, 1.6), rotation=(math.radians(90), 0, 0), size_y=1.6,
                 color=(1.0, 0.95, 0.88))

    # Floating oak console with a round mirror (left wall).
    oak = p.wood("console-oak", (0.52, 0.38, 0.26), axis="y")
    c0, c1 = 2.35, 3.55
    con = p.wall_box("console", ctx, "left", c0, c1, 0.72, 0.80, 0.0, 0.30)
    k.assign(con, oak)
    k.bevel(con, 0.003)
    drawer = p.wall_box("console-drawer", ctx, "left", c0 + 0.05, c1 - 0.05, 0.62, 0.72, 0.03, 0.29)
    k.assign(drawer, oak)
    k.bevel(drawer, 0.002)
    p.round_mirror("hall-mirror", ctx, "left", (c0 + c1) / 2, 1.42, 0.38)
    k.asset("brass_vase_01", col, (0.16, c0 + 0.22, 0.80), 0, "console-vase", scale=0.5)
    p.books("console-books", ctx, c1 - 0.40, 0.04, 0.24, 0.80, count=4, axis="y", height=0.18)
    bowl = k.sphere("key-bowl", 0.09, (0.15, c1 - 0.55, 0.80), col, scale=(1, 1, 0.35))
    k.assign(bowl, k.principled("bowl-ceramic", (0.20, 0.20, 0.19), roughness=0.35))

    # Right wall: two prints and a slim bench with a cushion near the camera.
    for i, (a, art) in enumerate(((2.55, ((0.46, 0.50, 0.44), (0.88, 0.86, 0.80))),
                                  (3.45, ((0.63, 0.46, 0.34), (0.90, 0.87, 0.81))))):
        p.framed_print(f"hall-print-{i}", ctx, "right", a - 0.30, a + 0.30, 1.20, 1.95,
                       p.abstract_print(f"hall-print-{i}-art", *art, scale=1.2, seed=11.0 + i), mat_border=0.05)
    b0, b1 = 1.05, 2.05
    bench = p.wall_box("bench-top", ctx, "right", b0, b1, 0.42, 0.46, 0.0, 0.34)
    k.assign(bench, oak)
    k.bevel(bench, 0.003)
    blegs = [p.wall_box(f"bench-leg-{i}", ctx, "right", a - 0.02, a + 0.02, 0.0, 0.42, d - 0.02, d + 0.02)
             for i, (a, d) in enumerate([(b0 + 0.06, 0.05), (b1 - 0.06, 0.05), (b0 + 0.06, 0.29), (b1 - 0.06, 0.29)])]
    k.assign(k.join("bench-legs", blegs), k.principled("bench-legs-mat", (0.05, 0.05, 0.05), roughness=0.5))
    cushion = k.rounded_box("bench-cushion", W - 0.33, W - 0.02, b0 + 0.03, b1 - 0.03, 0.46, 0.52, col, 0.025, 4)
    k.assign(cushion, k.textured("cushion-linen", "rough_linen", (0.27, 0.27), tint=(0.66, 0.42, 0.32), saturation=0.5,
                                 sheen=0.4))
    hooks = k.principled("hooks-black", (0.03, 0.03, 0.03), roughness=0.4, metallic=0.5)
    for i, a in enumerate((b0 + 0.20, b0 + 0.50, b0 + 0.80)):
        hk = k.cylinder(f"hook-{i}", 0.010, 0.05, p.wall_point(ctx, "right", a, 0.025, 1.62), (0, math.pi / 2, 0), col, 16)
        k.assign(hk, hooks)
    k.asset("potted_plant_02", col, (W - 0.28, D - 0.40, 0.0), 40, "plant")
    # Floor-standing shoe cabinet on the left, near the camera.
    sc = p.wall_box("shoe-cabinet", ctx, "left", 0.55, 1.55, 0.0, 1.05, 0.0, 0.30)
    k.assign(sc, k.principled("shoe-cabinet-mat", (0.70, 0.67, 0.62), roughness=0.5))
    k.bevel(sc, 0.002)
    for i, a in enumerate((0.88, 1.22)):
        seam = p.wall_box(f"shoe-seam-{i}", ctx, "left", a - 0.001, a + 0.001, 0.02, 1.03, 0.298, 0.3005)
        k.assign(seam, k.principled(f"shoe-seam-{i}-mat", (0.05, 0.05, 0.05), roughness=0.6))
