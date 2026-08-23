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

/** world position on a half's outer surface at height t, arc u */
export function surfacePoint(t: number, side: 0 | 1, u: number): FormPoint {
  const [a, b] = profilePoint(u);
  return {
    x: cutPlaneX(t, side) + sgn(side) * -a * BASE_W * sectionAt(t),
    y: t * FORM_H,
    z: b * BASE_D * depthSectionAt(t)
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
