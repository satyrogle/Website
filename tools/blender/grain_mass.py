"""THE GRAIN — the plain's masses. Four outcomes of one break.

The first plain reused the F3 wall generator with a wobbly outline cut round
it. A wall with a wavy edge is not a rock, and it read as shrubs on a field.

F1 is not one shape with different outlines. It is four different OUTCOMES of
the same process, and the difference between them is how far the break went:

    INTACT     barely went. One crack down it, nothing else moved.
    HINGED     opened into two halves leaning apart, a gap between them.
    SPLINTER   went to standing blades.
    COLLAPSE   went all the way. Plates fanned flat, almost no height left.

Every one is built from the same thing: thin angular slabs of bedded rock,
stacked. Only the arrangement differs. That is what makes them read as one
material behaving four ways rather than four different objects.

Run headless:
  DL_FORM=intact DL_SEED=1234 \
  "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" --background \
    --factory-startup --python tools/blender/grain_mass.py

Determinism: one seeded stream, no clocks. Same seed and form gives a byte
identical vertex list, and the script prints its hash.
"""
import bpy
import bmesh
import hashlib
import math
import os
import random

SEED = int(os.environ.get("DL_SEED", 20260831))
FORM = os.environ.get("DL_FORM", "intact")
FORMS = ("intact", "hinged", "splinter", "collapse")

rng = random.Random(SEED * 7919 + FORMS.index(FORM) * 104729)


def rnd(a, b):
    return a + (b - a) * rng.random()


verts = []
faces = []

# Slate breaks in planes, so every primitive here is angular: flat faces, sharp
# edges, no rounding anywhere. A rounded silhouette is what made the last set
# read as vegetation.


def slab(cx, cy, cz, w, d, h, yaw, tilt_x, tilt_z, taper, rough):
    """One thin angular slab. Corners are jittered so no two edges are parallel
    and nothing reads as a manufactured block."""
    ca, sa = math.cos(yaw), math.sin(yaw)
    pts = []
    for lvl in (0, 1):
        s = 1.0 if lvl == 0 else taper
        ox = tilt_x * lvl
        oz = tilt_z * lvl
        for sx, sz in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
            lx = sx * w * s + ox + rnd(-rough, rough) * w
            lz = sz * d * s + oz + rnd(-rough, rough) * d
            ly = cy + lvl * h + rnd(-rough, rough) * h
            pts.append((cx + lx * ca - lz * sa, ly, cz + lx * sa + lz * ca))
    i = len(verts)
    verts.extend(pts)
    faces.extend([
        (i + 3, i + 2, i + 1, i + 0),
        (i + 4, i + 5, i + 6, i + 7),
        (i + 0, i + 1, i + 5, i + 4),
        (i + 1, i + 2, i + 6, i + 5),
        (i + 2, i + 3, i + 7, i + 6),
        (i + 3, i + 0, i + 4, i + 7),
    ])


def stack(cx, cz, w, d, top, n, yaw, lean_x, lean_z, taper_end, rough=0.05):
    """A column of thin slabs: the bedding, as geometry. Each bed is a slightly
    different size and angle, so the stack has a broken profile rather than a
    smooth taper."""
    y = 0.0
    for k in range(n):
        t = k / max(n - 1, 1)
        th = (top / n) * rnd(0.80, 1.25)
        sc = 1.0 - (1.0 - taper_end) * (t ** 1.25)
        slab(
            cx + lean_x * t + rnd(-0.18, 0.18),
            y,
            cz + lean_z * t + rnd(-0.18, 0.18),
            w * sc * rnd(0.86, 1.14),
            d * sc * rnd(0.86, 1.14),
            th,
            yaw + rnd(-0.16, 0.16),
            rnd(-0.9, 0.9),
            rnd(-0.9, 0.9),
            rnd(0.80, 0.98),
            rough,
        )
        y += th * rnd(0.88, 1.0)


def debris(cx, cz, spread, n, size):
    """Every mass made its own. Plates pool at the base and thin outward."""
    for _ in range(n):
        a = rnd(0, math.tau)
        r = spread * (rng.random() ** 0.55)
        slab(
            cx + math.cos(a) * r,
            rnd(-0.1, 0.5),
            cz + math.sin(a) * r,
            size * rnd(0.5, 1.5),
            size * rnd(0.35, 1.0),
            size * rnd(0.05, 0.16),
            rnd(0, math.tau),
            rnd(-0.4, 0.4),
            rnd(-0.4, 0.4),
            rnd(0.7, 1.0),
            0.09,
        )


