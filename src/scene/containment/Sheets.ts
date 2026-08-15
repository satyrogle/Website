/**
 * The entity — five authored surfaces, and nothing derived.
 *
 * These are hand-placed. No field equation, no seeded synthesis, no emergent
 * arrangement: a small number of control points chosen so the silhouette is a
 * decision rather than an outcome. That is the whole point of this file.
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
 * - **Asymmetric.** No two sheets share a scale, a bearing or a length, and
 *   none is centred on the void.
 * - **Interlocking.** They pass through and behind one another around the same
 *   off-centre absence, so the eye resolves one form rather than five ribbons.
 * - **Silhouette first.** Far away the sheets are the shape; the fibres are
 *   found on approach, not before.
 */

export type Vec = [number, number, number];

export interface Sheet {
  name: string;
  /** Open spine. Control points, hand-placed. */
  spine: Vec[];
  /** Half-width at each control point. Varies, so no sheet is a band. */
  width: number[];
  /** Radians of twist at each control point. */
  twist: number[];
  /** How far the surface bows out of its own plane. Vanes, not ribbons. */
  billow: number;
  /** Reference up for the frame, chosen off every axis and off the tangent. */
  up: Vec;
}

/** Centre of the forbidden volume. Must match `ContainmentSynth`'s void. */
export const SEAT: Vec = [0.42, -0.31, 0.55];

export const SHEETS: Sheet[] = [
  {
    // The dominant mass. Sweeps the whole frame and passes in front of the
    // absence; this is the one a thumbnail shows.
    name: 'spar',
    spine: [
      [-5.6, 2.9, -3.1],
      [-2.4, 1.4, -0.4],
      [0.9, -0.2, 1.6],
      [3.6, -1.9, 2.4],
      [5.4, -3.6, 1.2],
    ],
    width: [0.5, 1.5, 2.0, 1.4, 0.4],
    twist: [0.0, 0.5, 1.05, 1.7, 2.3],
    billow: 0.85,
    up: [0.31, 0.83, 0.46],
  },
  {
    // Crosses the spar high and behind it, at a different bearing entirely.
    name: 'cowl',
    spine: [
      [3.9, 3.4, -3.6],
      [1.6, 2.9, -0.8],
      [-0.8, 1.7, 1.5],
      [-3.2, -0.4, 2.6],
      [-4.6, -2.6, 2.0],
    ],
    width: [0.35, 1.15, 1.55, 1.0, 0.3],
    twist: [0.4, -0.2, -0.85, -1.5, -2.0],
    billow: 0.62,
    up: [-0.62, 0.55, 0.56],
  },
  {
    // Dives toward the absence and stops short of it. The gesture that makes
    // the void feel like something rather than like a gap.
    name: 'tongue',
    spine: [
      [-1.2, -3.9, -2.4],
      [-0.4, -2.4, -0.9],
      [0.35, -1.15, 0.35],
      [0.6, -0.5, 1.35],
    ],
    width: [0.28, 0.72, 0.95, 0.6],
    twist: [0.0, 0.35, 0.8, 1.15],
    billow: 0.44,
    up: [0.72, 0.28, -0.63],
  },
  {
    // Wraps behind the absence without closing around it — an arc, not a ring.
    name: 'shroud',
    spine: [
      [2.6, 1.6, -3.4],
      [3.3, 0.1, -1.3],
      [2.9, -1.3, 0.9],
      [1.4, -2.2, 2.5],
    ],
    width: [0.3, 1.05, 1.25, 0.55],
    twist: [-0.3, -0.8, -1.35, -1.9],
    billow: 0.55,
    up: [0.18, -0.74, 0.65],
  },
  {
    // The smallest, threaded between the others near the top. Breaks any
    // remaining symmetry in the group.
    name: 'splint',
    spine: [
      [-3.4, 3.2, 1.9],
      [-1.5, 3.5, 0.2],
      [0.7, 2.9, -1.2],
      [2.5, 1.6, -2.1],
    ],
    width: [0.22, 0.62, 0.7, 0.26],
    twist: [0.9, 1.35, 1.8, 2.25],
    billow: 0.36,
    up: [0.46, 0.16, 0.87],
  },
];

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
  const step = 0.004;
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
  const bow = scale(f.normal, sheet.billow * f.halfWidth * (1 - v * v));
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
