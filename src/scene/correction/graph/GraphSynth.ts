/**
 * GraphSynth — a laminar ribbon field, and the law that keeps it in agreement.
 *
 * The structure is not an object. It is twenty-odd narrow ribbons suspended
 * independently in space, each integrated through the same smooth flow field:
 * different lengths, different depths, different spacing, never quite
 * parallel, with no perimeter, no cross-ribs, no end caps and no footprint.
 * Nothing here draws a boundary, because the thing the visitor is meant to
 * perceive is not a shape.
 *
 * **The entity is the rule, not the ribbons.** What reads on arrival is
 * coordination: separate elements all plainly obeying something, and the
 * something is not visible. That is why the correction works as an idea —
 * when a few of them escape and the rest force them back, the law is what the
 * visitor has been looking at the whole time.
 *
 * What it replaces, and why
 * ------------------------
 * Two structures died here. First a seeded scatter of filaments, which read as
 * a decorative network — irregular, but with nothing holding it, so there was
 * no order for the correction to restore. Then a swept surface, which read as
 * a cutting board: a continuous sheet with longitudinal lines, cross ribs and
 * a visible perimeter is a CAD mesh whatever its shape, and giving it
 * thickness only made it a thicker board.
 *
 * The fault both times was the carrier. A surface has an outline, and an
 * outline is an object. A field of separate elements under a shared constraint
 * has no outline to read, so there is nothing to recognise and nothing to
 * dismiss — only the coordination.
 *
 * Rules still in force from the graveyard, satisfied by construction: nothing
 * converts an index into an angle, there is no centre, no axis and no closed
 * section, so no view can resolve into concentric anything.
 *
 * Coupling
 * --------
 * Ribbons are linked to their neighbours by edges that are never drawn. That
 * is the constraint field: it is how a deviation in one ribbon becomes tension
 * in the ones beside it, and how correction transfers outward through the
 * field instead of being applied to each ribbon separately. The law is
 * invisible and acts anyway, which is the entire proposition.
 */

import type { CausalGraph, StabilityBounds } from './GraphAsset';

export interface GraphSynthConfig {
  seed: number;
  /** Ribbons in the field. */
  ribbons: number;
  /** Samples along the longest ribbon. Sets how smoothly it curves. */
  samples: number;
  /** World distance between samples. */
  step: number;
  /** Half-extent of the region the ribbons are seeded into, xyz. */
  spread: [number, number, number];
  /** Where the field begins, in x. Ribbons run from here toward +x. */
  origin: number;
  /** Shortest and longest ribbon, as a fraction of `samples`. */
  lengthRange: [number, number];
  /** How far the flow bends in y and z. */
  bend: number;
  /** Spatial frequency of the flow field. */
  frequency: number;
  /** Half-width of a ribbon at its fullest. */
  halfWidth: number;
  /**
   * How far each ribbon is rolled about its own path, and how much that roll
   * drifts along its length.
   *
   * Without this every ribbon shares one orientation, so the whole field sits
   * at the same angle to the eye and lights identically — which produced a set
   * of uniformly bright strands rather than dark bodies with a caught edge.
   * Varying the roll is what makes some of them present a face and others an
   * edge, and what makes a single ribbon change as it travels.
   */
  rollSpread: number;
  rollDrift: number;
  /** Fraction of a ribbon, at each end, given over to absorbing the wave. */
  absorbSpan: number;
  /** Neighbouring ribbons each one is coupled to. Never drawn. */
  coupling: number;
  /** Strength of a coupling edge relative to a ribbon's own stiffness. */
  couplingWeight: number;
}

/**
 * Twenty-six ribbons of up to a hundred and thirty-two samples.
 *
 * Sized so the field reads as many separate things rather than as a few, and
 * so the whole graph still steps inside one Worker at 120 Hz on the low tier.
 */
