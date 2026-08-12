/**
 * SurfaceSynth — the structure, synthesised from a seed.
 *
 * The hero is a surface: a bounded expanse of dense dark material, finished to
 * a tolerance and held level, deliberately ambiguous between a machined solid
 * and a standing fluid. Order is the *absence of incident* across it, which is
 * the one kind of order that cannot collapse into a grid, a stripe or a plexus,
 * because it has no elements to arrange.
 *
 * That replaces the veil, which failed because it was defined only by what it
 * was forbidden to be. Here the approved state is a positive property the
 * visitor already understands — unblemished, and level — so the record can be
 * read straight off the object.
 *
 * Construction, and why:
 *
 *   - Irregular point set, Delaunay triangulated. Not a jittered grid: a grid
 *     graph carries waves faster along its axes than across them, so a strike
 *     would spread as a diamond and the topology would become visible in the
 *     one moment that matters. Delaunay over Poisson-ish points is isotropic.
 *   - A convex boundary polygon with straight edges, asymmetric, five sides.
 *     Straight machined edges are where the precision reads; the asymmetry is
 *     what stops it being a slab.
 *   - Extremely shallow seeded relief, well under a percent of the span. A dead
 *     flat plate under a raking light is a featureless silhouette. A surface
 *     that is *almost* flat is described by the light, which is what makes it
 *     read as material rather than as a shape.
 *   - Displacement is along the surface normal, so a deviation lifts out of the
 *     surface and the light finds it immediately.
 */

import type { CausalGraph, StabilityBounds } from './GraphAsset';

export interface SurfaceSynthConfig {
  seed: number;
  /** Target interior points. Boundary points are added on top. */
  points: number;
  /** Nominal spacing between points. */
  spacing: number;
  /** Half-extent of the plate in x and z. */
  extent: [number, number];
  /** Peak relief height. Kept tiny — this is a finished surface. */
  relief: number;
  /** Spatial frequency of the relief, radians per world unit. */
  reliefFrequency: number;
  /**
   * How much faster the surface conducts along its grain than across it.
   * 0 is isotropic — and isotropic is fatal here, see below.
   */
  anisotropy: number;
  /** Range of the seeded stiffness variation, as a fraction either side of 1. */
  stiffnessVariation: number;
  /** Spatial frequency of the grain and stiffness fields. */
  grainFrequency: number;
}

export const DEFAULT_SURFACE: SurfaceSynthConfig = {
  seed: 0x5eed_c0de,
  points: 3000,
  spacing: 0.30,
  extent: [11.0, 6.4],
  // What the rake reads is slope, not height, and slope is amplitude over
  // wavelength. At 0.23 the relief ran a full period across the whole plate, so
  // its steepest slope was 0.002 radians against a light sitting at 0.075 — a
  // three percent shading swing, which is a smooth gradient and nothing else.
  // At 0.75 the wavelength is about eight units and the slope reaches 0.04, so
  // the surface is described by the light instead of merely being tinted by it.
  // The height is unchanged and still four tenths of one percent of the span:
  // this is a finished surface, not a landscape.
  relief: 0.055,
  reliefFrequency: 0.75,
  // Measured, not chosen for flavour. On an isotropic surface a point strike
  // spreads as a circle and settles into concentric rings — the single failure
  // that has killed three directions on this project, and the known risk of
  // putting a liquid reading anywhere near a hero. tools/correction-validate.mjs
  // measures angular variation of the deviation within annuli around the
  // strike: isotropic scored 0.238, which is a ring.
  //
  // The fix is in the material, where it belongs. The surface has a grain whose
  // direction wanders, and a stiffness that varies from place to place, so the
  // front shears and curves and never closes into a circle. A manufactured
  // surface having a rolling direction and an uneven temper is not a
  // contrivance; a perfectly isotropic one would be.
  anisotropy: 0.5,
  stiffnessVariation: 0.42,
  grainFrequency: 0.21,
};

