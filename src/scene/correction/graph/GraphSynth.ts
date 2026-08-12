/**
 * GraphSynth — the permitted state, synthesised from a rule.
 *
 * There is no asset. The structure is a governed surface: every node is
 * derived from one smooth parametric rule, so the whole thing is exactly as
 * regular as the rule is, and it is identical on every machine and every
 * visit.
 *
 * What it replaces, and why
 * ------------------------
 * The first structure here was a seeded scatter of wandering filaments with
 * probabilistic cross-links. It was irregular on purpose — irregularity was
 * the guard against the retired directions, which died of symmetry. But the
 * guard overshot: a cloud of tangled strands reads as a decorative network,
 * and a network cannot express governance. Nothing about it looked like it was
 * being held to anything, so when the correction ran it had no order to
 * restore, only a tangle to rearrange.
 *
 * The proposition needs the opposite. A governed system has to look governed
 * before anything happens to it: coherent flow, a silhouette that was decided
 * rather than grown, spacing that is even because something keeps it even. The
 * beauty on arrival is supposed to be evidence, and evidence of enforcement
 * looks like discipline, not like weather.
 *
 * The rules that survived from the graveyard are still in force, and this
 * satisfies them differently:
 *
 *   - No rotational symmetry, and no cylindrical parameterisation. The band is
 *     swept along an open curve with an open cross-section. Nothing here
 *     converts an index into an angle about an axis, there is no centre, and
 *     no view of it can resolve into concentric rings.
 *   - Anisotropic by construction: long in x, sweeping in z, shallow in y.
 *   - Not a grid in the frame. The lattice is regular in *parameter* space and
 *     is then swept, twisted and tapered through three dimensions, so no row,
 *     column or axis survives into the picture.
 *
 * Displacement runs along the surface normal, which is what makes a deviation
 * legible: the sheet physically lifts out of itself, and is physically pressed
 * back. The disagreement is geometry before it is ever colour.
 */

import type { CausalGraph, StabilityBounds } from './GraphAsset';

export interface GraphSynthConfig {
  /** Kept so a determinism check can vary the structure. */
  seed: number;
  /** Samples along the sweep. The flow direction. */
  along: number;
  /** Lines across the band. */
  across: number;
  /** Half-length of the sweep in x. */
  reach: number;
  /** Widest half-width of the band. */
  halfWidth: number;
  /** Narrowest half-width, at the tips. Never zero: the tips must not pinch. */
  tipWidth: number;
  /** Height of the shallow arch across the band's own width. */
  arch: number;
  /**
   * Constant rotation of the band about its own sweep, radians.
   *
   * This is the difference between seeing a surface and seeing its edge. Lying
   * flat, the band presents almost nothing to a camera that is only slightly
   * above it: a sliver, whatever its width. Rolled toward the viewer it reads
   * as what it is — a plane held to a shape.
   */
  roll: number;
  /** Additional rotation accumulated along the sweep, radians. */
  twist: number;
  /** Rise and fall of the centreline in y. */
  rise: number;
  /** How far the centreline sweeps through depth. */
  sweep: number;
  /** Draw one rib every N samples along the flow. */
  ribEvery: number;
  /** Slides the whole band along x so the composition sits inside the frame. */
  shift: number;
  /** Fraction of the sweep spent widening at each end. */
  plateau: number;
}

/**
 * ~3,400 nodes: enough that the surface reads as a continuous sheet of light
 * rather than a set of strands, and few enough that the whole lattice steps
 * comfortably inside one Worker at 120 Hz on the low tier.
 *
 * The proportions are the composition. A long shallow band met obliquely fills
 * the frame's width against the display type without ever becoming a mass, and
 * the taper gives it a silhouette that ends deliberately instead of running
 * off the edge.
 */
export const DEFAULT_SYNTH: GraphSynthConfig = {
  seed: 0x5eed_c0de,
  along: 100,
  across: 40,
  reach: 9.0,
  halfWidth: 3.3,
  tipWidth: 0.5,
  arch: 1.05,
  roll: -0.62,
  twist: 0.42,
  rise: 0.92,
  sweep: 1.95,
  ribEvery: 12,
  shift: -3.4,
  plateau: 0.34,
};