export const DEFAULT_SYNTH: GraphSynthConfig = {
  seed: 0x5eed_c0de,
  ribbons: 26,
  samples: 132,
  step: 0.235,
  spread: [0, 2.05, 3.9],
  origin: -13.5,
  lengthRange: [0.52, 1.0],
  bend: 0.21,
  frequency: 0.115,
  halfWidth: 0.2,
  rollSpread: 1.5,
  rollDrift: 0.9,

  absorbSpan: 0.08,
  coupling: 2,
  couplingWeight: 0.22,
};

export interface SynthesisedGraph {
  graph: CausalGraph;
  bounds: StabilityBounds;
  /**
   * Ribbon layout, for the renderer. Each ribbon owns a contiguous run of node
   * indices, which is what lets the strip geometry be built without a second
   * pass over the topology.
   */
  layout: {
    count: number;
    starts: Uint32Array;
    lengths: Uint32Array;
    /** Half-width per node, tapering to nothing at both ends. */
    widths: Float32Array;
    /** Ribbon-local sideways direction, xyz per node. */
    binormals: Float32Array;
  };
  /** Position along the flow, 0..1, for the enforcement gain gradient. */
  depth: Float32Array;
  /**
   * Absorption per node: 0 through the body of a ribbon, rising to 1 at its
   * ends.
   *
   * A ribbon is a finite chain with free ends, so a wave that reaches one
   * reflects and comes back — and a strand carrying a pulse in both directions
   * at once stops looking like a wave and starts looking like a tape being
   * shaken. This is the sponge that swallows the front instead, so a deviation
   * leaves and keeps leaving.
   */
  absorption: Float32Array;
  stats: {
    nodes: number;
    edges: number;
    medianEdgeLength: number;
    degreeMin: number;
    degreeMax: number;
    degreeMean: number;
    components: number;
    bridgesAdded: number;
    couplingEdges: number;
  };
}

/** mulberry32 — same stream in the browser, the Worker and node. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ease = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

type Vec = [number, number, number];

const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * The law.
 *
 * One smooth field, evaluated at a point, returning the direction a ribbon
 * must travel there. Every ribbon integrates through this and nothing else,
 * which is why they agree without being parallel and without being connected:
 * they are not copies of each other, they are separate solutions to the same
 * constraint.
 *
 * Deliberately gentle. A field with strong vorticity produces tangles, and a
 * tangle is the decorative network this replaced.
 */
function flow(p: Vec, c: GraphSynthConfig): Vec {
  const k = c.frequency;
  return norm([
    1,
    Math.sin(p[0] * k + p[2] * k * 1.7) * c.bend + Math.sin(p[2] * k * 2.3) * c.bend * 0.35,
    Math.cos(p[0] * k * 0.85 - p[1] * k * 1.3) * c.bend * 0.72,
  ]);
}

