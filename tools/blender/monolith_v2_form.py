"""
Dark Lattice — Full Form v2, authored form data.

Every number in this file is a design decision. Nothing here is random,
and nothing is derived from a seed: the plan, the setbacks, the fracture
planes, the mass assignments and the depth tiers are written down,
reviewable and editable in the workbench. Randomness is only allowed
later, for sub-surface fracture detail, and only after the clay
silhouette is approved.

Frame of reference is the RUNTIME frame, not Blender's:

    +Y up, +Z toward the camera, +X to the viewer's right.

GRAMMAR

One mother volume: a tall irregular prism with a hand-drawn plan, three
hard setbacks, a lean and a slow twist, hollowed by an authored core
void. It is then FRACTURED by six tilted planes into seven masses, and
each mass is displaced along its own vector.

That is the whole vocabulary. There is no pier, no lintel, no jamb, no
sill, no belt course and no rectangular aperture, and the masses are not
sectors of a revolve, so they cannot read as petals or leaves. What
separates two masses is a real fracture surface they used to share.
"""

import math

# ---------------------------------------------------------------------
#  Overall dimensions
# ---------------------------------------------------------------------

GROUND = -3.40
APEX = 4.10
HEIGHT = APEX - GROUND          # 7.50

# ---------------------------------------------------------------------
#  The plan — one hand-drawn irregular polygon, in XZ
#
#  x -1.26..1.28 (2.54 wide), z -0.78..0.74 (1.52 deep). Broad and
#  shallow on purpose: the composition is frontal, so the form has to
#  present a wide face rather than a round tower.
#  7.50 / 2.54 = 2.95, inside the required 2.5-3.0 band.
# ---------------------------------------------------------------------

PLAN = [
    ( 1.28, -0.30),
    ( 1.02,  0.52),
    (-0.10,  0.74),
    (-1.02,  0.44),
    (-1.26, -0.22),
    (-0.72, -0.74),
    ( 0.44, -0.72),
]

# ---------------------------------------------------------------------
#  Levels — scale, lean, twist and wall thickness up the height
#
#  Pairs of levels 0.05 apart are hard setbacks: the plan steps in over
#  almost no height, which cuts a real ledge instead of a taper.
# ---------------------------------------------------------------------

#  Each setback also SHIFTS the plan, so the tower steps in on one side
#  at a time. A setback that only scales reads as a stack of drums.
LEVELS = [
    # y,     scale,  dx,    dz,   twist,  void scale
    (-3.40,  1.00,  0.00,  0.00,   0.0,   0.46),
    (-2.60,  0.97,  0.02,  0.01,   0.4,   0.49),
    (-1.20,  0.90, -0.04,  0.02,   1.2,   0.54),
    ( 0.10,  0.85,  0.00,  0.00,   1.8,   0.56),
    ( 1.20,  0.80,  0.04, -0.03,   2.4,   0.56),
    ( 1.25,  0.68,  0.16, -0.06,   2.4,   0.62),   # setback, west face
    ( 2.40,  0.65,  0.18, -0.09,   3.0,   0.62),
    ( 3.10,  0.60,  0.16, -0.12,   3.4,   0.64),
    ( 3.15,  0.52, -0.06, -0.16,   3.4,   0.66),   # setback, upper works
    ( 3.80,  0.49, -0.12, -0.19,   3.8,   0.66),
    ( 4.10,  0.46, -0.16, -0.22,   4.0,   0.68),
]

# The core void sits back of the plan's centre, so the front wall is deep
# and the spine is reached through depth rather than through a hole.
VOID_OFFSET = (0.0, -0.20)

# The crown is sheared off at an angle before the form is fractured. A
# level top on a tapering plan reads as a lighthouse or a chess piece;
# an angled shear reads as something broken off.
CROWN_CUT = ((0.0, 3.20, -0.20), (0.24, 0.94, 0.24))

# The base is sheared for the same reason. A level bottom shared by every
# ground-touching mass reads as a plinth, a ring or a platform however
# the plan is drawn; a tilted cut plus per-mass height variation reads as
# compression into the ground.
BASE_CUT = ((0.0, -3.14, 0.0), (0.26, 0.93, -0.26))

# ---------------------------------------------------------------------
#  Hero recess
#
#  A shallow, irregular, off-centre channel cut into the front wall. It
#  opens far enough to glimpse the inner spine and no further: it is not
#  a camera passage, not a rectangle and not centred. Gate B derives the
#  real route from here.
# ---------------------------------------------------------------------

RECESS = {
    # Frontal profile, in (x, y). Seven unequal points, leaning.
    "profile": [
        (-0.57, -0.43),
        (-0.08, -0.65),
        ( 0.27, -0.06),
        ( 0.14,  1.08),
        (-0.23,  1.79),
        (-0.65,  1.17),
        (-0.73,  0.21),
    ],
    "z_front": 1.20,
    "z_back": 0.10,
    # The cut narrows as it goes in, so the recess is a wedge rather than
    # a box and never presents four parallel sides.
    "taper": 0.80,
}

