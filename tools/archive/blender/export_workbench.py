"""
Dark Lattice — turn the saved workbench into the website asset.

Reads the hand-arranged .blend and writes the GLB the site loads. The
arrangement is treated as LOCKED: nothing here moves, rotates or rescales
a shard. The only things that happen are the ones the runtime needs and
the browser needs.

  CONTRACT   The shards came from a raw Meshy export, so they carry no
             glTF extras at all. The runtime hides any mesh without a
             dl_role — deliberately, since guessing one has cost this
             build twice — so each shard is given the same contract the
             authored crown slabs had.
  DECIMATE   525k faces for eight rocks is a mesh for a render farm.
             Applied per shard against a total budget, so a big plate
             keeps more detail than a small one.
  SHADE      Meshy ships positions only. Smooth-computed normals are why
             its plates look melted rather than cut; auto-smooth at 22
             degrees is what the rest of this pipeline uses.
  NAMES      Blender's .001 suffixes are stripped. Part names feed
             seedFromName in the runtime, which is what gives each mass
             its own fracture, so they need to be stable and clean.

Excluded: 01_DEBRIS_ARCHIVE, the camera, the hero target and the rail
guide. The guides carry no dl_role and would be dropped anyway; the
archive is excluded by collection because it is hidden work-in-progress,
not part of the design.

    blender --background --factory-startup \
        --python tools/blender/export_workbench.py -- --root . \
        --out DL_Aurora_v03.glb
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=os.getcwd())
    p.add_argument("--blend", default="assets/blender/DL_Entity_Workbench.blend")
    p.add_argument("--out", default="DL_Aurora_v03.glb")
    # Total face budget for the eight shards. The shipped entity ran
    # 233k triangles all in; eight raw Meshy rocks are 525k on their own.
    p.add_argument("--shard-faces", type=int, default=140000)
    # Fraction of the largest part below which a plate is demoted to
    # MAT_CROWN_SECONDARY. 0 keeps every part primary, which is right
    # for a hand-composed entity; raise it to bring debris back.
    p.add_argument("--secondary-below", type=float, default=0.0)
    p.add_argument("--smooth-angle", type=float, default=22.0)
    return p.parse_args(argv)


ARGS = parse_args()
ROOT = Path(ARGS.root).resolve()
BLEND = ROOT / ARGS.blend
GLB_OUT = ROOT / "public" / "models" / ARGS.out

# Where the crown lives, as the anchor used to separate the parts that
# were USED from the ones pushed aside.
CROWN_CENTRE = (-0.16, 0.58, 0.19)

# Guard rails on the automatic cut below. A cluster boundary outside this
# band means the scene is not shaped the way this expects, and guessing
# would be worse than stopping.
CUT_MIN, CUT_MAX = 2.0, 12.0

GUIDE_NAMES = {"GUIDE_CameraRail"}

# Collections whose contents never ship, whatever the camera can see.
#
# The header has claimed this exclusion since the file was written and the
# code never performed it — selection was purely "no dl_role, in frustum".
# The archive sits INSIDE the crown volume, so every chip in it was landing
# in the hero frustum and shipping as a crown slab: seven of the twenty-three
# parts in the first export of the reworked entity came from here, all of
# them decimated to the 1200-face floor. Filed as discarded, shipped as
# design.
EXCLUDED_COLLECTIONS = {"01_DEBRIS_ARCHIVE"}


def log(msg):
    print(f"[export] {msg}")


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
    if not BLEND.exists():
        raise SystemExit(f"Workbench missing: {BLEND}")

    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    log(f"opened {BLEND.name}")

    # ---- Work out what the crown IS -----------------------------------
    #
    # By nature, not by collection. Collections are a workbench
    # convenience and get reorganised while art-directing — this build
    # pulled 35 parts out of the library and 7 out of the debris archive
    # without re-filing any of them, so "the crown is 01_OUTER_8" was
    # wrong the moment the entity was redone.
    #
    # What actually separates them: the corridor, halo, latent form and
    # core all carry a dl_role from the shipped asset. Shards and library
    # parts came from raw Meshy exports and carry nothing. So a mesh with
    # no role, inside the working volume, is crown geometry — wherever it
    # happens to be filed.
    # What the HERO CAMERA can see is what was designed, because that is
    # what it was designed through.
    #
    # An earlier rule cut on distance from the crown centre, on the
    # theory that unused parts get moved away. It threw out the crest:
    # a small plate parked 4.5 units from the lens, which reads as a
    # large mass at the top of frame precisely BECAUSE it is close. By
    # distance from the crown it scored 9.32 and looked like rubbish;
    # through the camera it is the most prominent thing on the entity.
    #
    # Frustum membership has no such blind spot. Parts pushed sideways
    # to +17, left in the bin at -15, or dropped behind the camera all
    # fall out of it, and anything placed to be seen stays in — however
    # far from the crown it happens to sit.
    cam = bpy.data.objects.get("DL_HeroCam")
    if cam is None:
        raise SystemExit("No DL_HeroCam in the workbench — cannot judge framing")
    bpy.context.view_layer.update()
    view = cam.matrix_world.inverted()
    half_v = math.tan(cam.data.angle_y * 0.5)
    # Aspect from the render settings, which the workbench sets to the
    # site's own 1440x900.
    r = bpy.context.scene.render
    half_h = half_v * (r.resolution_x / max(r.resolution_y, 1))
    # Just enough slack that a part clipped by the frame edge is still
    # kept. 1.25 was far too generous: at the crown plane it widened the
    # frame from x +-7.3 to +-9.1 and swept up parts that had been
    # deliberately pushed out of shot.
    MARGIN = 1.05

    def visible(obj):
        for corner in obj.bound_box:
            v = view @ (obj.matrix_world @ Vector(corner))
            depth = -v.z          # Blender cameras look down local -Z
            if depth < 0.05 or depth > 60.0:
                continue
            if (abs(v.x) <= half_h * depth * MARGIN
                    and abs(v.y) <= half_v * depth * MARGIN):
                return True
        return False

    crown, shelved, dropped = [], [], []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.name in GUIDE_NAMES:
            continue
        if obj.get("dl_role", ""):
            continue
        if not visible(obj):
            shelved.append(obj)
            continue
        # An empty mesh cannot be crown, and it does not fail loudly.
        # glTF omits a mesh with no primitives, so the node ships hollow:
        # the export reports one more crown slab than the site can draw,
        # nothing warns, and the part is simply not there. It also drags
        # the baked dl_exterior_bounds out to wherever it was parked —
        # one such object sat 3.4 units clear of any real geometry.
        if not obj.data.polygons:
            log(f"  drop {obj.name}: no geometry")
            dropped.append(obj)
            continue
        if any(c.name in EXCLUDED_COLLECTIONS for c in obj.users_collection):
            log(f"  drop {obj.name}: filed under a discarded collection")
            dropped.append(obj)
            continue
        crown.append(obj)

    # ---- Stable shipped numbering --------------------------------------
    #
    # Numbered across everything the camera can SEE, including the parts
    # dropped just above, rather than across the parts that survive.
    #
    # The shipped name is not a label. seedFromName() hashes it into the
    # fracture seed and the hue offset, so a part's name IS its surface.
    # Numbering the survivors meant binning one object renamed every part
    # after it and re-rolled all of them: dropping a single empty mesh and
    # seven archived chips moved 25% of the pixels in frame and lifted the
    # entity's coverage 7.4%, on fifteen parts nobody had touched.
    #
    # Keyed by name and computed before anything is deleted, so a part
    # keeps its identity whatever else joins or leaves the export.
    numbering = {
        obj.name: i
        for i, obj in enumerate(sorted(crown + dropped, key=lambda o: o.name), start=1)
    }
    if not crown:
        raise SystemExit("No crown geometry visible to the hero camera")
    crown.sort(key=lambda o: o.name)
    log(f"crown: {len(crown)} meshes visible to DL_HeroCam; "
        f"{len(shelved)} out of frame")
    for obj in crown:
        d = -(view @ obj.matrix_world.translation).z
        log(f"  keep {obj.name:<14} {d:6.2f} from the lens")

    # ---- Strip what must not ship -------------------------------------
    doomed = list(shelved) + list(dropped)
    doomed += [o for o in bpy.data.objects if o.type == "CAMERA"]
    doomed += [o for o in bpy.data.objects if o.name in GUIDE_NAMES]
    doomed += [o for o in bpy.data.objects
               if o.type == "EMPTY" and not any(k.startswith("dl_") for k in o.keys())]
    doomed = list(dict.fromkeys(doomed))
    count = len(doomed)
    for obj in doomed:
        bpy.data.objects.remove(obj, do_unlink=True)
    log(f"removed {count} shelved / guide objects")

    shards = crown

    # Locks are a workbench convenience and mean nothing downstream, but
    # a hidden object is skipped by the exporter, so they have to go.
    for obj in bpy.data.objects:
        obj.hide_select = False
        obj.hide_viewport = False
        obj.hide_render = False
        try:
            obj.hide_set(False)
        except RuntimeError:
            pass
    for col in bpy.data.collections:
        col.hide_viewport = False
        col.hide_render = False
    for lc in bpy.context.view_layer.layer_collection.children:
        lc.hide_viewport = False
        lc.exclude = False

    # ---- Un-mirror anything with a negative scale ----------------------
    #
    # A negative scale is a reflection: it reverses every triangle's
    # winding, so the mesh renders inside out and front-face culling
    # makes it vanish. One plate in this build came through at
    # -0.8417 on all three axes — the crest, and it simply was not there
    # on the website.
    #
    # Fixed at bake time rather than compensated for at runtime.
    # transform_apply bakes the reflection into the vertices, and
    # flip_normals puts the winding back the right way round, so what
    # ships is an ordinary mesh with no special case attached to it.
    mirrored = [o for o in shards
                if o.scale.x * o.scale.y * o.scale.z < 0.0]
    for obj in mirrored:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        # No flip here. shade_auto_smooth below re-derives normals from
        # the winding, so flipping at this point gets undone and then
        # applied again — the plate came out inverted, lit from behind,
        # and read as a dark hole at the crest. Winding is repaired once,
        # after all the geometry work, by normals_make_consistent.
        log(f"  un-mirrored {obj.name} (was negatively scaled)")
    if mirrored:
        log(f"un-mirrored {len(mirrored)} plate(s)")

    # ---- Decimate to a web budget, with a floor ------------------------
    #
    # NOT a flat ratio. The parts pulled out of the library range from a
    # couple of thousand faces to a hundred thousand, and one ratio
    # across all of them destroys the small ones: at 0.121 a 3,000-face
    # plate collapses to 360 and comes out as torn slivers with holes in
    # it, which is exactly what the crown's top spires did.
    #
    # Every part instead keeps at least MIN_FACES, and the budget left
    # over is shared by ratio. Solved by bisection because the floor
    # makes it non-linear — parts already under the floor consume their
    # own size and take no share of the remainder.
    MIN_FACES = 1200
    counts = [len(o.data.polygons) for o in shards]
    total = sum(counts)

    def spend(k):
        return sum(max(min(MIN_FACES, n), n * k) for n in counts)

    lo_k, hi_k = 0.0, 1.0
    if spend(1.0) > ARGS.shard_faces:
        for _ in range(60):
            mid = (lo_k + hi_k) * 0.5
            if spend(mid) > ARGS.shard_faces:
                hi_k = mid
            else:
                lo_k = mid
    else:
        lo_k = 1.0
    k = lo_k
    log(f"shards: {total} faces -> budget {ARGS.shard_faces}; "
        f"share {k:.3f}, floor {MIN_FACES} faces per part")

    for obj in shards:
        before = len(obj.data.polygons)
        target = max(min(MIN_FACES, before), before * k)
        ratio = min(target / max(before, 1), 1.0)
        if ratio < 0.999:
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new("dec", "DECIMATE")
            mod.ratio = ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)
        # Auto-smooth AFTER decimation: collapsing edges on a
        # smooth-shaded mesh is what rounds the cut faces off.
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(ARGS.smooth_angle))
        except (AttributeError, RuntimeError):
            bpy.ops.object.shade_flat()
        log(f"  {obj.name:<14} {before:6d} -> {len(obj.data.polygons):6d} faces")

    # ---- Face every normal outward -------------------------------------
    #
    # Checked and repaired for ALL parts, not just the mirrored one.
    # Measured on the shipped asset, two plates carried normals pointing
    # inward — one from the mirror, one that simply arrived that way from
    # the generator — and an inward normal means the key light lands on
    # the back of the surface, so the plate renders as a dark hole
    # regardless of its material class.
    #
    # normals_make_consistent(inside=False) settles it from the topology
    # itself rather than from any assumption about how the part got here.
    for obj in shards:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    log(f"normals made consistent outward on {len(shards)} parts")

    # ---- The runtime contract ------------------------------------------
    lo, hi = world_bounds(shards)
    centre = (lo + hi) / 2.0
    biggest = max(max(world_bounds([o])[1] - world_bounds([o])[0]) for o in shards)

    for obj in sorted(shards, key=lambda o: o.name):
        index = numbering[obj.name]
        b_lo, b_hi = world_bounds([obj])
        size = max(b_hi - b_lo)
        # Every hand-placed part is PRIMARY by default.
        #
        # The old rule demoted anything under 45% of the largest part to
        # MAT_CROWN_SECONDARY, which made sense when the pipeline culled
        # a Meshy dump automatically and "secondary" meant debris. On a
        # composed entity it is simply wrong: 14 of 27 parts came out
        # secondary, and secondary never reaches uRaisedBlack, runs
        # patternGain 0.62 and reaction 0.6 — so over half the crown
        # rendered darker and flatter than the rest and read as corridor
        # rather than as entity.
        primary = size > biggest * ARGS.secondary_below
        obj.name = f"DL_Shard_{index:02d}"
        obj["dl_role"] = "crown_slab"
        obj["dl_material_class"] = (
            "MAT_CROWN_PRIMARY" if primary else "MAT_CROWN_SECONDARY"
        )
        obj["dl_visibility_stage"] = "exterior"
        obj["dl_stage_from"] = 0.0
        obj["dl_stage_to"] = 0.34
        obj["dl_reaction"] = 1.0 if primary else 0.6
        obj["dl_projection"] = "planar"
        # The yield: each shard drifts outward from the crown's centre,
        # inside the directive's 0.04-0.14 m clamp.
        away = (b_lo + b_hi) / 2.0 - centre
        if away.length > 1e-5:
            away.normalize()
        obj["dl_open_translation"] = [round(v, 4) for v in (away * 0.12)]
        obj["dl_open_rotation"] = [
            round(math.radians(4.0) * away.y, 4),
            round(math.radians(3.0) * away.z, 4),
            round(math.radians(5.0) * away.x, 4),
        ]
        obj["dl_yield_spin_deg"] = 0.0
        log(f"  {obj.name} {'primary' if primary else 'secondary'} "
            f"size {size:.2f}")

    # ---- Refresh the space the reaction field samples against ---------
    crown_lo, crown_hi = world_bounds(shards)
    for obj in bpy.data.objects:
        if "dl_exterior_bounds" in obj:
            obj["dl_exterior_bounds"] = json.dumps({
                "min": [round(v, 4) for v in crown_lo],
                "max": [round(v, 4) for v in crown_hi],
            })
    log(f"crown bounds {tuple(round(v, 2) for v in crown_lo)} .. "
        f"{tuple(round(v, 2) for v in crown_hi)}")

    roles = {}
    for obj in bpy.data.objects:
        r = obj.get("dl_role", "")
        if r:
            roles[r] = roles.get(r, 0) + 1
    log(f"roles shipping: {roles}")

    GLB_OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_OUT),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_normals=True,
        use_selection=False,
    )
    log(f"wrote {GLB_OUT.name} "
        f"({GLB_OUT.stat().st_size / (1024 * 1024):.2f} MB)")


main()
