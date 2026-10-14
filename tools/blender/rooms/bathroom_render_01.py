"""bathroom-render-01: tiled bathroom (2.6 x 3.3 x 2.6 m).

Laminate never goes into a bathroom, so the floor is fixed porcelain tile
(not editable) and the walls are tiled to the ceiling with no MDF skirting.
Only the door (leaf and casing) changes. Bathtub on the left, floating oak
vanity with a backlit round mirror on the right, a towel rail beside the door
in the back wall.
"""
import math

SCENE_ID = "bathroom-render-01"
EDITABLE_FLOOR = False
SKIRTING_WALLS = False

ROOM = {"width": 2.6, "depth": 3.3, "height": 2.6, "wall": 0.15}
WALL = {"color": (0.90, 0.89, 0.86), "roughness": 0.3}
DOOR = {"center_x": 1.80, "hinge_side": "right"}

CAMERA = {
    "location": (1.20, 0.16, 1.50),
    "target": (1.40, 3.3, 1.50),
    "shift_y": -0.12,
    "lens_mm": 17.0,
    "sensor_mm": 36.0,
    "resolution": (2400, 1800),
}
FILL = {"energy": 12.0, "size": (1.6, 2.4)}
EXPOSURE = 1.55

FLOOR_TILE = (0.60, 0.60)
WALL_TILE = (0.60, 1.20)


def floor_material(k, ctx):
    return k.tiles("floor-tiles", FLOOR_TILE, 0.002, color=(0.56, 0.54, 0.51), grout=(0.42, 0.41, 0.39),
                   roughness=0.32, axes="xy")


