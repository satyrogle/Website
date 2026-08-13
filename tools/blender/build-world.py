"""
build-world.py — a world fractured through its full volume. Phase 1 blockout.

Run headless:

    blender --background --factory-startup --python tools/blender/build-world.py
    blender --background --factory-startup --python tools/blender/build-world.py -- --render

Writes `public/models/world-macro.glb` and `public/models/world-macro-manifest.json`,
and with `--render`, three neutral diagnostics into `captures/world/`.

PARALLEL EXPERIMENT. Nothing here is loaded by the site. `planet.glb` and the
live hero are untouched, and stay untouched until this geometry passes.

  BLOCKOUT ONLY. No materials, no emission, no debris, no bloom. Neutral
  greys. The single question is whether the geometry reads.

WHY THE FIRST BLOCKOUT FAILED, and what replaces it.

v1 partitioned space with flat bisector planes and then displaced the
resulting Boolean vertices to give the walls character. Two faults followed
from that, and both were fatal:

  * Cutting with planes produces planar fracture faces. Pieces came out as
    convex wedges with giant flat walls, plus one C-shaped arc wrapping the
    former volume — geode, not fracture.
  * Displacing Boolean output stretches it. A Boolean returns each wall as a
    few large n-gons whose border is a fine zigzag inherited from the
    triangulated exterior; subdividing and pushing that around printed the
    zigzag inward as a comb of stretched fans.

So the fracture character now exists in the CUTTER, before any Boolean, and
nothing displaces a Boolean result afterwards. For every neighbouring pair
of regions one dense interface sheet is built on their bisector, domain
warped into a geological surface — broad bend and shear, secondary cliffs
and shelves, restrained fine breakup — and closed into a manifold solid.
The SAME sheet, extruded to either side, forms both complementary
fragments, so the two walls of a break match by construction.

    solid master world, geology authored once before any cut
      -> 8 interior seeds; a power diagram whose weights are tuned by Monte
         Carlo until the mass distribution hits its targets
      -> one warped interface per neighbouring pair, shared by both sides
      -> each region = intersection of its half-solids with the master
      -> outward transforms: radial everywhere, blast lobe, strong Z spread
      -> three neutral diagnostics

Deterministic from SEED. Same file every run.
"""

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Quaternion, Vector

import numpy as np

# --------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------

SEED = 20260813

#: World radius. Everything is expressed against it.
R = 4.6

#: Subdivision of the solid master. Exterior geology only — fracture walls
#: get their resolution from the interface sheets.
SUBDIV = 6

#: Relief as a fraction of R. Restrained: the silhouette must stay planetary.
MACRO_RELIEF = 0.028
MESO_RELIEF = 0.022
MICRO_RELIEF = 0.006

#: The blast lobe.
BLAST_AXIS = np.array([1.0, 0.15, -0.35])

#: Target share of the world's volume per fragment, largest first. The
#: brief's distribution: one dominant mass, two large, three middling, two
#: smaller — and critically no two fragments the same, so the breakup can
#: never read as a diagram.
VOLUME_TARGETS = (0.25, 0.18, 0.15, 0.12, 0.10, 0.09, 0.06, 0.05)

#: Interface sheet resolution and extent. The sheet has to overhang the
#: world comfortably, because its warp moves it around.
SHEET_SPAN = 3.4 * R
SHEET_RES = 44
SHEET_DEPTH = 4.0 * R

#: Warp amplitudes, as fractions of R. Broad bend leads; fine breakup is
#: deliberately small — a fracture wall is a landform, not a noise texture.
WARP_BROAD = 0.30
WARP_SHELF = 0.115
WARP_FINE = 0.028

OUT_GLB = os.path.join('public', 'models', 'world-macro.glb')
OUT_MANIFEST = os.path.join('public', 'models', 'world-macro-manifest.json')
OUT_RENDER = os.path.join('captures', 'world')

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


def smooth01(x):
    x = 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)
    return x * x * (3.0 - 2.0 * x)