export interface SynthesisedGraph {
  graph: CausalGraph;
  bounds: StabilityBounds;
  /**
   * The subset of edges the renderer draws, as endpoint pairs.
   *
   * The simulation runs on the full lattice — it has to, or the wave would
   * only travel in one direction — but drawing every edge produces an even
   * mesh, and an even mesh reads as a chart. Drawing every line along the flow
   * and only every sixth rib across it gives the surface a direction: it looks
   * combed, which is what a governed thing looks like.
   */
  renderEdges: Uint32Array;
  stats: {
    nodes: number;
    edges: number;
    medianEdgeLength: number;
    degreeMin: number;
    degreeMax: number;
    degreeMean: number;
    components: number;
    bridgesAdded: number;
    /** Edges actually drawn, of the total. */
    drawnEdges: number;
  };
}

/** Smootherstep. Used for the tapers, so the ends ease rather than stop. */
const ease = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
};

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * The centreline the band is swept along.
 *
 * Authored, not sampled from noise. It leans through all three axes at once so
 * the structure is oblique to every one of them — a band that lies in a plane
 * reads as a chart, and one that lines up with an axis reads as a diagram.
 */
function centre(u: number, c: GraphSynthConfig): Vec {
  const t = u * 2 - 1;
  return [
    t * c.reach + c.shift,
    // One shallow crest, off centre, so the profile is asymmetric.
    Math.sin((u * 0.86 + 0.09) * Math.PI) * c.rise - c.rise * 0.42,
    Math.sin((u * 0.78 + 0.16) * Math.PI) * c.sweep - c.sweep * 0.55,
  ];
}

/**
 * Half-width along the sweep.
 *
 * Parallel-sided for most of its length, easing to a blunt end at each tip.
 * The first version tapered continuously from the middle, which made the
 * silhouette a long point with the flow lines fanning out of it — and that
 * reads as a feather. Straight edges over three quarters of the run read as
 * something cut to a width instead, which is the whole difference between a
 * grown thing and a governed one.
 */
function halfWidth(u: number, c: GraphSynthConfig): number {
  // Tapered at the far end only. Closing both ends put a converging bundle of
  // flow lines near the camera, and a bundle converging to a point is a
  // nozzle — an object, with a front and a purpose. Left open at the near end
  // the band simply continues past the frame, which says the opposite thing:
  // what is on screen is part of something larger, and the frame is a view of
  // it rather than a portrait of it.
  return c.tipWidth + (c.halfWidth - c.tipWidth) * ease(u / c.plateau);
}

/**
 * A point on the surface.
 *
 * The band is carried along the centreline by a frame that rotates slowly
 * about the sweep — a controlled twist, well short of anything that could
 * close into a tube — and is arched across its own width so the sheet has a
 * section rather than being flat. The arch is what gives the silhouette
 * something to be.
 */
function surface(u: number, v: number, c: GraphSynthConfig): Vec {
  const p = centre(u, c);
  const ahead = centre(Math.min(u + 1e-3, 1), c);
  const behind = centre(Math.max(u - 1e-3, 0), c);
  const tangent = norm(sub(ahead, behind));

  // A reference that is never parallel to the tangent, so the frame is stable
  // along the whole sweep.
  const up: Vec = [0, 1, 0];
  const side = norm(cross(tangent, up));
  const lift = norm(cross(side, tangent));

  const angle = c.roll + c.twist * (u - 0.5);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const width: Vec = [
    side[0] * cos + lift[0] * sin,
    side[1] * cos + lift[1] * sin,
    side[2] * cos + lift[2] * sin,
  ];
  const normal: Vec = [
    lift[0] * cos - side[0] * sin,
    lift[1] * cos - side[1] * sin,
    lift[2] * cos - side[2] * sin,
  ];

  const h = halfWidth(u, c);
  // The arch follows the width, so the section is deepest where the band is
  // widest and flattens as it closes — one rule, not two.
  const archHeight = c.arch * (1 - v * v) * ease(u / c.plateau);

  return [
    p[0] + width[0] * v * h + normal[0] * archHeight,
    p[1] + width[1] * v * h + normal[1] * archHeight,
    p[2] + width[2] * v * h + normal[2] * archHeight,
  ];
}

