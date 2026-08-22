# THE CHOIR: six authored witness masses standing behind the Split
# Spire. Environmental evidence, never a second mechanic.
#
# Built to the brief of 2026-08-19:
#   - real volumetric geometry, no billboards, no transparency
#   - composed placement, not a ring and not a rhythm
#   - fronts finished, BACKS exposing structure: ribs, cavities,
#     unfinished cuts. Same object, different evidence
#   - one physical alignment cut per mass, all lying in a single plane
#     that passes through the alignment camera, so from that one view
#     the cuts coincide into a single line and from anywhere else they
#     scatter. No floating lines, no glow: perspective does the work
#   - they never move, ever
#
#   blender --background --python tools/blender/choir.py
#
# Exports public/models/choir.glb. Blender is Z-up, glTF is Y-up:
# world (x, y, z) maps to blender (x, -z, y).
import bpy
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_GLB = os.path.join(ROOT, "public", "models", "choir.glb")

# THE ALIGNMENT VIEW. The opening camera, which is also exactly where
# the return comes back to. That matters twice over: the runtime's
# alignAmt peaks when the eye is square to the fissure, which is this
# view and not the wide dwell, so the physical cuts and the lighting
# response are now the same event. And the visitor meets the alignment
# twice, once at the start understanding nothing, once at the end
# understanding what they are looking at.
# STALE POSE FIXED, 2026-08-22. This carried (0, 95, 620) - the
# processional stand the runtime abandoned on 2026-08-21 - so the
# shipped choir.glb's cuts coincide from a pose no camera key visits.
# Updated to the gate-6 opening. THE GLB HAS NOT BEEN RE-EXPORTED:
# run this script in Blender and re-export before the alignment
# reveal is judged again.
CAM_W = (0.0, 10.0, 262.0)
LOOK_W = (0.0, 86.0, 0.0)


def w2b(p):
    """world (x, y, z) -> blender (x, -z, y)"""
    return (p[0], -p[2], p[1])


CAM = w2b(CAM_W)
LOOK = w2b(LOOK_W)

# HOW FAR EACH MASS IS BURIED. Every base was cut flat at exactly zero
# and the plain is not flat: its dunes run between -4.9 and +6.0 out
# where these stand, so a mass either sank or hung over a gap, and the
# gap is what Jacob saw. monument.py already answers this for the Spire
# ("the loft starts BELOW the ground and keeps a constant section down
# there, so each foot enters the terrain as straight stone") and the
# same law applies here. The taper is measured from ground level, so
# everything below it stays full section: buried stone, not a cap.
UNDER = 40.0

# THE MASSES. Authored, not generated: near pair, a gap, a mid, a far
# single, and one so distant it could be mistaken for terrain.
#   (x, z, height, width, depth, yaw, lean, backOpen)
# x and z are WORLD; z is negative, which is behind the monument.
MASSES = [
    # Distances chosen against the FOG, which is what actually decides
    # whether a mass registers. At 0.0022 density anything past about
    # 800 units is fully hazed, so the thousand-plus placements were
    # invisible rather than distant. These sit inside the readable
    # band, with the far pair deliberately at the edge of it: one is
    # meant to be barely there, one mistakeable for terrain.
    #
    # These reach well past the authored plain, which is a 1400 unit
    # plane and therefore stops at 700. The plain is carried out to the
    # fog at runtime by buildShore in JourneyRenderer; before that
    # existed, four of these six stood in open sky.
    #   (x, z, height, width, depth, yaw, lean, backOpen)
    (-330.0, -560.0, 176.0, 78.0, 46.0, 0.30, 0.03, True),
    (395.0, -700.0, 226.0, 94.0, 55.0, -0.42, -0.02, True),
    (-640.0, -880.0, 150.0, 68.0, 41.0, 0.12, 0.04, False),
    # index 3. REMOVED on Jacob's instruction, 2026-08-19: "there is no
    # point for the spire behind the entity as the hero covers it".
    # Measured from the landing camera it is 74 percent occluded by the
    # Spire and it is the only one of the six with ANY occlusion - the
    # tallest and widest mass, spending its whole size behind the hero.
    # Kept in the list rather than deleted so the indices below do not
    # shift: index parity drives the taper's lean direction, and
    # renumbering would silently alter masses 4 and 5.
    (140.0, -1080.0, 288.0, 126.0, 68.0, 0.58, 0.0, True),
    (-250.0, -1360.0, 118.0, 60.0, 35.0, -0.20, 0.02, False),
    (820.0, -1560.0, 208.0, 112.0, 60.0, 0.34, 0.0, False),
    # index 6. ADDED on Jacob's instruction, 2026-08-19: he drew over the
    # landing frame and marked the area right of the Spire as "having
    # nothing and it looks odd". He was right, and measurably so - the
    # Spire's right edge lands at px 954 and the nearest mass beyond it
    # at px 1234, so 280 pixels of the frame held nothing at all.
    #
    # Solved against his eye, and I read him backwards twice first.
    # "Little bit to the left" meant MOVE IT LEFT. I took it as "it is
    # sitting too far left" and went right, twice, which is how it came
    # back to where it started. Recorded because the phrasing will recur.
    #
    # x=510 centres it at px 1080. The empty gap runs from the Spire's
    # right edge at px 954 to the nearer mass at px 1234, so the hole's
    # own centre is 1094 - this sits essentially in the middle of what
    # it was added to fill, with 90px of air to the Spire and 118px to
    # the nearer mass. Both gaps matter: a mass needs air on the side it
    # is read against, not only on the side that was empty.
    #
    # Radius 2064, which matters: the shore only holds its fogColour out
    # to 2400 before it starts fading into the sky, and a mass beyond
    # that becomes a black silhouette on a bright strip - it hovers.
    # 2400 is the ceiling for anything standing on this plain.
    #
    # No back cavities: at this distance it is a fogColour silhouette
    # and structure on it would be geometry nobody can ever see.
    (510.0, -2000.0, 300.0, 132.0, 72.0, -0.26, 0.02, False),
]


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    m = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1.0
    return (a[0] / m, a[1] / m, a[2] / m)


