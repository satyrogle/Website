/**
 * The containment structure, synthesised from a seed.
 *
 * Emits a `CausalGraph` in the same CSR contract the correction engine already
 * steps, so `DeviationField` and `CorrectionOperator` drive this structure
 * without knowing it is not the previous one.
 *
 * The visible element is a TRAJECTORY, not an object. Nodes are samples along
 * curves of a field built from three global rotation modes, each curve held on
 * its own deformed shell.
 *
 * Order is the first requirement and the hardest one. A rotation field is the
 * most ordered thing a vector field can be — every curve obeys one visible
 * rule — which is why the form reads as intended rather than as scattered.
 * Three modes about unshared axes, weighted by slow non-commensurate
 * envelopes, keep that order local while denying it any global symmetry.
 *
 * Three laws bind this file:
 *
 * - **No repeating unit.** The envelopes share no common measure and the
 *   families are spaced 1 : φ : φ², φ being the worst-approximable
 *   irrational. Nothing here comes into step with anything else.
 * - **No rotational symmetry.** No cylindrical parameterisation anywhere. One
 *   rotation mode alone would be a sphere of latitude lines — a flower, and
 *   forbidden. Shells are deformed on three axes so no view of one is a
 *   circle.
 * - **Topology is not the picture.** Cross-links exist so a disturbance can
 *   branch between families. They are deliberately not drawn: see the note in
 *   `ContainmentField`.
 */

import type { CausalGraph } from '../correction/graph/GraphAsset';
import { mulberry32 } from '../correction/graph/random';
import { SHEETS, SEAT, frameAt, surfacePoint, surfaceNormal, inAperture } from './Sheets';

export interface ContainmentConfig {
  seed: number;
  /** Trajectories running the length of each authored sheet. */
  linesPerSheet: number;
  /** Samples along each streamline. */
  samplesPerLine: number;
  /** Integration step, world units. */
  stride: number;
  /** Outer radius of the whole structure. */
  radius: number;
  /** Same-shell cross-links are made below this separation. */
  linkRadius: number;
  /**
   * Reach for a link to another shell. Much longer, because these are the
   * routes out of a saturating neighbourhood and the shells only come this
   * close where they interpenetrate.
   */
  shellLinkRadius: number;
  /** Cap on total cross-links per node, so density cannot run away. */
  maxLinksPerNode: number;
  /** Of that budget, how many a node may spend reaching another shell. */
  maxShellLinksPerNode: number;
}

export const DEFAULT_CONTAINMENT: ContainmentConfig = {
  seed: 0x5eed_1a77,
  // 560 across the one body. It was 110 per sheet across five, and collapsing
  // to a single surface took the node count from fifty thousand to ten
  // without anyone asking for it — density is one of the things Jacob froze.
  linesPerSheet: 560,
  samplesPerLine: 90,
  stride: 0.105,
  radius: 5.0,
  // Cross-links are topology only — they are never drawn — so their density
  // is free to serve propagation rather than composition. At 0.30 and three
  // per node the graph was mostly plain degree-two trajectory: a cascade found
  // a junction at barely a quarter of its arrivals and could not sustain
  // doubling.
  linkRadius: 0.46,
  shellLinkRadius: 1.20,
  maxLinksPerNode: 5,
  maxShellLinksPerNode: 2,
};

export interface ContainmentStructure {
  graph: CausalGraph;
  /** Node index pairs, for one LineSegments draw. */
  edgeIndex: Uint32Array;
  /** 0 along-trajectory, 1 cross-link — the renderer weights them differently. */
  edgeKind: Uint8Array;
  /** Which family each node belongs to. */
  family: Uint16Array;
  /** 0 at the outer shell, 1 at the innermost — drives the descent. */
  depth: Float32Array;
  /** Position along its own streamline, 0..1. */
  param: Float32Array;
  /** Surface normal at each node, for foreshortening compensation. */
  normals: Float32Array;
  /** Nodes a disturbance may be seeded at: outer shell, well separated. */
  seeds: Uint32Array;
  stats: Record<string, number>;
}

type Vec = [number, number, number];

/** Uniform hash grid, so proximity linking is linear rather than quadratic. */
class Grid {
  private readonly cells = new Map<number, number[]>();
  constructor(private readonly size: number) {}

  private key(x: number, y: number, z: number): number {
    // Offset keeps indices positive; 1024 is far above any axis extent here.
    const i = Math.floor(x / this.size) + 512;
    const j = Math.floor(y / this.size) + 512;
    const l = Math.floor(z / this.size) + 512;
    return (i * 1024 + j) * 1024 + l;
  }

