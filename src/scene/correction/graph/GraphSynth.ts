/**
 * GraphSynth — the choir, built at three scales.
 *
 * The first build of this placed three thousand similar blades through a field
 * and produced texture: a bristle curtain, hanging reeds, organ pipes. Every
 * element obeyed the law and the frame still said nothing, because a field of
 * uniformly distributed similar things has no composition. Founder verdict,
 * 2026-08-12: "the problem is composition hierarchy, not material quality."
 *
 * So the generator builds downward from the largest scale, not upward from the
 * smallest:
 *
 *   MACRO   one enormous asymmetric absence, and the way everything bends
 *           around it
 *   MESO    seven to twelve structural families — broad curved curtains, each
 *           a coherent formation with its own carriage and its own angle
 *   MICRO   the lamellae inside those families, which supply density and
 *           detail and are never the subject
 *
 * The intended reading is: an enormous impossible structure, and then — a beat
 * later — the realisation that it is not one object at all, that thousands of
 * separate pieces are holding its form. Micro alone can never produce that
 * second beat, because there was never a first one.
 *
 * Families are what make THE CORRECTION legible at architectural scale. A
 * deviation is not sixty sticks turning cyan; it is one whole formation leaving
 * agreement, opening a rupture in the macro composition, with the families
 * around it closing in to force the form back into existence.
 *
 * Everything is still bound to `ChoirField`. Family spines are integrated
 * through the flow, so they curve, shear and compress around the absence
 * because the law does — no family is placed by hand, and none of them orbits
 * anything.
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
  add,
  clamp,
  cross,
  dot,
  mulberry32,
  normalise,
  reject,
  rotateAbout,
  scale,
  signed,
  smoothstep,
  sub,
} from './random';

export interface GraphSynthConfig {
  seed: number;
  field: ChoirFieldConfig;
  families: {
    /** How many structural formations carry the composition. */
    count: number;
    /** Minimum separation between family seeds, in world units. */
    separation: number;
    /** Arc length of a family's spine, in world units. */
    span: [number, number];
    /** Extent across the curtain, along the direction the blades stand. */
    height: [number, number];
    /** Extent through the curtain. Thin: these are formations, not volumes. */
    thickness: [number, number];
    /** How far a family's frame is rolled about its own spine, radians. */
    roll: number;
    /** Wavelength of the smooth field that decides that roll, world units. */
    rollWavelength: number;
    /** Blades in the largest family, before compression and falloff. */
    population: [number, number];
    /** How much a curtain narrows where the flow is squeezed past the void. */
    compression: number;
    /** Softness of a curtain's edges, as a fraction of its half-extent. */
    falloff: number;
    /**
     * Families drawn toward the eye, for near-field occlusion.
     *
     * Zero. A formation close to the camera sits at full brightness while the
     * rest of the choir is attenuated by distance, so it renders as a pale mass
     * with no apparent relationship to anything — the same fault the separate
     * near-field "giants" had, inherited whole. Near-field occlusion is worth
     * having and can come back, but not before the macro composition reads
     * without it.
     */
    near: number;
  };
  blade: {
    /** Length range in world units. */
    length: [number, number];
    /** Width as a fraction of length. */
    width: [number, number];
    /** Seeded tilt off the family's carriage, radians. Variation, not disorder. */
    cant: number;
    /** Seeded twist along the blade's own length, radians. */
    twist: number;
    /** How far the face is rolled off the view direction, radians. */
    roll: number;
  };
  /** Where the eye is, in field coordinates. Blade faces are rolled toward it. */
  view: Vec3;
  /** What the eye is looking at, in field coordinates. */
  aim: Vec3;
  /** Neighbours each blade is coupled to inside its own family. */
  neighbours: number;
  /** Every nth blade also reaches across to the nearest other family. */
  crossEvery: number;
  /** Strength of a cross-family bond against an intra-family one. */
  crossWeight: number;
}

/**
 * The choir as shipped.
 *
 * Nine families, around fourteen hundred blades. Roughly half the count of the
 * build this replaces and a small fraction of its apparent density, because the
 * blades are gathered into masses with real darkness between them rather than
 * spread evenly over the frame. You should not be able to count them: some
 * families sink entirely into black, others surface as a few slivers, and the
 * eye completes what is not drawn.
 */
