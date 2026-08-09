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
VERSION = "v06"

BLEND_OUT = ROOT / "assets" / "blender" / f"DL_CrownedConvergence_Clay_{VERSION}.blend"
GLB_OUT = ROOT / "public" / "models" / f"DL_CrownedConvergence_Clay_{VERSION}.glb"
CAPTURE_DIR = ROOT / "captures" / f"crowned-convergence-clay-{VERSION}"
MANIFEST_OUT = CAPTURE_DIR / f"mesh-manifest-{VERSION}.json"

REFERENCE = Path(ARGS.reference)
if not REFERENCE.is_absolute():
    REFERENCE = ROOT / REFERENCE


# ---------------------------------------------------------------------------
# Locked design data — tune these values, do not randomise them.
# Blender coordinates: X horizontal, Z vertical, +Y travels into the entity.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# v05 — AUTHORED EXTERIOR
#
# The radial system is gone. There is no angle_deg, half_angle_deg,
# inner_r, outer_r, polar placement or shared crown_polygon() anywhere in
# the exterior any more. Four versions proved the limit of that approach:
# any set of pieces derived from one radial formula reads as a wreath,
# because the formula itself is the rotational rhythm the eye picks up.
#
# Each of the seven masses below is an explicit 3D vertex layout — a
# front loop and a back loop of hand-written (x, y, z) coordinates,
# lofted between. The two loops differ in shape, size AND per-vertex
# depth, so every mass is a genuine three-dimensional wedge rather than
# a 2D profile pushed along an axis. No two share a construction.
#
# Arrangement is by DEPTH, not by angle:
#     3 foreground masses  (y ~ -0.95 .. 0.50)  conceal the convergence
#     2 middle-depth       (y ~ -0.15 .. 1.08)  bridge front to back
#     2 rear structural    (y ~  0.45 .. 2.02)  give the body its bulk
#
# The rear pair replaces DL_ExteriorRearShell, which was an annulus —
# literally "plates attached to a backing ring", named in the brief as a
# fail state. Their inner boundaries stay outside radius ~1.45 so the
# convergence rings sit in the pocket they form rather than intersecting
# them.
#
# Target: one compressed faceted body with a partially concealed
# internal convergence. Compressed is real here — the mass spans ~4.9
# across X and ~4.6 in Z against ~2.9 of depth.
# ---------------------------------------------------------------------------

# (name, role_tier, front_loop, back_loop)
# Loops must have equal length; they are lofted vertex-to-vertex.
# v06 role assignment. v05 put the dominant masses upper-left and the
# middles right; the completion spec reverses that — dominant weight
# goes upper-right and lower-right, middles carry the left. Re-authored
# accordingly, still as explicit loft pairs, still no radial formula.
#
# The three foreground masses bound the cavity: FA caps its top-right,
# FB carries its lower edge, FC frames it from the left. The cavity is
# shifted right-and-down not by translating the crown but by where each
# of those inner vertices individually sits.
#
# Surface orientation (spec section 6): FC, MA, RA and RB present an
# edge or a strongly angled plane; only FA, FB and MB show a broad face
# to the hero camera. That is 4 angled to 3 flat, measured and reported
# in the manifest as surfaceOrientation.
SLAB_SPECS = [
    (
        # FOREGROUND A — upper-right dominant, largest exterior mass.
        # Its inner run (1.02,0.30) -> (0.72,0.66) -> (0.05,0.78) caps
        # the cavity without reaching past the cavity centre.
        "DL_Slab_FA_UpperRightDominant", "foreground",
        [( 0.95, -0.95,  0.30), ( 0.72, -1.00,  0.54), ( 0.05, -0.92,  0.58),
         (-0.30, -0.85,  1.45), ( 0.60, -0.78,  2.35), ( 1.75, -0.70,  2.45),
         ( 2.55, -0.62,  1.35), ( 2.35, -0.80,  0.45)],
        [( 0.94,  0.30,  0.34), ( 0.76,  0.26,  0.52), ( 0.14,  0.34,  0.56),
         (-0.18,  0.42,  1.38), ( 0.62,  0.50,  2.18), ( 1.62,  0.55,  2.26),
         ( 2.28,  0.48,  1.28), ( 2.12,  0.36,  0.48)],
    ),
    (
        # FOREGROUND B — lower-right anchor, downward pressure, carries
        # the cavity's lower edge.
        #
        # Its first vertex meets FA's inner-right vertex at z 0.30-0.34.
        # Widening the ring bore pushed the cavity out to x 1.055, past
        # the seam between these two masses, and the hole drained out
        # through it — the silhouette had no enclosed cavity at all.
        "DL_Slab_FB_LowerRightAnchor", "foreground",
        [( 0.95, -0.95,  0.34), ( 0.55, -1.05, -0.80), (-0.35, -1.10, -1.05),
         (-0.55, -0.95, -2.05), ( 0.95, -0.80, -2.40), ( 2.25, -0.72, -1.55),
         ( 2.50, -0.85, -0.35)],
        [( 0.94,  0.28,  0.30), ( 0.60,  0.22, -0.74), (-0.28,  0.26, -0.96),
         (-0.46,  0.40, -1.86), ( 0.88,  0.50, -2.16), ( 2.02,  0.44, -1.42),
         ( 2.22,  0.34, -0.34)],
    ),
    (
        # FOREGROUND C — left frame. Thin in X and deep in Y, so from
        # the hero it shows an angled plane rather than a face.
        "DL_Slab_FC_LeftFrame", "foreground",
        [(-0.62, -1.08,  0.95), (-0.66, -1.02, -0.78), (-0.95, -0.95, -0.92),
         (-0.88, -1.00,  1.05)],
        [(-1.05,  0.85,  1.08), (-1.12,  0.90, -0.88), (-1.48,  0.80, -1.02),
         (-1.38,  0.75,  1.18)],
    ),
    (
        # MIDDLE A — elevated upper-left. Crown height without a horn.
        #
        # Widened right to x 0.35 and down to z 0.95 so it overlaps FA
        # and FC. The seven masses have to read as ONE body: at the
        # narrower v06 sizing the silhouette broke into four separate
        # chunks with daylight between them, which is both the "isolated
        # floating chunk" failure and the reason no cavity could be
        # enclosed — the opening simply drained out between masses.
        "DL_Slab_MA_UpperLeftElevated", "middle",
        [( 0.35, -0.24,  0.95), (-0.30, -0.28,  1.15), (-1.10, -0.30,  1.05),
         (-2.00, -0.24,  1.35), (-2.35, -0.20,  1.95), (-1.45, -0.35,  2.78),
         (-0.45, -0.26,  2.25)],
        [( 0.32,  1.10,  0.98), (-0.28,  1.05,  1.18), (-1.02,  1.02,  1.08),
         (-1.85,  1.08,  1.32), (-2.08,  1.14,  1.85), (-1.32,  1.00,  2.58),
         (-0.46,  1.08,  2.12)],
    ),
    (
        # MIDDLE B — lower-left counterweight. Extended right to x -0.35
        # and up to z 0.95 so it closes onto FB, FC and MA. Deep in Y,
        # so it is not a flat tile.
        "DL_Slab_MB_LowerLeftCounter", "middle",
        [(-0.35, -0.38, -0.85), (-0.75, -0.40,  0.25), (-1.35, -0.42,  0.95),
         (-2.55, -0.55,  0.85), (-2.85, -0.45, -0.35), (-2.65, -0.40, -1.45),
         (-1.85, -0.48, -2.05)],
        [(-0.32,  1.25, -0.78), (-0.70,  1.22,  0.30), (-1.28,  1.20,  0.88),
         (-2.30,  1.05,  0.78), (-2.55,  1.15, -0.30), (-2.38,  1.18, -1.32),
         (-1.72,  1.12, -1.85)],
    ),
    (
        # REAR A — upper structural. Binds the upper silhouette from
        # behind; an open arc, incapable of closing a circular frame.
        "DL_Slab_RA_RearUpper", "rear",
        [(-0.25,  1.05,  1.05), (-1.55,  0.85,  1.45), (-0.35,  0.75,  2.15),
         ( 1.05,  0.85,  1.95), ( 1.35,  1.00,  0.95)],
        [(-0.22,  2.25,  1.00), (-1.35,  2.15,  1.35), (-0.30,  2.05,  1.95),
         ( 0.92,  2.15,  1.78), ( 1.18,  2.25,  0.92)],
    ),
    (
        # REAR B — lower structural. Same, below; inner vertices stay
        # beyond radius 1.0 so it never enters the camera tube.
        "DL_Slab_RB_RearLower", "rear",
        [(-0.35,  1.05, -0.95), (-1.25,  0.80, -1.35), ( 0.35,  0.75, -1.95),
         ( 1.65,  0.85, -1.25), ( 1.25,  1.00, -0.35)],
        [(-0.30,  2.25, -0.88), (-1.10,  2.10, -1.25), ( 0.32,  2.05, -1.80),
         ( 1.48,  2.15, -1.15), ( 1.10,  2.25, -0.32)],
    ),
]

