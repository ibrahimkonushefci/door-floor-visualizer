"""Procedural furniture and finishes shared by the Phase 3 rooms.

Everything here is modelled in code (no external asset): wood and lacquer
materials, cabinets, tables, beds, mirrors, framed prints and lamps. Wall
items take a `wall` of "back" (y = D, facing -y), "left" (x = 0, facing +x)
or "right" (x = W, facing -x) and an along-wall coordinate `a` (x on the back
wall, y on the side walls).
"""
import math

import bpy

import kit as k


# --- materials ----------------------------------------------------------------


def wood(name, color=(0.50, 0.36, 0.24), axis="x", roughness=0.42, grain=0.18, scale=1.0):
    """Oak-like wood: stretched noise for the grain, slight colour variation."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    stretch = {"x": (0.6, 28.0, 28.0), "y": (28.0, 0.6, 28.0), "z": (28.0, 28.0, 0.6)}[axis]
    mapping.inputs["Scale"].default_value = tuple(v * scale for v in stretch)
    nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.6
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.62
    noise.inputs["Distortion"].default_value = 0.6
    nt.links.new(mapping.outputs[0], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    lo = tuple(max(0.0, c * (1 - grain)) for c in color)
    hi = tuple(min(1.0, c * (1 + grain * 0.6)) for c in color)
    ramp.color_ramp.elements[0].color = (*lo, 1)
    ramp.color_ramp.elements[1].color = (*hi, 1)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.65
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])
    return m


def lacquer(name, color, roughness=0.38, specular=0.5):
    return k.principled(name, color, roughness=roughness, specular=specular)


def fabric(name, color, roughness=0.85, sheen=0.5):
    m = k.principled(name, color, roughness=roughness, specular=0.3)
    m.node_tree.nodes["Principled BSDF"].inputs["Sheen Weight"].default_value = sheen
    return m


def abstract_print(name, a, b, scale=1.4, seed=0.0):
    """Soft abstract print (two-colour noise) for framed art."""
    m = k.principled(name, b, roughness=0.9, specular=0.2)
    nt = m.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 2.5
    noise.noise_dimensions = "4D"
    k.sock(noise, "W").default_value = seed
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*a, 1)
    ramp.color_ramp.elements[1].color = (*b, 1)
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[1].position = 0.58
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


# --- wall placement ---------------------------------------------------------------


def wall_box(name, ctx, wall, a0, a1, z0, z1, d0, d1, col=None):
    """Box against a wall: a0..a1 along it, d0..d1 out from its face."""
    col = col or ctx.cols["furniture"]
    if wall == "back":
        return k.box(name, a0, a1, ctx.D - d1, ctx.D - d0, z0, z1, col)
    if wall == "left":
        return k.box(name, d0, d1, a0, a1, z0, z1, col)
    return k.box(name, ctx.W - d1, ctx.W - d0, a0, a1, z0, z1, col)


def wall_point(ctx, wall, a, d, z):
    if wall == "back":
        return (a, ctx.D - d, z)
    if wall == "left":
        return (d, a, z)
    return (ctx.W - d, a, z)


def wall_rotation(wall):
    """Euler for an object modelled facing -y (towards the camera) to face out of `wall`."""
    return {"back": 0.0, "left": -math.pi / 2, "right": math.pi / 2}[wall]


def framed_print(name, ctx, wall, a0, a1, z0, z1, art_mat, frame_mat=None, border=0.05, mat_border=0.0):
    frame = wall_box(f"{name}-frame", ctx, wall, a0, a1, z0, z1, 0.002, 0.03)
    k.assign(frame, frame_mat or k.principled(f"{name}-frame-mat", (0.04, 0.04, 0.04), roughness=0.5))
    k.bevel(frame, 0.002)
    if mat_border:
        passe = wall_box(f"{name}-passe", ctx, wall, a0 + border, a1 - border, z0 + border, z1 - border, 0.028, 0.0312)
        k.assign(passe, k.principled(f"{name}-passe-mat", (0.88, 0.87, 0.84), roughness=0.9, specular=0.1))
        border += mat_border
    canvas = wall_box(f"{name}-canvas", ctx, wall, a0 + border, a1 - border, z0 + border, z1 - border, 0.028, 0.0322)
    k.assign(canvas, art_mat)
    return frame, canvas


def round_mirror(name, ctx, wall, a, z, radius, frame_color=(0.62, 0.48, 0.30), depth=0.025):
    rot = {"back": (math.pi / 2, 0, 0), "left": (math.pi / 2, 0, math.pi / 2), "right": (math.pi / 2, 0, math.pi / 2)}[wall]
    rim = k.cylinder(f"{name}-rim", radius, depth, wall_point(ctx, wall, a, depth / 2 + 0.002, z), rot, ctx.cols["furniture"], 96)
    k.assign(rim, k.principled(f"{name}-rim-mat", frame_color, roughness=0.3, metallic=1.0))
    glass = k.cylinder(f"{name}-glass", radius - 0.012, 0.004, wall_point(ctx, wall, a, depth + 0.003, z), rot, ctx.cols["furniture"], 96)
    k.assign(glass, k.mirror(f"{name}-mirror"))
    return rim, glass


# --- furniture ----------------------------------------------------------------------


def table(name, ctx, x0, x1, y0, y1, height, top_mat, leg_mat, top=0.035, leg=0.05, inset=0.08):
    col = ctx.cols["furniture"]
    t = k.box(f"{name}-top", x0, x1, y0, y1, height - top, height, col)
    k.assign(t, top_mat)
    k.bevel(t, 0.004, 3)
    legs = [k.box(f"{name}-leg-{i}", x - leg / 2, x + leg / 2, y - leg / 2, y + leg / 2, 0, height - top, col)
            for i, (x, y) in enumerate([(x0 + inset, y0 + inset), (x1 - inset, y0 + inset),
                                         (x0 + inset, y1 - inset), (x1 - inset, y1 - inset)])]
    lg = k.join(f"{name}-legs", legs)
    k.assign(lg, leg_mat)
    k.bevel(lg, 0.003)
    return t, lg


def base_units(name, ctx, wall, a0, a1, front_mat, top_mat, *, depth=0.60, height=0.90, top=0.03, plinth=0.10,
               door_w=0.60, gap=0.003, overhang=0.02, carcass_mat=None):
    """Kitchen base run: recessed plinth, fronts with shadow gaps, worktop."""
    col = ctx.cols["furniture"]
    plinth_mat = k.principled(f"{name}-plinth", (0.08, 0.08, 0.08), roughness=0.6)
    p = wall_box(f"{name}-plinth", ctx, wall, a0, a1, 0, plinth, 0, depth - 0.06)
    k.assign(p, plinth_mat)
    carcass = wall_box(f"{name}-carcass", ctx, wall, a0, a1, plinth, height - top, 0, depth - 0.02)
    # Carcass ends show, so they take the front finish unless told otherwise.
    k.assign(carcass, carcass_mat or front_mat)
    n = max(1, round((a1 - a0) / door_w))
    w = (a1 - a0) / n
    fronts = []
    for i in range(n):
        f0, f1 = a0 + i * w + gap / 2, a0 + (i + 1) * w - gap / 2
        # drawer line at 2/3 height on alternate units
        if i % 2 == 0:
            zm = plinth + (height - top - plinth) * 0.62
            fronts.append(wall_box(f"{name}-front-{i}a", ctx, wall, f0, f1, plinth + gap, zm - gap / 2, depth - 0.02, depth))
            fronts.append(wall_box(f"{name}-front-{i}b", ctx, wall, f0, f1, zm + gap / 2, height - top - gap, depth - 0.02, depth))
        else:
            fronts.append(wall_box(f"{name}-front-{i}", ctx, wall, f0, f1, plinth + gap, height - top - gap, depth - 0.02, depth))
    fr = k.join(f"{name}-fronts", fronts)
    k.assign(fr, front_mat)
    k.bevel(fr, 0.0012)
    wt = wall_box(f"{name}-worktop", ctx, wall, a0, a1, height - top, height, 0, depth + overhang)
    k.assign(wt, top_mat)
    k.bevel(wt, 0.002)
    return fr, wt


def wall_units(name, ctx, wall, a0, a1, z0, z1, front_mat, *, depth=0.35, door_w=0.5, gap=0.003):
    col = ctx.cols["furniture"]
    carcass = wall_box(f"{name}-carcass", ctx, wall, a0, a1, z0, z1, 0, depth - 0.02, col)
    k.assign(carcass, front_mat)
    n = max(1, round((a1 - a0) / door_w))
    w = (a1 - a0) / n
    fronts = [wall_box(f"{name}-front-{i}", ctx, wall, a0 + i * w + gap / 2, a0 + (i + 1) * w - gap / 2, z0 + gap, z1 - gap,
                       depth - 0.02, depth, col) for i in range(n)]
    fr = k.join(f"{name}-fronts", fronts)
    k.assign(fr, front_mat)
    k.bevel(fr, 0.0012)
    return fr


def bed(name, ctx, x0, x1, y0, y1, *, frame_mat, mattress_mat, duvet_mat, pillow_mat, head="left",
        frame_h=0.30, mattress_h=0.22, headboard_h=1.05, headboard_mat=None, throw_mat=None):
    """Bed with the headboard against the left (x0) or back (y1) side."""
    col = ctx.cols["furniture"]
    fr = k.rounded_box(f"{name}-frame", x0, x1, y0, y1, 0.06, frame_h, col, 0.02, 3)
    k.assign(fr, frame_mat)
    feet = [k.box(f"{name}-foot-{i}", x - 0.03, x + 0.03, y - 0.03, y + 0.03, 0, 0.07, col)
            for i, (x, y) in enumerate([(x0 + 0.08, y0 + 0.08), (x1 - 0.08, y0 + 0.08), (x0 + 0.08, y1 - 0.08), (x1 - 0.08, y1 - 0.08)])]
    k.assign(k.join(f"{name}-feet", feet), k.principled(f"{name}-feet-mat", (0.05, 0.05, 0.05), roughness=0.5))
    mz0, mz1 = frame_h, frame_h + mattress_h
    inset = 0.03
    mat = k.rounded_box(f"{name}-mattress", x0 + inset, x1 - inset, y0 + inset, y1 - inset, mz0, mz1, col, 0.05, 4)
    k.assign(mat, mattress_mat)
    # Duvet drapes over the mattress and hangs down the open sides.
    if head == "left":
        dx0, dx1, dy0, dy1 = x0 + 0.50, x1 + 0.025, y0 - 0.025, y1 + 0.025
        hb = k.rounded_box(f"{name}-headboard", x0 - 0.10, x0 + 0.02, y0 - 0.08, y1 + 0.08, 0.06, headboard_h, col, 0.03, 4)
        mid = (y0 + y1) / 2
        # two upright pillows against the headboard, one lying in front
        pil = [(x0 + 0.03, x0 + 0.19, y0 + 0.07, mid - 0.03, mz1 - 0.02, mz1 + 0.50),
               (x0 + 0.03, x0 + 0.19, mid + 0.03, y1 - 0.07, mz1 - 0.02, mz1 + 0.50),
               (x0 + 0.20, x0 + 0.34, y0 + 0.25, y1 - 0.25, mz1 - 0.01, mz1 + 0.30)]
    else:
        dx0, dx1, dy0, dy1 = x0 - 0.025, x1 + 0.025, y0 - 0.025, y1 - 0.50
        hb = k.rounded_box(f"{name}-headboard", x0 - 0.08, x1 + 0.08, y1 - 0.02, y1 + 0.10, 0.06, headboard_h, col, 0.03, 4)
        mid = (x0 + x1) / 2
        pil = [(x0 + 0.07, mid - 0.03, y1 - 0.19, y1 - 0.03, mz1 - 0.02, mz1 + 0.42),
               (mid + 0.03, x1 - 0.07, y1 - 0.19, y1 - 0.03, mz1 - 0.02, mz1 + 0.42)]
        if x1 - x0 < 1.2:
            pil = [(x0 + 0.08, x1 - 0.08, y1 - 0.19, y1 - 0.03, mz1 - 0.02, mz1 + 0.40)]
    k.assign(hb, headboard_mat or frame_mat)
    duv = k.rounded_box(f"{name}-duvet", dx0, dx1, dy0, dy1, mz0 - 0.12, mz1 + 0.05, col, 0.05, 5)
    k.assign(duv, duvet_mat)
    for i, (a0, a1, b0, b1, c0, c1) in enumerate(pil):
        pw = k.rounded_box(f"{name}-pillow-{i}", a0, a1, b0, b1, c0, c1, col, 0.06, 5)
        k.assign(pw, pillow_mat)
    if throw_mat is not None:
        # a folded blanket lying across the foot of the duvet
        if head == "left":
            t = k.rounded_box(f"{name}-throw", x1 - 0.50, x1 - 0.12, y0 + 0.01, y1 - 0.01, mz1 + 0.035, mz1 + 0.085, col, 0.02, 4)
        else:
            t = k.rounded_box(f"{name}-throw", x0 + 0.01, x1 - 0.01, y0 + 0.12, y0 + 0.50, mz1 + 0.035, mz1 + 0.085, col, 0.02, 4)
        k.assign(t, throw_mat)
    return mat


def pendant(name, ctx, x, y, drop, *, radius=0.18, height=0.22, shade_mat=None, strength=8.0):
    """Ceiling pendant: cord, conical shade, warm bulb (area light inside)."""
    col = ctx.cols["furniture"]
    H = ctx.H
    z = H - drop
    cord = k.cylinder(f"{name}-cord", 0.003, drop - height, (x, y, H - (drop - height) / 2), (0, 0, 0), col, 12)
    k.assign(cord, k.principled(f"{name}-cord-mat", (0.03, 0.03, 0.03), roughness=0.5))
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=radius, radius2=radius * 0.18, depth=height, location=(x, y, z + height / 2))
    shade = bpy.context.object
    shade.name = f"{name}-shade"
    for c in shade.users_collection:
        c.objects.unlink(shade)
    col.objects.link(shade)
    sol = shade.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.004
    bm = shade.data
    # open the bottom: remove the base face
    import bmesh
    b = bmesh.new()
    b.from_mesh(bm)
    big = max(b.faces, key=lambda f: f.calc_area() if len(f.verts) > 4 else 0)
    bmesh.ops.delete(b, geom=[big], context="FACES")
    b.to_mesh(bm)
    b.free()
    k.shade_smooth(shade)
    k.assign(shade, shade_mat or k.principled(f"{name}-shade-mat", (0.08, 0.08, 0.075), roughness=0.35, metallic=0.8))
    bulb = k.sphere(f"{name}-bulb", 0.035, (x, y, z + 0.03), col, segments=24)
    k.assign(bulb, k.emission(f"{name}-bulb-mat", (1.0, 0.82, 0.6), strength))
    light = k.point_light(f"{name}-light", 25.0, (x, y, z + 0.02), radius=0.04)
    return shade, light


def table_lamp(name, ctx, x, y, z, *, base_mat=None, shade_color=(0.93, 0.90, 0.84), energy=6.0):
    col = ctx.cols["furniture"]
    base = k.cylinder(f"{name}-base", 0.065, 0.28, (x, y, z + 0.14), (0, 0, 0), col, 48)
    k.assign(base, base_mat or k.principled(f"{name}-base-mat", (0.70, 0.66, 0.60), roughness=0.3))
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.15, radius2=0.11, depth=0.20, end_fill_type="NOTHING",
                                    location=(x, y, z + 0.37))
    shade = bpy.context.object
    shade.name = f"{name}-shade"
    for c in shade.users_collection:
        c.objects.unlink(shade)
    col.objects.link(shade)
    k.shade_smooth(shade)
    mat = k.principled(f"{name}-shade-mat", shade_color, roughness=0.9, specular=0.1)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Transmission Weight"].default_value = 0.0
    bsdf.inputs["Subsurface Weight"].default_value = 0.3
    k.assign(shade, mat)
    sol = shade.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.003
    light = k.point_light(f"{name}-light", energy, (x, y, z + 0.36), radius=0.03, color=(1.0, 0.8, 0.55))
    return shade, light


def curtain(name, ctx, wall, a0, a1, *, color=(0.92, 0.91, 0.89), folds=9, depth=0.10, amp=0.035, z0=0.015, z1=None,
            mat=None):
    """Gently folded curtain panel hanging along a wall."""
    z1 = z1 if z1 is not None else ctx.H - 0.045
    cols, verts, faces = 48, [], []
    for r, z in enumerate((z0, z1)):
        for j in range(cols + 1):
            t = j / cols
            a = a0 + (a1 - a0) * t
            d = depth + amp * math.sin(t * math.pi * folds)
            verts.append(wall_point(ctx, wall, a, d, z))
    for j in range(cols):
        faces.append((j, j + 1, cols + 2 + j, cols + 1 + j))
    cur = k.mesh_object(name, verts, faces, ctx.cols["furniture"])
    k.assign(cur, mat or k.sheer_curtain(f"{name}-mat", color))
    k.shade_smooth(cur)
    return cur


def books(name, ctx, x0, y0, y1, z, count=6, axis="x", colors=None, height=0.22):
    colors = colors or [(0.55, 0.22, 0.16), (0.82, 0.78, 0.70), (0.18, 0.25, 0.32), (0.70, 0.58, 0.40),
                        (0.25, 0.25, 0.24), (0.62, 0.66, 0.58), (0.85, 0.82, 0.76)]
    out = []
    a = x0
    for i in range(count):
        t = 0.025 + 0.012 * ((i * 7) % 3)
        h = height - 0.03 * ((i * 5) % 3)
        b = k.box(f"{name}-{i}", a, a + t, y0, y1, z, z + h, ctx.cols["furniture"]) if axis == "x" else \
            k.box(f"{name}-{i}", y0, y1, a, a + t, z, z + h, ctx.cols["furniture"])
        k.assign(b, k.principled(f"{name}-{i}-mat", colors[i % len(colors)], roughness=0.65))
        k.bevel(b, 0.002)
        out.append(b)
        a += t + 0.002
    return out
