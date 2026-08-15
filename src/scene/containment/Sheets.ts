/**
 * The entity — ONE authored surface, and nothing derived.
 *
 * The control data comes from `tools/blender/build-entity.py`
 * — the same numbers that produced the mesh, so the veins lie on the body by
 * construction and the two cannot drift.
 *
 * It was five independently authored sheets, and five objects arranged
 * together read as five objects however carefully they are arranged. The
 * silhouette was countable because the geometry was countable. Now the width
 * pulses along a single spine so lobes grow out of the same body, and every
 * major part flows into another because they are the same sheet at different
 * values of u.
 *
 * The previous form let the causal graph design the hero, and a flow on nested
 * shells can only ever produce shells — raising the density turned strands into
 * fibrous toruses and the macro-read stayed "magnetic field", because that is
 * what the topology was. Simulation topology and visible form are separated
 * here permanently. The graph still propagates; it no longer decides what the
 * thing looks like.
 *
 * Four laws:
 *
 * - **Open, never closed.** Every spine runs from somewhere to somewhere else.
 *   A closed curve wraps a centre, and anything wrapping a centre is a torus
 *   however it is dressed.
 * - **Asymmetric.** No two lobes share a scale, a bearing or a length, and
 *   none is centred on the void.
 * - **Interlocking.** The sheet passes through and behind itself around one
 *   off-centre absence, so the eye resolves one form rather than several
 *   ribbons — and there is nothing to count.
 * - **Silhouette first.** Far away the body is the shape; the fibres are
 *   found on approach, not before.
 */

export type Vec = [number, number, number];

export interface Sheet {
  name: string;
  spine: Vec[];
  width: number[];
  twist: number[];
  /** Per control point, splined — matches the Python exactly. */
  billow: number[];
  up: Vec;
  aperture: { u: number; v: number; ru: number; rv: number };
  /** Shell thickness Blender solidified with. Veins must clear half of it. */
  thickness: number;
}

export interface EntityManifest {
  spine: number[][];
  width: number[];
  twist: number[];
  billow: number[];
  aperture: { u: number; v: number; ru: number; rv: number };
  up: number[];
  thickness: number;
  bounds: { min: number[]; max: number[] };
}

/** Centre of the forbidden volume. */
export const SEAT: Vec = [0.42, -0.31, 0.55];

/** Populated from the manifest before anything is synthesised. */
export const SHEETS: Sheet[] = [];

export function loadSheets(manifest: EntityManifest): void {
  SHEETS.length = 0;
  SHEETS.push({
    name: 'entity',
    spine: manifest.spine.map((p) => [p[0], p[1], p[2]] as Vec),
    width: manifest.width,
    twist: manifest.twist,
    billow: manifest.billow,
    up: [manifest.up[0], manifest.up[1], manifest.up[2]],
    aperture: manifest.aperture,
    thickness: manifest.thickness,
  });
}

/** True where the body has been cut through. No veins hang in the hole. */
export function inAperture(sheet: Sheet, u: number, v: number): boolean {
  const du = (u - sheet.aperture.u) / sheet.aperture.ru;
  const dv = (v - sheet.aperture.v) / sheet.aperture.rv;
  return du * du + dv * dv < 1;
}

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec): Vec => {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / m, a[1] / m, a[2] / m];
};

/** Catmull-Rom through the control points, clamped at both ends. */
function spline(values: number[], t: number): number {
  const n = values.length - 1;
  const s = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(s), n - 1);
  const f = s - i;
  const p0 = values[Math.max(i - 1, 0)];
  const p1 = values[i];
  const p2 = values[i + 1];
  const p3 = values[Math.min(i + 2, n)];
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  );
}

const axis = (sheet: Sheet, i: number): number[] => sheet.spine.map((p) => p[i]);

export interface Frame {
  point: Vec;
  tangent: Vec;
  right: Vec;
  normal: Vec;
  halfWidth: number;
}

/** The spine's frame at u, including the twist. */
export function frameAt(sheet: Sheet, u: number): Frame {
  const t = Math.min(Math.max(u, 0), 1);
  const point: Vec = [
    spline(axis(sheet, 0), t),
    spline(axis(sheet, 1), t),
    spline(axis(sheet, 2), t),
  ];
  // The same step the Blender script differentiates with. The two must agree:
  // the claim this file makes is that the veins lie on the body BY
  // CONSTRUCTION, and a different step is a different frame is a different
  // surface, however slightly.
  const step = 0.0015;
  const ahead: Vec = [
    spline(axis(sheet, 0), Math.min(1, t + step)),
    spline(axis(sheet, 1), Math.min(1, t + step)),
    spline(axis(sheet, 2), Math.min(1, t + step)),
  ];
  const behind: Vec = [
    spline(axis(sheet, 0), Math.max(0, t - step)),
    spline(axis(sheet, 1), Math.max(0, t - step)),
    spline(axis(sheet, 2), Math.max(0, t - step)),
  ];
  const tangent = norm([ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]]);

  let right = norm(cross(tangent, sheet.up));
  let normal = norm(cross(right, tangent));

  // Twist rolls the sheet about its own spine, so a vane presents its face in
  // one place and its edge in another. Without it every sheet reads flat from
  // whichever side the camera happens to be on.
  const angle = spline(sheet.twist, t);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r: Vec = [right[0] * c + normal[0] * s, right[1] * c + normal[1] * s, right[2] * c + normal[2] * s];
  const n: Vec = [normal[0] * c - right[0] * s, normal[1] * c - right[1] * s, normal[2] * c - right[2] * s];
  right = r;
  normal = n;

  return { point, tangent, right, normal, halfWidth: spline(sheet.width, t) };
}

/**
 * A point on the sheet.
 *
 * `v` runs -1 to 1 across the width. The billow bows the surface out of the
 * plane of its own frame, most at the middle and none at the edges, so the
 * cross-section is a shallow arc rather than a straight line — a vane with a
 * front and a back, not a strip of tape.
 */
export function surfacePoint(sheet: Sheet, u: number, v: number, frame?: Frame): Vec {
  const f = frame ?? frameAt(sheet, u);
  const across = scale(f.right, v * f.halfWidth);
  const bow = scale(f.normal, spline(sheet.billow, u) * f.halfWidth * (1 - v * v));
  return add(add(f.point, across), bow);
}

/** Surface normal, from finite differences on the surface itself. */
export function surfaceNormal(sheet: Sheet, u: number, v: number): Vec {
  const e = 0.006;
  const a = surfacePoint(sheet, Math.min(1, u + e), v);
  const b = surfacePoint(sheet, Math.max(0, u - e), v);
  const c = surfacePoint(sheet, u, Math.min(1, v + e));
  const d = surfacePoint(sheet, u, Math.max(-1, v - e));
  return norm(cross([a[0] - b[0], a[1] - b[1], a[2] - b[2]], [c[0] - d[0], c[1] - d[1], c[2] - d[2]]));
}
