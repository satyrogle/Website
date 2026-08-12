/**
 * GraphSynth — the structure, synthesised from a seed.
 *
 * There is no asset. The same seed produces the same graph on every machine
 * and every visit, which is what lets the determinism claim extend all the way
 * down to the geometry rather than starting at the first simulation tick.
 *
 * Construction rules, in force because of how the retired directions died:
 *
 *   - No grid. Nodes come from wandering filaments plus accepted scatter, so
 *     spacing is irregular everywhere and no row or column exists to read.
 *   - No radial or cylindrical parameterisation. Nothing in this file converts
 *     an index into an angle. There is no centre, no axis and no ring, so a
 *     capture frame cannot resolve into concentric anything.
 *   - Anisotropic by construction: long in x, deep in z, thin in y. A veil,
 *     seen obliquely, rather than a cloud with no orientation.
 *
 * Displacement direction is close to the veil normal (±y) with seeded lateral
 * variation, so a deviation lifts the sheet out of its own plane and reads in
 * silhouette — the enforcement has to be visible as movement, not as colour.
 */

import type { CausalGraph, StabilityBounds } from './GraphAsset';

export interface GraphSynthConfig {
  seed: number;
  /** Nodes laid down by filament walks. */
  filamentCount: number;
  filamentSteps: number;
  /** Extra nodes accepted into the gaps between filaments. */
  interstitialTarget: number;
  /** Neighbours per node before symmetrisation. */
  neighbours: number;
  /** Half-extent of the veil: long in x, thin in y, deep in z. */
  extent: [number, number, number];
  /** Nominal distance between adjacent nodes along a filament. */
  spacing: number;
  /** How far the displacement direction may tilt off the veil normal, radians. */
  directionSpread: number;
}

/**
 * ~3,100 nodes at k = 5. Sized so the whole graph steps comfortably inside one
 * Worker at 120 Hz on the low tier, and so the veil reads as filaments rather
 * than as a solid mass.
 */
export const DEFAULT_SYNTH: GraphSynthConfig = {
  seed: 0x5eed_c0de,
  filamentCount: 58,
  filamentSteps: 45,
  interstitialTarget: 520,
  neighbours: 5,
  extent: [9.0, 0.85, 4.6],
  spacing: 0.34,
  directionSpread: 0.42,
};

export interface SynthesisedGraph {
  graph: CausalGraph;
  bounds: StabilityBounds;
  stats: {
    nodes: number;
    edges: number;
    medianEdgeLength: number;
    degreeMin: number;
    degreeMax: number;
    degreeMean: number;
    components: number;
    bridgesAdded: number;
  };
}

/**
 * mulberry32. Chosen because it is four lines, has no hidden global state and
 * gives the same stream in the browser, the Worker and node — the three places
 * that have to agree for a replay to mean anything.
 */
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

/** Uniform spatial hash. Only ever queried at a radius below the cell size. */
class SpatialHash {
  private readonly cells = new Map<number, number[]>();
  private readonly inverseCell: number;

  constructor(cellSize: number) {
    this.inverseCell = 1 / cellSize;
  }

  private key(x: number, y: number, z: number): number {
    // 1024³ cells of address space, which the veil never approaches.
    const cx = (Math.floor(x * this.inverseCell) + 512) & 1023;
    const cy = (Math.floor(y * this.inverseCell) + 512) & 1023;
    const cz = (Math.floor(z * this.inverseCell) + 512) & 1023;
    return (cx << 20) | (cy << 10) | cz;
  }

  insert(index: number, x: number, y: number, z: number): void {
    const key = this.key(x, y, z);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
  }

  /** Candidate indices from the 27 cells around a point, in insertion order. */
  near(x: number, y: number, z: number, out: number[]): number[] {
    out.length = 0;
    const bx = Math.floor(x * this.inverseCell);
    const by = Math.floor(y * this.inverseCell);
    const bz = Math.floor(z * this.inverseCell);
    const size = 1 / this.inverseCell;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = this.cells.get(
            this.key((bx + dx) * size + size * 0.5, (by + dy) * size + size * 0.5, (bz + dz) * size + size * 0.5)
          );
          if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
        }
      }
    }
    return out;
  }
}

