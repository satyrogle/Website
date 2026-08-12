/**
 * The one random stream, and the only one.
 *
 * mulberry32, because the same numbers have to come out in the browser, in the
 * Worker and in node — a determinism claim that only holds on one of the three
 * is not a claim about anything. `Math.random` appears nowhere in the graph,
 * the simulation or the narrative logic; if it appears here later, the site's
 * central proposition becomes false.
 *
 * Streams are taken per subsystem rather than shared, so adding a seeded value
 * to one of them cannot silently reshuffle another.
 */

export type Vec3 = [number, number, number];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [-1, 1]. */
export const signed = (random: () => number): number => random() * 2 - 1;

export const smoothstep = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

export const clamp = (x: number, low: number, high: number): number =>
  x < low ? low : x > high ? high : x;

export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export const normalise = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** The component of `a` perpendicular to the unit vector `axis`. */
export const reject = (a: Vec3, axis: Vec3): Vec3 => {
  const d = dot(a, axis);
  return [a[0] - axis[0] * d, a[1] - axis[1] * d, a[2] - axis[2] * d];
};

/** Rodrigues. Rotates `v` about the unit `axis` by `angle` radians. */
export function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = dot(v, axis);
  const cr = cross(axis, v);
  return [
    v[0] * c + cr[0] * s + axis[0] * d * (1 - c),
    v[1] * c + cr[1] * s + axis[1] * d * (1 - c),
    v[2] * c + cr[2] * s + axis[2] * d * (1 - c),
  ];
}
