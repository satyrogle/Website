/**
 * The monument's form, as mathematics. v4: THE SPLIT SPIRE, from
 * Jacob's reference sheet. One wedge, cut down the centre and parted
 * by a narrow slit, the two halves unequal. Holy above; the slit is
 * the doorway the journey falls through.
 *
 * Single source of truth: tools/blender/monument.py mirrors these
 * constants exactly, and the GLSL in JourneyRenderer inlines the same
 * numbers. Change them together or the cells, the camera and the
 * stone part company.
 *
 * Why analytic and not a boolean sculpt: every surface cell is placed
 * by surfacePoint(), so the runtime has to be able to ask where the
 * stone is. Chips cut with booleans would leave cells hanging in air.
 * Flair therefore lives in the profile and the caps, not in cutters.
 */

export const FORM_H = 195;
/**
 * Half the gap between the halves. It CLOSES with height: a doorway at
 * the foot the journey can walk into, a hairline at the crown. The
 * first version had it opening with height, which left the tips too
 * far apart to read as one split mass.
 */
export const SLIT_BASE = 5.0;
export const SLIT_TOP = 1.1;
export const SLIT = SLIT_BASE;
/** cross-section at the foot */
const BASE_W = 31;
const BASE_D = 17;
/**
 * Fraction of the base section still present at the tip. Width and
 * depth taper separately: a crown that keeps width and loses depth is
 * a blade edge, one that keeps both is a chiselled cap. At 0.05 both
 * tips ended as paper slivers, which is what read as odd.
 */
const TOP_K = 0.1;
const TOP_D = 0.1;
/**
 * Where the celled body stops. Above this the crown breaks into bare
 * shards, which carry no records: the broken part of a monument is the
 * part the system has already lost.
 */
export const TIP_T: readonly [number, number] = [1.0, 0.9];

/**
 * THE FLARE, 2026-08-23, from Jacob's base references.
 *
 * The blades do not meet the plain as a cut - they SPLAY into it, the
 * way a trunk meets ground: vertical for their whole height, then
 * widening hard over the last stretch and running out into the floor.
 * It is the single biggest thing the references have that we did not,
 * and it is why the old base needed furniture around it to look like
 * anything. A form that flares needs nothing beside it; a form that
 * stops needs a plinth to stop ON. That is the whole diagnosis of the
 * stairs and the ruins, both of which were treating a silhouette
 * problem with props.
 *
 * Exponential, so it is a fillet and not a cone: almost nothing left of
 * it by 30 units up, and the fastest widening in the last few units
 * where the eye reads the contact. Below grade it holds the full flared
 * section, which is what makes the foot look driven in rather than
 * placed on.
 */
const FLARE_K = 0.26;
const FLARE_T = 0.030;

function flareAt(t: number): number {
  return 1 + FLARE_K * Math.exp(-Math.max(t, 0) / FLARE_T);
}

/** width taper: how much section survives at height t */
export function sectionAt(t: number): number {
  return (1 - (1 - TOP_K) * Math.max(t, 0)) * flareAt(t);
}

/** depth taper, independent of width */
export function depthSectionAt(t: number): number {
  return (1 - (1 - TOP_D) * Math.max(t, 0)) * flareAt(t);
}

/**
 * The half-section, in local units: a runs outward from the cut
 * plane (negative, away from the slit), b is depth. The polygon
 * closes along the cut face, which is the wall of the fissure.
 */
export const HALF_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.0, 1.0],
  [-0.55, 0.86],
  [-0.9, 0.44],
  [-1.0, 0.0],
  [-0.9, -0.44],
  [-0.55, -0.86],
  [0.0, -1.0]
];

export interface FormPoint {
  x: number;
  y: number;
  z: number;
}

/** sign of a half: side 0 sits at -x, side 1 at +x */
function sgn(side: 0 | 1): number {
  return side === 0 ? -1 : 1;
}

/** the cut face of a half at height t: its x, after tilt */
export function cutPlaneX(t: number, side: 0 | 1): number {
  return sgn(side) * (SLIT_BASE - (SLIT_BASE - SLIT_TOP) * Math.min(1, Math.max(0, t)));
}

/** centre of a half's section at height t (on its cut plane) */
export function prongCentre(t: number, side: 0 | 1): FormPoint {
  return { x: cutPlaneX(t, side), y: t * FORM_H, z: 0 };
}