# ---------------------------------------------------------------------
#  Fracture planes
#
#  Six authored planes, none of them vertical and none of them parallel.
#  Two are close to horizontal, which is what stacks a mass on top of
#  another instead of standing them side by side as columns.
# ---------------------------------------------------------------------

#  Three of them are close to vertical and three close to horizontal, so
#  the fracture tiles the FRONT ELEVATION. Cutting front-to-back instead
#  hides four of the seven masses behind the other three, which is the
#  same mistake as separating them in depth alone.
CUTS = [
    # name,               point,                    normal
    ("primary-split",       (  0.45,  -0.10,   0.00), (  0.88,   0.14,   0.45)),
    ("east-stack",          (  0.750,   0.20,  -0.10), ( 0.180,  0.940, -0.260)),
    ("east-upper-split",    (  1.00,   1.40,  -0.05), (  0.62,   0.24,   0.75)),
    ("west-columns",        ( -0.82,  -0.10,  -0.05), (  0.80,  -0.10,  -0.59)),
    ("outer-stack",         ( -0.950,   0.25,  -0.10), ( 0.140,  0.960, -0.240)),
    ("inner-stack",         ( -0.200,  -0.05,   0.05), ( 0.220,  0.930, -0.300)),
]

# ---------------------------------------------------------------------
#  The dominant interface — an authored piecewise fracture
#
#  The boundary between dominant A and dominant B used to be one plane,
#  and a plane projects to one straight line: it ran as a single near
#  straight edge for almost half the height, which is the door-leaf seam
#  the gate exists to prevent.
#
#  It is now four complementary sections stacked in height, each with its
#  own normal and its own offset. Because the offsets differ the boundary
#  STEPS at every breakpoint instead of continuing, and because the
#  normals differ the sections run in visibly different directions:
#
#      lower-oblique       dx/dy -0.11   near vertical, leaning east
#      shoulder            dx/dy -0.84   short, strongly raked
#      upper-counter       dx/dy +0.34   raked the other way
#      upper-continuation  dx/dy -0.16   rejoins the primary split
#
#  Mass A takes one side of each section and mass B the other, so the two
#  are complementary by construction and separate only by their authored
#  displacement. The continuation section is not a fourth direction: it
#  returns the fracture to the form's primary split above the dominant
#  pair, without which the sections diverge from their neighbours near
#  the top and open a void that belongs to no mass.
# ---------------------------------------------------------------------

INTERFACE = {
    "a": "DL_FullForm_Outer_03",
    "b": "DL_FullForm_Outer_04",
    # Complementary cells overlap fractionally so no zero-thickness
    # sliver survives between two sections.
    "overlap": 0.002,
    "sections": [
        {
            "name": "lower-oblique",
            "from": None,
            "to": -2.05,
            "point": (0.637, -3.40, 0.30),
            "normal": (0.92, 0.10, 0.38),
        },
        {
            "name": "shoulder",
            "from": -2.05,
            "to": -1.55,
            "outset": 0.11,
            "point": (0.670, -2.05, 0.30),
            "normal": (0.62, 0.52, 0.59),
        },
        {
            "name": "upper-counter",
            "from": -1.55,
            "to": -0.55,
            "point": (0.090, -1.55, 0.30),
            "normal": (0.86, -0.29, 0.42),
        },
        {
            "name": "upper-continuation",
            "from": -0.55,
            "to": None,
            "point": (0.45, -0.10, 0.00),
            "normal": (0.88, 0.14, 0.45),
        },
    ],
}

TIER_FRONT = "front"
TIER_MID = "mid"
TIER_REAR = "rear"

# Each mass is the mother volume intersected with the half-spaces on its
# path through the fracture tree. `True` keeps the side the plane's
# normal points to.
MASSES = [
    {
        "name": "DL_FullForm_Outer_01",
        "note": "outer stack, lower - rear structural, partly concealed",
        "path": [(0, False), (3, False), (4, False)],
        "tier": TIER_REAR,
        "offset": (-0.17, -0.07, -0.25),
        "role": "rear_structural",
    },
    {
        "name": "DL_FullForm_Outer_02",
        "note": "inner stack, upper - supporting mass above the shoulder",
        "path": [(0, False), (3, True), (5, True)],
        "tier": TIER_MID,
        "offset": (-0.09, 0.05, -0.03),
        "role": "supporting",
    },
    {
        "name": "DL_FullForm_Outer_03",
        "note": "inner stack, lower - dominant A, the face the visitor meets",
        "path": [(0, False), (3, True), (5, False)],
        "tier": TIER_FRONT,
        "offset": (0.02, 0.03, 0.26),
        "role": "dominant_a",
    },
    {
        "name": "DL_FullForm_Outer_04",
        "note": "east flank, lower - dominant B, the second reading mass",
        "path": [(0, True), (1, False)],
        "tier": TIER_FRONT,
        "offset": (0.14, -0.13, 0.16),
        "role": "dominant_b",
    },
    {
        "name": "DL_FullForm_Outer_05",
        "note": "east flank, upper inner - supporting",
        "path": [(0, True), (1, True), (2, False)],
        "tier": TIER_MID,
        "offset": (0.12, -0.05, -0.07),
        "role": "supporting",
    },
    {
        "name": "DL_FullForm_Outer_06",
        "note": "east flank, upper outer - supporting",
        "path": [(0, True), (1, True), (2, True)],
        "tier": TIER_MID,
        "offset": (0.21, 0.04, -0.11),
        "role": "supporting",
    },
    {
        "name": "DL_FullForm_Outer_07",
        "note": "outer stack, upper - rear structural, partly concealed",
        "path": [(0, False), (3, False), (4, True)],
        "tier": TIER_REAR,
        "offset": (-0.24, 0.08, -0.28),
        "role": "rear_structural",
    },
]

