/**
 * GraphSynth — four systems, one carrier.
 *
 * Nothing here is drawn as itself. There is one visible thing, trajectories,
 * and three invisible systems deciding where they go, how they divide and what
 * the system considers to be in tolerance. Layering four generative techniques
 * as four visual effects produces fractal soup; giving each a different
 * responsibility produces a structure with deep internal coherence and no
 * recognisable source.
 *
 *   ATTRACTOR      the governing law — the flow every trajectory is pulled into
 *   BRANCHING      rule-generated division, an L-system over that flow
 *   IFS            the same grammar re-applied at smaller scale, recursively
 *   ESCAPE FIELD   invisible: what the system considers stable or in violation
 *
 * The visitor should not be able to name any of it. No Lorenz butterfly, no
 * Mandelbrot silhouette, no fractal tree, no Sierpinski anything — the moment
 * the mathematics is recognisable the frame becomes a generative-art demo, and
 * a demo cannot carry a proposition. What they should see is that everything
 * is plainly related and be unable to work out what it is obeying. Then one
 * trajectory escapes, the structure corrects it, and the answer turns out to
 * be the only thing on screen that was never visible.
 *
 * Why the carrier kept changing
 * -----------------------------
 * Three structures died here. A seeded scatter of filaments read as a
 * decorative network. A swept surface read as a cutting board. Parallel
 * ribbons were closer but were still a designed object with a designed layout.
 * The fault each time was the same: a shape had been authored and then
 * justified.
 *
 * Nothing is authored here. The relationship between the trajectories is the
 * entity, and it falls out of the law rather than out of a decision about what
 * the hero should look like.
 *
 * Guards from the graveyard, satisfied by construction: no index becomes an
 * angle, there is no centre, no axis and no closed section. The attractor
 * contracts anisotropically — hard in one direction, weakly in the other — so
 * the bundle can never close into a tube, which is how the retired directions
 * died.
 */

import type { CausalGraph, StabilityBounds } from './GraphAsset';

export interface GraphSynthConfig {
  seed: number;
  /** Trajectories seeded directly into the flow. */
  roots: number;
  /** Samples along a root trajectory. */
  rootLength: number;
  /** Integration step, world units. */
  step: number;

  // --- the law ------------------------------------------------------------
  /** Where the flow begins in x. */
  origin: number;
  /**
   * Contraction toward the attracting core: firmer in y, weak in z.
   *
   * Deliberately gentle. Pulled hard, every trajectory reaches the core inside
   * the frame and the field collapses to a single curve — an attractor with
   * nothing left attracted to it. What should read is convergence in progress:
   * strands at different distances all bending the same way, none of them
   * having arrived.
   */
  pull: [number, number];
  /** Shear that keeps trajectories from collapsing onto one another. */
  shear: number;
  /** Spatial frequency of the core's wander. */
  frequency: number;
  /** How far the core wanders in y and z. */
  wander: [number, number];
  /** Half-extent trajectories are seeded into, y and z. */
  spread: [number, number];

  // --- branching, and the IFS that scales it ------------------------------
  /** Generations below the roots. */
  depth: number;
  /** Children produced per parent. */
  branching: number;
  /** Length of a child as a fraction of its parent. */
  lengthContraction: number;
  /** Width and offset contraction — the IFS ratio. */
  scaleContraction: number;
  /** How far a child is displaced from its parent at birth. */
  divergence: number;

  // --- the ribbons themselves ---------------------------------------------
  halfWidth: number;
  rollSpread: number;
  rollDrift: number;

  // --- the constraint field -----------------------------------------------
  /** Trajectories each node may couple to. Never drawn. */
  coupling: number;
  couplingWeight: number;
  /** Escape-time iterations. More is a sharper stability field. */
  escapeIterations: number;
}

export const DEFAULT_SYNTH: GraphSynthConfig = {
  seed: 0x5eed_c0de,
  roots: 12,
  rootLength: 120,
  step: 0.185,

  origin: -11.5,
  pull: [0.11, 0.035],
  shear: 0.3,
  frequency: 0.15,
  wander: [1.35, 2.6],
  spread: [3.1, 4.2],

  depth: 2,
  branching: 2,
  lengthContraction: 0.46,
  scaleContraction: 0.62,
  divergence: 0.5,

  halfWidth: 0.2,
  rollSpread: 1.5,
  rollDrift: 0.9,

  coupling: 2,
  couplingWeight: 0.3,
  escapeIterations: 24,
};

