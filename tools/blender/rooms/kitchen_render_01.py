"""kitchen-render-01: open kitchen with a dining table (4.6 x 6.2 x 2.7 m).

L-shaped handleless kitchen on the back and right walls, a dining table for
four in the middle with two pendants, daylight from a window on the left.
The door sits in the back wall to the left of the kitchen run.
"""
import math

SCENE_ID = "kitchen-render-01"

ROOM = {"width": 4.6, "depth": 6.2, "height": 2.7, "wall": 0.15}
WALL = {"color": (0.87, 0.855, 0.83), "roughness": 0.92}
DOOR = {"center_x": 1.10, "hinge_side": "left"}
WINDOW = {"side": "left", "y0": 2.10, "y1": 4.50, "z0": 0.85, "z1": 2.45, "wall": 0.30, "frame": 0.060}

CAMERA = {
    "location": (3.15, 0.30, 1.52),
    "target": (2.05, 6.2, 1.52),
    "shift_y": -0.16,
    "lens_mm": 20.0,
    "sensor_mm": 36.0,
    "resolution": (2400, 1800),
}
HDRI = {"id": "kloofendal_48d_partly_cloudy", "strength": 1.0, "rotation_deg": 180.0}
FILL = {"energy": 80.0}
EXPOSURE = 1.45

KITCHEN = {"back_x0": 2.05, "right_y0": 3.55, "tall_x0": 3.98, "depth": 0.60}
TABLE = {"x0": 1.42, "x1": 2.32, "y0": 2.45, "y1": 4.25, "height": 0.75}


def quartz(k):
    """Light engineered-quartz worktop: fine speckle, satin polish."""
    import bpy

    m = k.principled("worktop-quartz", (0.86, 0.85, 0.82), roughness=0.22, specular=0.5)
    nt = m.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 180.0
    noise.inputs["Detail"].default_value = 2.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.70, 0.69, 0.66, 1)
    ramp.color_ramp.elements[1].color = (0.88, 0.87, 0.84, 1)
    ramp.color_ramp.elements[0].position = 0.30
    ramp.color_ramp.elements[1].position = 0.45
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    del bpy
    return m


