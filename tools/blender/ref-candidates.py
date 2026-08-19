# Silhouettes from Jacob's reference sheet, 2026-08-19, round 3.
#
# Round 3 direction, Jacob verbatim: the split spire "was angelic and
# holy and once we travel into the through a tunnel like the lusion
# when astronaut is falling in a tunnel its soo cool can we mimic that
# and then at the end we see true latent form which is a something
# sinister staring back". On the idol: replace the central shard (read
# as phallic), fix the weird top.
#
#   A SPLIT SPIRE  bone-pale HOLY register, luminous white fissure,
#                  god-ray atmosphere. The slit continues below ground
#                  as a falling shaft ending in a chamber where THE
#                  WATCHER stands: a dark faceless form, backlit,
#                  still. Four shots: exterior, doorway, the fall,
#                  the watcher.
#   B FISSION IDOL hanging shard cluster instead of the standing one,
#                  crown cut to a clean angled break.
#
#   blender --background --python tools/blender/ref-candidates.py
#
# Judge frames only. No bake, no export.
import bpy
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "captures", "form", "refs")
os.makedirs(OUT, exist_ok=True)
H = 195.0
DEPTH = 265.0  # how far the shaft falls below the ground


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


def matte(obj, v, rough=0.6):
    m = bpy.data.materials.new(f"M{obj.name}")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (v, v, v * 1.02, 1)
    b.inputs["Roughness"].default_value = rough
    obj.data.materials.append(m)
    return obj


def emissive(obj, power=26.0, colour=(1.0, 0.97, 0.92)):
    m = bpy.data.materials.new(f"Em{obj.name}")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (*colour, 1)
    e.inputs[1].default_value = power
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs[0])
    obj.data.materials.append(m)
    return obj