export interface SynthesisedGraph {
  graph: CausalGraph;
  bounds: StabilityBounds;
  layout: {
    count: number;
    starts: Uint32Array;
    lengths: Uint32Array;
    widths: Float32Array;
    binormals: Float32Array;
  };
  /**
   * What the system considers settled, per node: 1 where state stays bounded
   * under the escape map, 0 where it runs away at once. Never rendered — the
   * operator reads it to decide how hard to hold each part of the world.
   */
  stability: Float32Array;
  /** Position along the flow, 0..1. */
  depth: Float32Array;
  stats: {
    nodes: number;
    edges: number;
    medianEdgeLength: number;
    degreeMin: number;
    degreeMax: number;
    degreeMean: number;
    components: number;
    bridgesAdded: number;
    trajectories: number;
    couplingEdges: number;
    meanStability: number;
  };
}

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
 * The attracting core: the curve the flow is organised around.
 *
 * Not straight, and not periodic in any way the eye can lock onto — two
 * incommensurate terms per axis, so the wander never repeats inside the frame.
 */
function core(x: number, c: GraphSynthConfig): Vec {
  const k = c.frequency;
  return [
    x,
    Math.sin(x * k) * c.wander[0] + Math.sin(x * k * 2.7 + 1.1) * c.wander[0] * 0.3,
    Math.cos(x * k * 0.8 + 0.4) * c.wander[1] + Math.sin(x * k * 1.9) * c.wander[1] * 0.26,
  ];
}

/**
 * The law.
 *
 * A dissipative flow: it advances, contracts toward the core — hard in y, weak
 * in z — and shears according to where a trajectory sits relative to that core.
 * Every trajectory is solving the same equation, which is why they agree
 * without being copies and without touching.
 *
 * The contraction is deliberately anisotropic. Contract equally in y and z and
 * the bundle closes into a tube, trajectories wind around it, and the frame
 * fills with concentric rings — exactly how the retired directions died.
 * Pulled flat in one axis and left loose in the other, it cannot close.
 */
function attractor(p: Vec, c: GraphSynthConfig): Vec {
  const centre = core(p[0], c);
  const dy = p[1] - centre[1];
  const dz = p[2] - centre[2];
  const k = c.frequency;

  return norm([
    1,
    -c.pull[0] * dy + Math.sin(dz * k * 3.1 + p[0] * k) * c.shear,
    -c.pull[1] * dz + Math.sin(p[0] * k * 1.6 + dy * k * 2.2) * c.shear * 0.85,
  ]);
}

/**
 * The escape field — the system's own criterion for what is settled.
 *
 * A quadratic map iterated from a sheared projection of the point: state that
 * stays bounded for many iterations is settled, state that runs away at once
 * is not. Never drawn, and the projection is skewed across all three axes so
 * no view of the structure could recover the figure it comes from.
 *
 * What it buys is that the colour grammar stops being decoration. Where the
 * system enforces hardest becomes a real property of a real field: violet
 * appears where the mathematics says the state was least able to hold itself
 * together, rather than wherever a gradient was authored.
 */
function stabilityAt(p: Vec, c: GraphSynthConfig): number {
  // Skewed and scaled so the interesting band of the map lands across the
  // volume the trajectories occupy, at no recognisable orientation.
  const cr = p[0] * 0.055 + p[2] * 0.045 - 0.62;
  const ci = p[1] * 0.085 - p[2] * 0.038 + 0.21;

  let zr = 0;
  let zi = 0;
  let i = 0;
  for (; i < c.escapeIterations; i++) {
    const nr = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = nr;
    if (zr * zr + zi * zi > 4) break;
  }
  return i / c.escapeIterations;
}

interface Trajectory {
  start: number;
  length: number;
  generation: number;
}

