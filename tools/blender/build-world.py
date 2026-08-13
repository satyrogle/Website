"""
build-world.py — a world fractured through its full volume.

Run headless:

    blender --background --factory-startup --python tools/blender/build-world.py
    blender --background --factory-startup --python tools/blender/build-world.py -- --render

Writes `public/models/world-macro.glb` and `public/models/world-macro-manifest.json`,
and with `--render`, composition stills into `captures/world/`.

PARALLEL BUILD. This does not touch `planet.glb` or anything the site
currently loads. Per the ultra spec: the new destruction asset is built
alongside the working one and swapped in only when the macro composition is
judged good.

WHY THIS EXISTS, and what is different from `build-planet.py`.

Two earlier attempts partitioned the SHELL — a solidified crust, hollow —
and every fragment came out a thin curved petal pivoting away from a centre.
That is the eggshell/peeled-fruit read, and no amount of material work fixes
it, because the fault is that the pieces have no volume.

Here the master world is a SOLID. Fracture cells are generated from seeds
distributed through the interior — not on the surface — so every fragment
carries part of the original curved exterior, a unique centre of mass, deep
internal material and thick fracture walls. The fragments are the planet;
there is no surviving body and no core object.

    solid master world
      -> restrained macro relief + meso geology, authored ONCE before fracture
         (so ridges continue across pieces and the fragments prove one parent)
      -> 8 asymmetric interior seeds
      -> tiling bisector cells, closed and complementary
      -> INTERSECT each cell with the solid master
      -> tag exterior vs fracture faces by boolean material transfer
      -> subdivide and roughen ONLY the fracture faces
      -> outward transforms: radial everywhere + blast bias one hemisphere
      -> export macro GLB + explosion manifest

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

#: Normalised world radius. Everything below is expressed against it.
R = 4.6

#: Subdivision of the solid master. The fracture faces get their own
#: subdivision afterwards, so this only has to carry exterior geology.
SUBDIV = 6

#: Macro relief, as a fraction of R. The spec is explicit and it is the
#: opposite of the old build's instinct: restrained. Enough to destroy
#: perfect CGI roundness, never enough to cost the planetary curvature that
#: lets a viewer reassemble the sphere from separated masses.
MACRO_RELIEF = 0.028
MESO_RELIEF = 0.022
MICRO_RELIEF = 0.006

#: The blast lobe: the hemisphere that receives the extra directional term
#: and becomes the website's debris corridor.
BLAST_AXIS = np.array([1.0, 0.15, -0.35])

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


_FBM = {}


def fbm(direction, seed, octaves=5):
    """Sums of unaligned sines: smooth, seamless, no axis-locked lattice."""
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


def marker(name):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    return material


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# --------------------------------------------------------------------------
# The intact world — authored once, before anything breaks
# --------------------------------------------------------------------------

def elevation(direction):
    """
    Surface height at a direction, as a fraction of R.

    Restrained on purpose. The spec's rule, and the correction to the old
    build: the macro layer exists to break perfect roundness, not to sculpt
    lobes. The meso layer does the geological work — ridge belts, scarps,
    plateau boundaries — because that is the scale the website camera
    actually visits. Micro is left to the material's light response rather
    than spent on silhouette.
    """
    d = unit(direction)

    # Broad continental uplifts and depressed basins, with long transitions.
    macro = MACRO_RELIEF * fbm(d * 1.05, SEED + 11, octaves=3)

    # Ridge belts: ridged noise, so crests are sharp and the valleys between
    # them are wide and dead. Gated by a belt mask so mountains run in
    # systems and the plains between them stay plains.
    belt = smooth01((fbm(d * 1.30, SEED + 29, octaves=2) + 0.05) / 0.55)
    ridged = 1.0 - abs(fbm(d * 3.4, SEED + 23, octaves=4))
    meso = MESO_RELIEF * belt * (ridged ** 2.2 - 0.30)

    # Escarpments: a terraced field, few and tall, so plateau boundaries
    # read as steps rather than as ripples.
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
    # Slot 0 so the cut marker the booleans transfer can only land in slot 1:
    # original surface and fracture surface stay distinguishable by index.
    world.data.materials.append(marker('EXTERIOR_MAT'))

    for vert in world.data.vertices:
        d = Vector(vert.co).normalized()
        vert.co = d * (R * (1.0 + elevation(np.array(d[:]))))
    return world


# --------------------------------------------------------------------------
# Fracture — through the volume, not across the skin
# --------------------------------------------------------------------------

def fracture_seeds():
    """
    Seeds distributed through the INTERIOR, asymmetrically, none at the
    origin. Placing seeds on the surface is what produces shell petals; a
    seed at depth produces a mass with an interior.

    The composition the spec asks for: two large in the low-blast hemisphere,
    three around the equatorial volume, two on the blast side, one deep and
    off-centre.
    """
    blast = unit(BLAST_AXIS)
    bu, bv = tangent_basis(blast)
    rng = np.random.default_rng(SEED + 211)

    def place(direction, depth, jitter=0.18):
        d = unit(np.array(direction) + rng.normal(size=3) * jitter)
        return d * (R * depth)

    seeds = [
        # Two anchors in the back hemisphere, well out toward the crust so
        # they claim large exterior area.
        place(-blast + bu * 0.55, 0.62),
        place(-blast - bu * 0.30 + bv * 0.62, 0.58),
        # Three through the equatorial volume, at different depths.
        place(bu * 1.2 + bv * 0.25, 0.52),
        place(-bu * 0.35 + bv * 1.15, 0.46),
        place(bu * 0.15 - bv * 1.20, 0.66),
        # Two on the blast side.
        place(blast * 1.1 + bv * 0.40, 0.54),
        place(blast * 0.95 - bu * 0.50, 0.44),
        # One deep and off-centre: this is the piece that carries the most
        # interior material and the least original sky.
        place(blast * 0.25 + bu * 0.30 - bv * 0.20, 0.20),
    ]
    return seeds


def build_cells(seeds):
    """
    One closed volume per seed, tiling space: a large cube cut by the
    jittered bisector plane of every seed pair. The jitter is derived from
    the PAIR and canonically oriented, so both neighbours cut on the
    identical plane — the cells tile with no gap and no overlap, which is
    what makes the fragments complementary pieces of one body rather than
    pieces generated beside each other.
    """
    cells = []
    for i in range(len(seeds)):
        bpy.ops.mesh.primitive_cube_add(size=40.0)
        cell = bpy.context.active_object
        cell.name = f'CELL_{i:02d}'
        bm = bmesh.new()
        bm.from_mesh(cell.data)

        for j in range(len(seeds)):
            if j == i:
                continue
            a, b = (i, j) if i < j else (j, i)
            rng = np.random.default_rng(SEED + 3000 + a * 61 + b)
            midpoint = (np.array(seeds[a]) + np.array(seeds[b])) * 0.5
            chord = unit(np.array(seeds[b]) - np.array(seeds[a]))
            # Tilted and offset, so no boundary is a clean perpendicular
            # bisector and the walls never read as a Voronoi diagram.
            normal = unit(chord + rng.normal(size=3) * 0.16)
            centre = midpoint + normal * float(rng.uniform(-0.35, 0.35)) * R * 0.2
            plane_no = normal if i == a else -normal

            result = bmesh.ops.bisect_plane(
                bm,
                geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                plane_co=Vector(tuple(centre)),
                plane_no=Vector(tuple(plane_no)),
                clear_outer=True,
            )
            if not bm.verts:
                break
            cut_edges = [g for g in result['geom_cut'] if isinstance(g, bmesh.types.BMEdge)]
            if cut_edges:
                bmesh.ops.edgenet_fill(bm, edges=cut_edges)

        if bm.faces:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.to_mesh(cell.data)
        bm.free()
        cell.data.materials.append(marker('FRACTURE_MAT'))
        cells.append(cell)
    return cells


def apply_boolean(target, cutter, operation='INTERSECT'):
    modifier = target.modifiers.new('B', 'BOOLEAN')
    modifier.operation = operation
    modifier.object = cutter
    modifier.solver = 'EXACT'
    # Faces the cutter contributes arrive wearing the cutter's material, so
    # a fracture wall identifies itself instead of being re-derived from
    # geometry afterwards.
    if hasattr(modifier, 'material_mode'):
        modifier.material_mode = 'TRANSFER'
    select_only(target)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def roughen_fracture(obj, seed):
    """
    Raw cell cuts are flat polygons and read as machined. Subdivide only the
    fracture faces and push them around with a hierarchy — broad warp, then
    shelves, then chipped breakup — so each wall reads as geological mass
    that failed rather than as a sliced plane.

    Vertices shared with the original exterior are left exactly where they
    are. That boundary is what proves the pieces were once one world, and
    displacing it would break the reassembly the whole reveal depends on.
    """
    mesh = obj.data
    names = [m.name if m else '' for m in mesh.materials]
    if 'FRACTURE_MAT' not in names:
        return
    cut_slot = names.index('FRACTURE_MAT')

    bm = bmesh.new()
    bm.from_mesh(mesh)

    cut_faces = [f for f in bm.faces if f.material_index == cut_slot]
    if not cut_faces:
        bm.free()
        return

    # A boolean returns each cut wall as a handful of large flat n-gons —
    # the whole world came back with 149 fracture faces, which is nothing to
    # displace and is why the first walls stayed machined planes. Triangulate
    # them, then subdivide in two passes, so the wall has enough vertices to
    # carry relief before anything tries to push it around.
    bmesh.ops.triangulate(bm, faces=cut_faces, ngon_method='BEAUTY')
    for cuts in (3, 2):
        bm.faces.ensure_lookup_table()
        faces = [f for f in bm.faces if f.material_index == cut_slot]
        if not faces:
            break
        edges = set()
        for face in faces:
            edges.update(face.edges)
        bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=cuts, use_grid_fill=True)

    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    interior = set()
    boundary = set()
    for face in bm.faces:
        target = interior if face.material_index == cut_slot else boundary
        for vert in face.verts:
            target.add(vert.index)
    movable = interior - boundary

    # Taper the displacement in from the rim, over a real DISTANCE.
    #
    # The first attempt counted rings of vertices, and that quietly did
    # nothing: after two subdivision passes each original triangle carries
    # ~144 sub-triangles, so four rings is a couple of centimetres of a
    # world four and a half units across. Meanwhile the wall's rim is a fine
    # zigzag — it follows the triangulated exterior — and displacement
    # applied right up against a pinned zigzag turns every tooth into a
    # ridge running inward. That is the comb, and it is why three previous
    # fixes did not touch it.
    #
    # Dijkstra out from the rim along the wall, in world units.
    import heapq
    TAPER = 0.55
    distance = {index: 0.0 for index in boundary}
    queue = [(0.0, index) for index in boundary]
    heapq.heapify(queue)
    while queue:
        d, index = heapq.heappop(queue)
        if d > distance.get(index, 1e9) or d > TAPER:
            continue
        vert = bm.verts[index]
        for edge in vert.link_edges:
            other = edge.other_vert(vert)
            if other.index not in movable:
                continue
            nd = d + edge.calc_length()
            if nd < distance.get(other.index, 1e9):
                distance[other.index] = nd
                if nd <= TAPER:
                    heapq.heappush(queue, (nd, other.index))

    # Even out the vertices before displacing them. A boolean hands back each
    # cut wall as one n-gon with a long zigzag border, and triangulating that
    # fans skinny triangles from a single hub — displace that and the hub
    # structure shows up as a comb of creases radiating from the rim, which
    # is exactly the artefact the first two renders had. Relaxing the
    # interior destroys the fan's fingerprint; the rim stays pinned, so the
    # seam with the original surface does not move.
    # Relax only what is clear of the rim: smoothing against a pinned zigzag
    # is itself a way of printing that zigzag inward.
    relax = [bm.verts[i] for i in movable if distance.get(i, TAPER * 2.0) > TAPER]
    if relax:
        for _ in range(6):
            bmesh.ops.smooth_vert(bm, verts=relax, factor=0.5,
                                  use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()

    moved_near_rim = 0.0
    for index in movable:
        vert = bm.verts[index]
        taper = smooth01(distance.get(index, TAPER * 2.0) / TAPER)
        if taper <= 0.0:
            continue
        p = np.array(vert.co[:])
        d = unit(p)
        broad = 0.075 * R * fbm(d * 1.7 + p * 0.06, seed + 1, octaves=3)
        shelves = 0.030 * R * fbm(d * 4.0 + p * 0.22, seed + 2, octaves=3)
        chips = 0.011 * R * fbm(d * 9.0 + p * 0.75, seed + 3, octaves=2)
        normal = Vector(vert.normal)
        if normal.length < 1e-6:
            continue
        offset = (broad + shelves + chips) * taper
        vert.co += normal.normalized() * offset
        if distance.get(index, 1e9) < 0.15:
            moved_near_rim = max(moved_near_rim, abs(offset))

    # If anything within 15cm of the rim moved appreciably, the taper is not
    # doing its job and the comb is back. Say so rather than shipping it.
    print(f'  rim taper: max move within 0.15u of rim = {moved_near_rim:.4f}')

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()


def mark_surfaces(obj):
    """
    The mark, per corner, in one colour attribute — the same grammar the
    live material already speaks:

        r  1.0 original exterior, 0.0 fracture interior
        g  fracture temperature (set later from separation age)
        b  terrain altitude on the exterior
        a  reserved for the fault network
    """
    mesh = obj.data
    names = [m.name if m else '' for m in mesh.materials]
    cut_slot = names.index('FRACTURE_MAT') if 'FRACTURE_MAT' in names else -1
    attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')

    altitude_cache = [-1.0] * len(mesh.vertices)

    def altitude_of(index):
        cached = altitude_cache[index]
        if cached < 0.0:
            d = Vector(mesh.vertices[index].co).normalized()
            h = elevation(np.array(d[:]))
            cached = min(max(0.5 + h / (MACRO_RELIEF + MESO_RELIEF) * 0.5, 0.0), 1.0)
            altitude_cache[index] = cached
        return cached

    for poly in mesh.polygons:
        if poly.material_index == cut_slot:
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = (0.0, 1.0, 0.5, 0.0)
        else:
            for loop_index in poly.loop_indices:
                vertex_index = mesh.loops[loop_index].vertex_index
                attribute.data[loop_index].color = (1.0, 0.0, altitude_of(vertex_index), 0.0)
        poly.use_smooth = True


def crease_breaks(obj, angle=math.radians(34.0)):
    """
    Split the shading where the rock actually creases.

    The exterior and a fracture wall meet at a hard edge, but they share
    their rim vertices, so smooth shading averages a radial normal with a
    sideways one and smears the wall's lighting up over the crust — which
    renders as a comb of bright streaks fanning in from every rim. It looks
    like torn geometry and is nothing but a normal being asked to describe
    two surfaces at once. Marking the material boundary sharp, along with
    any genuinely sharp fold, gives each surface its own normal.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for edge in bm.edges:
        if len(edge.link_faces) != 2:
            edge.smooth = False
            continue
        a, b = edge.link_faces
        if a.material_index != b.material_index:
            edge.smooth = False
        elif edge.calc_face_angle(0.0) > angle:
            edge.smooth = False
    bm.to_mesh(obj.data)
    bm.free()