def add_figure(pale=False):
    """A person, for scale."""
    bpy.ops.mesh.primitive_cylinder_add(radius=2.4, depth=9.0, location=(58, -34, 4.5))
    body = bpy.context.active_object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.2, location=(58, -34, 10.6))
    head = bpy.context.active_object
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    return matte(bpy.context.active_object, 0.28 if pale else 0.15)


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
    """Holy above, a fall below, the watcher at the bottom."""
    SLIT = 2.6
    objs = []
    for i, sgn in enumerate((-1, 1)):
        w = blade(f"Half{i}", H if sgn < 0 else H * 0.93,
                  31.0, 17.0, lean=-2.0 * sgn, top=0.05,
                  twist=0.0 if sgn < 0 else 0.05)
        bpy.ops.mesh.primitive_cube_add(size=400, location=(-sgn * 200, 0, H * 0.5))
        cut(w, bpy.context.active_object)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(sgn * 30, -14, H * (0.34 + 0.18 * i)))
        ch = bpy.context.active_object
        ch.scale = (26.0, 26.0, 40.0)
        ch.rotation_euler = (math.radians(28 + 14 * i), 0, math.radians(30 * sgn))
        cut(w, ch)
        if i == 1:
            bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, H * 0.93))
            br = bpy.context.active_object
            br.scale = (60.0, 60.0, 26.0)
            br.rotation_euler = (math.radians(19), math.radians(23), 0)
            cut(w, br)
        w.location = (sgn * SLIT, 0, 0)
        w.rotation_euler = (0, math.radians(-1.9 * sgn), 0)
        facet(w, strength=3.2, scale=105.0 - i * 20.0, seed=i + 1)
        # HOLY: bone-pale stone, not sombre grey
        matte(w, 0.5, rough=0.62)
        objs.append(w)

    # the shaft: the slit continues below ground as two walls
    walls = []
    for sgn in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(sgn * (SLIT + 35.2), 0, -DEPTH / 2 - 1))
        wall = bpy.context.active_object
        wall.scale = (62.0, 84.0, DEPTH - 2)
        walls.append(wall)
    # the chamber the fall ends in, carved from both walls
    for wall in walls:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 8.0, -DEPTH + 34.0))
        void = bpy.context.active_object
        void.scale = (92.0, 72.0, 62.0)
        cut(wall, void)
        matte(wall, 0.42, rough=0.7)
    objs += walls

    # the fissure light: one luminous blade above ground...
    bpy.ops.mesh.primitive_plane_add(size=1)
    fis = bpy.context.active_object
    fis.scale = (SLIT * 2.2, H * 0.46, 1.0)
    fis.rotation_euler = (math.radians(90), 0, 0)
    fis.location = (0, 2.5, H * 0.46)
    emissive(fis, 34.0)
    # a faint thread of light down the shaft wall, so the fall reads
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 5.5, -105.0))
    thread = bpy.context.active_object
    thread.scale = (1.3, 180.0, 1.0)
    thread.rotation_euler = (math.radians(90), 0, 0)
    emissive(thread, 1.7)
    # ...and a glow far below, the light the fall aims at
    bpy.ops.mesh.primitive_plane_add(size=1, location=(3.0, 26.0, -DEPTH + 2.6))
    well = bpy.context.active_object
    well.scale = (11.0, 11.0, 1.0)
    emissive(well, 2.0)

    # THE WATCHER: dark, faceless, still, backlit. It does not glow and
    # it has no eyes; its regard is posture and placement
    wt = blade("Watcher", 46.0, 6.8, 4.2, rings=10, top=0.03, twist=0.4)
    wt.location = (3.0, 26.0, -DEPTH + 3.0)
    wt.rotation_euler = (0, 0, math.radians(188))
    clean(wt)
    bpy.ops.object.shade_flat()
    matte(wt, 0.015, rough=0.9)
    # its backlight: a low panel BEHIND it, off-axis, never an eye
    bpy.ops.mesh.primitive_plane_add(size=1, location=(10.0, 54.0, -DEPTH + 12.0))
    back = bpy.context.active_object
    back.scale = (26.0, 16.0, 1.0)
    back.rotation_euler = (math.radians(90), 0, 0)
    emissive(back, 2.4, colour=(0.92, 0.96, 1.0))
    objs += [wt]

    # god-ray atmosphere for the holy exterior
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 70))
    vol = bpy.context.active_object
    vol.scale = (700, 700, 400)
    vm = bpy.data.materials.new("Air")
    vm.use_nodes = True
    nt = vm.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    sc_node = nt.nodes.new("ShaderNodeVolumeScatter")
    sc_node.inputs["Density"].default_value = 0.0009
    sc_node.inputs["Anisotropy"].default_value = 0.35
    nt.links.new(sc_node.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
    vol.data.materials.append(vm)

    ground_cutter = dict(loc=(0, 2.0, 0), scale=(SLIT * 2.6, 30.0, 60.0))
    shots = [
        ("front", (0, -430, 36), (0, 0, H * 0.44), 62),
        ("doorway", (0, -64, 9), (0, 0, H * 0.34), 30),
        ("fall", (1.2, -3.5, -26), (0, 6.0, -DEPTH + 8), 24),
        ("watcher", (-6, -40, -DEPTH + 40), (3, 24, -DEPTH + 18), 24),
    ]
    return objs, ground_cutter, shots, True


def build_fission_idol():
    """The shell, with a hanging cluster and a clean broken crown."""
    body = blade("Idol", H * 0.86, 46.0, 32.0, rings=32, top=0.05)
    facet(body, strength=4.6, scale=80.0, seed=11)
    clean(body)
    sol = body.modifiers.new("Shell", "SOLIDIFY")
    sol.thickness = 5.5
    sol.offset = 1.0
    bpy.ops.object.modifier_apply(modifier=sol.name)
    # the breach
    bpy.ops.mesh.primitive_cube_add(size=1, location=(6.0, -34.0, H * 0.30))
    br = bpy.context.active_object
    br.scale = (17.0, 120.0, H * 0.62)
    br.rotation_euler = (0, math.radians(8), math.radians(6))
    cut(body, br)
    # hairline cracks
    for (yaw, xoff, zf, thick, tilt) in [
        (0.62, -18.0, 0.50, 2.2, 21.0),
        (-0.85, 9.0, 0.20, 1.7, 16.0),
        (1.25, 22.0, 0.60, 1.6, 13.0),
        (2.1, -6.0, 0.42, 1.9, -12.0),
    ]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(xoff, 0, H * zf))
        c = bpy.context.active_object
        c.scale = (thick, 200.0, H * 0.9)
        c.rotation_euler = (0, math.radians(tilt), yaw)
        cut(body, c)
    # the weird top becomes a clean angled break
    bpy.ops.mesh.primitive_cube_add(size=1, location=(8.0, 0, H * 0.92))
    crown = bpy.context.active_object
    crown.scale = (220.0, 220.0, 44.0)
    crown.rotation_euler = (math.radians(7), math.radians(17), 0)
    cut(body, crown)
    matte(body, 0.15, rough=0.6)

    # the core hangs: a cluster of three tip-down shards, off-centre,
    # nothing standing, nothing central
    lit = []
    for (dx, dy, hz, ln, rz) in [
        (-6.0, 11.0, 0.66, 26.0, 15.0),
        (3.0, 7.0, 0.62, 34.0, -22.0),
        (9.0, 13.0, 0.70, 19.0, 40.0),
    ]:
        sh = blade(f"Hang{dx}", ln, 3.4, 2.4, rings=8, top=0.04, twist=0.5)
        sh.rotation_euler = (math.pi, 0, math.radians(rz))
        sh.location = (dx, dy, H * hz)
        clean(sh)
        bpy.ops.object.shade_flat()
        lit.append(emissive(sh, 5.0))

    shots = [
        ("front", (0, -430, 36), (0, 0, H * 0.44), 62),
        ("threequarter", (255, -335, 70), (0, 0, H * 0.44), 62),
        ("inside", (10.0, -46.0, H * 0.10), (0, 0, H * 0.48), 34),
    ]
    return [body] + lit, None, shots, False


