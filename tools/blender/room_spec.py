"""Shared definitions for the Blender-rendered Studio rooms.

Each room lives in tools/blender/rooms/<scene_id with _>.py and defines its
shell, door position, window, camera, lighting and furniture (`furnish`).
`load(room_id)` returns that module with the shared defaults filled in.

All lengths are metres in Blender world space: x to the right, y away from the
camera, z up; the floor is z = 0 and the room interior spans x 0..W, y 0..D.
The editable door always sits in the back wall (y = D). Door, casing and
skirting sizes match the trim products in brand/products.json
(pervaze-mdf 2200x70x16, lajsne-mdf 2400x80x16) and a Kosovo-standard leaf.
"""
import importlib
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

# Rooms in Studio order (first = the Studio's default room).
ROOMS = [
    "living-render-01",
    "kitchen-render-01",
    "bedroom-render-01",
    "hallway-render-01",
    "hallway-render-02",
    "kids-render-01",
    "bathroom-render-01",
]

# Leaf 900x2000x40 mm, rough opening 205 cm high.
DOOR_DEFAULTS = {
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

# Door models (Phase 2). Each renders its own layer set from the same room and
# camera; the importer keeps only the region that differs from the room's
# default model.
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
MODEL_ORDER = ["flat", "grooved", "glass-insert", "filomuro"]
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


def load(room_id: str):
    """The room module with shared defaults filled in."""
    if room_id not in ROOMS:
        raise SystemExit(f"Unknown room {room_id}; known: {', '.join(ROOMS)}")
    room = importlib.import_module("rooms." + room_id.replace("-", "_"))
    room.DOOR = {**DOOR_DEFAULTS, **room.DOOR}
    for name, value in (("DEFAULT_MODEL", "flat"), ("CORRIDOR", CORRIDOR), ("EDITABLE_FLOOR", True),
                        ("SKIRTING_WALLS", True), ("WINDOW", None), ("HDRI", None)):
        if not hasattr(room, name):
            setattr(room, name, value)
    if room.SCENE_ID != room_id:
        raise SystemExit(f"{room_id}: module declares {room.SCENE_ID}")
    return room


def models_for(room):
    """Door models of a room, its default first."""
    return [room.DEFAULT_MODEL] + [m for m in MODEL_ORDER if m != room.DEFAULT_MODEL]


def surfaces_for(room, model: str):
    """Editable surfaces of a room and door model (filomuro has no casing;
    rooms with a fixed floor or no MDF skirting drop those surfaces)."""
    out = []
    for s in SURFACES:
        if s["role"] == "frame" and not DOOR_MODELS[model]["casing"]:
            continue
        if s["role"] == "floor" and not room.EDITABLE_FLOOR:
            continue
        if s["role"] == "skirting" and not room.SKIRTING_WALLS:
            continue
        out.append(s)
    return out


def aov_name(surface_id: str) -> str:
    return "s_" + surface_id.replace("-", "_")


def door_geometry(room, model: str):
    """Derived door/casing coordinates (metres). Filomuro has no casing: its
    "casing" bounds collapse onto the plastered opening around the leaf."""
    d, c, r = room.DOOR, CASING, room.ROOM
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
