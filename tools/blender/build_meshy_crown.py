"""
Dark Lattice — swap the authored crown for a Meshy candidate.

Takes the production scene, removes its procedurally-generated crown
slabs, and drops a Meshy-generated mass in their place — fitted to the
same bounds so the camera rail, the corridor and the Latent Form all
stay exactly where they were. Nothing downstream of the crown moves.

What it does to the candidate, and why:

  DECIMATE    Meshy returns ~1.5M triangles / 28 MB. That is a mesh for
              a render farm, not a website.
  STRIP RINGS Meshy includes its own halo. The site already has one,
              with the fog and cross-tube light profile that stopped it
              reading as a drawn ellipse. Rings are detected by
              flatness, not by name, since Meshy names nothing.
  BORE THROAT Meshy gives a deep spiral funnel that CLOSES at the back.
              The camera flies through here, so it is bored out along
              the facing axis. The funnel mouth is wider than the bore,
              so the spiral the candidate was chosen for survives.
  FLAT-ISH    Meshy ships positions only — no normals. Smooth-computed
              normals are why its plates look melted rather than cut.
  EXTRAS      The runtime resolves everything about a part from glTF
              extras, so each island gets the same contract the
              authored crown had.

Run headless:
    blender --background --factory-startup \
        --python tools/blender/build_meshy_crown.py -- \
        --root . --src public/models/meshy-crown-v01.glb --out <name>.glb
"""

import argparse
import json
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
    p.add_argument("--src", required=True)
    p.add_argument("--out", default="DL_CrownedConvergence_Meshy_v01.glb")
    p.add_argument("--decimate", type=float, default=0.10)
    # Islands flatter than this are Meshy's own halo rings.
    p.add_argument("--ring-flatness", type=float, default=0.06)
    # Bore radius, as a fraction of the candidate's half-width.
    p.add_argument("--bore", type=float, default=0.15)
    # Where along the depth the bore STARTS, as a fraction from the
    # front. Boring from the front face drills a clean tube straight
    # through the spiral the candidate was chosen for, and opens a
    # window onto the corridor rings behind — at the hero they read as
    # a machined grommet sitting in the entity's face. Starting the cut
    # behind the funnel leaves the spiral intact and leaves only a dark
    # aperture at its base, which is what the reference shows.
    p.add_argument("--bore-start", type=float, default=0.38)
    # Tunnel. One authored ring module, instanced down the corridor.
    p.add_argument("--tunnel-src", default="")
    p.add_argument("--tunnel-count", type=int, default=11)
    # Faces per ring AFTER decimation. Eleven instances share one mesh
    # datablock so the file cost is paid once, but the draw cost is paid
    # eleven times — a 90k ring would put ~1M triangles on screen every
    # frame for the corridor alone.
    p.add_argument("--tunnel-faces", type=int, default=14000)
    # The end entity. Same species as the Crowned, but its own mesh —
    # the reference sheet is explicit that it is not a scaled clone.
    p.add_argument("--latent-src", default="")
    p.add_argument("--latent-faces", type=int, default=60000)
    # Gyres: one broken annulus, instanced three times inside each shell.
    p.add_argument("--gyre-src", default="")
    p.add_argument("--gyre-faces", type=int, default=9000)
    return p.parse_args(argv)


ARGS = parse_args()
ROOT = Path(ARGS.root).resolve()
SRC = Path(ARGS.src).resolve()
TUNNEL_SRC = Path(ARGS.tunnel_src).resolve() if ARGS.tunnel_src else None
LATENT_SRC = Path(ARGS.latent_src).resolve() if ARGS.latent_src else None
GYRE_SRC = Path(ARGS.gyre_src).resolve() if ARGS.gyre_src else None
BLEND = ROOT / "assets" / "blender" / "DL_CrownedConvergence_Production_v01.blend"
GLB_OUT = ROOT / "public" / "models" / ARGS.out

