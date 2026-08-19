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
CAM_W = (0.0, 14.0, 300.0)
LOOK_W = (0.0, 96.0, 0.0)


def w2b(p):
    """world (x, y, z) -> blender (x, -z, y)"""
    return (p[0], -p[2], p[1])


CAM = w2b(CAM_W)
LOOK = w2b(LOOK_W)

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
    #   (x, z, height, width, depth, yaw, lean, backOpen)
    (-330.0, -560.0, 176.0, 78.0, 46.0, 0.30, 0.03, True),
    (395.0, -700.0, 226.0, 94.0, 55.0, -0.42, -0.02, True),
    (-640.0, -880.0, 150.0, 68.0, 41.0, 0.12, 0.04, False),
    (140.0, -1080.0, 288.0, 126.0, 68.0, 0.58, 0.0, True),
    (-250.0, -1360.0, 118.0, 60.0, 35.0, -0.20, 0.02, False),
    (820.0, -1560.0, 208.0, 112.0, 60.0, 0.34, 0.0, False),
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

built = []

for i, (wx, wz, h, w, d, yaw, lean, back_open) in enumerate(MASSES):
    bx, by, _ = w2b((wx, 0.0, wz))

    # --- the mass: a broad block, tapering slightly, with cut corners
    bpy.ops.mesh.primitive_cube_add(size=1, location=(bx, by, h * 0.5))
    m = bpy.context.active_object
    m.name = f"Choir{i}"
    m.scale = (w, d, h)
    m.rotation_euler = (0.0, lean, yaw)
    clean(m)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # taper: pull the top in, so it is a standing mass and not a box
    me = m.data
    for v in me.vertices:
        t = max(0.0, min(1.0, (v.co.z + h * 0.5) / h))
        v.co.x *= 1.0 - 0.42 * (t ** 1.2)
        v.co.y *= 1.0 - 0.34 * (t ** 1.2)
        v.co.x += w * 0.10 * (t ** 1.6) * (1.0 if i % 2 == 0 else -1.0)

    # a struck corner or two: machined, not eroded
    for c in range(2):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(
            bx + (w * 0.6) * (1 if c == 0 else -1),
            by + (d * 0.4) * (1 if c == 0 else -1),
            h * (0.82 if c == 0 else 0.16),
        ))
        ch = bpy.context.active_object
        ch.scale = (w * 0.6, d * 0.7, h * 0.30)
        ch.rotation_euler = (math.radians(24 + c * 18), math.radians(15), yaw + 0.4)
        cut(m, ch)

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
