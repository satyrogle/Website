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
VERSION = "v03"

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

# ---------------------------------------------------------------------------
# v03 structural corrections
#
# 1. THE WHEEL/TURBINE READ. v02 put every slab on the same radial band,
#    pointing straight out, at roughly even angular spacing. Those three
#    properties ARE a turbine — the eye reads impeller blades no matter
#    what the individual shapes do. All three are broken here:
#      - outer_r spread 1.78 -> 2.92 instead of 2.33 -> 2.62;
#      - a Z rotation per slab (up to +-32 degrees) swings each one off
#        its own radial axis, so the pieces no longer agree on a hub;
#      - angular spacing is dense above (17-28 degrees) and sparse below
#        (39-43), so no rotational rhythm survives.
#
# 2. MASS HIERARCHY. Three explicit tiers — two dominant slabs, four
#    medium, seven small — rather than one row of near-equals. Depth
#    scales with the tier too, so hierarchy reads in silhouette AND in
#    three-quarter.
#
# 3. CAVITY. Off-centre: the aperture is a circle centred at
#    CAVITY_CENTRE, not at the origin, so each slab's inner radius is
#    solved against it (cavity_inner_r). Two occluder slabs sit forward
#    of the others and reach across the opening, so the hollow is never
#    a clean readable disc.
# ---------------------------------------------------------------------------

# Cavity as an off-centre circle in the XZ face plane.
CAVITY_CENTRE = (0.24, -0.16)
CAVITY_RADIUS = 1.46


def cavity_inner_r(angle_deg: float) -> float:
    """
    Distance from the origin to the off-centre cavity boundary along
    *angle_deg*. Solving this per slab is what makes the aperture sit
    off-axis while the outer silhouette stays centred — moving every
    slab bodily would have dragged the whole crown sideways instead.
    """
    angle = math.radians(angle_deg)
    ux, uz = math.cos(angle), math.sin(angle)
    cx, cz = CAVITY_CENTRE
    proj = ux * cx + uz * cz
    centre_sq = cx * cx + cz * cz
    return proj + math.sqrt(max(proj * proj - centre_sq + CAVITY_RADIUS ** 2, 1e-6))


# (angle, half_angle, outer_r, spike, depth, y, rot, tier, inner_scale)
#   tier         1 dominant, 2 medium, 3 small
#   inner_scale  <1 pulls the slab's inner edge across the cavity; used
#                only by the two occluders, and floored well outside the
#                0.52 camera tube.
_CROWN_TABLE = [
    # --- tier 1: the two dominant masses, both upper, crown leans left
    (112.0, 20.0, 2.92, 1.38, 1.30, -0.30, (-6.0,  4.0,  -8.0), 1, 1.00),
    ( 72.0, 18.0, 2.78, 1.30, 1.18, -0.20, (-3.0,  6.0,  14.0), 1, 1.00),
    # --- tier 2: medium
    (158.0, 15.0, 2.40, 1.12, 0.90, -0.05, ( 5.0, -8.0, -22.0), 2, 1.00),
    (206.0, 14.0, 2.28, 1.08, 0.85,  0.12, ( 3.0, -5.0,  18.0), 2, 1.00),
    (328.0, 16.0, 2.45, 1.20, 0.95, -0.12, (-3.0,  7.0, -15.0), 2, 1.00),
    ( 27.0, 14.0, 2.32, 1.10, 0.88,  0.05, (-2.0,  8.0,  26.0), 2, 1.00),
    # --- tier 3: small shards, incl. two occluders (y forward of the rest)
    ( 92.0, 10.0, 1.95, 1.14, 0.52, -0.62, ( 4.0, -3.0,  11.0), 3, 0.60),
    ( 55.0, 10.0, 1.88, 1.10, 0.48, -0.55, (-5.0,  2.0, -13.0), 3, 0.63),
    (135.0, 11.0, 2.02, 1.09, 0.55,  0.30, ( 3.0,  5.0, -30.0), 3, 1.00),
    (180.0,  9.0, 1.85, 1.07, 0.46,  0.38, (-2.0, -6.0,  20.0), 3, 1.00),
    (246.0, 10.0, 1.98, 1.16, 0.50,  0.26, ( 6.0,  3.0, -25.0), 3, 1.00),
    (285.0,  9.0, 1.78, 1.06, 0.44,  0.42, (-4.0,  4.0,  32.0), 3, 1.00),
    (352.0, 11.0, 2.05, 1.11, 0.54,  0.18, ( 2.0, -5.0, -18.0), 3, 1.00),
]