def clean(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def cut(obj, cutter):
    m = obj.modifiers.new("Cut", "BOOLEAN")
    m.object = cutter
    m.operation = "DIFFERENCE"
    m.solver = "FAST"
    clean(obj)
    bpy.ops.object.modifier_apply(modifier=m.name)
    clean(cutter)
    bpy.ops.object.delete()


bpy.ops.wm.read_factory_settings(use_empty=True)

# --- the alignment plane -------------------------------------------
# A plane containing the camera projects to a LINE on that camera's
# screen, exactly. Cut every mass with the same plane and the grooves
# must coincide from there, with no per-mass fudging.
VIEW = norm(sub(LOOK, CAM))
UP = (0.0, 0.0, 1.0)
RIGHT = norm(cross(VIEW, UP))
TRUE_UP = norm(cross(RIGHT, VIEW))
# tilt sets the on-screen angle of the line: a shallow rising diagonal
TILT = math.radians(14.0)
PLANE_N = norm((
    RIGHT[0] * math.sin(TILT) + TRUE_UP[0] * math.cos(TILT),
    RIGHT[1] * math.sin(TILT) + TRUE_UP[1] * math.cos(TILT),
    RIGHT[2] * math.sin(TILT) + TRUE_UP[2] * math.cos(TILT),
))
PLANE_ROT = (
    math.atan2(math.sqrt(PLANE_N[0] ** 2 + PLANE_N[1] ** 2), PLANE_N[2]),
    0.0,
    math.atan2(PLANE_N[1], PLANE_N[0]) + math.pi / 2,
)

# Masses that are authored but not built. See the note on index 3.
SKIP = {3}

built = []

for i, (wx, wz, h, w, d, yaw, lean, back_open) in enumerate(MASSES):
    if i in SKIP:
        continue
    bx, by, _ = w2b((wx, 0.0, wz))

    # --- the mass: a broad block, tapering slightly, with cut corners.
    # It runs from UNDER below the plain up to h, so the visible height
    # is unchanged and the foot is in the ground rather than on it
    bpy.ops.mesh.primitive_cube_add(size=1, location=(bx, by, (h - UNDER) * 0.5))
    m = bpy.context.active_object
    m.name = f"Choir{i}"
    m.scale = (w, d, h + UNDER)
    m.rotation_euler = (0.0, lean, yaw)
    clean(m)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # --- THE ROLES ---------------------------------------------------
    # E0, 2026-08-22, Jacob's strike: "the choir read as generic dark
    # towers and repeated tapered blocks". They did, and this file is
    # why. Every mass was one cube, scaled, run through ONE taper
    # (1 - 0.42 t^1.2 across, 1 - 0.34 t^1.2 deep) with the lean flipped
    # by index parity, then given the SAME two struck corners. Six
    # objects, one silhouette, six scales. Approving a silhouette sheet
    # never guaranteed the geometry reproduced those silhouettes, and it
    # did not.
    #
    # Each mass now gets its own profile law and its own crown
    # treatment. The rule that has to hold in the frame: no two masses
    # may share a base profile, a taper, a crown angle, or a
    # height-to-width relationship that is another mass rescaled.
    #
    # Placements, heights, widths, the distance hierarchy, the fog
    # relationship and the alignment plane are all UNTOUCHED - Jacob
    # ruled that geometry is judged at the current placement first, and
    # only moved if the silhouette pass proves placement is what is left.
    #
    # THE OVERHANG IS PERMANENTLY DEAD. It is not in this table and it
    # does not come back; the RAKED BASTION carries that mass's job with
    # a steep raked face instead of a projecting head.
    #
    #   role      -> (taper_x, taper_y, exponent, shear, one_edge_true)
    ROLE = {
        0: "cleaver",
        1: "split",
        2: "bastion",
        4: "buttress",
        5: "wall",
        6: "witness",
    }[i]
    PROFILE = {
        # a blade: loses most of its width and almost none of its depth,
        # so it reads as an edge turned toward the frame
        "cleaver": (0.74, 0.12, 0.85, 0.06, True),
        # tall and nearly parallel-sided; the crown does the talking
        "split": (0.26, 0.20, 1.25, 0.00, False),
        # heavy, and leaning its whole mass one way: the rake replaces
        # the dead Overhang without projecting anything
        "bastion": (0.30, 0.46, 1.00, 0.30, False),
        # stout and battered: splays fast at the foot, then stands
        # nearly straight, and stays blunt on top
        "buttress": (0.54, 0.46, 0.62, 0.00, False),
        # broad and shallow: a wall, not a tower
        "wall": (0.13, 0.32, 1.55, 0.04, True),
        # simple, far, and eroded rather than machined
        "witness": (0.40, 0.34, 1.15, 0.10, False),
    }[ROLE]
    tx, ty, te, shear, one_edge = PROFILE

    # the profile. t is height above the PLAIN, not along the block, and
    # it clamps at zero: the buried length keeps its base section all
    # the way down, so each foot enters the terrain as straight stone.
    me = m.data
    for v in me.vertices:
        t = max(0.0, min(1.0, (v.co.z + (h - UNDER) * 0.5) / h))
        k = t ** te
        fx = 1.0 - tx * k
        v.co.x *= fx
        v.co.y *= 1.0 - ty * k
        if one_edge:
            # hold ONE side vertical and take the whole loss off the
            # other: an asymmetric profile, which no amount of symmetric
            # taper can produce
            v.co.x += (w * 0.5) * (1.0 - fx)
        v.co.x += w * shear * (t ** 1.4)

    # --- THE CROWN. One treatment per role, and none of them is the
    # pair of struck corners every mass used to share.
    if ROLE == "cleaver":
        # one long slice takes the top down to an edge
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx - math.cos(yaw) * w * 0.52,
            by - math.sin(yaw) * w * 0.52,
            h * 0.94,
        ))
        c = bpy.context.active_object
        c.scale = (w * 1.5, d * 2.0, h * 0.5)
        c.rotation_euler = (0.0, math.radians(34.0), yaw)
        cut(m, c)
    elif ROLE == "split":
        # the crown is broken open: a slot driven down into the head,
        # off the centre line so it is not a tuning fork
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx + math.cos(yaw) * w * 0.12,
            by + math.sin(yaw) * w * 0.12,
            h * 1.02,
        ))
        c = bpy.context.active_object
        c.scale = (w * 0.20, d * 1.6, h * 0.46)
        c.rotation_euler = (0.0, math.radians(5.0), yaw + 0.10)
        cut(m, c)
        # and one flank has gone with it
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx - math.cos(yaw) * w * 0.56,
            by - math.sin(yaw) * w * 0.56,
            h * 0.74,
        ))
        c2 = bpy.context.active_object
        c2.scale = (w * 0.34, d * 0.9, h * 0.30)
        c2.rotation_euler = (0.0, math.radians(12.0), yaw)
        cut(m, c2)
    elif ROLE == "bastion":
        # a single steep rake down the leading face, from the crown to
        # a third of the way down: weight, not overhang
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx + math.sin(yaw) * d * 0.72,
            by - math.cos(yaw) * d * 0.72,
            h * 0.86,
        ))
        c = bpy.context.active_object
        c.scale = (w * 1.6, d * 1.1, h * 0.9)
        c.rotation_euler = (math.radians(58.0), 0.0, yaw)
        cut(m, c)
    elif ROLE == "buttress":
        # blunt on purpose: one shallow chip off a top corner and
        # nothing else. Its silhouette is the batter, not the crown.
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx + math.cos(yaw) * w * 0.58,
            by + math.sin(yaw) * w * 0.58,
            h * 0.96,
        ))
        c = bpy.context.active_object
        c.scale = (w * 0.42, d * 1.3, h * 0.16)
        c.rotation_euler = (0.0, math.radians(19.0), yaw)
        cut(m, c)
    elif ROLE == "wall":
        # a vertical recess up the face, and a stepped shoulder at one
        # end: a wall reads by what is cut INTO it
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx + math.sin(yaw) * d * 0.62 - math.cos(yaw) * w * 0.18,
            by - math.cos(yaw) * d * 0.62 - math.sin(yaw) * w * 0.18,
            h * 0.46,
        ))
        c = bpy.context.active_object
        c.scale = (w * 0.26, d * 0.34, h * 1.05)
        c.rotation_euler = (0.0, 0.0, yaw)
        cut(m, c)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx + math.cos(yaw) * w * 0.60,
            by + math.sin(yaw) * w * 0.60,
            h * 0.88,
        ))
        c2 = bpy.context.active_object
        c2.scale = (w * 0.46, d * 1.4, h * 0.34)
        c2.rotation_euler = (0.0, 0.0, yaw)
        cut(m, c2)
    else:
        # the far witness: one broad corner gone, softly, so at this
        # distance it could be mistaken for terrain
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx - math.cos(yaw) * w * 0.62,
            by - math.sin(yaw) * w * 0.62,
            h * 0.90,
        ))
        c = bpy.context.active_object
        c.scale = (w * 0.9, d * 1.6, h * 0.42)
        c.rotation_euler = (0.0, math.radians(27.0), yaw - 0.22)
        cut(m, c)

    # --- THE BACK: structure, not finish. Deep cavities leave ribs
    if back_open:
        for r in range(3):
            f = (r - 1) * 0.42
            bpy.ops.mesh.primitive_cube_add(size=1, location=(
                bx + math.sin(yaw) * d * 0.55 + math.cos(yaw) * w * f,
                by - math.cos(yaw) * d * 0.55 + math.sin(yaw) * w * f,
                h * (0.30 + 0.22 * r),
            ))
            cav = bpy.context.active_object
            cav.scale = (w * 0.20, d * 0.62, h * 0.30)
            cav.rotation_euler = (0.0, 0.0, yaw)
            cut(m, cav)
        # one long unfinished cut across the back
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx + math.sin(yaw) * d * 0.62,
            by - math.cos(yaw) * d * 0.62,
            h * 0.66,
        ))
        slot = bpy.context.active_object
        slot.scale = (w * 1.2, d * 0.34, h * 0.07)
        slot.rotation_euler = (0.0, math.radians(7), yaw)
        cut(m, slot)

    # --- THE ALIGNMENT CUT: one groove, in the shared plane
    bpy.ops.mesh.primitive_cube_add(size=1, location=(bx, by, h * 0.52))
    groove = bpy.context.active_object
    groove.scale = (w * 3.0, d * 3.0, 2.6)
    groove.rotation_euler = PLANE_ROT
    # slide the groove along the plane normal so it passes through the
    # mass at the height the plane actually crosses it
    px = bx - CAM[0]
    py = by - CAM[1]
    pz = h * 0.52 - CAM[2]
    dist = px * PLANE_N[0] + py * PLANE_N[1] + pz * PLANE_N[2]
    groove.location = (
        bx - PLANE_N[0] * dist,
        by - PLANE_N[1] * dist,
        h * 0.52 - PLANE_N[2] * dist,
    )
    cut(m, groove)

    # --- surface: chisel into planes, keep them hard
    clean(m)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=3)
    bpy.ops.object.mode_set(mode="OBJECT")
    tex = bpy.data.textures.new(f"C{i}", type="CLOUDS")
    tex.noise_scale = 42.0
    tex.noise_depth = 0
    dm = m.modifiers.new("Chisel", "DISPLACE")
    dm.texture = tex
    dm.strength = 1.9
    dm.direction = "NORMAL"
    bpy.ops.object.modifier_apply(modifier=dm.name)
    dec = m.modifiers.new("Planar", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = 0.22
    bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_flat()
    built.append(m)

bpy.ops.object.select_all(action="DESELECT")
for o in built:
    o.select_set(True)
bpy.context.view_layer.objects.active = built[0]
bpy.ops.object.join()
group = bpy.context.active_object
group.name = "Choir"

os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
group.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", use_selection=True)
print("EXPORTED", OUT_GLB, len(group.data.vertices), "verts")
