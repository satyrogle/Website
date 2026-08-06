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
VERSION = "v04"

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
#
# v04 correction 2: the cavity has to survive the 128 px silhouette as a
# readable landmark, so what matters is not this boundary but the CLEAR
# BORE at the centre — the region no exterior-stage object occupies.
# The primary rings' inner radii (RING_BORE) set that hole, and the
# measured result is reported by analyse_silhouette() rather than
# assumed. Displacement is kept to ~5-6% of entity width: enough to
# read as deliberate, not enough to look like a mistake.
CAVITY_CENTRE = (0.22, -0.14)
# 1.42 -> 1.33: the visible cavity is not just the central bore, it also
# spurs outward through each ring interruption as far as the crown's
# inner edge. Those spurs set the measured bounding box, so the aperture
# had to come in to land inside the 30-36% / 26-34% window.
CAVITY_RADIUS = 1.25

# Every exterior-stage object stays outside this radius, so the front
# silhouette keeps an unbroken hole. 0.82 measures ~31% of entity width.
RING_BORE = 0.73


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
#   inner_scale  <1 pulls the slab's inner edge across the cavity
#
# v04 correction 3 — HORNS. v03 reached 4.03 units off a median outer_r
# of 2.22: a 1.81x overhang that read as spear points and pierced the
# halo. Every reach (outer_r x spike) is now held under 1.12 x the
# median outer_r, and the check is computed and printed at build time
# rather than eyeballed. Mass comes from breadth and overhang instead:
# spikes are 1.02-1.09 where they used to run to 1.38.
#
# v04 correction 4 — DEBRIS. Seven tier-3 shards became five, and the
# two that survived nearest the cavity are the ones that frame it. The
# gaps between 206 and 328 degrees are now deliberately empty.
_CROWN_TABLE = [
    # --- tier 1: the two dominant masses, both upper, crown leans left
    (112.0, 21.0, 2.42, 1.02, 1.30, -0.30, (-6.0,  4.0,  -8.0), 1, 1.00),
    ( 72.0, 19.0, 2.38, 1.03, 1.18, -0.20, (-3.0,  6.0,  14.0), 1, 1.00),
    # --- tier 2: medium
    (158.0, 16.0, 2.34, 1.04, 0.92, -0.05, ( 5.0, -8.0, -22.0), 2, 1.00),
    (206.0, 15.0, 2.30, 1.05, 0.86,  0.12, ( 3.0, -5.0,  18.0), 2, 1.00),
    (328.0, 17.0, 2.26, 1.06, 0.96, -0.12, (-3.0,  7.0, -15.0), 2, 1.00),
    ( 27.0, 15.0, 2.22, 1.07, 0.88,  0.05, (-2.0,  8.0,  26.0), 2, 1.00),
    # --- tier 3: five shards. One occluder only (92 deg, forward in y),
    #     reaching to ~0.72 x the cavity boundary — it clips the ring
    #     zone, never the clear bore, so cavity occlusion stays small.
    ( 92.0, 11.0, 1.98, 1.08, 0.52, -0.58, ( 4.0, -3.0,  11.0), 3, 0.685),
    (135.0, 11.0, 1.92, 1.09, 0.55,  0.30, ( 3.0,  5.0, -30.0), 3, 1.00),
    (180.0,  9.0, 1.88, 1.08, 0.46,  0.38, (-2.0, -6.0,  20.0), 3, 1.00),
    (285.0, 10.0, 1.85, 1.07, 0.44,  0.42, (-4.0,  4.0,  32.0), 3, 1.00),
    (352.0, 11.0, 1.78, 1.09, 0.54,  0.18, ( 2.0, -5.0, -18.0), 3, 1.00),
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

# Correction 3, verified rather than asserted.
# The single forward slab that reaches across the cavity (92 deg,
# inner_scale 0.72). Named here so the occlusion measurement can
# difference it out.
OCCLUDER_NAME = next(
    spec["name"] for spec, row in zip(CROWN_SPECS, _CROWN_TABLE) if row[8] < 1.0
)

_OUTER_RS = sorted(spec["outer_r"] for spec in CROWN_SPECS)
CROWN_MEDIAN_OUTER = _OUTER_RS[len(_OUTER_RS) // 2]
CROWN_REACH_LIMIT = CROWN_MEDIAN_OUTER * 1.12
CROWN_MAX_REACH = max(spec["outer_r"] * spec["spike"] for spec in CROWN_SPECS)

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
PRIMARY_RINGS = [
    {
        "name": "DL_Ring_A",
        "y": 0.74,
        "offset": (0.09, -0.05),
        # gaps at 118-150, 214-250, 326-368 degrees
        "fins": [
            (  8.0,  42.0, 0.765, 1.70, 0.26, -0.03),
            ( 52.0,  74.0, 0.748, 1.52, 0.30,  0.05),
            ( 86.0, 118.0, 0.783, 1.74, 0.24, -0.06),
            (150.0, 178.0, 0.739, 1.46, 0.32,  0.07),
            (192.0, 214.0, 0.774, 1.62, 0.27, -0.04),
            (250.0, 288.0, 0.730, 1.68, 0.29,  0.06),
            (300.0, 326.0, 0.756, 1.40, 0.25, -0.05),
        ],
    },
    {
        "name": "DL_Ring_B",
        "y": 1.18,
        "offset": (-0.06, 0.08),
        # gaps at 96-128, 204-238, 310-380 degrees
        "fins": [
            ( 20.0,  58.0, 0.748, 1.44, 0.28,  0.06),
            ( 70.0,  96.0, 0.783, 1.26, 0.32, -0.05),
            (128.0, 152.0, 0.730, 1.50, 0.24,  0.07),
            (164.0, 204.0, 0.765, 1.34, 0.30, -0.06),
            (238.0, 262.0, 0.739, 1.48, 0.26,  0.04),
            (274.0, 310.0, 0.774, 1.30, 0.31, -0.07),
        ],
    },
    {
        "name": "DL_Ring_C",
        "y": 1.62,
        "offset": (0.12, 0.04),
        # gaps at 96-128, 158-196, 286-330 degrees
        "fins": [
            (  0.0,  44.0, 0.756, 1.22, 0.30, -0.05),
            ( 56.0,  96.0, 0.730, 1.30, 0.25,  0.07),
            (128.0, 158.0, 0.783, 1.14, 0.32, -0.06),
            (196.0, 238.0, 0.748, 1.26, 0.27,  0.05),
            (250.0, 286.0, 0.765, 1.10, 0.29, -0.04),
            (330.0, 356.0, 0.739, 1.20, 0.24,  0.06),
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
LATENT_MASS_SPECS = [
    {
        # Largest — left, leaning out, the anchor.
        "name": "DL_LatentMass_A",
        "points": [(-1.18, -1.52), (-0.22, -1.66), (0.16, -0.44), (0.02, 1.30), (-0.72, 1.62), (-1.36, 0.30)],
        "depth": 0.78,
        "location": (-0.98, 10.48, -0.22),
        "rotation": (5.0, -9.0, -7.0),
    },
    {
        # Medium — right, shorter, tipped the other way.
        "name": "DL_LatentMass_B",
        "points": [(-0.14, -1.10), (0.86, -0.94), (1.06, 0.18), (0.62, 1.16), (-0.16, 0.94), (-0.42, -0.08)],
        "depth": 0.66,
        "location": (0.88, 10.58, 0.08),
        "rotation": (-6.0, 8.0, 6.0),
    },
    {
        # Smallest — high and to the right, breaking any centred axis.
        "name": "DL_LatentMass_C",
        "points": [(-0.52, -0.62), (0.28, -0.74), (0.58, 0.06), (0.34, 0.86), (-0.30, 0.72), (-0.60, 0.10)],
        "depth": 0.54,
        "location": (0.34, 10.34, 1.44),
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
    points_xz=[(-0.048, -0.92), (0.048, -0.80), (0.034, 0.86), (-0.034, 1.02)],
    depth=0.12,
    parent=LATENT_ROOT,
    location=(-0.02, 10.86, 0.10),
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
) -> None:
    apply_stage(stages or STAGE_ALL)
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
    holes = [i for i in range(width * height) if not solid[i] and not outside[i]]
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
                "cavityOffsetPct": round(
                    math.dist(
                        ((max(hx) + min(hx)) * 0.5, (max(hy) + min(hy)) * 0.5),
                        (entity_cx, entity_cy),
                    )
                    / entity_w
                    * 100.0,
                    1,
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
    # --- exterior stage: crown, rear shell, rings A/B/C, halo only -----
    render_view("01-exterior-front.png", (0.0, -11.5, 0.35), (0.0, 0.0, 0.15), 58,
                (1536, 1024), STAGE_EXTERIOR)
    render_view("02-exterior-three-quarter.png", (7.4, -8.6, 4.2), (0.0, 0.35, 0.15), 58,
                (1200, 900), STAGE_EXTERIOR)
    # With the corridor staged out, the side view only has to hold ~5
    # units of mass, so it comes back in from 22.0 to 11.0 — the entity
    # should read compact here, which is the whole point of correction 1.
    render_view("03-exterior-side.png", (11.0, 0.6, 0.60), (0.0, 0.60, 0.10), 55,
                (1200, 900), STAGE_EXTERIOR)
    render_view("04-cavity-close.png", (0.0, -4.20, 0.05), (0.0, 1.10, 0.0), 62,
                (1200, 900), STAGE_EXTERIOR)
    # The diagnostic: same exterior stage, high three-quarter-rear. If
    # any corridor object were leaking into the hero, it would show here.
    render_view("05-exterior-stage-visibility.png", (6.8, 6.2, 5.4), (0.0, 1.10, 0.10), 50,
                (1200, 900), STAGE_EXTERIOR)

    # --- tunnel and threshold stages -----------------------------------
    render_view("06-tunnel-entry.png", (0.0, -0.65, 0.0), (0.0, 4.2, 0.0), 50,
                (1200, 900), STAGE_TUNNEL)
    render_view("07-tunnel-midpoint.png", (0.0, 4.2, 0.0), (0.0, 8.7, 0.0), 47,
                (1200, 900), STAGE_TUNNEL)
    render_view("08-latent-form-from-threshold.png", (0.0, 7.4, 0.10), (0.0, 10.6, 0.25), 34,
                (1200, 900), STAGE_ALL)

    render_silhouette("09-silhouette-512.png", 512)
    render_silhouette("10-silhouette-128.png", 128)
    # Measurement pass, not a review image. Occlusion is the DIFFERENCE
    # the forward slab makes to the open cavity area — rendering the
    # same silhouette without it and differencing is the only way to
    # separate slab intrusion from the ring scalloping that is there by
    # design. (A crown-only pass does not work: with gaps deliberately
    # left between slabs, the crown alone encloses nothing.)
    render_silhouette("11-cavity-without-occluder.png", 512, exclude={OCCLUDER_NAME})


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
        "crownReach": {
            "medianOuterR": round(CROWN_MEDIAN_OUTER, 3),
            "limit_1_12x": round(CROWN_REACH_LIMIT, 3),
            "maxReach": round(CROWN_MAX_REACH, 3),
            "withinLimit": bool(CROWN_MAX_REACH <= CROWN_REACH_LIMIT),
        },
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


if ARGS.render:
    produce_renders()

manifest = create_manifest()
manifest["clearance"] = measure_clearance()
if ARGS.render:
    _with = analyse_silhouette("09-silhouette-512.png")
    _without = analyse_silhouette("11-cavity-without-occluder.png")
    _open_with = _with.get("cavityAreaPx", 0)
    _open_without = _without.get("cavityAreaPx", 0) or 1
    manifest["silhouette"] = {
        "visibleCavity": [_with, analyse_silhouette("10-silhouette-128.png")],
        "slabOcclusion": {
            "occluder": OCCLUDER_NAME,
            "cavityAreaWithoutOccluderPx": _open_without,
            "cavityAreaWithOccluderPx": _open_with,
            "slabOcclusionPct": round(
                max(0.0, (_open_without - _open_with) / float(_open_without)) * 100.0, 1
            ),
        },
    }
MANIFEST_OUT.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

print("MANIFEST_ASSET", manifest["asset"])
print("OBJECT_COUNT", manifest["objectCount"])
print("TRIANGLE_TOTAL", manifest["totalTriangles"])
print("STAGES", json.dumps(manifest["objectsByStage"]))
print("CROWN_REACH", json.dumps(manifest["crownReach"]))
print("CLEARANCE_VIOLATIONS", len(manifest["clearance"]["violations"]),
      json.dumps(manifest["clearance"]["tightest"][:3]))
for entry in manifest.get("silhouette", {}).get("visibleCavity", []):
    print("VISIBLE_CAVITY", json.dumps(entry))
if "silhouette" in manifest:
    print("SLAB_OCCLUSION", json.dumps(manifest["silhouette"]["slabOcclusion"]))

save_blend()
export_glb()

print("CROWNED_CONVERGENCE_BUILD_OK")
print("BLEND", BLEND_OUT)
print("GLB", GLB_OUT)
print("CAPTURES", CAPTURE_DIR)
print("TRIANGLES", manifest["totalTriangles"])
