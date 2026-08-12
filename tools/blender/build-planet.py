"""
build-planet.py — one dying planet, shattered into its own parts. v3.

Run headless:

    blender --background --factory-startup --python tools/blender/build-planet.py

Writes `public/models/planet.glb` and `public/models/planet-manifest.json`.

The v3 rule, from Jacob, verbatim in docs/HERO_DIRECTION.md: the five hero
slabs and the surviving body must derive from ONE common fractured planet. A
viewer looking at a detached slab should be able to mentally place it back
into the missing region. v2 generated the slabs as independent curved patches
beside the body — curvature alone does not make something planetary, and five
smooth convex shields never fitted anything.

So the pipeline is now literally his diagram:

    icosphere
      -> large-scale displacement          (continents, silhouette)
      -> medium geological displacement    (ridges, cliffs — ridged fbm)
      -> micro roughness
      -> solidify                          (real shell thickness)
      -> five wound cutters on the blast hemisphere, each used twice:
           slab_i = INTERSECT(shell copy, cutter_i)   the piece
           body   = DIFFERENCE(body, cutter_i)        the hole it left
      -> crust marking from the shared surface function
      -> export body + slabs + chunks + cracks, plus the manifest

Because the slab and its wound are cut by the same volume from the same
displaced shell, the fit is exact by construction. The staging numbers — stop
displacements, laterals, corridor — are unchanged from v2, so the approved
camera rail and wide composition are untouched.

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
# Parameters
# --------------------------------------------------------------------------

SEED = 20260812

BODY_RADIUS = 4.6
CRUST_THICKNESS = 0.72
CORE_RADIUS = 3.55

#: Subdivision of the master shell. Six holds the meso ridges; five loses them.
SUBDIV = 6

#: The five wounds/slabs: angular size, corridor displacement, laterals.
#: Same staging numbers as v2 — the rail and the wide reveal are approved.
SLABS = (
    {"ang": 0.68, "disp": 3.0, "a": 0.35, "b": 0.65},
    {"ang": 0.58, "disp": 6.6, "a": -1.55, "b": -1.10},
    {"ang": 0.46, "disp": 10.4, "a": 2.45, "b": -2.20},
    {"ang": 0.39, "disp": 14.0, "a": -3.05, "b": 2.35},
    {"ang": 0.34, "disp": 18.0, "a": 4.15, "b": 1.45},
)

#: Medium debris distances. Laterals are drawn wider than v2 so the corridor
#: reads as a volume the camera threads, not a conveyor belt of chunks.
MEDIUM_T = (5.8, 7.0, 8.5, 9.8, 11.2, 12.5, 13.7, 15.0,
            16.4, 17.8, 19.2, 20.5, 22.0, 23.8, 25.2, 27.0)

OUT_GLB = os.path.join('public', 'models', 'planet.glb')
OUT_MANIFEST = os.path.join('public', 'models', 'planet-manifest.json')

RNG = np.random.default_rng(SEED)


# --------------------------------------------------------------------------
# Helpers
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


def radius_at(direction):
    """
    The planet's surface, as one function used twice: to displace the shell's
    vertices and to decide, after the booleans have destroyed face identity,
    whether a face sits on the original exterior. Three scales, big structure
    first — geology, not noise:

      macro   continents and the torn silhouette
      meso    ridge systems — ridged fbm, so crests are sharp and valleys wide
      micro   weathered roughness
    """
    d = unit(direction)
    macro = 0.085 * fbm(d * 1.15, SEED + 11, octaves=3)
    ridged = 1.0 - abs(fbm(d * 3.9, SEED + 23, octaves=4))
    meso = 0.042 * (ridged ** 2.2 - 0.5)
    micro = 0.011 * fbm(d * 11.0, SEED + 37, octaves=3)
    return BODY_RADIUS * (1.0 + macro + meso + micro)


def displace(obj):
    for vert in obj.data.vertices:
        d = Vector(vert.co).normalized()
        vert.co = d * radius_at(np.array(d[:]))


def mark_crust(obj, tolerance=0.965):
    """
    Crust on faces that still lie on the original exterior; everything the
    break exposed — cut walls, the solidify lining, wound rims — burns. The
    exterior is recognised against `radius_at`, which is exact because it is
    the same function that displaced the shell.
    """
    mesh = obj.data
    attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')
    for poly in mesh.polygons:
        centre = Vector(poly.center)
        direction = centre.normalized()
        surface = radius_at(np.array(direction[:]))
        outward = poly.normal.dot(direction)
        is_crust = centre.length > surface * tolerance and outward > 0.2
        value = 1.0 if is_crust else 0.0
        for loop_index in poly.loop_indices:
            attribute.data[loop_index].color = (value, value, value, 1.0)
        poly.use_smooth = True


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_boolean(target, cutter, operation):
    modifier = target.modifiers.new('B', 'BOOLEAN')
    modifier.operation = operation
    modifier.object = cutter
    if hasattr(modifier, 'solver'):
        modifier.solver = 'EXACT'
    select_only(target)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def irregular_cutter(centre, extent, seed):
    """A jittered convex block — a bite, not a machined socket."""
    rng = np.random.default_rng(seed)
    base = np.array([
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ], dtype=float)
    verts = (base + rng.uniform(-0.16, 0.16, size=base.shape)) * extent
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    mesh = bpy.data.meshes.new('CUTTER_MESH')
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new('CUTTER', mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = tuple(float(x) for x in centre)
    # Tilted, so no cut face aligns with anything.
    axis = unit(rng.normal(size=3))
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Quaternion(Vector(tuple(axis)), float(rng.uniform(-0.5, 0.5)))
    return obj


def duplicate(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    bpy.context.collection.objects.link(copy)
    return copy


def recentre(obj):
    mesh = obj.data
    centre = Vector((0, 0, 0))
    for vert in mesh.vertices:
        centre += vert.co
    centre /= max(len(mesh.vertices), 1)
    for vert in mesh.vertices:
        vert.co -= centre
    return np.array(centre[:])


# --------------------------------------------------------------------------
# The planet, and its parts
# --------------------------------------------------------------------------

def build_master_shell():
    """One displaced, solidified world. Everything else is cut from this."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=SUBDIV, radius=BODY_RADIUS)
    shell = bpy.context.active_object
    shell.name = 'MASTER_SHELL'
    displace(shell)

    modifier = shell.modifiers.new('SHELL', 'SOLIDIFY')
    modifier.thickness = CRUST_THICKNESS
    modifier.offset = -1.0  # inward: the outer surface stays the real surface
    select_only(shell)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return shell


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    axis = np.array([1.0, 0.0, 0.0])
    u, v = tangent_basis(axis)

    offsets = ((0.44, 0.34), (-0.48, -0.18), (0.16, -0.52), (-0.18, 0.56), (0.52, 0.02))
    slab_dirs = []
    for i, slab in enumerate(SLABS):
        a, b = offsets[i]
        slab_dirs.append((unit(axis + a * u + b * v), slab))

    shell = build_master_shell()

    manifest = {
        'bodyRadius': BODY_RADIUS,
        'coreRadius': CORE_RADIUS,
        'axis': [1.0, 0.0, 0.0],
        'stops': [],
        'mediums': [],
    }

    # Extract each slab with the same cutter that wounds the body, so the
    # piece and the hole are complements by construction — the fit the whole
    # reveal depends on.
    slabs = []
    for i, (direction, slab) in enumerate(slab_dirs):
        centre = direction * (BODY_RADIUS * 0.99)
        size = BODY_RADIUS * slab['ang'] * np.array([0.92, 0.74, 0.86])
        size = np.maximum(size, 1.9)
        cutter = irregular_cutter(centre, size, SEED + 404 + i * 17)

        piece = duplicate(shell, f'slab_{i:02d}')
        apply_boolean(piece, cutter, 'INTERSECT')
        apply_boolean(shell, cutter, 'DIFFERENCE')
        bpy.data.objects.remove(cutter, do_unlink=True)

        if len(piece.data.polygons) < 8:
            bpy.data.objects.remove(piece, do_unlink=True)
            continue
        slabs.append((piece, slab))

    shell.name = 'body'
    mark_crust(shell)

    for piece, slab in slabs:
        mark_crust(piece)
        centre = recentre(piece)
        position = axis * slab['disp'] + u * slab['a'] + v * slab['b'] + centre
        piece.location = tuple(float(x) for x in position)
        spin = unit(RNG.normal(size=3))
        piece.rotation_mode = 'QUATERNION'
        piece.rotation_quaternion = Quaternion(Vector(tuple(spin)), float(RNG.uniform(-0.3, 0.3)))

        extent = max((Vector(w.co).length for w in piece.data.vertices), default=1.0)
        manifest['stops'].append({
            'name': piece.name,
            'position': [float(x) for x in position],
            'extent': float(extent),
        })

    # ---------------------------------------------------------------- mediums
    #
    # Secondary debris stays procedural, as permitted — but it is carved from
    # a displaced crust ball with the same radius language, and it obeys the
    # same material rule: crust outside, heat only on the cut.
    chunks = carve_chunks(len(MEDIUM_T))
    for i, t in enumerate(MEDIUM_T):
        if i >= len(chunks):
            break
        obj = chunks[i]
        # Wider and taller than v2: a volume, not a queue.
        cone = 0.75 + 0.17 * t
        theta = float(RNG.uniform(0, math.tau))
        radial = cone * float(RNG.uniform(0.15, 1.3))
        position = (axis * t
                    + u * (math.cos(theta) * radial)
                    + v * (math.sin(theta) * radial + float(RNG.normal(0.1, 0.5))))
        obj.location = tuple(float(x) for x in position)
        scale = float(RNG.uniform(0.4, 1.25)) * (1.1 - 0.012 * min(t, 25.0))
        obj.scale = (scale, scale, scale)
        spin = unit(RNG.normal(size=3))
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = Quaternion(Vector(tuple(spin)), float(RNG.uniform(-math.pi, math.pi)))

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

    with open(OUT_MANIFEST, 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, indent=2)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    total = sum(len(o.data.polygons) for o in meshes)
    crust_faces = 0
    hot_faces = 0
    for o in meshes:
        attr = o.data.color_attributes.get('crust')
        if attr is None:
            continue
        for poly in o.data.polygons:
            if attr.data[poly.loop_indices[0]].color[0] > 0.5:
                crust_faces += 1
            else:
                hot_faces += 1
    print(f'PLANET_OBJECTS {len(meshes)}')
    print(f'PLANET_FACES {total}')
    print(f'PLANET_CRUST_RATIO {crust_faces / max(crust_faces + hot_faces, 1):.2f}')
    print(f'PLANET_OUT {OUT_GLB}')
    print(f'PLANET_MANIFEST {OUT_MANIFEST}')


