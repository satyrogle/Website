# The monument's body, v3: THE FORK (contact-sheet candidate A), built
# to the igloo bar through a sculpt-and-bake pipeline.
#
# Two meshes of the same form:
#   LOW  - the analytic loft, UV mapped. This surface is shared exactly
#          with src/world/monumentForm.ts: the cells sit on it and the
#          camera math trusts it. No displacement, ever.
#   HIGH - dense loft with course-step shelves built into the rings and
#          three layers of displacement. Never exported; its detail is
#          baked into tangent normal + AO maps on the low poly.
#
# Form constants MIRROR src/world/monumentForm.ts exactly; change them
# together or the cells, the camera and the stone part company.
#
# Run: blender --background --python tools/blender/monument.py
# Produces: public/models/monument.glb, monument-normal.png,
#           monument-ao.png
#
# Fast judge loop, no bake, no export:
#   blender --background --python tools/blender/monument.py -- --silhouette
# Renders the low poly grey at three angles into captures/form/. The
# form is judged there BEFORE it costs a bake or touches the site.
import bpy
import math
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_GLB = os.path.join(ROOT, "public", "models", "monument.glb")
OUT_NRM = os.path.join(ROOT, "public", "models", "monument-normal.png")
OUT_AO = os.path.join(ROOT, "public", "models", "monument-ao.png")

# ---- form constants: THE HORNS, mirrored in monumentForm.ts ----
# The pair must splay ACROSS the opening camera, so the twist stays
# small: rotate the pair toward the view axis and the splay
# foreshortens into a single notched slab, which is what it did.
H = 195.0
PHI = 0.45
PHI0 = -0.15
TWIST_POW = 1.0
PROFILE = [
    (11.0, 0.0),
    (8.0, 3.2),
    (2.0, 4.0),
    (-4.5, 3.4),
    (-8.8, 1.7),
    (-8.8, -1.7),
    (-4.5, -3.4),
    (2.0, -4.0),
    (8.0, -3.2),
]
TIP_T = (1.0, 0.76)
COURSE_H = 2.1


def fract(x):
    return x - math.floor(x)


def hash1(x):
    return fract(math.sin(x) * 43758.5453)


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def twist_at(t):
    return PHI0 + PHI * (max(t, 1e-6) ** TWIST_POW)


def radius_at(t):
    # the lyre: fused at the foot, sweeping wide through the waist,
    # then the tips draw back in and up. They approach without ever
    # crossing, because crossing read as a lambda
    return 3.4 + 26.0 * smoothstep(0.05, 0.74, t) - 5.0 * (smoothstep(0.80, 1.0, t) ** 1.3)


def hook_at(t, side=0):
    # a little out-of-plane lean for dimension. Large values hid the
    # whole arc behind foreshortening, which is what killed the last one.
    # Per-side factor: the two horns must never mirror, or the gap
    # between them reads as an eye
    return 2.2 * (smoothstep(0.55, 1.0, t) ** 1.4) * (1.0 if side == 0 else 0.5)


def scale_at(t):
    # thick at the base, drawn to a point: a horn's taper
    return 1.2 - 0.72 * (max(t, 0.0) ** 1.6)


def wobble_at(t, side):
    return (0.35 * math.sin(9.3 * t + 2.1 * side), 0.35 * math.cos(7.7 * t + 1.3 * side))


def ring_centre(t, side):
    a = twist_at(t) + side * math.pi
    r = radius_at(t)
    hk = hook_at(t, side)
    ca, sa = math.cos(a), math.sin(a)
    wx, wz = wobble_at(t, side)
    return r * ca - hk * sa + wx, r * sa + hk * ca + wz, ca, sa


def profile_points(edge_div):
    pts = []
    for i in range(len(PROFILE)):
        p = PROFILE[i]
        q = PROFILE[(i + 1) % len(PROFILE)]
        for k in range(edge_div):
            f = k / edge_div
            pts.append((p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f))
    return pts