export function synthesiseGraph(config: GraphSynthConfig = DEFAULT_SYNTH): SynthesisedGraph {
  const random = mulberry32(config.seed);
  const { ribbons, samples } = config;

  const starts = new Uint32Array(ribbons);
  const lengths = new Uint32Array(ribbons);

  // ------------------------------------------------------------- seed points
  //
  // Scattered in depth and height, never on a lattice. Spacing is uneven on
  // purpose: evenly spaced ribbons read as a comb, which is the surface again.
  // Index order stays coherent with position, so neighbours in index are
  // neighbours in space — that is what lets a group of them escape together.

  const seeds: Vec[] = [];
  const rollPhase: number[] = [];
  const rollRate: number[] = [];
  for (let r = 0; r < ribbons; r++) {
    const t = r / (ribbons - 1);
    const y = (t * 2 - 1) * config.spread[1] + (random() * 2 - 1) * config.spread[1] * 0.22;
    const z =
      Math.sin(t * Math.PI * 1.35) * config.spread[2] + (random() * 2 - 1) * config.spread[2] * 0.3;
    const x = config.origin + (random() * 2 - 1) * 1.9;
    seeds.push([x, y, z]);

    const span = config.lengthRange[1] - config.lengthRange[0];
    lengths[r] = Math.max(8, Math.round(samples * (config.lengthRange[0] + random() * span)));
    rollPhase.push((random() * 2 - 1) * config.rollSpread);
    rollRate.push((random() * 2 - 1) * config.rollDrift);
  }

  let nodeCount = 0;
  for (let r = 0; r < ribbons; r++) {
    starts[r] = nodeCount;
    nodeCount += lengths[r];
  }

  const positions = new Float32Array(nodeCount * 3);
  const directions = new Float32Array(nodeCount * 3);
  const binormals = new Float32Array(nodeCount * 3);
  const widths = new Float32Array(nodeCount);
  const depth = new Float32Array(nodeCount);
  const absorption = new Float32Array(nodeCount);

  // ---------------------------------------------------------- integrate them

  for (let r = 0; r < ribbons; r++) {
    let p: Vec = seeds[r];
    const count = lengths[r];

    for (let i = 0; i < count; i++) {
      const node = starts[r] + i;
      const at = node * 3;
      const tangent = flow(p, config);

      // A fixed reference for the frame, so neighbouring ribbons end up with
      // nearly the same sideways direction and the field reads as coordinated
      // rather than as each element doing its own thing.
      const flat = norm(cross(tangent, [0, 1, 0]));
      const lift = norm(cross(flat, tangent));

      // Rolled about its own path. Each ribbon has its own phase and its own
      // slow drift, so the field presents a mixture of faces and edges instead
      // of one shared angle.
      const roll = rollPhase[r] + rollRate[r] * (i / Math.max(count - 1, 1));
      const cos = Math.cos(roll);
      const sin = Math.sin(roll);
      const side: Vec = [
        flat[0] * cos + lift[0] * sin,
        flat[1] * cos + lift[1] * sin,
        flat[2] * cos + lift[2] * sin,
      ];
      const normal: Vec = [
        lift[0] * cos - flat[0] * sin,
        lift[1] * cos - flat[1] * sin,
        lift[2] * cos - flat[2] * sin,
      ];

      positions[at] = p[0];
      positions[at + 1] = p[1];
      positions[at + 2] = p[2];

      // Displacement is out of the flow, along the ribbon's normal: an escape
      // leaves the permitted path rather than sliding along it.
      directions[at] = normal[0];
      directions[at + 1] = normal[1];
      directions[at + 2] = normal[2];

      binormals[at] = side[0];
      binormals[at + 1] = side[1];
      binormals[at + 2] = side[2];

      // Tapered to nothing at both ends. A ribbon that stops at full width has
      // an end cap, and an end cap is a piece of an object.
      const along = i / Math.max(count - 1, 1);
      widths[node] = config.halfWidth * Math.min(ease(along / 0.14), ease((1 - along) / 0.14));

      // The sponge. Silent through the body, total at the tips, and eased so
      // the wave meets no step it could reflect off in its own right.
      const edge = Math.min(along, 1 - along) / config.absorbSpan;
      absorption[node] = 1 - ease(edge);

      depth[node] = Math.min(Math.max((p[0] - config.origin) / (2 * -config.origin), 0), 1);

      p = [
        p[0] + tangent[0] * config.step,
        p[1] + tangent[1] * config.step,
        p[2] + tangent[2] * config.step,
      ];
    }
  }

  // ------------------------------------------------------------------- edges

  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeWeightRaw: number[] = [];
  const edgeLength: number[] = [];

  const distance = (a: number, b: number): number =>
    Math.hypot(
      positions[a * 3] - positions[b * 3],
      positions[a * 3 + 1] - positions[b * 3 + 1],
      positions[a * 3 + 2] - positions[b * 3 + 2]
    );

  const addEdge = (a: number, b: number, weight: number): void => {
    edgeA.push(a);
    edgeB.push(b);
    edgeWeightRaw.push(weight);
    edgeLength.push(distance(a, b));
  };

  // A ribbon's own stiffness: it is one continuous thing along its length.
  for (let r = 0; r < ribbons; r++) {
    for (let i = 0; i + 1 < lengths[r]; i++) addEdge(starts[r] + i, starts[r] + i + 1, 1);
  }

  // The constraint field. Never drawn, and the only reason a deviation in one
  // ribbon becomes tension in its neighbours — without it each ribbon would be
  // corrected in isolation, and the field would look like a set of unrelated
  // events rather than one system responding.
  let couplingEdges = 0;
  for (let r = 0; r < ribbons; r++) {
    for (let n = 1; n <= config.coupling; n++) {
      const other = r + n;
      if (other >= ribbons) break;

      // Matched by position along the flow, so a link joins parts of two
      // ribbons that are actually beside each other.
      const steps = Math.min(lengths[r], lengths[other]);
      for (let i = 0; i < steps; i += 2) {
        const t = i / Math.max(steps - 1, 1);
        const a = starts[r] + Math.round(t * (lengths[r] - 1));
        const b = starts[other] + Math.round(t * (lengths[other] - 1));
        addEdge(a, b, config.couplingWeight / n);
        couplingEdges++;
      }
    }
  }

  // ----------------------------------------------------------------- weights

  const sorted = [...edgeLength].sort((a, b) => a - b);
  const medianEdgeLength = sorted[sorted.length >> 1] ?? config.step;

  const weightsPerEdge = new Float32Array(edgeA.length);
  for (let e = 0; e < edgeA.length; e++) {
    // Coupling edges span the gap between ribbons and are deliberately weak: a
    // ribbon is stiffer along itself than it is bound to its neighbour, or the
    // whole field would move as one slab.
    const ratio = edgeLength[e] / (medianEdgeLength * 4);
    weightsPerEdge[e] = edgeWeightRaw[e] * Math.max(Math.exp(-ratio * ratio), 0.05);
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

  const neighbours = new Uint32Array(entryCount);
  const weights = new Float32Array(entryCount);
  const cursor = offsets.slice(0, nodeCount);

  for (let e = 0; e < edgeA.length; e++) {
    const i = edgeA[e];
    const j = edgeB[e];
    neighbours[cursor[i]] = j;
    weights[cursor[i]] = weightsPerEdge[e];
    cursor[i]++;
    neighbours[cursor[j]] = i;
    weights[cursor[j]] = weightsPerEdge[e];
    cursor[j]++;
  }

  // ---------------------------------------------------------------- validity

  let maxWeightedDegree = 0;
  let degreeMin = Infinity;
  let degreeMax = 0;
  for (let i = 0; i < nodeCount; i++) {
    let sum = 0;
    for (let k = offsets[i]; k < offsets[i + 1]; k++) sum += weights[k];
    if (sum > maxWeightedDegree) maxWeightedDegree = sum;
    const d = offsets[i + 1] - offsets[i];
    if (d < degreeMin) degreeMin = d;
    if (d > degreeMax) degreeMax = d;
  }

  const lambdaMaxBound = 2 * maxWeightedDegree;
  const bounds: StabilityBounds = {
    maxWeightedDegree,
    lambdaMaxBound,
    waveDtMax: 2 / Math.sqrt(lambdaMaxBound),
  };

  const graph: CausalGraph = {
    nodeCount,
    entryCount,
    positions,
    directions,
    offsets,
    neighbours,
    weights,
  };

  return {
    graph,
    bounds,
    layout: { count: ribbons, starts, lengths, widths, binormals },
    depth,
    absorption,
    stats: {
      nodes: nodeCount,
      edges: edgeA.length,
      medianEdgeLength,
      degreeMin,
      degreeMax,
      degreeMean: entryCount / nodeCount,
      components: 1,
      bridgesAdded: 0,
      couplingEdges,
    },
  };
}