# --------------------------------------------------------------------------
# Mediums and cracks (carried from v2, same material rule)
# --------------------------------------------------------------------------

def carve_chunks(count):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1.35)
    source = bpy.context.active_object
    source.name = 'CHUNK_SOURCE'
    for vert in source.data.vertices:
        d = Vector(vert.co).normalized()
        n = 0.11 * fbm(np.array(d[:]), SEED + 77) + 0.04 * fbm(np.array(d[:]) * 4.0, SEED + 78)
        vert.co = d * 1.35 * (1.0 + n)

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


def crack_tubes(count=11):
    rng = np.random.default_rng(SEED + 505)
    axis = np.array([1.0, 0.0, 0.0])

    for ci in range(count):
        current = unit(axis + rng.normal(0.0, 0.32, size=3))
        points = []
        for _ in range(int(rng.integers(7, 13))):
            u, v = tangent_basis(current)
            step = u * rng.normal(0.03, 0.11) + v * rng.normal(0.03, 0.11)
            current = unit(current + step)
            points.append(current * (radius_at(current) * 1.004))
        if len(points) < 3:
            continue

        curve = bpy.data.curves.new(f'crack_{ci:02d}', 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = 0.022 + float(rng.uniform(0.0, 0.016))
        curve.bevel_resolution = 2
        spline = curve.splines.new('POLY')
        spline.points.add(len(points) - 1)
        for k, p in enumerate(points):
            spline.points[k].co = (float(p[0]), float(p[1]), float(p[2]), 1.0)

        obj = bpy.data.objects.new(f'crack_{ci:02d}', curve)
        bpy.context.collection.objects.link(obj)

        select_only(obj)
        bpy.ops.object.convert(target='MESH')
        obj = bpy.context.active_object
        if not obj.data.polygons:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue

        attribute = obj.data.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')
        for poly in obj.data.polygons:
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = (0.0, 0.0, 0.0, 1.0)
            poly.use_smooth = True


if __name__ == '__main__':
    main()
