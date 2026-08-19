/**
 * The monument's form, as mathematics. v3: THE FORK, contact-sheet
 * candidate A, chosen dealer's-choice under "igloo bar, monument
 * content, go". Two broad slabs facing the visitor, fused at the foot,
 * a lens of open sky between them, one tip curling over and past the
 * other at the crown.
 *
 * Single source of truth: tools/blender/monument.py mirrors these
 * constants exactly, and the two GLSL blocks in JourneyRenderer inline
 * twist/radius/scale/hook with the same numbers. Change them together
 * or the cells, the camera and the stone part company.
 */

export const FORM_H = 195;
/** total twist base to tip, radians */
export const FORM_PHI = 1.1;
/** base orientation: the gap faces the opening camera; the fork reads */
export const FORM_PHI0 = -0.35;
const TWIST_POW = 1.0;

/**
 * slab cross-section, local units: a = radial is the WIDE axis (the
 * broad face toward the visitor), b = tangential is the thin depth
 * with the edge toward the gap
 */
export const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [11.0, 0.0],
  [8.0, 3.2],
  [2.0, 4.0],
  [-4.5, 3.4],
  [-8.8, 1.7],
  [-8.8, -1.7],
  [-4.5, -3.4],
  [2.0, -4.0],
  [8.0, -3.2]
];

/** blade B stops short of the crown: the tips must not mirror */
export const TIP_T: readonly [number, number] = [1.0, 0.94];

function smoothstep01(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function twistAt(t: number): number {
  return FORM_PHI0 + FORM_PHI * Math.pow(Math.max(t, 1e-6), TWIST_POW);
}

/**
 * distance of each blade centreline from the world Y axis: fused at
 * the base, bowed at the waist, crossing the axis at the crown. The
 * crossing is the interlock.
 */
export function radiusAt(t: number): number {
  return (
    4.0 +
    36.0 * t * Math.pow(Math.max(1 - t, 0), 1.1) -
    11.0 * Math.pow(smoothstep01(0.86, 1.0, t), 1.6)
  );
}

/** tangential lean at the crown so the crossing tips slide past */
export function hookAt(t: number): number {
  return 4.2 * smoothstep01(0.84, 0.97, t);
}

/** cross-section scale: planted at the base, narrow at the tip */
export function scaleAt(t: number): number {
  return (
    (1.2 - 0.92 * Math.pow(Math.max(t, 0), 1.3)) *
    (1 + 0.06 * Math.sin(Math.PI * Math.min(1, 1.15 * t)))
  );
}

/** small deterministic wander so the blades are hewn, not machined */
export function wobbleAt(t: number, side: number): [number, number] {
  return [0.35 * Math.sin(9.3 * t + 2.1 * side), 0.35 * Math.cos(7.7 * t + 1.3 * side)];
}

export interface FormPoint {
  x: number;
  y: number;
  z: number;
}

/** centreline of a blade (side 0 or 1) at normalised height t */
export function prongCentre(t: number, side: 0 | 1): FormPoint {
  const a = twistAt(t) + side * Math.PI;
  const r = radiusAt(t);
  const hk = hookAt(t);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const [wx, wz] = wobbleAt(t, side);
  return { x: r * ca - hk * sa + wx, y: t * FORM_H, z: r * sa + hk * ca + wz };
}

/** frame axes of a blade at height t: radial points away from the axis */
export function prongFrame(
  t: number,
  side: 0 | 1
): { radial: [number, number]; tangential: [number, number] } {
  const a = twistAt(t) + side * Math.PI;
  return {
    radial: [Math.cos(a), Math.sin(a)],
    tangential: [-Math.sin(a), Math.cos(a)]
  };
}

/** direction of open passage through the cleft at height t (unit XZ) */
export function cleftDir(t: number): [number, number] {
  const a = twistAt(t) + Math.PI / 2;
  return [Math.cos(a), Math.sin(a)];
}

const CUM: number[] = (() => {
  const cum = [0];
  for (let i = 0; i < PROFILE.length; i++) {
    const p = PROFILE[i]!;
    const q = PROFILE[(i + 1) % PROFILE.length]!;
    cum.push(cum[i]! + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  return cum;
})();

/** profile perimeter in local units */
export const PERIMETER = CUM[CUM.length - 1]!;

/** point on the profile boundary, u in [0,1) by arc length */
export function profilePoint(u: number): [number, number] {
  const d = (((u % 1) + 1) % 1) * PERIMETER;
  for (let i = 0; i < PROFILE.length; i++) {
    if (d <= CUM[i + 1]!) {
      const p = PROFILE[i]!;
      const q = PROFILE[(i + 1) % PROFILE.length]!;
      const f = (d - CUM[i]!) / Math.max(1e-6, CUM[i + 1]! - CUM[i]!);
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    }
  }
  return [PROFILE[0]![0], PROFILE[0]![1]];
}

/** world position on the blade surface at height t, arc position u */
export function surfacePoint(t: number, side: 0 | 1, u: number): FormPoint {
  const c = prongCentre(t, side);
  const f = prongFrame(t, side);
  const s = scaleAt(t);
  const [a, b] = profilePoint(u);
  return {
    x: c.x + (f.radial[0] * a + f.tangential[0] * b) * s,
    y: c.y,
    z: c.z + (f.radial[1] * a + f.tangential[1] * b) * s
  };
}

/**
 * boundary distance of the profile along local direction (da, db):
 * how far the stone reaches from the centreline that way.
 */
export function profileSupport(da: number, db: number): number {
  const len = Math.hypot(da, db);
  if (len < 1e-6) return 0;
  const dx = da / len;
  const dy = db / len;
  let best = 0;
  for (let i = 0; i < PROFILE.length; i++) {
    const p = PROFILE[i]!;
    const q = PROFILE[(i + 1) % PROFILE.length]!;
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