export interface SynthesisedSurface {
  graph: CausalGraph;
  bounds: StabilityBounds;
  /** Triangle vertex indices, three per face. */
  triangles: Uint32Array;
  /**
   * Per-CSR-entry coefficients that turn neighbour differences in `u` into the
   * surface gradient at a node. Precomputed because they depend only on rest
   * positions, so the per-frame cost is one multiply-add per edge.
   */
  gradientX: Float32Array;
  gradientZ: Float32Array;
  stats: {
    nodes: number;
    edges: number;
    triangles: number;
    medianEdgeLength: number;
    degreeMin: number;
    degreeMax: number;
    degreeMean: number;
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

/**
 * The plate's outline: five straight edges, asymmetric, convex.
 *
 * Convex matters for construction rather than for looks — the Delaunay
 * triangulation of a point set fills its convex hull exactly, so a convex
 * boundary needs no clipping pass and cannot leave slivers along the edge.
 */
function outline(ex: number, ez: number): [number, number][] {
  return [
    [-ex, -ez * 0.62],
    [-ex * 0.44, -ez],
    [ex, -ez * 0.30],
    [ex * 0.78, ez],
    [-ex * 0.72, ez * 0.74],
  ];
}

/** Winding-independent inside test for a convex polygon. */
function insideConvex(polygon: [number, number][], x: number, z: number): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (cross === 0) continue;
    const current = cross > 0 ? 1 : -1;
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }
  return true;
}

/** Seeded smooth height field. Three incommensurate terms, no axis alignment. */
function reliefField(seed: number, frequency: number): (x: number, z: number) => number {
  const random = mulberry32(seed);
  const k: number[] = [];
  for (let i = 0; i < 12; i++) k.push(random());

  return (x, z) => {
    const a = Math.sin(x * frequency * (0.7 + k[0]) + z * frequency * (k[1] - 0.5) + k[2] * 6.283);
    const b = Math.sin(z * frequency * (1.3 + k[3]) + x * frequency * (k[4] - 0.5) * 0.8 + k[5] * 6.283);
    const c = Math.sin(x * frequency * (2.1 + k[6]) * 0.6 - z * frequency * (1.7 + k[7]) * 0.5 + k[8] * 6.283);
    return a * 0.55 + b * 0.32 + c * 0.13;
  };
}

/** Seeded direction field: the grain of the surface, in radians. */
function grainField(seed: number, frequency: number): (x: number, z: number) => number {
  const random = mulberry32(seed);
  const k: number[] = [];
  for (let i = 0; i < 8; i++) k.push(random());
  return (x, z) =>
    Math.sin(x * frequency * (0.8 + k[0]) + z * frequency * (k[1] - 0.5) + k[2] * 6.283) * 1.35 +
    Math.sin(z * frequency * (1.4 + k[3]) - x * frequency * (0.6 + k[4]) + k[5] * 6.283) * 0.7 +
    k[6] * 3.14;
}

/** Seeded scalar field: how stiff the surface is, place to place. */
function stiffnessField(seed: number, frequency: number, variation: number): (x: number, z: number) => number {
  const random = mulberry32(seed);
  const k: number[] = [];
  for (let i = 0; i < 8; i++) k.push(random());
  return (x, z) => {
    const a = Math.sin(x * frequency * (1.1 + k[0]) + z * frequency * (k[1] - 0.5) * 1.3 + k[2] * 6.283);
    const b = Math.sin(z * frequency * (0.7 + k[3]) - x * frequency * (1.6 + k[4]) * 0.5 + k[5] * 6.283);
    return 1 + (a * 0.62 + b * 0.38) * variation;
  };
}

/** Uniform spatial hash over the plane. Queried only within one cell width. */
class PlaneHash {
  private readonly cells = new Map<number, number[]>();
  private readonly inverseCell: number;

  constructor(cellSize: number) {
    this.inverseCell = 1 / cellSize;
  }

  private key(cx: number, cz: number): number {
    return ((cx + 512) & 1023) * 1024 + ((cz + 512) & 1023);
  }

