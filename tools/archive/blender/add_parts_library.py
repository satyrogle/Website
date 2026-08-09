"""
Dark Lattice — add a parts library to the workbench, and unlock it.

Opens the HAND-ARRANGED workbench and adds a bin of spare shards beside
it, pre-scaled to the entity's own world scale so anything dragged in
lands the right size. Nothing already in the file is moved: the eight
outer shards keep the exact transforms they were saved with.

The bin is laid out as a grid well outside the hero frustum, sorted
largest first, one object per cell. A heap at the origin would be
unpickable and would interpenetrate the entity; a grid off to the side
is a parts bin you can actually see and choose from.

Everything is unlocked. The first workbench made the corridor, halo,
latent form and core unselectable so they could not be nudged by
accident, which turned out to be the wrong trade — judging the shards
against the world is not much use if the world cannot answer back.

    blender --background --factory-startup \
        --python tools/blender/add_parts_library.py -- --root . \
        --parts public/models/cand-aurora-parts-b.glb
"""

import argparse
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=os.getcwd())
    p.add_argument("--blend", default="assets/blender/DL_Entity_Workbench.blend")
    p.add_argument("--parts", default="public/models/cand-aurora-parts-b.glb")
    # Where the bin sits, in world X. The hero frustum reaches about
    # +-7.3 at the crown plane, so this is clear of frame with margin.
    p.add_argument("--bin-x", type=float, default=-15.0)
    p.add_argument("--bin-cols", type=int, default=7)
    p.add_argument("--bin-pitch", type=float, default=2.6)
    return p.parse_args(argv)


ARGS = parse_args()
ROOT = Path(ARGS.root).resolve()
BLEND = ROOT / ARGS.blend
PARTS = ROOT / ARGS.parts

LIBRARY = "01B_PARTS_LIBRARY"
# The crown's own height, which the library is scaled against so a part
# dragged out of the bin is already the right size next to the entity.
CROWN_HEIGHT = 5.13


def log(msg):
    print(f"[library] {msg}")


def world_bounds(objects):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return lo, hi


def main():
    for path in (BLEND, PARTS):
        if not path.exists():
            raise SystemExit(f"Missing: {path}")

    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    existing = {o.name for o in bpy.data.objects}
    log(f"opened {BLEND.name}: {len(existing)} objects")

    # A previous run's library, if any — replaced rather than stacked.
    old = bpy.data.collections.get(LIBRARY)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
        log("removed previous parts library")
        existing = {o.name for o in bpy.data.objects}

    # ---- Import the bin ------------------------------------------------
    bpy.ops.import_scene.gltf(filepath=str(PARTS))
    parts = [o for o in bpy.data.objects
             if o.name not in existing and o.type == "MESH"]
    if not parts:
        raise SystemExit(f"No meshes imported from {PARTS}")
    faces = sum(len(o.data.polygons) for o in parts)
    log(f"imported {len(parts)} parts, {faces} faces (full resolution)")

    # Flatten: no importer parents, pivots on the parts themselves.
    bpy.ops.object.select_all(action="DESELECT")
    parented = [o for o in parts if o.parent is not None]
    for obj in parented:
        obj.select_set(True)
    if parented:
        bpy.context.view_layer.objects.active = parented[0]
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for obj in parts:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

    # ---- Scale the GROUP to the entity's world scale -------------------
    # As a group, so the parts stay in proportion to each other and to
    # the eight already placed. Meshy exports at roughly a fortieth of
    # this scene.
    lo, hi = world_bounds(parts)
    scale = CROWN_HEIGHT / max((hi - lo).z, 1e-6)
    centre = (lo + hi) / 2.0
    xform = (
        Matrix.Diagonal((scale, scale, scale, 1.0))
        @ Matrix.Translation(-centre)
    )
    for obj in parts:
        obj.matrix_world = xform @ obj.matrix_world
    bpy.context.view_layer.update()
    log(f"group scaled x{scale:.3f} to the entity's world scale")

    # Bake it in, so every part reads 1.0 and a manual scale is a scale
    # rather than a multiplier on a hidden number.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for obj in parts:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

    # ---- Lay the bin out -----------------------------------------------
    def longest(o):
        b_lo, b_hi = world_bounds([o])
        return max(b_hi - b_lo)

    parts.sort(key=lambda o: -longest(o))
    cols = max(ARGS.bin_cols, 1)
    pitch = ARGS.bin_pitch
    for index, obj in enumerate(parts):
        row, col = divmod(index, cols)
        b_lo, b_hi = world_bounds([obj])
        c = (b_lo + b_hi) / 2.0
        target = Vector((
            ARGS.bin_x - col * pitch,
            0.0,
            (len(parts) // cols) * pitch * 0.5 - row * pitch,
        ))
        obj.matrix_world = Matrix.Translation(target - c) @ obj.matrix_world
        obj.name = f"PART_{index + 1:02d}"
    bpy.context.view_layer.update()
    lo2, hi2 = world_bounds(parts)
    log(f"bin laid out {cols} across at x {ARGS.bin_x}: "
        f"x {lo2.x:.1f}..{hi2.x:.1f}  z {lo2.z:.1f}..{hi2.z:.1f}")

    # ---- Collection ----------------------------------------------------
    col_lib = bpy.data.collections.new(LIBRARY)
    col_lib.color_tag = "COLOR_03"
    bpy.context.scene.collection.children.link(col_lib)
    for obj in parts:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        col_lib.objects.link(obj)

    # ---- Unlock everything ---------------------------------------------
    unlocked = 0
    for obj in bpy.data.objects:
        if obj.hide_select:
            unlocked += 1
        obj.hide_select = False
    for lc in bpy.context.view_layer.layer_collection.children:
        # The debris archive stays HIDDEN — it is put away, not locked —
        # but it is now selectable the moment its eye is switched back on.
        if lc.collection.name != "01_DEBRIS_ARCHIVE":
            lc.hide_viewport = False
    log(f"unlocked {unlocked} objects; every collection is now selectable")

    counts = {}
    for c in bpy.data.collections:
        counts[c.name] = len(c.objects)
    for name in sorted(counts):
        log(f"  {name}: {counts[name]}")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    log(f"saved {BLEND} ({BLEND.stat().st_size / (1024 * 1024):.1f} MB)")


main()
