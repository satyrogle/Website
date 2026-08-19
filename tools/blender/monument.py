# The monument's body, v2 after the "nope" of 2026-08-19.
#
# The shape signature, stated so it cannot be diluted again: ONE fused
# trunk that splits into TWO broad flat ribbon-blades, wrapping each
# other in a visible helix, tips crossing the axis and hooking PAST
# each other at the crown. Stocky, slab-coursed, obsidian. Qualities
# extracted from the named reference, never the asset copied.
#
# Form constants MIRROR src/world/monumentForm.ts exactly; change them
# together or the cells, the camera and the stone part company.
#
# Export:      blender --background --python tools/blender/monument.py
# Silhouette:  blender --background --python tools/blender/monument.py -- --silhouette
#   renders three judgment angles to captures/form/ with a plain grey
#   material, so the FORM is approved before any integration.
import bpy
import math
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "models", "monument.glb")
FORM_DIR = os.path.join(ROOT, "captures", "form")

# ---- form constants, mirrored in src/world/monumentForm.ts ----
H = 195.0
PHI = 4.0
PHI0 = 0.55
TWIST_POW = 1.05
PROFILE = [
    (4.8, 0.0),
    (3.0, 6.4),
    (0.8, 12.5),
    (-2.2, 11.2),
    (-4.0, 5.2),
    (-4.0, -5.2),
    (-2.2, -11.2),
    (0.8, -12.5),
    (3.0, -6.4),
]
TIP_T = (1.0, 0.958)


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def twist_at(t):
    return PHI0 + PHI * (max(t, 1e-6) ** TWIST_POW)


def radius_at(t):
    # fused at the base, bowed at the waist, crossing the axis at the
    # crown: the interlock
    return (
        3.4
        + 34.0 * t * (max(1.0 - t, 0.0) ** 1.15)
        - 5.5 * smoothstep(0.84, 1.0, t)
    )


def hook_at(t):
    # tangential lean at the crown so the crossing tips slide past
    # each other instead of colliding
    return 4.2 * smoothstep(0.84, 0.97, t)


def scale_at(t):
    return (1.15 - 0.86 * (max(t, 0.0) ** 1.3)) * (
        1.0 + 0.1 * math.sin(math.pi * min(1.0, 1.15 * t))
    )


def wobble_at(t, side):
    return (
        0.35 * math.sin(9.3 * t + 2.1 * side),
        0.35 * math.cos(7.7 * t + 1.3 * side),
    )


# resample the profile so corners stay exact: 7 points per edge
EDGE_DIV = 7
PROFILE_PTS = []
for i in range(len(PROFILE)):
    p = PROFILE[i]
    q = PROFILE[(i + 1) % len(PROFILE)]
    for k in range(EDGE_DIV):
        f = k / EDGE_DIV
        PROFILE_PTS.append((p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f))
NP = len(PROFILE_PTS)

bpy.ops.wm.read_factory_settings(use_empty=True)


def ring_centre(t, side):
    """World-XZ centre of a blade ring: (R, hook) rotated by the twist."""
    a = twist_at(t) + side * math.pi
    r = radius_at(t)
    hk = hook_at(t)
    ca, sa = math.cos(a), math.sin(a)
    wx, wz = wobble_at(t, side)
    # rotate local (r, hk) by a
    cx = r * ca - hk * sa + wx
    cz = r * sa + hk * ca + wz
    return cx, cz, ca, sa


