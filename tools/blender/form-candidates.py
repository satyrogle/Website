# Silhouette contact sheet, after the second "nope" of 2026-08-19.
#
# Four distinct monument bodies rendered as raw grey forms, three
# angles each, NO site integration. Jacob points at one (or supplies
# the exact reference image to match, or kills the direction). The
# winner's constants get transplanted into monument.py and
# monumentForm.ts together.
#
#   blender --background --python tools/blender/form-candidates.py
#
# Output: captures/form/candidates/<key>-<angle>.png
import bpy
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "captures", "form", "candidates")
os.makedirs(OUT, exist_ok=True)


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


# the fork family: broad face toward the viewer, thin edge toward the
# gap. a = radial is the WIDE axis, b = tangential is depth
PROFILE_SLAB = [
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
PROFILE_RIBBON = [
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

# key: (PHI, TWIST_POW, PHI0, profile, tip_t,
#       (r0, rA, rP, rC, c0, cP), (hk, h0, h1), (s0, s1, sP, sB))
CANDIDATES = {
    # A THE FORK: two broad slabs face-on, fused foot, lens of open
    # sky between them, tips curling over and past each other at the
    # crown. The real-Marker hypothesis. PHI0 puts the gap toward the
    # opening camera so the fork reads from the front.
    "a-fork": (1.1, 1.0, -0.35, PROFILE_SLAB, (1.0, 0.94),
               (4.0, 36.0, 1.1, 11.0, 0.86, 1.6), (4.2, 0.84, 0.97),
               (1.2, 0.92, 1.3, 0.06)),
    # B THE HELIX: the rejected v2, for honest side-by-side.
    "b-helix": (4.0, 1.05, 0.55, PROFILE_RIBBON, (1.0, 0.958),
                (3.4, 34.0, 1.15, 5.5, 0.84, 1.0), (4.2, 0.84, 0.97),
                (1.15, 0.86, 1.3, 0.10)),
    # C THE WOUND FORK: A's mass with a half twist through it.
    "c-woundfork": (2.2, 1.0, -0.6, PROFILE_SLAB, (1.0, 0.94),
                    (4.0, 36.0, 1.1, 11.0, 0.86, 1.6), (4.2, 0.84, 0.97),
                    (1.2, 0.92, 1.3, 0.06)),
    # D THE SHEER: almost no twist, tall parallel slabs, tight slit,
    # curl interlock. The most austere.
    "d-sheer": (0.45, 1.0, -0.2, PROFILE_SLAB, (1.0, 0.95),
                (3.6, 30.0, 1.0, 9.5, 0.88, 1.5), (4.2, 0.84, 0.97),
                (1.18, 0.9, 1.3, 0.05)),
}

H = 195.0
EDGE_DIV = 7


def build_candidate(key, params):
    (PHI, TWIST_POW, PHI0, PROFILE, TIP_T, rpar, hpar, spar) = params
    r0, rA, rP, rC, c0, cP = rpar
    hk, h0, h1 = hpar
    s0, s1, sP, sB = spar

    def twist_at(t):
        return PHI0 + PHI * (max(t, 1e-6) ** TWIST_POW)

    def radius_at(t):
        return r0 + rA * t * (max(1.0 - t, 0.0) ** rP) - rC * (smoothstep(c0, 1.0, t) ** cP)

    def hook_at(t):
        return hk * smoothstep(h0, h1, t)

    def scale_at(t):
        return (s0 - s1 * (max(t, 0.0) ** sP)) * (1.0 + sB * math.sin(math.pi * min(1.0, 1.15 * t)))

    def wobble_at(t, side):
        return (0.35 * math.sin(9.3 * t + 2.1 * side), 0.35 * math.cos(7.7 * t + 1.3 * side))

    pts = []
    for i in range(len(PROFILE)):
        p = PROFILE[i]
        q = PROFILE[(i + 1) % len(PROFILE)]
        for k in range(EDGE_DIV):
            f = k / EDGE_DIV
            pts.append((p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f))
    NP = len(pts)

    def ring_centre(t, side):
        a = twist_at(t) + side * math.pi
        r = radius_at(t)
        hkv = hook_at(t)
        ca, sa = math.cos(a), math.sin(a)
        wx, wz = wobble_at(t, side)
        return r * ca - hkv * sa + wx, r * sa + hkv * ca + wz, ca, sa

    for side in (0, 1):
        t_top = TIP_T[side]
        NR = 240
        T0 = -0.02
        verts = []
        faces = []
        for i in range(NR):
            t = T0 + (t_top - T0) * (i / (NR - 1))
            cx, cz, ca, sa = ring_centre(t, side)
            s = scale_at(t)
            for (pa, pb) in pts:
                verts.append((cx + (ca * pa - sa * pb) * s, -(cz + (sa * pa + ca * pb) * s), t * H))
        for i in range(NR - 1):
            b0, b1 = i * NP, (i + 1) * NP
            for j in range(NP):
                jn = (j + 1) % NP
                faces.append((b0 + j, b0 + jn, b1 + jn, b1 + j))
        t = t_top
        cx, cz, ca, sa = ring_centre(t, side)
        s = scale_at(t) * 0.45
        tip_ring = len(verts)
        for (pa, pb) in pts:
            verts.append((cx + (ca * pa - sa * pb) * s, -(cz + (sa * pa + ca * pb) * s), t * H + 1.2))
        last = (NR - 1) * NP
        for j in range(NP):
            jn = (j + 1) % NP
            faces.append((last + j, last + jn, tip_ring + jn, tip_ring + j))
        tip = len(verts)
        verts.append((cx, -cz, t * H + 1.9))
        for j in range(NP):
            jn = (j + 1) % NP
            faces.append((tip_ring + j, tip_ring + jn, tip))
        cx, cz, _, _ = ring_centre(T0, side)
        base_c = len(verts)
        verts.append((cx, -cz, T0 * H - 0.5))
        for j in range(NP):
            jn = (j + 1) % NP
            faces.append((jn, j, base_c))
        mesh = bpy.data.meshes.new(f"{key}-{side}")
        mesh.from_pydata(verts, [], faces)
        mesh.validate()
        obj = bpy.data.objects.new(f"{key}-{side}", mesh)
        bpy.context.collection.objects.link(obj)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

    bpy.ops.object.join()
    mono = bpy.context.active_object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

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
    for m in list(mono.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    try:
        bpy.ops.object.shade_auto_smooth(angle=0.62)
    except Exception:
        bpy.ops.object.shade_smooth()
    return mono


for key, params in CANDIDATES.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mono = build_candidate(key, params)

    bpy.ops.mesh.primitive_plane_add(size=1400, location=(0, 0, -1.2))
    ground = bpy.context.active_object

    matg = bpy.data.materials.new("Grey")
    matg.use_nodes = True
    bsdf = matg.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.16, 0.16, 0.17, 1)
    bsdf.inputs["Roughness"].default_value = 0.5
    mono.data.materials.append(matg)
    ground.data.materials.append(matg)

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
    sc.render.resolution_x = 560
    sc.render.resolution_y = 800
    try:
        sc.cycles.device = "GPU"
    except Exception:
        pass

    for name, loc, tz in [
        ("front", (0, -300, 14), 95),
        ("threequarter", (185, -235, 40), 95),
        ("crown", (0, -95, 175), 172),
    ]:
        cam.location = loc
        target.location = (0, 0, tz)
        sc.render.filepath = os.path.join(OUT, f"{key}-{name}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", sc.render.filepath)

print("CONTACT SHEET DONE ->", OUT)