export const DEFAULT_SYNTH: GraphSynthConfig = {
  seed: 0x5eed_c0de,
  field: DEFAULT_FIELD,
  families: {
    count: 9,
    separation: 4.6,
    // Long, tall and thin. Short thick families read as shoals — compact
    // clusters drifting past each other — where the composition needs broad
    // curved curtains that sweep across the frame and can be seen bending
    // around something.
    span: [11.0, 21.0],
    height: [4.5, 9.0],
    thickness: [0.3, 0.85],
    roll: 0.9,
    rollWavelength: 17,
    population: [150, 330],
    compression: 0.55,
    falloff: 0.42,
    near: 0,
  },
  blade: {
    length: [1.0, 2.6],
    width: [0.05, 0.1],
    cant: 0.12,
    twist: 0.1,
    roll: 0.42,
  },
  view: [-5.5, -22.0, 1.5],
  aim: [2.0, 0, -1.4],
  neighbours: 5,
  crossEvery: 7,
  crossWeight: 0.12,
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
  /**
   * Which formation each blade belongs to, and where along that formation it
   * sits. This is what lets a deviation be a structural event rather than a
   * cluster of sticks.
   */
  membership: {
    count: number;
    family: Uint16Array;
    /** Position along the family's spine, 0..1. */
    param: Float32Array;
  };
  /** Position along the flow, 0..1, for the enforcement gain gradient. */
  depth: Float32Array;
  audit: FieldAudit;
  stats: {
    nodes: number;
    families: number;
    edges: number;
    crossEdges: number;
    medianEdgeLength: number;
    degreeMin: number;
    degreeMax: number;
    degreeMean: number;
    shellNodes: number;
    smallestFamily: number;
    largestFamily: number;
    minAlignment: number;
  };
}

/**
 * A uniform grid over the domain, for the k-nearest search.
 *
 * A neighbourhood query over a few thousand points is the exact case a hash
 * grid is for, and it keeps the synthesiser dependency-free — which a k-d tree
 * from npm would not.
 */
class Grid {
  private readonly cells = new Map<number, number[]>();
  private readonly inverse: number;

  // Written longhand rather than as a parameter property: node strips types
  // without compiling them, and `constructor(readonly cell: number)` is syntax
  // it refuses. The validation gate steps these exact modules, so anything the
  // site's source uses has to survive being stripped.
  constructor(cell: number) {
    this.inverse = 1 / cell;
  }

  private key(x: number, y: number, z: number): number {
    // Offset into the positive range before hashing, so negative coordinates do
    // not collapse onto their mirror.
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
            ((bi + i + 512) * 1024 + (bj + j + 512)) * 1024 + (bk + k + 512)
          );
          if (bucket) for (const index of bucket) out.push(index);
        }
      }
    }
    return out;
  }
}

/** One sample of a family's spine, with the frame the curtain is built on. */
interface SpineSample {
  point: Vec3;
  /** Along the flow. */
  tangent: Vec3;
  /** The direction the family's blades stand along — its carriage. */
  up: Vec3;
  /** Through the curtain. */
  side: Vec3;
}

interface Family {
  spine: SpineSample[];
  height: number;
  thickness: number;
  population: number;
}