def furnish(k, ctx):
    import props as p

    W, D, H = ctx.W, ctx.D, ctx.H
    col = ctx.cols["furniture"]
    wall_xz = k.tiles("wall-tiles-xz", WALL_TILE, 0.002, color=(0.86, 0.84, 0.80), grout=(0.74, 0.73, 0.70),
                      roughness=0.2, axes="xz")
    wall_yz = k.tiles("wall-tiles-yz", WALL_TILE, 0.002, color=(0.86, 0.84, 0.80), grout=(0.74, 0.73, 0.70),
                      roughness=0.2, axes="yz")
    for name, ob in ctx.walls.items():
        k.assign(ob, wall_yz if name.startswith(("wall-left", "wall-right")) else wall_xz)

    white = k.principled("ceramic-white", (0.93, 0.93, 0.92), roughness=0.08, specular=0.6)
    black = k.principled("fittings-black", (0.03, 0.03, 0.03), roughness=0.35, metallic=0.8)
    # Bathtub along the left wall: a rounded shell with the basin cut out.
    tx1, ty0 = 0.78, 1.55
    tub = k.box("bathtub", 0.0, tx1, ty0, D, 0.0, 0.56, col)
    cutter = k.box("bathtub-cut", 0.07, tx1 - 0.07, ty0 + 0.07, D - 0.07, 0.14, 0.70, col)
    cut = tub.modifiers.new("basin", "BOOLEAN")
    cut.operation = "DIFFERENCE"
    cut.solver = "EXACT"
    cut.object = cutter
    import bpy

    with bpy.context.temp_override(object=tub, active_object=tub):
        bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    k.bevel(tub, 0.02, 4)
    k.assign(tub, white)
    mixer = k.join("tub-mixer", [
        k.cylinder("tub-mixer-body", 0.025, 0.18, (0.04, 2.45, 0.85), (0, math.pi / 2, 0), col, 32),
        k.cylinder("tub-spout", 0.012, 0.16, (0.12, 2.45, 0.80), (0, math.pi / 2, 0), col, 24),
        k.cylinder("shower-rail", 0.011, 1.0, (0.035, 2.45, 1.45), (0, 0, 0), col, 24),
        k.cylinder("shower-head", 0.06, 0.012, (0.10, 2.45, 1.90), (0, math.pi / 2, 0), col, 48),
    ])
    k.assign(mixer, black)
    screen = k.box("bath-screen", tx1 - 0.012, tx1 - 0.004, ty0 + 0.25, ty0 + 1.05, 0.56, 2.05, col)
    k.assign(screen, k.clear_glass("bath-screen-glass"))
    rail = k.box("bath-screen-profile", tx1 - 0.014, tx1 - 0.002, ty0 + 0.25, ty0 + 1.05, 2.05, 2.065, col)
    k.assign(rail, black)

    # Floating oak vanity with a vessel basin, black tap and backlit mirror (right wall).
    oak = p.wood("vanity-oak", (0.52, 0.38, 0.26), axis="y")
    v0, v1 = 1.55, 2.45
    van = p.wall_box("vanity", ctx, "right", v0, v1, 0.45, 0.85, 0.0, 0.48)
    k.assign(van, oak)
    k.bevel(van, 0.003)
    seam = p.wall_box("vanity-seam", ctx, "right", (v0 + v1) / 2 - 0.0015, (v0 + v1) / 2 + 0.0015, 0.47, 0.83, 0.478, 0.4805)
    k.assign(seam, k.principled("vanity-seam-mat", (0.03, 0.03, 0.03), roughness=0.8))
    bc = (v0 + v1) / 2
    basin = k.rounded_box("basin", W - 0.40, W - 0.10, bc - 0.21, bc + 0.21, 0.85, 0.97, col, 0.03, 4)
    bcut = k.box("basin-cut", W - 0.375, W - 0.125, bc - 0.185, bc + 0.185, 0.875, 1.05, col)
    cut = basin.modifiers.new("bowl", "BOOLEAN")
    cut.operation = "DIFFERENCE"
    cut.solver = "EXACT"
    cut.object = bcut
    k.assign(basin, white)
    bcut.hide_render = True
    bcut.hide_viewport = True
    tap = k.join("basin-tap", [
        k.cylinder("basin-tap-riser", 0.012, 0.30, (W - 0.03, bc, 1.10), (0, 0, 0), col, 24),
        k.cylinder("basin-tap-spout", 0.010, 0.17, (W - 0.11, bc, 1.24), (0, math.pi / 2, 0), col, 24),
    ])
    k.assign(tap, black)
    p.round_mirror("bath-mirror", ctx, "right", bc, 1.60, 0.32, frame_color=(0.05, 0.05, 0.05), depth=0.03)
    halo = k.cylinder("mirror-halo", 0.325, 0.004, p.wall_point(ctx, "right", bc, 0.004, 1.60),
                      (math.pi / 2, 0, math.pi / 2), col, 96)
    k.assign(halo, k.emission("mirror-halo-mat", (1.0, 0.90, 0.75), 3.0))
    # Heated towel rail with a folded towel beside the door.
    rx0, rx1 = 0.86, 1.18
    bars = [k.box("rail-l", rx0, rx0 + 0.02, D - 0.06, D - 0.04, 0.35, 1.65, col),
            k.box("rail-r", rx1 - 0.02, rx1, D - 0.06, D - 0.04, 0.35, 1.65, col)]
    for i in range(7):
        z = 0.42 + i * 0.19
        bars.append(k.cylinder(f"rail-bar-{i}", 0.008, rx1 - rx0, ((rx0 + rx1) / 2, D - 0.05, z), (0, math.pi / 2, 0), col, 16))
    k.assign(k.join("towel-rail", bars), black)
    towel = k.rounded_box("towel", rx0 + 0.01, rx1 - 0.01, D - 0.075, D - 0.025, 0.95, 1.52, col, 0.012, 3)
    k.assign(towel, p.fabric("towel-cotton", (0.82, 0.76, 0.66), roughness=0.95, sheen=0.8))
    k.asset("potted_plant_04", col, (W - 0.36, v0 + 0.10, 0.85), 0, "vanity-plant")
    bath_mat = k.rounded_box("bath-mat", 0.85, 1.40, 1.80, 2.60, 0.0, 0.012, col, 0.005, 2)
    k.assign(bath_mat, p.fabric("bath-mat-cotton", (0.82, 0.76, 0.66), roughness=0.95, sheen=0.8))

    # Two warm recessed spots.
    glow = k.emission("spot-glow", (1.0, 0.88, 0.72), 6.0)
    for i, (x, y) in enumerate(((1.3, 1.3), (1.3, 2.5))):
        k.spot_light(f"spot-{i}", 14.0, (x, y, H - 0.03), angle_deg=100, blend=0.8, radius=0.04)
        lens = k.cylinder(f"spot-lens-{i}", 0.032, 0.004, (x, y, H - 0.0035), (0, 0, 0), col, 48)
        k.assign(lens, glow)