# The entity faces Blender -Y. The export runs export_yup, which maps
# Blender (x, y, z) to glTF (x, z, -y), so Blender -Y becomes glTF +Z —
# the axis the camera looks down. The glTF importer applies the inverse
# to the candidate, so its throat lands on -Y too. No rotation needed;
# this is asserted below rather than assumed.
FACING = Vector((0.0, -1.0, 0.0))


def log(msg):
    print(f"[meshy] {msg}")


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


def island_dims(obj):
    lo, hi = world_bounds([obj])
    return Vector((hi.x - lo.x, hi.y - lo.y, hi.z - lo.z))


def decimate_to(obj, target_faces):
    """Collapse-decimates to roughly `target_faces`, or leaves it alone."""
    count = len(obj.data.polygons)
    if count <= target_faces:
        return count
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.ratio = max(target_faces / count, 0.001)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return len(obj.data.polygons)


def build_tunnel(existing_names):
    """
    Replaces the corridor with instances of one authored ring module.

    The handoff pack specifies COUNT 11, START_Z -2.4, SPACING 1.7. The
    count and the per-ring variation are the intent and are kept; the
    absolute Z figures are not, because they describe a 17-unit corridor
    and this scene's corridor is about seven. Using them literally would
    have pushed the last six rings straight through the threshold
    chamber and out past the Latent Form. The span is measured from the
    corridor that is actually here, which is also what keeps the camera
    rail, the chamber and the Latent Form untouched — exactly what the
    pack asks for everywhere else.

    Rings TAPER toward the far end. The tunnel reference sheet reads
    broad and open -> narrowing -> compressed -> near threshold, and a
    constant radius cannot say that. The taper is also what produces the
    receding cascade the sheet shows and the current corridor lacks.
    """
    old = [o for o in bpy.data.objects
           if o.type == "MESH" and o.get("dl_role", "") == "convergence_ring"]
    if not old:
        log("WARNING no convergence_ring objects to replace")
        return

    lo, hi = world_bounds(old)
    near_y, far_y = lo.y, hi.y
    # Leave the chamber its own space at the far end.
    chamber = [o for o in bpy.data.objects
               if o.get("dl_role", "") == "threshold_chamber"]
    if chamber:
        c_lo, _ = world_bounds(chamber)
        far_y = min(far_y, c_lo.y - 0.4)
    log(f"corridor span measured: y {near_y:.2f} -> {far_y:.2f} "
        f"(replacing {len(old)} authored rings)")

    near_r = max(hi.x - lo.x, hi.z - lo.z) * 0.5

    for obj in old:
        bpy.data.objects.remove(obj, do_unlink=True)

    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=str(TUNNEL_SRC))
    imported = [o for o in bpy.data.objects
                if o.name not in before and o.type == "MESH"]
    if not imported:
        raise SystemExit(f"No mesh imported from {TUNNEL_SRC}")

    template = max(imported, key=lambda o: len(o.data.polygons))
    for obj in imported:
        if obj is not template:
            bpy.data.objects.remove(obj, do_unlink=True)

    faces = decimate_to(template, ARGS.tunnel_faces)
    bpy.ops.object.select_all(action="DESELECT")
    template.select_set(True)
    bpy.context.view_layer.objects.active = template
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(24.0))
    except (AttributeError, RuntimeError):
        bpy.ops.object.shade_flat()
    # Pivot at the aperture centre, so scaling a ring keeps its opening
    # concentric with the travel axis instead of drifting off it.
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

    dims = template.dimensions
    radial = max(dims.x, dims.z) or 1.0
    log(f"tunnel module: {faces} faces, dims "
        f"{tuple(round(v, 2) for v in dims)}")

    count = max(ARGS.tunnel_count, 2)
    mesh_data = template.data
    span = far_y - near_y

    for i in range(count):
        t = i / (count - 1)
        ring = bpy.data.objects.new(f"DL_TunnelRing_{i:02d}", mesh_data)
        bpy.context.collection.objects.link(ring)

        # Taper: broad and open at the mouth, compressed at the throat.
        scale = (near_r * 2.0 / radial) * (1.0 - 0.46 * t)
        # Per-ring variation, from the pack's recipe. Deterministic, and
        # never synchronised — a repeated identical ring reads as a
        # mechanical tube, which is the one thing the module must not be.
        ring.location = (
            math.sin(i * 1.91) * 0.08,
            near_y + span * t,
            math.cos(i * 1.37) * 0.06,
        )
        # The aperture axis is Blender Y; spin is about it.
        ring.rotation_euler = (0.0, i * 0.17 + math.sin(i * 2.13) * 0.11, 0.0)
        ring.scale = (
            scale * (1.0 + math.sin(i * 1.71) * 0.035),
            scale,
            scale * (1.0 + math.cos(i * 1.31) * 0.025),
        )

        ring["dl_role"] = "convergence_ring"
        ring["dl_material_class"] = "MAT_RING"
        ring["dl_visibility_stage"] = "tunnel"
        ring["dl_stage_from"] = 0.0
        ring["dl_stage_to"] = 0.94
        # The near rings answer the field hardest; the deep ones recede
        # so the core stays the brightest thing at the end of the shaft.
        ring["dl_reaction"] = round(0.75 - 0.35 * t, 3)
        ring["dl_projection"] = "cylindrical"
        ring["dl_open_translation"] = [0.0, 0.0, 0.0]
        ring["dl_open_rotation"] = [0.0, 0.0, 0.0]
        ring["dl_yield_spin_deg"] = 0.0

    bpy.data.objects.remove(template, do_unlink=True)
    log(f"tunnel: {count} instances sharing one mesh, "
        f"y {near_y:.2f} -> {far_y:.2f}, taper 1.00 -> 0.54")


