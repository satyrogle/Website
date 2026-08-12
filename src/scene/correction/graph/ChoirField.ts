/**
 * ChoirField — the law.
 *
 * Every blade in the choir has a correct position and a correct orientation
 * because of this field. The field is what the visitor is actually looking at:
 * not an object, but thousands of separate things all obeying the same rule,
 * where the rule itself is invisible. That is why the correction means
 * anything — a deviation is a blade that has stopped obeying, and the
 * correction is the system putting it back on the law.
 *
 *     F(p) = D̂ + P(p) + R(p)
 *
 *     D̂     one global direction, diagonal to every world axis
 *     P(p)  low-frequency shear, varying with depth so different layers of the
 *           field peel around the absence differently
 *     R(p)  deflection away from the forbidden volume: the inward component of
 *           the flow is cancelled and a bounded outward push is added, both
 *           fading to nothing at the edge of the influence shell
 *
 * Why it is built this way rather than as a corona
 * ------------------------------------------------
 * The obvious way to build a halo is to arrange elements around a centre. Every
 * previous direction here died of that: an arrangement around a centre resolves
 * into concentric rings from some camera angle, and once the viewer has seen a
 * ring the whole thing is a portal. Founder ruling, 2026-08-12: keep the halo
 * perceptually, remove the radial geometry underneath it.
 *
 * So nothing orbits anything. The flow is one-way, and the absence is a region
 * the flow is forbidden to enter — an obstacle in a current, not a centre of
 * rotation. Streamlines part around it and rejoin downstream, which is a lens,
 * not an annulus. The aureole the eye reports is an accident of three things
 * this file guarantees and never draws: blades crowd where the flow is squeezed
 * past the volume, they turn tangent to its boundary as they pass, and their
 * edges catch the light hardest where they turn.
 *
 * The invariant that makes it a proof rather than a hope
 * -----------------------------------------------------
 * `dot(F, D̂) ≥ minAlignment · |F|` everywhere in the populated domain, checked
 * on a dense grid at synthesis. Its consequence is that the coordinate along D̂
 * increases strictly along every streamline, so no streamline can ever return
 * to a point it has left. Closed circulation is not discouraged here, it is
 * arithmetically impossible — which is a different and much stronger thing than
 * an instruction not to write `angle = i / count * TAU`.
 */

import {
  type Vec3,
  add,
  clamp,
  cross,
  dot,
  length,
  mulberry32,
  normalise,
  reject,
  scale,
  signed,
  smoothstep,
  sub,
} from './random';

/** One ellipsoid of the forbidden volume, in field coordinates. */
export interface LobeConfig {
  /** Centre as (along, wide, lift). */
  centre: Vec3;
  /** Semi-axes before tilt. */
  radii: Vec3;
  /** Tilt in radians, applied x then y then z. Nothing is axis-aligned. */
  tilt: Vec3;
}

export interface ChoirFieldConfig {
  seed: number;
  /**
   * The global flow direction, in world space.
   *
   * Diagonal to all three world axes on purpose: a flow along an axis gives the
   * camera a pose from which the field flattens into a front elevation, and a
   * front elevation of a parted flow is a keyhole.
   */
  flow: Vec3;
  /** Half-extents of the populated domain along (flow, wide, lift). */
  extent: Vec3;
  /** Shear terms. Perpendicular to the flow by construction. */
  curl: {
    /** Hard ceiling on |P|. Bounded because the invariant depends on it. */
    amplitude: number;
    /** Wavelengths of the three terms, in world units. */
    wavelengths: [number, number, number];
    /**
     * How much the shear phase advances across the depth of the field. This is
     * what makes different depth layers peel around the absence differently
     * rather than all shearing as one slab.
     */
    depthPhase: number;
  };
  /** The forbidden volume: a soft union of tilted ellipsoids. */
  lobes: LobeConfig[];
  /** Blend radius of the soft union. Larger is one smoother body. */
  lobeBlend: number;
  /** Thickness of the influence shell outside the volume, in world units. */
  shell: number;
  /** Fraction of the inward flow component cancelled at the surface. */
  divert: number;
  /** Outward push at the surface, in units of |D̂|. */
  push: number;
  /** The flow invariant. Anything below this is a stop. */
  minAlignment: number;
}

/**
 * The choir's law as shipped.
 *
 * The volume is three tilted ellipsoids, none axis-aligned, none concentric
 * with another, sitting off-centre in all three field coordinates. It is not a
 * sphere for the same reason the field is not a corona: a sphere seen against a
 * parted flow has one radius, and one radius is a ring waiting for a camera.
 */
