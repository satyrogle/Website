# Silhouettes from Jacob's reference sheet, 2026-08-19, round 2.
#
# Round 1 verdict, verbatim: "1st one is fat 2nd one is very wrong 3rd
# one is shit". Corrections, one per candidate:
#   A SPLIT SPIRE  was 2:1 mass to height. The sheet is nearer 3:1, so
#                  the wedge is slimmer and the slit tighter.
#   B FISSION IDOL was built as a bouquet of separate spikes. The sheet
#                  shows ONE mass with cracks cut through it and light
#                  escaping from the damage. Rebuilt as a single body
#                  with crack slots and a lit core inside it.
#   C FOLDED OBELISK had a smooth twist, which reads as nothing. The
#                  sheet shows a hard ROTATION: an upper mass turned
#                  against a lower one, meeting at a fold.
#
#   blender --background --python tools/blender/ref-candidates.py
#
# Grey, two angles each, no bake and no export.
import bpy
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "captures", "form", "refs")
os.makedirs(OUT, exist_ok=True)
H = 195.0


def hash1(x):
    v = math.sin(x) * 43758.5453
    return v - math.floor(v)


def clean(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def facet(obj, strength=4.0, scale=95.0, seed=0.0):
    """Chisel into big flat planes and keep them hard."""
    clean(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=3)
    bpy.ops.object.mode_set(mode="OBJECT")
    tex = bpy.data.textures.new(f"F{seed}", type="CLOUDS")
    tex.noise_scale = scale
    tex.noise_depth = 0
    m = obj.modifiers.new("Chisel", "DISPLACE")
    m.texture = tex
    m.strength = strength
    m.direction = "NORMAL"
    bpy.ops.object.modifier_apply(modifier=m.name)
    d = obj.modifiers.new("Planar", "DECIMATE")
    d.decimate_type = "COLLAPSE"
    d.ratio = 0.05
    bpy.ops.object.modifier_apply(modifier=d.name)
    bpy.ops.object.shade_flat()


def cut(obj, cutter):
    b = obj.modifiers.new("Cut", "BOOLEAN")
    b.object = cutter
    b.operation = "DIFFERENCE"
    b.solver = "FAST"
    clean(obj)
    bpy.ops.object.modifier_apply(modifier=b.name)
    clean(cutter)
    bpy.ops.object.delete()


def emissive(obj, power=26.0):
    m = bpy.data.materials.new(f"Em{obj.name}")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (1.0, 0.96, 0.9, 1)
    e.inputs[1].default_value = power
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs[0])
    obj.data.materials.append(m)
    return obj


def add_figure():
    """A person, for scale. The sheet judges mass this way."""
    bpy.ops.mesh.primitive_cylinder_add(radius=2.4, depth=9.0, location=(58, -34, 4.5))
    body = bpy.context.active_object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.2, location=(58, -34, 10.6))
    head = bpy.context.active_object
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    return bpy.context.active_object


