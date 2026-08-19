# The monument's body, v4: THE SPLIT SPIRE.
#
# One wedge, cut down the centre and parted by a narrow slit. The
# halves are unequal and tilted so the bases open into a doorway.
#
# Two meshes of the same form:
#   LOW  - the analytic halves, UV mapped. This surface is shared
#          exactly with src/world/monumentForm.ts, so the cells sit on
#          it and the camera math can trust it. No displacement.
#   HIGH - the same halves at high density with three layers of
#          chisel. Never exported; baked into normal + AO on the low.
#
# Constants MIRROR src/world/monumentForm.ts. Change them together.
#
#   blender --background --python tools/blender/monument.py
#   blender --background --python tools/blender/monument.py -- --silhouette
import bpy
import math
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_GLB = os.path.join(ROOT, "public", "models", "monument.glb")
OUT_NRM = os.path.join(ROOT, "public", "models", "monument-normal.png")
OUT_AO = os.path.join(ROOT, "public", "models", "monument-ao.png")

H = 195.0
SLIT_BASE = 5.0
SLIT_TOP = 1.1
BASE_W = 31.0
BASE_D = 17.0
TOP_K = 0.1
TOP_D = 0.1
SHEAR = 0.0
TIP_T = (1.0, 0.9)

HALF_PROFILE = [
    (0.0, 1.0),
    (-0.55, 0.86),
    (-0.9, 0.44),
    (-1.0, 0.0),
    (-0.9, -0.44),
    (-0.55, -0.86),
    (0.0, -1.0),
]


def section_at(t):
    return 1.0 - (1.0 - TOP_K) * (max(t, 0.0) ** 1.0)


def depth_section_at(t):
    return 1.0 - (1.0 - TOP_D) * (max(t, 0.0) ** 1.0)


def cut_plane_x(t, side):
    s = -1.0 if side == 0 else 1.0
    return s * (SLIT_BASE - (SLIT_BASE - SLIT_TOP) * min(1.0, max(0.0, t)))


def resample(edge_div):
    """Points along the outer boundary, corners preserved."""
    pts = []
    for i in range(len(HALF_PROFILE) - 1):
        p = HALF_PROFILE[i]
        q = HALF_PROFILE[i + 1]
        for k in range(edge_div):
            f = k / edge_div
            pts.append((p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f))
    pts.append(HALF_PROFILE[-1])
    return pts


def build_half(side, name, rings, edge_div, chisel):
    """
    A half wedge. The outer boundary is lofted; the cut face closes it,
    so the mesh stays watertight and the fissure has a real wall.
    """
    s = -1.0 if side == 0 else 1.0
    pts = resample(edge_div)
    n = len(pts)
    t_top = TIP_T[side]
    verts, faces = [], []
    # the loft starts BELOW the ground and keeps a constant section
    # down there, so each foot enters the terrain as straight stone.
    # Ending at exactly zero with a fanned cap left the terrain's dip
    # exposing the undersides, and exposing each one differently
    T_UNDER = -0.055
    for i in range(rings):
        f = i / (rings - 1)
        t = T_UNDER + (t_top - T_UNDER) * f
        k = 1.0 - (1.0 - TOP_K) * t
        cx = cut_plane_x(max(t, 0.0), side)
        kd = 1.0 - (1.0 - TOP_D) * t
        for (pa, pb) in pts:
            verts.append((cx + s * -pa * BASE_W * k, pb * BASE_D * kd, t * H))
    for i in range(rings - 1):
        b0, b1 = i * n, (i + 1) * n
        for j in range(n - 1):
            faces.append((b0 + j, b0 + j + 1, b1 + j + 1, b1 + j))
        # the cut face: last boundary point back to the first
        faces.append((b0 + n - 1, b0, b1, b1 + n - 1))
    # THE CROWN: a flat cap sheared across the section, not a swept
    # spike. A spike at 5 percent section read as bent foil
    # THE POINT: the apex stands over the CUT PLANE, so the edge facing
    # the fissure runs vertical and the outer face slopes away from it.
    # A right-angled tip, reversed on each half, which carries the split
    # all the way to the top. An apex on the section centre gave a
    # symmetric triangle that read as leaning
    apex = len(verts)
    k = section_at(t_top)
    cx = cut_plane_x(t_top, side)
    verts.append((cx + s * 0.06 * BASE_W * k, 0.0, t_top * H + 9.5))
    last = (rings - 1) * n
    for j in range(n - 1):
        faces.append((last + j, last + j + 1, apex))
    faces.append((last + n - 1, last, apex))
    # base cap: one flat face across the buried section
    faces.append(tuple(range(n - 1, -1, -1)))

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def build_shard(side, idx, base_t, top_t, du, dv, lean_u, lean_v, w, d):
    """
    One crown shard. Rises from the body's cap at (du, dv) offset,
    leaning as it goes, ending in a sharp angled point. Bare stone: no
    cells are placed above the body, because the crown is the part that
    has already broken.
    """
    s_ = -1.0 if side == 0 else 1.0
    prof = [(1.0, 0.3), (0.35, 1.0), (-0.75, 0.7), (-1.0, 0.0), (-0.75, -0.7), (0.35, -1.0)]
    n = len(prof)
    rings = 9
    verts, faces = [], []
    cx0 = cut_plane_x(base_t, side) + s_ * -0.5 * BASE_W * section_at(base_t)
    for i in range(rings):
        f = i / (rings - 1)
        t = base_t + (top_t - base_t) * f
        k = (1.0 - 0.88 * (f ** 1.25))
        cx = cx0 + du + lean_u * (f ** 1.6)
        cz = dv + lean_v * (f ** 1.6)
        for (pa, pb) in prof:
            verts.append((cx + pa * w * k, cz + pb * d * k, t * H))
    for i in range(rings - 1):
        b0, b1 = i * n, (i + 1) * n
        for j in range(n):
            jn = (j + 1) % n
            faces.append((b0 + j, b0 + jn, b1 + jn, b1 + j))
    # a sharp tip, offset so no two shards point the same way
    tip = len(verts)
    verts.append((cx0 + du + lean_u * 1.25, dv + lean_v * 1.25, top_t * H + w * 1.5))
    last = (rings - 1) * n
    for j in range(n):
        faces.append((last + j, last + (j + 1) % n, tip))
    base = len(verts)
    verts.append((cx0 + du, dv, base_t * H - 6.0))
    for j in range(n):
        faces.append(((j + 1) % n, j, base))
    me = bpy.data.meshes.new(f"Shard{side}{idx}")
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = bpy.data.objects.new(f"Shard{side}{idx}", me)
    bpy.context.collection.objects.link(ob)
    return ob


