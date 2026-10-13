"""Single source of truth for the living-render-01 proof room.

All lengths are metres in Blender world space: x to the right, y away from the
camera, z up; the floor is z = 0 and the room interior spans x 0..W, y 0..D.
Door, casing and skirting sizes match the trim products in brand/products.json
(pervaze-mdf 2200x70x16, lajsne-mdf 2400x80x16) and a Kosovo-standard leaf.
"""

SCENE_ID = "living-render-01"

ROOM = {"width": 5.2, "depth": 6.0, "height": 2.7, "wall": 0.15}

# Door on the back wall (y = D). Leaf 900x2000x40 mm, rough opening 205 cm high.
DOOR = {
    "center_x": 3.85,
    "leaf_width": 0.900,
    "leaf_height": 2.000,
    "leaf_thickness": 0.040,
    "floor_gap": 0.008,
    "rough_opening_width": 1.000,
    "rough_opening_height": 2.050,
    "frame_reveal": 0.010,  # frame strip visible between casing and leaf
    "leaf_gap": 0.003,  # dark shadow gap between frame and leaf
    "handle_height": 1.050,
    "hinge_side": "left",
}
CASING = {"width": 0.070, "depth": 0.016, "length": 2.200}
SKIRTING = {"height": 0.080, "depth": 0.016, "length": 2.400}

# Window in the left wall (x = 0).
WINDOW = {"y0": 1.95, "y1": 4.75, "z0": 0.80, "z1": 2.48, "wall": 0.30, "frame": 0.060}

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

# Door models (Phase 2). Each renders its own layer set from the same room and
# camera; the importer keeps only the region that differs from "flat".
#   flat         plain leaf, casing and visible hinges (the Phase 1 door)
#   grooved      four horizontal milled grooves, 8 mm wide and 3 mm deep
#   glass-insert centred satin-glass strip (260 x 1500 mm) held in the leaf
#   filomuro     leaf flush with the wall, concealed aluminium frame and
#                hinges, no casing; skirting runs to the opening
DOOR_MODELS = {
    "flat": {"casing": True},
    "grooved": {"casing": True, "grooves": {"count": 4, "width": 0.008, "depth": 0.003}},
    "glass-insert": {"casing": True, "glass": {"width": 0.260, "z0": 0.35, "z1": 1.85}},
    "filomuro": {"casing": False, "gap": 0.003},
}
DEFAULT_MODEL = "flat"
# A short lit corridor behind the door, seen only through the glass insert.
CORRIDOR = {"depth": 1.6, "half_width": 1.2, "light": 12.0}

# Editable surfaces, each with its own shader AOV for antialiased coverage.
SURFACES = [
    {"id": "floor", "role": "floor"},
    {"id": "leaf", "role": "door-leaf"},
    {"id": "frame-left", "role": "frame"},
    {"id": "frame-right", "role": "frame"},
    {"id": "frame-top", "role": "frame"},
    {"id": "skirting-left", "role": "skirting"},
    {"id": "skirting-back-left", "role": "skirting"},
    {"id": "skirting-back-right", "role": "skirting"},
    {"id": "skirting-right", "role": "skirting"},
]
PROTECTED_AOV = "s_protected"


def surfaces_for(model: str):
    """Editable surfaces of a door model (filomuro has no casing)."""
    if DOOR_MODELS[model]["casing"]:
        return SURFACES
    return [s for s in SURFACES if s["role"] != "frame"]


def aov_name(surface_id: str) -> str:
    return "s_" + surface_id.replace("-", "_")


def door_geometry(model: str = DEFAULT_MODEL):
    """Derived door/casing coordinates (metres). Filomuro has no casing: its
    "casing" bounds collapse onto the plastered opening around the leaf."""
    d, c, r = DOOR, CASING, ROOM
    cx, D = d["center_x"], r["depth"]
    leaf_x0, leaf_x1 = cx - d["leaf_width"] / 2, cx + d["leaf_width"] / 2
    leaf_z0 = d["floor_gap"]
    leaf_z1 = leaf_z0 + d["leaf_height"]
    inner_x0, inner_x1 = leaf_x0 - d["frame_reveal"], leaf_x1 + d["frame_reveal"]
    inner_z = leaf_z1 + d["frame_reveal"]
    if not DOOR_MODELS[model]["casing"]:
        gap = DOOR_MODELS[model]["gap"]
        return {
            "D": D,
            "leaf": (leaf_x0, leaf_x1, leaf_z0, leaf_z1),
            "casing_inner": (leaf_x0 - gap, leaf_x1 + gap, leaf_z1 + gap),
            "casing_outer": (leaf_x0 - gap, leaf_x1 + gap, leaf_z1 + gap),
            "opening": (leaf_x0 - gap, leaf_x1 + gap, leaf_z1 + gap),
        }
    return {
        "D": D,
        "leaf": (leaf_x0, leaf_x1, leaf_z0, leaf_z1),
        "casing_inner": (inner_x0, inner_x1, inner_z),
        "casing_outer": (inner_x0 - c["width"], inner_x1 + c["width"], inner_z + c["width"]),
        "opening": (cx - d["rough_opening_width"] / 2, cx + d["rough_opening_width"] / 2, d["rough_opening_height"]),
    }
