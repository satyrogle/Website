"""
build-planet.py — the ruptured world, authored. v2.

Run headless:

    blender --background --factory-startup --python tools/blender/build-planet.py

Writes `public/models/planet.glb` and `public/models/planet-manifest.json`.

v2 adopts the architecture of Jacob's reference script
(`ruptured_planet_scene.py`, GPT-authored, 2026-08-12), which was right about
the three things the previous build got wrong:

  - the five hero slabs are CURVED SHELL PATCHES that keep the planet's own
    curvature, so each one visibly came off that specific ball — a Voronoi
    chunk is just a rock;
  - the body is a THICK HOLLOWED SHELL with wound-holes cut into the blast
    hemisphere and a separate incandescent core inside, so the source light is
    shaped by occlusion — pouring out of the wounds — instead of either
    flooding the frame or being buried;
  - the layout is authored once, here, and baked into the file: node
    transforms carry the staging and a JSON manifest carries what the runtime
    needs to know (stops, extents, the corridor axis).

Everything is authored along +X. The runtime rotates the whole group onto the
site's diagonal funnel axis, so no world axis ever aligns with the blast.

Deterministic from SEED. Same file every run.
"""

import bpy
import bmesh
import json
import math
import os
from mathutils import Quaternion, Vector

import numpy as np

# --------------------------------------------------------------------------
# Parameters — world units are final; the runtime uses scale 1.
# --------------------------------------------------------------------------

SEED = 20260812

BODY_RADIUS = 4.6
CRUST_THICKNESS = 0.72
CORE_RADIUS = 3.55

#: The five hero slabs: angular radius on the sphere, displacement down the
#: corridor, lateral offsets. Numbers from the reference script, which spaced
#: them 0.5–3.2 body radii out — near enough to belong, far enough to travel.
SLABS = (
    {"ang": 0.68, "disp": 3.0, "a": 0.35, "b": 0.65},
    {"ang": 0.58, "disp": 6.6, "a": -1.55, "b": -1.10},
    {"ang": 0.46, "disp": 10.4, "a": 2.45, "b": -2.20},
    {"ang": 0.39, "disp": 14.0, "a": -3.05, "b": 2.35},
    {"ang": 0.34, "disp": 18.0, "a": 4.15, "b": 1.45},
)

#: Medium debris rides the same corridor, spread by a widening cone.
MEDIUM_T = (5.8, 7.0, 8.5, 9.8, 11.2, 12.5, 13.7, 15.0,
            16.4, 17.8, 19.2, 20.5, 22.0, 23.8, 25.2, 27.0)

OUT_GLB = os.path.join('public', 'models', 'planet.glb')
OUT_MANIFEST = os.path.join('public', 'models', 'planet-manifest.json')

RNG = np.random.default_rng(SEED)


# --------------------------------------------------------------------------
# Shared helpers
# --------------------------------------------------------------------------

def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else np.array([1.0, 0.0, 0.0])


def tangent_basis(n):
    n = unit(n)
    helper = np.array([0.0, 0.0, 1.0])
    if abs(float(np.dot(n, helper))) > 0.88:
        helper = np.array([0.0, 1.0, 0.0])
    u = unit(np.cross(n, helper))
    v = unit(np.cross(u, n))
    return u, v


_FBM = {}


def fbm(direction, seed, octaves=5):
    basis = _FBM.get(seed)
    if basis is None:
        rng = np.random.default_rng(seed)
        basis = []
        for i in range(octaves):
            vec = unit(rng.normal(size=3))
            basis.append((vec, rng.uniform(0, math.tau), 1.65 * (2.03 ** i), 0.5 ** i))
        _FBM[seed] = basis
    d = unit(direction)
    value = 0.0
    norm = 0.0
    for vec, phase, freq, amp in basis:
        value += amp * math.sin(float(np.dot(d, vec)) * freq * math.pi + phase)
        norm += amp
    return value / max(norm, 1e-6)


def new_object(name, verts, faces, face_crust):
    """A mesh object with a per-corner crust attribute baked from face flags."""
    mesh = bpy.data.meshes.new(name + '_MESH')
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()

    attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')
    for poly, crust in zip(mesh.polygons, face_crust):
        value = 1.0 if crust else 0.0
        for loop_index in poly.loop_indices:
            attribute.data[loop_index].color = (value, value, value, 1.0)
        poly.use_smooth = True

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def mark_crust_by_shape(obj, outer_radius, threshold=0.35):
    """
    Crust for boolean results, where face identity is lost: a face is old
    surface when it sits at the outer radius facing outward. Everything else —
    inner lining, hole rims, cut walls — is exposed interior and burns.
    """
    mesh = obj.data
    attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')
    for poly in mesh.polygons:
        centre = Vector(poly.center)
        radial = centre.normalized()
        outward = poly.normal.dot(radial)
        is_crust = centre.length > outer_radius * 0.94 and outward > threshold
        value = 1.0 if is_crust else 0.0
        for loop_index in poly.loop_indices:
            attribute.data[loop_index].color = (value, value, value, 1.0)
        poly.use_smooth = True


