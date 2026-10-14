"""kids-render-01: children's room (3.6 x 4.3 x 2.6 m).

Single bed with its head on the back wall, a tall bookcase beside it, a desk
under the window on the right wall, a round rug with toys on the floor and a
paper lantern. Soft sage accent wall; the door is in the back wall, right.
"""
import math

SCENE_ID = "kids-render-01"

ROOM = {"width": 3.6, "depth": 4.3, "height": 2.6, "wall": 0.15}
WALL = {"color": (0.88, 0.87, 0.85), "roughness": 0.92}
DOOR = {"center_x": 2.78, "hinge_side": "right"}
WINDOW = {"side": "right", "y0": 1.35, "y1": 2.75, "z0": 0.95, "z1": 2.30, "wall": 0.30, "frame": 0.060}

CAMERA = {
    "location": (2.55, 0.22, 1.40),
    "target": (1.55, 4.3, 1.40),
    "shift_y": -0.15,
    "lens_mm": 18.0,
    "sensor_mm": 36.0,
    "resolution": (2400, 1800),
}
HDRI = {"id": "kloofendal_48d_partly_cloudy", "strength": 0.9, "rotation_deg": 0.0}
FILL = {"energy": 55.0}
EXPOSURE = 1.5

BED = {"x0": 0.10, "x1": 1.02, "y0": 2.20, "y1": 4.24}


def bookcase(k, p, ctx, x0, x1, depth=0.32, height=1.90, shelves=5):
    col, D = ctx.cols["furniture"], ctx.D
    white = k.principled("bookcase-white", (0.90, 0.90, 0.88), roughness=0.45)
    t = 0.018
    parts = [k.box("bc-side-l", x0, x0 + t, D - depth, D, 0, height, col),
             k.box("bc-side-r", x1 - t, x1, D - depth, D, 0, height, col),
             k.box("bc-back", x0, x1, D - 0.008, D, 0, height, col)]
    for i in range(shelves + 1):
        z = 0.06 + (height - 0.06 - t) * i / shelves
        parts.append(k.box(f"bc-shelf-{i}", x0 + t, x1 - t, D - depth, D - 0.008, z, z + t, col))
    k.assign(k.join("bookcase", parts), white)
    colours = [(0.85, 0.35, 0.25), (0.25, 0.45, 0.65), (0.95, 0.80, 0.35), (0.40, 0.60, 0.45), (0.90, 0.88, 0.82),
               (0.55, 0.40, 0.55)]
    for i in range(shelves):
        z = 0.06 + (height - 0.06 - t) * i / shelves + t
        if i % 2 == 0:
            p.books(f"bc-books-{i}", ctx, x0 + 0.05 + 0.1 * (i % 3), D - 0.28, D - 0.06, z, count=7, height=0.21,
                    colors=colours[i:] + colours[:i])
        box = k.rounded_box(f"bc-box-{i}", x1 - 0.32, x1 - 0.04, D - 0.29, D - 0.03, z, z + 0.20, col, 0.01, 2)
        k.assign(box, p.fabric(f"bc-box-{i}-mat", [(0.80, 0.74, 0.62), (0.62, 0.68, 0.60), (0.85, 0.82, 0.76)][i % 3]))


def chair(k, ctx, x, y, frame_mat, seat_mat):
    """Simple kids' desk chair facing the desk (+x)."""
    col = ctx.cols["furniture"]
    s = 0.36
    seat = k.box("chair-seat", x - s / 2, x + s / 2, y - s / 2, y + s / 2, 0.42, 0.445, col)
    k.assign(seat, seat_mat)
    k.bevel(seat, 0.004)
    legs = [k.box(f"chair-leg-{i}", a - 0.015, a + 0.015, b - 0.015, b + 0.015, 0, 0.42, col)
            for i, (a, b) in enumerate([(x - s / 2 + 0.03, y - s / 2 + 0.03), (x + s / 2 - 0.03, y - s / 2 + 0.03),
                                        (x - s / 2 + 0.03, y + s / 2 - 0.03), (x + s / 2 - 0.03, y + s / 2 - 0.03)])]
    legs.append(k.box("chair-post-l", x - s / 2 + 0.015, x - s / 2 + 0.045, y - s / 2 + 0.015, y - s / 2 + 0.045, 0.445, 0.78, col))
    legs.append(k.box("chair-post-r", x - s / 2 + 0.015, x - s / 2 + 0.045, y + s / 2 - 0.045, y + s / 2 - 0.015, 0.445, 0.78, col))
    k.assign(k.join("chair-frame", legs), frame_mat)
    back = k.box("chair-back", x - s / 2 + 0.01, x - s / 2 + 0.035, y - s / 2, y + s / 2, 0.60, 0.78, col)
    k.assign(back, seat_mat)
    k.bevel(back, 0.004)


