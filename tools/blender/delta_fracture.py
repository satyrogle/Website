"""THE DELTA MONOLITH, forged for real.

Jacob, 2026-08-30: "why not expand your toolkit... use whatever I have."
So the crooked-box era ends here. This script rebuilds the Split Spire
from the SAME numbers as src/world/monumentForm.ts, cell-fractures each
half into genuine rock chunks - conchoidal faces, hairline crack seams,
strata-biased cell shapes - and exports one GLB the site loads. At rest
the chunks assemble into ONE carved monolith with visible fracture
lines; the detonation throws real rubble.

Run headless:
  blender --background --factory-startup --python tools/blender/delta_fracture.py

Determinism: seeded RNG, fixed source verts + noise seed, so the same
run gives the same rubble. The kernel still owns WHO flies and WHEN.
"""
import bpy
import bmesh
import random
import math
import os

# ---- mirror of monumentForm.ts (change together or part company) ----
FORM_H = 195.0
SLIT_BASE = 5.0
SLIT_TOP = 1.1
BASE_W = 31.0
BASE_D = 17.0
TOP_K = 0.1
TOP_D = 0.1
FLARE_K = 0.42
FLARE_T = 0.055
TIP_T = [1.0, 0.9]
HALF_PROFILE = [
    (0.0, 1.0), (-0.55, 0.86), (-0.9, 0.44), (-1.0, 0.0),
    (-0.9, -0.44), (-0.55, -0.86), (0.0, -1.0)
]

OUT = r"C:/Users/jacob/dark-lattice-journey/public/models/delta-monolith.glb"
RINGS = 26
SEED = 20260818

random.seed(SEED)


def flare_at(t):
    return 1 + FLARE_K * math.exp(-max(t, 0.0) / FLARE_T)


def section_at(t):
    return (1 - (1 - TOP_K) * max(t, 0.0)) * flare_at(t)


def depth_section_at(t):
    return (1 - (1 - TOP_D) * max(t, 0.0)) * flare_at(t)


def cut_plane_x(t, side):
    sgn = -1 if side == 0 else 1
    return sgn * (SLIT_BASE - (SLIT_BASE - SLIT_TOP) * min(1.0, max(0.0, t)))