export function synthesiseGraph(config: GraphSynthConfig = DEFAULT_SYNTH): SynthesisedGraph {
  const { along, across } = config;
  const nodeCount = along * across;

  const positions = new Float32Array(nodeCount * 3);
  const directions = new Float32Array(nodeCount * 3);

  const index = (i: number, j: number): number => i * across + j;

  // ------------------------------------------------------------- the surface

  for (let i = 0; i < along; i++) {
    const u = i / (along - 1);
    for (let j = 0; j < across; j++) {
      const v = (j / (across - 1)) * 2 - 1;
      const p = surface(u, v, config);
      const at = index(i, j) * 3;
      positions[at] = p[0];
      positions[at + 1] = p[1];
      positions[at + 2] = p[2];
    }
  }

  // --------------------------------------------------------------- normals
  //
  // Taken from the surface itself by finite difference rather than authored,
  // so displacement is always exactly out of the sheet. This is the whole
  // reason a deviation reads as a deviation: it leaves the permitted surface
  // along the one direction the surface does not contain.

  const step = 1 / (along - 1) / 2;
  const gap = 1 / (across - 1) / 2;
  for (let i = 0; i < along; i++) {
    const u = i / (along - 1);
    for (let j = 0; j < across; j++) {
      const v = (j / (across - 1)) * 2 - 1;
      const du = sub(
        surface(Math.min(u + step, 1), v, config),
        surface(Math.max(u - step, 0), v, config)
      );
      const dv = sub(
        surface(u, Math.min(v + gap, 1), config),
        surface(u, Math.max(v - gap, -1), config)
      );
      const n = norm(cross(du, dv));
      const at = index(i, j) * 3;
      directions[at] = n[0];
      directions[at + 1] = n[1];
      directions[at + 2] = n[2];
    }
  }

  // ----------------------------------------------------------------- lattice

  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeLength: number[] = [];
  const drawn: boolean[] = [];

  const length = (a: number, b: number): number =>
    Math.hypot(
      positions[a * 3] - positions[b * 3],
      positions[a * 3 + 1] - positions[b * 3 + 1],
      positions[a * 3 + 2] - positions[b * 3 + 2]
    );

  const addEdge = (a: number, b: number, draw: boolean): void => {
    edgeA.push(a);
    edgeB.push(b);
    edgeLength.push(length(a, b));
    drawn.push(draw);
  };

  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      // Along the flow. Every one of these is drawn: they are the coherence.
      if (i + 1 < along) addEdge(index(i, j), index(i + 1, j), true);
      // Across the band. Load-bearing for the simulation, mostly not drawn —
      // an even mesh reads as a chart, and the ribs are what make the surface
      // look held rather than woven.
      if (j + 1 < across) {
        const rib = i % config.ribEvery === 0 || i === along - 1;
        addEdge(index(i, j), index(i, j + 1), rib);
      }
    }
  }

  // ------------------------------------------------------------------ weights

  const sorted = [...edgeLength].sort((a, b) => a - b);
  const medianEdgeLength = sorted[sorted.length >> 1] ?? 1;
  const sigma = medianEdgeLength;

  const edgeWeight = new Float32Array(edgeA.length);
  for (let e = 0; e < edgeA.length; e++) {
    const ratio = edgeLength[e] / sigma;
    // Gaussian falloff, floored. Near the tips the band is narrow and its
    // transverse edges are short; the floor keeps a long edge conducting so no
    // part of the surface can go dark and stay dark.
    edgeWeight[e] = Math.max(Math.exp(-ratio * ratio), 0.06);
  }

  // ---------------------------------------------------------------------- CSR

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
    weights[cursor[i]] = edgeWeight[e];
    cursor[i]++;
    neighbours[cursor[j]] = i;
    weights[cursor[j]] = edgeWeight[e];
    cursor[j]++;
  }

  // ------------------------------------------------------------ drawn subset

  let drawnCount = 0;
  for (let e = 0; e < drawn.length; e++) if (drawn[e]) drawnCount++;
  const renderEdges = new Uint32Array(drawnCount * 2);
  let at = 0;
  for (let e = 0; e < drawn.length; e++) {
    if (!drawn[e]) continue;
    renderEdges[at++] = edgeA[e];
    renderEdges[at++] = edgeB[e];
  }

  // ----------------------------------------------------------------- validity

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
    renderEdges,
    stats: {
      nodes: nodeCount,
      edges: edgeA.length,
      medianEdgeLength,
      degreeMin,
      degreeMax,
      degreeMean: entryCount / nodeCount,
      // A swept lattice is connected by construction; both are reported so the
      // gate keeps checking rather than trusting that.
      components: 1,
      bridgesAdded: 0,
      drawnEdges: drawnCount,
    },
  };
}