# --------------------------------------------------------------------------
# The body: a thick shell with wounds
# --------------------------------------------------------------------------

def rough_sphere(name, radius, subdivisions, seed, amplitude=0.045):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius)
    obj = bpy.context.active_object
    obj.name = name
    for vert in obj.data.vertices:
        d = Vector(vert.co).normalized()
        n = amplitude * fbm(np.array(d[:]), seed) + amplitude * 0.33 * fbm(np.array(d[:]), seed + 41)
        vert.co = d * radius * (1.0 + n)
    return obj


def apply_boolean(target, cutter):
    modifier = target.modifiers.new('CUT', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'
    modifier.object = cutter
    if hasattr(modifier, 'solver'):
        modifier.solver = 'EXACT'
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def irregular_cutter(centre, extent, seed):
    rng = np.random.default_rng(seed)
    base = np.array([
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ], dtype=float)
    verts = (base + rng.uniform(-0.14, 0.14, size=base.shape)) * extent
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    mesh = bpy.data.meshes.new('CUTTER_MESH')
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new('CUTTER', mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = tuple(float(x) for x in centre)
    return obj


def build_body(slab_dirs):
    """The planet that remains: hollowed, wounded on the blast side."""
    outer = rough_sphere('body', BODY_RADIUS, 4, SEED + 8)

    inner = rough_sphere('INNER_CUT', BODY_RADIUS - CRUST_THICKNESS, 3, SEED + 9, amplitude=0.02)
    apply_boolean(outer, inner)
    bpy.data.objects.remove(inner, do_unlink=True)

    # One wound per slab: the hole that slab tore out of the shell, cut where
    # the slab's source direction meets the surface. The slab that flew is the
    # lid of the hole it left — that correspondence is what makes the debris
    # legible as pieces OF this body.
    for index, (direction, slab) in enumerate(slab_dirs):
        centre = np.array(direction) * (BODY_RADIUS * 0.98)
        size = BODY_RADIUS * slab['ang'] * np.array([0.9, 0.75, 0.85])
        size = np.maximum(size, 1.9)
        cutter = irregular_cutter(centre, size, SEED + 404 + index * 17)
        apply_boolean(outer, cutter)
        bpy.data.objects.remove(cutter, do_unlink=True)

    mark_crust_by_shape(outer, BODY_RADIUS)
    return outer


# --------------------------------------------------------------------------
# The slabs: curved shell patches, ported from the reference script
# --------------------------------------------------------------------------

def shell_patch(name, source_dir, angular_radius, seed, rings=6, segments=22):
    rng = np.random.default_rng(seed)
    n = unit(source_dir)
    u, v = tangent_basis(n)

    boundary = []
    for i in range(segments):
        theta = math.tau * i / segments
        jitter = (0.84
                  + 0.15 * math.sin(theta * 3.0 + rng.uniform(-0.25, 0.25))
                  + 0.08 * math.sin(theta * 7.0 + rng.uniform(-0.3, 0.3))
                  + rng.uniform(-0.035, 0.035))
        boundary.append(max(0.62, jitter) * angular_radius)

    verts = []
    outer_rings = []
    inner_rings = []

    outer_centre = len(verts)
    verts.append(n * BODY_RADIUS * (1.0 + 0.022 * fbm(n, seed + 91)))
    inner_centre = len(verts)
    verts.append(n * (BODY_RADIUS - CRUST_THICKNESS))

    for j in range(1, rings + 1):
        t = j / rings
        out_idx = []
        in_idx = []
        for i in range(segments):
            theta = math.tau * i / segments
            r = boundary[i] * (t ** 0.92)
            tang = math.cos(theta) * u + math.sin(theta) * v
            d = unit(math.cos(r) * n + math.sin(r) * tang)
            rough = 0.035 * fbm(d, seed + 31)
            out_idx.append(len(verts))
            verts.append(d * BODY_RADIUS * (1.0 + rough))
            in_idx.append(len(verts))
            verts.append(d * (BODY_RADIUS - CRUST_THICKNESS) * (1.0 + rough * 0.3))
        outer_rings.append(out_idx)
        inner_rings.append(in_idx)

    faces = []
    crust = []

    r0o, r0i = outer_rings[0], inner_rings[0]
    for i in range(segments):
        ni = (i + 1) % segments
        faces.append((outer_centre, r0o[i], r0o[ni])); crust.append(True)
        faces.append((inner_centre, r0i[ni], r0i[i])); crust.append(False)

    for j in range(rings - 1):
        ao, bo = outer_rings[j], outer_rings[j + 1]
        ai, bi = inner_rings[j], inner_rings[j + 1]
        for i in range(segments):
            ni = (i + 1) % segments
            faces.append((ao[i], bo[i], bo[ni], ao[ni])); crust.append(True)
            faces.append((ai[ni], bi[ni], bi[i], ai[i])); crust.append(False)

    bo, bi = outer_rings[-1], inner_rings[-1]
    for i in range(segments):
        ni = (i + 1) % segments
        faces.append((bo[i], bi[i], bi[ni], bo[ni])); crust.append(False)

    # Vertices are authored about the planet centre so the patch keeps its
    # curvature; recentre on the patch itself so the object can be placed and
    # rotated like a thing that broke off.
    centre = np.mean(np.asarray([np.asarray(w) for w in verts]), axis=0)
    verts = [np.asarray(w) - centre for w in verts]
    obj = new_object(name, verts, faces, crust)
    return obj, centre


# --------------------------------------------------------------------------
# Medium debris: solid Voronoi chunks of crust
# --------------------------------------------------------------------------

def carve_chunks(count):
    """
    Solid chunks carved from a small crust ball, cut capped after every bisect
    so every piece is a closed polyhedron with real cross-sections. Breaks are
    face identity (cap faces), same as everything else in the file.
    """
    source = rough_sphere('CHUNK_SOURCE', 1.35, 4, SEED + 77, amplitude=0.09)
    rng = np.random.default_rng(SEED + 500)
    seeds = [unit(rng.normal(size=3)) * (0.35 + 0.55 * rng.random()) * 1.35 for _ in range(count + 8)]

    chunks = []
    for index, seed_point in enumerate(seeds):
        bm = bmesh.new()
        bm.from_mesh(source.data)

        for other in sorted(seeds, key=lambda q: float(np.linalg.norm(q - seed_point)))[1:12]:
            normal = Vector(tuple(other - seed_point))
            if normal.length < 1e-6:
                continue
            normal.normalize()
            midpoint = Vector(tuple((seed_point + other) * 0.5))
            result = bmesh.ops.bisect_plane(
                bm,
                geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                plane_co=midpoint,
                plane_no=normal,
                clear_outer=True,
            )
            if not bm.verts:
                break
            cut_edges = [g for g in result['geom_cut'] if isinstance(g, bmesh.types.BMEdge)]
            if cut_edges:
                fill = bmesh.ops.edgenet_fill(bm, edges=cut_edges)
                for face in fill.get('faces', []):
                    face.material_index = 1

        if len(bm.faces) < 4:
            bm.free()
            continue

        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        mesh = bpy.data.meshes.new(f'chunk_{index:02d}_MESH')
        bm.to_mesh(mesh)
        bm.free()
        if not mesh.polygons:
            bpy.data.meshes.remove(mesh)
            continue

        attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')
        for poly in mesh.polygons:
            value = 0.0 if poly.material_index == 1 else 1.0
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = (value, value, value, 1.0)
            poly.use_smooth = True

        centre = Vector((0, 0, 0))
        for vert in mesh.vertices:
            centre += vert.co
        centre /= max(len(mesh.vertices), 1)
        for vert in mesh.vertices:
            vert.co -= centre

        obj = bpy.data.objects.new(f'chunk_{index:02d}', mesh)
        bpy.context.collection.objects.link(obj)
        chunks.append(obj)
        if len(chunks) >= count + 6:
            break

    bpy.data.objects.remove(source, do_unlink=True)
    chunks.sort(key=lambda o: -max((Vector(w.co).length for w in o.data.vertices), default=0))
    return chunks


# --------------------------------------------------------------------------
# Cracks: molten seams across the surviving crust
# --------------------------------------------------------------------------

def crack_tubes(count=11):
    """
    Fracture lines wandering out of the blast hemisphere across the body — the
    planet is failing everywhere, not only where it already failed. Thin tube
    meshes with crust=0, so the molten shader lights them.
    """
    rng = np.random.default_rng(SEED + 505)
    axis = np.array([1.0, 0.0, 0.0])

    for ci in range(count):
        current = unit(axis + rng.normal(0.0, 0.32, size=3))
        points = []
        for _ in range(int(rng.integers(7, 13))):
            u, v = tangent_basis(current)
            step = u * rng.normal(0.03, 0.11) + v * rng.normal(0.03, 0.11)
            current = unit(current + step)
            r = BODY_RADIUS * (1.012 + 0.004 * fbm(current, SEED + ci))
            points.append(current * r)
        if len(points) < 3:
            continue

        curve = bpy.data.curves.new(f'crack_{ci:02d}', 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = 0.024 + float(rng.uniform(0.0, 0.02))
        curve.bevel_resolution = 2
        spline = curve.splines.new('POLY')
        spline.points.add(len(points) - 1)
        for k, p in enumerate(points):
            spline.points[k].co = (float(p[0]), float(p[1]), float(p[2]), 1.0)

        obj = bpy.data.objects.new(f'crack_{ci:02d}', curve)
        bpy.context.collection.objects.link(obj)

        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target='MESH')
        obj = bpy.context.active_object

        mesh = obj.data
        if not mesh.polygons:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')
        for poly in mesh.polygons:
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = (0.0, 0.0, 0.0, 1.0)
            poly.use_smooth = True


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    u, v = tangent_basis(np.array([1.0, 0.0, 0.0]))

    # Slab source directions: all on the blast hemisphere, deliberately unequal
    # so the body never reads as four neat quarters.
    offsets = ((0.44, 0.34), (-0.48, -0.18), (0.16, -0.52), (-0.18, 0.56), (0.52, 0.02))
    slab_dirs = []
    for i, slab in enumerate(SLABS):
        a, b = offsets[i]
        direction = unit(np.array([1.0, 0.0, 0.0]) + a * u + b * v)
        slab_dirs.append((direction, slab))

    build_body(slab_dirs)

    manifest = {
        'bodyRadius': BODY_RADIUS,
        'coreRadius': CORE_RADIUS,
        'axis': [1.0, 0.0, 0.0],
        'stops': [],
        'mediums': [],
    }

    for i, (direction, slab) in enumerate(slab_dirs):
        obj, centre = shell_patch(f'slab_{i:02d}', direction, slab['ang'], SEED + 100 + i * 17)
        position = np.array([1.0, 0.0, 0.0]) * slab['disp'] + u * slab['a'] + v * slab['b'] + centre
        obj.location = tuple(float(x) for x in position)
        spin_axis = unit(RNG.normal(size=3))
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = Quaternion(Vector(tuple(spin_axis)), float(RNG.uniform(-0.34, 0.34)))

        extent = max((Vector(w.co).length for w in obj.data.vertices), default=1.0)
        manifest['stops'].append({
            'name': obj.name,
            'position': [float(x) for x in position],
            'extent': float(extent),
        })

    chunks = carve_chunks(len(MEDIUM_T))
    for i, t in enumerate(MEDIUM_T):
        if i >= len(chunks):
            break
        obj = chunks[i]
        cone = 0.55 + 0.145 * t
        theta = float(RNG.uniform(0, math.tau))
        radial = cone * float(RNG.uniform(0.28, 1.05))
        position = (np.array([1.0, 0.0, 0.0]) * t
                    + u * (math.cos(theta) * radial)
                    + v * (math.sin(theta) * radial + float(RNG.normal(0.12, 0.22))))
        obj.location = tuple(float(x) for x in position)
        scale = float(RNG.uniform(0.42, 1.1)) * (1.12 - 0.012 * min(t, 25.0))
        obj.scale = (scale, scale, scale)
        spin_axis = unit(RNG.normal(size=3))
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = Quaternion(Vector(tuple(spin_axis)), float(RNG.uniform(-math.pi, math.pi)))

        extent = scale * max((Vector(w.co).length for w in obj.data.vertices), default=0.5)
        manifest['mediums'].append({
            'name': obj.name,
            'position': [float(x) for x in position],
            'extent': float(extent),
        })

    for obj in chunks[len(MEDIUM_T):]:
        bpy.data.objects.remove(obj, do_unlink=True)

    crack_tubes()

    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_materials='NONE',
        export_yup=True,
    )

    # Manifest positions are Blender world (Z-up). The runtime converts with
    # the same Y-up mapping the exporter used for the nodes: (x, z, -y).
    with open(OUT_MANIFEST, 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, indent=2)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    total = sum(len(o.data.polygons) for o in meshes)
    print(f'PLANET_OBJECTS {len(meshes)}')
    print(f'PLANET_FACES {total}')
    print(f'PLANET_OUT {OUT_GLB}')
    print(f'PLANET_MANIFEST {OUT_MANIFEST}')


if __name__ == '__main__':
    main()