def build_intact():
    """Barely went. Tall, whole, one crack down it and nothing else moved."""
    h = rnd(22.0, 31.0)
    w = rnd(10.0, 14.0)
    gap = rnd(0.25, 0.6)
    yaw = rnd(0, math.tau)
    # the crack: the mass is one thing, split by a hairline that has not opened
    for side in (-1, 1):
        stack(math.cos(yaw) * side * (w * 0.25 + gap * 0.5), math.sin(yaw) * side * (w * 0.25 + gap * 0.5),
              w * 0.5, rnd(7.0, 10.0), h, int(rnd(4, 7)), yaw,
              rnd(-0.8, 0.8), rnd(-0.8, 0.8), rnd(0.58, 0.78))
    debris(0, 0, w * 1.1, 12, 2.2)


def build_hinged():
    """Opened into two halves leaning apart, a gap you can see between them."""
    h = rnd(18.0, 25.0)
    w = rnd(8.0, 11.0)
    yaw = rnd(0, math.tau)
    lean = rnd(3.0, 6.0)
    for side in (-1, 1):
        ox = math.cos(yaw) * side * w * 0.42
        oz = math.sin(yaw) * side * w * 0.42
        stack(ox, oz, w, rnd(6.5, 9.5), h * rnd(0.82, 1.0),
              int(rnd(3, 6)), yaw + rnd(-0.2, 0.2),
              math.cos(yaw) * side * lean, math.sin(yaw) * side * lean,
              rnd(0.42, 0.62))
    debris(0, 0, w * 1.5, 14, 2.4)


def build_splinter():
    """Went to standing blades."""
    n = int(rnd(4, 8))
    base = rnd(4.5, 8.0)
    for _ in range(n):
        a = rnd(0, math.tau)
        r = base * (rng.random() ** 0.6)
        h = rnd(13.0, 29.0)
        stack(math.cos(a) * r, math.sin(a) * r,
              rnd(2.2, 4.2), rnd(2.0, 3.8), h,
              int(rnd(3, 6)), rnd(0, math.tau),
              rnd(-1.6, 1.6), rnd(-1.6, 1.6), rnd(0.14, 0.34))
    debris(0, 0, base * 2.0, 14, 2.2)


def build_collapse():
    """Went all the way. Plates fanned flat, almost no height left."""
    n = int(rnd(6, 11))
    spread = rnd(9.0, 15.0)
    for _ in range(n):
        a = rnd(0, math.tau)
        r = spread * (rng.random() ** 0.5)
        slab(math.cos(a) * r, rnd(-0.2, 1.6), math.sin(a) * r,
             rnd(6.0, 13.0), rnd(3.5, 8.0), rnd(0.5, 1.6),
             a + rnd(-0.7, 0.7), rnd(-1.2, 1.2), rnd(-1.2, 1.2),
             rnd(0.7, 1.0), 0.07)
    debris(0, 0, spread * 1.3, 16, 2.4)


BUILDERS = {
    "intact": build_intact,
    "hinged": build_hinged,
    "splinter": build_splinter,
    "collapse": build_collapse,
}


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    BUILDERS[FORM]()

    me = bpy.data.meshes.new(f"mass_{FORM}")
    me.from_pydata(verts, [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False

    ob = bpy.data.objects.new(f"mass_{FORM}", me)
    bpy.context.collection.objects.link(ob)
    for o in bpy.data.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob

    out = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "public", "models"))
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, f"mass-{FORM}-{SEED}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_normals=True, export_texcoords=False,
        export_materials="NONE", export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=13,
        export_draco_normal_quantization=9)

    gh = hashlib.sha256(
        repr([tuple(round(c, 6) for c in v) for v in verts]).encode()).hexdigest()
    mb = os.path.getsize(path) / 1e6
    print(f"GEOMETRY_SHA {gh[:20]}  {FORM}-{SEED}  faces={len(faces)}  {mb:.2f} MB")


if __name__ == "__main__":
    main()