def recentre(obj):
    """Move the mesh onto its own centre of mass; return where that was."""
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

#: Separation tiers, in planet radii from the bind pose. Deliberately
#: uneven: a uniform expanding ring is the thing that reads as a diagram.
#: Two stay near the bind shape so the sphere remains reconstructable, three
#: travel, three are strongly ejected and carry the corridor.
TIERS = (0.14, 0.22, 0.30, 0.55, 0.78, 1.15, 1.60, 2.10)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    blast = unit(BLAST_AXIS)
    master = build_master_world()
    seeds = fracture_seeds()
    cells = build_cells(seeds)

    manifest = {
        'worldRadius': R,
        'planetOrigin': [0.0, 0.0, 0.0],
        'blastAxis': [float(x) for x in blast],
        'macro': [],
    }

    fragments = []
    for i, cell in enumerate(cells):
        piece = master.copy()
        piece.data = master.data.copy()
        piece.name = f'MACRO_{i:02d}'
        bpy.context.collection.objects.link(piece)

        apply_boolean(piece, cell, 'INTERSECT')
        bpy.data.objects.remove(cell, do_unlink=True)

        faces = len(piece.data.polygons)
        print(f'MACRO {i} raw polys {faces}')
        if faces < 64:
            print(f'MACRO {i} CULLED — degenerate cell')
            bpy.data.objects.remove(piece, do_unlink=True)
            continue

        roughen_fracture(piece, SEED + 700 + i * 53)
        mark_surfaces(piece)
        crease_breaks(piece)
        fragments.append((i, piece))

    # The master has given everything it had. Exporting the intact world
    # alongside its own fragments would put the planet in the frame twice.
    bpy.data.objects.remove(master, do_unlink=True)

    # Order by how far the centre of mass sits along the blast axis, so the
    # tier ladder lands coherently: the back of the world barely lets go,
    # the blast side is already gone.
    staged = []
    for i, piece in fragments:
        centre = recentre(piece)
        staged.append((float(np.dot(unit(centre), blast)), i, piece, centre))
    staged.sort(key=lambda row: row[0])

    for rank, (facing, i, piece, centre) in enumerate(staged):
        radial = unit(centre)
        t1, t2 = tangent_basis(radial)
        blast_weight = smooth01((facing + 0.55) / 1.55)

        # Radial first — every mass has a guaranteed outward component, so
        # the world can never read as imploding — then the directional lobe,
        # then a little tangential so nothing travels on a clean spoke.
        radial_strength = R * TIERS[min(rank, len(TIERS) - 1)]
        blast_strength = R * blast_weight * float(RNG.uniform(0.25, 0.95))
        tangent_strength = R * float(RNG.uniform(0.04, 0.16))

        tangent = unit(t1 * float(RNG.normal()) + t2 * float(RNG.normal()))
        displacement = (radial * radial_strength
                        + blast * blast_strength
                        + tangent * tangent_strength)
        position = centre + displacement

        piece.location = tuple(float(x) for x in position)
        spin_axis = unit(RNG.normal(size=3))
        # Massive things turn slowly. Angular velocity is most of what sells
        # the scale of a piece this size.
        spin = float(RNG.uniform(-0.14, 0.14))
        piece.rotation_mode = 'QUATERNION'
        piece.rotation_quaternion = Quaternion(Vector(tuple(spin_axis)), spin)

        extent = max((Vector(w.co).length for w in piece.data.vertices), default=1.0)
        manifest['macro'].append({
            'id': piece.name,
            'bindPosition': [float(x) for x in centre],
            'position': [float(x) for x in position],
            'radialDirection': [float(x) for x in radial],
            'radialStrength': float(radial_strength),
            'blastStrength': float(blast_strength),
            'spinAxis': [float(x) for x in spin_axis],
            'spin': spin,
            'extent': float(extent),
            'faces': len(piece.data.polygons),
        })

    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_materials='NONE',
        export_texcoords=False,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=10,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_color_quantization=12,
    )

    with open(OUT_MANIFEST, 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, indent=2)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    total = sum(len(o.data.polygons) for o in meshes)
    exterior = 0
    fracture = 0
    for o in meshes:
        attr = o.data.color_attributes.get('crust')
        if attr is None:
            continue
        for poly in o.data.polygons:
            if attr.data[poly.loop_indices[0]].color[0] > 0.5:
                exterior += 1
            else:
                fracture += 1
    print(f'WORLD_MACRO_COUNT {len(meshes)}')
    print(f'WORLD_FACES {total}')
    print(f'WORLD_EXTERIOR {exterior} FRACTURE {fracture}')
    print(f'WORLD_SPAN {max(np.linalg.norm(m["position"]) for m in manifest["macro"]) / R:.2f} R')
    print(f'WORLD_OUT {OUT_GLB}')

    if '--render' in sys.argv:
        render_composition(manifest)