def build_gyres():
    """
    The internal ring system — three broken annuli turning inside each
    shell, independently.

    The reference sheet has called for this since the first board
    ("RING SYSTEM / 3 NESTED RINGS") and it has never existed. It is the
    difference between a shell with a hole in it and a thing with
    working anatomy: the silhouette belongs to the shell, the sense of
    depth and of something operating belongs to these.

    Scales, speeds and directions are the handoff pack's — its
    GyreController is the one file in that pack whose numbers are
    correct as written, because it is the only one authored against a
    seconds clock.

    No hub, no spokes: those read as a gear, and a gear reads as
    machinery rather than as a body.
    """
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=str(GYRE_SRC))
    imported = [o for o in bpy.data.objects
                if o.name not in before and o.type == "MESH"]
    if not imported:
        raise SystemExit(f"No mesh imported from {GYRE_SRC}")

    template = max(imported, key=lambda o: len(o.data.polygons))
    for obj in imported:
        if obj is not template:
            bpy.data.objects.remove(obj, do_unlink=True)

    faces = decimate_to(template, ARGS.gyre_faces)
    bpy.ops.object.select_all(action="DESELECT")
    template.select_set(True)
    bpy.context.view_layer.objects.active = template
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(24.0))
    except (AttributeError, RuntimeError):
        bpy.ops.object.shade_flat()
    # Pivot exactly at the aperture centre — the pack is explicit, and a
    # gyre pivoted anywhere else wobbles instead of turning.
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

    dims = template.dimensions
    radial = max(dims.x, dims.z) or 1.0
    mesh_data = template.data

    # host role, stage window, activity scale, aperture width, depth bias
    HOSTS = [
        ("crown_slab", 0.0, 0.48, 1.0, 1.55, 0.30),
        ("latent_mass", 0.52, 1.0, 0.15, 1.15, 0.0),
    ]
    TIERS = [(1.00, "A"), (0.80, "B"), (0.62, "C")]

    made = 0
    for role, stage_from, stage_to, activity, width, bias in HOSTS:
        hosts = [o for o in bpy.data.objects if o.get("dl_role", "") == role]
        if not hosts:
            log(f"WARNING no {role} to host gyres")
            continue
        h_lo, h_hi = world_bounds(hosts)
        centre = (h_lo + h_hi) / 2.0
        # Seated just inside the cavity, on the travel axis. The viewer
        # is at -Y, so a positive bias sets them back behind the mouth.
        depth_y = centre.y + (h_hi.y - h_lo.y) * bias

        for tier, (rel, label) in enumerate(TIERS):
            g = bpy.data.objects.new(f"DL_Gyre_{role[:5]}_{label}", mesh_data)
            bpy.context.collection.objects.link(g)
            scale = (width * rel) / radial
            g.location = (centre.x, depth_y + tier * 0.12, centre.z)
            g.scale = (scale, scale, scale)
            g["dl_role"] = "gyre"
            g["dl_material_class"] = "MAT_RING"
            g["dl_visibility_stage"] = "gyre"
            g["dl_stage_from"] = stage_from
            g["dl_stage_to"] = stage_to
            g["dl_reaction"] = round(0.85 - tier * 0.12, 3)
            g["dl_projection"] = "cylindrical"
            g["dl_open_translation"] = [0.0, 0.0, 0.0]
            g["dl_open_rotation"] = [0.0, 0.0, 0.0]
            g["dl_yield_spin_deg"] = 0.0
            g["dl_gyre_tier"] = tier
            g["dl_gyre_activity"] = activity
            made += 1

    bpy.data.objects.remove(template, do_unlink=True)
    log(f"gyres: {made} instances, {faces} faces each, sharing one mesh")