  insert(index: number, x: number, z: number): void {
    const key = this.key(Math.floor(x * this.inverseCell), Math.floor(z * this.inverseCell));
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
  }

  near(x: number, z: number, out: number[]): number[] {
    out.length = 0;
    const bx = Math.floor(x * this.inverseCell);
    const bz = Math.floor(z * this.inverseCell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.cells.get(this.key(bx + dx, bz + dz));
        if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }
}

/**
 * Bowyer–Watson incremental Delaunay triangulation.
 *
 * Points are inserted in a fixed order and every comparison is on values
 * derived from them, so the result is identical on every machine — which the
 * whole determinism claim depends on, since the graph is the simulation's
 * domain and not merely its picture.
 */
function triangulate(xs: number[], zs: number[]): Uint32Array {
  const n = xs.length;

  // Super-triangle, comfortably outside everything.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (zs[i] < minZ) minZ = zs[i];
    if (zs[i] > maxZ) maxZ = zs[i];
  }
  const dx = maxX - minX;
  const dz = maxZ - minZ;
  const margin = Math.max(dx, dz) * 12;
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;

  const px = [...xs, midX - margin, midX, midX + margin];
  const pz = [...zs, midZ - margin, midZ + margin, midZ - margin];
  const superA = n;
  const superB = n + 1;
  const superC = n + 2;

  // Triangles as flat triples, with circumcircles cached alongside.
  let tri: number[] = [superA, superB, superC];
  let circle: number[] = [];

  const circumcircle = (a: number, b: number, c: number): [number, number, number] => {
    const ax = px[a];
    const az = pz[a];
    const bx = px[b];
    const bz = pz[b];
    const cx = px[c];
    const cz = pz[c];
    const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
    if (Math.abs(d) < 1e-12) return [0, 0, Infinity];
    const a2 = ax * ax + az * az;
    const b2 = bx * bx + bz * bz;
    const c2 = cx * cx + cz * cz;
    const ux = (a2 * (bz - cz) + b2 * (cz - az) + c2 * (az - bz)) / d;
    const uz = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    const r = (ux - ax) * (ux - ax) + (uz - az) * (uz - az);
    return [ux, uz, r];
  };

  {
    const [ux, uz, r] = circumcircle(superA, superB, superC);
    circle = [ux, uz, r];
  }

  const edges: number[] = [];

  for (let p = 0; p < n; p++) {
    const x = px[p];
    const z = pz[p];
    edges.length = 0;

    const keptTri: number[] = [];
    const keptCircle: number[] = [];

    for (let t = 0; t < tri.length; t += 3) {
      const c = t;
      const ddx = x - circle[c];
      const ddz = z - circle[c + 1];
      if (ddx * ddx + ddz * ddz < circle[c + 2]) {
        // Point is inside this triangle's circumcircle: it goes, and its edges
        // join the cavity boundary.
        edges.push(tri[t], tri[t + 1], tri[t + 1], tri[t + 2], tri[t + 2], tri[t]);
      } else {
        keptTri.push(tri[t], tri[t + 1], tri[t + 2]);
        keptCircle.push(circle[c], circle[c + 1], circle[c + 2]);
      }
    }

    tri = keptTri;
    circle = keptCircle;

    // Edges shared by two removed triangles are interior to the cavity and are
    // dropped; the survivors form its boundary.
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e];
      const b = edges[e + 1];
      if (a === -1) continue;
      let shared = false;
      for (let f = e + 2; f < edges.length; f += 2) {
        if ((edges[f] === b && edges[f + 1] === a) || (edges[f] === a && edges[f + 1] === b)) {
          edges[f] = -1;
          edges[f + 1] = -1;
          shared = true;
        }
      }
      if (shared) continue;
      tri.push(a, b, p);
      const [ux, uz, r] = circumcircle(a, b, p);
      circle.push(ux, uz, r);
    }
  }

  const out: number[] = [];
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t];
    const b = tri[t + 1];
    const c = tri[t + 2];
    if (a >= n || b >= n || c >= n) continue;
    // Consistent winding, so every face points up and the surface can be
    // single-sided. A mixed-winding mesh renders as a field of holes the moment
    // backface culling is switched on.
    const area = (px[b] - px[a]) * (pz[c] - pz[a]) - (pz[b] - pz[a]) * (px[c] - px[a]);
    if (area < 0) out.push(a, b, c);
    else out.push(a, c, b);
  }

  return Uint32Array.from(out);
}

