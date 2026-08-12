"""
build-planet.py — the ruptured world, authored.

Run headless:

    blender --background --factory-startup --python tools/blender/build-planet.py

Writes `public/models/planet.glb`.

Why this exists
---------------
Procedural primitives have produced, in order: ribbons that read as a cutting
board, lamellae that read as anatomy, an implicit field that read as skin
disease, and fragments that read as gridded boxes. A dying planet is a *form*
problem and we know what the form should be, so the form is authored and the
code does what code is good at — placement, drift, the scroll rail, the
shader, the flare.

What it builds
--------------
One displaced sphere — real crustal relief from layered noise, no lattice
anywhere near it — cut into Voronoi cells by bisecting planes. Every cell is
a solid piece with genuine thickness, so a fragment exposes kilometres of
cross-section when it turns.

Cells are seeded in three tiers so the debris has hierarchy rather than one
uniform size: a few continent-scale slabs, a band of major chunks, and a
crowd of smaller ejecta.

Each vertex carries a `crust` attribute: 1 on the original planetary surface,
0 on a face that was made by the break. That single float is what lets the
shader put light *only* in the fractures and keep every exterior surface
nearly black — the fault the founder named as most damaging.

Deterministic: seeded, no `random` module, same mesh every run.
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# --------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------

SEED = 20260812
RADIUS = 1.0
SUBDIVISIONS = 6

#: Crustal relief, as a fraction of radius. Layered so there are broad
#: highlands and fine roughness, and no single frequency to recognise.
RELIEF = (
    (1.7, 0.075),
    (3.1, 0.038),
    (6.7, 0.019),
    (13.3, 0.010),
)

#: Cell seeds per tier: (count, radial band low, radial band high, jitter).
#: Continent slabs sit shallow and wide; the small tier crowds the rupture
#: face so the body is most comprehensively destroyed where it blew out.
TIERS = (
    (4, 0.30, 0.62, 0.55),
    (14, 0.35, 0.80, 0.75),
    (26, 0.45, 0.95, 0.95),
)

#: Which way the rupture faces. Small tier density is biased toward it.
RUPTURE = Vector((0.62, 0.18, -0.76)).normalized()

OUT = os.path.join('public', 'models', 'planet.glb')


# --------------------------------------------------------------------------
# Deterministic helpers
# --------------------------------------------------------------------------

def rng(state):
    """mulberry32, so the mesh matches whatever else uses this seed."""
    def nxt():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = state[0]
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return (((t ^ (t >> 14)) & 0xFFFFFFFF)) / 4294967296.0
    return nxt


def relief_at(direction):
    """Radius of the original crust along a unit direction."""
    r = RADIUS
    for freq, amp in RELIEF:
        r += amp * RADIUS * (
            math.sin(direction.x * freq + 1.7) * math.cos(direction.y * freq * 1.3 - 0.6)
            + math.sin(direction.y * freq * 0.9 + 2.1) * math.cos(direction.z * freq - 1.1)
            + math.sin(direction.z * freq * 1.2 - 0.4) * math.cos(direction.x * freq * 1.1 + 0.8)
        ) / 3.0
    return r


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_planet():
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=SUBDIVISIONS, radius=RADIUS)
    obj = bpy.context.active_object
    obj.name = 'planet_source'

    mesh = obj.data
    for vert in mesh.vertices:
        direction = Vector(vert.co).normalized()
        vert.co = direction * relief_at(direction)
    return obj


def seed_points(rand):
    """Cell seeds, in three size tiers, biased toward the rupture face."""
    points = []
    for count, low, high, jitter in TIERS:
        for _ in range(count):
            # A direction on the sphere, from two uniforms — no polar banding.
            z = rand() * 2.0 - 1.0
            a = rand() * math.tau
            s = math.sqrt(max(1.0 - z * z, 0.0))
            direction = Vector((s * math.cos(a), s * math.sin(a), z))

            # The smallest tier crowds the blown-open face: the body is most
            # thoroughly destroyed where it failed.
            if jitter > 0.9 and direction.dot(RUPTURE) < 0.1 and rand() < 0.55:
                direction = (direction + RUPTURE * 1.4).normalized()

            depth = low + (high - low) * rand()
            wobble = Vector((rand() - 0.5, rand() - 0.5, rand() - 0.5)) * jitter * 0.18
            points.append(direction * depth * RADIUS + wobble)
    return points


def carve(source, points):
    """One convex Voronoi cell per seed, cut out of the planet by bisection."""
    made = []

    for index, seed in enumerate(points):
        bm = bmesh.new()
        bm.from_mesh(source.data)

        # Only the nearest neighbours matter: a plane against a distant seed
        # never touches this cell, and every extra bisect costs geometry.
        others = sorted(points, key=lambda q: (q - seed).length_squared)[1:15]

        for other in others:
            normal = other - seed
            if normal.length < 1e-6:
                continue
            normal.normalize()
            midpoint = (seed + other) * 0.5
            bmesh.ops.bisect_plane(
                bm,
                geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                plane_co=midpoint,
                plane_no=normal,
                clear_outer=True,
            )
            if not bm.faces:
                break

        if len(bm.faces) < 4:
            bm.free()
            continue

        # The bisections leave the cut open; cap it, and those caps are exactly
        # the fresh break surfaces.
        bmesh.ops.holes_fill(bm, edges=bm.edges[:])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

        mesh = bpy.data.meshes.new(f'fragment_{index:02d}')
        bm.to_mesh(mesh)
        bm.free()

        if not mesh.polygons:
            bpy.data.meshes.remove(mesh)
            continue

        obj = bpy.data.objects.new(f'fragment_{index:02d}', mesh)
        bpy.context.collection.objects.link(obj)
        made.append(obj)

    return made


def mark_crust(obj):
    """
    1 where a vertex is on the original planetary surface, 0 where it is a
    fresh break. The shader reads this and lights only the breaks.
    """
    mesh = obj.data
    attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='POINT')

    for i, vert in enumerate(mesh.vertices):
        position = Vector(vert.co)
        length = position.length
        if length < 1e-6:
            value = 0.0
        else:
            surface = relief_at(position / length)
            # The band must *reach* 1 at the original surface. Centred on it
            # instead, every exterior vertex marked 0.5, so the shader read
            # half a fracture everywhere and the whole world glowed amber —
            # exactly the "everything glows equally" fault this attribute was
            # added to remove.
            value = min(max((length - surface * 0.97) / (surface * 0.03), 0.0), 1.0)
        attribute.data[i].color = (value, value, value, 1.0)


def centre_and_rank(fragments):
    """
    Move each fragment's origin to its own centre and record where on the
    planet it came from. Three.js needs both: the origin so a piece can be
    rotated and thrown, the rest position so the body can be reassembled.
    """
    ranked = []
    for obj in fragments:
        mesh = obj.data
        total = Vector((0.0, 0.0, 0.0))
        for vert in mesh.vertices:
            total += Vector(vert.co)
        centre = total / max(len(mesh.vertices), 1)

        for vert in mesh.vertices:
            vert.co = vert.co - centre

        obj.location = centre

        extent = 0.0
        for vert in mesh.vertices:
            extent = max(extent, Vector(vert.co).length)

        ranked.append((extent, obj))

    ranked.sort(key=lambda pair: pair[0], reverse=True)
    for rank, (extent, obj) in enumerate(ranked):
        obj.name = f'frag_{rank:02d}'
        obj.data.name = f'frag_{rank:02d}'
    return ranked


def main():
    clear()
    rand = rng([SEED])

    source = make_planet()
    points = seed_points(rand)
    fragments = carve(source, points)

    bpy.data.objects.remove(source, do_unlink=True)

    for obj in fragments:
        mark_crust(obj)

    ranked = centre_and_rank(fragments)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_materials='NONE',
        export_yup=True,
    )

    total_tris = sum(len(o.data.polygons) for _, o in ranked)
    print(f'PLANET_FRAGMENTS {len(ranked)}')
    print(f'PLANET_FACES {total_tris}')
    print('PLANET_EXTENTS ' + ' '.join(f'{e:.3f}' for e, _ in ranked[:8]))
    print(f'PLANET_OUT {OUT}')


if __name__ == '__main__':
    main()