# each half's crown: shards at different heights, leans and sizes, so
# the top reads as broken crystal rather than a finished point
SHARDS = {}


def join(a, b, name):
    bpy.ops.object.select_all(action="DESELECT")
    a.select_set(True)
    b.select_set(True)
    bpy.context.view_layer.objects.active = a
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return o


bpy.ops.wm.read_factory_settings(use_empty=True)

parts = [build_half(0, "LowA", 150, 5, False), build_half(1, "LowB", 150, 5, False)]
for side, specs in SHARDS.items():
    for idx, spec in enumerate(specs):
        parts.append(build_shard(side, idx, *spec))
bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
low = bpy.context.active_object
low.name = "Monument"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")

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
    FORM_DIR = os.path.join(ROOT, "captures", "form")
    os.makedirs(FORM_DIR, exist_ok=True)
    m = bpy.data.materials.new("Grey")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.4, 0.4, 0.41, 1)
    low.data.materials.append(m)
    bpy.ops.mesh.primitive_plane_add(size=1400, location=(0, 0, -2))
    bpy.context.active_object.data.materials.append(m)
    sun = bpy.data.objects.new("S", bpy.data.lights.new("S", type="SUN"))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(58), math.radians(-10), math.radians(150))
    bpy.context.collection.objects.link(sun)
    tgt = bpy.data.objects.new("T", None)
    tgt.location = (0, 0, 95)
    bpy.context.collection.objects.link(tgt)
    cam = bpy.data.objects.new("C", bpy.data.cameras.new("C"))
    cam.data.lens = 60
    bpy.context.collection.objects.link(cam)
    cam.constraints.new(type="TRACK_TO").target = tgt
    bpy.context.scene.camera = cam
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 20
    sc.render.resolution_x = 620
    sc.render.resolution_y = 840
    for nm, loc in [("front", (0, -330, 22)), ("threequarter", (200, -260, 46))]:
        cam.location = loc
        sc.render.filepath = os.path.join(FORM_DIR, f"form-{nm}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", sc.render.filepath)
    raise SystemExit(0)

hparts = [build_half(0, "HighA", 620, 17, True), build_half(1, "HighB", 620, 17, True)]
for side, specs in SHARDS.items():
    for idx, spec in enumerate(specs):
        hparts.append(build_shard(side, idx + 90, *spec))
bpy.ops.object.select_all(action="DESELECT")
for o in hparts:
    o.select_set(True)
bpy.context.view_layer.objects.active = hparts[0]
bpy.ops.object.join()
high = bpy.context.active_object
high.name = "MonumentHigh"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
vg = high.vertex_groups.new(name="disp")
for v in high.data.vertices:
    t = max(0.0, min(1.0, v.co.z / H))
    vg.add([v.index], max(0.0, min(1.0, 1.1 * (1.0 - t) + 0.3)), "REPLACE")
# MACHINED SKIN, not masonry: large plate cracks at macro scale and a
# dense sintered grain at micro scale. Nothing at the middle frequency,
# which is where bedding and courses used to live
for nm, kind, basis, scale, strength in [
    ("Plates", "CLOUDS", "VORONOI_CRACKLE", 62.0, 0.85),
    ("Breakup", "CLOUDS", "BLENDER_ORIGINAL", 30.0, 0.22),
    ("Sinter", "STUCCI", None, 1.1, 0.075),
]:
    tex = bpy.data.textures.new(nm, type=kind)
    tex.noise_scale = scale
    if basis:
        tex.noise_basis = basis
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
scene.render.bake.cage_extrusion = 1.6
scene.render.bake.max_ray_distance = 3.2
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
print("BAKED normal")
node.image = img_a
mat.node_tree.nodes.active = node
scene.cycles.samples = 96
bpy.ops.object.bake(type="AO")
img_a.filepath_raw = OUT_AO
img_a.file_format = "PNG"
img_a.save()
print("BAKED ao")

bpy.ops.object.select_all(action="DESELECT")
high.select_set(True)
bpy.ops.object.delete()
low.data.materials.clear()
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.context.view_layer.objects.active = low
try:
    bpy.ops.object.shade_auto_smooth(angle=0.5)
except Exception:
    bpy.ops.object.shade_flat()

# --- the shore ---
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
        v.co.z = v.co.z * f + 0.35 * (1.0 - f)
bpy.ops.object.shade_smooth()

bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
terr.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", use_selection=True)
print("EXPORTED", OUT_GLB)
