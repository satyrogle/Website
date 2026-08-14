"""
build-planet.py — one dying planet, shattered into its own parts. v4.

Run headless:

    blender --background --factory-startup --python tools/blender/build-planet.py

Writes `public/models/planet.glb` and `public/models/planet-manifest.json`.

The v3 rule, from Jacob, verbatim in docs/HERO_DIRECTION.md: the five hero
slabs and the surviving body must derive from ONE common fractured planet. A
viewer looking at a detached slab should be able to mentally place it back
into the missing region. That pipeline is unchanged here — same cutters, same
staging numbers, same layout.

What v4 changes, from Jacob's read of the v3 frames ("black sphere plus
orange shards, not one planet tearing itself apart"):

1.  GEOLOGY, not noise. The surface function now speaks planetary language —
    terraced plateaus split by scarps, ridge belts that run in chains and
    leave dead plains between them, and irregular impact basins with raised
    rims — instead of three octaves of smooth fbm that read as lumps. The
    total is soft-capped so the body still reads as a sphere that came apart.

2.  SOLIDIFY BEFORE DISPLACEMENT. v3 displaced the sphere and then thickened
    it, and where the terrain curved harder than the crust is thick, the
    inner surface self-intersected — which is what made the EXACT boolean
    return an empty mesh for slab_00, the nearest and largest piece. Now the
    clean sphere is thickened first and both surfaces are displaced radially
    afterwards; the shells stay parallel by construction and every cutter
    gets a manifold operand.

3.  A GRADED MARK instead of a binary one. Faces are classified into three
    kinds and baked into one colour attribute:
        r  1.0 on the original exterior, 0.0 on anything the event exposed
        g  temperature of the exposed face: 1.0 on true cut cross-sections
           and wound walls, low on the solidify lining — the crust's old
           underside, which has had a planet's age to cool and must read as
           dark burnt mass, not as a dish of molten orange
        b  terrain height on the exterior, for the material's value language
           (highlands catch more of the void's light than basins)

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

#: The five wounds/slabs: angular size, and how far each piece has flown
#: ALONG ITS OWN WOUND NORMAL. Jacob, on the corridor this replaces: "how
#: can debris flow in a line — I said funnel the view, not funnel the
#: explosion." A piece leaves through its hole and keeps going on that
#: radial line; the ladder of flight distances is what the scroll descends,
#: not a shared axis the debris was never thrown down.
SLABS = (
    {"ang": 0.70, "flight": 2.6},
    {"ang": 0.55, "flight": 5.5},
    {"ang": 0.46, "flight": 9.0},
    {"ang": 0.36, "flight": 13.5},
    {"ang": 0.30, "flight": 18.0},
)

#: Where the cutters bite, as (u, v) offsets around the corridor axis. The
#: primary sits at the rupture centre; 1 and 2 overlap its rim so the three
#: tear as ONE compound wound (overlaps cannot double-extract — each slab is
#: cut from the already-wounded shell, so adjoining pieces share torn rims);
#: 3 and 4 sit further out along the fissure lines.
#: Tightened for the silhouette (spec: "the rupture as a wound INSIDE a
#: recognizable globe"): the earlier spread left a floppy crescent of shell
#: between the primary bite and its neighbours, and the body read as a
#: cracked nut with a hood, not a world.
WOUND_OFFSETS = ((0.30, 0.22), (0.58, -0.04), (0.04, 0.42), (0.78, 0.66), (-0.14, 0.50))

#: Secondary fissures radiating from the rupture zone: (direction from the
#: rupture centre in (u, v), reach along it, half-extents of the ragged wedge).
FISSURES = (
    {"dir": (1.30, 1.30), "reach": 0.52, "size": (2.9, 0.42, 0.62)},
    {"dir": (-1.20, 0.90), "reach": 0.55, "size": (2.4, 0.38, 0.55)},
    {"dir": (0.90, -0.95), "reach": 0.48, "size": (2.6, 0.40, 0.50)},
)

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


def _make_craters(seed, count=22):
    """
    Impact basins, precomputed once. Each carries its own axis, its own
    tangent basis and its own rim-modulation phases, so no two share an axis
    and no outline is a circle — the no-rotational-symmetry rule, applied at
    feature scale.

    Sizes follow a power law, because a crater field is the one planetary
    feature everybody has seen a photograph of and it is never uniform: many
    small sharp craters, a few great basins. Drawn from a flat 10-29 degree
    range they were all continent-sized and all shallow, so at any amplitude
    they read as gentle undulations — the smooth pebble surface Jacob
    rejected — rather than as impacts.

    Depth is proportional to the bowl, which is both the real relation and
    what keeps a small crater a sharp pit instead of a dimple: a fixed depth
    across a 6x size range makes the small ones invisible and the large ones
    shallow saucers.
    """
    rng = np.random.default_rng(seed)
    craters = []
    for _ in range(count):
        cdir = unit(rng.normal(size=3))
        cu, cv = tangent_basis(cdir)
        # Mostly small, rarely huge. The floor is set by the mesh: below
        # roughly four degrees a bowl is finer than the vertex spacing at
        # SUBDIV 7 and does not exist however it is authored.
        rho = float(0.075 + 0.345 * (rng.random() ** 2.2))
        craters.append({
            'dir': cdir, 'u': cu, 'v': cv,
            'rho': rho,                                  # angular radius
            'depth': float(rho * rng.uniform(0.30, 0.46)),  # fraction of radius
            'rim': float(rng.uniform(0.34, 0.58)),       # of depth
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

RUPTURE_DIR = unit(_AXIS + WOUND_OFFSETS[0][0] * _U + WOUND_OFFSETS[0][1] * _V)


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
#: How much of the body the terrain is allowed to take.
#:
#: The terrain was authored for legibility at close range, and at full
#: amplitude it deformed the silhouette by nearly a fifth of the radius —
#: which is why the body read as a clenched organic mass rather than as a
#: planet (Jacob, 2026-08-14: "the shape of the planet is off"). A world this
#: battered sits near five percent; past that an outline stops being a sphere
#: and `HERO_DIRECTION`'s 55-70% inferable silhouette cannot survive.
#:
#: Scaling the summed terrain and the cap by the same factor is a pure
#: amplitude change — ELEV_CAP * tanh(total/ELEV_CAP) scales exactly — so
#: every relative feature keeps its shape, and the altitude mark, which is
#: normalised against the cap in `mark_crust`, comes through untouched. The
#: shading contrast that makes terrain readable is therefore fully preserved
#: while the potato goes: contrast, not amplitude, exactly as P4 asks.
#: 0.30 read as a clean sphere but a smooth one — the landforms went with
#: the potato. 0.42 puts maximum relief near eight percent of the radius,
#: which is Vesta territory: unmistakably a sphere, unmistakably battered.
RELIEF_SCALE = 0.42
ELEV_CAP = 0.18 * RELIEF_SCALE


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

    belt = _smooth01((fbm(d * 1.35, SEED + 29, octaves=2) - 0.02) / 0.55)
    ridged = 1.0 - abs(fbm(d * 3.9, SEED + 23, octaves=4))
    meso = 0.100 * belt * (ridged ** 2.4 - 0.30)

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
            bowls -= crater['depth'] * (1.0 - _smooth01((x - 0.55) / 0.45))
        # A crater rim is a ridge, not a swell: narrow enough that the wall
        # rises and falls inside a fifth of the bowl's own radius.
        lip = 1.0 - abs(x - 1.0) / 0.16
        if lip > 0.0:
            bowls += crater['depth'] * crater['rim'] * lip * lip

    micro = 0.008 * fbm(d * 11.0, SEED + 37, octaves=3)

    # The failing plate boundaries, carved into the whole globe.
    openness, proximity = fracture_field(d)
    crevasse = -openness * (0.020 + 0.085 * proximity)

    total = (macro + plateau + meso + bowls + micro + crevasse) * RELIEF_SCALE
    return ELEV_CAP * math.tanh(total / ELEV_CAP)


def radius_at(direction):
    return BODY_RADIUS * (1.0 + elevation(direction))


def mark_crust(obj, tolerance=0.955):
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
            openness, proximity = fracture_field(np.array(d[:]))
            cached = (openness ** 1.5) * proximity
            vertex_venting[vertex_index] = cached
        return cached

    for poly in mesh.polygons:
        centre = Vector(poly.center)
        direction = centre.normalized()
        surface = BODY_RADIUS * (1.0 + elevation(np.array(direction[:])))
        outward = poly.normal.dot(direction)
        if poly.material_index == cut_slot:
            # The boolean marked this face itself: a wall of the wound, or
            # the torn band around a slab's edge. Fresh, full temperature.
            for loop_index in poly.loop_indices:
                attribute.data[loop_index].color = (0.0, 1.0, 0.5, 0.0)
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


def irregular_cutter(centre, extent, seed):
    """
    A ragged volume — a tear, not a machined socket.

    The v4 cutters were six flat planes, and every wound and every slab edge
    inherited their geometry: clean boolean cuts, which is exactly the read
    the directive kills ("the wound must feel like a violent tearing open").
    This is a displaced sphere instead: broad lobes so the outline wanders,
    torn detail so no rim segment is straight, anisotropic so no two wounds
    share proportions. Two-octave families on separate seeds, per-cutter.
    """
    rng = np.random.default_rng(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0)
    obj = bpy.context.active_object
    obj.name = 'CUTTER'
    for vert in obj.data.vertices:
        d = np.array(Vector(vert.co).normalized()[:])
        lobes = fbm(d * 1.6, seed, octaves=4)
        torn = fbm(d * 5.2, seed + 1, octaves=3)
        r = 1.0 + 0.30 * lobes + 0.13 * torn
        vert.co = Vector((d[0] * extent[0], d[1] * extent[1], d[2] * extent[2])) * r
    # Displacement along the radius keeps the solid star-shaped, but recalc
    # anyway: an inverted operand cuts dirty and the material transfer that
    # marks the walls silently matches nothing (v4's slab_00 died of this).
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(_marker_material('CUT_MAT'))
    obj.location = tuple(float(x) for x in centre)
    # Tilted, so no cut axis aligns with anything.
    tilt = unit(rng.normal(size=3))
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Quaternion(Vector(tuple(tilt)), float(rng.uniform(-0.5, 0.5)))
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

    axis = np.array([1.0, 0.0, 0.0])
    u, v = tangent_basis(axis)

    slab_dirs = []
    for i, slab in enumerate(SLABS):
        a, b = WOUND_OFFSETS[i]
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

        # A silent cull here is a wound with no piece — v3 shipped exactly
        # that, slab_00 lost to a degenerate boolean, and the reveal lost the
        # one fragment that still hangs beside its own hole. Loud either way.
        print(f'SLAB {i} polys {len(piece.data.polygons)}')
        if len(piece.data.polygons) < 8:
            print(f'SLAB {i} CULLED — boolean returned a degenerate piece')
            bpy.data.objects.remove(piece, do_unlink=True)
            continue
        slabs.append((piece, slab, direction))

    # Secondary fissures, radiating outward from the rupture centre: long
    # ragged wedges half-sunk into the crust, DIFFERENCE only — canyons that
    # leak interior light, no piece comes off. Each is aimed along the local
    # surface tangent toward its own target direction, so the cracks run
    # ACROSS the crust rather than stabbing into it.
    rupture_centre = unit(axis + WOUND_OFFSETS[0][0] * u + WOUND_OFFSETS[0][1] * v)
    for i, fissure in enumerate(FISSURES):
        fa, fb = fissure['dir']
        target = unit(axis + (WOUND_OFFSETS[0][0] + fa) * u + (WOUND_OFFSETS[0][1] + fb) * v)
        mid = unit(rupture_centre + (target - rupture_centre) * fissure['reach'])
        tangent = unit(target - mid * float(np.dot(target, mid)))
        centre = mid * (radius_at(mid) * 0.985)
        wedge = irregular_cutter(centre, np.array(fissure['size']), SEED + 900 + i * 31)
        # Long axis along the tangent, mid axis along the surface, thin axis
        # radial-ish: build the swing from +X onto the tangent line.
        swing = Quaternion(Vector((1.0, 0.0, 0.0)).cross(Vector(tuple(tangent))).normalized(),
                           math.acos(max(-1.0, min(1.0, float(tangent[0])))))
        wedge.rotation_quaternion = swing @ wedge.rotation_quaternion
        apply_boolean(shell, wedge, 'DIFFERENCE')
        bpy.data.objects.remove(wedge, do_unlink=True)

    shell.name = 'body'
    mark_crust(shell)

    for piece, slab, direction in slabs:
        mark_crust(piece)
        centre = recentre(piece)
        # The piece leaves through its own hole and keeps going: flight is
        # along the wound normal from the piece's original seat, with a small
        # tangential drift so no line is laser-straight. A viewer tracing any
        # slab back along its motion arrives at its wound — the kinship read
        # is the physics now, not a layout convention.
        t1, t2 = tangent_basis(direction)
        drift = (t1 * float(RNG.uniform(-0.9, 0.9))
                 + t2 * float(RNG.uniform(-0.9, 0.9)))
        position = centre + direction * slab['flight'] + drift
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
