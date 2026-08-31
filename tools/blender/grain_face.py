"""THE GRAIN, frame F3: the fold. Carved, not assembled.

F3 is the frame the whole act rests on. If a visitor cannot point at the seam
before being told, the premise dies.

FIRST APPROACH, ABANDONED after three passes: the wall built as discrete slabs
stacked up, one box per slab. It read as black plastic sheet, then stacked
planks, then a woodpile. Boxes have straight parallel long edges and stone does
not, so no amount of lighting rescued it. That was the masonry error one level
down: making the thing out of units when the picture is ONE thing with a grain
running through it.

THIS APPROACH: a single folded mass whose laminae are CARVED OUT of it by a
stratified erosion field that follows the fold. The slab ends visible in the
approved frame are erosion, not construction.

Everything that worked in the first attempt survives unchanged: the fold field,
the wandering seam, the pinch where beds crowd as they approach it, and the
seeded determinism.

The bed coordinate is written into a UV layer, so the shader lays fine
lamination along the beds and it bends with the fold and crowds at the seam for
free. That is the whole trick.

Run headless:
  "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" --background \
    --factory-startup --python tools/blender/grain_face.py

DETERMINISM, stated precisely because it was over claimed once already.

The GEOMETRY is deterministic: one seeded stream, no clocks, no Blender
randomness. The same seed produces a byte identical vertex list, verified by
the GEOMETRY_SHA this script prints on every run. That is the property the
product depends on, because the mesh is what feeds Three.js.

The RENDER is NOT bitwise reproducible. Two runs at the same seed differ, even
with adaptive sampling disabled and the Cycles seed pinned, because GPU path
tracing accumulates in a non deterministic thread order. The difference is
denoiser level noise and invisible, but it is real, and claiming otherwise
would be the kind of unevidenced determinism claim this project forbids.

A different seed is a different run of the same rule, which is how the plain's
other masses get made.
"""
import bpy
import bmesh
import math
import os
import random
import hashlib
from bisect import bisect_right

# ---- run control -----------------------------------------------------------
SEED = int(os.environ.get("DL_SEED", 20260831))
OUT_DIR = r"C:/Users/jacob/dark-lattice-journey/captures/grain"
OUT_NAME = os.environ.get("DL_OUT", "f3-fold-24.png")
RES = (1586, 992)
SAMPLES = 220

# The rake is the whole lighting trick, so it is tunable without editing the
# file. A sun striking a vertical wall head on is a floodlight; skimming it
# means only outward facing plate edges catch and the flats fall to black.
SUN_ENERGY = float(os.environ.get("DL_SUN", 62.0))
SUN_RZ = float(os.environ.get("DL_RZ", -82.0))     # degrees. -90 is fully grazing.
FILL_ENERGY = float(os.environ.get("DL_FILL", 118.0))
SUN_ANGLE = float(os.environ.get("DL_ANGLE", 5.0))   # degrees. Bigger softens glints.
EXPOSURE = float(os.environ.get("DL_EXPO", -1.55))

NX, NZ = 700, 700          # base form only now: the plates carry the detail

# ---- the wall --------------------------------------------------------------
W = 26.0
H = 19.0
DEPTH = 7.0

SEAM_HALF = 0.075          # hairline. F4 opens this, F3 does not.
SEAM_DEPTH = 0.52          # how far the groove cuts back

PINCH_RANGE = 4.2
PINCH_FLOOR = 0.24

BED_MIN = 0.10             # bed thickness, strongly varied. An even run of one
BED_MAX = 0.85             # thickness is what became courses of blocks.

RUBBLE = 70
PLATE = (2.2, 1.0, 0.18)   # door sized: F3's only scale cue

rng = random.Random(SEED)


def rnd(a, b):
    return a + (b - a) * rng.random()


def smoothstep(a, b, x):
    if b <= a:
        return 0.0
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


