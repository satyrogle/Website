/**
 * GraphSynth — the choir, and the graph that couples it.
 *
 * Thousands of thin dark blades suspended in one anisotropic flow, each placed
 * and oriented by `ChoirField` and by nothing else. There is no object here. No
 * outline, no perimeter, no footprint, no centre — only elements that visibly
 * agree, and a rule they are agreeing with that is never drawn.
 *
 * That is the whole proposition. When a cluster escapes and the rest force it
 * back, the law is what the visitor has been looking at from the first frame.
 *
 * What died before this
 * ---------------------
 * A seeded scatter of filaments read as a decorative network: irregular, but
 * with nothing holding it, so there was no order for the correction to restore.
 * A swept ribbon read as a cutting board, and then as a tape being shaken once
 * a wave ran along it. A corona of blades around a central void was rejected on
 * paper before it was built, because an arrangement around a centre becomes a
 * ring from some camera angle and a ring is a portal.
 *
 * The blades are placed with three properties that carry the perception the
 * corona was supposed to buy, none of which is a circle:
 *
 *   - density rises where the flow is squeezed past the absence, and rises
 *     *unevenly*, so the bright boundary is a set of broken arcs rather than a
 *     rim;
 *   - blades turn tangent to the absence as they pass it, because the field
 *     turns, so the eye is given the tangents of a shape that is not drawn;
 *   - density falls smoothly to nothing at every edge of the domain, so the
 *     field has no boundary to recognise it by.
 *
 * Frame lessons that outlived the ribbon and bind every blade: taper one end
 * only — tapering both makes a nozzle and tapering from the middle makes a
 * feather; roll the face toward the eye, because a blade lying flat presents
 * its edge and width does not help.
 */

import type { CausalGraph, StabilityBounds } from './GraphAsset';
import {
  ChoirField,
  DEFAULT_FIELD,
  auditField,
  type ChoirFieldConfig,
  type FieldAudit,
} from './ChoirField';
import {
  type Vec3,
  clamp,
  dot,
  mulberry32,
  normalise,
  reject,
  rotateAbout,
  signed,
  smoothstep,
  sub,
} from './random';

export interface GraphSynthConfig {
  seed: number;
  field: ChoirFieldConfig;
  /** Blades in the main field, before the near-field giants. */
  blades: number;
  /** Large blades crossing the periphery, as occluders. */
  giants: number;
  /** Base separation between blades, in world units. */
  spacing: number;
  /** Hard ceiling on the variable spacing, past which a sample is dropped. */
  spacingCeiling: number;
  /** Extra blade density in the influence shell, at full mask. */
  shellDensity: number;
  /** Wavelengths of the seeded mask that breaks the shell into arcs. */
  maskWavelengths: [number, number];
  /** Fraction of density lost by the far, downstream end. */
  downstreamThin: number;
  /** Where the domain starts fading out, as a fraction of each half-extent. */
  edgeInner: number;
  blade: {
    /** Length range in world units. */
    length: [number, number];
    /** Width as a fraction of length. */
    width: [number, number];
    /** Scale multiplier range for the near-field giants. */
    giantScale: [number, number];
    /** Seeded tilt off the field direction, radians. Variation, not disorder. */
    cant: number;
    /** Seeded twist along the blade's own length, radians. */
    twist: number;
    /** How far the face is rolled off the view direction, radians. */
    roll: number;
    /** Light gain for the near-field giants, against the choir's 1. */
    giantLight: number;
  };
  /**
   * Where the near-field giants gather, and what the blade faces are rolled
   * toward. The camera's own zone: a blade lying flat to the eye is invisible
   * however wide it is.
   *
   * In field coordinates, like everything else here. It was authored in world
   * space first and silently gathered every giant on the far side of the choir
   * from the camera — the near field was empty and nothing was measuring it,
   * because "the numbers looked fine" is exactly what a wrong frame looks like
   * from inside the source.
   */
  view: Vec3;
  /**
   * What the eye is looking at, in field coordinates. Used only to keep the
   * near-field giants out of the middle of the frame.
   */
  aim: Vec3;
  /**
   * How far off the view axis a giant must sit, in radians.
   *
   * Near-field blades are supposed to cross the periphery and occlude the
   * edges of things. Unconstrained, they landed wherever they liked and the
   * opening frame became the inside of a thicket — no recession, no negative
   * space, and an absence nobody could see past them.
   */
  giantOffAxis: number;
  /** Neighbours each blade is coupled to. Never drawn. */
  neighbours: number;
  /** Coupling falloff distance, in units of the base spacing. */
  couplingRange: number;
}