_SPHERICAL = {}
_SPATIAL = {}


def fbm(direction, seed, octaves=5):
    """Directional noise: a function on the sphere, for surface geology."""
    basis = _SPHERICAL.get(seed)
    if basis is None:
        rng = np.random.default_rng(seed)
        basis = [(unit(rng.normal(size=3)), rng.uniform(0, math.tau),
                  1.65 * (2.03 ** i), 0.5 ** i) for i in range(octaves)]
        _SPHERICAL[seed] = basis
    d = unit(direction)
    value = norm = 0.0
    for vec, phase, freq, amp in basis:
        value += amp * math.sin(float(np.dot(d, vec)) * freq * math.pi + phase)
        norm += amp
    return value / max(norm, 1e-6)


def noise3(p, seed, octaves=4):
    """
    Positional noise. Distinct from `fbm`, which normalises its input and is
    therefore a function of direction only — useless on a flat sheet, where
    every point would have to differ by where it is, not where it points.
    """
    basis = _SPATIAL.get(seed)
    if basis is None:
        rng = np.random.default_rng(seed)
        basis = [(unit(rng.normal(size=3)), rng.uniform(0, math.tau),
                  1.0 * (2.07 ** i), 0.5 ** i) for i in range(octaves)]
        _SPATIAL[seed] = basis
    value = norm = 0.0
    for vec, phase, freq, amp in basis:
        value += amp * math.sin(float(np.dot(p, vec)) * freq + phase)
        norm += amp
    return value / max(norm, 1e-6)