CANDIDATES = {
    "a-split-spire": build_split_spire,
    "b-fission-idol": build_fission_idol,
}

for key, builder in CANDIDATES.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs, ground_cutter, shots, pale = builder()
    add_figure(pale)

    bpy.ops.mesh.primitive_plane_add(size=1600, location=(0, 0, -1.5))
    ground = bpy.context.active_object
    matte(ground, 0.3 if pale else 0.15, rough=0.7)
    if ground_cutter:
        bpy.ops.mesh.primitive_cube_add(size=1, location=ground_cutter["loc"])
        gc = bpy.context.active_object
        gc.scale = ground_cutter["scale"]
        cut(ground, gc)

    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", type="SUN"))
    sun.data.energy = 5.0 if pale else 4.5
    sun.data.angle = math.radians(1.5)
    sun.rotation_euler = (math.radians(62), math.radians(-8), math.radians(148))
    bpy.context.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", type="SUN"))
    fill.data.energy = 0.7
    fill.rotation_euler = (math.radians(74), math.radians(12), math.radians(-42))
    bpy.context.collection.objects.link(fill)
    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    bg = (0.011, 0.012, 0.016, 1) if pale else (0.012, 0.012, 0.015, 1)
    w.node_tree.nodes["Background"].inputs[0].default_value = bg
    bpy.context.scene.world = w

    target = bpy.data.objects.new("T", None)
    bpy.context.collection.objects.link(target)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    bpy.context.collection.objects.link(cam)
    cam.constraints.new(type="TRACK_TO").target = target
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 40 if pale else 24
    sc.render.resolution_x = 620
    sc.render.resolution_y = 840
    try:
        sc.cycles.device = "GPU"
    except Exception:
        pass

    for nm, loc, tgt, lens in shots:
        cam.location = loc
        target.location = tgt
        cam.data.lens = lens
        sc.render.filepath = os.path.join(OUT, f"{key}-{nm}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", sc.render.filepath)

print("REF CANDIDATES DONE ->", OUT)
