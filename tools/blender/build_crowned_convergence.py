"""
Dark Lattice — Crowned Convergence deterministic Blender mesh generator.

This script creates a controllable first production mesh from the locked
Crowned Convergence concept. It does not use AI reconstruction or stock assets.

Recommended run from the Website repository root:

Windows:
  "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" ^
    --background --python tools/blender/build_crowned_convergence.py -- ^
    --root "C:/path/to/Website" --render

macOS/Linux:
  blender --background --python tools/blender/build_crowned_convergence.py -- \
    --root "/path/to/Website" --render

Outputs:
  assets/blender/DL_CrownedConvergence_Clay_v01.blend
  public/models/DL_CrownedConvergence_Clay_v01.glb
  captures/crowned-convergence-clay/*.png
  captures/crowned-convergence-clay/mesh-manifest.json

The generator intentionally separates:
  - seven authored exterior slabs;
  - three authored primary ring meshes;
  - six continuation rings grouped into three meshes;
  - an inward-facing tunnel shell and threshold chamber;
  - a three-mass Latent Form;
  - halo, pivots, custom properties, camera path and clearance guide.

Founder QA remains the visual gate. Tune the authored specification tables rather
than replacing the design with random/procedural alternatives.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector


# ---------------------------------------------------------------------------
# Arguments and paths
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=os.getcwd(), help="Website repository root.")
    parser.add_argument(
        "--reference",
        default="references/crowned-convergence-visual-identity.png",
        help="Concept image relative to root, or absolute path.",
    )
    parser.add_argument("--render", action="store_true", help="Render diagnostic PNGs.")
    parser.add_argument("--preview-materials", action="store_true")
    return parser.parse_args(argv)


ARGS = parse_args()
ROOT = Path(ARGS.root).resolve()

# Approved versions are never overwritten. Bump this when the authored
# tables change; v01 remains on disk for comparison.
VERSION = "v02"

BLEND_OUT = ROOT / "assets" / "blender" / f"DL_CrownedConvergence_Clay_{VERSION}.blend"
GLB_OUT = ROOT / "public" / "models" / f"DL_CrownedConvergence_Clay_{VERSION}.glb"
CAPTURE_DIR = ROOT / "captures" / f"crowned-convergence-clay-{VERSION}"
MANIFEST_OUT = CAPTURE_DIR / "mesh-manifest.json"

REFERENCE = Path(ARGS.reference)
if not REFERENCE.is_absolute():
    REFERENCE = ROOT / REFERENCE


# ---------------------------------------------------------------------------
# Locked design data — tune these values, do not randomise them.
# Blender coordinates: X horizontal, Z vertical, +Y travels into the entity.
# ---------------------------------------------------------------------------

# v02 changes to this table, against the concept board:
#   - half_angle_deg 19-30 -> 11-18. At 25-30 degrees each slab spanned
#     ~55 degrees of the ring and read as a smooth pentagon facet; the
#     board's shards are narrow.
#   - inner_r ~1.0-1.2 -> 1.38-1.55, opening the hollow. This is the
#     "Hollow Convergence": the cavity should dominate the face.
#   - spike raised on 01/03/05 ONLY (1.09-1.13 -> 1.24-1.42) so three
#     points break the outline. Raising all seven would restore the
#     radial-symmetry problem the narrow slabs exist to remove.
#   - a secondary tier added below, filling the gaps the narrower
#     primaries open up, for the board's large/small hierarchy.

CROWN_SPECS = [
    {
        "name": "DL_CrownSlab_01",
        "angle_deg": 93.0,
        "half_angle_deg": 17.0,
        "inner_r": 1.42,
        "outer_r": 2.55,
        "spike": 1.42,
        "depth": 0.88,
        "y": -0.18,
        "rot": (-6.0, 4.0, -3.0),
        "material": "MAT_CROWN_PRIMARY",
        "layer": 1,
        "open_translation": (-0.02, -0.01, 0.13),
        "open_rotation": (-3.0, 1.0, -1.0),
    },
    {
        "name": "DL_CrownSlab_02",
        "angle_deg": 146.0,
        "half_angle_deg": 15.0,
        "inner_r": 1.45,
        "outer_r": 2.40,
        "spike": 1.10,
        "depth": 0.82,
        "y": -0.28,
        "rot": (5.0, -8.0, 3.0),
        "material": "MAT_CROWN_PRIMARY",
        "layer": 1,
        "open_translation": (-0.11, -0.01, 0.04),
        "open_rotation": (1.0, -4.0, 2.0),
    },
    {
        "name": "DL_CrownSlab_03",
        "angle_deg": 35.0,
        "half_angle_deg": 18.0,
        "inner_r": 1.38,
        "outer_r": 2.62,
        "spike": 1.32,
        "depth": 1.02,
        "y": -0.10,
        "rot": (-2.0, 8.0, -2.0),
        "material": "MAT_CROWN_PRIMARY",
        "layer": 2,
        "open_translation": (0.12, 0.01, 0.06),
        "open_rotation": (-1.0, 4.0, -2.0),
    },
    {
        "name": "DL_CrownSlab_04",
        "angle_deg": 201.0,
        "half_angle_deg": 16.0,
        "inner_r": 1.48,
        "outer_r": 2.33,
        "spike": 1.08,
        "depth": 0.88,
        "y": -0.12,
        "rot": (3.0, -5.0, -3.0),
        "material": "MAT_CROWN_SECONDARY",
        "layer": 2,
        "open_translation": (-0.09, 0.00, -0.08),
        "open_rotation": (2.0, -3.0, -2.0),
    },
    {
        "name": "DL_CrownSlab_05",
        "angle_deg": 318.0,
        "half_angle_deg": 17.0,
        "inner_r": 1.40,
        "outer_r": 2.56,
        "spike": 1.24,
        "depth": 1.00,
        "y": -0.05,
        "rot": (-3.0, 7.0, 2.0),
        "material": "MAT_CROWN_PRIMARY",
        "layer": 3,
        "open_translation": (0.11, 0.01, -0.10),
        "open_rotation": (-2.0, 4.0, 2.0),
    },
    {
        "name": "DL_CrownSlab_06",
        "angle_deg": 63.0,
        "half_angle_deg": 12.0,
        "inner_r": 1.55,
        "outer_r": 2.34,
        "spike": 1.07,
        "depth": 0.66,
        "y": 0.28,
        "rot": (7.0, 2.0, 4.0),
        "material": "MAT_CROWN_SECONDARY",
        "layer": 3,
        "open_translation": (0.04, 0.03, 0.08),
        "open_rotation": (3.0, 1.0, 2.0),
    },
    {
        "name": "DL_CrownSlab_07",
        "angle_deg": 255.0,
        "half_angle_deg": 13.0,
        "inner_r": 1.52,
        "outer_r": 2.35,
        "spike": 1.06,
        "depth": 0.72,
        "y": 0.34,
        "rot": (-5.0, -2.0, 4.0),
        "material": "MAT_CROWN_SECONDARY",
        "layer": 3,
        "open_translation": (-0.03, 0.04, -0.09),
        "open_rotation": (-3.0, -1.0, 3.0),
    },
]

# Secondary tier. Seated in the gaps between the primaries, at shorter
# reach and greater depth, so the crown has two clear scales rather than
# one row of equals. Angles sit at the primary midpoints, nudged off so
# the ring never reads as evenly spaced.
CROWN_SPECS += [
    {
        "name": "DL_CrownShard_%02d" % (index + 1),
        "angle_deg": angle,
        "half_angle_deg": half_angle,
        "inner_r": inner_r,
        "outer_r": outer_r,
        "spike": spike,
        "depth": depth,
        "y": y,
        "rot": rot,
        "material": "MAT_CROWN_SECONDARY",
        "layer": 3,
        "open_translation": (0.0, 0.02, 0.05),
        "open_rotation": (1.5, 0.0, 1.0),
    }
    for index, (angle, half_angle, inner_r, outer_r, spike, depth, y, rot) in enumerate(
        [
            ( 47.0, 11.0, 1.50, 1.92, 1.12, 0.54,  0.30, ( 4.0, -3.0,  2.0)),
            ( 78.0, 13.0, 1.46, 2.02, 1.18, 0.62,  0.16, (-5.0,  2.0, -2.0)),
            (117.0, 12.0, 1.52, 1.86, 1.09, 0.50,  0.34, ( 3.0,  5.0,  3.0)),
            (171.0, 14.0, 1.44, 1.98, 1.14, 0.58,  0.12, (-2.0, -6.0, -3.0)),
            (226.0, 11.0, 1.54, 1.78, 1.07, 0.48,  0.36, ( 6.0,  3.0,  2.0)),
            (284.0, 13.0, 1.47, 1.95, 1.16, 0.56,  0.20, (-4.0,  4.0, -2.0)),
            (352.0, 12.0, 1.51, 1.88, 1.10, 0.52,  0.28, ( 2.0, -5.0,  3.0)),
        ]
    )
]

CAMERA_PATH_POINTS = [
    (0.00, -8.20, 0.38),
    (0.00, -4.60, 0.22),
    (0.02, -1.70, 0.08),
    (0.04, 0.55, 0.02),
    (0.02, 2.90, 0.01),
    (-0.02, 5.30, 0.04),
    (0.00, 7.65, -0.02),
    (0.00, 9.25, 0.00),
]


# ---------------------------------------------------------------------------
# Scene and utilities
# ---------------------------------------------------------------------------

def ensure_dirs() -> None:
    BLEND_OUT.parent.mkdir(parents=True, exist_ok=True)
    GLB_OUT.parent.mkdir(parents=True, exist_ok=True)
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)


def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    return scene


SCENE = reset_scene()
ensure_dirs()


def create_empty(name: str, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.25
    SCENE.collection.objects.link(obj)
    obj.parent = parent
    obj["dl_export"] = True
    return obj


ROOT_OBJ = create_empty("DL_CrownedConvergence_ROOT")
EXTERIOR = create_empty("DL_Exterior", ROOT_OBJ)
CONVERGENCE = create_empty("DL_Convergence", ROOT_OBJ)
LATENT_ROOT = create_empty("DL_LatentForm", ROOT_OBJ)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    metallic: float = 0.0,
    roughness: float = 0.7,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif emission and "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = emission
    return material


MATERIALS = {
    "MAT_CROWN_PRIMARY": make_material("MAT_CROWN_PRIMARY", (0.34, 0.37, 0.40, 1), 0.12, 0.56),
    "MAT_CROWN_SECONDARY": make_material("MAT_CROWN_SECONDARY", (0.23, 0.26, 0.29, 1), 0.10, 0.63),
    "MAT_STRUCTURE": make_material("MAT_STRUCTURE", (0.045, 0.052, 0.060, 1), 0.08, 0.74),
    "MAT_RING": make_material("MAT_RING", (0.13, 0.16, 0.18, 1), 0.12, 0.62),
    "MAT_CORE": make_material(
        "MAT_CORE",
        (0.025, 0.045, 0.052, 1),
        0.05,
        0.45,
        emission=(0.08, 0.55, 0.72, 1),
        emission_strength=1.8 if ARGS.preview_materials else 0.15,
    ),
    "MAT_LATENT": make_material("MAT_LATENT", (0.075, 0.085, 0.095, 1), 0.10, 0.68),
    "MAT_HALO": make_material(
        "MAT_HALO",
        (0.72, 0.43, 0.12, 1),
        0.15,
        0.34,
        emission=(1.0, 0.45, 0.08, 1),
        emission_strength=3.0 if ARGS.preview_materials else 0.45,
    ),
}


REGION_COLOURS = {
    "MAT_CROWN_PRIMARY": (1.0, 0.0, 0.0, 1.0),
    "MAT_CROWN_SECONDARY": (0.0, 1.0, 0.0, 1.0),
    "MAT_STRUCTURE": (0.0, 0.0, 1.0, 1.0),
    "MAT_RING": (0.0, 1.0, 1.0, 1.0),
    "MAT_CORE": (1.0, 1.0, 0.0, 1.0),
    "MAT_LATENT": (1.0, 0.0, 1.0, 1.0),
    "MAT_HALO": (1.0, 0.5, 0.0, 1.0),
}


def signed_area(points: Sequence[tuple[float, float]]) -> float:
    area = 0.0
    for i, (x0, z0) in enumerate(points):
        x1, z1 = points[(i + 1) % len(points)]
        area += x0 * z1 - x1 * z0
    return area * 0.5


def ensure_ccw(points: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    values = list(points)
    return values if signed_area(values) > 0 else list(reversed(values))


def apply_region_mask(mesh: bpy.types.Mesh, colour: tuple[float, float, float, float]) -> None:
    try:
        attribute = mesh.color_attributes.new(
            name="_DL_REGION_MASK",
            type="FLOAT_COLOR",
            domain="CORNER",
        )
        for datum in attribute.data:
            datum.color = colour
        mesh.color_attributes.active_color = attribute
    except Exception as exc:
        print("REGION_MASK_WARNING", mesh.name, exc)


def set_props(
    obj: bpy.types.Object,
    role: str,
    layer: int,
    material_class: str,
    reaction_weight: float,
    visibility_stage: str,
    open_translation: Sequence[float] = (0.0, 0.0, 0.0),
    open_rotation_degrees: Sequence[float] = (0.0, 0.0, 0.0),
    lod_group: str = "LOD0",
) -> None:
    obj["dl_role"] = role
    obj["dl_layer"] = layer
    obj["dl_material_class"] = material_class
    obj["dl_reaction_weight"] = reaction_weight
    obj["dl_visibility_stage"] = visibility_stage
    obj["dl_open_translation"] = list(open_translation)
    obj["dl_open_rotation"] = [math.radians(v) for v in open_rotation_degrees]
    obj["dl_lod_group"] = lod_group
    obj["dl_export"] = True


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_hard_surface_modifiers(
    obj: bpy.types.Object,
    bevel: float = 0.045,
    segments: int = 2,
) -> None:
    activate(obj)
    modifier = obj.modifiers.new("DL_Bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(28)
    try:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    except Exception as exc:
        print("BEVEL_WARNING", obj.name, exc)

    try:
        weighted = obj.modifiers.new("DL_WeightedNormal", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=weighted.name)
    except Exception as exc:
        print("WEIGHTED_NORMAL_WARNING", obj.name, exc)


def create_prism_xz(
    name: str,
    points_xz: Sequence[tuple[float, float]],
    depth: float,
    parent: bpy.types.Object,
    location: Sequence[float],
    rotation_degrees: Sequence[float],
    face_material: str,
    role: str,
    layer: int,
    reaction_weight: float,
    visibility_stage: str,
    open_translation: Sequence[float] = (0.0, 0.0, 0.0),
    open_rotation: Sequence[float] = (0.0, 0.0, 0.0),
    bevel: float = 0.045,
) -> bpy.types.Object:
    points = ensure_ccw(points_xz)
    n = len(points)
    half = depth * 0.5
    vertices = [(x, -half, z) for x, z in points] + [(x, half, z) for x, z in points]
    faces: list[tuple[int, ...]] = []
    faces.append(tuple(range(n)))
    faces.append(tuple(reversed(range(n, n * 2))))
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))

    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(MATERIALS[face_material])
    mesh.materials.append(MATERIALS["MAT_STRUCTURE"])
    for index, polygon in enumerate(mesh.polygons):
        polygon.material_index = 0 if index == 0 else 1
        polygon.use_smooth = False
    apply_region_mask(mesh, REGION_COLOURS[face_material])

    obj = bpy.data.objects.new(name, mesh)
    SCENE.collection.objects.link(obj)
    obj.parent = parent
    obj.location = tuple(location)
    obj.rotation_euler = tuple(math.radians(v) for v in rotation_degrees)
    set_props(
        obj,
        role,
        layer,
        face_material,
        reaction_weight,
        visibility_stage,
        open_translation,
        open_rotation,
    )
    apply_hard_surface_modifiers(obj, bevel=bevel)
    return obj


def polar(radius: float, angle: float) -> tuple[float, float]:
    return radius * math.cos(angle), radius * math.sin(angle)


def crown_polygon(spec: dict) -> tuple[list[tuple[float, float]], tuple[float, float]]:
    centre = math.radians(spec["angle_deg"])
    half = math.radians(spec["half_angle_deg"])
    inner = spec["inner_r"]
    outer = spec["outer_r"]
    spike = spec["spike"]

    pivot = polar(inner, centre)
    world_points = [
        polar(inner * 1.04, centre - half * 0.68),
        polar(outer * 0.91, centre - half),
        polar(outer * 1.01, centre - half * 0.42),
        polar(outer * spike, centre + half * 0.02),
        polar(outer * 0.98, centre + half * 0.46),
        polar(outer * 0.90, centre + half),
        polar(inner * 1.03, centre + half * 0.72),
        # The inner tail reached to 0.80 x inner_r, so raising inner_r
        # alone would not have opened the cavity — the tails still
        # closed across it. 0.93 keeps a shallow inner notch while
        # letting inner_r actually set the aperture.
        polar(inner * 0.93, centre + half * 0.10),
    ]
    local = [(x - pivot[0], z - pivot[1]) for x, z in world_points]
    return local, pivot


# ---------------------------------------------------------------------------
# Exterior crown
# ---------------------------------------------------------------------------

CROWN_OBJECTS: list[bpy.types.Object] = []
for spec in CROWN_SPECS:
    polygon, pivot = crown_polygon(spec)
    obj = create_prism_xz(
        name=spec["name"],
        points_xz=polygon,
        depth=spec["depth"],
        parent=EXTERIOR,
        location=(pivot[0], spec["y"], pivot[1]),
        rotation_degrees=spec["rot"],
        face_material=spec["material"],
        role="crown_slab",
        layer=spec["layer"],
        reaction_weight=1.0 if spec["material"] == "MAT_CROWN_PRIMARY" else 0.55,
        visibility_stage="exterior",
        open_translation=spec["open_translation"],
        open_rotation=spec["open_rotation"],
        bevel=0.055,
    )
    CROWN_OBJECTS.append(obj)


def create_annulus(
    name: str,
    inner_r: float,
    outer_r: float,
    depth: float,
    segments: int,
    y: float,
    parent: bpy.types.Object,
    material_name: str,
    role: str,
    visibility_stage: str,
) -> bpy.types.Object:
    points_outer = [polar(outer_r * (1 + 0.035 * math.sin(i * 1.7)), i / segments * math.tau)
                    for i in range(segments)]
    points_inner = [polar(inner_r, i / segments * math.tau) for i in range(segments)]

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    half = depth * 0.5

    for py in (-half, half):
        vertices.extend((x, py, z) for x, z in points_outer)
        vertices.extend((x, py, z) for x, z in points_inner)

    front_outer = 0
    front_inner = segments
    back_outer = segments * 2
    back_inner = segments * 3

    for i in range(segments):
        j = (i + 1) % segments
        faces.append((front_outer + i, front_outer + j, front_inner + j, front_inner + i))
        faces.append((back_outer + j, back_outer + i, back_inner + i, back_inner + j))
        faces.append((front_outer + i, back_outer + i, back_outer + j, front_outer + j))
        faces.append((front_inner + j, back_inner + j, back_inner + i, front_inner + i))

    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(MATERIALS[material_name])
    for polygon in mesh.polygons:
        polygon.material_index = 0
        polygon.use_smooth = False
    apply_region_mask(mesh, REGION_COLOURS[material_name])

    obj = bpy.data.objects.new(name, mesh)
    SCENE.collection.objects.link(obj)
    obj.parent = parent
    obj.location.y = y
    set_props(obj, role, 0, material_name, 0.2, visibility_stage)
    apply_hard_surface_modifiers(obj, bevel=0.025, segments=1)
    return obj


REAR_SHELL = create_annulus(
    "DL_ExteriorRearShell",
    inner_r=1.12,
    outer_r=2.30,
    depth=0.38,
    segments=14,
    y=0.56,
    parent=EXTERIOR,
    material_name="MAT_STRUCTURE",
    role="rear_shell",
    visibility_stage="exterior",
)


# ---------------------------------------------------------------------------
# Ring meshes
# ---------------------------------------------------------------------------

def append_fin_ring_geometry(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    fin_count: int,
    inner_r: float,
    outer_r: float,
    depth: float,
    y: float,
    angular_fill: float,
    twist_degrees: float,
    phase_degrees: float,
) -> None:
    twist = math.radians(twist_degrees)
    phase = math.radians(phase_degrees)
    step = math.tau / fin_count
    span = step * angular_fill

    for fin in range(fin_count):
        centre = phase + fin * step
        a0 = centre - span * 0.5
        a1 = centre + span * 0.5
        b0 = a0 + twist
        b1 = a1 + twist
        base = len(vertices)

        front_y = y - depth * 0.5
        back_y = y + depth * 0.5
        vertices.extend(
            [
                (*polar(inner_r, a0)[:1], front_y, polar(inner_r, a0)[1]),
                (*polar(outer_r, a0)[:1], front_y, polar(outer_r, a0)[1]),
                (*polar(outer_r, a1)[:1], front_y, polar(outer_r, a1)[1]),
                (*polar(inner_r, a1)[:1], front_y, polar(inner_r, a1)[1]),
                (*polar(inner_r, b0)[:1], back_y, polar(inner_r, b0)[1]),
                (*polar(outer_r, b0)[:1], back_y, polar(outer_r, b0)[1]),
                (*polar(outer_r, b1)[:1], back_y, polar(outer_r, b1)[1]),
                (*polar(inner_r, b1)[:1], back_y, polar(inner_r, b1)[1]),
            ]
        )
        faces.extend(
            [
                (base + 0, base + 1, base + 2, base + 3),
                (base + 7, base + 6, base + 5, base + 4),
                (base + 0, base + 4, base + 5, base + 1),
                (base + 1, base + 5, base + 6, base + 2),
                (base + 2, base + 6, base + 7, base + 3),
                (base + 3, base + 7, base + 4, base + 0),
            ]
        )


def create_ring_group(
    name: str,
    ring_specs: Sequence[dict],
    parent: bpy.types.Object,
    reaction_weight: float,
    visibility_stage: str,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for spec in ring_specs:
        append_fin_ring_geometry(vertices=vertices, faces=faces, **spec)

    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(MATERIALS["MAT_RING"])
    for polygon in mesh.polygons:
        polygon.material_index = 0
        polygon.use_smooth = False
    apply_region_mask(mesh, REGION_COLOURS["MAT_RING"])

    obj = bpy.data.objects.new(name, mesh)
    SCENE.collection.objects.link(obj)
    obj.parent = parent
    set_props(obj, "convergence_ring", 0, "MAT_RING", reaction_weight, visibility_stage)
    apply_hard_surface_modifiers(obj, bevel=0.018, segments=1)
    return obj


PRIMARY_RING_SPECS = [
    {
        "name": "DL_Ring_A",
        "fin_count": 10,
        "inner_r": 0.78,
        "outer_r": 1.74,
        "depth": 0.28,
        "y": 0.82,
        "angular_fill": 0.69,
        "twist_degrees": 7.0,
        "phase_degrees": 5.0,
    },
    {
        "name": "DL_Ring_B",
        "fin_count": 8,
        "inner_r": 0.68,
        "outer_r": 1.50,
        "depth": 0.30,
        "y": 1.34,
        "angular_fill": 0.67,
        "twist_degrees": -9.0,
        "phase_degrees": 18.0,
    },
    {
        "name": "DL_Ring_C",
        # 0.58 measured 0.517 clear against a 0.52 requirement — the
        # bevel and the radial wobble eat ~0.06 off the nominal bore.
        "inner_r": 0.64,
        "fin_count": 6,
        "outer_r": 1.28,
        "depth": 0.32,
        "y": 1.92,
        "angular_fill": 0.65,
        "twist_degrees": 12.0,
        "phase_degrees": 7.0,
    },
]

RING_OBJECTS: list[bpy.types.Object] = []
for ring in PRIMARY_RING_SPECS:
    ring_copy = dict(ring)
    name = ring_copy.pop("name")
    obj = create_ring_group(name, [ring_copy], CONVERGENCE, 0.75, "tunnel")
    obj["dl_open_rotation"] = [0.0, math.radians(4 if name == "DL_Ring_A" else -6 if name == "DL_Ring_B" else 8), 0.0]
    RING_OBJECTS.append(obj)


continuation_specs: list[dict] = []
for index in range(6):
    continuation_specs.append(
        {
            "fin_count": max(4, 8 - index // 2),
            # Was 0.66 - index * 0.035, which closed to 0.485 by the
            # last ring — measured 0.426 clear against a 0.52
            # requirement, so the camera flew through the far fins.
            # This holds 0.74 -> 0.66 nominal, ~0.68 -> 0.60 measured.
            "inner_r": 0.74 - index * 0.016,
            "outer_r": 1.45 - index * 0.045,
            "depth": 0.30,
            "y": 2.60 + index * 0.76,
            "angular_fill": 0.63,
            "twist_degrees": (6.0 + index * 1.5) * (-1 if index % 2 else 1),
            "phase_degrees": index * 13.0,
        }
    )

CONTINUATION_OBJECTS = [
    create_ring_group(
        "DL_TunnelContinuation_NEAR",
        continuation_specs[0:2],
        CONVERGENCE,
        0.52,
        "tunnel",
    ),
    create_ring_group(
        "DL_TunnelContinuation_MID",
        continuation_specs[2:4],
        CONVERGENCE,
        0.40,
        "tunnel",
    ),
    create_ring_group(
        "DL_TunnelContinuation_FAR",
        continuation_specs[4:6],
        CONVERGENCE,
        0.28,
        "tunnel",
    ),
]


# ---------------------------------------------------------------------------
# Tunnel shell and chamber — inward-facing geometry
# ---------------------------------------------------------------------------

def create_inward_tube(
    name: str,
    y_values: Sequence[float],
    radii: Sequence[float],
    segments: int,
    parent: bpy.types.Object,
    material_name: str,
    role: str,
    visibility_stage: str,
) -> bpy.types.Object:
    if len(y_values) != len(radii):
        raise ValueError("Tube y_values and radii must have equal length.")

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for level, (y, radius) in enumerate(zip(y_values, radii)):
        for index in range(segments):
            angle = index / segments * math.tau + level * 0.035
            wobble = 1.0 + math.sin(index * 1.7 + level * 0.9) * 0.025
            x, z = polar(radius * wobble, angle)
            vertices.append((x, y, z))

    for level in range(len(y_values) - 1):
        start = level * segments
        nxt = (level + 1) * segments
        for index in range(segments):
            j = (index + 1) % segments
            # Winding points inward.
            faces.append((start + index, nxt + index, nxt + j, start + j))

    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(MATERIALS[material_name])
    for polygon in mesh.polygons:
        polygon.material_index = 0
        polygon.use_smooth = False
    apply_region_mask(mesh, REGION_COLOURS[material_name])

    obj = bpy.data.objects.new(name, mesh)
    SCENE.collection.objects.link(obj)
    obj.parent = parent
    set_props(obj, role, 0, material_name, 0.22, visibility_stage)
    return obj


TUNNEL_SHELL = create_inward_tube(
    "DL_TunnelShell",
    y_values=[1.85, 2.8, 4.0, 5.2, 6.5, 7.8],
    radii=[1.72, 1.66, 1.58, 1.50, 1.43, 1.38],
    segments=14,
    parent=ROOT_OBJ,
    material_name="MAT_STRUCTURE",
    role="tunnel_shell",
    visibility_stage="tunnel",
)

THRESHOLD = create_inward_tube(
    "DL_ThresholdChamber",
    y_values=[7.55, 8.35, 9.15, 10.15, 11.10],
    radii=[1.40, 1.85, 2.35, 2.45, 2.12],
    segments=14,
    parent=ROOT_OBJ,
    material_name="MAT_STRUCTURE",
    role="threshold_chamber",
    visibility_stage="threshold",
)


# ---------------------------------------------------------------------------
# Latent Form
# ---------------------------------------------------------------------------

LATENT_MASS_SPECS = [
    {
        "name": "DL_LatentMass_A",
        "points": [(-0.42, -0.62), (0.04, -0.68), (0.20, -0.18), (0.08, 0.60), (-0.35, 0.50), (-0.52, 0.05)],
        "depth": 0.54,
        "location": (-0.19, 10.18, 0.05),
        "rotation": (6.0, -8.0, -5.0),
    },
    {
        "name": "DL_LatentMass_B",
        "points": [(-0.10, -0.55), (0.42, -0.48), (0.51, 0.10), (0.30, 0.64), (-0.12, 0.50), (-0.24, -0.05)],
        "depth": 0.58,
        "location": (0.20, 10.25, 0.03),
        "rotation": (-4.0, 7.0, 4.0),
    },
    {
        "name": "DL_LatentMass_C",
        "points": [(-0.38, -0.16), (-0.05, -0.42), (0.36, -0.22), (0.42, 0.20), (0.05, 0.46), (-0.30, 0.34)],
        "depth": 0.46,
        "location": (0.01, 10.02, 0.28),
        "rotation": (8.0, 2.0, -3.0),
    },
]

LATENT_OBJECTS: list[bpy.types.Object] = []
for spec in LATENT_MASS_SPECS:
    obj = create_prism_xz(
        name=spec["name"],
        points_xz=spec["points"],
        depth=spec["depth"],
        parent=LATENT_ROOT,
        location=spec["location"],
        rotation_degrees=spec["rotation"],
        face_material="MAT_LATENT",
        role="latent_mass",
        layer=0,
        reaction_weight=0.38,
        visibility_stage="revelation",
        open_translation=(0.0, 0.0, 0.0),
        open_rotation=(0.4, 0.2, 0.3),
        bevel=0.035,
    )
    LATENT_OBJECTS.append(obj)

SEAM = create_prism_xz(
    name="DL_LatentSeam",
    points_xz=[(-0.035, -0.43), (0.035, -0.36), (0.025, 0.38), (-0.025, 0.46)],
    depth=0.12,
    parent=LATENT_ROOT,
    location=(0.02, 9.88, 0.03),
    rotation_degrees=(0.0, 0.0, 2.0),
    face_material="MAT_CORE",
    role="latent_seam",
    layer=0,
    reaction_weight=1.0,
    visibility_stage="revelation",
    bevel=0.008,
)


# ---------------------------------------------------------------------------
# Halo
# ---------------------------------------------------------------------------

# 160 x 8 segments made the halo 2,560 triangles — a third of the whole
# asset, spent on a ring 15 mm thick that never fills more than a couple
# of pixels across. 72 x 6 is 864 and is indistinguishable at any
# distance the site uses.
bpy.ops.mesh.primitive_torus_add(
    align="WORLD",
    major_radius=1.90,
    minor_radius=0.015,
    major_segments=72,
    minor_segments=6,
    location=(0.0, 0.42, 2.70),
)
HALO = bpy.context.active_object
HALO.name = "DL_Halo"
HALO.parent = ROOT_OBJ
HALO.rotation_euler = (math.radians(4.0), math.radians(1.5), math.radians(-2.5))
HALO.data.materials.append(MATERIALS["MAT_HALO"])
apply_region_mask(HALO.data, REGION_COLOURS["MAT_HALO"])
set_props(HALO, "halo", 0, "MAT_HALO", 0.05, "exterior")
HALO["dl_open_rotation"] = [math.radians(0.5), 0.0, 0.0]


# ---------------------------------------------------------------------------
# Camera path, clearance and concept reference
# ---------------------------------------------------------------------------

def create_bezier_path(
    name: str,
    points: Sequence[Sequence[float]],
    bevel_depth: float,
    hide_render: bool,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 18
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinates in zip(spline.bezier_points, points):
        point.co = coordinates
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    SCENE.collection.objects.link(obj)
    obj.hide_render = hide_render
    obj["dl_export"] = False
    return obj


CAMERA_PATH = create_bezier_path("DL_CameraPath", CAMERA_PATH_POINTS, 0.018, True)
CAMERA_PATH.color = (0.2, 0.8, 1.0, 1.0)

CAMERA_CLEARANCE = create_bezier_path("DL_CameraClearance", CAMERA_PATH_POINTS, 0.52, True)
CAMERA_CLEARANCE.display_type = "WIRE"
CAMERA_CLEARANCE.color = (1.0, 0.25, 0.1, 1.0)
CAMERA_CLEARANCE["dl_clearance_radius"] = 0.52

ROOT_OBJ["dl_camera_path"] = json.dumps(CAMERA_PATH_POINTS)
ROOT_OBJ["dl_coordinate_system"] = "Blender Z-up; +Y travels into entity"
ROOT_OBJ["dl_visual_reference"] = str(REFERENCE.as_posix())


def add_reference_image() -> None:
    if not REFERENCE.exists():
        print("REFERENCE_NOT_FOUND", REFERENCE)
        return
    try:
        image = bpy.data.images.load(str(REFERENCE))
        ref = bpy.data.objects.new("DL_REFERENCE_BOARD", None)
        ref.empty_display_type = "IMAGE"
        ref.data = image
        ref.empty_display_size = 4.2
        ref.color[3] = 0.25
        ref.location = (0.0, -5.0, 0.3)
        ref.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        ref.hide_render = True
        ref.hide_viewport = True
        ref["dl_export"] = False
        SCENE.collection.objects.link(ref)
    except Exception as exc:
        print("REFERENCE_IMAGE_WARNING", exc)


add_reference_image()


# ---------------------------------------------------------------------------
# Lighting and renders
# ---------------------------------------------------------------------------

def look_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_world_and_lights() -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    world = bpy.data.worlds.new("DL_VoidWorld")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.012, 0.015, 0.020, 1.0)
        background.inputs["Strength"].default_value = 0.18
    SCENE.world = world

    lights: list[bpy.types.Object] = []

    def add_area(name: str, location: Sequence[float], energy: float, size: float, color: Sequence[float]) -> None:
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        SCENE.collection.objects.link(obj)
        obj.location = location
        look_at(obj, (0.0, 0.4, 0.0))
        obj["dl_export"] = False
        lights.append(obj)

    add_area("DL_Key", (-4.5, -5.0, 5.8), 1100.0, 5.0, (0.78, 0.90, 1.0))
    add_area("DL_Fill", (4.2, -2.0, 1.2), 760.0, 4.0, (0.20, 0.55, 0.65))
    add_area("DL_Rim", (0.0, 3.5, 5.0), 900.0, 3.0, (0.75, 0.85, 1.0))

    camera_data = bpy.data.cameras.new("DL_ReviewCamera")
    camera = bpy.data.objects.new("DL_ReviewCamera", camera_data)
    SCENE.collection.objects.link(camera)
    camera.data.lens = 55
    camera.data.sensor_width = 36
    camera["dl_export"] = False
    SCENE.camera = camera
    return camera, lights


CAMERA, LIGHTS = setup_world_and_lights()


def render_view(
    filename: str,
    camera_location: Sequence[float],
    target: Sequence[float],
    lens: float = 55.0,
    resolution: tuple[int, int] = (1200, 900),
) -> None:
    CAMERA.location = camera_location
    CAMERA.data.lens = lens
    look_at(CAMERA, target)
    SCENE.render.resolution_x = resolution[0]
    SCENE.render.resolution_y = resolution[1]
    SCENE.render.filepath = str(CAPTURE_DIR / filename)
    bpy.ops.render.render(write_still=True)


def render_silhouette(filename: str, size: int = 512) -> None:
    original_engine = SCENE.render.engine
    hidden = HALO.hide_render
    HALO.hide_render = True
    try:
        SCENE.render.engine = "BLENDER_WORKBENCH"
        SCENE.display.shading.light = "FLAT"
        SCENE.display.shading.color_type = "SINGLE"
        SCENE.display.shading.single_color = (0.0, 0.0, 0.0)
        SCENE.display.shading.show_shadows = False
        SCENE.display.shading.show_cavity = False
        SCENE.render.resolution_x = size
        SCENE.render.resolution_y = size
        SCENE.render.filepath = str(CAPTURE_DIR / filename)
        # The crown reaches ~2.9 units (outer_r 2.62 x spike 1.13). A
        # 58 mm lens on a 36 mm sensor sees +-2.5 at 8.2 units, so the
        # original standoff cropped the entity on every edge and the
        # silhouette gate — the one test this asset exists to pass —
        # showed a black rectangle. 12.5 units gives +-3.9 and margin.
        CAMERA.location = (0.0, -12.5, 0.35)
        CAMERA.data.lens = 58
        look_at(CAMERA, (0.0, 0.0, 0.15))
        bpy.ops.render.render(write_still=True)
    finally:
        HALO.hide_render = hidden
        SCENE.render.engine = original_engine


def produce_renders() -> None:
    # Exterior standoffs widened for the same reason as the silhouette:
    # the asset is ~2.9 units in radius and these were framed for
    # something half its size.
    render_view("01-exterior-front.png", (0.0, -12.5, 0.35), (0.0, 0.0, 0.15), 58, (1536, 1024))
    render_view("02-exterior-three-quarter.png", (8.0, -10.2, 4.6), (0.0, 0.25, 0.15), 58)
    render_view("03-exterior-side.png", (12.0, 0.0, 0.35), (0.0, 0.3, 0.10), 58)
    render_view("04-cavity-close.png", (0.0, -3.65, 0.08), (0.0, 1.15, 0.0), 62)
    render_view("05-tunnel-entry.png", (0.0, -0.65, 0.0), (0.0, 4.2, 0.0), 50)
    render_view("06-tunnel-midpoint.png", (0.0, 4.2, 0.0), (0.0, 8.7, 0.0), 47)
    render_view("07-threshold-latent-form.png", (0.0, 7.1, 0.0), (0.0, 10.2, 0.04), 52)
    render_view("08-side-cutaway.png", (8.4, 4.7, 1.2), (0.0, 4.7, 0.0), 62, (1536, 768))
    render_silhouette("09-silhouette-512.png", 512)
    render_silhouette("10-silhouette-128.png", 128)


# ---------------------------------------------------------------------------
# Manifest, save and export
# ---------------------------------------------------------------------------

def triangle_count(obj: bpy.types.Object) -> int:
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def create_manifest() -> dict:
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.get("dl_export", False)]
    items = []
    total = 0
    for obj in sorted(mesh_objects, key=lambda item: item.name):
        triangles = triangle_count(obj)
        total += triangles
        items.append(
            {
                "name": obj.name,
                "role": obj.get("dl_role", ""),
                "materialClass": obj.get("dl_material_class", ""),
                "visibilityStage": obj.get("dl_visibility_stage", ""),
                "triangles": triangles,
            }
        )
    return {
        "asset": f"DL_CrownedConvergence_Clay_{VERSION}",
        "coordinateSystem": "Blender Z-up; +Y travels into entity",
        "totalTriangles": total,
        "objects": items,
        "cameraPath": CAMERA_PATH_POINTS,
        "reference": str(REFERENCE),
    }


def save_manifest() -> dict:
    manifest = create_manifest()
    MANIFEST_OUT.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("TRIANGLE_TOTAL", manifest["totalTriangles"])
    return manifest


def save_blend() -> None:
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT), check_existing=False, compress=True)


def export_glb() -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.get("dl_export", False):
            obj.select_set(True)

    supported = set()
    try:
        supported = {prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties}
    except Exception:
        pass

    kwargs = {
        "filepath": str(GLB_OUT),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_extras": True,
        "export_yup": True,
        "export_cameras": False,
        "export_lights": False,
    }
    if supported:
        kwargs = {key: value for key, value in kwargs.items() if key in supported}

    result = bpy.ops.export_scene.gltf(**kwargs)
    print("GLTF_EXPORT", result, GLB_OUT)


if ARGS.render:
    produce_renders()

manifest = save_manifest()
save_blend()
export_glb()

print("CROWNED_CONVERGENCE_BUILD_OK")
print("BLEND", BLEND_OUT)
print("GLB", GLB_OUT)
print("CAPTURES", CAPTURE_DIR)
print("TRIANGLES", manifest["totalTriangles"])
