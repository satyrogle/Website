# Silhouettes from Jacob's reference sheet, 2026-08-19.
#
# Three bodies, grey, two angles each, NO bake and NO export. He picks
# one and only then does it cost a pipeline run.
#
#   blender --background --python tools/blender/ref-candidates.py
#
# A SPLIT SPIRE   two massive faceted blades, a NARROW straight fissure
#                 between them. A slit, never a lens: a lens is an eye.
# B FISSION IDOL  one cracked shell, shards parted by thin gaps, the
#                 light escaping from the damage rather than from a
#                 hole placed for it.
# C FOLDED OBELISK  one monolith carrying a rotation that cannot be
#                 read as a seam.
import bpy
import bmesh
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "captures", "form", "refs")
os.makedirs(OUT, exist_ok=True)
H = 195.0


def hash1(x):
    v = math.sin(x) * 43758.5453
    return v - math.floor(v)


def facet(obj, strength=1.0, scale=16.0, seed=0.0):
    """Chisel the surface into big flat planes, and keep them hard."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
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
    d.ratio = 0.06
    bpy.ops.object.modifier_apply(modifier=d.name)
    bpy.ops.object.shade_flat()


def add_figure():
    """A person, for scale. The reference sheet judges mass this way."""
    bpy.ops.mesh.primitive_cylinder_add(radius=2.4, depth=9.0, location=(52, -30, 4.5))
    body = bpy.context.active_object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.2, location=(52, -30, 10.6))
    head = bpy.context.active_object
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    return bpy.context.active_object


def blade(name, height, base_w, base_d, lean, rings=26, taper=1.0, twist=0.0, top=0.18):
    """A tall angular blade: sharp profile, hard planes, no smoothness."""
    prof = [(1.0, 0.22), (0.55, 1.0), (-0.62, 0.72), (-1.0, 0.0),
            (-0.62, -0.72), (0.55, -1.0)]
    verts, faces = [], []
    n = len(prof)
    for i in range(rings):
        t = i / (rings - 1)
        k = 1.0 - (1.0 - top) * (t ** 1.35)
        w = base_w * k
        d = base_d * k
        a = twist * t
        ca, sa = math.cos(a), math.sin(a)
        cx = lean * (t ** 1.7)
        for (px, py) in prof:
            x = px * w
            y = py * d
            verts.append((cx + x * ca - y * sa, x * sa + y * ca, t * height))
    for i in range(rings - 1):
        b0, b1 = i * n, (i + 1) * n
        for j in range(n):
            jn = (j + 1) % n
            faces.append((b0 + j, b0 + jn, b1 + jn, b1 + j))
    tip = len(verts)
    verts.append((lean, 0.0, height + base_w * 0.35))
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
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.mesh.subdivide(number_cuts=1)
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def build_split_spire():
    # ONE wedge, cut down the middle and parted: the silhouette stays a
    # single mass and the fissure is a narrow straight slit. Two
    # separate cones is a different, weaker object.
    SLIT = 3.2
    halves = []
    for i, sgn in enumerate((-1, 1)):
        w = blade(f"Half{i}", H if sgn < 0 else H * 0.93,
                  46.0, 26.0, lean=-3.0 * sgn, top=0.08,
                  twist=0.0 if sgn < 0 else 0.06)
        # cut away everything on the far side of the centre plane
        # the cutter sits OPPOSITE the direction this half will move, so each
        # half keeps its own side of the centre plane
        bpy.ops.mesh.primitive_cube_add(size=400, location=(-sgn * 200, 0, H * 0.5))
        cutter = bpy.context.active_object
        b = w.modifiers.new("Cut", "BOOLEAN")
        b.object = cutter
        b.operation = "DIFFERENCE"
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.modifier_apply(modifier=b.name)
        bpy.ops.object.select_all(action="DESELECT")
        cutter.select_set(True)
        bpy.ops.object.delete()
        w.location = (sgn * SLIT, 0, 0)
        facet(w, strength=5.0, scale=95.0 - i * 18.0, seed=i + 1)
        halves.append(w)
    # the fissure: a tall thin blade of light standing in the slit
    bpy.ops.mesh.primitive_plane_add(size=1)
    fis = bpy.context.active_object
    fis.scale = (SLIT * 1.7, H * 0.46, 1.0)
    fis.rotation_euler = (math.radians(90), 0, 0)
    fis.location = (0, 3.0, H * 0.46)
    em = bpy.data.materials.new("Fissure")
    em.use_nodes = True
    nt = em.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (1.0, 0.96, 0.9, 1)
    e.inputs[1].default_value = 30.0
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs[0])
    fis.data.materials.append(em)
    return halves, [fis]


def build_fission_idol():
    # one shell, split into shards that part slightly: the light gets
    # out through the damage, not through a designed opening
    shards = []
    N = 7
    for i in range(N):
        f = i / N
        ang = f * math.tau
        h = H * (0.62 + 0.38 * hash1(i * 12.9 + 3.1))
        s = blade(f"Shard{i}", h, 17.0 + 7.0 * hash1(i * 7.7), 13.0,
                  lean=9.0 + 7.0 * hash1(i * 3.3),
                  twist=0.1 * (hash1(i * 5.5) - 0.5), top=0.14)
        facet(s, strength=3.4, scale=62.0, seed=i)
        r = 17.0 + 4.0 * hash1(i * 2.2)
        s.location = (math.cos(ang) * r, math.sin(ang) * r, 0)
        s.rotation_euler = (
            math.radians(7 * (hash1(i * 9.1) - 0.5) * 2),
            math.radians(9 * hash1(i * 4.4)),
            ang + math.radians(90),
        )
        shards.append(s)
    return shards


def build_folded_obelisk():
    # one mass, one rotation carried through it, no seam to find
    o = blade("Obelisk", H, 42.0, 34.0, lean=0.0, rings=34,
              twist=math.radians(58), top=0.46)
    facet(o, strength=7.0, scale=120.0, seed=9)
    return [o]


CANDIDATES = {
    "a-split-spire": build_split_spire,
    "b-fission-idol": build_fission_idol,
    "c-folded-obelisk": build_folded_obelisk,
}

for key, builder in CANDIDATES.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    built = builder()
    objs, emissive = built if isinstance(built, tuple) else (built, [])
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

    # a hard key raking across the facets, and a soft fill: the igloo
    # move, where light direction shows the material
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
    target.location = (0, 0, H * 0.48)
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

    for nm, loc in [("front", (0, -420, 34)), ("threequarter", (250, -330, 66))]:
        cam.location = loc
        sc.render.filepath = os.path.join(OUT, f"{key}-{nm}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", sc.render.filepath)

print("REF CANDIDATES DONE ->", OUT)
