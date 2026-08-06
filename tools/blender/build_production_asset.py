"""
Dark Lattice — Crowned Convergence PRODUCTION asset.

Takes the approved v06 clay build and prepares the asset the website
actually ships: same geometry, cleaned, with the runtime metadata the
loader needs baked into glTF extras.

This deliberately does NOT redesign anything. Per the full-build
directive, geometry only changes if it would clip the camera, break the
hero silhouette, leave disconnected geometry visible at runtime, or fail
to export.

Run headless:
    blender --background --python tools/blender/build_production_asset.py -- \\
        --root <repo>

Outputs:
    assets/blender/DL_CrownedConvergence_Production_v01.blend
    public/models/DL_CrownedConvergence_Production_v01.glb
    captures/production/asset-report.json
"""

import argparse
import json
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=os.getcwd())
    return parser.parse_args(argv)


ARGS = parse_args()
ROOT = Path(ARGS.root).resolve()
CLAY_BLEND = ROOT / "assets" / "blender" / "DL_CrownedConvergence_Clay_v06.blend"
BLEND_OUT = ROOT / "assets" / "blender" / "DL_CrownedConvergence_Production_v01.blend"
GLB_OUT = ROOT / "public" / "models" / "DL_CrownedConvergence_Production_v01.glb"
REPORT_DIR = ROOT / "captures" / "production"
REPORT_OUT = REPORT_DIR / "asset-report.json"


# ---------------------------------------------------------------------------
# Runtime metadata
#
# The website resolves parts by name, but everything else it needs about a
# part — which material class to instance, when it becomes relevant, how
# hard it answers the reaction field, how it moves when the crown yields —
# travels with the asset as glTF extras. That keeps the choreography
# authored here rather than duplicated as a lookup table in TypeScript.
# ---------------------------------------------------------------------------

# Narrative windows, matching section 8 of the directive.
STAGE_WINDOWS = {
    "exterior": [0.00, 0.30],
    "tunnel": [0.18, 0.86],
    "threshold": [0.74, 0.96],
    "revelation": [0.86, 1.00],
}

# Per-role runtime hints. reaction is how strongly the Gray-Scott field
# shows on that class; projection selects the sampling strategy.
ROLE_RUNTIME = {
    "crown_slab": {"reaction": 1.00, "projection": "planar"},
    "convergence_ring": {"reaction": 0.55, "projection": "cylindrical"},
    "tunnel_shell": {"reaction": 0.40, "projection": "cylindrical"},
    "threshold_chamber": {"reaction": 0.25, "projection": "cylindrical"},
    "latent_mass": {"reaction": 0.30, "projection": "planar"},
    "latent_seam": {"reaction": 1.00, "projection": "planar"},
    "halo": {"reaction": 0.05, "projection": "none"},
}

# Ring spin at the yield, per directive 9.2.
RING_YIELD_DEGREES = {"DL_Ring_A": 4.0, "DL_Ring_B": -6.0, "DL_Ring_C": 8.0}


def load_clay():
    if not CLAY_BLEND.exists():
        raise SystemExit(f"Clay source missing: {CLAY_BLEND}")
    bpy.ops.wm.open_mainfile(filepath=str(CLAY_BLEND))


def strip_review_objects():
    """Removes review lights and cameras; they must not reach the GLB."""
    removed = []
    for obj in list(bpy.data.objects):
        if obj.type in {"LIGHT", "CAMERA"} or obj.name.startswith("DL_REFERENCE"):
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def exterior_bounds():
    """
    World bounds of the crown, used to normalise planar reaction sampling
    at runtime. Baked into the root so the shader does not have to guess.
    """
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.get("dl_role", "") != "crown_slab":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                lo[axis] = min(lo[axis], world[axis])
                hi[axis] = max(hi[axis], world[axis])
    return lo, hi


def tunnel_span():
    """Y range the corridor occupies, for normalised depth sampling."""
    near, far = 1e9, -1e9
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.get("dl_role", "") not in {
            "convergence_ring", "tunnel_shell", "threshold_chamber"
        }:
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            near = min(near, world.y)
            far = max(far, world.y)
    return near, far