CROWN_SPECS = []
for _index, (_angle, _half, _outer, _spike, _depth, _y, _rot, _tier, _inner_scale) in enumerate(
    _CROWN_TABLE
):
    CROWN_SPECS.append(
        {
            "name": ("DL_CrownSlab_%02d" if _tier < 3 else "DL_CrownShard_%02d") % (_index + 1),
            "angle_deg": _angle,
            "half_angle_deg": _half,
            "inner_r": cavity_inner_r(_angle) * _inner_scale,
            "outer_r": _outer,
            "spike": _spike,
            "depth": _depth,
            "y": _y,
            "rot": _rot,
            "material": "MAT_CROWN_PRIMARY" if _tier == 1 else "MAT_CROWN_SECONDARY",
            "layer": _tier,
            "open_translation": (
                math.cos(math.radians(_angle)) * 0.05 * _tier,
                -0.01 * _tier,
                math.sin(math.radians(_angle)) * 0.05 * _tier,
            ),
            "open_rotation": (-2.0 + _tier, 2.0 - _tier, _rot[2] * 0.08),
        }
    )

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


def create_body_hull(
    name: str,
    levels: Sequence[tuple[float, float, float, float, float, float]],
    segments: int,
    parent: bpy.types.Object,
    material_name: str,
    role: str,
    visibility_stage: str,
) -> bpy.types.Object:
    """
    The outward-facing body that closes over the tunnel.

    v03 correction 4: the tunnel used to run naked from the back of the
    crown, so from any three-quarter angle the entity was a crown stuck
    on the end of a clean octagonal pipe. This wraps it.

    A plain tapering tube would only replace one pipe with another, so
    each level carries its own radius, its own angular wobble and phase,
    its own elliptical squash, and its own lateral offset — the section
    is never a circle, the taper never a cone, and the axis drifts, so
    the mass reads as a body narrowing into dark rather than as duct.

    levels: (y, radius, wobble, phase_deg, squash_x, drift_x)
    """
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    for level, (y, radius, wobble, phase_deg, squash_x, drift_x) in enumerate(levels):
        phase = math.radians(phase_deg)
        for index in range(segments):
            angle = index / segments * math.tau
            modulation = 1.0 + wobble * math.sin(3.0 * angle + phase) \
                             + wobble * 0.45 * math.sin(5.0 * angle - phase * 1.7)
            x, z = polar(radius * modulation, angle)
            vertices.append((x * squash_x + drift_x, y, z))

    for level in range(len(levels) - 1):
        start = level * segments
        nxt = (level + 1) * segments
        for index in range(segments):
            j = (index + 1) % segments
            # Wound so the normals face OUT — this is seen from outside.
            faces.append((start + index, start + j, nxt + j, nxt + index))

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
    set_props(obj, role, 0, material_name, 0.18, visibility_stage)
    return obj


BODY_HULL = create_body_hull(
    "DL_BodyHull",
    levels=[
        # y,    radius, wobble, phase, squash_x, drift_x
        (0.30,  2.54,   0.075,   18.0, 1.03,  0.02),
        (1.05,  2.47,   0.090,   52.0, 0.98,  0.05),
        (2.05,  2.18,   0.110,   96.0, 1.05,  0.09),
        (3.10,  1.97,   0.085,  141.0, 0.96,  0.13),
        (4.35,  1.83,   0.105,  188.0, 1.04,  0.16),
        (5.70,  1.72,   0.078,  233.0, 0.97,  0.18),
        (7.10,  1.63,   0.095,  281.0, 1.02,  0.17),
        (8.40,  1.56,   0.070,  326.0, 0.99,  0.15),
    ],
    segments=11,
    parent=ROOT_OBJ,
    material_name="MAT_STRUCTURE",
    role="body_hull",
    visibility_stage="exterior",
)