# ---- the shape is drawn from the seed, not fixed ---------------------------
# Checked 2026-08-31 and it was wrong. With the fold and the seam hardcoded,
# four seeds produced four walls with the SAME silhouette and the SAME seam,
# differing only in surface noise. That is "same outcome, different texture",
# and a plain built from it would be twenty copies of one shape, which is the
# opposite of what this direction claims. The shape has to come from the seed.
#
# The fixed values that produced captures/grain/f3-fold-24.png, kept as the
# record: FOLD_BASE 4.2, FOLD_TOP 2.6, rise_l 1.30, rise_r 0.32,
# SEAM_X 0.700*W, SEAM_WANDER 0.60, LEDGE 0.40.
FOLD_BASE = rnd(2.6, 5.8)
FOLD_TOP = FOLD_BASE * rnd(0.42, 0.82)
RISE_L = rnd(1.05, 2.45)            # left limb, long and gentle
RISE_R = rnd(0.20, 0.58)            # right limb, short and steep
SEAM_X = rnd(0.34, 0.80) * W
SEAM_WANDER = rnd(0.22, 1.05)
SEAM_F = rnd(0.11, 0.27)
SEAM_PH = rnd(0.0, 6.283)
WOB_A, WOB_B = rnd(0.16, 0.48), rnd(0.06, 0.26)
WOB_F1, WOB_F2 = rnd(0.21, 0.46), rnd(0.62, 1.15)
LEDGE = rnd(0.28, 0.56)
BREAKOUT = rnd(0.42, 0.82)   # deep pockets caught the rake head on and flared


# ---- cheap deterministic value noise ---------------------------------------
PERM = list(range(512))
rng.shuffle(PERM)
PERM = PERM + PERM


def _h(ix, iz, s):
    return PERM[(PERM[(ix + s) & 511] + iz) & 511] / 511.0


def noise2(x, z, s=0):
    ix, iz = math.floor(x), math.floor(z)
    fx, fz = x - ix, z - iz
    fx = fx * fx * (3 - 2 * fx)
    fz = fz * fz * (3 - 2 * fz)
    a = _h(ix, iz, s)
    b = _h(ix + 1, iz, s)
    c = _h(ix, iz + 1, s)
    d = _h(ix + 1, iz + 1, s)
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz


def fbm(x, z, octaves=4, s=0):
    v, amp, f = 0.0, 0.5, 1.0
    for i in range(octaves):
        v += amp * noise2(x * f, z * f, s + i * 37)
        amp *= 0.5
        f *= 2.0
    return v


# ---- the fold --------------------------------------------------------------
def seam_at(z):
    """The seam wanders. Dead straight reads as a control joint."""
    return (SEAM_X
            + SEAM_WANDER * math.sin(z * SEAM_F + SEAM_PH)
            + 0.24 * math.sin(z * 0.63 + SEAM_PH * 0.5))


def fold(x, z):
    """How far a bed is lifted at x. Long and gentle on the left, short and
    steep on the right. Never a mirror: a mirror read as a feather."""
    sx = seam_at(z)
    amp = FOLD_BASE + (FOLD_TOP - FOLD_BASE) * min(1.0, max(0.0, z) / H)
    if x <= sx:
        u = max(0.0, x / max(sx, 0.001))
        rise = u ** RISE_L
    else:
        v = min(1.0, (x - sx) / max(W - sx, 0.001))
        rise = 1.0 - v ** RISE_R
    wobble = WOB_A * math.sin(x * WOB_F1 + z * 0.09) + WOB_B * math.sin(x * WOB_F2 - 1.1)
    return amp * rise + wobble


def pinch(x, z):
    d = abs(x - seam_at(z))
    return PINCH_FLOOR + (1.0 - PINCH_FLOOR) * smoothstep(0.0, PINCH_RANGE, d)