FOREGROUND_SLABS = [name for name, tier, _f, _b in SLAB_SPECS if tier == "foreground"]

SLAB_MATERIAL = {
    "foreground": "MAT_CROWN_PRIMARY",
    "middle": "MAT_CROWN_SECONDARY",
    "rear": "MAT_STRUCTURE",
}
SLAB_LAYER = {"foreground": 1, "middle": 2, "rear": 3}

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


def authored_slab(
    name: str,
    front: Sequence[tuple[float, float, float]],
    back: Sequence[tuple[float, float, float]],
    parent: bpy.types.Object,
    face_material: str,
    layer: int,
    reaction_weight: float,
) -> bpy.types.Object:
    """
    Lofts one mass between two explicit 3D loops.

    This is the whole v05 change. There is no profile function and no
    shared parameterisation: `front` and `back` are literal coordinate
    lists, they differ in shape and in per-vertex depth, and the loft
    between them produces a genuine wedge. Two masses built this way
    have nothing in common except the loft, which is why the set stops
    resolving into a wreath.

    The object's origin is moved to its own centre afterwards, so each
    mass still pivots about itself for the tear.
    """
    if len(front) != len(back):
        raise ValueError(f"{name}: front and back loops must match in length")

    n = len(front)
    vertices = [tuple(v) for v in front] + [tuple(v) for v in back]
    faces: list[tuple[int, ...]] = [tuple(range(n)), tuple(reversed(range(n, n * 2)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))

    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(MATERIALS[face_material])
    mesh.materials.append(MATERIALS["MAT_STRUCTURE"])
    for index, polygon in enumerate(mesh.polygons):
        polygon.material_index = 0 if index < 2 else 1
        polygon.use_smooth = False
    mesh.validate(verbose=False)
    apply_region_mask(mesh, REGION_COLOURS[face_material])

    obj = bpy.data.objects.new(name, mesh)
    SCENE.collection.objects.link(obj)
    obj.parent = parent

    # Hand-written loops can be wound either way; normals are made
    # consistent rather than assumed.
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="MEDIAN")

    set_props(
        obj,
        "crown_slab",
        layer,
        face_material,
        reaction_weight,
        "exterior",
        open_translation=(
            obj.location.x * 0.06,
            -0.02 * layer,
            obj.location.z * 0.06,
        ),
        open_rotation_degrees=(-2.0 + layer, 2.0 - layer, 1.5 * layer),
    )
    apply_hard_surface_modifiers(obj, bevel=0.055)
    return obj


# ---------------------------------------------------------------------------
# Exterior masses — seven individually authored wedges
# ---------------------------------------------------------------------------

CROWN_OBJECTS: list[bpy.types.Object] = []
for _name, _tier, _front, _back in SLAB_SPECS:
    CROWN_OBJECTS.append(
        authored_slab(
            name=_name,
            front=_front,
            back=_back,
            parent=EXTERIOR,
            face_material=SLAB_MATERIAL[_tier],
            layer=SLAB_LAYER[_tier],
            reaction_weight={"foreground": 1.0, "middle": 0.6, "rear": 0.35}[_tier],
        )
    )


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


# DL_ExteriorRearShell is GONE.
#
# It was an annulus sitting behind the crown — the literal definition of
# "plates attached to a backing ring", which the brief names as a fail
# state. Any set of slabs in front of a continuous ring will read as
# mounted on it no matter how the slabs themselves are shaped.
#
# Its structural job — giving the body bulk behind the face so the
# entity is a mass rather than a frame — now belongs to the two rear
# authored wedges, DL_Slab_R1_RearLower and DL_Slab_R2_RearUpper.


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
    """Evenly spaced fins. Still used by the low-detail continuation rings."""
    twist = math.radians(twist_degrees)
    phase = math.radians(phase_degrees)
    step = math.tau / fin_count
    span = step * angular_fill

    for fin in range(fin_count):
        centre = phase + fin * step
        append_fin(
            vertices, faces,
            a0=centre - span * 0.5, a1=centre + span * 0.5,
            inner_r=inner_r, outer_r=outer_r, depth=depth, y=y,
            twist=twist, offset=(0.0, 0.0),
        )