def furnish(k, ctx):
    import bpy

    import props as p

    W, D, H = ctx.W, ctx.D, ctx.H
    col = ctx.cols["furniture"]
    k.assign(ctx.walls["wall-left"], k.principled("wall-sage", (0.62, 0.66, 0.58), roughness=0.92, specular=0.3))

    oak = p.wood("kids-oak", (0.62, 0.48, 0.33), axis="y")
    duvet = k.textured("kids-duvet", "rough_linen", (0.27, 0.27), tint=(0.68, 0.75, 0.80), saturation=0.3, sheen=0.3)
    pillow = k.textured("kids-pillow", "rough_linen", (0.27, 0.27), tint=(0.95, 0.94, 0.90), saturation=0.1, sheen=0.3)
    throw = k.textured("kids-throw", "rough_linen", (0.27, 0.27), tint=(0.86, 0.66, 0.32), saturation=0.6, sheen=0.4)
    B = BED
    p.bed("kids-bed", ctx, B["x0"], B["x1"], B["y0"], B["y1"], frame_mat=oak, mattress_mat=pillow, duvet_mat=duvet,
          pillow_mat=pillow, head="back", frame_h=0.22, mattress_h=0.16, headboard_h=0.85, throw_mat=throw)
    # Tall white bookcase between the bed and the door, with books and boxes.
    bookcase(k, p, ctx, 1.17, 2.07)
    # Desk under the window with a small stool and a lamp.
    d0, d1 = 1.45, 2.65
    desk_top = p.wood("desk-oak", (0.62, 0.48, 0.33), axis="y")
    white = k.principled("desk-legs", (0.88, 0.88, 0.86), roughness=0.45)
    p.table("desk", ctx, W - 0.58, W - 0.02, d0, d1, 0.74, desk_top, white, leg=0.04, inset=0.05)
    chair(k, ctx, W - 0.80, (d0 + d1) / 2, white, desk_top)
    k.asset("potted_plant_04", col, (W - 0.22, d1 - 0.18, 0.74), 0, "desk-plant")
    p.books("desk-books", ctx, d0 + 0.10, W - 0.36, W - 0.20, 0.74, count=3, axis="y", height=0.15,
            colors=[(0.85, 0.35, 0.25), (0.25, 0.45, 0.65), (0.95, 0.80, 0.35), (0.40, 0.60, 0.45)])
    # Round rug and toys.
    rug = k.cylinder("rug", 0.62, 0.012, (1.90, 1.95, 0.006), (0, 0, 0), col, 96)
    k.assign(rug, p.fabric("kids-rug", (0.86, 0.80, 0.70), roughness=0.95, sheen=0.8))
    k.asset("rubber_duck_toy", col, (1.62, 1.72, 0.012), 200, "duck", scale=0.7)
    ball = k.sphere("ball", 0.11, (2.30, 2.25, 0.122), col)
    bm = k.principled("ball-mat", (0.80, 0.28, 0.20), roughness=0.4)
    k.assign(ball, bm)
    colours = [(0.85, 0.35, 0.25), (0.95, 0.78, 0.30), (0.30, 0.55, 0.70), (0.45, 0.65, 0.45)]
    for i, (x, y, z, rot) in enumerate([(1.95, 1.62, 0.012, 10), (2.03, 1.64, 0.012, -5), (1.99, 1.63, 0.082, 30),
                                        (1.72, 2.20, 0.012, 22)]):
        b = k.box(f"block-{i}", -0.035, 0.035, -0.035, 0.035, 0, 0.07, col)
        b.location = (x, y, z)
        b.rotation_euler = (0, 0, math.radians(rot))
        k.assign(b, k.principled(f"block-{i}-mat", colours[i], roughness=0.5))
        k.bevel(b, 0.004)
    # Prints on the sage wall beside the bed.
    for i, (a, art) in enumerate(((2.85, ((0.85, 0.55, 0.35), (0.95, 0.92, 0.85))),
                                  (3.40, ((0.40, 0.55, 0.65), (0.95, 0.92, 0.85))))):
        p.framed_print(f"kids-print-{i}", ctx, "left", a - 0.20, a + 0.20, 1.12, 1.62,
                       p.abstract_print(f"kids-print-{i}-art", *art, scale=1.6, seed=31.0 + i),
                       frame_mat=k.principled(f"kids-print-{i}-frame", (0.85, 0.84, 0.80), roughness=0.5), border=0.02)
    # Paper lantern.
    lx, ly = 1.75, 2.55
    lantern = k.sphere("lantern", 0.19, (lx, ly, H - 0.50), col)
    lm = k.principled("lantern-paper", (0.96, 0.95, 0.92), roughness=0.9, specular=0.1)
    lm.node_tree.nodes["Principled BSDF"].inputs["Transmission Weight"].default_value = 0.6
    k.assign(lantern, lm)
    cord = k.cylinder("lantern-cord", 0.003, 0.31, (lx, ly, H - 0.155), (0, 0, 0), col, 12)
    k.assign(cord, k.principled("lantern-cord-mat", (0.9, 0.9, 0.88), roughness=0.6))
    k.point_light("lantern-light", 8.0, (lx, ly, H - 0.50), radius=0.05)
    p.curtain("kids-curtain", ctx, "right", WINDOW["y1"] - 0.10, WINDOW["y1"] + 0.45, depth=0.10,
              mat=k.textured("kids-curtain-linen", "rough_linen", (0.27, 0.27), tint=(0.95, 0.93, 0.88), saturation=0.2,
                             sheen=0.3))
    del bpy