# ---- the bed stack, irregular by construction ------------------------------
def build_beds(lo=-6.0, hi=24.0):
    edges, prot, b = [], [], lo
    while b < hi:
        r = rng.random()
        t = BED_MIN + (BED_MAX - BED_MIN) * (r ** 2.2)
        if rng.random() < 0.11:
            t = BED_MAX * rnd(0.9, 1.35)
        edges.append(b)
        prot.append(rng.random())
        b += t
    edges.append(hi)
    return edges, prot


BED_EDGES, BED_PROT = build_beds()


def bed_index(b):
    i = bisect_right(BED_EDGES, b) - 1
    return min(max(i, 0), len(BED_PROT) - 1)


# ---- the erosion field: this is what carves the laminae out ----------------
def surface_y(x, z):
    """How far the face sits back from y=0.

    HIERARCHY, the pass 11 correction. Uniform lamination everywhere read as
    corduroy, which is the hair failure wearing different clothes. Real rock is
    tiered: a minority of beds JUT and throw hard shadows, and the fine grain
    is only visible inside them. Ledges dominate, laminae are secondary."""
    b = z - fold(x, z)
    n = bed_index(b)
    p = BED_PROT[n]

    # bimodal on purpose. Most beds sit back; a minority stand right out.
    # A smooth distribution gave an even face with no shadow anywhere.
    if p < 0.58:
        step = -0.40 - 0.25 * (p / 0.58)
    else:
        step = 0.30 + 1.55 * (((p - 0.58) / 0.42) ** 1.5)

    # how far a bed juts varies slowly along its own length, but never enough
    # to soften the step at its edge. The step IS the ledge.
    along = 0.86 + 0.28 * fbm(x * 0.30 + n * 13.1, 0.0, 3, 11)
    ledge = step * along * LEDGE

    fray = (fbm(x * 2.6, b * 5.5, 4, 71) - 0.5) * 0.10

    # whole regions where a chunk has come away. Rarer now: it was swamping
    # the ledges with big soft undulation.
    br = fbm(x * 0.15, z * 0.12, 3, 131)
    gone = smoothstep(0.66, 0.86, br) * BREAKOUT

    rough = (fbm(x * 1.6, z * 1.6, 4, 211) - 0.5) * 0.085

    y = ledge + fray + gone + rough

    d = abs(x - seam_at(z))
    y += SEAM_DEPTH * (1.0 - smoothstep(0.0, SEAM_HALF * 3.0, d))
    if d < SEAM_HALF:
        y += SEAM_DEPTH * 1.9
    return y


def bed_uv(x, z):
    """u across the wall, v the UNFOLDED bed height divided by the pinch, so
    laminae crowd as they approach the seam. The shader draws its lamination in
    this space, so it bends with the fold for free."""
    b = z - fold(x, z)
    return (x / W * 3.0, b / max(pinch(x, z), 0.05))


# ---- geometry --------------------------------------------------------------
verts, faces, uvs = [], [], []


def build_face():
    z0, z1 = -3.2, H
    for j in range(NZ):
        z = z0 + (z1 - z0) * j / (NZ - 1)
        for i in range(NX):
            x = -1.0 + (W + 2.0) * i / (NX - 1)
            verts.append((x, surface_y(x, z), z))
            uvs.append(bed_uv(x, z))
    for j in range(NZ - 1):
        r0, r1 = j * NX, (j + 1) * NX
        for i in range(NX - 1):
            faces.append((r0 + i, r0 + i + 1, r1 + i + 1, r1 + i))

    # A skirt straight down from the bottom row, well below the ground line.
    # Without it the camera can look UNDER the wall into brightly lit rubble,
    # which reads as a hole punched through the rock. The alpha test says it is
    # not a hole and it is not: it is a cavity, and a cavity has to be closed.
    skirt = len(verts)
    for i in range(NX):
        x, y, _ = verts[i]
        verts.append((x, y, -9.0))
        uvs.append(uvs[i])
    for i in range(NX - 1):
        faces.append((i, skirt + i, skirt + i + 1, i + 1))