export function synthesiseGraph(config: GraphSynthConfig = DEFAULT_SYNTH): SynthesisedGraph {
  const random = mulberry32(config.seed);

  const positions: number[] = [];
  const directions: number[] = [];
  const binormals: number[] = [];
  const widths: number[] = [];
  const stability: number[] = [];
  const depth: number[] = [];
  const trajectories: Trajectory[] = [];

  const span = 2 * -config.origin;

  /**
   * Integrates one trajectory through the flow and lays its samples down.
   *
   * A child is not a copy of its parent: it is released beside it with a
   * contracted frame and then obeys the same law. That is what makes the
   * structure self-similar without anything repeating — the same gesture of
   * leaving and being drawn back appears at every scale because the same
   * equation produces it at every scale.
   */
  const integrate = (from: Vec, length: number, generation: number, scale: number): Trajectory => {
    const start = positions.length / 3;
    const phase = (random() * 2 - 1) * config.rollSpread;
    const rate = (random() * 2 - 1) * config.rollDrift;
    let p = from;

    for (let i = 0; i < length; i++) {
      const tangent = attractor(p, config);
      const flat = norm(cross(tangent, [0, 1, 0]));
      const lift = norm(cross(flat, tangent));

      // Rolled about its own path, each trajectory with its own phase and
      // drift, so the field presents a mixture of faces and edges rather than
      // one shared angle to the eye.
      const roll = phase + rate * (i / Math.max(length - 1, 1));
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

      positions.push(p[0], p[1], p[2]);
      directions.push(normal[0], normal[1], normal[2]);
      binormals.push(side[0], side[1], side[2]);

      // Tapered to nothing at both ends: a trajectory that stops at full width
      // has an end cap, and an end cap is a piece of an object.
      const along = i / Math.max(length - 1, 1);
      widths.push(config.halfWidth * scale * Math.min(ease(along / 0.12), ease((1 - along) / 0.12)));

      stability.push(stabilityAt(p, config));
      depth.push(Math.min(Math.max((p[0] - config.origin) / span, 0), 1));

      p = [
        p[0] + tangent[0] * config.step,
        p[1] + tangent[1] * config.step,
        p[2] + tangent[2] * config.step,
      ];
    }

    const trajectory = { start, length, generation };
    trajectories.push(trajectory);
    return trajectory;
  };

  /** The production rule. Recursive, deterministic, bounded by depth. */
  const grow = (trajectory: Trajectory, scale: number): void => {
    if (trajectory.generation >= config.depth) return;

    const childLength = Math.max(10, Math.round(trajectory.length * config.lengthContraction));
    const childScale = scale * config.scaleContraction;

    for (let b = 0; b < config.branching; b++) {
      // Released from a rule-determined point along the parent: the same
      // fractions on every trajectory, offset per branch so siblings do not
      // leave together.
      const at = 0.22 + 0.34 * b + 0.1 * random();
      const index =
        trajectory.start + Math.min(trajectory.length - 1, Math.floor(at * trajectory.length));
      const sign = b === 0 ? 1 : -1;
      const push = config.divergence * scale;

      // The IFS map: contracted, displaced along the parent's own frame. The
      // child re-enters the same flow, so it is drawn back exactly as its
      // parent is, one scale down.
      const child: Vec = [
        positions[index * 3] + binormals[index * 3] * push * sign,
        positions[index * 3 + 1] +
          directions[index * 3 + 1] * push * 0.85 +
          binormals[index * 3 + 1] * push * sign,
        positions[index * 3 + 2] +
          directions[index * 3 + 2] * push * 0.85 +
          binormals[index * 3 + 2] * push * sign,
      ];

      grow(integrate(child, childLength, trajectory.generation + 1, childScale), childScale);
    }
  };

  // ------------------------------------------------------------------- seeds

  for (let r = 0; r < config.roots; r++) {
    const t = r / Math.max(config.roots - 1, 1);
    const seed: Vec = [
      config.origin + (random() * 2 - 1) * 1.4,
      (t * 2 - 1) * config.spread[0] + (random() * 2 - 1) * config.spread[0] * 0.3,
      Math.sin(t * Math.PI * 1.4) * config.spread[1] + (random() * 2 - 1) * config.spread[1] * 0.35,
    ];
    grow(integrate(seed, config.rootLength, 0, 1), 1);
  }

  const nodeCount = positions.length / 3;

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

  for (const t of trajectories) {
    for (let i = 0; i + 1 < t.length; i++) addEdge(t.start + i, t.start + i + 1, 1);
  }

  /**
   * The constraint field.
   *
   * Never drawn. It is how a deviation in one trajectory becomes tension in
   * the ones beside it, and how correction transfers outward through the
   * structure instead of being applied to each trajectory separately. Built
   * from proximity rather than from index, so it links whatever is actually
   * near — including a branch to the parent it grew from, which is what makes
   * the scales one system rather than three sets of unrelated curves.
   */
  let couplingEdges = 0;
  const cell = 1.15;
  const key = (x: number, y: number, z: number): number =>
    ((Math.floor(x / cell) + 512) & 1023) * 1048576 +
    ((Math.floor(y / cell) + 512) & 1023) * 1024 +
    ((Math.floor(z / cell) + 512) & 1023);

  const buckets = new Map<number, number[]>();
  for (let i = 0; i < nodeCount; i++) {
    const k = key(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(i);
    else buckets.set(k, [i]);
  }

  const owner = new Int32Array(nodeCount);
  for (let t = 0; t < trajectories.length; t++) {
    for (let i = 0; i < trajectories[t].length; i++) owner[trajectories[t].start + i] = t;
  }

  // Budgeted at both ends. Without a cap on the receiving node, every node in
  // a crowded cell links to the same few neighbours and those become hubs of
  // sixty-odd edges: the graph turns stiff, a strike diffuses instead of
  // travelling, and the escape stops looking like a group leaving together.
  const linked = new Set<string>();
  const spent = new Uint8Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 3) {
    if (spent[i] >= config.coupling) continue;
    const bucket = buckets.get(key(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]));
    if (!bucket) continue;

    for (let b = 0; b < bucket.length && spent[i] < config.coupling; b++) {
      const j = bucket[b];
      if (owner[j] === owner[i] || spent[j] >= config.coupling) continue;
      const pair = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (linked.has(pair)) continue;
      linked.add(pair);
      addEdge(i, j, config.couplingWeight);
      spent[i]++;
      spent[j]++;
      couplingEdges++;
    }
  }

  // ------------------------------------------------- reachable, or invisible
  //
  // A trajectory the wave can never reach is structure that sits in frame
  // permanently dark, so anything proximity missed is bridged to its nearest
  // node outside its own component, deterministically.

  const reach = buildAdjacency(nodeCount, edgeA, edgeB);
  const label = new Int32Array(nodeCount).fill(-1);
  const components: number[][] = [];
  for (let i = 0; i < nodeCount; i++) {
    if (label[i] !== -1) continue;
    const id = components.length;
    const members = [i];
    label[i] = id;
    for (let head = 0; head < members.length; head++) {
      for (const j of reach[members[head]]) {
        if (label[j] === -1) {
          label[j] = id;
          members.push(j);
        }
      }
    }
    components.push(members);
  }

  let bridgesAdded = 0;
  if (components.length > 1) {
    let largest = 0;
    for (let c = 1; c < components.length; c++) {
      if (components[c].length > components[largest].length) largest = c;
    }
    const trunk = components[largest];

    for (let c = 0; c < components.length; c++) {
      if (c === largest) continue;
      let bestI = -1;
      let bestJ = -1;
      let bestD = Infinity;
      for (const i of components[c]) {
        for (const j of trunk) {
          const d = distance(i, j);
          if (d < bestD) {
            bestD = d;
            bestI = i;
            bestJ = j;
          }
        }
      }
      if (bestI !== -1) {
        addEdge(bestI, bestJ, config.couplingWeight);
        bridgesAdded++;
      }
    }
  }

  // ----------------------------------------------------------------- weights

  const sorted = [...edgeLength].sort((a, b) => a - b);
  const medianEdgeLength = sorted[sorted.length >> 1] ?? config.step;

  const weightsPerEdge = new Float32Array(edgeA.length);
  for (let e = 0; e < edgeA.length; e++) {
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

  const starts = new Uint32Array(trajectories.length);
  const lengths = new Uint32Array(trajectories.length);
  trajectories.forEach((t, i) => {
    starts[i] = t.start;
    lengths[i] = t.length;
  });

  const stabilityField = Float32Array.from(stability);
  let meanStability = 0;
  for (let i = 0; i < stabilityField.length; i++) meanStability += stabilityField[i];
  meanStability /= Math.max(stabilityField.length, 1);

  const graph: CausalGraph = {
    nodeCount,
    entryCount,
    positions: Float32Array.from(positions),
    directions: Float32Array.from(directions),
    offsets,
    neighbours,
    weights,
  };

  return {
    graph,
    bounds,
    layout: {
      count: trajectories.length,
      starts,
      lengths,
      widths: Float32Array.from(widths),
      binormals: Float32Array.from(binormals),
    },
    stability: stabilityField,
    depth: Float32Array.from(depth),
    stats: {
      nodes: nodeCount,
      edges: edgeA.length,
      medianEdgeLength,
      degreeMin,
      degreeMax,
      degreeMean: entryCount / nodeCount,
      components: components.length,
      bridgesAdded,
      trajectories: trajectories.length,
      couplingEdges,
      meanStability,
    },
  };
}

function buildAdjacency(nodeCount: number, edgeA: number[], edgeB: number[]): number[][] {
  const adjacency: number[][] = Array.from({ length: nodeCount }, () => []);
  for (let e = 0; e < edgeA.length; e++) {
    adjacency[edgeA[e]].push(edgeB[e]);
    adjacency[edgeB[e]].push(edgeA[e]);
  }
  return adjacency;
}