export const DEFAULT_FIELD: ChoirFieldConfig = {
  seed: 0x0cd0_51a7,
  flow: [1.0, 0.14, -0.38],
  extent: [10.5, 4.6, 4.8],
  curl: {
    // Low. At 0.45 the flow wandered by nearly twenty-five degrees everywhere
    // and the choir read as grass in wind — every blade leaning somewhere
    // slightly different, which is disorder however smoothly it varies. The
    // opening has to read as control first. Held at 0.22 the field is close to
    // combed across most of its extent, and the hard turning is reserved for
    // the blades forced around the absence — so the one place the law is
    // visibly straining is the one place the eye is meant to go.
    amplitude: 0.22,
    wavelengths: [9.5, 5.2, 3.1],
    depthPhase: 1.35,
  },
  // Sitting toward the camera's side of the field rather than behind it.
  //
  // Placed on the far side first, where it was invisible: an absence only reads
  // as an absence if the sightline into it is not already full of blades. Near
  // the eye there is almost nothing in front of it, and what lies beyond is the
  // thinning downstream end — so the hole stays dark while the crowd forced
  // around its edge stays lit.
  // Elongated across the flow, which is also roughly the direction the camera
  // looks from.
  //
  // A compact void inside a slab of blades is invisible: the sightline into it
  // passes through the empty region and straight on into everything behind,
  // so the hole fills with the far field and reads as slightly thinner
  // texture. Drawn out along the line of sight, the aperture is genuinely
  // empty all the way through and reads as an absence.
  //
  // It is not a tunnel and must never become one. Three lobes at different
  // tilts, none concentric, give an irregular silhouette with no single
  // radius; the density mask breaks the crowd around it into arcs; a third of
  // it is cropped past the frame edge. What is forbidden is a rim, not a hole.
  lobes: [
    // Offset away from the eye along its own long axis. Centred on the field,
    // the aperture's near end sat between the camera and everything else, so
    // the crowd forced around that end was simultaneously the closest thing in
    // the frame and the brightest — a pale knot in the corner with no apparent
    // cause. Pushed back, what the eye meets is the opening, and the cavity
    // runs away from it into the dark.
    { centre: [-5.8, 2.1, 2.4], radii: [3.4, 5.8, 2.9], tilt: [0.34, -0.52, 0.21] },
    { centre: [-3.7, 3.0, 1.6], radii: [2.4, 4.4, 2.2], tilt: [-0.22, 0.31, -0.44] },
    { centre: [-7.6, 1.2, 3.5], radii: [2.0, 3.8, 1.7], tilt: [0.55, 0.18, 0.37] },
  ],
  lobeBlend: 1.1,
  // Thin. At 1.85 half the choir counted as shell, so the extra edge light and
  // the extra density applied nearly everywhere and there was no aureole,
  // only a slightly brighter field. The rim has to be a minority of the blades
  // or it is not a rim.
  shell: 1.2,
  divert: 1.0,
  push: 0.42,
  minAlignment: 0.35,
};

/** A 3×3 rotation as three rows, built from x-then-y-then-z tilt. */
function rotation(tilt: Vec3): [Vec3, Vec3, Vec3] {
  const [cx, cy, cz] = [Math.cos(tilt[0]), Math.cos(tilt[1]), Math.cos(tilt[2])];
  const [sx, sy, sz] = [Math.sin(tilt[0]), Math.sin(tilt[1]), Math.sin(tilt[2])];
  return [
    [cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz],
    [cy * sz, cx * cz + sx * sy * sz, -cz * sx + cx * sy * sz],
    [-sy, cy * sx, cx * cy],
  ];
}

interface Lobe {
  /** Centre in world space. */
  centre: Vec3;
  /** Rows of the inverse rotation — world direction into lobe-local. */
  inverse: [Vec3, Vec3, Vec3];
  radii: Vec3;
  /** Smallest semi-axis, the scale the distance approximation is metric in. */
  minRadius: number;
}

interface CurlTerm {
  /** Wave vector. */
  k: Vec3;
  /** Displacement direction, perpendicular to the flow. */
  direction: Vec3;
  phase: number;
  weight: number;
}

export class ChoirField {
  readonly config: ChoirFieldConfig;

  /** D̂ — the flow direction. */
  readonly axis: Vec3;
  /** The wide axis: horizontal, across the flow. */
  readonly wide: Vec3;
  /** The lift axis, completing a right-handed frame. */
  readonly lift: Vec3;