def build_blade(side, name):
    t_top = TIP_T[side]
    NR = 260
    T0 = -0.02
    verts = []
    faces = []
    for i in range(NR):
        t = T0 + (t_top - T0) * (i / (NR - 1))
        cx, cz, ca, sa = ring_centre(t, side)
        s = scale_at(t)
        for (pa, pb) in PROFILE_PTS:
            xw = cx + (ca * pa - sa * pb) * s
            zw = cz + (sa * pa + ca * pb) * s
            verts.append((xw, -zw, t * H))  # world -> blender
    for i in range(NR - 1):
        b0 = i * NP
        b1 = (i + 1) * NP
        for j in range(NP):
            jn = (j + 1) % NP
            faces.append((b0 + j, b0 + jn, b1 + jn, b1 + j))
    # chamfered tip: one shrunken ring, then a cap vertex
    t = t_top
    cx, cz, ca, sa = ring_centre(t, side)
    s = scale_at(t) * 0.45
    tip_ring = len(verts)
    for (pa, pb) in PROFILE_PTS:
        xw = cx + (ca * pa - sa * pb) * s
        zw = cz + (sa * pa + ca * pb) * s
        verts.append((xw, -zw, t * H + 1.2))
    last = (NR - 1) * NP
    for j in range(NP):
        jn = (j + 1) % NP
        faces.append((last + j, last + jn, tip_ring + jn, tip_ring + j))
    tip = len(verts)
    verts.append((cx, -cz, t * H + 1.9))
    for j in range(NP):
        jn = (j + 1) % NP
        faces.append((tip_ring + j, tip_ring + jn, tip))
    # base cap, under the terrain
    cx, cz, _, _ = ring_centre(T0, side)
    base_c = len(verts)
    verts.append((cx, -cz, T0 * H - 0.5))
    for j in range(NP):
        jn = (j + 1) % NP
        faces.append((jn, j, base_c))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


blades = [build_blade(0, "BladeA"), build_blade(1, "BladeB")]

bpy.ops.object.select_all(action="DESELECT")
for o in blades:
    o.select_set(True)
bpy.context.view_layer.objects.active = blades[0]
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
d1.strength = 0.5
d1.direction = "NORMAL"
d1.vertex_group = "disp"

fine = bpy.data.textures.new("Tooth", type="CLOUDS")
fine.noise_scale = 2.8
d2 = mono.modifiers.new("Tooth", "DISPLACE")
d2.texture = fine
d2.strength = 0.22
d2.direction = "NORMAL"
d2.vertex_group = "disp"

bpy.context.view_layer.objects.active = mono
for m in list(mono.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)

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
me = terr.data
for v in me.vertices:
    r = math.hypot(v.co.x, v.co.y)
    if r < 260.0:
        f = max(0.0, min(1.0, (r - 60.0) / 200.0))
        f = f * f * (3 - 2 * f)
        v.co.z = v.co.z * f - 1.6 * (1.0 - f)
bpy.ops.object.shade_smooth()

if "--silhouette" in sys.argv:
    # judge the FORM before any integration: plain grey stone, one key
    # light echoing the site, three angles
    os.makedirs(FORM_DIR, exist_ok=True)
    matg = bpy.data.materials.new("Grey")
    matg.use_nodes = True
    bsdf = matg.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.16, 0.16, 0.17, 1)
    bsdf.inputs["Roughness"].default_value = 0.5
    mono.data.materials.append(matg)
    terr.data.materials.append(matg)

    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", type="SUN"))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(55), math.radians(-12), math.radians(160))
    bpy.context.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", type="SUN"))
    fill.data.energy = 0.7
    fill.rotation_euler = (math.radians(70), math.radians(15), math.radians(-30))
    bpy.context.collection.objects.link(fill)
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.01, 0.01, 0.012, 1)
    bpy.context.scene.world = world

    target = bpy.data.objects.new("Target", None)
    target.location = (0, 0, 95)
    bpy.context.collection.objects.link(target)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens = 60
    bpy.context.collection.objects.link(cam)
    tc = cam.constraints.new(type="TRACK_TO")
    tc.target = target
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 24
    sc.render.resolution_x = 640
    sc.render.resolution_y = 900
    try:
        sc.cycles.device = "GPU"
    except Exception:
        pass

    # site opening is world (0,14,300) -> blender (0,-300,14)
    for name, loc in [
        ("front", (0, -300, 14)),
        ("threequarter", (185, -235, 40)),
        ("crown", (0, -95, 175)),
    ]:
        cam.location = loc
        if name == "crown":
            target.location = (0, 0, 172)
        else:
            target.location = (0, 0, 95)
        sc.render.filepath = os.path.join(FORM_DIR, f"form-{name}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", sc.render.filepath)
else:
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(OUT), export_format="GLB", use_selection=False
    )
    print("EXPORTED", os.path.abspath(OUT))