def box(corners, uvco):
    i = len(verts)
    verts.extend(corners)
    uvs.extend(uvco)
    faces.extend([
        (i + 0, i + 1, i + 2, i + 3), (i + 7, i + 6, i + 5, i + 4),
        (i + 0, i + 4, i + 5, i + 1), (i + 1, i + 5, i + 6, i + 2),
        (i + 2, i + 6, i + 7, i + 3), (i + 3, i + 7, i + 4, i + 0),
    ])


# ---- the plate layer -------------------------------------------------------
# The pass 13 correction, and the one that matters. Assembled boxes gave plate
# edges but no continuous mass, so it was a woodpile. A displaced sheet gives a
# continuous mass but nothing sticks out, so it was folded fabric. The approved
# frame is BOTH: one folded mass whose surface has shattered into plates that
# stand out of it. Base form from the erosion field, plates scattered on top,
# every one lying along the bedding and tipped out into the light.

PLATE_STEP_B = 0.06        # spacing up the bed stack
PLATE_STEP_X = 0.12        # spacing along each bed
PLATE_FILL = 0.58          # not every slot: gaps are where the rock is sound


def bed_tangent(x, z):
    """Direction the bedding runs at this point, in the plane of the wall."""
    h = 0.05
    dz = (fold(x + h, z) - fold(x - h, z)) / (2.0 * h)
    n = math.sqrt(1.0 + dz * dz)
    return (1.0 / n, 0.0, dz / n)


def build_plates():
    b = -3.0
    made = 0
    while b < 16.0:
        x = -1.0
        while x < W + 1.0:
            xj = x + rnd(-0.045, 0.045)
            bj = b + rnd(-0.022, 0.022)
            # solve z once: z sits at the bed height plus however far the fold
            # lifts it there
            z = bj + fold(xj, bj)
            z = bj + fold(xj, z)

            d = abs(xj - seam_at(z))
            br = fbm(xj * 0.15, z * 0.12, 3, 131)
            # no plates inside the seam, and fewer where a chunk tore away and
            # left fresh fracture behind
            patch = 0.30 + 1.05 * fbm(xj * 0.09, z * 0.08, 3, 401)
            if d > SEAM_HALF * 2.2 and rng.random() < PLATE_FILL * patch * (1.0 - 1.0 * smoothstep(0.58, 0.80, br)):
                y = surface_y(xj, z) - rnd(0.015, 0.10)
                ax, _, az = bed_tangent(xj, z)
                cx, cz = az, -ax                      # across the bed, in wall
                th = (0.04 + 0.50 * (rng.random() ** 2.0)) * (0.5 + 0.5 * pinch(xj, z))
                ct, st = math.cos(th), math.sin(th)
                # tip the plate out of the wall about its own bed direction
                c2 = (cx * ct, -st, cz * ct)
                n2 = (-cx * st, -ct, -cz * st)
                g = rng.random()
                L = 0.09 + 1.25 * (g ** 2.4)
                Hh = 0.030 + 0.215 * (g ** 1.9)
                T = 0.009 + 0.046 * (g ** 1.5)
                pts = []
                for du in (-0.5, 0.5):
                    for dv in (-0.5, 0.5):
                        for dn in (-0.5, 0.5):
                            pts.append((
                                xj + ax * du * L + c2[0] * dv * Hh + n2[0] * dn * T,
                                y + c2[1] * dv * Hh + n2[1] * dn * T,
                                z + az * du * L + c2[2] * dv * Hh + n2[2] * dn * T))
                o = [pts[0], pts[2], pts[6], pts[4], pts[1], pts[3], pts[7], pts[5]]
                uvv = bj / max(pinch(xj, z), 0.05)
                uo = [(xj / W * 3.0, uvv)] * 8
                box(o, uo)
                made += 1
            x += PLATE_STEP_X
        b += PLATE_STEP_B
    return made


