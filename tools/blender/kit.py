"""Shared Blender helpers for the room builders (geometry, materials, CC0 assets).

Imported by build_room.py and by every room module in tools/blender/rooms/.
All lengths are metres; x right, y away from the camera, z up.
"""
import math
from pathlib import Path

import bpy
import bmesh

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache" / "polyhaven"


# --- geometry ---------------------------------------------------------------


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


def xy(a, b, t):
    return (a, b, t)


def xz(a, b, t):
    return (a, t, b)


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


def subdivide(ob, levels=2):
    m = ob.modifiers.new("subsurf", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
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


def sphere(name, radius, location, col, scale=(1, 1, 1), segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=radius, location=location)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    for c in ob.users_collection:
        c.objects.unlink(ob)
    col.objects.link(ob)
    bpy.ops.object.shade_smooth()
    return ob


def rounded_box(name, x0, x1, y0, y1, z0, z1, col, radius, segments=4):
    """Box with rounded edges (upholstery, mattresses, basins)."""
    ob = box(name, x0, x1, y0, y1, z0, z1, col)
    bevel(ob, radius, segments)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def shade_smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
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


def emission(name, color, strength):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], out.inputs["Surface"])
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


def clear_glass(name="clear-glass"):
    """Clear architectural glass (shower screens, mirrors' cover): transmissive."""
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.97, 0.99, 0.98, 1)
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.0
    bsdf.inputs["IOR"].default_value = 1.5
    return m


def mirror(name="mirror"):
    return principled(name, (0.92, 0.93, 0.93), roughness=0.02, metallic=1.0)


def satin_glass():
    """Acid-etched (satin) door glass: diffuse transmission, soft sheen."""
    m = bpy.data.materials.new("door-satin-glass")
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.96, 0.97, 0.97, 1)
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.32
    bsdf.inputs["IOR"].default_value = 1.5
    return m


def sheer_curtain(name="sheer-curtain", color=(0.92, 0.91, 0.89)):
    sheer = bpy.data.materials.new(name)
    snt = sheer.node_tree
    snt.nodes.clear()
    sout = snt.nodes.new("ShaderNodeOutputMaterial")
    diff = snt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (*color, 1)
    trans = snt.nodes.new("ShaderNodeBsdfTranslucent")
    trans.inputs["Color"].default_value = (color[0], color[1], color[2] - 0.01, 1)
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
    return sheer


def textured(name, tex_id, tile_m, *, saturation=1.0, value=1.0, hue=0.5, tint=None, normal_strength=1.0,
             sheen=0.0, coord="Object", rotate_deg=0.0):
    """Principled material from a Poly Haven texture set (diff/rough/nor_gl),
    tiled at its real-world size `tile_m` (w, h metres), optionally recoloured."""
    tex = CACHE / tex_id
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / tile_m[0], 1 / tile_m[1], 1 / tile_m[0])
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(rotate_deg))
    nt.links.new(tc.outputs[coord], mapping.inputs["Vector"])
    files = {p.name.split(f"{tex_id}_")[1].rsplit("_", 1)[0]: p for p in tex.glob(f"{tex_id}_*.jpg")}

    def image(kind, non_color):
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(files[kind]))
        node.projection = "BOX"
        node.projection_blend = 0.2
        if non_color:
            node.image.colorspace_settings.name = "Non-Color"
        nt.links.new(mapping.outputs[0], node.inputs["Vector"])
        return node

    diffuse = image("diff", False)
    hsv = nt.nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Hue"].default_value = hue
    hsv.inputs["Saturation"].default_value = saturation
    hsv.inputs["Value"].default_value = value
    nt.links.new(diffuse.outputs["Color"], hsv.inputs["Color"])
    colour = hsv.outputs[0]
    if tint is not None:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        sock(mix, "Factor_Float").default_value = 1.0
        nt.links.new(colour, sock(mix, "A_Color"))
        sock(mix, "B_Color").default_value = (*tint, 1)
        colour = sock(mix, "Result_Color", True)
    nt.links.new(colour, bsdf.inputs["Base Color"])
    rough = image("rough", True)
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    normal = image("nor_gl", True)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = normal_strength
    nt.links.new(normal.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs[0], bsdf.inputs["Normal"])
    bsdf.inputs["Sheen Weight"].default_value = sheen
    return m