def build_blade(side, name, nr, edge_div, course_steps):
    pts = profile_points(edge_div)
    np_ = len(pts)
    t_top = TIP_T[side]
    T0 = -0.02
    verts = []
    faces = []
    for i in range(nr):
        t = T0 + (t_top - T0) * (i / (nr - 1))
        cx, cz, ca, sa = ring_centre(t, side)
        s = scale_at(t)
        if course_steps:
            # stacked-slab shelves: whole courses step in and out, some
            # recess deeper. Baked into the normal map; the low poly
            # keeps the analytic surface
            course = math.floor((t * H) / COURSE_H)
            s *= 1.0 + hash1(course * 12.9898 + side * 311.7) * 0.05 - 0.018
            if hash1(course * 78.233 + side * 37.719) > 0.82:
                s *= 0.955
        for (pa, pb) in pts:
            verts.append((cx + (ca * pa - sa * pb) * s, -(cz + (sa * pa + ca * pb) * s), t * H))
    for i in range(nr - 1):
        b0, b1 = i * np_, (i + 1) * np_
        for j in range(np_):
            jn = (j + 1) % np_
            faces.append((b0 + j, b0 + jn, b1 + jn, b1 + j))
    # chamfered tip: one shrunken ring, then a cap vertex
    t = t_top
    cx, cz, ca, sa = ring_centre(t, side)
    s = scale_at(t) * 0.45
    tip_ring = len(verts)
    for (pa, pb) in pts:
        verts.append((cx + (ca * pa - sa * pb) * s, -(cz + (sa * pa + ca * pb) * s), t * H + 1.2))
    last = (nr - 1) * np_
    for j in range(np_):
        jn = (j + 1) % np_
        faces.append((last + j, last + jn, tip_ring + jn, tip_ring + j))
    tip = len(verts)
    verts.append((cx, -cz, t * H + 1.9))
    for j in range(np_):
        jn = (j + 1) % np_
        faces.append((tip_ring + j, tip_ring + jn, tip))
    cx, cz, _, _ = ring_centre(T0, side)
    base_c = len(verts)
    verts.append((cx, -cz, T0 * H - 0.5))
    for j in range(np_):
        jn = (j + 1) % np_
        faces.append((jn, j, base_c))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def join_pair(a, b, name):
    bpy.ops.object.select_all(action="DESELECT")
    a.select_set(True)
    b.select_set(True)
    bpy.context.view_layer.objects.active = a
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


bpy.ops.wm.read_factory_settings(use_empty=True)

# ---- LOW: the analytic body the runtime trusts ----
low = join_pair(
    build_blade(0, "LowA", 240, 7, False),
    build_blade(1, "LowB", 240, 7, False),
    "Monument",
)

# Smart-projected UVs. Hand-rolled cylindrical coordinates left the tip
# and base fans with degenerate loops, which produced NaN tangents and
# rendered one blade as a see-through ghost. Let Blender solve it.
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.context.view_layer.objects.active = low
if not low.data.uv_layers:
    low.data.uv_layers.new(name="UVMap")
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.012, correct_aspect=True)
bpy.ops.object.mode_set(mode="OBJECT")

if "--silhouette" in sys.argv:
    # fast judge loop: grey form, three angles, no bake, no export
    FORM_DIR = os.path.join(ROOT, "captures", "form")
    os.makedirs(FORM_DIR, exist_ok=True)
    bpy.ops.mesh.primitive_plane_add(size=1400, location=(0, 0, -1.2))
    ground = bpy.context.active_object
    matg = bpy.data.materials.new("Grey")
    matg.use_nodes = True
    bsdf = matg.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.16, 0.16, 0.17, 1)
    bsdf.inputs["Roughness"].default_value = 0.5
    low.data.materials.append(matg)
    ground.data.materials.append(matg)
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", type="SUN"))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(55), math.radians(-12), math.radians(160))
    bpy.context.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", type="SUN"))
    fill.data.energy = 0.8
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
    cam.constraints.new(type="TRACK_TO").target = target
    bpy.context.scene.camera = cam
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 20
    sc.render.resolution_x = 620
    sc.render.resolution_y = 880
    try:
        sc.cycles.device = "GPU"
    except Exception:
        pass
    for nm, loc, tz in [
        ("front", (0, -300, 14), 95),
        ("threequarter", (185, -235, 40), 95),
        ("crown", (0, -110, 165), 168),
    ]:
        cam.location = loc
        target.location = (0, 0, tz)
        sc.render.filepath = os.path.join(FORM_DIR, f"form-{nm}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", sc.render.filepath)
    print("SILHOUETTE ONLY, nothing exported")
    raise SystemExit(0)