def build_rubble():
    """Door sized plates heaped at the foot. Sand grit was tried twice and
    failed twice, so this is the scale cue."""
    for _ in range(RUBBLE):
        px = rnd(-1.0, W + 1.0)
        py = rnd(-9.0, 0.6)
        pz = -1.45 + 1.15 * (rng.random() ** 2.6)
        sx, sy, sz = (PLATE[0] * rnd(0.5, 1.3), PLATE[1] * rnd(0.55, 1.45),
                      PLATE[2] * rnd(0.55, 1.7))
        ang, lean = rnd(0, math.tau), rnd(-0.8, 0.8)
        ca, sa = math.cos(ang), math.sin(ang)
        cl, sl = math.cos(lean), math.sin(lean)
        pts = []
        for dx in (-0.5, 0.5):
            for dy in (-0.5, 0.5):
                for dz in (-0.5, 0.5):
                    lx, ly, lz = dx * sx, dy * sy, dz * sz
                    rx, ry = lx * ca - ly * sa, lx * sa + ly * ca
                    pts.append((px + rx, py + ry * cl - lz * sl,
                                pz + ry * sl + lz * cl))
        o = [pts[0], pts[2], pts[6], pts[4], pts[1], pts[3], pts[7], pts[5]]
        uo = [(px / W * 3.0, pz + (-0.5 if k < 4 else 0.5) * sz) for k in range(8)]
        box(o, uo)


def build_backdrop():
    """A dark slab right behind the face.

    Solidify had to go, because it would have made every plate seven metres
    thick. That left the wall as a single surface with nothing behind it, so a
    deep breakout plus a deep seam groove let the camera see straight through to
    the world background: proven by rendering the background magenta and finding
    magenta pixels in the flare. Two guesses before that, the floor coat and the
    plates in the breakout, were both wrong."""
    i = len(verts)
    y = DEPTH * 0.55
    verts.extend([(-14.0, y, -8.0), (W + 14.0, y, -8.0),
                  (W + 14.0, y, H + 8.0), (-14.0, y, H + 8.0)])
    uvs.extend([(0, 0), (3, 0), (3, 8), (0, 8)])
    faces.append((i, i + 1, i + 2, i + 3))


def build_ground():
    """Broken plate litter, not a plane. A flat plane caught the sky and went
    pale, which inverted the frame: this world is light inside black."""
    step = 0.55
    nx = int((W + 14.0) / step)
    ny = int(26.0 / step)
    base = len(verts)
    for j in range(ny):
        y = -18.0 + j * step
        for i in range(nx):
            x = -7.0 + i * step
            h = -1.55 + (fbm(x * 1.9, y * 1.9, 4, 307) - 0.5) * 0.42
            verts.append((x, y, h))
            uvs.append((x / W * 3.0, h * 3.0))
    for j in range(ny - 1):
        r0, r1 = base + j * nx, base + (j + 1) * nx
        for i in range(nx - 1):
            faces.append((r0 + i, r0 + i + 1, r1 + i + 1, r1 + i))


