# The monument's body: two tapering prongs from one base, twisting
# around each other, converging near the tip without touching. The form
# constants MIRROR src/world/monumentForm.ts exactly; change them
# together or the cells, the camera and the stone part company.
# Qualities extracted (never copied) per the record in
# docs/APPROVED_VISUAL_JOURNEY.md, 2026-08-19.
#
# Run headless:
#   "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" \
#     --background --python tools/blender/monument.py
#
# Exports public/models/monument.glb: the two-prong monolith plus the
# shore terrain. glTF is Y-up; we build in Blender Z-up with the mapping
# world (x, y, z) -> blender (x, -z, y).
import bpy
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "models", "monument.glb")

# ---- form constants, mirrored from src/world/monumentForm.ts ----
H = 195.0
PHI = 2.4
PHI0 = 0.55
TWIST_POW = 1.08
PROFILE = [
    (8.7, 0.0),
    (5.34, 6.26),
    (-2.55, 7.54),
    (-5.22, 3.02),
    (-5.22, -3.02),
    (-2.55, -7.54),
    (5.34, -6.26),
]
TIP_T = (1.0, 0.962)


def twist_at(t):
    return PHI0 + PHI * (max(t, 1e-6) ** TWIST_POW)


def radius_at(t):
    return 12.0 - 8.6 * (max(t, 0.0) ** 1.6) + 1.8 * math.sin(math.pi * t)


def scale_at(t):
    return (1.15 - 0.85 * (max(t, 0.0) ** 1.25)) * (
        1.0 + 0.12 * math.sin(math.pi * min(1.0, 1.15 * t))
    )


def wobble_at(t, side):
    return (
        0.35 * math.sin(9.3 * t + 2.1 * side),
        0.35 * math.cos(7.7 * t + 1.3 * side),
    )


# resample the profile so corners stay exact: 8 points per edge
EDGE_DIV = 8
PROFILE_PTS = []
for i in range(len(PROFILE)):
    p = PROFILE[i]
    q = PROFILE[(i + 1) % len(PROFILE)]
    for k in range(EDGE_DIV):
        f = k / EDGE_DIV
        PROFILE_PTS.append((p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f))
NP = len(PROFILE_PTS)

bpy.ops.wm.read_factory_settings(use_empty=True)


def build_prong(side, name):
    """Loft one prong bottom to tip; returns the object."""
    t_top = TIP_T[side]
    NR = 240
    T0 = -0.02  # planted below the shore
    verts = []
    faces = []
    ring_ts = [T0 + (t_top - T0) * (i / (NR - 1)) for i in range(NR)]
    for t in ring_ts:
        a = twist_at(t) + side * math.pi
        r = radius_at(t)
        s = scale_at(t)
        wx, wz = wobble_at(t, side)
        cx = math.cos(a) * r + wx
        cz = math.sin(a) * r + wz
        rax, raz = math.cos(a), math.sin(a)
        tax, taz = -math.sin(a), math.cos(a)
        for (pa, pb) in PROFILE_PTS:
            xw = cx + (rax * pa + tax * pb) * s
            zw = cz + (raz * pa + taz * pb) * s
            yw = t * H
            verts.append((xw, -zw, yw))  # world -> blender
    for i in range(NR - 1):
        base0 = i * NP
        base1 = (i + 1) * NP
        for j in range(NP):
            jn = (j + 1) % NP
            faces.append((base0 + j, base0 + jn, base1 + jn, base1 + j))
    # chamfered tip: one shrunken ring, then a cap vertex
    t = t_top
    a = twist_at(t) + side * math.pi
    r = radius_at(t)
    s = scale_at(t) * 0.42
    wx, wz = wobble_at(t, side)
    cx = math.cos(a) * r + wx
    cz = math.sin(a) * r + wz
    rax, raz = math.cos(a), math.sin(a)
    tax, taz = -math.sin(a), math.cos(a)
    tip_ring = len(verts)
    for (pa, pb) in PROFILE_PTS:
        xw = cx + (rax * pa + tax * pb) * s
        zw = cz + (raz * pa + taz * pb) * s
        verts.append((xw, -zw, t * H + 1.1))
    last = (NR - 1) * NP
    for j in range(NP):
        jn = (j + 1) % NP
        faces.append((last + j, last + jn, tip_ring + jn, tip_ring + j))
    tip = len(verts)
    verts.append((cx, -cz, t * H + 1.7))
    for j in range(NP):
        jn = (j + 1) % NP
        faces.append((tip_ring + j, tip_ring + jn, tip))
    # base cap (under the terrain, unseen, keeps it watertight)
    base_c = len(verts)
    a0 = twist_at(T0) + side * math.pi
    wx0, wz0 = wobble_at(T0, side)
    verts.append((math.cos(a0) * radius_at(T0) + wx0, -(math.sin(a0) * radius_at(T0) + wz0), T0 * H - 0.5))
    for j in range(NP):
        jn = (j + 1) % NP
        faces.append((jn, j, base_c))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


