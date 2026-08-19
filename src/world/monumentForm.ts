/**
 * The monument's form, as mathematics. Single source of truth: the
 * Blender authoring script (tools/blender/monument.py) mirrors these
 * constants exactly, and the shader inlines twist/radius/scale with the
 * same numbers. Change a constant here and there together or the cells,
 * the camera and the stone part company.
 *
 * The form: two tapering prongs rising from one base, twisting around
 * each other, converging near the tip without touching. Between them a
 * cleft of open air runs the full height, turning with the twist. The
 * qualities are extracted, never copied; the record of what was taken
 * and refused lives in docs/APPROVED_VISUAL_JOURNEY.md (2026-08-19).
 */

export const FORM_H = 195;
/** total twist base to tip, radians */
export const FORM_PHI = 2.4;
/** base orientation: the cleft must not face the opening camera */
export const FORM_PHI0 = 0.55;
const TWIST_POW = 1.08;

/** keel cross-section, local units: a = radial (outward +), b = tangential */
export const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [8.7, 0.0],
  [5.34, 6.26],
  [-2.55, 7.54],
  [-5.22, 3.02],
  [-5.22, -3.02],
  [-2.55, -7.54],
  [5.34, -6.26]
];

/** prong B stops short of the crown: the tips must not mirror */
export const TIP_T: readonly [number, number] = [1.0, 0.962];

export function twistAt(t: number): number {
  return FORM_PHI0 + FORM_PHI * Math.pow(Math.max(t, 1e-6), TWIST_POW);
}

/** distance of each prong centreline from the world Y axis */
export function radiusAt(t: number): number {
  return 12.0 - 8.6 * Math.pow(Math.max(t, 0), 1.6) + 1.8 * Math.sin(Math.PI * t);
}

/** cross-section scale: planted at the base, narrow at the tip */
export function scaleAt(t: number): number {
  return (
    (1.15 - 0.85 * Math.pow(Math.max(t, 0), 1.25)) *
    (1 + 0.12 * Math.sin(Math.PI * Math.min(1, 1.15 * t)))
  );
}

/** small deterministic wander so the prongs are hewn, not machined */
export function wobbleAt(t: number, side: number): [number, number] {
  return [0.35 * Math.sin(9.3 * t + 2.1 * side), 0.35 * Math.cos(7.7 * t + 1.3 * side)];
}

export interface FormPoint {
  x: number;
  y: number;
  z: number;
}

/** centreline of a prong (side 0 or 1) at normalised height t */
export function prongCentre(t: number, side: 0 | 1): FormPoint {
  const a = twistAt(t) + side * Math.PI;
  const r = radiusAt(t);
  const [wx, wz] = wobbleAt(t, side);
  return { x: Math.cos(a) * r + wx, y: t * FORM_H, z: Math.sin(a) * r + wz };
}

/** frame axes of a prong at height t: radial points away from the axis */
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
  const d = ((u % 1) + 1) % 1 * PERIMETER;
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

/** world position on the prong surface at height t, arc position u */
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
    // ray (0,0)+r(dx,dy) against segment p-q
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