export function synthesiseGraph(config: GraphSynthConfig = DEFAULT_SYNTH): SynthesisedGraph {
  const field = new ChoirField(config.field);

  // The structural half of the ring test, before anything is placed. It throws
  // rather than warns: a field that can circulate is not a field this build is
  // allowed to render.
  const audit = auditField(field);

  const random = mulberry32(config.seed);
  const { extent } = config.field;
  const view = field.toWorld(config.view);

  // ------------------------------------------------------------- family roll
  //
  // A smooth seeded field rather than a per-family random number. Neighbouring
  // formations then carry at similar angles and distant ones differ, so the
  // choir reads as one system with regional variation rather than as nine
  // unrelated objects that happen to share a space.

  const rollA = normalise([signed(random), signed(random), signed(random)]);
  const rollB = normalise([signed(random), signed(random), signed(random)]);
  const rollPhase = random() * Math.PI * 2;
  const rollK = (Math.PI * 2) / config.families.rollWavelength;

  const carriage = (p: Vec3): number =>
    (Math.sin(dot(p, rollA) * rollK + rollPhase) * 0.72 +
      Math.cos(dot(p, rollB) * rollK * 1.7) * 0.28) *
    config.families.roll;

  /** The family frame at a point: flow, carriage, and the way through. */
  const frameAt = (p: Vec3): SpineSample => {
    const tangent = field.orientation(p);
    const upright = normalise(reject(field.lift, tangent));
    const up = normalise(rotateAbout(upright, tangent, carriage(p)));
    return { point: p, tangent, up, side: normalise(cross(tangent, up)) };
  };

  // ----------------------------------------------------------- family seeds

  const seeds: Vec3[] = [];
  const wanted = config.families.count;
  const nearWanted = config.families.near;

  for (let attempt = 0; attempt < wanted * 900 && seeds.length < wanted; attempt++) {
    const local: Vec3 = [
      signed(random) * extent[0] * 0.72,
      signed(random) * extent[1] * 0.9,
      signed(random) * extent[2] * 0.8,
    ];
    let p = field.toWorld(local);

    // A couple of formations are drawn toward the eye, so the near field is a
    // coherent mass crossing the frame rather than a scatter of large blades.
    // The first build handled this with special near-field "giants", which
    // read as debris precisely because they belonged to nothing.
    if (seeds.length < nearWanted) {
      const pull = 0.3 + random() * 0.25;
      p = add(p, scale(sub(view, p), pull));
    }

    // Never inside the absence, and never so close that the curtain would have
    // to be carved away to nothing.
    if (field.distance(p) < 2.2) continue;

    let clear = true;
    for (const other of seeds) {
      const d = Math.hypot(other[0] - p[0], other[1] - p[1], other[2] - p[2]);
      if (d < config.families.separation) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;

    seeds.push(p);
  }

  if (seeds.length < 3) {
    throw new Error(`choir: only ${seeds.length} families placed — the separation is too wide`);
  }

  // ------------------------------------------------------------ family spines
  //
  // Integrated through the flow, forward and back from the seed, so a family
  // is a curve the law drew. This is why the formations sweep and compress
  // around the absence without a single one of them being placed by hand.

  const SPINE_STEP = 0.55;
  const families: Family[] = [];

  for (const seed of seeds) {
    const span = config.families.span[0] + random() * (config.families.span[1] - config.families.span[0]);
    const steps = Math.max(6, Math.round(span / SPINE_STEP));
    const back = Math.floor(steps * (0.3 + random() * 0.4));

    const points: Vec3[] = [seed];

    let p = seed;
    for (let i = 0; i < steps - back; i++) {
      p = add(p, scale(field.orientation(p), SPINE_STEP));
      points.push(p);
    }

    p = seed;
    for (let i = 0; i < back; i++) {
      // Backward along the same field. The cone guarantees the flow never
      // turns around, so stepping against it is unambiguous.
      p = sub(p, scale(field.orientation(p), SPINE_STEP));
      points.unshift(p);
    }

    families.push({
      spine: points.map(frameAt),
      height:
        config.families.height[0] +
        random() * (config.families.height[1] - config.families.height[0]),
      thickness:
        config.families.thickness[0] +
        random() * (config.families.thickness[1] - config.families.thickness[0]),
      population: Math.round(
        config.families.population[0] +
          random() * (config.families.population[1] - config.families.population[0])
      ),
    });
  }

  // ---------------------------------------------------------------- the blades

  const anchors: Vec3[] = [];
  const frames: SpineSample[] = [];
  const familyOf: number[] = [];
  const paramOf: number[] = [];

  for (let f = 0; f < families.length; f++) {
    const family = families[f];
    const last = family.spine.length - 1;

    for (let attempt = 0, placed = 0; attempt < family.population * 6 && placed < family.population; attempt++) {
      const u = random();
      const v = signed(random);
      const w = signed(random);

      const at = u * last;
      const index = Math.min(Math.floor(at), last - 1);
      const blend = at - index;
      const a = family.spine[index];
      const b = family.spine[index + 1];

      const point = add(a.point, scale(sub(b.point, a.point), blend));
      const sample = frameAt(point);

      // Curtains narrow where the flow is squeezed past the absence, which is
      // what turns "the families bend around it" into "the families are
      // compressed by it" — the difference between an obstacle and a pressure.
      const squeeze = 1 - config.families.compression * field.proximity(point);

      const height = family.height * squeeze;
      const thickness = family.thickness * squeeze;

      // Soft at every edge, so a family has no perimeter to recognise it by.
      // The falloff is a rejection rather than a scale, so the boundary is
      // ragged and made of individual absences rather than a clean fade.
      const edge = Math.max(Math.abs(v), Math.abs(w));
      const ends = 1 - smoothstep((Math.abs(u * 2 - 1) - (1 - config.families.falloff)) / config.families.falloff);
      const across = 1 - smoothstep((edge - (1 - config.families.falloff)) / config.families.falloff);
      if (random() > ends * across) continue;

      const world = add(
        add(point, scale(sample.up, v * height * 0.5)),
        scale(sample.side, w * thickness * 0.5)
      );

      if (field.distance(world) < 0.4) continue;

      anchors.push(world);
      frames.push(frameAt(world));
      familyOf.push(f);
      paramOf.push(u);
      placed++;
    }
  }

  const nodeCount = anchors.length;
  if (nodeCount < 64) {
    throw new Error(`choir: placement produced only ${nodeCount} blades — the density is wrong`);
  }

  // -------------------------------------------------------------- attributes

  const positions = new Float32Array(nodeCount * 3);
  const directions = new Float32Array(nodeCount * 3);
  const tangents = new Float32Array(nodeCount * 3);
  const dims = new Float32Array(nodeCount * 2);
  const shape = new Float32Array(nodeCount * 3);
  const depth = new Float32Array(nodeCount);
  const family = new Uint16Array(nodeCount);
  const param = new Float32Array(nodeCount);
  let shellNodes = 0;

  for (let i = 0; i < nodeCount; i++) {
    const p = anchors[i];
    const sample = frames[i];
    const at = i * 3;

    positions[at] = p[0];
    positions[at + 1] = p[1];
    positions[at + 2] = p[2];

    // The approved long axis is the family's carriage, plus this blade's own
    // fixed cant. The cant is variation within the law, not disorder — it is
    // part of what this blade is approved to be, so a deviation is still
    // measured against the blade's own correct pose.
    const cantAxis = normalise(reject([signed(random), signed(random), signed(random)], sample.up));
    const tangent = normalise(rotateAbout(sample.up, cantAxis, signed(random) * config.blade.cant));

    // The face is turned toward the eye and then rolled off it by a seeded
    // amount, so the choir presents a mixture of faces and grazing edges.
    const toView = normalise(reject(sub(view, p), tangent));
    const normal = normalise(rotateAbout(toView, tangent, signed(random) * config.blade.roll));

    directions[at] = normal[0];
    directions[at + 1] = normal[1];
    directions[at + 2] = normal[2];

    tangents[at] = tangent[0];
    tangents[at + 1] = tangent[1];
    tangents[at + 2] = tangent[2];

    const span = config.blade.length[1] - config.blade.length[0];
    const length = config.blade.length[0] + random() * span;
    const widthSpan = config.blade.width[1] - config.blade.width[0];

    dims[i * 2] = length;
    dims[i * 2 + 1] = length * (config.blade.width[0] + random() * widthSpan);

    const proximity = field.proximity(p);
    if (proximity > 0) shellNodes++;

    shape[i * 3] = signed(random) * config.blade.twist;
    shape[i * 3 + 1] = proximity;
    shape[i * 3 + 2] = 1;

    family[i] = familyOf[i];
    param[i] = paramOf[i];

    const local = field.toLocal(p);
    depth[i] = clamp((local[0] / extent[0] + 1) * 0.5, 0, 1);
  }

  // ------------------------------------------------------------------- edges
  //
  // Two kinds, and the difference between them is what makes a correction
  // architectural. Inside a family the bond is strong, so a deviation runs
  // through the whole formation and it moves as one thing. Across families it
  // is weak and sparse, so a neighbouring formation feels the strain and
  // answers it rather than being dragged along with it.

  const grid = new Grid(1.6);
  for (let i = 0; i < nodeCount; i++) grid.add(anchors[i], i);

  const pairs = new Set<number>();
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeLength: number[] = [];
  const edgeWeight: number[] = [];
  const scratch: number[] = [];
  const candidates: Array<{ index: number; distance: number }> = [];
  let crossEdges = 0;

  const addEdge = (i: number, j: number, distance: number, weight: number): void => {
    const low = i < j ? i : j;
    const high = i < j ? j : i;
    const key = low * nodeCount + high;
    if (pairs.has(key)) return;
    pairs.add(key);
    edgeA.push(low);
    edgeB.push(high);
    edgeLength.push(distance);
    edgeWeight.push(weight);
  };

  for (let i = 0; i < nodeCount; i++) {
    const p = anchors[i];

    let radius = 1.2;
    for (let widen = 0; widen < 5; widen++) {
      const found = grid.near(p, radius, scratch);
      candidates.length = 0;

      for (const j of found) {
        if (j === i || family[j] !== family[i]) continue;
        const other = anchors[j];
        const distance = Math.hypot(other[0] - p[0], other[1] - p[1], other[2] - p[2]);
        if (distance > radius) continue;
        candidates.push({ index: j, distance });
      }

      if (candidates.length >= config.neighbours) break;
      radius *= 1.9;
    }

    candidates.sort((a, b) => a.distance - b.distance);
    for (let n = 0; n < Math.min(config.neighbours, candidates.length); n++) {
      addEdge(i, candidates[n].index, candidates[n].distance, 1);
    }

    // The bond between formations. Sparse on purpose: every blade reaching
    // across would fuse the choir into one slab, and a slab has no interior
    // for a correction to travel through.
    if (i % config.crossEvery !== 0) continue;

    const found = grid.near(p, 4.2, scratch);
    let best = -1;
    let bestDistance = Infinity;
    for (const j of found) {
      if (family[j] === family[i]) continue;
      const other = anchors[j];
      const distance = Math.hypot(other[0] - p[0], other[1] - p[1], other[2] - p[2]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = j;
      }
    }
    if (best >= 0 && bestDistance <= 4.2) {
      const before = pairs.size;
      addEdge(i, best, bestDistance, config.crossWeight);
      if (pairs.size > before) crossEdges++;
    }
  }

  // ----------------------------------------------------------------- weights

  const sorted = [...edgeLength].sort((a, b) => a - b);
  const medianEdgeLength = sorted[sorted.length >> 1] ?? 1;

  const weightsPerEdge = new Float32Array(edgeA.length);
  for (let e = 0; e < edgeA.length; e++) {
    const ratio = edgeLength[e] / (medianEdgeLength * 1.8);
    weightsPerEdge[e] = edgeWeight[e] * Math.max(Math.exp(-ratio * ratio), 0.02);
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

  // Normalised so the busiest blade has a weighted degree of exactly one, which
  // makes κ a rate in inverse seconds that means the same thing whatever the
  // synthesiser produced — otherwise changing the family sizes silently
  // rescales the coupling and takes the stability margin with it.
  if (peakDegree > 0) {
    const inverse = 1 / peakDegree;
    for (let k = 0; k < weights.length; k++) weights[k] *= inverse;
  }

  const sizes = new Array(families.length).fill(0);
  for (let i = 0; i < nodeCount; i++) sizes[family[i]]++;

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
    bounds: { maxWeightedDegree: peakDegree > 0 ? 1 : 0, lambdaMaxBound: peakDegree > 0 ? 2 : 0 },
    blades: { count: nodeCount, tangents, dims, shape },
    membership: { count: families.length, family, param },
    depth,
    audit,
    stats: {
      nodes: nodeCount,
      families: families.length,
      edges: edgeA.length,
      crossEdges,
      medianEdgeLength,
      degreeMin: degreeMin === Infinity ? 0 : degreeMin,
      degreeMax,
      degreeMean: entryCount / nodeCount,
      shellNodes,
      smallestFamily: Math.min(...sizes),
      largestFamily: Math.max(...sizes),
      minAlignment: audit.minAlignment,
    },
  };
}

/** Re-exported so callers do not need to know which module owns the frame. */
export { ChoirField, auditField };
export const fieldFor = (config: GraphSynthConfig = DEFAULT_SYNTH): ChoirField =>
  new ChoirField(config.field);