def furnish(k, ctx):
    import bpy

    import props as p

    W, D, H = ctx.W, ctx.D, ctx.H
    col = ctx.cols["furniture"]
    K = KITCHEN
    front = p.lacquer("kitchen-front", (0.42, 0.45, 0.39), roughness=0.55, specular=0.35)
    stone = quartz(k)
    # Back run (right of the door) and right run; a tall fridge column fills the corner.
    p.base_units("back-run", ctx, "back", K["back_x0"], K["tall_x0"] - 0.003, front, stone, depth=K["depth"])
    p.base_units("right-run", ctx, "right", K["right_y0"], D - K["depth"] - 0.003, front, stone, depth=K["depth"])
    tall = k.box("tall-unit", K["tall_x0"], W, D - K["depth"], D, 0.0, 2.25, col)
    k.assign(tall, front)
    k.bevel(tall, 0.0015)
    seam = k.box("tall-seam", K["tall_x0"] + 0.01, W - 0.01, D - K["depth"] - 0.0005, D - K["depth"] + 0.002, 1.38, 1.383, col)
    k.assign(seam, k.principled("tall-seam-mat", (0.05, 0.05, 0.05), roughness=0.6))
    # Stone backsplash and wall units on the right wall.
    for name, wall, a0, a1 in (("splash-back", "back", K["back_x0"], K["tall_x0"]), ("splash-right", "right", K["right_y0"], D - K["depth"])):
        sp = p.wall_box(name, ctx, wall, a0, a1, 0.90, 1.48, 0, 0.012)
        k.assign(sp, stone)
    p.wall_units("upper-right", ctx, "right", K["right_y0"], D - K["depth"] - 0.003, 1.48, 2.25, front, depth=0.36)
    # Oak shelf on the back wall above the run with a few jars.
    oak = p.wood("oak-shelf", (0.55, 0.40, 0.27), axis="x")
    shelf = p.wall_box("back-shelf", ctx, "back", K["back_x0"] + 0.1, K["tall_x0"] - 0.08, 1.62, 1.66, 0, 0.26)
    k.assign(shelf, oak)
    k.bevel(shelf, 0.002)
    jar_mat = k.principled("jar-ceramic", (0.86, 0.84, 0.80), roughness=0.3)
    for i, x in enumerate((K["back_x0"] + 0.35, K["back_x0"] + 0.52, K["back_x0"] + 0.66)):
        j = k.cylinder(f"jar-{i}", 0.055, 0.16 + 0.04 * (i % 2), (x, D - 0.13, 1.66 + 0.08 + 0.02 * (i % 2)), (0, 0, 0), col)
        k.assign(j, jar_mat)
    p.books("cookbooks", ctx, K["tall_x0"] - 0.55, D - 0.24, D - 0.04, 1.66, count=5, height=0.24)
    # Sink with tap on the back run, induction hob on the right run.
    sx0, sx1 = K["back_x0"] + 0.75, K["back_x0"] + 1.40
    sink = k.box("sink", sx0, sx1, D - 0.50, D - 0.10, 0.80, 0.9005, col)
    k.assign(sink, k.principled("sink-steel", (0.42, 0.42, 0.42), roughness=0.3, metallic=1.0))
    tap_mat = k.principled("tap-steel", (0.55, 0.55, 0.55), roughness=0.2, metallic=1.0)
    tx = (sx0 + sx1) / 2
    tap = k.join("tap", [
        k.cylinder("tap-base", 0.025, 0.06, (tx, D - 0.06, 0.93), (0, 0, 0), col, 32),
        k.cylinder("tap-riser", 0.012, 0.30, (tx, D - 0.06, 1.08), (0, 0, 0), col, 24),
        k.cylinder("tap-spout", 0.011, 0.20, (tx, D - 0.16, 1.23), (math.pi / 2, 0, 0), col, 24),
    ])
    k.assign(tap, tap_mat)
    hob = p.wall_box("hob", ctx, "right", K["right_y0"] + 0.55, K["right_y0"] + 1.15, 0.9, 0.906, 0.05, 0.57)
    k.assign(hob, k.principled("hob-glass", (0.01, 0.01, 0.012), roughness=0.05, specular=0.6))
    k.asset("potted_plant_04", col, (W - 0.30, D - K["depth"] - 0.45, 0.90), 30, "worktop-plant")
    board = k.box("chopping-board", K["back_x0"] + 0.15, K["back_x0"] + 0.55, D - 0.06, D - 0.035, 0.90, 1.22, col)
    board.rotation_euler = (math.radians(-6), 0, 0)
    k.assign(board, p.wood("board-oak", (0.60, 0.45, 0.30), axis="z"))

    # Dining table for four with two pendants.
    T = TABLE
    top = p.wood("table-oak", (0.52, 0.38, 0.26), axis="y", roughness=0.38)
    black = k.principled("table-legs", (0.04, 0.04, 0.04), roughness=0.45, metallic=0.4)
    p.table("dining", ctx, T["x0"], T["x1"], T["y0"], T["y1"], T["height"], top, black, leg=0.045, inset=0.10)
    for i, (x, y, rot) in enumerate([(T["x0"] - 0.18, 2.95, 90), (T["x0"] - 0.18, 3.75, 90),
                                     (T["x1"] + 0.18, 2.95, -90), (T["x1"] + 0.18, 3.75, -90)]):
        k.asset("dining_chair_02", col, (x, y, 0.0), rot + (4 if i % 2 else -3), f"chair-{i}")
    cx = (T["x0"] + T["x1"]) / 2
    for i, y in enumerate((3.0, 3.70)):
        p.pendant(f"pendant-{i}", ctx, cx, y, 0.95, radius=0.16, height=0.20)
    k.asset("ceramic_vase_01", col, (cx, 3.35, T["height"]), 0, "table-vase")
    runner = k.box("table-runner", cx - 0.18, cx + 0.18, T["y0"] + 0.25, T["y1"] - 0.25, T["height"], T["height"] + 0.003, col)
    k.assign(runner, k.textured("runner-linen", "rough_linen", (0.27, 0.27), saturation=0.4, value=0.95))
    # Framed print on the left wall beyond the window and a ceiling light over the kitchen.
    p.framed_print("print-left", ctx, "left", 4.85, 5.65, 1.25, 2.05,
                   p.abstract_print("print-left-art", (0.55, 0.43, 0.33), (0.86, 0.82, 0.75), seed=3.0))