def build_latent():
    """
    Replaces the three flat Latent slabs with the authored end entity.

    The slabs read as three dark panels standing in a chamber; the sheet
    calls for a compressed vertical ovoid whose shell folds inward around
    a controlled cavity. It is fitted into the slabs' own bounds so the
    camera tail, the chamber and the arrival framing are untouched.

    Returns the fitted bounds so the core can be placed INSIDE the
    cavity rather than floating in front of it.
    """
    old = [o for o in bpy.data.objects
           if o.type == "MESH" and o.get("dl_role", "") == "latent_mass"]
    if not old:
        log("WARNING no latent_mass objects to replace")
        return None

    lo, hi = world_bounds(old)
    target_centre = (lo + hi) / 2.0
    target_size = hi - lo
    log(f"latent slabs: {len(old)}, size "
        f"{tuple(round(v, 2) for v in target_size)}")
    for obj in old:
        bpy.data.objects.remove(obj, do_unlink=True)

    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=str(LATENT_SRC))
    imported = [o for o in bpy.data.objects
                if o.name not in before and o.type == "MESH"]
    if not imported:
        raise SystemExit(f"No mesh imported from {LATENT_SRC}")

    shell = max(imported, key=lambda o: len(o.data.polygons))
    for obj in imported:
        if obj is not shell:
            bpy.data.objects.remove(obj, do_unlink=True)

    faces = decimate_to(shell, ARGS.latent_faces)
    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(22.0))
    except (AttributeError, RuntimeError):
        bpy.ops.object.shade_flat()
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

    # Uniform fit on height, so the sheet's proportions survive.
    s_lo, s_hi = world_bounds([shell])
    size = s_hi - s_lo
    scale = target_size.z / max(size.z, 1e-6)
    shell.scale = (scale, scale, scale)
    shell.location = target_centre
    bpy.context.view_layer.update()

    shell.name = "DL_LatentShell"
    shell["dl_role"] = "latent_mass"
    shell["dl_material_class"] = "MAT_LATENT"
    shell["dl_visibility_stage"] = "revelation"
    shell["dl_stage_from"] = 0.52
    shell["dl_stage_to"] = 1.0
    shell["dl_reaction"] = 0.55
    shell["dl_projection"] = "planar"
    shell["dl_open_translation"] = [0.0, 0.0, 0.0]
    shell["dl_open_rotation"] = [0.0, 0.0, 0.0]
    shell["dl_yield_spin_deg"] = 0.0

    lo2, hi2 = world_bounds([shell])
    log(f"latent shell: {faces} faces, fitted scale {scale:.3f}, "
        f"y {lo2.y:.2f} -> {hi2.y:.2f}")
    return lo2, hi2