  add(p: Vec, index: number): void {
    const k = this.key(p[0], p[1], p[2]);
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(index);
    else this.cells.set(k, [index]);
  }

  near(p: Vec, out: number[]): number[] {
    out.length = 0;
    const bi = Math.floor(p[0] / this.size) + 512;
    const bj = Math.floor(p[1] / this.size) + 512;
    const bl = Math.floor(p[2] / this.size) + 512;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (let l = -1; l <= 1; l++) {
          const bucket = this.cells.get(((bi + i) * 1024 + (bj + j)) * 1024 + (bl + l));
          if (bucket) out.push(...bucket);
        }
      }
    }
    return out;
  }
}

export function synthesiseContainment(
  config: ContainmentConfig = DEFAULT_CONTAINMENT
): ContainmentStructure {
  const random = mulberry32(config.seed);

  const positions: number[] = [];
  const tangents: Vec[] = [];
  const family: number[] = [];
  /** Which trajectory a node belongs to. Distinct from family, which is shell. */
  const line: number[] = [];
  const depth: number[] = [];
  const param: number[] = [];
  const normals: number[] = [];
  /** Along-trajectory adjacency, built first; cross-links are added after. */
  const along: Array<[number, number]> = [];

  // Trajectories live ON the sheets.
  //
  // They used to be integral curves of a rotation field on nested spheres,
  // which is why raising the density turned strands into fibrous toruses: the
  // macro-read was the topology, and the topology wrapped a centre. Here the
  // silhouette is authored in `Sheets` and the fibres only run through it, so
  // what the eye resolves at distance is the surface and what it finds on
  // approach is the veining. Entity, then material, then simulation.
  //
  // Every line runs from one end of its sheet to the other. Open by
  // construction: there is no closed curve anywhere in the structure now.
  const VOID_RADIUS = 1.55;
  let lineId = 0;

  for (let sheetIndex = 0; sheetIndex < SHEETS.length; sheetIndex++) {
    const sheet = SHEETS[sheetIndex];

    for (let l = 0; l < config.linesPerSheet; l++) {
      // Where this line sits across the width, and how it wanders as it
      // travels. Wander is what stops a sheet reading as combed: neighbours
      // cross and separate instead of running parallel for their whole length.
      const seatV = (l / (config.linesPerSheet - 1)) * 2 - 1;
      const wanderAmp = 0.10 + 0.22 * random();
      const wanderRate = 1.4 + 3.1 * random();
      const wanderPhase = random() * Math.PI * 2;
      // Clear of the shell, on one face or the other.
      //
      // Lifted by (random - 0.5) * 0.09 against a shell that spans +/-0.0425
      // about the surface, NINETY-FOUR PER CENT of the veins were inside the
      // body and invisible. Which of the survivors showed depended on the
      // angle the surface presented, so the distribution looked arbitrary:
      // bunched where the body was edge-on, absent where it faced the camera.
      // That absence is also why the lower left read as a flat cutout — there
      // was no internal structure under it to see.
      //
      // Both faces are used, so the body is veined front and back rather than
      // having everything on one side.
      const clearance = sheet.thickness * 0.5 + 0.012;
      const face = random() < 0.5 ? -1 : 1;
      const lift = face * (clearance + random() * 0.05);

      const first = positions.length / 3;
      const thisLine = lineId++;
      let previous = -1;

      for (let s2 = 0; s2 < config.samplesPerLine; s2++) {
        const u = s2 / (config.samplesPerLine - 1);
        const v = Math.max(
          -0.98,
          Math.min(0.98, seatV + wanderAmp * Math.sin(wanderRate * u * Math.PI * 2 + wanderPhase))
        );

        const frame = frameAt(sheet, u);
        const surf = surfacePoint(sheet, u, v, frame);
        const n = surfaceNormal(sheet, u, v);
        const p: Vec = [surf[0] + n[0] * lift, surf[1] + n[1] * lift, surf[2] + n[2] * lift];

        // A vein passes AROUND a hole, it does not end at one.
        //
        // `break` on the forbidden volume threw away the entire remainder of
        // every trajectory that dipped into it, and the widest lobe reaches
        // inside — so whole tails vanished and the veining came out heavily
        // uneven, twenty-one thousand nodes in one column of the frame against
        // nine hundred in another. And the aperture used `continue` without
        // clearing the previous sample, which drew an edge straight across the
        // hole that had just been cut.
        //
        // Both now break the CHAIN and carry on: the line resumes on the far
        // side, so the body is veined evenly and nothing spans the negative
        // space.
        const dVoid = Math.hypot(p[0] - SEAT[0], p[1] - SEAT[1], p[2] - SEAT[2]);
        if (dVoid < VOID_RADIUS || inAperture(sheet, u, v)) {
          previous = -1;
          continue;
        }

        const index = positions.length / 3;
        positions.push(p[0], p[1], p[2]);
        tangents.push([frame.tangent[0], frame.tangent[1], frame.tangent[2]]);
        family.push(sheetIndex);
        line.push(thisLine);
        depth.push(1 - Math.min(1, Math.hypot(p[0], p[1], p[2]) / config.radius));
        param.push(u);
        normals.push(n[0], n[1], n[2]);

        if (previous >= 0) along.push([previous, index]);
        previous = index;
      }

      // A stub is not a trajectory.
      if (positions.length / 3 - first < 24) {
        const drop = positions.length / 3 - first;
        positions.length -= drop * 3;
        tangents.length -= drop;
        family.length -= drop;
        line.length -= drop;
        depth.length -= drop;
        param.length -= drop;
        normals.length -= drop * 3;
        while (along.length && along[along.length - 1][1] >= first) along.pop();
        lineId--;
      }
    }
  }

  const nodeCount = positions.length / 3;
  if (nodeCount < 256) {
    throw new Error(`containment: only ${nodeCount} nodes — the flow is not filling the shell`);
  }

  // --- cross-links -------------------------------------------------------
  //
  // Never drawn. These exist so a disturbance has somewhere to go, and they
  // are built in two passes because the two kinds do different work.
  //
  // **Cross-shell links are the valuable ones.** A branch that jumps to the
  // trajectory beside it lands in the corridor its sibling is already burning
  // — measured, nine merges against twelve branches, a cascade that saturated
  // its own neighbourhood and stalled at one percent of the graph. A branch
  // that jumps to another shell lands in ground nothing has touched. So they
  // are made first, with a longer reach, and they get first claim on every
  // node's budget; the shells only come within that reach where they
  // genuinely interpenetrate, so these links mark the places the layers touch
  // rather than being sprinkled everywhere.
  //
  // Same-shell links fill whatever budget is left. They still matter — they
  // are what lets a cascade spread along a layer — they just no longer crowd
  // out the escape routes.
  const pos = (i: number): Vec => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];

  const linkCount = new Uint8Array(nodeCount);
  const cross: Array<[number, number]> = [];
  const seen = new Set<number>();
  const scratch: number[] = [];
  let crossShell = 0;

  const consider = (
    grid: Grid,
    radius: number,
    cap: number,
    wantDifferentShell: boolean
  ): void => {
    const r2 = radius * radius;
    for (let i = 0; i < nodeCount; i++) {
      if (linkCount[i] >= cap) continue;
      const pi = pos(i);
      for (const j of grid.near(pi, scratch)) {
        if (j <= i) continue;
        if (linkCount[i] >= cap || linkCount[j] >= cap) continue;
        // A cross-link has to lead somewhere else. `family` is the shell, not
        // the curve: comparing it here once let a node link to its own
        // trajectory five samples along, which is a shortcut to nowhere.
        if (line[i] === line[j]) continue;
        const differentShell = family[i] !== family[j];
        if (wantDifferentShell !== differentShell) continue;

        const pj = pos(j);
        const dx = pi[0] - pj[0];
        const dy = pi[1] - pj[1];
        const dz = pi[2] - pj[2];
        if (dx * dx + dy * dy + dz * dz > r2) continue;

        const key = i * nodeCount + j;
        if (seen.has(key)) continue;
        seen.add(key);
        cross.push([i, j]);
        linkCount[i]++;
        linkCount[j]++;
        if (differentShell) crossShell++;
      }
    }
  };

  const shellGrid = new Grid(config.shellLinkRadius);
  for (let i = 0; i < nodeCount; i++) shellGrid.add(pos(i), i);
  consider(shellGrid, config.shellLinkRadius, config.maxShellLinksPerNode, true);

  const grid = new Grid(config.linkRadius * 2);
  for (let i = 0; i < nodeCount; i++) grid.add(pos(i), i);
  consider(grid, config.linkRadius, config.maxLinksPerNode, false);

  // --- CSR ---------------------------------------------------------------
  const degree = new Uint32Array(nodeCount);
  for (const [a, b] of along) {
    degree[a]++;
    degree[b]++;
  }
  for (const [a, b] of cross) {
    degree[a]++;
    degree[b]++;
  }

  const offsets = new Uint32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) offsets[i + 1] = offsets[i] + degree[i];
  const entryCount = offsets[nodeCount];

  const neighbours = new Uint32Array(entryCount);
  const weights = new Float32Array(entryCount);
  const cursor = offsets.slice(0, nodeCount);

  /**
   * Along-trajectory coupling is strong and cross-links are weak, so a
   * disturbance runs along a path and only sometimes jumps. That asymmetry is
   * what makes propagation read as travel rather than as a stain spreading.
   */
  const put = (a: number, b: number, w: number): void => {
    neighbours[cursor[a]] = b;
    weights[cursor[a]] = w;
    cursor[a]++;
    neighbours[cursor[b]] = a;
    weights[cursor[b]] = w;
    cursor[b]++;
  };
  for (const [a, b] of along) put(a, b, 1.0);
  for (const [a, b] of cross) put(a, b, 0.34);

  // --- render + seed data ------------------------------------------------
  const edgeCount = along.length + cross.length;
  const edgeIndex = new Uint32Array(edgeCount * 2);
  const edgeKind = new Uint8Array(edgeCount);
  let e = 0;
  for (const [a, b] of along) {
    edgeIndex[e * 2] = a;
    edgeIndex[e * 2 + 1] = b;
    edgeKind[e] = 0;
    e++;
  }
  for (const [a, b] of cross) {
    edgeIndex[e * 2] = a;
    edgeIndex[e * 2 + 1] = b;
    edgeKind[e] = 1;
    e++;
  }

  // Seeds sit on the outer shell and are spaced apart, so successive events
  // are visibly different journeys rather than the same one twice.
  //
  // A seed has to be somewhere a cascade can actually branch. Taken purely by
  // depth, every seed landed on the first sample of a trajectory — out where
  // the curves begin, in a region with no cross-links at all — so a
  // disturbance ran a plain degree-two path for its whole life and the
  // fission never happened. Requiring real junctions is the fix; the
  // separation test then spreads them so successive events are different
  // journeys rather than the same one twice.
  const seeds: number[] = [];
  const minSep = config.radius * 0.55;
  const degreeOf = (i: number): number => offsets[i + 1] - offsets[i];
  for (let i = 0; i < nodeCount && seeds.length < 24; i++) {
    if (depth[i] > 0.34) continue;
    if (degreeOf(i) < 3) continue;
    const pi = pos(i);
    let ok = true;
    for (const s of seeds) {
      const ps = pos(s);
      if (Math.hypot(pi[0] - ps[0], pi[1] - ps[1], pi[2] - ps[2]) < minSep) {
        ok = false;
        break;
      }
    }
    if (ok) seeds.push(i);
  }

  const directions = new Float32Array(nodeCount * 3);
  for (let i = 0; i < nodeCount; i++) {
    // The axis a deviation swings about: perpendicular to the trajectory, and
    // to the outward direction, so a deviating node leaves its path sideways
    // rather than running further along it.
    const t = tangents[i];
    const p = pos(i);
    const m = Math.hypot(p[0], p[1], p[2]) || 1;
    const o: Vec = [p[0] / m, p[1] / m, p[2] / m];
    let d: Vec = [
      t[1] * o[2] - t[2] * o[1],
      t[2] * o[0] - t[0] * o[2],
      t[0] * o[1] - t[1] * o[0],
    ];
    const dm = Math.hypot(d[0], d[1], d[2]);
    d = dm > 1e-5 ? [d[0] / dm, d[1] / dm, d[2] / dm] : [t[0], t[1], t[2]];
    directions[i * 3] = d[0];
    directions[i * 3 + 1] = d[1];
    directions[i * 3 + 2] = d[2];
  }

  const graph: CausalGraph = {
    nodeCount,
    entryCount,
    positions: new Float32Array(positions),
    directions,
    offsets,
    neighbours,
    weights,
  };

  return {
    graph,
    edgeIndex,
    edgeKind,
    family: new Uint16Array(family),
    depth: new Float32Array(depth),
    param: new Float32Array(param),
    normals: new Float32Array(normals),
    seeds: new Uint32Array(seeds),
    stats: {
      nodeCount,
      alongEdges: along.length,
      crossEdges: cross.length,
      seeds: seeds.length,
      lines: lineId,
      crossShellEdges: crossShell,
      meanDegree: entryCount / nodeCount,
    },
  };
}