def tiles(name, tile_m, grout_m, *, color=(0.78, 0.77, 0.75), grout=(0.55, 0.54, 0.52), roughness=0.18, axes="xy"):
    """Large-format porcelain tiles: a grid with recessed grout lines and a
    procedural marble-look face. `axes` names the two world axes the grid runs
    along (xy floor, xz / yz walls)."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    idx = {"x": 0, "y": 1, "z": 2}

    def line(axis, size):
        # distance (metres) from the nearest grout centre line along one axis
        div = nt.nodes.new("ShaderNodeMath")
        div.operation = "WRAP"
        nt.links.new(sep.outputs[idx[axis]], div.inputs[0])
        div.inputs[1].default_value = 0.0
        div.inputs[2].default_value = size
        d = nt.nodes.new("ShaderNodeMath")
        d.operation = "PINGPONG"
        nt.links.new(div.outputs[0], d.inputs[0])
        d.inputs[1].default_value = size / 2
        return d

    a, b = line(axes[0], tile_m[0]), line(axes[1], tile_m[1])
    mn = nt.nodes.new("ShaderNodeMath")
    mn.operation = "MINIMUM"
    nt.links.new(a.outputs[0], mn.inputs[0])
    nt.links.new(b.outputs[0], mn.inputs[1])
    # 0 in the grout, 1 on the tile face, with a 1 mm soft edge
    edge = nt.nodes.new("ShaderNodeMapRange")
    edge.inputs["From Min"].default_value = grout_m / 2
    edge.inputs["From Max"].default_value = grout_m / 2 + 0.001
    nt.links.new(mn.outputs[0], edge.inputs["Value"])
    # Procedural porcelain: faint cloudy variation with soft veins.
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.55
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    vein = nt.nodes.new("ShaderNodeTexWave")
    vein.bands_direction = "DIAGONAL"
    vein.inputs["Scale"].default_value = 0.5
    vein.inputs["Distortion"].default_value = 22.0
    vein.inputs["Detail"].default_value = 10.0
    vein.inputs["Detail Scale"].default_value = 1.6
    nt.links.new(tc.outputs["Object"], vein.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[c * 0.93 for c in color], 1)
    ramp.color_ramp.elements[1].color = (*[min(1.0, c * 1.03) for c in color], 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    vr = nt.nodes.new("ShaderNodeValToRGB")
    vr.color_ramp.elements[0].position = 0.0
    vr.color_ramp.elements[1].position = 0.05
    vr.color_ramp.elements[0].color = (*[c * 0.90 for c in color], 1)
    vr.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(vein.outputs["Fac"], vr.inputs["Fac"])
    vm = nt.nodes.new("ShaderNodeMix")
    vm.data_type = "RGBA"
    vm.blend_type = "MULTIPLY"
    sock(vm, "Factor_Float").default_value = 0.5
    nt.links.new(ramp.outputs["Color"], sock(vm, "A_Color"))
    nt.links.new(vr.outputs["Color"], sock(vm, "B_Color"))
    face = sock(vm, "Result_Color", True)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(edge.outputs[0], sock(mix, "Factor_Float"))
    sock(mix, "A_Color").default_value = (*grout, 1)
    nt.links.new(face, sock(mix, "B_Color"))
    nt.links.new(sock(mix, "Result_Color", True), bsdf.inputs["Base Color"])
    rmix = nt.nodes.new("ShaderNodeMapRange")
    rmix.inputs["To Min"].default_value = 0.8
    rmix.inputs["To Max"].default_value = roughness
    nt.links.new(edge.outputs[0], rmix.inputs["Value"])
    nt.links.new(rmix.outputs[0], bsdf.inputs["Roughness"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 0.0015
    nt.links.new(edge.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])
    return m


def sock(node, identifier, outputs=False):
    """Socket by identifier (names repeat on Mix nodes: A_Float, A_Color, ...)."""
    return next(x for x in (node.outputs if outputs else node.inputs) if x.identifier == identifier)


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


# --- CC0 assets -------------------------------------------------------------


def append_blend(asset_id, col):
    path = next((CACHE / asset_id).glob("*.blend"))
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = list(src.objects)
    objs = [o for o in dst.objects if o is not None]
    for o in objs:
        col.objects.link(o)
    return objs


def place(objs, location, rot_z_deg, name, scale=1.0):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    root.location = location
    root.rotation_euler = (0, 0, math.radians(rot_z_deg))
    root.scale = (scale, scale, scale)
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


def asset(asset_id, col, at, rot=0.0, name=None, scale=1.0):
    """Append a pinned Poly Haven model (blend or glTF) and place its root."""
    folder = CACHE / asset_id
    objs = append_blend(asset_id, col) if any(folder.glob("*.blend")) else import_gltf(asset_id, col)
    return place(objs, at, rot, name or asset_id, scale)


def area_light(name, size, energy, location, rotation=(0, 0, 0), color=(1.0, 0.96, 0.9), size_y=None,
               visible=False, spread_deg=180.0):
    light = bpy.data.lights.new(name, "AREA")
    if size_y is not None:
        light.shape = "RECTANGLE"
        light.size, light.size_y = size, size_y
    else:
        light.size = size
    light.energy = energy
    light.color = color
    light.spread = math.radians(spread_deg)
    ob = bpy.data.objects.new(name, light)
    ob.location = location
    ob.rotation_euler = rotation
    ob.visible_camera = visible
    ob.visible_glossy = visible
    bpy.context.scene.collection.objects.link(ob)
    return ob


def spot_light(name, energy, location, *, angle_deg=70.0, blend=0.6, radius=0.03, color=(1.0, 0.86, 0.68),
               rotation=(0, 0, 0)):
    light = bpy.data.lights.new(name, "SPOT")
    light.energy = energy
    light.spot_size = math.radians(angle_deg)
    light.spot_blend = blend
    light.shadow_soft_size = radius
    light.color = color
    ob = bpy.data.objects.new(name, light)
    ob.location = location
    ob.rotation_euler = rotation
    bpy.context.scene.collection.objects.link(ob)
    return ob


def point_light(name, energy, location, radius=0.05, color=(1.0, 0.85, 0.65)):
    light = bpy.data.lights.new(name, "POINT")
    light.energy = energy
    light.shadow_soft_size = radius
    light.color = color
    ob = bpy.data.objects.new(name, light)
    ob.location = location
    bpy.context.scene.collection.objects.link(ob)
    return ob