def main():
    if not BLEND.exists():
        raise SystemExit(f"Production blend missing: {BLEND}")

    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    log(f"opened {BLEND.name}")

    # ---- Record what the authored crown occupied, then remove it -----
    old_crown = [
        o for o in bpy.data.objects
        if o.type == "MESH" and o.get("dl_role", "") == "crown_slab"
    ]
    if not old_crown:
        raise SystemExit("No crown_slab objects found — wrong source scene?")
    target_lo, target_hi = world_bounds(old_crown)
    target_centre = (target_lo + target_hi) / 2.0
    target_size = target_hi - target_lo
    log(f"authored crown: {len(old_crown)} slabs, "
        f"size {tuple(round(v, 2) for v in target_size)}, "
        f"centre {tuple(round(v, 2) for v in target_centre)}")

    for obj in old_crown:
        bpy.data.objects.remove(obj, do_unlink=True)
    log("removed authored crown")

    existing = {o.name for o in bpy.data.objects}

    # ---- Bring in the candidate --------------------------------------
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    imported = [o for o in bpy.data.objects
                if o.name not in existing and o.type == "MESH"]
    log(f"imported {len(imported)} object(s), "
        f"{sum(len(o.data.polygons) for o in imported)} faces")

    # ---- Decimate before splitting -----------------------------------
    for obj in imported:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new("dec", "DECIMATE")
        mod.ratio = ARGS.decimate
        bpy.ops.object.modifier_apply(modifier=mod.name)
    log(f"decimated to {sum(len(o.data.polygons) for o in imported)} faces")

    # ---- Split into islands ------------------------------------------
    bpy.ops.object.select_all(action="DESELECT")
    for obj in imported:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = [o for o in bpy.data.objects
             if o.name not in existing and o.type == "MESH"]
    log(f"split into {len(parts)} islands")

    # ---- Drop Meshy's own halo ---------------------------------------
    kept = []
    for obj in parts:
        d = island_dims(obj)
        flat = min(d) / (max(d) or 1.0)
        if flat < ARGS.ring_flatness:
            log(f"  dropping ring island {obj.name} "
                f"(flatness {flat:.3f}, dims {tuple(round(v, 2) for v in d)})")
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    log(f"kept {len(kept)} islands after ring strip")

    kept.sort(key=lambda o: -len(o.data.polygons))
    body = kept[0]

    # ---- Fit to the authored crown's footprint -----------------------
    lo, hi = world_bounds(kept)
    size = hi - lo
    centre = (lo + hi) / 2.0
    # Uniform, driven by height, so proportions survive the fit — the
    # depth ratio is the property that separates this candidate from the
    # ones that read as wreaths, and a non-uniform fit would destroy it.
    scale = target_size.z / max(size.z, 1e-6)
    log(f"fitting: candidate {tuple(round(v, 2) for v in size)} "
        f"-> scale {scale:.3f}")

    xform = (
        Matrix.Translation(target_centre)
        @ Matrix.Diagonal((scale, scale, scale, 1.0))
        @ Matrix.Translation(-centre)
    )
    for obj in kept:
        obj.matrix_world = xform @ obj.matrix_world

    # ---- Bore the throat ---------------------------------------------
    lo, hi = world_bounds(kept)
    size = hi - lo
    centre = (lo + hi) / 2.0
    radius = ARGS.bore * max(size.x, size.z) * 0.5
    # The viewer stands at -Y, so depth into the entity runs +Y. The cut
    # begins behind the funnel and runs out through the back.
    front = lo.y
    start = front + size.y * ARGS.bore_start
    back = hi.y + size.y * 0.35
    depth = back - start

    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius,
        depth=depth,
        vertices=48,
        location=(centre.x, start + depth * 0.5, centre.z),
    )
    cutter = bpy.context.active_object
    cutter.name = "DL_ThroatCutter"
    # Stand the cylinder along the facing axis (-Y): default is +Z.
    cutter.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    bpy.context.view_layer.update()

    bpy.context.view_layer.objects.active = body
    boolean = body.modifiers.new("throat", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.object = cutter
    boolean.solver = "EXACT"
    try:
        bpy.ops.object.modifier_apply(modifier=boolean.name)
        log(f"bored throat: radius {radius:.3f}, from {ARGS.bore_start:.0%} depth")
    except RuntimeError as exc:
        log(f"WARNING throat boolean failed ({exc}); mesh left closed")
    bpy.data.objects.remove(cutter, do_unlink=True)

    # Meshy output is not manifold, and an exact boolean against
    # non-manifold input leaves slivers and stray verts behind. Weld and
    # dissolve them rather than shipping spikes.
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0008)
    bpy.ops.mesh.dissolve_degenerate()
    bpy.ops.mesh.delete_loose()
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"cleaned body: {len(body.data.polygons)} faces")

    # ---- Shading -----------------------------------------------------
    # Meshy ships no normals. Auto-smooth at a tight angle keeps large
    # plates genuinely flat while not shattering the funnel's curve.
    # `use_auto_smooth` was removed in Blender 4.1; angle-based smoothing
    # is an operator now. Fall back to hard flat shading if even that is
    # unavailable — for cut stone, flat is the acceptable failure.
    for obj in kept:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(22.0))
        except (AttributeError, RuntimeError):
            bpy.ops.object.shade_flat()

    # ---- The runtime contract ----------------------------------------
    # Every part the loader sees resolves its behaviour from extras.
    # Bigger islands are the face of the being; the small detached
    # shards read as debris and answer the field more quietly.
    for index, obj in enumerate(kept):
        obj.name = f"DL_MeshyCrown_{index + 1:02d}"
        primary = obj is body or len(obj.data.polygons) > 2000
        obj["dl_role"] = "crown_slab"
        obj["dl_material_class"] = (
            "MAT_CROWN_PRIMARY" if primary else "MAT_CROWN_SECONDARY"
        )
        obj["dl_visibility_stage"] = "exterior"
        obj["dl_stage_from"] = 0.0
        obj["dl_stage_to"] = 0.34
        obj["dl_reaction"] = 1.0 if primary else 0.6
        obj["dl_projection"] = "planar"
        # The yield. The body is the mass everything else hangs off, so
        # it barely moves; the loose shards drift outward from centre.
        if obj is body:
            obj["dl_open_translation"] = [0.0, 0.0, 0.0]
            obj["dl_open_rotation"] = [0.0, 0.0, 0.0]
        else:
            c = sum((obj.matrix_world @ Vector(v) for v in obj.bound_box),
                    Vector()) / 8.0
            away = (c - centre)
            away.normalize()
            obj["dl_open_translation"] = [round(v, 4) for v in (away * 0.12)]
            obj["dl_open_rotation"] = [
                round(math.radians(4.0) * away.y, 4),
                round(math.radians(3.0) * away.z, 4),
                round(math.radians(5.0) * away.x, 4),
            ]
        obj["dl_yield_spin_deg"] = 0.0

    faces = sum(len(o.data.polygons) for o in kept)
    log(f"crown: {len(kept)} parts, {faces} faces")

    # ---- Drop authoring guides ---------------------------------------
    # DL_CameraPath and DL_CameraClearance are layout aids. They carry
    # no dl_role, and the loader's fallback for a role-less mesh is
    # "crown slab, always visible" — so they have been shipping as
    # renderable geometry, hidden inside the old crown mass. Boring the
    # throat exposed the path rod straight down the middle of the hero.
    # `strip_review_objects` in the production build only catches LIGHT,
    # CAMERA and DL_REFERENCE*, so meshes like these slipped through.
    # They are CURVE objects, not meshes — which is exactly why they
    # survived every earlier filter. The glTF exporter evaluates curves
    # to renderable geometry on export, so they arrive in the runtime as
    # meshes with no extras. EMPTYs are kept: they are the hierarchy the
    # loader walks, and they carry dl_exterior_bounds.
    RENDERABLE = {"MESH", "CURVE", "SURFACE", "META", "FONT"}
    guides = [
        o for o in bpy.data.objects
        if o.type in RENDERABLE and "dl_role" not in o
    ]
    for obj in guides:
        log(f"  dropping guide object {obj.name} (no dl_role)")
        bpy.data.objects.remove(obj, do_unlink=True)

    if TUNNEL_SRC:
        build_tunnel(existing)
    if LATENT_SRC:
        build_latent()
    if GYRE_SRC:
        build_gyres()

    # ---- The convergence light ---------------------------------------
    # There was no core object in the scene at all. MAT_CORE existed as
    # a material class and the reference sheet specifies it as "intense
    # cyan point light, volumetric scatter", but the only part carrying
    # that class was DL_LatentSeam — a 0.06 x 0.07 rod, staged to appear
    # only after 60% scroll. So the corridor converged on nothing and
    # the finale arrived at nothing.
    #
    # It is placed from the measured Latent Form rather than hardcoded,
    # and it is visible for the WHOLE journey: seen from the hero, down
    # through the throat, it is the pull the entity is named for.
    latent = [o for o in bpy.data.objects
              if o.get("dl_role", "") in {"latent_mass", "latent_seam"}]
    if latent:
        l_lo, l_hi = world_bounds(latent)
        l_centre = (l_lo + l_hi) / 2.0
        # INSIDE the cavity, not floating in front of it. The sheet
        # shows the core deep in the shell's opening, framed by it —
        # placed ahead of the form it reads as a bead stuck on the
        # front, and it also plugs the end of the shaft when seen from
        # down the corridor. The viewer arrives from -Y, so deeper is +Y.
        core_y = l_lo.y + (l_hi.y - l_lo.y) * 0.42
        # Deliberately much larger than the light it carries. The shader
        # concentrates the heat in the middle and fades to nothing well
        # before the silhouette, so the outer shell is transparent glow
        # volume — which is where the spokes live. A sphere sized to the
        # visible light leaves the rays nowhere to go.
        bpy.ops.mesh.primitive_ico_sphere_add(
            radius=0.55, subdivisions=4, location=(0.0, core_y, l_centre.z)
        )
        core = bpy.context.active_object
        core.name = "DL_Core"
        bpy.ops.object.shade_smooth()
        core["dl_role"] = "core"
        core["dl_material_class"] = "MAT_CORE"
        core["dl_visibility_stage"] = "convergence"
        core["dl_stage_from"] = 0.0
        core["dl_stage_to"] = 1.0
        core["dl_reaction"] = 1.0
        core["dl_projection"] = "none"
        core["dl_open_translation"] = [0.0, 0.0, 0.0]
        core["dl_open_rotation"] = [0.0, 0.0, 0.0]
        core["dl_yield_spin_deg"] = 0.0
        log(f"added DL_Core at y={core_y:.2f}, visible for the whole journey")
    else:
        log("WARNING no latent form found — core light not placed")

    # ---- Refresh the bounds the whole runtime samples against --------
    crown_lo, crown_hi = world_bounds(kept)
    for obj in bpy.data.objects:
        if "dl_exterior_bounds" in obj:
            obj["dl_exterior_bounds"] = json.dumps({
                "min": [round(v, 4) for v in crown_lo],
                "max": [round(v, 4) for v in crown_hi],
            })

    # ---- Export ------------------------------------------------------
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
    size_mb = GLB_OUT.stat().st_size / (1024 * 1024)
    log(f"wrote {GLB_OUT.name} ({size_mb:.1f} MB)")


main()