def marker(name):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    return material


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def mesh_volume(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    volume = abs(bm.calc_volume(signed=True))
    bm.free()
    return volume


# --------------------------------------------------------------------------
# The intact world — authored once, before anything breaks
# --------------------------------------------------------------------------

def elevation(direction):
    """Surface height at a direction, as a fraction of R. Restrained."""
    d = unit(direction)
    macro = MACRO_RELIEF * fbm(d * 1.05, SEED + 11, octaves=3)
    belt = smooth01((fbm(d * 1.30, SEED + 29, octaves=2) + 0.05) / 0.55)
    ridged = 1.0 - abs(fbm(d * 3.4, SEED + 23, octaves=4))
    meso = MESO_RELIEF * belt * (ridged ** 2.2 - 0.30)
    steps = 1.5
    q = (fbm(d * 1.15, SEED + 71, octaves=3) + 1.0) * steps
    level = math.floor(q)
    riser = smooth01((q - level - 0.52) / 0.28)
    plateau = MESO_RELIEF * 0.85 * ((level + riser) / steps - 1.0)
    micro = MICRO_RELIEF * fbm(d * 9.0, SEED + 37, octaves=3)
    return macro + meso + plateau + micro


def build_master_world():
    """One solid world, its geology frozen before a single cut is made."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=SUBDIV, radius=R)
    world = bpy.context.active_object
    world.name = 'PLANET_MASTER'
    world.data.materials.append(marker('EXTERIOR_MAT'))
    for vert in world.data.vertices:
        d = Vector(vert.co).normalized()
        vert.co = d * (R * (1.0 + elevation(np.array(d[:]))))
    return world


# --------------------------------------------------------------------------
# Region ownership — a power diagram, weighted to hit the mass targets
# --------------------------------------------------------------------------

def fracture_seeds():
    """
    Seeds through the interior, spread over direction at moderate depth.

    The depth matters, and the arithmetic is worth stating because two
    requirements look contradictory until it is done. A fragment holding a
    quarter of the world's volume as a CAP against the crust spans about
    150 degrees of circumference — over the third the brief allows. The same
    quarter held as a WEDGE running from the crust to the centre spans
    exactly 120: for a cone of half-angle t the volume fraction is
    (1 - cos t) / 2, so a quarter of the world is t = 60. Big pieces are
    only allowed to be big if they reach inward.

    So the seeds sit at similar moderate radius, spread over direction, and
    every region runs from the surface toward the middle. A deep central
    seed was tried and is exactly wrong: it owns the core, which forces
    every other region to become a shell around it.

    They are not a clean rosette — radii vary, directions are jittered off
    any lattice, and the interfaces between them are warped surfaces rather
    than planes, so nothing converges tidily enough to read as pie wedges.
    """
    blast = unit(BLAST_AXIS)
    bu, bv = tangent_basis(blast)
    rng = np.random.default_rng(SEED + 211)

    directions = (
        (0.95, 0.35, 0.20),
        (0.55, -0.70, 0.60),
        (0.10, 0.85, -0.65),
        (-0.20, -0.50, -0.95),
        (-0.75, 0.60, 0.35),
        (-0.90, -0.45, 0.40),
        (-0.35, 0.25, 0.98),
        (0.45, -0.95, -0.35),
    )
    depths = (0.52, 0.44, 0.49, 0.41, 0.55, 0.46, 0.38, 0.50)

    seeds = []
    for (a, b, c), depth in zip(directions, depths):
        d = unit(blast * a + bu * b + bv * c + rng.normal(size=3) * 0.10)
        seeds.append(d * (R * depth * float(rng.uniform(0.92, 1.08))))
    return seeds


def tune_weights(seeds):
    """
    Power-diagram weights, solved by Monte Carlo against the volume targets.

    A plain Voronoi partition gives whatever masses the seed geometry
    happens to give, and the brief is explicit about the distribution it
    wants. Weighting the bisectors moves them along their chords, which
    grows one region at the expense of its neighbour. Sampling points inside
    the sphere and counting ownership is far cheaper than building the
    geometry to find out, so the balance is solved before a single Boolean.
    """
    rng = np.random.default_rng(SEED + 909)
    points = rng.normal(size=(60000, 3))
    points = points / np.linalg.norm(points, axis=1, keepdims=True)
    points = points * (R * rng.random(60000)[:, None] ** (1.0 / 3.0))

    S = np.array(seeds)
    weights = np.zeros(len(seeds))
    targets = np.array(VOLUME_TARGETS[:len(seeds)])
    targets = targets / targets.sum()

    for _ in range(240):
        d2 = ((points[:, None, :] - S[None, :, :]) ** 2).sum(axis=2) - weights[None, :]
        owner = np.argmin(d2, axis=1)
        share = np.array([(owner == i).sum() for i in range(len(seeds))], dtype=float)
        share /= max(share.sum(), 1.0)
        # Push each weight toward its target. The gain is small because a
        # weight moves every one of that region's boundaries at once.
        weights += (targets - share) * (R * R) * 0.55
        if np.max(np.abs(targets - share)) < 0.004:
            break

    return weights, share


# --------------------------------------------------------------------------
# Fracture interfaces — warped BEFORE the cut, shared by both sides
# --------------------------------------------------------------------------

def interface_solid(a, b, seeds, weights, sign):
    """
    One half-solid bounded by the warped interface between regions a and b.

    The sheet is built identically for both sides — same plane, same warp,
    same seed — and only the extrusion direction differs. That is what makes
    the two fracture walls of a break complementary: they are the same
    surface, approached from opposite sides.
    """
    sa = np.array(seeds[a])
    sb = np.array(seeds[b])
    chord = sb - sa
    length = float(np.linalg.norm(chord))
    if length < 1e-6:
        return None
    n = chord / length
    # Power-diagram plane: the weights slide it along the chord.
    offset = (weights[a] - weights[b]) / (2.0 * length)
    centre = (sa + sb) * 0.5 + n * offset
    u, v = tangent_basis(n)

    # Bound the warp against how far apart this pair actually sits. An
    # interface that swings further than half the chord crosses its
    # neighbour's seed and eats the region whole — which is exactly what
    # emptied two regions and lost a third of the world's volume on the
    # first run of this method. Amplitude is a property of the pair, not a
    # global constant.
    room = length * 0.30
    scale = min(1.0, room / max(WARP_BROAD * R + WARP_SHELF * R + WARP_FINE * R, 1e-6))

    warp_seed = SEED + 5000 + min(a, b) * 97 + max(a, b)
    bm = bmesh.new()
    step = SHEET_SPAN / (SHEET_RES - 1)
    grid = []
    for iy in range(SHEET_RES):
        row = []
        for ix in range(SHEET_RES):
            x = (ix - (SHEET_RES - 1) * 0.5) * step
            y = (iy - (SHEET_RES - 1) * 0.5) * step
            p = centre + u * x + v * y
            # The fracture's character, authored here and only here.
            broad = WARP_BROAD * R * noise3(p * 0.30, warp_seed + 1, octaves=3)
            shelf = WARP_SHELF * R * noise3(p * 0.95, warp_seed + 2, octaves=3)
            fine = WARP_FINE * R * noise3(p * 2.6, warp_seed + 3, octaves=2)
            row.append(bm.verts.new(Vector(tuple(p + n * ((broad + shelf + fine) * scale)))))
        grid.append(row)

    bm.verts.ensure_lookup_table()
    for iy in range(SHEET_RES - 1):
        for ix in range(SHEET_RES - 1):
            bm.faces.new((grid[iy][ix], grid[iy][ix + 1],
                          grid[iy + 1][ix + 1], grid[iy + 1][ix]))

    # Close the sheet into a manifold slab reaching well past the world, so
    # the Boolean has a solid half-space to intersect against.
    result = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    moved = [g for g in result['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=Vector(tuple(n * (-sign * SHEET_DEPTH))))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    mesh = bpy.data.meshes.new(f'IFACE_{a}_{b}')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(marker('FRACTURE_MAT'))
    obj = bpy.data.objects.new(f'IFACE_{a}_{b}', mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def apply_boolean(target, cutter, operation='INTERSECT'):
    modifier = target.modifiers.new('B', 'BOOLEAN')
    modifier.operation = operation
    modifier.object = cutter
    modifier.solver = 'EXACT'
    if hasattr(modifier, 'material_mode'):
        modifier.material_mode = 'TRANSFER'
    select_only(target)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def crease_breaks(obj, angle=math.radians(34.0)):
    """
    Split the shading where the rock creases. Exterior and fracture wall
    share their rim vertices, and smooth shading averages a radial normal
    with a sideways one, smearing the wall's lighting up over the crust.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for edge in bm.edges:
        if len(edge.link_faces) != 2:
            edge.smooth = False
            continue
        a, b = edge.link_faces
        if a.material_index != b.material_index or edge.calc_face_angle(0.0) > angle:
            edge.smooth = False
    bm.to_mesh(obj.data)
    bm.free()


def mark_surfaces(obj):
    """r: 1 original exterior, 0 fracture. b: altitude. Blockout keeps it minimal."""
    mesh = obj.data
    names = [m.name if m else '' for m in mesh.materials]
    cut_slot = names.index('FRACTURE_MAT') if 'FRACTURE_MAT' in names else -1
    attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')
    cache = [-1.0] * len(mesh.vertices)

    def altitude_of(index):
        if cache[index] < 0.0:
            d = Vector(mesh.vertices[index].co).normalized()
            h = elevation(np.array(d[:]))
            cache[index] = min(max(0.5 + h / (MACRO_RELIEF + MESO_RELIEF) * 0.5, 0.0), 1.0)
        return cache[index]

    for poly in mesh.polygons:
        if poly.material_index == cut_slot:
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = (0.0, 1.0, 0.5, 0.0)
        else:
            for loop_index in poly.loop_indices:
                vertex_index = mesh.loops[loop_index].vertex_index
                attribute.data[loop_index].color = (1.0, 0.0, altitude_of(vertex_index), 0.0)
        poly.use_smooth = True


def wrap_extent(obj, centre):
    """
    How much of the original circumference this fragment's exterior spans,
    in degrees, measured from the world's former centre. The C-shaped arc in
    the failed blockout was 200-plus; the brief caps it near 120.
    """
    mesh = obj.data
    names = [m.name if m else '' for m in mesh.materials]
    cut_slot = names.index('FRACTURE_MAT') if 'FRACTURE_MAT' in names else -1
    dirs = []
    for poly in mesh.polygons:
        if poly.material_index == cut_slot:
            continue
        dirs.append(unit(np.array((Vector(poly.center) + Vector(tuple(centre)))[:])))
    if len(dirs) < 3:
        return 0.0
    dirs = np.array(dirs)
    mean = unit(dirs.mean(axis=0))
    cosines = np.clip(dirs @ mean, -1.0, 1.0)
    return float(np.degrees(np.arccos(cosines).max()) * 2.0)


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
# The explosion
# --------------------------------------------------------------------------

#: Displacement per rank, in radii, plus an out-of-plane offset. Strongly
#: uneven and deliberately not a ring: the arrangement must not surround one
#: clean central void, so the near masses stay clustered off to one side
#: while the far ones run out along the lobe.
THROW = (
    (0.30, 0.55),
    (0.75, -0.85),
    (1.25, 1.15),
    (1.70, -0.40),
    (2.30, 1.60),
    (2.95, -1.30),
    (3.60, 0.70),
    (4.40, -1.90),
)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    blast = unit(BLAST_AXIS)
    lift = unit(np.cross(blast, np.array([0.0, 0.0, 1.0])))
    lift = unit(np.cross(lift, blast))

    master = build_master_world()
    seeds = fracture_seeds()
    weights, share = tune_weights(seeds)
    print('WORLD_TARGET_SHARES ' + ' '.join(f'{s:.3f}' for s in share))

    manifest = {
        'worldRadius': R,
        'planetOrigin': [0.0, 0.0, 0.0],
        'blastAxis': [float(x) for x in blast],
        'macro': [],
    }

    master_volume = mesh_volume(master)

    fragments = []
    for i in range(len(seeds)):
        piece = master.copy()
        piece.data = master.data.copy()
        piece.name = f'MACRO_{i:02d}'
        bpy.context.collection.objects.link(piece)

        for j in range(len(seeds)):
            if j == i:
                continue
            # sign +1 keeps the side containing seed i.
            solid = interface_solid(min(i, j), max(i, j), seeds, weights,
                                    1.0 if i < j else -1.0)
            if solid is None:
                continue
            apply_boolean(piece, solid, 'INTERSECT')
            bpy.data.objects.remove(solid, do_unlink=True)
            if not piece.data.polygons:
                break

        faces = len(piece.data.polygons)
        if faces < 64:
            print(f'MACRO {i} CULLED — empty region')
            bpy.data.objects.remove(piece, do_unlink=True)
            continue

        mark_surfaces(piece)
        crease_breaks(piece)
        volume = mesh_volume(piece)
        fragments.append((i, piece, volume))
        print(f'MACRO {i} polys {faces} volume {volume / master_volume * 100:.1f}%')

    bpy.data.objects.remove(master, do_unlink=True)

    # Rank by how far along the blast axis each mass sits, so the throw
    # ladder lands coherently rather than at random.
    staged = []
    for i, piece, volume in fragments:
        centre = recentre(piece)
        staged.append((float(np.dot(unit(centre), blast)), i, piece, centre, volume))
    staged.sort(key=lambda row: row[0])

    for rank, (facing, i, piece, centre, volume) in enumerate(staged):
        radial = unit(centre)
        reach, zoff = THROW[min(rank, len(THROW) - 1)]
        blast_weight = smooth01((facing + 0.55) / 1.55)

        displacement = (radial * (R * reach)
                        + blast * (R * blast_weight * float(RNG.uniform(0.35, 1.10)))
                        + lift * (R * zoff * 0.32))
        position = centre + displacement

        piece.location = tuple(float(x) for x in position)
        spin_axis = unit(RNG.normal(size=3))
        spin = float(RNG.uniform(-0.16, 0.16))
        piece.rotation_mode = 'QUATERNION'
        piece.rotation_quaternion = Quaternion(Vector(tuple(spin_axis)), spin)

        wrap = wrap_extent(piece, centre)
        flag = '  << WRAPS' if wrap > 130.0 else ''
        print(f'MACRO {i} wrap {wrap:.0f} deg  travel {np.linalg.norm(position) / R:.2f}R{flag}')

        manifest['macro'].append({
            'id': piece.name,
            'bindPosition': [float(x) for x in centre],
            'position': [float(x) for x in position],
            'radialDirection': [float(x) for x in radial],
            'volumeShare': float(volume / master_volume),
            'wrapDegrees': float(wrap),
            'spinAxis': [float(x) for x in spin_axis],
            'spin': spin,
            'faces': len(piece.data.polygons),
        })

    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB, export_format='GLB', export_apply=True,
        export_normals=True, export_materials='NONE', export_texcoords=False,
        export_yup=True, export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=10,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_color_quantization=12,
    )
    with open(OUT_MANIFEST, 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, indent=2)

    total = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    span = max(np.linalg.norm(m['position']) for m in manifest['macro']) / R
    print(f'WORLD_MACRO_COUNT {len(manifest["macro"])}')
    print(f'WORLD_FACES {total}')
    print(f'WORLD_VOLUMES ' + ' '.join(f'{m["volumeShare"] * 100:.0f}%' for m in manifest['macro']))
    print(f'WORLD_MAX_WRAP {max(m["wrapDegrees"] for m in manifest["macro"]):.0f} deg')
    print(f'WORLD_SPAN {span:.2f} R  ({span / 2.0:.2f} diameters)')
    print(f'WORLD_OUT {OUT_GLB}')

    if '--render' in sys.argv:
        render_diagnostics(manifest)