export function synthesiseSurface(config: SurfaceSynthConfig = DEFAULT_SURFACE): SynthesisedSurface {
  const random = mulberry32(config.seed);
  const relief = reliefField(config.seed ^ 0x9e37_79b9, config.reliefFrequency);
  const grain = grainField(config.seed ^ 0x85eb_ca6b, config.grainFrequency);
  const stiffness = stiffnessField(config.seed ^ 0xc2b2_ae35, config.grainFrequency, config.stiffnessVariation);
  const [ex, ez] = config.extent;
  const polygon = outline(ex, ez);

  const xs: number[] = [];
  const zs: number[] = [];

  // ------------------------------------------------------------- the boundary
  // Points along each straight edge at irregular spacing. The edge stays dead
  // straight — that is where the precision reads — while the spacing does not
  // repeat, so nothing along it can be counted.
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.round(length / config.spacing));
    for (let s = 0; s < steps; s++) {
      const t = (s + (random() - 0.5) * 0.55) / steps;
      const clamped = Math.min(Math.max(t, 0), 0.999);
      xs.push(ax + (bx - ax) * clamped);
      zs.push(az + (bz - az) * clamped);
    }
  }

  // ------------------------------------------------------------- the interior
  // Dart throwing against a minimum separation: Poisson-ish, so the spacing is
  // irregular everywhere but never clumps into a pocket dense enough to slow
  // the wave locally.
  const minimum = config.spacing * 0.70;
  const hash = new PlaneHash(config.spacing * 1.1);
  for (let i = 0; i < xs.length; i++) hash.insert(i, xs[i], zs[i]);

  const scratch: number[] = [];
  const attempts = config.points * 30;
  for (let a = 0; a < attempts && xs.length < config.points; a++) {
    const x = (random() * 2 - 1) * ex;
    const z = (random() * 2 - 1) * ez;
    if (!insideConvex(polygon, x, z)) continue;

    let ok = true;
    const candidates = hash.near(x, z, scratch);
    for (let c = 0; c < candidates.length; c++) {
      const j = candidates[c];
      if (Math.hypot(xs[j] - x, zs[j] - z) < minimum) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const index = xs.length;
    xs.push(x);
    zs.push(z);
    hash.insert(index, x, z);
  }

  const nodeCount = xs.length;
  const triangles = triangulate(xs, zs);

  // ---------------------------------------------------------------- geometry
  const positions = new Float32Array(nodeCount * 3);
  const directions = new Float32Array(nodeCount * 3);

  // Height and normal come from the same analytic field, so the normal is exact
  // rather than averaged off the triangles.
  const h = 1e-3;
  for (let i = 0; i < nodeCount; i++) {
    const x = xs[i];
    const z = zs[i];
    const y = relief(x, z) * config.relief;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const dhdx = ((relief(x + h, z) - relief(x - h, z)) / (2 * h)) * config.relief;
    const dhdz = ((relief(x, z + h) - relief(x, z - h)) / (2 * h)) * config.relief;
    const length = Math.hypot(-dhdx, 1, -dhdz);
    directions[i * 3] = -dhdx / length;
    directions[i * 3 + 1] = 1 / length;
    directions[i * 3 + 2] = -dhdz / length;
  }

  // ------------------------------------------------------------------- edges
  const edgeKeys = new Set<number>();
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeLength: number[] = [];

  const addEdge = (i: number, j: number): void => {
    const low = i < j ? i : j;
    const high = i < j ? j : i;
    const key = low * nodeCount + high;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edgeA.push(low);
    edgeB.push(high);
    edgeLength.push(Math.hypot(xs[high] - xs[low], zs[high] - zs[low]));
  };

  for (let t = 0; t < triangles.length; t += 3) {
    addEdge(triangles[t], triangles[t + 1]);
    addEdge(triangles[t + 1], triangles[t + 2]);
    addEdge(triangles[t + 2], triangles[t]);
  }

  const sorted = [...edgeLength].sort((a, b) => a - b);
  const medianEdgeLength = sorted[sorted.length >> 1] ?? config.spacing;

  const edgeWeight = new Float32Array(edgeA.length);
  for (let e = 0; e < edgeA.length; e++) {
    const i = edgeA[e];
    const j = edgeB[e];
    const ratio = edgeLength[e] / medianEdgeLength;
    const base = Math.max(Math.exp(-ratio * ratio * 0.75), 0.06);

    const mx = (xs[i] + xs[j]) * 0.5;
    const mz = (zs[i] + zs[j]) * 0.5;
    // cos of twice the angle, because an edge has a direction but no sign — it
    // conducts the same either way along the grain.
    const along = Math.cos(2 * (Math.atan2(zs[j] - zs[i], xs[j] - xs[i]) - grain(mx, mz)));
    const directional = 1 + config.anisotropy * along;

    edgeWeight[e] = Math.max(base * stiffness(mx, mz) * directional, 0.03);
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
    weights[cursor[i]] = edgeWeight[e];
    cursor[i]++;
    neighbours[cursor[j]] = i;
    weights[cursor[j]] = edgeWeight[e];
    cursor[j]++;
  }

  // ------------------------------------------------------- gradient stencils
  //
  // The surface is read by its shading, so the normal has to follow the
  // deformation — a bump that does not tilt its own normal is invisible under
  // any light. The perturbed normal comes from the gradient of `u` across the
  // surface, and that gradient is a fixed linear function of the neighbour
  // differences, so its coefficients are solved once here and applied as one
  // multiply-add per edge per frame.
  //
  // Least squares: minimise Σ wⱼ ((uⱼ − uᵢ) − g·dⱼ)² over g, giving
  // g = M⁻¹ Σ wⱼ dⱼ (uⱼ − uᵢ) with M = Σ wⱼ dⱼdⱼᵀ.
  const gradientX = new Float32Array(entryCount);
  const gradientZ = new Float32Array(entryCount);

  for (let i = 0; i < nodeCount; i++) {
    let mxx = 0;
    let mxz = 0;
    let mzz = 0;
    for (let k = offsets[i]; k < offsets[i + 1]; k++) {
      const j = neighbours[k];
      const w = weights[k];
      const ddx = xs[j] - xs[i];
      const ddz = zs[j] - zs[i];
      mxx += w * ddx * ddx;
      mxz += w * ddx * ddz;
      mzz += w * ddz * ddz;
    }

    const det = mxx * mzz - mxz * mxz;
    if (Math.abs(det) < 1e-12) continue;
    const ixx = mzz / det;
    const ixz = -mxz / det;
    const izz = mxx / det;

    for (let k = offsets[i]; k < offsets[i + 1]; k++) {
      const j = neighbours[k];
      const w = weights[k];
      const ddx = xs[j] - xs[i];
      const ddz = zs[j] - zs[i];
      gradientX[k] = ixx * w * ddx + ixz * w * ddz;
      gradientZ[k] = ixz * w * ddx + izz * w * ddz;
    }
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

  return {
    graph: { nodeCount, entryCount, positions, directions, offsets, neighbours, weights },
    bounds: {
      maxWeightedDegree,
      lambdaMaxBound,
      waveDtMax: 2 / Math.sqrt(lambdaMaxBound),
    },
    triangles,
    gradientX,
    gradientZ,
    stats: {
      nodes: nodeCount,
      edges: edgeA.length,
      triangles: triangles.length / 3,
      medianEdgeLength,
      degreeMin,
      degreeMax,
      degreeMean: entryCount / nodeCount,
    },
  };
}