def append_fin(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    a0: float,
    a1: float,
    inner_r: float,
    outer_r: float,
    depth: float,
    y: float,
    twist: float,
    offset: tuple[float, float],
) -> None:
    """One fin, fully specified. Offset shifts it in the XZ face plane."""
    ox, oz = offset
    b0 = a0 + twist
    b1 = a1 + twist
    base = len(vertices)
    front_y = y - depth * 0.5
    back_y = y + depth * 0.5

    def point(radius: float, angle: float, py: float) -> tuple[float, float, float]:
        x, z = polar(radius, angle)
        return (x + ox, py, z + oz)

    vertices.extend(
        [
            point(inner_r, a0, front_y),
            point(outer_r, a0, front_y),
            point(outer_r, a1, front_y),
            point(inner_r, a1, front_y),
            point(inner_r, b0, back_y),
            point(outer_r, b0, back_y),
            point(outer_r, b1, back_y),
            point(inner_r, b1, back_y),
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


def append_authored_ring(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    fins: Sequence[tuple[float, float, float, float, float, float]],
    y: float,
    offset: tuple[float, float],
) -> None:
    """
    v04 correction 5: a primary ring is now a list of fins with authored
    spans, not a count and a fill fraction.

    Evenly spaced fins of equal width and equal depth ARE a turbine band
    — the read comes from the regularity, not the fin shape. Each fin
    here carries its own angular span, its own radii, its own axial
    offset and its own twist, and the spans deliberately leave two or
    three wide interruptions per ring. The whole ring is also shifted
    off the entity axis by `offset`.

    fin: (a0_deg, a1_deg, inner_r, outer_r, depth, y_offset)
    """
    for a0_deg, a1_deg, inner_r, outer_r, depth, y_offset in fins:
        append_fin(
            vertices, faces,
            a0=math.radians(a0_deg), a1=math.radians(a1_deg),
            inner_r=inner_r, outer_r=outer_r, depth=depth,
            y=y + y_offset,
            twist=math.radians((a1_deg - a0_deg) * 0.18),
            offset=offset,
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


# Primary rings, authored fin by fin. Every inner radius is >= RING_BORE
# so the central hole stays unbroken in the front silhouette, and every
# ring keeps three wide interruptions.
#
# Ys pulled forward (0.82/1.34/1.92 -> 0.74/1.18/1.62) as part of
# correction 1: with the tunnel hidden at the hero, the exterior mass
# has to close up into a compact near-spherical depth.
# v06 spec 2/3. The cavity read in the silhouette is set by the ring
# bore, not by the slabs — the rings sit inside the crown's aperture and
# it is their inner edge the eye sees. So shifting the cavity right and
# down, and widening it, is done here.
#
# Every ring now carries a wide interruption spanning roughly 340-28
# degrees (right) and 248-302 degrees (down). Because all three align,
# those become through-channels: the open region escapes the bore
# outward in exactly those two directions, which grows the measured
# cavity and moves its centre right-and-below without translating the
# crown or shrinking the camera bore.
#
# Each ring still has three wide interruptions, uneven fin widths,
# per-fin axial offsets and an off-axis centre.
# v06 spec 2/3. The cavity in the silhouette is set by the RING BORE,
# not by the slabs — the rings sit inside the crown's aperture and it is
# their inner edge the eye reads as the hole. So the cavity is widened
# and moved here, by scaling every bore radius ~1.13x and giving all
# three rings a shared right-and-down centre offset.
#
# An earlier attempt instead aligned wide gaps at 0 and 270 degrees to
# channel the opening outward. It moved the cavity, but the open region
# then escaped the crown entirely and the silhouette had no enclosed
# hole at all. Gap topology is therefore left exactly as it was.
#
# Bore 0.825 minimum against an offset of ~0.19 leaves 0.63 to the axis,
# comfortably clear of the 0.52 camera tube.
PRIMARY_RINGS = [
    {
        "name": "DL_Ring_A",
        "y": 0.74,
        "offset": (0.28, -0.10),
        "fins": [
            (  8.0,  42.0, 0.942, 1.70, 0.26, -0.03),
            ( 52.0,  74.0, 0.921, 1.52, 0.30,  0.05),
            ( 86.0, 118.0, 0.965, 1.74, 0.24, -0.06),
            (150.0, 178.0, 0.910, 1.46, 0.32,  0.07),
            (192.0, 214.0, 0.954, 1.62, 0.27, -0.04),
            (250.0, 288.0, 0.899, 1.68, 0.29,  0.06),
            (300.0, 326.0, 0.931, 1.40, 0.25, -0.05),
        ],
    },
    {
        "name": "DL_Ring_B",
        "y": 1.18,
        "offset": (0.28, -0.11),
        "fins": [
            ( 20.0,  58.0, 0.921, 1.44, 0.28,  0.06),
            ( 70.0,  96.0, 0.965, 1.26, 0.32, -0.05),
            (128.0, 152.0, 0.899, 1.50, 0.24,  0.07),
            (164.0, 204.0, 0.942, 1.34, 0.30, -0.06),
            (238.0, 262.0, 0.910, 1.48, 0.26,  0.04),
            (274.0, 310.0, 0.954, 1.30, 0.31, -0.07),
        ],
    },
    {
        "name": "DL_Ring_C",
        "y": 1.62,
        "offset": (0.28, -0.10),
        "fins": [
            (  0.0,  44.0, 0.932, 1.22, 0.30, -0.05),
            ( 56.0,  96.0, 0.899, 1.30, 0.25,  0.07),
            (128.0, 158.0, 0.965, 1.14, 0.32, -0.06),
            (196.0, 238.0, 0.921, 1.26, 0.27,  0.05),
            (250.0, 286.0, 0.942, 1.10, 0.29, -0.04),
            (330.0, 356.0, 0.910, 1.20, 0.24,  0.06),
        ],
    },
]

RING_OBJECTS: list[bpy.types.Object] = []
for _ring in PRIMARY_RINGS:
    _vertices: list[tuple[float, float, float]] = []
    _faces: list[tuple[int, ...]] = []
    append_authored_ring(_vertices, _faces, _ring["fins"], _ring["y"], _ring["offset"])

    _mesh = bpy.data.meshes.new(f"{_ring['name']}_MESH")
    _mesh.from_pydata(_vertices, [], _faces)
    _mesh.materials.append(MATERIALS["MAT_RING"])
    for _polygon in _mesh.polygons:
        _polygon.material_index = 0
        _polygon.use_smooth = False
    apply_region_mask(_mesh, REGION_COLOURS["MAT_RING"])

    _obj = bpy.data.objects.new(_ring["name"], _mesh)
    SCENE.collection.objects.link(_obj)
    _obj.parent = CONVERGENCE
    # Correction 1: the rings belong to the EXTERIOR stage — they are
    # what the visitor sees turning inside the cavity at the hero.
    set_props(_obj, "convergence_ring", 0, "MAT_RING", 0.75, "exterior")
    apply_hard_surface_modifiers(_obj, bevel=0.018, segments=1)
    _obj["dl_open_rotation"] = [
        0.0,
        math.radians({"DL_Ring_A": 4, "DL_Ring_B": -6}.get(_ring["name"], 8)),
        0.0,
    ]
    RING_OBJECTS.append(_obj)


# v03 correction 5: the continuation rings were a linear ramp — every
# parameter a fixed step per index, which is exactly how machinery is
# specified and exactly why the corridor read as a manufactured duct.
# Authored irregularly instead: the spacing skips (0.50, 0.90, 0.45,
# 0.95, 0.95, 0.90), the fin counts jump 7-5-8-4-6-5-7, and the fills
# and twists do not trend. Nothing here interpolates.
#
# Every inner_r stays >= 0.69 nominal, which measures ~0.63 against the
# 0.52 camera tube.
continuation_specs: list[dict] = [
    {"fin_count": f, "inner_r": ir, "outer_r": orr, "depth": d,
     "y": y, "angular_fill": fill, "twist_degrees": tw, "phase_degrees": ph}
    for f, ir, orr, d, y, fill, tw, ph in [
        (7, 0.76, 1.44, 0.30, 2.55, 0.62,   8.0,  0.0),
        (5, 0.72, 1.30, 0.22, 3.05, 0.48, -14.0, 27.0),
        (8, 0.74, 1.38, 0.34, 3.95, 0.66,   5.0, 11.0),
        (4, 0.70, 1.22, 0.26, 4.40, 0.42, -19.0, 41.0),
        (6, 0.73, 1.33, 0.30, 5.35, 0.58,  11.0,  6.0),
        (5, 0.69, 1.18, 0.24, 6.30, 0.46,  -8.0, 33.0),
        (7, 0.71, 1.28, 0.32, 7.20, 0.60,  15.0, 19.0),
    ]
]

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
        continuation_specs[2:5],
        CONVERGENCE,
        0.40,
        "tunnel",
    ),
    create_ring_group(
        "DL_TunnelContinuation_FAR",
        continuation_specs[5:7],
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


# v04 correction 1: DL_BodyHull is GONE. Enclosing the whole corridor in
# an exterior skin turned the entity into a torpedo — it removed the
# pipe read by making the pipe the body. The tunnel is not hidden by
# geometry; it is hidden by STAGE. Everything from here down is built
# into the same asset with tunnel/threshold/revelation stages and is
# excluded from every exterior render, so the hero returns to a compact
# near-spherical mass and the corridor still exists for the journey.

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

# v03 correction 6: the Latent Form was three masses about 0.5 units
# across, arriving after an eleven-unit approach — too small to land as
# the thing the journey was for. Scaled up roughly 2.4x, given a fifth
# mass and a taller silhouette, and pushed back to y 10.3-11.0 so it
# reads as standing at the end of the chamber rather than floating in
# the camera's face. Vertical extents now exceed horizontal: the form
# stands.
# v04 correction 6: back to exactly three folded masses.
#
# Five masses crowded into one silhouette with no gaps between them, and
# the seam sat FORWARD of the group at y 10.15 so it became the entire
# subject. Three now, at three distinct scales, with real air between
# all three — and the seam is recessed BEHIND their front faces so it
# reads as light escaping from between folds.
#
# Read-avoidance is deliberate. Two masses flanking a vertical seam with
# a third centred above is a figure, so: the masses are unequal (1.00 /
# 0.72 / 0.48 relative), the third sits high-RIGHT rather than centred,
# every silhouette is angular with no closed curve (no orb), nothing is
# lens or almond shaped (no eye), and the gaps are wedges of differing
# width (no mouth).
# v06 spec 8. Three masses, weights 45 / 35 / 20, A forward-left,
# B rear-right, C elevated and RECESSED between them — v05 had C at
# y 10.34, in front of both, which is the opposite of recessed. All
# three overlap in depth with visible gaps between them, and the
# combined silhouette is taller than wide (target h/w 1.25-1.55).
# v06 spec 8. Three masses, weights 45 / 35 / 20, A forward-left,
# B rear-right, C elevated and RECESSED behind both. v05 had C at
# y 10.34 — in front of the pair, the opposite of recessed.
#
# The combined silhouette must be TALLER than wide (h/w 1.25-1.55). A
# first pass measured 0.97 because A and B were pushed too far apart in
# X; they are drawn in and stretched in Z instead.
LATENT_MASS_SPECS = [
    {
        # Mass A — 45%. Forward and left, tallest, the anchor.
        "name": "DL_LatentMass_A",
        "points": [(-1.10, -1.90), (-0.16, -2.02), ( 0.20, -0.52), ( 0.04,  1.62),
                   (-0.68,  2.00), (-1.02,  0.36)],
        "depth": 0.82,
        "location": (-0.72, 10.42, 0.05),
        "rotation": (5.0, -9.0, -7.0),
    },
    {
        # Mass B — 35%. Rear and right, shorter, tipped the other way.
        "name": "DL_LatentMass_B",
        "points": [(-0.44, -1.40), ( 0.52, -1.22), ( 0.98,  0.18), ( 0.62,  1.34),
                   (-0.16,  1.50), (-0.40, -0.06)],
        "depth": 0.70,
        "location": (0.68, 10.88, -0.15),
        "rotation": (-6.0, 8.0, 6.0),
    },
    {
        # Mass C — 20%. Elevated and set furthest back, so it reads as
        # the far shoulder rather than a third front plane.
        "name": "DL_LatentMass_C",
        "points": [(-0.50, -0.60), ( 0.26, -0.72), ( 0.52,  0.08), ( 0.30,  0.80),
                   (-0.28,  0.68), (-0.54,  0.10)],
        "depth": 0.58,
        "location": (0.02, 11.14, 1.92),
        "rotation": (9.0, 3.0, -11.0),
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

# RECESSED. The masses' front faces sit at roughly y 10.05-10.15; the
# seam is at 10.86, well behind them, so it is seen THROUGH the gap
# between A and B rather than in front of the group. That is the whole
# difference between light escaping from between folds and a glowing
# bar hanging in the frame. It is also tilted off vertical, so the
# composition never resolves into a symmetrical figure.
SEAM = create_prism_xz(
    name="DL_LatentSeam",
    # Width kept under 8% of the combined silhouette, and set back to
    # y 11.02 — behind A's front plane at ~10.0 and behind B's at
    # ~10.5 — so it is glimpsed between the masses, never the subject.
    points_xz=[(-0.038, -1.02), (0.038, -0.88), (0.026, 0.94), (-0.026, 1.12)],
    depth=0.11,
    parent=LATENT_ROOT,
    location=(-0.04, 11.06, 0.10),
    rotation_degrees=(0.0, 0.0, 13.0),
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
    major_radius=2.05,
    minor_radius=0.015,
    major_segments=72,
    minor_segments=6,
    # v04 correction 3: lifted 2.70 -> 3.05. The crown's tallest reach
    # is CROWN_MAX_REACH (~2.49), so this leaves better than half a unit
    # of clear air under the ring — no slab pierces it in the hero view,
    # which the build-time check below confirms against real geometry.
    location=(0.0, 0.42, 3.05),
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


# ---------------------------------------------------------------------------
# Visibility staging — v04 correction 1
#
# The corridor is not removed from the asset, it is staged out of the
# exterior. Every object keeps its dl_visibility_stage; these sets say
# which stages a given render is allowed to show. The hero therefore
# sees only crown, rear shell, the three primary rings and the halo,
# and the entity returns to a compact near-spherical mass — without
# deleting the tunnel that the journey still needs.
# ---------------------------------------------------------------------------

STAGE_EXTERIOR = {"exterior"}
STAGE_TUNNEL = {"exterior", "tunnel"}
STAGE_ALL = {"exterior", "tunnel", "threshold", "revelation"}


def apply_stage(stages: set[str]) -> list[str]:
    """Hides every exportable object outside *stages*. Returns what showed."""
    visible: list[str] = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.get("dl_export", False):
            continue
        stage = obj.get("dl_visibility_stage", "exterior")
        shown = stage in stages
        # Spec 7: the halo belongs to the dormant exterior only. It is
        # exterior-stage metadata, so without this it would follow the
        # crown into every tunnel and revelation view.
        if obj.get("dl_role", "") == "halo" and stages != STAGE_EXTERIOR:
            shown = False
        obj.hide_render = not shown
        if shown:
            visible.append(obj.name)
    return sorted(visible)


def render_view(
    filename: str,
    camera_location: Sequence[float],
    target: Sequence[float],
    lens: float = 55.0,
    resolution: tuple[int, int] = (1200, 900),
    stages: set[str] | None = None,
    neutral: bool = False,
) -> None:
    apply_stage(stages or STAGE_ALL)
    original_engine = SCENE.render.engine
    if neutral:
        SCENE.render.engine = "BLENDER_WORKBENCH"
        SCENE.display.shading.light = "STUDIO"
        SCENE.display.shading.color_type = "SINGLE"
        SCENE.display.shading.single_color = (0.42, 0.45, 0.50)
        SCENE.display.shading.show_cavity = True
        SCENE.display.shading.cavity_type = "BOTH"
        SCENE.display.shading.show_shadows = False
        SCENE.display.render_aa = "8"
    CAMERA.location = camera_location
    CAMERA.data.lens = lens
    look_at(CAMERA, target)
    SCENE.render.resolution_x = resolution[0]
    SCENE.render.resolution_y = resolution[1]
    SCENE.render.filepath = str(CAPTURE_DIR / filename)
    bpy.ops.render.render(write_still=True)


def render_silhouette(
    filename: str,
    size: int = 512,
    roles: set[str] | None = None,
    exclude: set[str] | None = None,
    include: set[str] | None = None,
    stages: set[str] | None = None,
    camera: tuple[Sequence[float], Sequence[float], float] | None = None,
) -> None:
    """
    *roles* restricts the render to objects with those dl_role values.

    Used to separate two different questions that a single silhouette
    cannot answer: what the eye SEES (full exterior stage — the gate
    image) versus what the crown FRAMES (crown slabs only — the aperture
    the occlusion budget is stated against). With everything black, ring
    fins scalloping the bore are indistinguishable from a slab biting
    across it unless the rings are excluded.
    """
    original_engine = SCENE.render.engine
    # The silhouette gate judges the MASS, so the halo is excluded — and
    # only exterior-stage objects take part.
    apply_stage(STAGE_EXTERIOR)
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.get("dl_export", False):
            continue
        if roles is not None and obj.get("dl_role", "") not in roles:
            obj.hide_render = True
        if exclude is not None and obj.name in exclude:
            obj.hide_render = True
        if include is not None and obj.name not in include:
            obj.hide_render = True
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
        # v03 reaches 4.03 units (dominant slab 2.92 x spike 1.38), and
        # 12.5 only saw +-3.87 — the crest horns were clipping the top
        # edge of the gate render.
        if camera is not None:
            CAMERA.location = camera[0]
            CAMERA.data.lens = camera[2]
            look_at(CAMERA, camera[1])
        else:
            CAMERA.location = (0.0, -14.5, 0.35)
            CAMERA.data.lens = 58
            look_at(CAMERA, (0.0, 0.0, 0.15))
        bpy.ops.render.render(write_still=True)
    finally:
        HALO.hide_render = hidden
        SCENE.render.engine = original_engine


def solid_mask(filename: str) -> tuple[bytearray, int, int]:
    """Binary mask of the rendered silhouette: 1 = geometry."""
    image = bpy.data.images.load(str(CAPTURE_DIR / filename))
    width, height = image.size
    pixels = tuple(image.pixels)

    def luminance(index: int) -> float:
        base = index * 4
        return 0.2126 * pixels[base] + 0.7152 * pixels[base + 1] + 0.0722 * pixels[base + 2]

    threshold = luminance(0) * 0.5
    mask = bytearray(width * height)
    for index in range(width * height):
        mask[index] = 1 if luminance(index) < threshold else 0

    image.user_clear()
    bpy.data.images.remove(image)
    return mask, width, height


def _largest_component(indices: list[int], width: int, height: int) -> list[int]:
    """
    Biggest connected run of enclosed background.

    Small isolated gaps between masses are holes too, and taking the
    bounding box over ALL of them inflated the cavity reading by
    whatever stray chink happened to exist elsewhere in the silhouette.
    The cavity is the largest one.
    """
    member = set(indices)
    seen: set[int] = set()
    best: list[int] = []
    for seed in indices:
        if seed in seen:
            continue
        stack = [seed]
        seen.add(seed)
        component = []
        while stack:
            i = stack.pop()
            component.append(i)
            x, y = i % width, i // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    j = ny * width + nx
                    if j in member and j not in seen:
                        seen.add(j)
                        stack.append(j)
        if len(component) > len(best):
            best = component
    return best


def _convex_hull(xs: Sequence[int], ys: Sequence[int]) -> list[tuple[int, int]]:
    points = sorted(set(zip(xs, ys)))
    if len(points) < 3:
        return points

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def _hull_scanline(hull: Sequence[tuple[int, int]], width: int, height: int) -> bytearray:
    """Fills a convex hull to a mask, one row at a time."""
    mask = bytearray(width * height)
    if len(hull) < 3:
        return mask
    ys = [p[1] for p in hull]
    for y in range(max(0, min(ys)), min(height - 1, max(ys)) + 1):
        crossings = []
        for index, (x0, y0) in enumerate(hull):
            x1, y1 = hull[(index + 1) % len(hull)]
            if y0 == y1:
                continue
            if min(y0, y1) <= y < max(y0, y1):
                t = (y - y0) / float(y1 - y0)
                crossings.append(x0 + t * (x1 - x0))
        if len(crossings) < 2:
            continue
        left, right = int(min(crossings)), int(max(crossings))
        row = y * width
        for x in range(max(0, left), min(width - 1, right) + 1):
            mask[row + x] = 1
    return mask


def _hull_area(xs: Sequence[int], ys: Sequence[int]) -> float:
    """Convex hull area (monotone chain) of a pixel set."""
    points = sorted(set(zip(xs, ys)))
    if len(points) < 3:
        return 0.0

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    hull = lower[:-1] + upper[:-1]
    area = 0.0
    for index, (x0, y0) in enumerate(hull):
        x1, y1 = hull[(index + 1) % len(hull)]
        area += x0 * y1 - x1 * y0
    return abs(area) * 0.5


def analyse_silhouette(filename: str) -> dict:
    """
    Measures the cavity against correction 2's targets, from the rendered
    silhouette itself rather than from the parameters that produced it.

    Entity pixels are the dark ones. Background reachable from the image
    border is "outside"; any background NOT reachable from the border is
    an enclosed hole — the cavity. Reported as percentages of the
    entity's own bounding box, which is what the targets are stated in.
    """
    image = bpy.data.images.load(str(CAPTURE_DIR / filename))
    width, height = image.size
    pixels = tuple(image.pixels)

    def luminance(index: int) -> float:
        base = index * 4
        return 0.2126 * pixels[base] + 0.7152 * pixels[base + 1] + 0.0722 * pixels[base + 2]

    # Threshold adaptively off a corner pixel. Workbench renders the
    # world colour far darker than it is set, so a fixed threshold
    # classified the ground AND the mass as solid and reported the
    # entity as filling the frame.
    background = luminance(0)
    threshold = background * 0.5

    solid = bytearray(width * height)
    for index in range(width * height):
        solid[index] = 1 if luminance(index) < threshold else 0

    # Flood the background inward from the border.
    outside = bytearray(width * height)
    stack = []
    for x in range(width):
        for y in (0, height - 1):
            i = y * width + x
            if not solid[i] and not outside[i]:
                outside[i] = 1
                stack.append(i)
    for y in range(height):
        for x in (0, width - 1):
            i = y * width + x
            if not solid[i] and not outside[i]:
                outside[i] = 1
                stack.append(i)
    while stack:
        i = stack.pop()
        x, y = i % width, i // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                j = ny * width + nx
                if not solid[j] and not outside[j]:
                    outside[j] = 1
                    stack.append(j)

    entity = [i for i in range(width * height) if solid[i]]
    holes = _largest_component(
        [i for i in range(width * height) if not solid[i] and not outside[i]],
        width, height,
    )
    image.user_clear()
    bpy.data.images.remove(image)

    if not entity:
        return {"error": "no entity pixels"}

    ex = [i % width for i in entity]
    ey = [i // width for i in entity]
    entity_w = max(ex) - min(ex) + 1
    entity_h = max(ey) - min(ey) + 1
    entity_cx = (max(ex) + min(ex)) * 0.5
    entity_cy = (max(ey) + min(ey)) * 0.5

    result = {
        "source": filename,
        "resolution": [width, height],
        "entityWidthPx": entity_w,
        "entityHeightPx": entity_h,
        "cavityVisible": bool(holes),
        "cavityAreaPx": len(holes),
    }
    if holes:
        hx = [i % width for i in holes]
        hy = [i // width for i in holes]
        hole_w = max(hx) - min(hx) + 1
        hole_h = max(hy) - min(hy) + 1
        result.update(
            {
                "cavityWidthPct": round(hole_w / entity_w * 100.0, 1),
                "cavityHeightPct": round(hole_h / entity_h * 100.0, 1),
                # Signed, and reported on the axes the spec states them
                # on. Blender image rows run bottom-up, so a cavity
                # BELOW centre has the smaller row index.
                "cavityOffsetRightPct": round(
                    ((max(hx) + min(hx)) * 0.5 - entity_cx) / entity_w * 100.0, 1
                ),
                "cavityOffsetBelowPct": round(
                    (entity_cy - (max(hy) + min(hy)) * 0.5) / entity_h * 100.0, 1
                ),
                # Occlusion measured against the cavity's CONVEX HULL,
                # not its bounding box. A clean round hole fills only
                # ~79% of its bounding box, so the box version reported
                # 21% occlusion for a completely unobstructed cavity —
                # it was measuring circularity, not obstruction. Against
                # the hull, an unbitten cavity reads ~0 and only real
                # intrusions by foreground slabs score.
                "cavityOcclusionPct": round(
                    max(0.0, 1.0 - len(holes) / max(_hull_area(hx, hy), 1.0)) * 100.0, 1
                ),
            }
        )
    return result


def produce_renders() -> None:
    # Exterior standoffs widened for the same reason as the silhouette:
    # the asset is ~2.9 units in radius and these were framed for
    # something half its size. The side view sits further out again now
    # that the body hull extends to y 8.4.
    render_view("01-exterior-front.png", (0.0, -11.5, 0.35), (0.0, 0.0, 0.15), 58,
                (1536, 1024), STAGE_EXTERIOR)
    render_view("02-exterior-three-quarter.png", (7.4, -8.6, 4.2), (0.0, 0.35, 0.15), 58,
                (1200, 900), STAGE_EXTERIOR)
    render_view("03-exterior-side.png", (11.0, 0.6, 0.60), (0.0, 0.60, 0.10), 55,
                (1200, 900), STAGE_EXTERIOR)
    render_silhouette("04-silhouette-512.png", 512)
    render_silhouette("05-silhouette-128.png", 128)
    render_view("06-cavity-close.png", (0.0, -4.20, 0.05), (0.0, 1.10, 0.0), 62,
                (1200, 900), STAGE_EXTERIOR)
    render_view("07-exterior-stage-visibility.png", (6.8, 6.2, 5.4), (0.0, 1.10, 0.10), 50,
                (1200, 900), STAGE_EXTERIOR)
    render_view("08-tunnel-entry.png", (0.0, -0.65, 0.0), (0.0, 4.2, 0.0), 50,
                (1200, 900), STAGE_TUNNEL)
    # Spec 8: neutral diagnostic lighting strong enough to read all
    # three masses. Workbench studio gives even, material-independent
    # illumination — this is a diagnostic, not a lighting decision, and
    # it touches no material in the asset.
    # The group is ~4.6 tall and sits at y 10.4-11.5; a 34 mm lens at
    # 3.2 units of standoff put the camera inside it. 20 mm from the
    # threshold entrance holds the whole form.
    render_view("09-latent-form-threshold-neutral.png", (0.0, 7.5, 0.40), (0.0, 10.7, 0.40), 20,
                (1200, 900), STAGE_ALL, neutral=True)
    render_silhouette("10-latent-form-silhouette.png", 512,
                      roles={"latent_mass"}, stages=STAGE_ALL,
                      camera=((0.0, 7.5, 0.40), (0.0, 10.7, 0.40), 20))


# ---------------------------------------------------------------------------
# Manifest, save and export
# ---------------------------------------------------------------------------

def triangle_count(obj: bpy.types.Object) -> int:
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def measure_ring_visibility() -> dict:
    """
    How much of each convergence ring is visibly readable at the dormant
    hero. Spec: Ring A 20-35%, Ring B 5-12%, Ring C 0-5%.

    Depth order matters and the first attempt got it backwards. Counting
    "pixels only this ring contributes" penalises the NEAREST ring —
    anything behind it fills in when it is removed — and flattered the
    farthest, which reported A at 6.9% and C at 22.2%, exactly inverted.

    A ring is readable where it is drawn, no slab covers it, and no
    NEARER ring covers it. Rings are walked front to back, accumulating
    an occlusion mask as they go.
    """
    order = ["DL_Ring_A", "DL_Ring_B", "DL_Ring_C"]

    render_silhouette("_m-slabs.png", 512, exclude=set(order))
    slabs, width, height = solid_mask("_m-slabs.png")

    alone: dict[str, bytearray] = {}
    for name in order:
        render_silhouette(f"_m-{name}.png", 512, include={name})
        alone[name], _w, _h = solid_mask(f"_m-{name}.png")

    result = {}
    nearer = bytearray(width * height)
    for name in order:
        mask = alone[name]
        total = sum(mask)
        visible = sum(
            1 for i in range(width * height)
            if mask[i] and not slabs[i] and not nearer[i]
        )
        result[name] = {
            "unoccludedPx": total,
            "visiblePx": visible,
            "visiblePct": round(visible / max(total, 1) * 100.0, 1),
        }
        for i in range(width * height):
            if mask[i]:
                nearer[i] = 1
    return result


def measure_concealment() -> dict:
    """
    How much of the convergence aperture the three foreground masses
    hide. Spec target 12-18%.

    Two earlier definitions were wrong. Differencing the enclosed cavity
    collapsed to 0% (without the foreground the opening is not enclosed
    at all). Bounding the aperture by the silhouette's convex hull gave
    59%, because it counted every pixel FA and FB occupy anywhere in the
    entity, not just over the opening.

    The aperture is the convergence itself: the open bore seen with the
    rings alone. Concealment is how much of that bore the foreground
    masses cover. Nothing else in the entity can influence the number.
    """
    rings = {"DL_Ring_A", "DL_Ring_B", "DL_Ring_C"}

    render_silhouette("_m-rings.png", 512, include=rings)
    open_alone = analyse_silhouette("_m-rings.png").get("cavityAreaPx", 0)

    render_silhouette("_m-rings-fg.png", 512, include=rings | set(FOREGROUND_SLABS))
    open_with = analyse_silhouette("_m-rings-fg.png").get("cavityAreaPx", 0)

    return {
        "foregroundMasses": FOREGROUND_SLABS,
        "apertureAlonePx": open_alone,
        "apertureWithForegroundPx": open_with,
        "concealmentPct": round(
            max(0.0, (open_alone - open_with) / float(max(open_alone, 1))) * 100.0, 1
        ),
    }


def measure_surface_orientation() -> dict:
    """
    Spec section 6: at most three masses may present a broad face to the
    hero camera. Frontality is the area-weighted mean of
    dot(normal, -Y) over camera-facing polygons — 1.0 is dead flat-on.
    """
    view = Vector((0.0, -1.0, 0.0))
    masses = []
    flat = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.get("dl_role", "") != "crown_slab":
            continue
        matrix = obj.matrix_world
        rotation = matrix.to_3x3()
        weighted = 0.0
        area_sum = 0.0
        for polygon in obj.data.polygons:
            normal = (rotation @ polygon.normal).normalized()
            facing = normal.dot(view)
            if facing <= 0.0:
                continue
            weighted += polygon.area * facing
            area_sum += polygon.area
        frontality = weighted / area_sum if area_sum else 0.0
        broad = frontality > 0.80
        flat += 1 if broad else 0
        masses.append(
            {"name": obj.name, "frontality": round(frontality, 3),
             "presents": "broad face" if broad else "edge / angled plane"}
        )
    masses.sort(key=lambda m: -m["frontality"])
    return {"masses": masses, "broadFaceCount": flat, "limit": 3,
            "withinLimit": flat <= 3}


def measure_latent_form() -> dict:
    """Combined Latent Form silhouette ratio. Spec target 1.25-1.55."""
    mask, width, height = solid_mask("10-latent-form-silhouette.png")
    pixels = [i for i in range(width * height) if mask[i]]
    if not pixels:
        return {"error": "no latent pixels"}
    xs = [i % width for i in pixels]
    ys = [i // width for i in pixels]
    w = max(xs) - min(xs) + 1
    h = max(ys) - min(ys) + 1
    return {"widthPx": w, "heightPx": h, "heightOverWidth": round(h / max(w, 1), 3)}


def _exterior_extents() -> dict:
    """
    World bounding box of the exterior-stage mass, and the depth ratio
    that says whether it is compressed. v03's torpedo scored ~2.6; a
    flat disc would score under ~0.25.
    """
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.get("dl_export", False):
            continue
        if obj.get("dl_visibility_stage", "") != "exterior":
            continue
        if obj.get("dl_role", "") == "halo":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                lo[axis] = min(lo[axis], world[axis])
                hi[axis] = max(hi[axis], world[axis])

    width = hi[0] - lo[0]
    depth = hi[1] - lo[1]
    height = hi[2] - lo[2]
    return {
        "widthX": round(width, 3),
        "depthY": round(depth, 3),
        "heightZ": round(height, 3),
        "depthOverWidth": round(depth / max(width, 1e-6), 3),
    }


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
    stage_counts: dict[str, int] = {}
    for item in items:
        stage_counts[item["visibilityStage"]] = stage_counts.get(item["visibilityStage"], 0) + 1

    return {
        "asset": f"DL_CrownedConvergence_Clay_{VERSION}",
        "coordinateSystem": "Blender Z-up; +Y travels into entity",
        "objectCount": len(items),
        "totalTriangles": total,
        "objectsByStage": stage_counts,
        "exteriorStageObjects": sorted(
            item["name"] for item in items if item["visibilityStage"] == "exterior"
        ),
        # There is no outer_r to report any more. The equivalent check on
        # an authored exterior is the bounding box: whether the mass is
        # actually COMPRESSED rather than a flat disc or a long torpedo.
        "exteriorExtents": _exterior_extents(),
        "objects": items,
        "cameraPath": CAMERA_PATH_POINTS,
        "reference": str(REFERENCE),
    }


def save_blend() -> None:
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT), check_existing=False, compress=True)


def measure_clearance(clearance: float = 0.52) -> dict:
    """
    Minimum distance from the camera path to every exportable object.
    Re-run every build so the number in the manifest is the number the
    geometry actually produces.
    """
    samples: list[Vector] = []
    for index in range(len(CAMERA_PATH_POINTS) - 1):
        a = Vector(CAMERA_PATH_POINTS[index])
        b = Vector(CAMERA_PATH_POINTS[index + 1])
        for step in range(32):
            samples.append(a.lerp(b, step / 32.0))
    samples.append(Vector(CAMERA_PATH_POINTS[-1]))

    results = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.get("dl_export", False):
            continue
        matrix = obj.matrix_world
        inverse = matrix.inverted()
        nearest = 1e9
        for point in samples:
            found, location, _normal, _index = obj.closest_point_on_mesh(inverse @ point)
            if not found:
                continue
            nearest = min(nearest, ((matrix @ location) - point).length)
        if nearest < 1e8:
            results.append((round(nearest, 3), obj.name))

    results.sort()
    violations = [name for distance, name in results if distance < clearance]
    return {
        "required": clearance,
        "violations": violations,
        "tightest": [{"object": name, "distance": distance} for distance, name in results[:5]],
    }


def export_glb() -> None:
    # Staging is a render concern; everything ships in the GLB.
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.hide_render = False

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


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

if ARGS.render:
    produce_renders()

manifest = create_manifest()
manifest["clearance"] = measure_clearance()

if ARGS.render:
    manifest["silhouette"] = {
        "visibleCavity": [
            analyse_silhouette("04-silhouette-512.png"),
            analyse_silhouette("05-silhouette-128.png"),
        ],
        "concealment": measure_concealment(),
    }
    manifest["ringVisibility"] = measure_ring_visibility()
    manifest["surfaceOrientation"] = measure_surface_orientation()
    manifest["latentForm"] = measure_latent_form()

    # Measurement renders are not deliverables; the capture folder must
    # end up holding exactly the eleven required files.
    for _temp in CAPTURE_DIR.glob("_m-*.png"):
        _temp.unlink()

MANIFEST_OUT.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

print("MANIFEST_ASSET", manifest["asset"])
print("OBJECT_COUNT", manifest["objectCount"])
print("TRIANGLE_TOTAL", manifest["totalTriangles"])
print("STAGES", json.dumps(manifest["objectsByStage"]))
print("EXTERIOR_EXTENTS", json.dumps(manifest["exteriorExtents"]))
print("CLEARANCE_VIOLATIONS", len(manifest["clearance"]["violations"]),
      json.dumps(manifest["clearance"]["tightest"][:3]))
for entry in manifest.get("silhouette", {}).get("visibleCavity", []):
    print("VISIBLE_CAVITY", json.dumps(entry))
if "silhouette" in manifest:
    print("CONCEALMENT", json.dumps(manifest["silhouette"]["concealment"]))
if "ringVisibility" in manifest:
    print("RING_VISIBILITY", json.dumps(
        {k: v["visiblePct"] for k, v in manifest["ringVisibility"].items()}))
    print("SURFACE_ORIENTATION", json.dumps(manifest["surfaceOrientation"]["broadFaceCount"]))
    print("LATENT_FORM", json.dumps(manifest["latentForm"]))

save_blend()
export_glb()

print("CROWNED_CONVERGENCE_BUILD_OK")
print("GLB", GLB_OUT)