  private readonly lobes: Lobe[];
  private readonly terms: CurlTerm[];

  constructor(config: ChoirFieldConfig = DEFAULT_FIELD) {
    this.config = config;
    this.axis = normalise(config.flow);

    // The frame is derived from the flow rather than authored, so a change to
    // the flow direction cannot leave the domain, the volume and the camera
    // describing three different worlds.
    this.wide = normalise(cross(this.axis, [0, 1, 0]));
    this.lift = normalise(cross(this.wide, this.axis));

    const random = mulberry32(config.seed);

    this.lobes = config.lobes.map((lobe) => {
      const rows = rotation(lobe.tilt);
      return {
        centre: this.toWorld(lobe.centre),
        // The transpose is the inverse for a rotation: rows of the transpose
        // are columns of the original.
        inverse: [
          [rows[0][0], rows[1][0], rows[2][0]],
          [rows[0][1], rows[1][1], rows[2][1]],
          [rows[0][2], rows[1][2], rows[2][2]],
        ],
        radii: lobe.radii,
        minRadius: Math.min(lobe.radii[0], lobe.radii[1], lobe.radii[2]),
      };
    });

    // Shear terms. Each displaces perpendicular to the flow, so the shear can
    // bend the field without ever slowing it down the axis — which is half of
    // why the invariant holds by construction rather than by luck.
    this.terms = config.curl.wavelengths.map((wavelength, index) => {
      const kDirection = normalise([signed(random), signed(random), signed(random)]);
      const direction = normalise(reject([signed(random), signed(random), signed(random)], this.axis));
      return {
        k: scale(kDirection, (Math.PI * 2) / wavelength),
        direction,
        phase: random() * Math.PI * 2,
        // Coarse terms carry most of the shear; fine terms add texture without
        // becoming vorticity. A field with strong small-scale curl produces
        // tangles, and a tangle is the decorative network this replaced.
        weight: 1 / (index + 1),
      };
    });
  }

  /** Field coordinates (along, wide, lift) to world space. */
  toWorld(local: Vec3): Vec3 {
    return [
      this.axis[0] * local[0] + this.wide[0] * local[1] + this.lift[0] * local[2],
      this.axis[1] * local[0] + this.wide[1] * local[1] + this.lift[1] * local[2],
      this.axis[2] * local[0] + this.wide[2] * local[1] + this.lift[2] * local[2],
    ];
  }

  /** World space to field coordinates. */
  toLocal(world: Vec3): Vec3 {
    return [dot(world, this.axis), dot(world, this.wide), dot(world, this.lift)];
  }

  /**
   * Distance to the surface of the forbidden volume: negative inside, zero on
   * it, positive outside.
   *
   * An approximation — the ellipsoid term underestimates true distance away
   * from the surface — which is correct for what it is used for. Nothing here
   * needs a metric distance; the shell falloff and the rejection test both only
   * need a smooth field with the right sign and a usable gradient.
   */
  distance(p: Vec3): number {
    let soft = 0;
    const k = 1 / Math.max(this.config.lobeBlend, 1e-3);

    for (const lobe of this.lobes) {
      const d = sub(p, lobe.centre);
      const local: Vec3 = [
        dot(d, lobe.inverse[0]),
        dot(d, lobe.inverse[1]),
        dot(d, lobe.inverse[2]),
      ];
      const q: Vec3 = [
        local[0] / lobe.radii[0],
        local[1] / lobe.radii[1],
        local[2] / lobe.radii[2],
      ];
      const distance = (length(q) - 1) * lobe.minRadius;
      soft += Math.exp(-k * distance);
    }

    // Smooth union, so the three lobes read as one irregular body rather than
    // as three balls with visible creases between them.
    return -Math.log(soft) / k;
  }

  /** Outward unit normal of the volume, by central differences. */
  gradient(p: Vec3): Vec3 {
    const h = 0.05;
    const gx = this.distance([p[0] + h, p[1], p[2]]) - this.distance([p[0] - h, p[1], p[2]]);
    const gy = this.distance([p[0], p[1] + h, p[2]]) - this.distance([p[0], p[1] - h, p[2]]);
    const gz = this.distance([p[0], p[1], p[2] + h]) - this.distance([p[0], p[1], p[2] - h]);
    return normalise([gx, gy, gz]);
  }