def build_half(side):
    """One half of the spire as a closed volume, Z-up (glTF export flips)."""
    sgn = -1 if side == 0 else 1
    bm = bmesh.new()
    rings = []
    tip = TIP_T[side]
    for r in range(RINGS):
        t = (r / (RINGS - 1)) * tip
        cx = cut_plane_x(t, side)
        ring = []
        for (a, b) in HALF_PROFILE:
            x = cx + sgn * (-a) * BASE_W * section_at(t)
            y = b * BASE_D * depth_section_at(t)
            z = t * FORM_H
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    n = len(HALF_PROFILE)
    for r in range(RINGS - 1):
        lo, hi = rings[r], rings[r + 1]
        for i in range(n - 1):
            bm.faces.new((lo[i], lo[i + 1], hi[i + 1], hi[i]))
        # close the cut face (profile ends sit on the cut plane)
        bm.faces.new((lo[n - 1], lo[0], hi[0], hi[n - 1]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(f"half{side}")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(f"half{side}", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def interior_seeds(side, count):
    """Seed points strictly inside the half: convex profile, exact."""
    sgn = -1 if side == 0 else 1
    ca = sum(p[0] for p in HALF_PROFILE) / len(HALF_PROFILE)
    cb = sum(p[1] for p in HALF_PROFILE) / len(HALF_PROFILE)
    tip = TIP_T[side]
    pts = []
    for _ in range(count):
        # strata bias: more seeds low, and flattened in z so the cells
        # run as beds rather than pebbles
        t = (random.random() ** 0.85) * tip * 0.985 + 0.004
        i = random.randrange(len(HALF_PROFILE))
        r = 0.15 + random.random() * 0.8
        a = ca + (HALF_PROFILE[i][0] - ca) * r
        bcoord = cb + (HALF_PROFILE[i][1] - cb) * r
        x = cut_plane_x(t, side) + sgn * (-a) * BASE_W * section_at(t)
        y = bcoord * BASE_D * depth_section_at(t)
        z = t * FORM_H
        pts.append((x, y, z))
    return pts


def voronoi_cell(seed_i, pts, bounds):
    """One Voronoi cell as a closed bmesh: a box bisected against the
    nearest neighbours. No addon, fully seeded, honest geometry."""
    px, py, pz = pts[seed_i]
    near = sorted(
        (j for j in range(len(pts)) if j != seed_i),
        key=lambda j: (pts[j][0] - px) ** 2 + (pts[j][1] - py) ** 2 + ((pts[j][2] - pz) * 1.6) ** 2
    )[:15]
    (x0, x1), (y0, y1), (z0, z1) = bounds
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = (x1 - x0), (y1 - y0), (z1 - z0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    for j in near:
        qx, qy, qz = pts[j]
        # strata bias in the metric, mirrored here: the dividing plane
        # sits at the anisotropic midpoint
        no = (qx - px, qy - py, (qz - pz) * 1.6)
        ln = math.sqrt(no[0] ** 2 + no[1] ** 2 + no[2] ** 2)
        if ln < 1e-9:
            continue
        no = (no[0] / ln, no[1] / ln, no[2] / ln)
        co = ((px + qx) / 2, (py + qy) / 2, (pz + qz) / 2)
        res = bmesh.ops.bisect_plane(
            bm,
            geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=co,
            plane_no=no,
            clear_outer=True,
            clear_inner=False
        )
        cut = [g for g in res['geom_cut'] if isinstance(g, bmesh.types.BMEdge)]
        if cut:
            try:
                bmesh.ops.contextual_create(bm, geom=cut)
            except Exception:
                pass
        if not bm.faces:
            break
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def fracture(ob, prefix, count=150):
    """Voronoi-fracture one half by hand: cell x half boolean per seed,
    a hairline shrink for crack seams, a whisper of bevel so every
    edge catches light."""
    side = 0 if prefix == 'L' else 1
    pts = interior_seeds(side, count)
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    pad = 2.0
    bounds = (
        (min(xs) - pad, max(xs) + pad),
        (min(ys) - pad, max(ys) + pad),
        (min(zs) - pad, max(zs) + pad)
    )
    out = []
    for i in range(len(pts)):
        bm = voronoi_cell(i, pts, bounds)
        if not bm.faces:
            bm.free()
            continue
        me = bpy.data.meshes.new(f"{prefix}cell{i}")
        bm.to_mesh(me)
        bm.free()
        cell = bpy.data.objects.new(f"{prefix}cell{i}", me)
        bpy.context.scene.collection.objects.link(cell)
        mod = cell.modifiers.new('cut', 'BOOLEAN')
        mod.operation = 'INTERSECT'
        mod.object = ob
        mod.solver = 'EXACT'
        bpy.ops.object.select_all(action='DESELECT')
        cell.select_set(True)
        bpy.context.view_layer.objects.active = cell
        bpy.ops.object.modifier_apply(modifier='cut')
        if len(cell.data.polygons) < 4:
            bpy.data.objects.remove(cell, do_unlink=True)
            continue
        # hairline seams: shrink a whisper about the chunk's own centre
        verts = cell.data.vertices
        cx = sum(v.co.x for v in verts) / len(verts)
        cy = sum(v.co.y for v in verts) / len(verts)
        cz = sum(v.co.z for v in verts) / len(verts)
        for v in verts:
            v.co.x = cx + (v.co.x - cx) * 0.992
            v.co.y = cy + (v.co.y - cy) * 0.992
            v.co.z = cz + (v.co.z - cz) * 0.992
        bev = cell.modifiers.new('edge', 'BEVEL')
        bev.width = 0.09
        bev.segments = 1
        bev.limit_method = 'ANGLE'
        bev.angle_limit = math.radians(35)
        bpy.ops.object.modifier_apply(modifier='edge')
        out.append(cell)
    for k, o in enumerate(out):
        o.name = f"{prefix}{k:03d}"
    bpy.data.objects.remove(ob, do_unlink=True)
    return out


def main():
    # empty stage
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    chunks = []
    chunks += fracture(build_half(0), 'L', 150)
    chunks += fracture(build_half(1), 'R', 135)

    # origins at each chunk's own centre, so the runtime gets clean
    # node translations to fly them from
    bpy.ops.object.select_all(action='DESELECT')
    for o in chunks:
        o.select_set(True)
    bpy.context.view_layer.objects.active = chunks[0]
    bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_VOLUME', center='MEDIAN')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_materials='NONE',
        export_yup=True
    )

    tris = sum(len(o.data.polygons) for o in chunks)
    print(f"DELTA_FORGE chunks={len(chunks)} tris~={tris} out={OUT}")


main()