const CUM: number[] = (() => {
  const cum = [0];
  for (let i = 0; i < HALF_PROFILE.length - 1; i++) {
    const p = HALF_PROFILE[i]!;
    const q = HALF_PROFILE[i + 1]!;
    cum.push(cum[i]! + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  return cum;
})();

/** outer perimeter of the half-section, local units */
export const PERIMETER = CUM[CUM.length - 1]!;

/** point on the outer boundary, u in [0,1] by arc length */
export function profilePoint(u: number): [number, number] {
  const d = Math.min(1, Math.max(0, u)) * PERIMETER;
  for (let i = 0; i < HALF_PROFILE.length - 1; i++) {
    if (d <= CUM[i + 1]!) {
      const p = HALF_PROFILE[i]!;
      const q = HALF_PROFILE[i + 1]!;
      const f = (d - CUM[i]!) / Math.max(1e-6, CUM[i + 1]! - CUM[i]!);
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    }
  }
  const last = HALF_PROFILE[HALF_PROFILE.length - 1]!;
  return [last[0], last[1]];
}

/**
 * THE LOSS, 2026-08-23. Jacob: the hero "looks brand new but it should
 * not, it should look battered rammed and old and ancient".
 *
 * The diagnosis was that the corrosion only ever modulated colour and
 * roughness ON the surface, so it read as a finish - and a finish is a
 * choice, which reads as new. Nothing had ever taken material OFF. An
 * unbroken outline is the single loudest "this was made this morning"
 * signal a form can send, and ours ran clean from foot to tip.
 *
 * So the outer boundary is eaten. This lives in the profile and NOT in
 * boolean cutters, which is the standing law of this file: every cell
 * is placed by surfacePoint, so damage that the runtime cannot ask
 * about would leave cells hanging in the air where the stone used to
 * be. Put it here and the cells, the marks and the camera all follow it
 * for nothing.
 *
 * BRITTLE, never worn. Each chip is one flat facet at one depth with a
 * hard boundary, because this stone breaks; a smooth falloff would
 * round the mass into a pebble and trade new-looking for soft-looking,
 * which is a worse frame. Three scales of chip, each rare, so a few big
 * losses carry the silhouette and the small ones only break the line.
 * A minority of cells break at every scale - a field where most of them
 * did would be a cellular pattern, and a repeating unit is the Voronoi
 * death this project has already paid for once.
 *
 * The rim light needs no separate treatment: a facet turns the normal,
 * so the clean unbroken highlight down every edge - the second half of
 * the same complaint - breaks up on its own.
 */
const CHIP: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // tCell, uCell, chanceOfBreaking, maxDepth, salt
  [0.09, 0.15, 0.13, 0.115, 3],
  [0.034, 0.062, 0.17, 0.052, 11],
  [0.015, 0.04, 0.2, 0.022, 23]
];

function lossHash(x: number, y: number, salt: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function lossNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = lossHash(ix, iy, salt);
  const b = lossHash(ix + 1, iy, salt);
  const c = lossHash(ix, iy + 1, salt);
  const d = lossHash(ix + 1, iy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function ramp(x: number, e0: number, e1: number): number {
  const f = Math.max(0, Math.min(1, (x - e0) / Math.max(1e-6, e1 - e0)));
  return f * f * (3 - 2 * f);
}

/** how much of the section is gone at height t, arc u */
export function lossAt(t: number, u: number): number {
  const [a, b] = profilePoint(u);
  // the cut face lines the fissure and has been sheltered its whole
  // life; the outer corner of the section is what everything has ever
  // hit. This also takes the loss to exactly zero at both ends of the
  // arc, so the two halves still close on the cut plane.
  const exposure = Math.min(1, Math.abs(a) * 1.25);
  if (exposure <= 0.001) return 0;
  const tc = Math.max(0, Math.min(1, t));
  // blasted at the crown, battered at the foot, sheltered between:
  // ageing with no direction reads as a law, and a law reads as new
  const band = 0.3 + 0.85 * ramp(tc, 0.58, 1.0) + 0.6 * (1 - ramp(tc, 0.03, 0.26));
  // and one bearing has taken more of it than the others
  const bearing = 0.62 + 0.38 * b;
  // warped, so the facets are not a grid wearing a costume
  const wt = t + (lossNoise(t * 7.3, u * 5.1, 91) - 0.5) * 0.06;
  const wu = u + (lossNoise(t * 6.1, u * 4.7, 57) - 0.5) * 0.05;
  let loss = 0;
  for (const [ht, hu, chance, depth, salt] of CHIP) {
    const i = Math.floor(wt / ht);
    const j = Math.floor(wu / hu);
    if (lossHash(i, j, salt) > chance) continue;
    // one depth for the whole cell: a facet, not a dent
    loss = Math.max(loss, depth * (0.35 + 0.65 * lossHash(i, j, salt + 1)));
  }
  return Math.min(0.22, loss * exposure * band * bearing);
}

/** world position on a half's outer surface at height t, arc u */
export function surfacePoint(t: number, side: 0 | 1, u: number): FormPoint {
  const [a, b] = profilePoint(u);
  const k = 1 - lossAt(t, u);
  return {
    x: cutPlaneX(t, side) + sgn(side) * -a * BASE_W * sectionAt(t) * k,
    y: t * FORM_H,
    z: b * BASE_D * depthSectionAt(t) * k
  };
}

/** how far the stone reaches outward from the cut plane at height t */
export function reachAt(t: number): number {
  return BASE_W * sectionAt(t);
}

/** depth of the stone at height t */
export function depthAt(t: number): number {
  return BASE_D * depthSectionAt(t);
}

/**
 * The fissure runs north-south through the slit: this is the axis the
 * journey travels along, and it never changes with height, which is
 * exactly why the doorway stays a doorway.
 */
export function cleftDir(_t: number): [number, number] {
  return [0, 1];
}

/** kept for callers that still ask for a frame at a height */
export function prongFrame(
  _t: number,
  side: 0 | 1
): { radial: [number, number]; tangential: [number, number] } {
  return { radial: [sgn(side), 0], tangential: [0, 1] };
}

/** boundary distance from the cut plane along a local direction */
export function profileSupport(da: number, db: number): number {
  const len = Math.hypot(da, db);
  if (len < 1e-6) return 0;
  const dx = da / len;
  const dy = db / len;
  let best = 0;
  for (let i = 0; i < HALF_PROFILE.length - 1; i++) {
    const p = HALF_PROFILE[i]!;
    const q = HALF_PROFILE[i + 1]!;
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const det = dx * -ey - dy * -ex;
    if (Math.abs(det) < 1e-9) continue;
    const r = (p[0] * -ey - p[1] * -ex) / det;
    const s = (dx * p[1] - dy * p[0]) / det;
    if (r > 0 && s >= -1e-6 && s <= 1 + 1e-6) best = Math.max(best, r);
  }
  return best;
}