/**
 * A seeded smooth vector field, sampled for filament curvature and for
 * displacement directions. Three incommensurate sinusoids per component: cheap,
 * continuous, and with no period short enough to repeat inside the veil.
 */
function smoothField(seed: number): (x: number, y: number, z: number, out: [number, number, number]) => void {
  const random = mulberry32(seed);
  const k: number[] = [];
  for (let i = 0; i < 27; i++) k.push(random());

  return (x, y, z, out) => {
    for (let c = 0; c < 3; c++) {
      const at = c * 9;
      // Frequencies deliberately not rational multiples of each other.
      const f1 = 0.19 + k[at] * 0.23;
      const f2 = 0.41 + k[at + 1] * 0.37;
      const f3 = 0.77 + k[at + 2] * 0.51;
      out[c] =
        Math.sin(x * f1 + y * f2 * 0.6 + k[at + 3] * 6.283) * 0.6 +
        Math.sin(z * f2 + x * f3 * 0.4 + k[at + 4] * 6.283) * 0.3 +
        Math.sin(y * f3 + z * f1 * 0.8 + k[at + 5] * 6.283) * 0.2;
    }
  };
}

function normalise(v: [number, number, number]): void {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-6) {
    v[0] = 0;
    v[1] = 1;
    v[2] = 0;
    return;
  }
  v[0] /= length;
  v[1] /= length;
  v[2] /= length;
}