/**
 * The choir as shipped.
 *
 * Around six thousand blades: enough that coordination reads as a society
 * rather than as a handful of objects, and that an escape of a dozen reads as a
 * breach against the number that stayed. Sized to leave the simulation inside
 * one Worker step at 120 Hz on the mid quality tier.
 */
export const DEFAULT_SYNTH: GraphSynthConfig = {
  seed: 0x5eed_c0de,
  field: DEFAULT_FIELD,
  // Sparser and larger than the first build, which packed six thousand small
  // blades into a slab twelve units deep and rendered a thicket: no recession,
  // no negative space, and an absence that could not be seen because the
  // sightline into it was solid. Monumental needs gaps to be monumental
  // against.
  blades: 3200,
  giants: 10,
  spacing: 0.34,
  spacingCeiling: 2.4,
  shellDensity: 5.0,
  maskWavelengths: [7.3, 4.1],
  downstreamThin: 0.72,
  edgeInner: 0.3,
  blade: {
    length: [0.9, 2.4],
    width: [0.055, 0.13],
    giantScale: [1.8, 3.2],
    cant: 0.1,
    twist: 0.1,
    roll: 0.42,
    giantLight: 0.22,
  },
  view: [-5.5, -17.0, 1.2],
  aim: [-0.5, 0, -1.2],
  giantOffAxis: 0.44,
  neighbours: 5,
  couplingRange: 3.2,
};

export interface SynthesisedGraph {
  graph: CausalGraph;
  bounds: StabilityBounds;
  /** The law this structure was built from. Kept so callers can ask it things. */
  field: ChoirField;
  /** Per-blade geometry, for the renderer. */
  blades: {
    count: number;
    /** Approved long axis, xyz per blade. */
    tangents: Float32Array;
    /** Length and width, per blade. */
    dims: Float32Array;
    /** Twist, edge gain and light gain, per blade. */
    shape: Float32Array;
  };
  /** Position along the flow, 0..1, for the enforcement gain gradient. */
  depth: Float32Array;
  audit: FieldAudit;
  stats: {
    nodes: number;
    edges: number;
    giants: number;
    medianEdgeLength: number;
    degreeMin: number;
    degreeMax: number;
    degreeMean: number;
    /** Blades that landed inside the influence shell. */
    shellNodes: number;
    /** Sample attempts spent on the placement. */
    attempts: number;
    minAlignment: number;
  };
}

/**
 * A uniform grid over the domain, for the placement's separation test and for
 * the k-nearest search.
 *
 * Both are neighbourhood queries over a few thousand points, which is the exact
 * case a hash grid is for — and it keeps the synthesiser dependency-free, which
 * a k-d tree from npm would not.
 */
class Grid {
  private readonly cells = new Map<number, number[]>();
  private readonly inverse: number;

  // Written longhand rather than as a parameter property: node strips types
  // without compiling them, and `constructor(readonly cell: number)` is
  // syntax it refuses. The validation gate steps these exact modules, so
  // anything the site's source uses has to survive being stripped.
  constructor(cell: number) {
    this.inverse = 1 / cell;
  }

  private key(x: number, y: number, z: number): number {
    // Offset into the positive range before hashing, so negative coordinates
    // do not collapse onto their mirror.
    const i = Math.floor(x * this.inverse) + 512;
    const j = Math.floor(y * this.inverse) + 512;
    const k = Math.floor(z * this.inverse) + 512;
    return (i * 1024 + j) * 1024 + k;
  }

  add(p: Vec3, index: number): void {
    const key = this.key(p[0], p[1], p[2]);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
  }

  /** Indices in every cell within `radius` of the point. */
  near(p: Vec3, radius: number, out: number[]): number[] {
    out.length = 0;
    const span = Math.ceil(radius * this.inverse);
    const bi = Math.floor(p[0] * this.inverse);
    const bj = Math.floor(p[1] * this.inverse);
    const bk = Math.floor(p[2] * this.inverse);

    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        for (let k = -span; k <= span; k++) {
          const bucket = this.cells.get(
            (((bi + i + 512) * 1024 + (bj + j + 512)) * 1024) + (bk + k + 512)
          );
          if (bucket) for (const index of bucket) out.push(index);
        }
      }
    }
    return out;
  }
}