  /** P(p) — the shear. Perpendicular to the flow, bounded, depth-varying. */
  shear(p: Vec3): Vec3 {
    // Phase advances with depth across the field, so layers at different
    // depths peel around the absence at different moments instead of moving as
    // one slab. This is the only reason the field has interior structure to
    // parallax against.
    const depth = dot(p, this.lift) / Math.max(this.config.extent[2], 1e-3);
    const offset = depth * this.config.curl.depthPhase;

    let out: Vec3 = [0, 0, 0];
    for (const term of this.terms) {
      const wave = Math.sin(dot(p, term.k) + term.phase + offset);
      out = add(out, scale(term.direction, wave * term.weight));
    }

    // Bounded rather than trusted: the invariant's proof assumes |P| ≤ amplitude.
    const l = length(out);
    const ceiling = this.config.curl.amplitude;
    return l > ceiling ? scale(out, ceiling / l) : out;
  }

  /**
   * The deflection, applied.
   *
   * Inside the shell the flow's inward component is removed and a bounded
   * outward push is added, both fading smoothly to nothing at the shell's outer
   * edge. Outside the shell this returns the incoming flow untouched, so the
   * far field knows nothing about the absence at all.
   *
   * Speed is preserved rather than allowed to collapse. Removing the inward
   * component of a flow that is heading straight at the volume leaves almost
   * nothing — a stagnation point — and a field with no magnitude has no
   * direction to orient a blade by. Preserving speed turns stalling into
   * turning, which is what "the flow is forced around it" has to mean.
   */
  deflect(p: Vec3, incoming: Vec3): Vec3 {
    const d = this.distance(p);
    if (d >= this.config.shell) return incoming;

    // Full strength at the surface and inside it, off at the shell's edge.
    const strength = 1 - smoothstep(clamp(d, 0, this.config.shell) / this.config.shell);
    const outward = this.gradient(p);

    const inward = -dot(incoming, outward);
    const cancel = inward > 0 ? inward * this.config.divert * strength : 0;
    const out = add(incoming, scale(outward, cancel + this.config.push * strength));

    const speed = length(out);
    const target = length(incoming);
    return speed > 1e-4 ? scale(out, target / speed) : incoming;
  }

  /**
   * The cone. This is where the no-rings law stops being a policy and becomes
   * arithmetic.
   *
   * Every sampled direction is clamped into a cone about D̂ of half-angle
   * `acos(minAlignment)`. The consequence is that the coordinate along D̂
   * increases strictly along every streamline, so no streamline can return to a
   * point it has left and closed circulation is impossible — not unlikely, not
   * discouraged, impossible.
   *
   * It is applied as a construction rather than checked as a condition on
   * purpose. The first version of this field enforced the invariant by
   * assertion and the assertion fired immediately, at exactly the place the
   * geometry makes unavoidable: on the upstream face of the volume, where a
   * flow that perfectly avoids an obstacle has to stop dead. A field that
   * perfectly avoids the absence cannot also flow one way. So the flow does not
   * perfectly avoid it — it turns as hard as the cone permits, up to about
   * sixty-nine degrees, and blades are kept out of the absence by never being
   * placed there rather than by the field bending infinitely to miss it.
   *
   * That is a better model of the thing anyway. The absence is not a force. It
   * is a region the choir is forbidden to occupy.
   */
  private cone(f: Vec3): Vec3 {
    const speed = length(f);
    if (speed < 1e-6) return [...this.axis];

    const along = dot(f, this.axis);
    const limit = this.config.minAlignment;
    if (along >= limit * speed) return f;

    const perpendicular = reject(f, this.axis);
    const across = length(perpendicular);

    // Exactly reversed, with nothing sideways to keep. Deterministic rather
    // than arbitrary: a seeded choice here would still be a choice, and this
    // has to give the same field on every machine.
    const side = across < 1e-6 ? this.wide : scale(perpendicular, 1 / across);

    return add(
      scale(this.axis, speed * limit),
      scale(side, speed * Math.sqrt(Math.max(1 - limit * limit, 0)))
    );
  }

  /** F(p) — the governing field. Unnormalised; `orientation` normalises it. */
  sample(p: Vec3): Vec3 {
    const incoming = add(this.axis, this.shear(p));
    return this.cone(this.deflect(p, incoming));
  }

  /** The approved direction at a point. */
  orientation(p: Vec3): Vec3 {
    return normalise(this.sample(p));
  }

  /**
   * How strongly a point is inside the shell, 0 outside and 1 at the surface.
   * The renderer reads it to lift edge light where the flow is squeezed past
   * the absence, which is where the aureole comes from.
   */
  proximity(p: Vec3): number {
    const d = this.distance(p);
    if (d >= this.config.shell) return 0;
    if (d <= 0) return 1;
    return 1 - smoothstep(d / this.config.shell);
  }