# --------------------------------------------------------------------------
# Composition stills — macro read only, judged before any material work
# --------------------------------------------------------------------------

def render_composition(manifest):
    """
    Grey masses, interior light, black void. Deliberately not the site's
    material: the only question at this stage is whether the silhouettes
    read as one world coming apart, and material is the next argument, not
    this one.
    """
    # Cycles, not EEVEE: EEVEE accepts the assignment in a background
    # Blender and then writes nothing, because it needs a GL context there
    # is none of. Cycles renders headless on the CPU, and for a composition
    # judgement — silhouette, mass, light through gaps — a few dozen
    # denoised samples is plenty.
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 28
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('VOID')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.01, 0.012, 0.015, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.15

    rock = bpy.data.materials.new('ROCK_PREVIEW')
    rock.use_nodes = True
    bsdf = rock.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.055, 0.058, 0.065, 1)
    bsdf.inputs['Roughness'].default_value = 0.82
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.data.materials.clear()
            obj.data.materials.append(rock)

    # Hidden interior sources — asymmetric, never rendered as geometry.
    for i, offset in enumerate(((0.6, 0.3, -0.4), (-0.5, -0.6, 0.3), (0.2, 0.8, 0.5))):
        light_data = bpy.data.lights.new(f'LIGHT_INTERIOR_{i}', type='POINT')
        light_data.energy = 6000.0
        light_data.color = (1.0, 0.55, 0.22)
        light_data.shadow_soft_size = 0.6
        light = bpy.data.objects.new(f'LIGHT_INTERIOR_{i}', light_data)
        light.location = tuple(float(x) * R * 0.5 for x in offset)
        bpy.context.collection.objects.link(light)

    key = bpy.data.lights.new('KEY', type='SUN')
    key.energy = 1.4
    key.angle = 0.2
    key_obj = bpy.data.objects.new('KEY', key)
    key_obj.rotation_euler = (math.radians(62), 0.0, math.radians(38))
    bpy.context.collection.objects.link(key_obj)

    blast = unit(np.array(manifest['blastAxis']))
    bu, bv = tangent_basis(blast)
    span = max(np.linalg.norm(m['position']) for m in manifest['macro'])

    # Framed off the measured span, so the whole catastrophe fits rather
    # than half of it falling outside the frame.
    def stand(direction, reach, aim):
        return unit(np.array(direction)) * span * reach, np.array(aim)

    shots = {
        '44-wide': stand(blast * 0.55 + bu * 1.15 + bv * 0.62, 2.6, [0, 0, 0]),
        '29-reconstruct': stand(blast * 0.30 + bu * 1.0 + bv * 0.45, 1.7, [0, 0, 0]),
        '00-open': stand(blast * 0.9 + bu * 0.7 + bv * 0.35, 1.0, blast * R * 0.5),
    }

    # Absolute, because a background Blender has no .blend to resolve a
    # relative output path against and silently writes nothing.
    out_dir = os.path.abspath(OUT_RENDER)
    os.makedirs(out_dir, exist_ok=True)
    scene.render.image_settings.file_format = 'PNG'
    cam_data = bpy.data.cameras.new('CAM')
    cam_data.lens = 46.0
    cam = bpy.data.objects.new('CAM', cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    for name, (eye, aim) in shots.items():
        cam.location = tuple(float(x) for x in eye)
        direction = Vector(tuple(unit(np.array(aim) - np.array(eye))))
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out_dir, f'{name}.png')
        bpy.ops.render.render(write_still=True)
        print(f'WORLD_SHOT {scene.render.filepath}')


if __name__ == '__main__':
    main()
