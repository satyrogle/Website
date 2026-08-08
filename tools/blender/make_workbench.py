"""
Dark Lattice — the arrangement workbench.

A Blender file for hand art-directing the outer shards against the real
entity, through the real hero camera. It exists because parameterised
placement lost: no amount of --assemble-radius guessing replaces seeing
the thing while you move it.

WHAT IT DOES NOT DO, deliberately:

  no procedural arrangement   the shards keep the relative positions the
                              generator gave them
  no replacement geometry     no culling, welding, decimating or
                              re-meshing; the shards arrive full fat
  no material work            Workbench shading, for reading silhouette
                              and depth rather than surface

The ONE transform applied to the shard group is a single uniform scale
and offset that lands it in the crown's own envelope. Meshy exports at
its own arbitrary units — roughly a fortieth of this scene — so without
it the shards open as a speck beside a full-size corridor. It is applied
to the group as a whole, so every shard's position relative to every
other shard is untouched.

Everything that is not a shard is imported from the SHIPPED entity and
locked: visible for judgement, unselectable so it cannot be nudged.

    blender --background --factory-startup \
        --python tools/blender/make_workbench.py -- --root . \
        --shards public/models/cand-dark-portal-8.glb

Then open assets/blender/DL_Entity_Workbench.blend, look through
DL_HeroCam, arrange, and SAVE. Those transforms become the source of
truth for the website asset.
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
    # The shards to art-direct. Everything in this file lands in
    # 01_OUTER_8 and nothing else is selectable.
    p.add_argument("--shards", default="public/models/cand-dark-portal-8.glb")
    # The rest of the world, for judging the shards against something
    # real. Its own crown is discarded.
    p.add_argument("--world", default="public/models/DL_Aurora_v01.glb")
    p.add_argument("--out", default="assets/blender/DL_Entity_Workbench.blend")
    return p.parse_args(argv)


ARGS = parse_args()
ROOT = Path(ARGS.root).resolve()
SHARDS = ROOT / ARGS.shards
WORLD = ROOT / ARGS.world
OUT = ROOT / ARGS.out

# Where the crown sits, measured off the shipped entity's inner crown.
# The shard group is landed here so the hero camera frames it exactly as
# it frames the entity today.
CROWN_CENTRE = Vector((-0.16, 0.58, 0.19))
CROWN_HEIGHT = 5.13

LOCKED = {
    "02_TUNNEL": {"convergence_ring", "tunnel_shell", "threshold_chamber"},
    "03_HALO": {"halo"},
    "04_LATENT": {"latent_mass", "latent_seam"},
    "05_INNER_CORE": {"core", "gyre"},
}


def log(msg):
    print(f"[workbench] {msg}")


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


def flatten(objects):
    """Drop importer parents and seat each pivot on its own geometry."""
    bpy.ops.object.select_all(action="DESELECT")
    parented = [o for o in objects if o.parent is not None]
    for obj in parented:
        obj.select_set(True)
    if parented:
        bpy.context.view_layer.objects.active = parented[0]
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for obj in objects:
        if obj.type != "MESH":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        # BOUNDS, not median: a fractured shard's vertex density is
        # lopsided, so a median pivot sits off the visual centre and the
        # piece swings when you rotate it.
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")


def main():
    for path in (SHARDS, WORLD):
        if not path.exists():
            raise SystemExit(f"Missing: {path}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # ---- The world, minus its crown ----------------------------------
    bpy.ops.import_scene.gltf(filepath=str(WORLD))
    world_objs = list(bpy.data.objects)
    # Its 30 crown_slab parts are the arrangement being replaced.
    doomed = [o for o in world_objs
              if o.type == "MESH" and o.get("dl_role", "") == "crown_slab"]
    for obj in doomed:
        bpy.data.objects.remove(obj, do_unlink=True)
    world_objs = [o for o in bpy.data.objects]
    log(f"world: {WORLD.name}, dropped {len(doomed)} crown parts")

    flatten(world_objs)
    junk = [o for o in bpy.data.objects
            if o.type == "EMPTY" and not any(k.startswith("dl_") for k in o.keys())]
    for obj in junk:
        bpy.data.objects.remove(obj, do_unlink=True)
    world_objs = [o for o in bpy.data.objects]

    # ---- The shards ---------------------------------------------------
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=str(SHARDS))
    shards = [o for o in bpy.data.objects
              if o.name not in before and o.type == "MESH"]
    if not shards:
        raise SystemExit(f"No meshes imported from {SHARDS}")
    faces = sum(len(o.data.polygons) for o in shards)
    log(f"shards: {SHARDS.name}, {len(shards)} parts, {faces} faces "
        f"(kept at full resolution — nothing culled or decimated)")

    flatten(shards)

    # ONE uniform scale and offset for the whole group. Relative layout
    # is untouched; this is a unit conversion, not an arrangement.
    lo, hi = world_bounds(shards)
    size = hi - lo
    centre = (lo + hi) / 2.0
    scale = CROWN_HEIGHT / max(size.z, 1e-6)
    xform = (
        Matrix.Translation(CROWN_CENTRE)
        @ Matrix.Diagonal((scale, scale, scale, 1.0))
        @ Matrix.Translation(-centre)
    )
    for obj in shards:
        obj.matrix_world = xform @ obj.matrix_world
    bpy.context.view_layer.update()
    lo2, hi2 = world_bounds(shards)
    log(f"group landed: x{scale:.3f} -> {tuple(round(v, 2) for v in (hi2 - lo2))} "
        f"about {tuple(round(v, 2) for v in CROWN_CENTRE)}")

    # ---- Bake the group transform into the meshes ---------------------
    # Rotation and scale only, never location. Applying scale leaves each
    # shard reading 1.0 in the N-panel, so a manual scale is a scale and
    # not a multiplier on a hidden 42.75. Location is deliberately NOT
    # applied: that would drop every origin onto the world origin and
    # every shard would rotate about a point somewhere off in the void.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in shards:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = shards[0]
    # transform_apply refuses on multi-user meshes, and the importer can
    # share data between nodes.
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    # Re-seat the pivots: applying scale moves the origin's relationship
    # to the geometry, so this has to come after, not before.
    for obj in shards:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    dirty = [o.name for o in shards
             if any(abs(s - 1.0) > 1e-4 for s in o.scale)
             or any(abs(r) > 1e-4 for r in o.rotation_euler)]
    log(f"transforms baked: scale and rotation applied, "
        f"{len(dirty)} shards still non-identity {dirty if dirty else ''}")

    # Named so the outliner reads as a shot list, ordered biggest first —
    # the big plates are the ones that carry the silhouette, and the
    # split below depends on this order.
    def longest(obj):
        lo, hi = world_bounds([obj])
        return max(hi - lo)

    shards.sort(key=lambda o: -longest(o))
    for index, obj in enumerate(shards, start=1):
        obj.name = f"SHARD_{index:02d}"
        log(f"  SHARD_{index:02d}  longest {longest(obj):5.2f}  "
            f"faces {len(obj.data.polygons):6d}")

    # ---- Collections ---------------------------------------------------
    def make(name, color=None):
        col = bpy.data.collections.new(name)
        if color:
            col.color_tag = color
        scene.collection.children.link(col)
        return col

    cols = {
        "00_GUIDES": make("00_GUIDES", "COLOR_08"),
        "01_DEBRIS_ARCHIVE": make("01_DEBRIS_ARCHIVE", "COLOR_02"),
        "01_OUTER_8": make("01_OUTER_8", "COLOR_04"),
    }
    for name in LOCKED:
        cols[name] = make(name, "COLOR_01")
    cols["06_UNSORTED"] = make("06_UNSORTED")

    def place(obj, name):
        for col in list(obj.users_collection):
            col.objects.unlink(obj)
        cols[name].objects.link(obj)

    # The eight, and everything below them. Archived rather than deleted:
    # the small pieces may earn their way back in as debris once the
    # silhouette is settled, and regenerating them would mean going back
    # to Meshy for a file that no longer exists.
    outer, archive = shards[:8], shards[8:]
    for obj in outer:
        place(obj, "01_OUTER_8")
    for obj in archive:
        place(obj, "01_DEBRIS_ARCHIVE")
        obj.hide_select = True
        obj.hide_render = True
    log(f"01_OUTER_8: {[o.name for o in outer]}")
    log(f"01_DEBRIS_ARCHIVE: {[o.name for o in archive]} (hidden, locked)")

    counts = {}
    for obj in world_objs:
        role = obj.get("dl_role", "")
        target = "06_UNSORTED"
        for name, roles in LOCKED.items():
            if role in roles:
                target = name
                break
        if obj.type == "EMPTY":
            target = "00_GUIDES"
        place(obj, target)
        # LOCKED means visible but unselectable: you can judge the shards
        # against the corridor without ever nudging the corridor.
        if target not in ("00_GUIDES",):
            obj.hide_select = True
        counts[target] = counts.get(target, 0) + 1

    for name, n in sorted(counts.items()):
        log(f"  {name}: {n} (locked)")

    # Hide the archive at the COLLECTION level rather than per object, so
    # one click on the eye brings all seven back rather than seven.
    for lc in bpy.context.view_layer.layer_collection.children:
        if lc.collection.name == "01_DEBRIS_ARCHIVE":
            lc.hide_viewport = True

    # ---- Hero camera, matching CameraRig's first keyframe -------------
    #
    # DESKTOP_PATH[0]: position [0, 0, 13.2], target [0, -0.72, 0],
    # fov 38, aspect 1.6 — glTF axes. The export runs export_yup, mapping
    # Blender (x, y, z) -> glTF (x, z, -y), so inverting it puts the
    # camera at Blender (0, -13.2, 0) looking at (0, 0, -0.72).
    target = bpy.data.objects.new("DL_HeroTarget", None)
    target.empty_display_type = "PLAIN_AXES"
    target.empty_display_size = 0.4
    target.location = (0.0, 0.0, -0.72)
    cols["00_GUIDES"].objects.link(target)

    cam_data = bpy.data.cameras.new("DL_HeroCam")
    # The site's FOV is VERTICAL. Blender fits horizontally by default,
    # which would frame wider than the website ever shows.
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(38.0)
    cam_data.clip_start = 0.05
    cam_data.clip_end = 200.0
    cam = bpy.data.objects.new("DL_HeroCam", cam_data)
    cam.location = (0.0, -13.2, 0.0)
    cols["00_GUIDES"].objects.link(cam)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    log("DL_HeroCam at (0, -13.2, 0), 38 deg vertical, 1440x900")

    # ---- The rail ------------------------------------------------------
    # The camera flies down x = z = 0 from y -13.2 to +5.6 and reaches the
    # mouth at 26% scroll. A shard left in this tube gets flown through.
    # No dl_role, so the build script drops it on export — it cannot reach
    # the website even if left switched on.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=18.8, vertices=16)
    rail = bpy.context.active_object
    rail.name = "GUIDE_CameraRail"
    rail.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    rail.location = (0.0, -3.8, 0.0)
    rail.display_type = "WIRE"
    rail.hide_render = True
    rail.hide_select = True
    place(rail, "00_GUIDES")

    # ---- A viewport for judging FORM ----------------------------------
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "SINGLE"
    shading.single_color = (0.045, 0.05, 0.06)
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.curvature_ridge_factor = 1.0
    shading.curvature_valley_factor = 1.0
    scene.world = bpy.data.worlds.new("DL_Void")
    scene.world.use_nodes = False
    scene.world.color = (0.004, 0.008, 0.016)

    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue
            for space in area.spaces:
                if space.type != "VIEW_3D":
                    continue
                space.shading.type = "SOLID"
                space.shading.light = "STUDIO"
                space.shading.color_type = "SINGLE"
                space.shading.single_color = (0.045, 0.05, 0.06)
                space.shading.show_cavity = True
                space.shading.background_type = "VIEWPORT"
                space.shading.background_color = (0.004, 0.008, 0.016)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    log(f"wrote {OUT} ({OUT.stat().st_size / (1024 * 1024):.1f} MB)")


main()