# ---- HIGH: the sculpt ----
high = join_pair(
    build_blade(0, "HighA", 700, 21, True),
    build_blade(1, "HighB", 700, 21, True),
    "MonumentHigh",
)
vg = high.vertex_groups.new(name="disp")
for v in high.data.vertices:
    t = max(0.0, min(1.0, v.co.z / H))
    vg.add([v.index], max(0.0, min(1.0, 1.15 * (1.0 - t) + 0.25)), "REPLACE")
for nm, scale, strength in [("Mass", 13.0, 0.6), ("Chisel", 3.5, 0.3), ("Tooth", 1.4, 0.12)]:
    tex = bpy.data.textures.new(nm, type="CLOUDS")
    tex.noise_scale = scale
    mod = high.modifiers.new(nm, "DISPLACE")
    mod.texture = tex
    mod.strength = strength
    mod.direction = "NORMAL"
    mod.vertex_group = "disp"
bpy.ops.object.select_all(action="DESELECT")
high.select_set(True)
bpy.context.view_layer.objects.active = high
for m in list(high.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)

# ---- bake high onto low ----
scene = bpy.context.scene
scene.render.engine = "CYCLES"
try:
    scene.cycles.device = "GPU"
except Exception:
    pass

mat = bpy.data.materials.new("BakeTarget")
mat.use_nodes = True
img_n = bpy.data.images.new("bake_normal", 2048, 2048, alpha=False)
img_n.colorspace_settings.name = "Non-Color"
img_a = bpy.data.images.new("bake_ao", 2048, 2048, alpha=False)
img_a.colorspace_settings.name = "Non-Color"
node = mat.node_tree.nodes.new("ShaderNodeTexImage")
low.data.materials.append(mat)

scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = 1.8
scene.render.bake.max_ray_distance = 3.5
scene.render.bake.margin = 8

bpy.ops.object.select_all(action="DESELECT")
high.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = low

node.image = img_n
mat.node_tree.nodes.active = node
scene.cycles.samples = 16
bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
img_n.filepath_raw = OUT_NRM
img_n.file_format = "PNG"
img_n.save()
print("BAKED normal ->", OUT_NRM)

node.image = img_a
mat.node_tree.nodes.active = node
scene.cycles.samples = 128
bpy.ops.object.bake(type="AO")
img_a.filepath_raw = OUT_AO
img_a.file_format = "PNG"
img_a.save()
print("BAKED ao ->", OUT_AO)

# the high poly and the bake material never ship
bpy.ops.object.select_all(action="DESELECT")
high.select_set(True)
bpy.ops.object.delete()
low.data.materials.clear()
try:
    bpy.ops.object.shade_auto_smooth(angle=0.62)
except Exception:
    bpy.ops.object.shade_smooth()

# ---- the ground: a dark shore with far dunes, flattened at the pool ----
bpy.ops.mesh.primitive_plane_add(size=1400)
terr = bpy.context.active_object
terr.name = "Terrain"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.subdivide(number_cuts=110)
bpy.ops.object.mode_set(mode="OBJECT")
for nm, scale, strength in [("Dunes", 180.0, 26.0), ("Grain", 30.0, 3.0)]:
    tex = bpy.data.textures.new(nm, type="CLOUDS")
    tex.noise_scale = scale
    mod = terr.modifiers.new(nm, "DISPLACE")
    mod.texture = tex
    mod.strength = strength
bpy.context.view_layer.objects.active = terr
for m in list(terr.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
for v in terr.data.vertices:
    r = math.hypot(v.co.x, v.co.y)
    if r < 260.0:
        f = max(0.0, min(1.0, (r - 60.0) / 200.0))
        f = f * f * (3 - 2 * f)
        v.co.z = v.co.z * f - 1.6 * (1.0 - f)
bpy.ops.object.shade_smooth()

bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
terr.select_set(True)
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", use_selection=True)
print("EXPORTED", OUT_GLB)