TUNNEL_SHELL = create_inward_tube(
    "DL_TunnelShell",
    # Extended forward from 1.85 to 0.55: the hull starts at y 0.30, and
    # without this the stretch between them showed the hull's unlit
    # interior through the cavity.
    y_values=[0.55, 1.85, 2.8, 4.0, 5.2, 6.5, 7.8],
    radii=[1.80, 1.72, 1.66, 1.58, 1.50, 1.43, 1.38],
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
LATENT_MASS_SPECS = [
    {
        "name": "DL_LatentMass_A",
        "points": [(-1.02, -1.35), (0.10, -1.48), (0.46, -0.32), (0.22, 1.42), (-0.84, 1.16), (-1.24, 0.14)],
        "depth": 0.74,
        "location": (-0.62, 10.62, 0.10),
        "rotation": (6.0, -8.0, -5.0),
    },
    {
        "name": "DL_LatentMass_B",
        "points": [(-0.24, -1.28), (0.98, -1.10), (1.20, 0.24), (0.70, 1.52), (-0.28, 1.18), (-0.56, -0.10)],
        "depth": 0.80,
        "location": (0.58, 10.70, 0.06),
        "rotation": (-4.0, 7.0, 4.0),
    },
    {
        "name": "DL_LatentMass_C",
        "points": [(-0.80, -0.34), (-0.10, -0.92), (0.78, -0.48), (0.92, 0.44), (0.10, 1.02), (-0.66, 0.74)],
        "depth": 0.62,
        "location": (0.02, 10.36, 0.72),
        "rotation": (8.0, 2.0, -3.0),
    },
    {
        "name": "DL_LatentMass_D",
        "points": [(-0.58, -1.02), (0.16, -1.18), (0.44, 0.10), (0.20, 1.86), (-0.42, 1.54), (-0.70, 0.22)],
        "depth": 0.56,
        "location": (-0.34, 10.94, -0.46),
        "rotation": (3.0, -5.0, 7.0),
    },
    {
        "name": "DL_LatentMass_E",
        "points": [(-0.36, -0.88), (0.52, -0.74), (0.68, 0.28), (0.34, 1.62), (-0.30, 1.30), (-0.52, 0.16)],
        "depth": 0.52,
        "location": (0.46, 11.02, -0.38),
        "rotation": (-6.0, 4.0, -8.0),
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

# The seam scales with the masses it divides — a 0.9-unit slit between
# 3-unit forms would read as a scratch. Kept forward of them at y 10.15
# so it separates the group rather than sitting inside one mass.
SEAM = create_prism_xz(
    name="DL_LatentSeam",
    points_xz=[(-0.055, -1.06), (0.055, -0.92), (0.040, 1.02), (-0.040, 1.22)],
    depth=0.14,
    parent=LATENT_ROOT,
    location=(0.04, 10.15, 0.04),
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
        # v03 reaches 4.03 units (dominant slab 2.92 x spike 1.38), and
        # 12.5 only saw +-3.87 — the crest horns were clipping the top
        # edge of the gate render.
        CAMERA.location = (0.0, -14.5, 0.35)
        CAMERA.data.lens = 58
        look_at(CAMERA, (0.0, 0.0, 0.15))
        bpy.ops.render.render(write_still=True)
    finally:
        HALO.hide_render = hidden
        SCENE.render.engine = original_engine


def produce_renders() -> None:
    # Exterior standoffs widened for the same reason as the silhouette:
    # the asset is ~2.9 units in radius and these were framed for
    # something half its size. The side view sits further out again now
    # that the body hull extends to y 8.4.
    render_view("01-exterior-front.png", (0.0, -14.5, 0.35), (0.0, 0.0, 0.15), 58, (1536, 1024))
    render_view("02-exterior-three-quarter.png", (8.6, -10.6, 4.8), (0.0, 1.20, 0.15), 58)
    # The side view has to hold crown through Latent Form — about 13
    # units of length — so it needs a much longer standoff than the
    # front. At 14.5 the hull ran straight off the frame edge.
    render_view("03-exterior-side.png", (22.0, 4.2, 1.40), (0.0, 4.20, 0.10), 52, (1536, 1024))
    render_view("04-cavity-close.png", (0.0, -3.65, 0.08), (0.0, 1.15, 0.0), 62)
    render_view("05-tunnel-entry.png", (0.0, -0.65, 0.0), (0.0, 4.2, 0.0), 50)
    render_view("06-tunnel-midpoint.png", (0.0, 4.2, 0.0), (0.0, 8.7, 0.0), 47)
    # The Latent Form is ~3 units tall in v03, so a 48 mm lens at 2.5
    # units of standoff framed the seam alone. Backed off and widened.
    render_view("07-latent-form-from-threshold.png", (0.0, 7.0, 0.0), (0.0, 10.7, 0.05), 32)
    render_silhouette("08-silhouette-512.png", 512)
    render_silhouette("09-silhouette-128.png", 128)


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