export function synthesiseGraph(config: GraphSynthConfig = DEFAULT_SYNTH): SynthesisedGraph {
  const random = mulberry32(config.seed);
  const curl = smoothField(config.seed ^ 0x9e37_79b9);
  const tilt = smoothField(config.seed ^ 0x85eb_ca6b);
  const [ex, ey, ez] = config.extent;

  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];

  // ---------------------------------------------------------------- filaments

  const field: [number, number, number] = [0, 0, 0];

  for (let f = 0; f < config.filamentCount; f++) {
    // Start points are spread across the veil by rejection against its own
    // envelope rather than by stepping through a lattice of slots — a lattice
    // of start points is a grid however far the walks wander afterwards.
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      const cx = (random() * 2 - 1) * ex;
      const cy = (random() * 2 - 1) * ey;
      const cz = (random() * 2 - 1) * ez;
      // Soft envelope: denser through the middle of the veil, thinning out at
      // the fringe. Nothing here is a function of distance from a centre point
      // in the round — each axis falls off independently, so the boundary is a
      // soft slab, never a sphere or a disc.
      const density =
        (1 - (cx / ex) ** 2 * 0.55) * (1 - (cy / ey) ** 2 * 0.35) * (1 - (cz / ez) ** 2 * 0.5);
      if (random() < density) {
        px = cx;
        py = cy;
        pz = cz;
        break;
      }
      px = cx;
      py = cy;
      pz = cz;
    }

    // Heading starts biased along the long axis, both directions, then curves.
    const direction: [number, number, number] = [
      (random() < 0.5 ? -1 : 1) * (0.55 + random() * 0.45),
      (random() * 2 - 1) * 0.16,
      (random() * 2 - 1) * 0.62,
    ];
    normalise(direction);

    const steps = config.filamentSteps + Math.floor(random() * 13) - 6;

    for (let s = 0; s < steps; s++) {
      xs.push(px);
      ys.push(py);
      zs.push(pz);

      curl(px * 0.8, py * 2.4, pz * 0.8, field);
      // Curvature accumulates: the walk bends continuously instead of jittering,
      // so the result reads as a filament rather than as a random cloud.
      direction[0] += field[0] * 0.20;
      direction[1] += field[1] * 0.055;
      direction[2] += field[2] * 0.20;

      // Soft containment. Applied as a force on the heading, never as a clamp
      // on position, so filaments turn away from the boundary rather than
      // piling up flat against it and drawing its edge.
      direction[0] -= (px / ex) ** 3 * 0.34;
      direction[1] -= (py / ey) ** 3 * 0.30;
      direction[2] -= (pz / ez) ** 3 * 0.34;
      normalise(direction);

      const step = config.spacing * (0.8 + random() * 0.45);
      px += direction[0] * step;
      py += direction[1] * step * 0.55;
      pz += direction[2] * step;
    }
  }

  // ------------------------------------------------------------ interstitials

  const cell = config.spacing * 2.2;
  const hash = new SpatialHash(cell);
  for (let i = 0; i < xs.length; i++) hash.insert(i, xs[i], ys[i], zs[i]);

  const scratch: number[] = [];
  const nearMin = config.spacing * 0.55;
  const nearMax = config.spacing * 1.5;
  let accepted = 0;

  // Bounded attempts: the loop must terminate on the same iteration every run,
  // so it is capped by attempts rather than by "until the quota is met".
  const attempts = config.interstitialTarget * 9;
  for (let a = 0; a < attempts && accepted < config.interstitialTarget; a++) {
    const cx = (random() * 2 - 1) * ex * 0.98;
    const cy = (random() * 2 - 1) * ey * 0.98;
    const cz = (random() * 2 - 1) * ez * 0.98;

    let nearest = Infinity;
    const candidates = hash.near(cx, cy, cz, scratch);
    for (let c = 0; c < candidates.length; c++) {
      const j = candidates[c];
      const d = Math.hypot(xs[j] - cx, ys[j] - cy, zs[j] - cz);
      if (d < nearest) nearest = d;
    }

    // Accepted only in the gaps: close enough to belong to the structure, far
    // enough not to double a filament. This is what stops the veil reading as
    // a bundle of parallel strands.
    if (nearest < nearMin || nearest > nearMax) continue;

    const index = xs.length;
    xs.push(cx);
    ys.push(cy);
    zs.push(cz);
    hash.insert(index, cx, cy, cz);
    accepted++;
  }

  const nodeCount = xs.length;
  const positions = new Float32Array(nodeCount * 3);
  for (let i = 0; i < nodeCount; i++) {
    positions[i * 3] = xs[i];
    positions[i * 3 + 1] = ys[i];
    positions[i * 3 + 2] = zs[i];
  }

  // -------------------------------------------------------------------- edges

  // Undirected edge set, keyed low·N + high so a pair can only be added once.
  const edgeKeys = new Set<number>();
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeLength: number[] = [];

  const addEdge = (i: number, j: number, d: number): void => {
    if (i === j) return;
    const low = i < j ? i : j;
    const high = i < j ? j : i;
    const key = low * nodeCount + high;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edgeA.push(low);
    edgeB.push(high);
    edgeLength.push(d);
  };

  // k nearest, then symmetrised by the set above. Degree therefore varies —
  // a node that is nobody's neighbour keeps k edges, a node in a dense pocket
  // collects more. Irregular degree is load-bearing: it is what makes the wave
  // arrive at different times in different places.
  const best: { index: number; d: number }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    best.length = 0;
    const candidates = hash.near(xs[i], ys[i], zs[i], scratch);

    for (let c = 0; c < candidates.length; c++) {
      const j = candidates[c];
      if (j === i) continue;
      const d = Math.hypot(xs[j] - xs[i], ys[j] - ys[i], zs[j] - zs[i]);
      if (best.length < config.neighbours) {
        best.push({ index: j, d });
        best.sort((p, q) => p.d - q.d || p.index - q.index);
      } else if (d < best[best.length - 1].d) {
        best[best.length - 1] = { index: j, d };
        best.sort((p, q) => p.d - q.d || p.index - q.index);
      }
    }

    for (let b = 0; b < best.length; b++) addEdge(i, best[b].index, best[b].d);
  }

  // ------------------------------------------------------- connect components

  // A disconnected fragment can never be reached by a wave and can never be
  // corrected, so it would sit in frame as permanently dark structure. Bridges
  // are added deterministically: components in index order, joined by their
  // closest pair found in index order.
  const label = new Int32Array(nodeCount).fill(-1);
  const adjacency: number[][] = Array.from({ length: nodeCount }, () => []);
  for (let e = 0; e < edgeA.length; e++) {
    adjacency[edgeA[e]].push(edgeB[e]);
    adjacency[edgeB[e]].push(edgeA[e]);
  }

  const componentMembers: number[][] = [];
  for (let i = 0; i < nodeCount; i++) {
    if (label[i] !== -1) continue;
    const id = componentMembers.length;
    const members: number[] = [i];
    label[i] = id;
    for (let head = 0; head < members.length; head++) {
      const node = members[head];
      const list = adjacency[node];
      for (let n = 0; n < list.length; n++) {
        if (label[list[n]] === -1) {
          label[list[n]] = id;
          members.push(list[n]);
        }
      }
    }
    componentMembers.push(members);
  }

  let bridgesAdded = 0;
  if (componentMembers.length > 1) {
    let largest = 0;
    for (let c = 1; c < componentMembers.length; c++) {
      if (componentMembers[c].length > componentMembers[largest].length) largest = c;
    }
    const trunk = componentMembers[largest];

    for (let c = 0; c < componentMembers.length; c++) {
      if (c === largest) continue;
      let bestI = -1;
      let bestJ = -1;
      let bestD = Infinity;
      const members = componentMembers[c];
      for (let m = 0; m < members.length; m++) {
        const i = members[m];
        for (let t = 0; t < trunk.length; t++) {
          const j = trunk[t];
          const d = Math.hypot(xs[j] - xs[i], ys[j] - ys[i], zs[j] - zs[i]);
          if (d < bestD) {
            bestD = d;
            bestI = i;
            bestJ = j;
          }
        }
      }
      if (bestI !== -1) {
        addEdge(bestI, bestJ, bestD);
        bridgesAdded++;
      }
    }
  }

  // ------------------------------------------------------------------ weights

  const sorted = [...edgeLength].sort((a, b) => a - b);
  const medianEdgeLength = sorted[sorted.length >> 1] ?? config.spacing;
  const sigma = medianEdgeLength;

  const edgeWeight = new Float32Array(edgeA.length);
  for (let e = 0; e < edgeA.length; e++) {
    const ratio = edgeLength[e] / sigma;
    // Gaussian falloff, floored. A bridge across a gap must still conduct, or
    // the fragment it rescues stays effectively dark.
    edgeWeight[e] = Math.max(Math.exp(-ratio * ratio), 0.04);
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

  // --------------------------------------------------- displacement direction

  const directions = new Float32Array(nodeCount * 3);
  const tilted: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < nodeCount; i++) {
    tilt(xs[i] * 0.55, ys[i] * 1.6, zs[i] * 0.55, tilted);
    const spread = config.directionSpread;
    // Dominated by the veil normal so a deviation lifts the sheet out of its
    // own plane, with enough lateral variation that the return never reads as
    // one rigid slab moving.
    const nx = tilted[0] * spread;
    const ny = 1;
    const nz = tilted[2] * spread;
    const length = Math.hypot(nx, ny, nz);
    directions[i * 3] = nx / length;
    directions[i * 3 + 1] = ny / length;
    directions[i * 3 + 2] = nz / length;
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
    stats: {
      nodes: nodeCount,
      edges: edgeA.length,
      medianEdgeLength,
      degreeMin,
      degreeMax,
      degreeMean: entryCount / nodeCount,
      components: componentMembers.length,
      bridgesAdded,
    },
  };
}