prongs = [build_prong(0, "ProngA"), build_prong(1, "ProngB")]

# join into one monument object
bpy.ops.object.select_all(action="DESELECT")
for o in prongs:
    o.select_set(True)
bpy.context.view_layer.objects.active = prongs[0]
bpy.ops.object.join()
mono = bpy.context.active_object
mono.name = "Monument"

# recalculate normals outward: from_pydata makes no promises
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")

# displacement fades toward the tip so the taper survives it
vg = mono.vertex_groups.new(name="disp")
for v in mono.data.vertices:
    t = max(0.0, min(1.0, v.co.z / H))
    vg.add([v.index], max(0.0, min(1.0, 1.15 * (1.0 - t) + 0.25)), "REPLACE")

broad = bpy.data.textures.new("Mass", type="CLOUDS")
broad.noise_scale = 11.0
d1 = mono.modifiers.new("Mass", "DISPLACE")
d1.texture = broad
d1.strength = 0.9
d1.direction = "NORMAL"
d1.vertex_group = "disp"

fine = bpy.data.textures.new("Tooth", type="CLOUDS")
fine.noise_scale = 2.8
d2 = mono.modifiers.new("Tooth", "DISPLACE")
d2.texture = fine
d2.strength = 0.38
d2.direction = "NORMAL"
d2.vertex_group = "disp"

bpy.context.view_layer.objects.active = mono
for m in list(mono.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)

# keep the keel edges: smooth faces, hard corners
try:
    bpy.ops.object.shade_auto_smooth(angle=0.62)
except Exception:
    bpy.ops.object.shade_smooth()

# --- the ground: a dark shore with far dunes, flattened at the pool ---
bpy.ops.mesh.primitive_plane_add(size=1400)
terr = bpy.context.active_object
terr.name = "Terrain"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.subdivide(number_cuts=110)
bpy.ops.object.mode_set(mode="OBJECT")
dunes = bpy.data.textures.new("Dunes", type="CLOUDS")
dunes.noise_scale = 180.0
t1 = terr.modifiers.new("Dunes", "DISPLACE")
t1.texture = dunes
t1.strength = 26.0
grain = bpy.data.textures.new("Grain", type="CLOUDS")
grain.noise_scale = 30.0
t2 = terr.modifiers.new("Grain", "DISPLACE")
t2.texture = grain
t2.strength = 3.0
bpy.context.view_layer.objects.active = terr
for m in list(terr.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
# flatten the centre into the pool basin, keep far relief
me = terr.data
for v in me.vertices:
    r = math.hypot(v.co.x, v.co.y)
    if r < 260.0:
        f = max(0.0, min(1.0, (r - 60.0) / 200.0))
        f = f * f * (3 - 2 * f)
        v.co.z = v.co.z * f - 1.6 * (1.0 - f)
bpy.ops.object.shade_smooth()

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format="GLB", use_selection=False)
print("EXPORTED", os.path.abspath(OUT))