  /** Whether a point is inside the volume, where no blade may exist. */
  forbidden(p: Vec3): boolean {
    return this.distance(p) <= 0;
  }

  /**
   * Alignment of the field with the flow axis at a point, as a fraction of
   * |F|. This is the quantity the invariant bounds.
   */
  alignment(p: Vec3): number {
    const f = this.sample(p);
    const l = length(f);
    return l < 1e-6 ? 0 : dot(f, this.axis) / l;
  }
}

export interface FieldAudit {
  /** Worst alignment found anywhere on the sample grid. */
  minAlignment: number;
  /** Where it was found, in world space. */
  worstAt: Vec3;
  /** Points tested. */
  samples: number;
  /** Streamlines integrated, and the closest any came to returning. */
  streamlines: number;
  /** Smallest advance along D̂ over any streamline step. */
  minAdvance: number;
  /** Largest |P| seen. */
  peakShear: number;
}

/**
 * The ring test, structural half.
 *
 * Two properties are checked rather than assumed, on a dense grid over the
 * whole populated domain:
 *
 *   1. the flow invariant holds everywhere, so no streamline can turn back;
 *   2. integrated streamlines advance monotonically along D̂ and never return
 *      near a point they have already left.
 *
 * A build that violates either is a build in which closed circulation is
 * possible somewhere, and a build in which closed circulation is possible is
 * one camera angle away from a portal. This throws rather than warns.
 */
export function auditField(field: ChoirField, resolution = 22): FieldAudit {
  const { extent, minAlignment } = field.config;

  let worst = Infinity;
  let worstAt: Vec3 = [0, 0, 0];
  let peakShear = 0;
  let samples = 0;

  for (let a = 0; a <= resolution; a++) {
    for (let b = 0; b <= resolution; b++) {
      for (let c = 0; c <= resolution; c++) {
        const local: Vec3 = [
          (a / resolution) * 2 * extent[0] - extent[0],
          (b / resolution) * 2 * extent[1] - extent[1],
          (c / resolution) * 2 * extent[2] - extent[2],
        ];
        const p = field.toWorld(local);
        samples++;

        const shear = length(field.shear(p));
        if (shear > peakShear) peakShear = shear;

        // Points inside the volume are not part of the populated domain and
        // carry no blades, so the field there is not required to mean anything.
        if (field.forbidden(p)) continue;

        const alignment = field.alignment(p);
        if (alignment < worst) {
          worst = alignment;
          worstAt = p;
        }
      }
    }
  }

  // The cone in `sample` guarantees this, so a failure here is not a tuning
  // problem — it means the construction has been broken and the no-rings law is
  // no longer being enforced anywhere. The tolerance is for float error in the
  // clamp, nothing more.
  if (worst < minAlignment - 1e-3) {
    throw new Error(
      `choir field: alignment ${worst.toFixed(4)} at [${worstAt.map((v) => v.toFixed(2)).join(', ')}] ` +
        `is below the invariant ${minAlignment}. The cone clamp in ChoirField.sample is the only ` +
        `thing standing between this build and closed circulation — do not remove it.`
    );
  }

  // Streamlines, integrated from a seeded spread of starting points across the
  // upstream face. The invariant already implies monotone advance; this is the
  // empirical check that the implementation matches the proof.
  const random = mulberry32(field.config.seed ^ 0x5721);
  const streamlines = 64;
  const steps = 420;
  const step = 0.12;
  let minAdvance = Infinity;

  for (let s = 0; s < streamlines; s++) {
    let p = field.toWorld([
      -extent[0],
      signed(random) * extent[1],
      signed(random) * extent[2],
    ]);
    let along = dot(p, field.axis);

    for (let i = 0; i < steps; i++) {
      const next = add(p, scale(field.orientation(p), step));
      const nextAlong = dot(next, field.axis);
      const advance = nextAlong - along;
      if (advance < minAdvance) minAdvance = advance;
      p = next;
      along = nextAlong;
    }
  }

  if (minAdvance <= 0) {
    throw new Error(
      `choir field: a streamline failed to advance along the flow axis (${minAdvance.toFixed(5)}). ` +
        `Something in the field can circulate.`
    );
  }

  return {
    minAlignment: worst,
    worstAt,
    samples,
    streamlines,
    minAdvance,
    peakShear,
  };
}