# ---- shading ---------------------------------------------------------------
def slate_material(name="slate", lo=0.028, hi=0.095, wet=True):
    """Two instances: the broken face, and the darker litter at its foot. They
    shared one material until pass 8, which made the floor impossible to
    balance against the wall."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")

    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "bed"
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 7.0, 1.0)    # roughly 14cm laminae

    lam = nt.nodes.new("ShaderNodeTexWave")
    lam.wave_type = "BANDS"
    lam.bands_direction = "Y"
    lam.wave_profile = "SAW"
    lam.inputs["Scale"].default_value = 1.0
    lam.inputs["Distortion"].default_value = 3.4
    lam.inputs["Detail"].default_value = 6.0
    lam.inputs["Detail Scale"].default_value = 1.6

    lam2 = nt.nodes.new("ShaderNodeTexWave")   # coarser sheeting over the top
    lam2.wave_type = "BANDS"
    lam2.bands_direction = "Y"
    lam2.wave_profile = "SAW"
    lam2.inputs["Scale"].default_value = 0.26
    lam2.inputs["Distortion"].default_value = 2.0
    lam2.inputs["Detail"].default_value = 4.0

    grit = nt.nodes.new("ShaderNodeTexNoise")
    grit.inputs["Scale"].default_value = 90.0
    grit.inputs["Detail"].default_value = 8.0
    grit.inputs["Roughness"].default_value = 0.7

    blotch = nt.nodes.new("ShaderNodeTexNoise")
    blotch.inputs["Scale"].default_value = 3.2
    blotch.inputs["Detail"].default_value = 6.0

    b1 = nt.nodes.new("ShaderNodeBump")
    b1.inputs["Strength"].default_value = 0.55
    b1.inputs["Distance"].default_value = 0.055
    b2 = nt.nodes.new("ShaderNodeBump")
    b2.inputs["Strength"].default_value = 0.60
    b2.inputs["Distance"].default_value = 0.14
    b3 = nt.nodes.new("ShaderNodeBump")
    b3.inputs["Strength"].default_value = 0.25
    b3.inputs["Distance"].default_value = 0.008

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[1].position = 0.80
    if os.environ.get("DL_DEBUG_MAT") and not wet:
        # tint the floor material so it can be identified in the frame
        ramp.color_ramp.elements[0].color = (0.35, 0.0, 0.0, 1)
        ramp.color_ramp.elements[1].color = (0.55, 0.0, 0.0, 1)
    else:
        ramp.color_ramp.elements[0].color = (lo, lo, lo, 1)
        ramp.color_ramp.elements[1].color = (hi, hi, hi * 0.96, 1)

    rr = nt.nodes.new("ShaderNodeValToRGB")
    rr.color_ramp.elements[0].position = 0.15
    _rlo = float(os.environ.get("DL_RLO", 0.09)) if wet else 0.55
    rr.color_ramp.elements[0].color = (_rlo, _rlo, _rlo, 1)
    rr.color_ramp.elements[1].position = 0.90
    rr.color_ramp.elements[1].color = (0.38, 0.38, 0.38, 1)

    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.55

    # a wet film, and it is patchy: uniform gloss reads as plastic, which is
    # the failure this whole surface started with
    wetn = nt.nodes.new("ShaderNodeTexNoise")
    wetn.inputs["Scale"].default_value = 1.7
    wetn.inputs["Detail"].default_value = 5.0
    wramp = nt.nodes.new("ShaderNodeValToRGB")
    wramp.color_ramp.elements[0].position = 0.26
    wramp.color_ramp.elements[0].color = (0.12, 0.12, 0.12, 1)
    wramp.color_ramp.elements[1].position = 0.64
    wramp.color_ramp.elements[1].color = (0.88, 0.88, 0.88, 1)
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = float(os.environ.get("DL_COAT", 0.06))
    if "Coat IOR" in bsdf.inputs:
        bsdf.inputs["Coat IOR"].default_value = 1.33

    L = nt.links.new
    # The floor is loose fines and broken plate, not polished rock. Giving it
    # the wall's wet coat made it a mirror for the sky light, so any gap at
    # the foot of the wall flared white: 0.6 percent of the frame on seed 4417.
    if wet:
        L(wetn.outputs["Fac"], wramp.inputs["Fac"])
        if "Coat Weight" in bsdf.inputs:
            L(wramp.outputs["Color"], bsdf.inputs["Coat Weight"])
    elif "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.0
    L(uv.outputs["UV"], mp.inputs["Vector"])
    L(mp.outputs["Vector"], lam.inputs["Vector"])
    L(mp.outputs["Vector"], lam2.inputs["Vector"])
    L(blotch.outputs["Fac"], ramp.inputs["Fac"])
    L(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    L(grit.outputs["Fac"], rr.inputs["Fac"])
    L(rr.outputs["Color"], bsdf.inputs["Roughness"])
    L(grit.outputs["Fac"], b3.inputs["Height"])
    L(b3.outputs["Normal"], b2.inputs["Normal"])
    L(lam2.outputs["Fac"], b2.inputs["Height"])
    L(b2.outputs["Normal"], b1.inputs["Normal"])
    L(lam.outputs["Fac"], b1.inputs["Height"])
    L(b1.outputs["Normal"], bsdf.inputs["Normal"])
    L(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


# ---- scene -----------------------------------------------------------------
def build_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    build_face()
    face_polys_n = len(faces)
    n_plates = build_plates()
    plate_end = len(faces)
    build_rubble()
    build_ground()
    build_backdrop()

    me = bpy.data.meshes.new("grain_face")
    me.from_pydata(verts, [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()

    uvl = me.uv_layers.new(name="bed")
    for loop in me.loops:
        uvl.data[loop.index].uv = uvs[loop.vertex_index]
    for poly in me.polygons:
        poly.use_smooth = False

    ob = bpy.data.objects.new("grain_face", me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(slate_material("slate_face"))
    ob.data.materials.append(slate_material("slate_floor", 0.007, 0.026, wet=False))
    for poly in me.polygons:
        poly.material_index = 0 if poly.index < plate_end else 1


    world = bpy.data.worlds.new("w")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.018, 0.020, 0.024, 1)

    sun = bpy.data.lights.new("rake", type="SUN")
    sun.energy = SUN_ENERGY
    sun.angle = math.radians(SUN_ANGLE)
    sun.color = (0.99, 0.98, 0.97)
    so = bpy.data.objects.new("rake", sun)
    so.rotation_euler = (math.radians(80.0), 0.0, math.radians(SUN_RZ))
    bpy.context.collection.objects.link(so)

    fill = bpy.data.lights.new("fill", type="AREA")
    fill.energy = FILL_ENERGY
    fill.size = 62.0
    fill.color = (0.88, 0.90, 0.95)
    fo = bpy.data.objects.new("fill", fill)
    fo.location = (W * 0.40, -34.0, 9.5)
    fo.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    bpy.context.collection.objects.link(fo)

    cam = bpy.data.cameras.new("cam")
    cam.lens = 38.0
    co = bpy.data.objects.new("cam", cam)
    co.location = (W * 0.44, -21.5, 4.9)
    co.rotation_euler = (math.radians(89.5), 0.0, 0.0)
    bpy.context.collection.objects.link(co)
    bpy.context.scene.camera = co
    return ob, n_plates


def render(ob, n_plates):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:
        print("GPU unavailable, CPU:", e)
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    # Adaptive sampling stops each tile on a noise threshold, and tile
    # scheduling varies run to run, so it makes the image non reproducible.
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.seed = 0
    # cap runaway direct samples: wet low roughness plates at a grazing sun
    # throw fireflies, and one unlucky orientation can blow a whole pocket
    sc.cycles.sample_clamp_direct = 12.0
    sc.cycles.sample_clamp_indirect = 6.0
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = EXPOSURE
    # DL_HOLES renders with a transparent film, so any pixel with zero alpha
    # is a genuine gap in the geometry. A magenta world does not work as a
    # leak test, because it lights the scene as well as showing through.
    if os.environ.get("DL_HOLES"):
        sc.render.film_transparent = True
        sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.file_format = "PNG"
    os.makedirs(OUT_DIR, exist_ok=True)
    sc.render.filepath = os.path.join(OUT_DIR, OUT_NAME)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg).to_mesh()
    gh = hashlib.sha256(repr([tuple(round(c, 6) for c in v) for v in verts]).encode()).hexdigest()
    print(f"GEOMETRY_SHA {gh[:24]}")
    print(f"plates={n_plates} beds={len(BED_PROT)} "
          f"authored_faces={len(faces)} evaluated_faces={len(ev.polygons)} "
          f"uv={[l.name for l in ev.uv_layers]}")
    bpy.ops.render.render(write_still=True)
    print("WROTE", sc.render.filepath)


if __name__ == "__main__":
    o, np_ = build_scene()
    render(o, np_)