# --------------------------------------------------------------------------
# Diagnostics — three neutral images, geometry only
# --------------------------------------------------------------------------

def render_diagnostics(manifest):
    """
    Neutral greys, neutral light, no emission and no warmth of any kind.
    These exist to answer three questions and nothing else: do the pieces
    reassemble into one world, does the exploded set read as that world
    blown apart, and do a pair's walls actually match.
    """
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('VOID')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.05, 0.05, 0.055, 1)
    bg.inputs[1].default_value = 0.35

    exterior = bpy.data.materials.new('EXTERIOR_GREY')
    exterior.use_nodes = True
    exterior.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.18, 0.18, 0.19, 1)
    exterior.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.75
    fracture = bpy.data.materials.new('FRACTURE_GREY')
    fracture.use_nodes = True
    fracture.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.30, 0.30, 0.31, 1)
    fracture.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.68

    pieces = [o for o in bpy.data.objects if o.type == 'MESH']
    for obj in pieces:
        names = [m.name if m else '' for m in obj.data.materials]
        cut_slot = names.index('FRACTURE_MAT') if 'FRACTURE_MAT' in names else -1
        obj.data.materials.clear()
        obj.data.materials.append(exterior)
        obj.data.materials.append(fracture)
        # Slot 0 exterior, slot 1 fracture, rebuilt from the baked mark so
        # the split survives the material swap.
        attr = obj.data.color_attributes.get('crust')
        for poly in obj.data.polygons:
            is_exterior = attr and attr.data[poly.loop_indices[0]].color[0] > 0.5
            poly.material_index = 0 if is_exterior else 1
        void = cut_slot  # silence linters; slot mapping is rebuilt above
        del void

    for angles, energy in (((58, 0, 40), 3.0), ((-40, 0, 200), 1.2), ((20, 0, 300), 0.8)):
        data = bpy.data.lights.new('KEY', type='SUN')
        data.energy = energy
        data.angle = 0.15
        obj = bpy.data.objects.new('KEY', data)
        obj.rotation_euler = tuple(math.radians(a) for a in angles)
        bpy.context.collection.objects.link(obj)

    blast = unit(np.array(manifest['blastAxis']))
    bu, bv = tangent_basis(blast)
    out_dir = os.path.abspath(OUT_RENDER)
    os.makedirs(out_dir, exist_ok=True)

    cam_data = bpy.data.cameras.new('CAM')
    cam_data.lens = 42.0
    cam = bpy.data.objects.new('CAM', cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    by_id = {m['id']: m for m in manifest['macro']}

    def shoot(name, eye, aim):
        cam.location = tuple(float(x) for x in eye)
        direction = Vector(tuple(unit(np.array(aim) - np.array(eye))))
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out_dir, f'{name}.png')
        bpy.ops.render.render(write_still=True)
        print(f'WORLD_SHOT {scene.render.filepath}')

    # 1 — BIND_REASSEMBLED. Every fragment home. This must be one planet.
    for obj in pieces:
        entry = by_id.get(obj.name)
        if entry:
            obj.location = tuple(entry['bindPosition'])
            obj.rotation_quaternion = Quaternion((1, 0, 0, 0))
    eye = unit(blast * 0.5 + bu * 1.0 + bv * 0.45) * (R * 4.2)
    shoot('BIND_REASSEMBLED', eye, np.zeros(3))

    # 2 — EXPLODED_WIDE.
    for obj in pieces:
        entry = by_id.get(obj.name)
        if entry:
            obj.location = tuple(entry['position'])
            obj.rotation_quaternion = Quaternion(
                Vector(tuple(entry['spinAxis'])), entry['spin'])
    span = max(np.linalg.norm(m['position']) for m in manifest['macro'])
    # Close enough that the masses have presence. At 2.5x span they were
    # specks and the frame reported nothing about scale.
    cam_data.lens = 34.0
    centroid = np.mean([m['position'] for m in manifest['macro']], axis=0)
    eye = centroid + unit(blast * 0.45 + bu * 1.1 + bv * 0.55) * (span * 1.35)
    shoot('EXPLODED_WIDE', eye, centroid)
    cam_data.lens = 42.0

    # 3 — FRACTURE_GAP. Between the two masses whose bind seats were
    #     closest: former neighbours, so their walls are the same surface.
    # Former neighbours that are still near each other NOW. Picking purely
    # by bind distance put the camera between two masses that have since
    # flown to opposite ends of the field, and framed nothing but the void
    # between them — a broken test, not a failing one.
    best = None
    entries = manifest['macro']
    for a in range(len(entries)):
        for b in range(a + 1, len(entries)):
            bind = np.linalg.norm(np.array(entries[a]['bindPosition'])
                                  - np.array(entries[b]['bindPosition']))
            now = np.linalg.norm(np.array(entries[a]['position'])
                                 - np.array(entries[b]['position']))
            if bind > R * 1.4:
                continue          # never adjacent, so no shared wall
            if best is None or now < best[0]:
                best = (now, entries[a], entries[b])
    if best:
        separation, ea, eb = best
        pa = np.array(ea['position'])
        pb = np.array(eb['position'])
        gap = (pa + pb) * 0.5
        across = unit(pb - pa)
        out = unit(np.cross(across, lift_axis(across)))
        # Stand back just far enough to hold both walls in frame.
        cam_data.lens = 30.0
        shoot('FRACTURE_GAP', gap + out * max(separation * 0.85, R * 1.2), gap)
        print(f'WORLD_GAP_PAIR {ea["id"]} {eb["id"]} separation {separation / R:.2f}R')


def lift_axis(v):
    helper = np.array([0.0, 0.0, 1.0])
    if abs(float(np.dot(unit(v), helper))) > 0.9:
        helper = np.array([0.0, 1.0, 0.0])
    return helper


if __name__ == '__main__':
    main()
