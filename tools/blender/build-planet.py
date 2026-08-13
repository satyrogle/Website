"""
build-planet.py — a planet ceasing to be a planet. v6.

Run headless:

    blender --background --factory-startup --python tools/blender/build-planet.py

Writes `public/models/planet.glb` and `public/models/planet-manifest.json`.

The ontology, from Jacob's ultra directive (2026-08-13, destruction language
from Lamentis and Krypton): do not model "planet + wound + detached pieces" —
model THE PLANET BECOMING ITS PIECES. One master shell (solidified before
displacement, so the boolean operands stay manifold; terrain from `elevation`,
disturbance graded by distance from the rupture centre) is partitioned into
~14 continent-scale plates by tiling cell volumes cut from pair-jittered
bisector planes. The plates together ARE the original sphere. Every plate has
separated — the back hemisphere barely, so the spherical gestalt survives,
the blast hemisphere entirely, forming the corridor the scroll travels. Five
plates ride the corridor ladder as the website's authored stops; the rest
remain the exploding world.

The mark, baked per corner into one colour attribute:
    r  1.0 on the original exterior, 0.0 on anything the event exposed
    g  temperature of an exposed face: 1.0 on true cross-sections and plate
       walls, low on the solidify lining — the crust's old underside reads
       as dark burnt mass, never as a dish of molten orange
    b  terrain altitude, for the material's value language
    a  venting along the baked fracture web (secondary/tertiary faults; the
       primary faults are the real gaps between the plates now)

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

#: Subdivision of the master shell. Seven is where scarps and crater rims
#: keep their crease: at six the vertex rows sit 0.17 units apart, a riser
#: crosses two of them, and smooth shading rounds the step back into a lump.
SUBDIV = 7

#: THE ONTOLOGY (Jacob's ultra directive, 2026-08-13): stop modelling
#: "planet + wound + detached pieces" — model THE PLANET BECOMING ITS
#: PIECES. The whole shell is partitioned into continent-scale plates that
#: together reconstruct the original sphere; there is no surviving lump.
#: Every plate has separated: the back hemisphere barely, the blast side
#: entirely. The five plates flung down the corridor ladder are the
#: website's authored stops; the rest remain the exploding world, so the
#: catastrophe does not appear to have broken into exactly five navigation
#: objects.
#: Thirteen superplates. Eighteen made slivers, and slivers are rubble: the
#: directive is explicit that enormous masses must define the event and small
#: debris must stay subordinate. At thirteen each plate is ~8% of the world's
#: surface — a continent, visibly huge at any stop.
PLATE_COUNT = 13

#: Flight distances for the five hero plates, near to far — the ladder the
#: scroll descends.
HERO_FLIGHTS = (2.6, 5.5, 9.0, 13.5, 18.0)

#: Hero plate seed directions, as (u, v) offsets around the corridor axis.
#: Spread far wider than the old cluster: packed tightly they produced hero
#: cells of a few hundred polygons — website stops made of slivers. Seed 0
#: is the rupture centre the whole grading system keys from.
HERO_OFFSETS = ((0.15, 0.10), (0.88, -0.36), (-0.30, 0.82), (0.55, 0.98), (-0.78, -0.46))

#: How far each surviving plate has travelled from its seat, in planet
#: radii, cycled by filler index. The directive's own ladder: some barely
#: parted, some a third of a radius out, some most of a radius clear — so no
#: subset of them can close back up into a shell.
FILLER_TIERS = (0.16, 0.64, 0.30, 0.98, 0.22, 0.78, 0.44, 1.20)

#: Medium debris: how many, and how far the furthest has got. Directions are
#: drawn around the whole body — a breakup sheds everywhere — biased toward
#: the rupture hemisphere where most of the mass left.
MEDIUM_COUNT = 16
MEDIUM_REACH = 21.5

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


def _smooth01(x):
    x = 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)
    return x * x * (3.0 - 2.0 * x)


def _make_craters(seed, count=11):
    """
    Impact basins, precomputed once. Each carries its own axis, its own
    tangent basis and its own rim-modulation phases, so no two share an axis
    and no outline is a circle — the no-rotational-symmetry rule, applied at
    feature scale.
    """
    rng = np.random.default_rng(seed)
    craters = []
    for _ in range(count):
        cdir = unit(rng.normal(size=3))
        cu, cv = tangent_basis(cdir)
        craters.append({
            'dir': cdir, 'u': cu, 'v': cv,
            'rho': float(rng.uniform(0.18, 0.50)),      # angular radius
            'depth': float(rng.uniform(0.050, 0.100)),  # fraction of radius
            'rim': float(rng.uniform(0.22, 0.40)),      # of depth
            'ph': rng.uniform(0, math.tau, size=3),
        })
    return craters


_CRATERS = _make_craters(SEED + 81)

#: The authored frame, fixed: everything is built around +X and rotated onto
#: the site's diagonal at runtime. Module-level because the surface functions
#: need the rupture centre, not just main().
_AXIS = np.array([1.0, 0.0, 0.0])
_U, _V = tangent_basis(_AXIS)


def _make_plate_seeds(seed, count=16):
    rng = np.random.default_rng(seed)
    return [unit(rng.normal(size=3)) for _ in range(count)]


_PLATE_SEEDS = _make_plate_seeds(SEED + 141)

#: The finer tier of the same failure: a denser cellular web whose boundaries
#: are hairlines, not canyons. The reference frame's fracture language is
#: hierarchical — filament, vein, channel — and one cell size cannot speak it.
_VEIN_SEEDS = _make_plate_seeds(SEED + 143, count=42)

RUPTURE_DIR = unit(_AXIS + HERO_OFFSETS[0][0] * _U + HERO_OFFSETS[0][1] * _V)


def plate_seed_dirs():
    """
    The five authored hero regions on the blast hemisphere, then filler
    seeds rejection-sampled over the rest of the sphere with a minimum
    separation. Heroes cluster and fillers spread, which is the physics:
    the failing hemisphere breaks smaller, the far side breaks huge.
    """
    seeds = [unit(_AXIS + a * _U + b * _V) for a, b in HERO_OFFSETS]
    rng = np.random.default_rng(SEED + 211)
    attempts = 0
    # The rest spread over the whole sphere at superplate spacing. No
    # clustering pass any more: the old one existed to keep survivors packed
    # around the core so its silhouette stayed hidden, and the core has no
    # silhouette to hide now.
    while len(seeds) < PLATE_COUNT and attempts < 12000:
        attempts += 1
        candidate = unit(rng.normal(size=3))
        if all(float(np.dot(candidate, s)) < math.cos(0.72) for s in seeds):
            seeds.append(candidate)
    return seeds


def build_cells(seeds):
    """
    One closed convex-ish volume per plate, tiling space: a big cube cut by
    the jittered bisector plane of every seed pair. Jitter is derived from
    the PAIR, canonically oriented, so both neighbours use the identical
    plane and the cells tile with no gap and no overlap — the partition is
    exact by construction. The jitter is what keeps the boundaries from
    being perfect Voronoi: offset and tilted, they read as long tectonic
    arcs, not a diagram.
    """
    cells = []
    for i in range(len(seeds)):
        bpy.ops.mesh.primitive_cube_add(size=30.0)
        cell = bpy.context.active_object
        cell.name = f'CELL_{i:02d}'
        bm = bmesh.new()
        bm.from_mesh(cell.data)
        for j in range(len(seeds)):
            if j == i:
                continue
            a, b = (i, j) if i < j else (j, i)
            rng = np.random.default_rng(SEED + 3000 + a * 41 + b)
            chord = unit(np.array(seeds[b]) - np.array(seeds[a]))
            normal = unit(chord + rng.normal(size=3) * 0.07)
            # Fair again, jitter only. The hero-shrink weighting was a
            # workaround for a core that had a boundary to unveil; with the
            # interior unbounded, heroes are allowed to be the continents
            # they need to be.
            offset = float(rng.uniform(-0.35, 0.35))
            plane_no = normal if i == a else -normal
            result = bmesh.ops.bisect_plane(
                bm,
                geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                plane_co=Vector(tuple(normal * offset)),
                plane_no=Vector(tuple(plane_no)),
                clear_outer=True,
            )
            if not bm.verts:
                break
            cut_edges = [g for g in result['geom_cut'] if isinstance(g, bmesh.types.BMEdge)]
            if cut_edges:
                bmesh.ops.edgenet_fill(bm, edges=cut_edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.to_mesh(cell.data)
        bm.free()
        cell.data.materials.append(_marker_material('CUT_MAT'))
        cells.append(cell)
    return cells


def fracture_field(d):
    """
    The global death, at a direction: (openness, proximity).

    Jacob's coherence objection, verbatim: "how can one chunk of planet
    break apart while the rest is still the same." It cannot. The whole
    crust is divided into plates, and the boundaries between them are
    failing everywhere — the rupture zone is simply FURTHEST ALONG. This
    field finds the plate boundaries (F2−F1 cellular distance between the
    two nearest of sixteen seeds: ~0 on a boundary, growing toward each
    plate's interior) and grades everything by angular distance from the
    rupture centre.

      openness   1 inside a boundary crevasse, 0 on plate interior
      proximity  1 at the rupture centre, 0 by the far side

    Consumed twice, like every surface function here: `elevation` carves the
    crevasses — canyon-deep near the rupture, hairline by the far side — and
    `mark_crust` sets the near ones venting while the far ones stay dark.
    """
    best = 8.0
    second = 8.0
    for seed_dir in _PLATE_SEEDS:
        dist = 1.0 - float(np.dot(d, seed_dir))
        if dist < best:
            second = best
            best = dist
        elif dist < second:
            second = dist
    openness = 1.0 - _smooth01((second - best) / 0.045)
    facing = max(-1.0, min(1.0, float(np.dot(d, RUPTURE_DIR))))
    proximity = _smooth01((1.35 - math.acos(facing)) / 1.35)
    return openness, proximity


def vein_field(d):
    """The finer web: same construction, thinner boundaries, more cells."""
    best = 8.0
    second = 8.0
    for seed_dir in _VEIN_SEEDS:
        dist = 1.0 - float(np.dot(d, seed_dir))
        if dist < best:
            second = best
            best = dist
        elif dist < second:
            second = dist
    return 1.0 - _smooth01((second - best) / 0.020)

#: Soft cap on total elevation, as a fraction of radius. Geology has to be
#: unmistakable and the body still has to read as a sphere that came apart.
#: Two renders taught the scale: at 0.105 the body was a smooth ball, and the
#: fault was not the light, it was that the features were smaller than the
#: mesh's own vertex spacing — a 0.14-unit scarp cannot exist on a mesh with
#: 0.17-unit edges, and a 0.2-unit crater is 0.3% of the frame at the reveal.
#: Terrain a viewer must recognise from thirty-five units out is built from
#: half-unit steps, not decoration — but the globe outranks the terrain: at
#: 0.21 the silhouette tipped from "world with bold geology" into "black
#: organic lump", which is on the spec's do-not list.
ELEV_CAP = 0.18


def elevation(direction):
    """
    Terrain height at a direction, in fractions of the body radius. One
    function used three times — to displace both shell surfaces, to recognise
    the original exterior after the booleans have destroyed face identity,
    and to tint the crust by altitude.

    Planetary language, largest structure first:

      macro     continents and the torn silhouette
      plateaus  a terraced field — broad flat steps split by scarps
      belts     ridge chains where the belt mask allows them, dead plains
                where it does not — mountains run in systems, not everywhere
      basins    irregular impact bowls with raised rims
      micro     weathered roughness, kept far below everything above
    """
    d = unit(direction)

    # Smooth continents, folded: the crease term subtracts sharp-bottomed
    # valleys from the rolling fbm, which is what stops the silhouette
    # reading as a melted lump — hard planetary character over soft mass.
    macro = 0.082 * fbm(d * 1.15, SEED + 11, octaves=3)
    macro -= 0.045 * abs(fbm(d * 1.55, SEED + 13, octaves=3))

    # Fewer, taller steps, with risers wide enough for the mesh to carry:
    # each scarp stands about a third of a unit, and a riser spans several
    # vertex rows instead of falling between two.
    steps = 1.6
    q = (fbm(d * 1.25, SEED + 71, octaves=3) + 1.0) * steps
    level = math.floor(q)
    riser = _smooth01((q - level - 0.52) / 0.30)
    plateau = 0.120 * ((level + riser) / steps - 1.0)

    # How disturbed this part of the world is. The reference frame's power is
    # contrast: a calm, almost serene surviving cap against a shattering
    # rupture hemisphere. Busy-ness everywhere reads as an asteroid; the
    # gradient reads as a world in the act of failing.
    facing = max(-1.0, min(1.0, float(np.dot(d, RUPTURE_DIR))))
    unrest = 0.40 + 0.60 * _smooth01((1.9 - math.acos(facing)) / 1.9)

    belt = _smooth01((fbm(d * 1.35, SEED + 29, octaves=2) - 0.02) / 0.55)
    ridged = 1.0 - abs(fbm(d * 3.9, SEED + 23, octaves=4))
    meso = 0.100 * unrest * belt * (ridged ** 2.4 - 0.30)

    bowls = 0.0
    for crater in _CRATERS:
        cosang = float(np.dot(d, crater['dir']))
        ang = math.acos(max(-1.0, min(1.0, cosang)))
        if ang > crater['rho'] * 1.9:
            continue
        phi = math.atan2(float(np.dot(d, crater['v'])), float(np.dot(d, crater['u'])))
        p0, p1, p2 = crater['ph']
        rho = crater['rho'] * (1.0
                               + 0.20 * math.sin(2.0 * phi + p0)
                               + 0.12 * math.sin(3.0 * phi + p1)
                               + 0.07 * math.sin(5.0 * phi + p2))
        x = ang / max(rho, 1e-4)
        if x < 1.0:
            bowls -= crater['depth'] * unrest * (1.0 - _smooth01((x - 0.55) / 0.45))
        lip = 1.0 - abs(x - 1.0) / 0.22
        if lip > 0.0:
            bowls += crater['depth'] * crater['rim'] * unrest * lip * lip

    micro = 0.008 * fbm(d * 11.0, SEED + 37, octaves=3)

    # The failing boundaries, carved into the whole globe at two scales:
    # plate canyons, and the finer vein web that only opens where the death
    # is close — filament, vein, channel, the fracture hierarchy.
    # Demoted to the SECOND tier: the primary faults are the real geometric
    # gaps between the separated plates now, so the baked boundaries carve
    # shallower — structural memory, not the main event.
    openness, proximity = fracture_field(d)
    crevasse = -openness * (0.010 + 0.042 * proximity)
    crevasse -= vein_field(d) * (0.004 + 0.030 * proximity)

    total = macro + plateau + meso + bowls + micro + crevasse
    return ELEV_CAP * math.tanh(total / ELEV_CAP)


def radius_at(direction):
    return BODY_RADIUS * (1.0 + elevation(direction))


def mark_crust(obj, tolerance=0.955, heat=1.0, heat_seed=0):
    """
    The graded mark, baked per corner into one colour attribute.

      r  1.0 on faces still lying on the original exterior, 0.0 on anything
         the event exposed. Recognised against `elevation`, which is exact
         because it is the same function that displaced the shell.
      g  temperature of an exposed face. Cut cross-sections and wound walls
         are fresh — 1.0. The solidify lining — the crust's old underside,
         parallel to the surface one thickness down and facing inward — has
         had a planet's age to cool: it gets embers only. This is what keeps
         a detached slab a dark mass instead of a dish of molten orange.
      b  terrain altitude on the exterior, 0.5 neutral elsewhere, for the
         highland/basin value language in the material.
    """
    mesh = obj.data
    material_names = [m.name if m else '' for m in mesh.materials]
    cut_slot = material_names.index('CUT_MAT') if 'CUT_MAT' in material_names else -1
    attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')

    # Altitude and venting are sampled at the vertex, not the face centre, so
    # the corners of neighbouring crust faces agree, the exporter can weld
    # them, and the values interpolate smoothly across faces. The venting
    # used to be a per-face reclassification into the hot class, and it drew
    # sawtooth: a binary mark flipping at mesh resolution, with the lip
    # derivative firing along every flip. Baked per vertex into alpha, the
    # glow follows the fracture field instead of the tessellation, and the
    # lip stays where it belongs — on real torn edges only.
    vertex_altitude = [-1.0] * len(mesh.vertices)
    vertex_venting = [-1.0] * len(mesh.vertices)

    def altitude_of(vertex_index):
        cached = vertex_altitude[vertex_index]
        if cached < 0.0:
            d = Vector(mesh.vertices[vertex_index].co).normalized()
            cached = min(max(0.5 + 0.5 * (elevation(np.array(d[:])) / ELEV_CAP), 0.0), 1.0)
            vertex_altitude[vertex_index] = cached
        return cached

    def venting_of(vertex_index):
        cached = vertex_venting[vertex_index]
        if cached < 0.0:
            d = Vector(mesh.vertices[vertex_index].co).normalized()
            direction = np.array(d[:])
            openness, proximity = fracture_field(direction)
            veins = vein_field(direction)
            # Both fracture tiers vent, graded by proximity — but with a
            # floor: no region feels safe. The far side of a world under
            # internal catastrophe carries dim ember hairlines, not clean
            # crust; only the intensity varies with how far the death has
            # progressed.
            grade = 0.12 + 0.88 * proximity
            cached = max((openness ** 1.5) * grade,
                         (veins ** 1.8) * grade * 0.7)
            vertex_venting[vertex_index] = cached
        return cached

    for poly in mesh.polygons:
        centre = Vector(poly.center)
        direction = centre.normalized()
        surface = BODY_RADIUS * (1.0 + elevation(np.array(direction[:])))
        outward = poly.normal.dot(direction)
        if poly.material_index == cut_slot:
            # A wall where this plate tore from its neighbours — but not all
            # of it, and not for ever. Every wall lit at full temperature is
            # what welded the separated plates into a continuous orange
            # annulus around the centre: peeled fruit, halo, eggshell. So
            # heat is patchy along each wall (large fbm patches: a localised
            # hot fracture edge with dark stretches between) and scaled by
            # how far the plate has travelled since it parted — the pieces
            # that flew keep only residual ember.
            patch = 0.5 + 0.5 * fbm(np.array(direction[:]) * 2.6, SEED + 600 + heat_seed, octaves=3)
            local = 0.10 + 0.95 * _smooth01((patch - 0.30) / 0.45)
            value = max(0.05, min(1.0, heat * local))
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = (0.0, value, 0.5, 0.0)
        elif centre.length > surface * tolerance and outward > 0.05:
            for loop_index in poly.loop_indices:
                vertex_index = mesh.loops[loop_index].vertex_index
                attribute.data[loop_index].color = (
                    1.0, 0.0, altitude_of(vertex_index), venting_of(vertex_index))
        else:
            lining = (abs(centre.length - (surface - CRUST_THICKNESS)) < CRUST_THICKNESS * 0.35
                      and outward < -0.05)
            colour = (0.0, 0.24 if lining else 1.0, 0.5, 0.0)
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = colour
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
    # Faces the cutter contributes arrive wearing the cutter's material, so a
    # cut wall is identified by the boolean itself rather than re-derived from
    # geometry afterwards. The radial re-derivation put wall faces exactly on
    # its tolerance boundaries — the body shipped with no hot wound walls at
    # all — and a mark that load-bearing cannot sit on a margin of 0.01.
    if hasattr(modifier, 'material_mode'):
        modifier.material_mode = 'TRANSFER'
    select_only(target)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def _marker_material(name):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    return material


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
    """
    One displaced, solidified world. Everything else is cut from this.

    Thickened first, displaced second. Solidifying displaced terrain let the
    inner surface self-intersect wherever the terrain curved harder than the
    crust is thick, and a self-intersecting operand is what made the EXACT
    boolean return slab_00 as an empty mesh. On the clean sphere the solidify
    is exact — outer shell at BODY_RADIUS, inner at BODY_RADIUS minus the
    thickness — so each vertex declares which surface it belongs to by radius
    alone, and displacing both radially keeps the shells parallel and the
    solid manifold under any terrain.
    """
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=SUBDIV, radius=BODY_RADIUS)
    shell = bpy.context.active_object
    shell.name = 'MASTER_SHELL'
    # Slot 0, so the cut marker the booleans transfer can only ever land in
    # slot 1 — original surface and cutter surface stay distinguishable by
    # index. Materials are never exported; these are marks, not looks.
    shell.data.materials.append(_marker_material('SHELL_MAT'))

    modifier = shell.modifiers.new('SHELL', 'SOLIDIFY')
    modifier.thickness = CRUST_THICKNESS
    modifier.offset = -1.0  # inward: the outer surface stays the real surface
    select_only(shell)
    bpy.ops.object.modifier_apply(modifier=modifier.name)

    split = BODY_RADIUS - CRUST_THICKNESS * 0.5
    for vert in shell.data.vertices:
        co = Vector(vert.co)
        d = co.normalized()
        r = radius_at(np.array(d[:]))
        vert.co = d * (r if co.length > split else r - CRUST_THICKNESS)
    return shell


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    shell = build_master_shell()

    manifest = {
        'bodyRadius': BODY_RADIUS,
        'coreRadius': CORE_RADIUS,
        'axis': [1.0, 0.0, 0.0],
        'stops': [],
        'plates': [],
        'mediums': [],
    }

    # ------------------------------------------------------------ the plates
    #
    # The whole shell, partitioned. Every plate is cut from the master by its
    # own tiling cell, so together the plates ARE the original sphere — there
    # is no surviving lump being treated as "the planet" while everything
    # else plays debris. That ontology was the deep fault of every earlier
    # version: one body with a wound reads as a damaged planet; a partitioned
    # shell in graded separation reads as a planet ceasing to be one.
    seeds = plate_seed_dirs()
    cells = build_cells(seeds)

    plates = []
    for i, cell in enumerate(cells):
        name = f'slab_{i:02d}' if i < len(HERO_FLIGHTS) else f'plate_{i:02d}'
        piece = duplicate(shell, name)
        apply_boolean(piece, cell, 'INTERSECT')
        bpy.data.objects.remove(cell, do_unlink=True)
        print(f'PLATE {i} polys {len(piece.data.polygons)}')
        if len(piece.data.polygons) < 24:
            print(f'PLATE {i} CULLED - degenerate cell')
            bpy.data.objects.remove(piece, do_unlink=True)
            continue
        plates.append((i, piece, np.array(seeds[i])))

    # The master has given everything it had: the plates carry the whole
    # shell between them, and exporting the intact original alongside them
    # would put the planet in the frame twice.
    bpy.data.objects.remove(shell, do_unlink=True)

    # ------------------------------------------------------- the separation
    #
    # Weighted velocity, per the directive: a radial component so the WHOLE
    # planet is exploding, a dominant blast component so one hemisphere forms
    # the corridor the scroll travels, and local jitter so nothing is
    # regular. The back of the world has barely let go — small separations
    # keep the spherical gestalt reconstructable — while the blast side is
    # already gone: the five hero plates ride the corridor ladder.
    filler = 0
    for i, piece, seed_dir in plates:
        radial = unit(seed_dir)
        t1, t2 = tangent_basis(radial)
        drift = (t1 * float(RNG.uniform(-0.7, 0.7))
                 + t2 * float(RNG.uniform(-0.7, 0.7)))
        blastw = _smooth01((float(np.dot(radial, RUPTURE_DIR)) + 0.55) / 1.55)

        if i < len(HERO_FLIGHTS):
            travel = HERO_FLIGHTS[i]
            spin_range = 0.22
        else:
            # Radial explosion FIRST — every side of the world expanding —
            # then the blast bias that makes one hemisphere the corridor.
            # The old separations were a twentieth of a radius: a shell with
            # gaps, not a planet coming apart.
            travel = BODY_RADIUS * FILLER_TIERS[filler % len(FILLER_TIERS)]
            travel += (blastw ** 2) * BODY_RADIUS * (0.30 + 0.55 * float(RNG.random()))
            filler += 1
            spin_range = 0.10

        # Heat by separation age, per the chronology: barely-parted plates
        # keep white-hot walls, the long-gone are ember at best.
        heat = max(0.12, min(1.0, 1.05 - 0.085 * travel))
        mark_crust(piece, heat=heat, heat_seed=i * 37)
        centre = recentre(piece)

        bias = RUPTURE_DIR * (blastw * (0.25 + 0.7 * float(RNG.random()))) if i >= len(HERO_FLIGHTS) else np.zeros(3)
        position = centre + radial * travel + bias + drift * 0.6
        piece.location = tuple(float(x) for x in position)
        spin = unit(RNG.normal(size=3))
        piece.rotation_mode = 'QUATERNION'
        piece.rotation_quaternion = Quaternion(Vector(tuple(spin)), float(RNG.uniform(-spin_range, spin_range)))

        extent = max((Vector(w.co).length for w in piece.data.vertices), default=1.0)
        entry = {
            'name': piece.name,
            'position': [float(x) for x in position],
            'extent': float(extent),
        }
        # Every plate is published, not just the five the scroll stops at:
        # the rail needs the whole set to find a former tectonic boundary to
        # fly through, and nothing may be staged from a piece that is not
        # really there.
        manifest['plates'].append(entry)
        if i < len(HERO_FLIGHTS):
            manifest['stops'].append(entry)

    # ---------------------------------------------------------------- mediums
    #
    # Secondary debris stays procedural, as permitted — carved from a
    # displaced crust ball with the same radius language, same material rule:
    # crust outside, heat only on the cut. Thrown RADIALLY, all around the
    # body: a breakup sheds everywhere, biased toward the rupture hemisphere
    # where most of the mass left, smaller the further it has got.
    chunks = carve_chunks(MEDIUM_COUNT)
    for index, obj in enumerate(chunks[:MEDIUM_COUNT]):
        if index == 0:
            # The reveal's foreground anchor, authored: one large mass in the
            # money shot's near field, so the frame has a monumental close
            # plane with the body and the field behind it. Placed well OFF
            # the eye-to-wound line — the first position sat nearly on it
            # and the anchor became a black occluder swallowing the rupture,
            # which is the exact fault the spec forbids.
            position = np.array([9.0, -10.0, -2.0])
            scale = 1.35
        else:
            if RNG.random() < 0.62:
                dirm = unit(RUPTURE_DIR * 1.2 + RNG.normal(size=3) * 0.75)
            else:
                dirm = unit(RNG.normal(size=3))
            flight = 1.2 + (MEDIUM_REACH - 1.2) * float(RNG.random() ** 1.25)
            position = dirm * (BODY_RADIUS + flight)
            scale = float(RNG.uniform(0.5, 1.5)) * max(1.15 - 0.03 * flight, 0.38)
        obj.location = tuple(float(x) for x in position)
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

    for obj in chunks[MEDIUM_COUNT:]:
        bpy.data.objects.remove(obj, do_unlink=True)

    # The crack tubes are gone (spec P5): thin beveled curves silhouetted
    # against the melt read as bent wire, and the venting plate-boundary
    # network now carries the fissure story with actual material logic.

    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_materials='NONE',
        export_yup=True,
        # The ico sphere's UVs survived every rebuild and cost 756 kB of a
        # 5.5 MB file. Nothing samples a texture here — the whole material
        # is procedural off the mark attribute — so they were paying rent
        # on an empty room.
        export_texcoords=False,
        # Draco. Geometry this dense is mostly connectivity, and connectivity
        # is what Draco compresses best. The quantisation is chosen against
        # what the data actually needs rather than left at defaults:
        #
        #   position 14 bits — the body spans ~11 units, so this resolves to
        #     0.0007 of a unit against a vertex spacing of 0.085. Terrain
        #     cannot move.
        #   normal 10 bits — smooth shading over a near-black crust; the
        #     wash response cannot resolve finer than this.
        #   colour 12 bits — the load-bearing one. COLOR_0 is not a look
        #     here, it is the mark: crust/temperature/altitude, and the
        #     shader keys every lighting decision off it. The classes sit at
        #     0, 0.24, 0.72, 0.82 and 1.0, which 4096 levels separate by a
        #     margin of hundreds. Verified after export, not assumed.
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
    crust_faces = 0
    lining_faces = 0
    cut_faces = 0
    for o in meshes:
        attr = o.data.color_attributes.get('crust')
        if attr is None:
            continue
        for poly in o.data.polygons:
            colour = attr.data[poly.loop_indices[0]].color
            if colour[0] > 0.5:
                crust_faces += 1
            elif colour[1] < 0.5:
                lining_faces += 1
            else:
                cut_faces += 1
    marked = max(crust_faces + lining_faces + cut_faces, 1)
    print(f'PLANET_OBJECTS {len(meshes)}')
    print(f'PLANET_FACES {total}')
    print(f'PLANET_COLD_RATIO {(crust_faces + lining_faces) / marked:.2f}')
    print(f'PLANET_CRUST {crust_faces} LINING {lining_faces} CUT {cut_faces}')
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

        # Secondary debris obeys the same law, tempered: dark crust outside,
        # heat only on the cut — and a chunk's cut runs cooler than a hero
        # slab's, so the corridor reads as dark mass with hot break edges
        # rather than as a stream of embers competing with the wounds.
        attribute = mesh.color_attributes.new(name='crust', type='FLOAT_COLOR', domain='CORNER')
        for poly in mesh.polygons:
            colour = (0.0, 0.72, 0.5, 0.0) if poly.material_index == 1 else (1.0, 0.0, 0.5, 0.0)
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = colour
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


if __name__ == '__main__':
    main()