def blade(name, height, base_w, base_d, lean=0.0, rings=26, twist=0.0, top=0.1):
    """A tall angular mass: sharp profile, hard planes."""
    prof = [(1.0, 0.22), (0.55, 1.0), (-0.62, 0.72), (-1.0, 0.0),
            (-0.62, -0.72), (0.55, -1.0)]
    verts, faces = [], []
    n = len(prof)
    for i in range(rings):
        t = i / (rings - 1)
        k = 1.0 - (1.0 - top) * (t ** 1.35)
        a = twist * t
        ca, sa = math.cos(a), math.sin(a)
        cx = lean * (t ** 1.7)
        for (px, py) in prof:
            x, y = px * base_w * k, py * base_d * k
            verts.append((cx + x * ca - y * sa, x * sa + y * ca, t * height))
    for i in range(rings - 1):
        b0, b1 = i * n, (i + 1) * n
        for j in range(n):
            jn = (j + 1) % n
            faces.append((b0 + j, b0 + jn, b1 + jn, b1 + j))
    tip = len(verts)
    verts.append((lean, 0.0, height + base_w * 0.3))
    last = (rings - 1) * n
    for j in range(n):
        faces.append((last + j, last + (j + 1) % n, tip))
    base = len(verts)
    verts.append((0.0, 0.0, -2.0))
    for j in range(n):
        faces.append(((j + 1) % n, j, base))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    clean(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.mesh.subdivide(number_cuts=1)
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def build_split_spire():
    """Slim. One wedge, cut down the centre, parted by a tight slit."""
    SLIT = 2.4
    halves = []
    for i, sgn in enumerate((-1, 1)):
        w = blade(f"Half{i}", H if sgn < 0 else H * 0.94,
                  31.0, 17.0, lean=-2.0 * sgn, top=0.05,
                  twist=0.0 if sgn < 0 else 0.05)
        bpy.ops.mesh.primitive_cube_add(size=400, location=(-sgn * 200, 0, H * 0.5))
        cut(w, bpy.context.active_object)
        w.location = (sgn * SLIT, 0, 0)
        facet(w, strength=3.2, scale=105.0 - i * 20.0, seed=i + 1)
        halves.append(w)
    bpy.ops.mesh.primitive_plane_add(size=1)
    fis = bpy.context.active_object
    fis.scale = (SLIT * 1.6, H * 0.46, 1.0)
    fis.rotation_euler = (math.radians(90), 0, 0)
    fis.location = (0, 2.5, H * 0.46)
    return halves, [emissive(fis, 30.0)]


def build_fission_idol():
    """ONE mass, cracked. The light escapes through the damage."""
    body = blade("Idol", H * 0.82, 44.0, 30.0, rings=30, top=0.06)
    facet(body, strength=4.6, scale=80.0, seed=11)
    cracks = [
        (0.0, 12.0, 0.30, 2.4, 26.0),
        (0.55, -16.0, 0.52, 1.9, 22.0),
        (-0.7, 6.0, 0.16, 1.6, 18.0),
        (1.15, 20.0, 0.62, 1.5, 15.0),
    ]
    for (yaw, xoff, zf, thick, tilt) in cracks:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(xoff, 0, H * zf))
        c = bpy.context.active_object
        c.scale = (thick, 200.0, H * 0.9)
        c.rotation_euler = (0, math.radians(tilt), yaw)
        cut(body, c)
    bpy.ops.mesh.primitive_ico_sphere_add(radius=17.0, subdivisions=2,
                                          location=(0, 0, H * 0.36))
    core = emissive(bpy.context.active_object, 14.0)
    return [body], [core]


def build_folded_obelisk():
    """A hard rotation: an upper mass turned against a lower one."""
    low = blade("Low", H * 0.54, 34.0, 27.0, rings=14, top=0.86)
    up = blade("Up", H * 0.5, 29.5, 23.5, rings=14, top=0.1)
    up.location = (0, 0, H * 0.535)
    up.rotation_euler = (0, 0, math.radians(41))
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    up.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = "Obelisk"
    facet(o, strength=3.0, scale=110.0, seed=9)
    return [o], []


CANDIDATES = {
    "a-split-spire": build_split_spire,
    "b-fission-idol": build_fission_idol,
    "c-folded-obelisk": build_folded_obelisk,
}

for key, builder in CANDIDATES.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs, lit = builder()
    objs = list(objs) + [add_figure()]

    bpy.ops.mesh.primitive_plane_add(size=1600, location=(0, 0, -1.5))
    ground = bpy.context.active_object
    mat = bpy.data.materials.new("Grey")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.15, 0.15, 0.16, 1)
    bsdf.inputs["Roughness"].default_value = 0.55
    for o in objs + [ground]:
        o.data.materials.append(mat)

    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", type="SUN"))
    sun.data.energy = 4.5
    sun.data.angle = math.radians(1.5)
    sun.rotation_euler = (math.radians(62), math.radians(-8), math.radians(148))
    bpy.context.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", type="SUN"))
    fill.data.energy = 0.6
    fill.rotation_euler = (math.radians(74), math.radians(12), math.radians(-42))
    bpy.context.collection.objects.link(fill)
    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.012, 0.015, 1)
    bpy.context.scene.world = w

    target = bpy.data.objects.new("T", None)
    target.location = (0, 0, H * 0.44)
    bpy.context.collection.objects.link(target)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens = 62
    bpy.context.collection.objects.link(cam)
    cam.constraints.new(type="TRACK_TO").target = target
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 22
    sc.render.resolution_x = 620
    sc.render.resolution_y = 840
    try:
        sc.cycles.device = "GPU"
    except Exception:
        pass

    for nm, loc in [("front", (0, -430, 36)), ("threequarter", (255, -335, 70))]:
        cam.location = loc
        sc.render.filepath = os.path.join(OUT, f"{key}-{nm}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", sc.render.filepath)

print("REF CANDIDATES DONE ->", OUT)