TIER_DEPTH = {TIER_FRONT: 0, TIER_MID: 1, TIER_REAR: 2}

# ---------------------------------------------------------------------
#  Inner spine — inside the void, glimpsed through the fractures
# ---------------------------------------------------------------------

SPINE = {
    "name": "DL_FullForm_Spine",
    "centre": (0.02, -0.16),
    "plan_scale": 0.26,
    "levels": [
        # y,     scale
        (-3.40,  1.00),
        (-1.60,  0.94),
        ( 0.30,  0.86),
        ( 1.60,  0.74),
        ( 2.20,  0.58),
        ( 2.60,  0.40),
    ],
}

# ---------------------------------------------------------------------
#  Halo guide
#
#  Diameter 3.80 against a 2.54 main width: 1.50x, inside the required
#  1.35-1.70 band and well short of enclosing the frame.
# ---------------------------------------------------------------------

HALO = {
    "name": "DL_Halo",
    "centre": (0.0, 0.45, -1.70),
    "radius": 1.90,
}

# ---------------------------------------------------------------------
#  Hero camera guide — the composition the clay gate is judged in
# ---------------------------------------------------------------------

HERO_CAMERA = {
    "position": (0.0, 0.35, 12.6),
    "target": (0.0, 0.35, 0.0),
    "fov": 39.0,
    # Fraction of frame width the subject is pushed right by a lens
    # shift, leaving the copy column clear on the left.
    "shift": 0.18,
}

# ---------------------------------------------------------------------
#  Evaluation
# ---------------------------------------------------------------------

def _smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def level_at(y):
    """Interpolated (scale, dx, dz, twist, void scale) at height y."""
    if y <= LEVELS[0][0]:
        return LEVELS[0][1:]
    if y >= LEVELS[-1][0]:
        return LEVELS[-1][1:]
    for i in range(len(LEVELS) - 1):
        y0 = LEVELS[i][0]
        y1 = LEVELS[i + 1][0]
        if y0 <= y <= y1:
            t = _smoothstep((y - y0) / max(y1 - y0, 1e-6))
            a = LEVELS[i][1:]
            b = LEVELS[i + 1][1:]
            return tuple(a[k] + (b[k] - a[k]) * t for k in range(len(a)))
    return LEVELS[-1][1:]


def _transform(point, scale, dx, dz, twist):
    x, z = point
    rad = math.radians(twist)
    rx = x * math.cos(rad) - z * math.sin(rad)
    rz = x * math.sin(rad) + z * math.cos(rad)
    return (rx * scale + dx, rz * scale + dz)


def outer_ring(y):
    scale, dx, dz, twist, _ = level_at(y)
    return [_transform(p, scale, dx, dz, twist) for p in PLAN]


def void_ring(y):
    scale, dx, dz, twist, void = level_at(y)
    ox, oz = VOID_OFFSET
    ring = []
    for p in PLAN:
        x, z = _transform(p, scale, dx, dz, twist)
        cx = dx + ox
        cz = dz + oz
        ring.append((cx + (x - cx) * void, cz + (z - cz) * void))
    return ring


def spine_ring(y):
    spec = SPINE
    levels = spec["levels"]
    if y <= levels[0][0]:
        s = levels[0][1]
    elif y >= levels[-1][0]:
        s = levels[-1][1]
    else:
        s = levels[-1][1]
        for i in range(len(levels) - 1):
            y0, s0 = levels[i]
            y1, s1 = levels[i + 1]
            if y0 <= y <= y1:
                t = _smoothstep((y - y0) / max(y1 - y0, 1e-6))
                s = s0 + (s1 - s0) * t
                break
    cx, cz = spec["centre"]
    scale = spec["plan_scale"] * s
    return [(cx + p[0] * scale, cz + p[1] * scale) for p in PLAN]


def to_blender(p):
    """Runtime frame (Y up, +Z front) to Blender (Z up, -Y front)."""
    x, y, z = p
    return (x, -z, y)