def annotate():
    """Writes the runtime extras every mesh carries into the GLB."""
    lo, hi = exterior_bounds()
    near, far = tunnel_span()

    root = bpy.data.objects.get("DL_CrownedConvergence_ROOT")
    if root:
        root["dl_stage_windows"] = json.dumps(STAGE_WINDOWS)
        root["dl_exterior_bounds"] = json.dumps({"min": lo, "max": hi})
        root["dl_tunnel_span"] = json.dumps({"near": near, "far": far})
        root["dl_palette"] = json.dumps({
            "void": "#010204",
            "structure": "#020406",
            "raisedBlack": "#081016",
            "teal": "#36E0B0",
            "cyan": "#4DD0FF",
            "coldWhite": "#DFF9FF",
            "magenta": "#FF2B9A",
            "amber": "#C9A24A",
        })

    annotated = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        role = obj.get("dl_role", "")
        runtime = ROLE_RUNTIME.get(role, {"reaction": 0.3, "projection": "planar"})
        obj["dl_reaction"] = runtime["reaction"]
        obj["dl_projection"] = runtime["projection"]

        stage = obj.get("dl_visibility_stage", "exterior")
        window = STAGE_WINDOWS.get(stage, STAGE_WINDOWS["exterior"])
        obj["dl_stage_from"] = window[0]
        obj["dl_stage_to"] = window[1]

        if obj.name in RING_YIELD_DEGREES:
            obj["dl_yield_spin_deg"] = RING_YIELD_DEGREES[obj.name]

        # Crown masses need their own yield vector. The clay already
        # authored dl_open_translation / dl_open_rotation; clamp them to
        # the directive's limits (0.04-0.14 m, max 5 degrees) so the
        # opening reads as pressure release rather than petals.
        if role == "crown_slab":
            translation = list(obj.get("dl_open_translation", [0.0, 0.0, 0.0]))
            length = max((sum(v * v for v in translation)) ** 0.5, 1e-6)
            target = min(max(length, 0.04), 0.14)
            obj["dl_open_translation"] = [v / length * target for v in translation]

            rotation = list(obj.get("dl_open_rotation", [0.0, 0.0, 0.0]))
            limit = 5.0 * 3.14159265 / 180.0
            obj["dl_open_rotation"] = [
                max(-limit, min(limit, value)) for value in rotation
            ]
        annotated += 1
    return annotated


def triangle_total():
    total = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.get("dl_export", False):
            continue
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def export():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_OUT.parent.mkdir(parents=True, exist_ok=True)
    GLB_OUT.parent.mkdir(parents=True, exist_ok=True)

    # Everything ships; visibility is a runtime concern.
    for obj in bpy.data.objects:
        obj.hide_render = False
        obj.hide_viewport = False

    bpy.ops.object.select_all(action="DESELECT")
    exported = []
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.get("dl_export", False):
            obj.select_set(True)
            exported.append(obj.name)
        elif obj.type == "EMPTY":
            # Keep the hierarchy empties so the loader can walk groups.
            obj.select_set(True)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT), check_existing=False, compress=True)

    bpy.ops.export_scene.gltf(
        filepath=str(GLB_OUT),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    return sorted(exported)


def main():
    load_clay()
    removed = strip_review_objects()
    annotated = annotate()
    triangles = triangle_total()
    exported = export()

    report = {
        "asset": "DL_CrownedConvergence_Production_v01",
        "source": CLAY_BLEND.name,
        "blend": str(BLEND_OUT),
        "glb": str(GLB_OUT),
        "glbBytes": GLB_OUT.stat().st_size,
        "triangles": triangles,
        "meshCount": len(exported),
        "meshes": exported,
        "removedReviewObjects": removed,
        "annotatedObjects": annotated,
        "stageWindows": STAGE_WINDOWS,
    }
    REPORT_OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("PRODUCTION_ASSET_OK")
    print("TRIANGLES", triangles)
    print("MESHES", len(exported))
    print("GLB_BYTES", report["glbBytes"])
    print("GLB", GLB_OUT)


if __name__ == "__main__":
    main()