export function synthesiseGraph(config: GraphSynthConfig = DEFAULT_SYNTH): SynthesisedGraph {
  const field = new ChoirField(config.field);

  // The structural half of the ring test, before a single blade is placed. It
  // throws rather than warns: a field that can circulate is not a field this
  // build is allowed to render.
  const audit = auditField(field);

  const random = mulberry32(config.seed);
  const { extent } = config.field;

  // ------------------------------------------------------------------ density
  //
  // Three factors, none of them a function of distance from a centre.

  const maskA = normalise([signed(random), signed(random), signed(random)]);
  const maskB = normalise([signed(random), signed(random), signed(random)]);
  const maskPhaseA = random() * Math.PI * 2;
  const maskPhaseB = random() * Math.PI * 2;
  const kA = (Math.PI * 2) / config.maskWavelengths[0];
  const kB = (Math.PI * 2) / config.maskWavelengths[1];

  /**
   * Which stretches of the boundary crowd and which stay sparse.
   *
   * A smooth seeded scalar field, evaluated in space. Deliberately not an angle
   * around the volume: an even boost around a boundary is a rim, and computing
   * an angle about a centre is the polar construction the whole direction is
   * built to avoid. Sampling a noise field instead gives irregular dense
   * patches and broken gaps, which is what makes the aureole read as an
   * accident of the light rather than as a drawn ring.
   */
  const arcMask = (p: Vec3): number => {
    const a = Math.sin(dot(p, maskA) * kA + maskPhaseA);
    const b = Math.cos(dot(p, maskB) * kB + maskPhaseB);
    return clamp(0.5 + 0.62 * a * b + 0.18 * b, 0, 1);
  };

  /** Smooth fade to nothing at every edge, so the field has no perimeter. */
  const edgeFade = (local: Vec3): number => {
    let fade = 1;
    for (let axis = 0; axis < 3; axis++) {
      const t = Math.abs(local[axis]) / extent[axis];
      fade *= 1 - smoothstep((t - config.edgeInner) / (1 - config.edgeInner));
    }
    return fade;
  };

  const density = (local: Vec3, world: Vec3): number => {
    const fade = edgeFade(local);
    if (fade <= 0.002) return 0;

    // The far end thins into darkness rather than stopping.
    const along = (local[0] / extent[0] + 1) * 0.5;
    const downstream = 1 - config.downstreamThin * smoothstep(along);

    const shell = 1 + config.shellDensity * field.proximity(world) * arcMask(world);
    return fade * downstream * shell;
  };

  // ---------------------------------------------------------------- placement
  //
  // Variable-radius dart throwing. The radius shrinks where density rises, so
  // the crowding around the absence is real spacing rather than a shader trick,
  // and blue-noise separation keeps the field from clumping into the seeded
  // scatter that failed here before.

  const anchors: Vec3[] = [];
  const locals: Vec3[] = [];
  const grid = new Grid(config.spacingCeiling);
  const scratch: number[] = [];

  const separation = (d: number): number =>
    Math.min(config.spacing / Math.cbrt(Math.max(d, 1e-3)), config.spacingCeiling);

  const clear = (p: Vec3, radius: number): boolean => {
    const found = grid.near(p, radius, scratch);
    const limit = radius * radius;
    for (const index of found) {
      const other = anchors[index];
      const dx = other[0] - p[0];
      const dy = other[1] - p[1];
      const dz = other[2] - p[2];
      if (dx * dx + dy * dy + dz * dz < limit) return false;
    }
    return true;
  };

  const attemptLimit = config.blades * 60;
  let attempts = 0;

  while (anchors.length < config.blades && attempts < attemptLimit) {
    attempts++;

    const local: Vec3 = [
      signed(random) * extent[0],
      signed(random) * extent[1],
      signed(random) * extent[2],
    ];
    const world = field.toWorld(local);

    // Nothing exists inside the absence, and nothing exists so close to its
    // surface that a blade's own length would cross it. The dark is dark
    // because it is empty, never because something was painted over it.
    if (field.distance(world) < 0.35) continue;

    const d = density(local, world);
    if (d <= 0.02) continue;

    const radius = separation(d);
    if (radius >= config.spacingCeiling) continue;
    if (!clear(world, radius)) continue;

    grid.add(world, anchors.length);
    anchors.push(world);
    locals.push(local);
  }

  // ------------------------------------------------------------- near giants
  //
  // The same law at a larger scale, gathered toward the camera's own zone: big
  // dark blades crossing the periphery, occluding parts of the field and parts
  // of the absence. They are what stops the composition reading as a flat plate
  // of texture, and what makes the brain complete an aureole it can only
  // partly see.

  const view = field.toWorld(config.view);
  const viewAxis = normalise(sub(field.toWorld(config.aim), view));
  let giants = 0;

  for (let attempt = 0; attempt < config.giants * 400 && giants < config.giants; attempt++) {
    // Drawn from the body of the field and then carried part of the way toward
    // the eye, rather than sampled inside the domain and hoped to land near it.
    // The domain stops well short of the camera, so a giant sampled inside it
    // is not a near-field element at all — it is just a large blade at the same
    // distance as everything else, which reads as a scale error rather than as
    // depth.
    const base: Vec3 = [
      signed(random) * extent[0],
      signed(random) * extent[1],
      signed(random) * extent[2],
    ];
    const t = 0.15 + random() * 0.35;
    const local: Vec3 = [
      base[0] + (config.view[0] - base[0]) * t,
      base[1] + (config.view[1] - base[1]) * t,
      base[2] + (config.view[2] - base[2]) * t,
    ];
    const world = field.toWorld(local);

    if (field.distance(world) < 1.2) continue;

    // Never so close that it fills the frame with one blade, and never so far
    // that it stops being near field.
    const away = Math.hypot(world[0] - view[0], world[1] - view[1], world[2] - view[2]);
    if (away < 7 || away > 15) continue;

    // And never in the middle of the frame. A near blade belongs at the edge,
    // crossing the composition and occluding part of it; one through the centre
    // is not depth, it is an obstruction.
    const toBlade = normalise(sub(world, view));
    if (dot(toBlade, viewAxis) > Math.cos(config.giantOffAxis)) continue;

    if (!clear(world, config.spacing * 3.5)) continue;

    grid.add(world, anchors.length);
    anchors.push(world);
    locals.push(local);
    giants++;
  }

  const nodeCount = anchors.length;
  if (nodeCount < 64) {
    throw new Error(`choir: placement produced only ${nodeCount} blades — the density is wrong`);
  }

  const giantFrom = nodeCount - giants;

  // -------------------------------------------------------------- attributes

  const positions = new Float32Array(nodeCount * 3);
  const directions = new Float32Array(nodeCount * 3);
  const tangents = new Float32Array(nodeCount * 3);
  const dims = new Float32Array(nodeCount * 2);
  const shape = new Float32Array(nodeCount * 3);
  const depth = new Float32Array(nodeCount);
  let shellNodes = 0;

  for (let i = 0; i < nodeCount; i++) {
    const p = anchors[i];
    const local = locals[i];
    const at = i * 3;

    positions[at] = p[0];
    positions[at + 1] = p[1];
    positions[at + 2] = p[2];

    // The approved long axis: standing across the flow, not along it.
    //
    // Blades laid along the flow were tried first and read as shards blowing
    // through the frame — a debris field, which is the opposite of a choir. A
    // blade that stands is a stele; a blade that lies along the current is
    // litter. So the long axis is the upright direction with the flow projected
    // out of it, which means every blade stands, and the *lean* of the whole
    // congregation is what carries the law.
    //
    // This is also what makes the absence legible without drawing anything.
    // Far out, the field varies slowly and the choir stands nearly plumb. Close
    // in, where the flow is forced around the forbidden volume, the lean runs
    // up to the cone's limit — so the blades nearest the absence are the ones
    // most visibly obeying something, and the eye reads a presence there.
    const flow = field.orientation(p);
    const upright = normalise(reject(field.lift, flow));
    const cantAxis = normalise(reject([signed(random), signed(random), signed(random)], upright));
    const tangent = normalise(rotateAbout(upright, cantAxis, signed(random) * config.blade.cant));

    // The face is turned toward the eye and then rolled off it by a seeded
    // amount, so the choir presents a mixture of faces and grazing edges. These
    // are flat-ish fins: rolled fully edge-on they would have no width left to
    // see, and rolled fully face-on they light as flat plates.
    const toView = normalise(reject(sub(view, p), tangent));
    const normal = normalise(rotateAbout(toView, tangent, signed(random) * config.blade.roll));

    directions[at] = normal[0];
    directions[at + 1] = normal[1];
    directions[at + 2] = normal[2];

    tangents[at] = tangent[0];
    tangents[at + 1] = tangent[1];
    tangents[at + 2] = tangent[2];

    const isGiant = i >= giantFrom;
    const span = config.blade.length[1] - config.blade.length[0];
    const base = config.blade.length[0] + random() * span;

    // Width comes off the base length, before the giant multiplier.
    //
    // Scaling both together made the near-field giants proportionally as wide
    // as they were long, so instead of tall blades close to the eye they
    // rendered as slabs the size of the frame. A near blade should be longer
    // than its neighbours, not fatter — that is the difference between depth
    // and a scale error.
    const widthSpan = config.blade.width[1] - config.blade.width[0];
    const width = base * (config.blade.width[0] + random() * widthSpan);

    let length = base;
    if (isGiant) {
      const gs = config.blade.giantScale;
      length *= gs[0] + random() * (gs[1] - gs[0]);
    }

    dims[i * 2] = length;
    dims[i * 2 + 1] = width;

    const proximity = field.proximity(p);
    if (proximity > 0) shellNodes++;

    shape[i * 3] = signed(random) * config.blade.twist;
    // Blades passing the absence catch more of the grazing light. This is the
    // aureole: an accumulation of lit edges where the flow is squeezed, not an
    // emissive body and not a ring.
    //
    // Never a giant. The absence is drawn out along the line of sight, so a
    // near-field blade can sit close to it in space while appearing nowhere
    // near it on screen — and at four times the record's brightness, a metre
    // from the camera, it rendered as a pale slab in the corner of the frame
    // with no relationship to anything. The aureole belongs to the crowd
    // forced around the boundary, not to whatever happens to pass by it.
    shape[i * 3 + 1] = isGiant ? 0 : proximity;

    // How much light this blade is allowed to take.
    //
    // Near-field giants are dark by mandate. They are close enough to fill a
    // quarter of the frame and their faces are turned toward the eye, so at the
    // choir's own brightness they render as pale slabs in the corner — the one
    // thing in the composition that looks like a mistake. They are occluders:
    // their job is to be in front of something, not to be seen.
    shape[i * 3 + 2] = isGiant ? config.blade.giantLight : 1;

    depth[i] = clamp((local[0] / extent[0] + 1) * 0.5, 0, 1);
  }

  // ------------------------------------------------------------------- edges
  //
  // k-nearest over the anchors. Never drawn: this is the constraint field, and
  // the only reason a deviation in one blade becomes tension in the ones beside
  // it. Without it each blade would be corrected in isolation and the field
  // would read as a set of unrelated events rather than one system closing
  // ranks.

  const baseRadius = config.spacing * config.couplingRange;
  const pairs = new Set<number>();
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeLength: number[] = [];

  const candidates: Array<{ index: number; distance: number }> = [];

  for (let i = 0; i < nodeCount; i++) {
    const p = anchors[i];

    // The search widens until it finds neighbours rather than using one fixed
    // radius. Spacing varies by a factor of six across the field by design, so
    // a single radius either misses the sparse regions entirely — leaving
    // blades with no neighbours at all, uncoupled, permanently unable to
    // participate in a correction — or is so wide that the dense regions pay
    // for it on every query.
    let searchRadius = baseRadius;
    for (let widen = 0; widen < 5; widen++) {
      const found = grid.near(p, searchRadius, scratch);
      candidates.length = 0;

      for (const j of found) {
        if (j === i) continue;
        const other = anchors[j];
        const distance = Math.hypot(other[0] - p[0], other[1] - p[1], other[2] - p[2]);
        if (distance > searchRadius) continue;
        candidates.push({ index: j, distance });
      }

      if (candidates.length >= config.neighbours) break;
      searchRadius *= 1.9;
    }

    candidates.sort((a, b) => a.distance - b.distance);
    const take = Math.min(config.neighbours, candidates.length);

    for (let n = 0; n < take; n++) {
      const j = candidates[n].index;
      const low = i < j ? i : j;
      const high = i < j ? j : i;
      const key = low * nodeCount + high;
      if (pairs.has(key)) continue;
      pairs.add(key);
      edgeA.push(low);
      edgeB.push(high);
      edgeLength.push(candidates[n].distance);
    }
  }

  // ----------------------------------------------------------------- weights

  const sorted = [...edgeLength].sort((a, b) => a - b);
  const medianEdgeLength = sorted[sorted.length >> 1] ?? config.spacing;

  const weightsPerEdge = new Float32Array(edgeA.length);
  for (let e = 0; e < edgeA.length; e++) {
    // A gaussian in edge length, so a blade is bound tightly to what is beside
    // it and barely at all across a gap. Coupling that ignored distance would
    // let the whole field move as one slab, and a slab has no interior for a
    // correction to travel through.
    const ratio = edgeLength[e] / (medianEdgeLength * 1.6);
    weightsPerEdge[e] = Math.max(Math.exp(-ratio * ratio), 0.02);
  }

  // --------------------------------------------------------------------- CSR

  const degree = new Uint32Array(nodeCount);
  for (let e = 0; e < edgeA.length; e++) {
    degree[edgeA[e]]++;
    degree[edgeB[e]]++;
  }

  const offsets = new Uint32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) offsets[i + 1] = offsets[i] + degree[i];
  const entryCount = offsets[nodeCount];

  const neighbourIndex = new Uint32Array(entryCount);
  const weights = new Float32Array(entryCount);
  const cursor = offsets.slice(0, nodeCount);

  for (let e = 0; e < edgeA.length; e++) {
    const i = edgeA[e];
    const j = edgeB[e];
    neighbourIndex[cursor[i]] = j;
    weights[cursor[i]] = weightsPerEdge[e];
    cursor[i]++;
    neighbourIndex[cursor[j]] = i;
    weights[cursor[j]] = weightsPerEdge[e];
    cursor[j]++;
  }

  // ---------------------------------------------------------------- validity

  let peakDegree = 0;
  let degreeMin = Infinity;
  let degreeMax = 0;
  for (let i = 0; i < nodeCount; i++) {
    let sum = 0;
    for (let k = offsets[i]; k < offsets[i + 1]; k++) sum += weights[k];
    if (sum > peakDegree) peakDegree = sum;
    const d = offsets[i + 1] - offsets[i];
    if (d < degreeMin) degreeMin = d;
    if (d > degreeMax) degreeMax = d;
  }

  // Normalised so the busiest blade has a weighted degree of exactly one.
  //
  // Without this, κ means something different for every graph the synthesiser
  // produces — change the spacing or the neighbour count and the coupling
  // silently rescales, taking the stability margin with it. Normalised, κ is a
  // rate in inverse seconds that means the same thing in every configuration,
  // which is what makes it tunable by feel rather than by trial.
  if (peakDegree > 0) {
    const inverse = 1 / peakDegree;
    for (let k = 0; k < weights.length; k++) weights[k] *= inverse;
  }
  const maxWeightedDegree = peakDegree > 0 ? 1 : 0;

  const graph: CausalGraph = {
    nodeCount,
    entryCount,
    positions,
    directions,
    offsets,
    neighbours: neighbourIndex,
    weights,
  };

  return {
    graph,
    field,
    bounds: {
      maxWeightedDegree,
      lambdaMaxBound: 2 * maxWeightedDegree,
    },
    blades: { count: nodeCount, tangents, dims, shape },
    depth,
    audit,
    stats: {
      nodes: nodeCount,
      edges: edgeA.length,
      giants,
      medianEdgeLength,
      degreeMin: degreeMin === Infinity ? 0 : degreeMin,
      degreeMax,
      degreeMean: entryCount / nodeCount,
      shellNodes,
      attempts,
      minAlignment: audit.minAlignment,
    },
  };
}

/** Re-exported so callers do not need to know which module owns the frame. */
export { ChoirField, auditField };
export const fieldFor = (config: GraphSynthConfig = DEFAULT_SYNTH): ChoirField =>
  new ChoirField(config.field);
