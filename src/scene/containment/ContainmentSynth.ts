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

export interface ContainmentConfig {
  seed: number;
  /** Streamlines per family. */
  linesPerFamily: number;
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
  // Few and long, not many and short. A trajectory has to run far enough for
  // the eye to follow it and find the rule it obeys; a short one is a mark.
  linesPerFamily: 44,
  samplesPerLine: 110,
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

/**
 * Family frequencies, in ratios that share no common measure.
 *
 * 1 : φ : φ² — the golden ratio is the worst-approximable irrational, so the
 * three families come closest to never aligning. Alignment is what would let
 * the eye find a beat frequency, and a beat frequency is a repeating unit
 * wearing a disguise.
 */
const PHI = (1 + Math.sqrt(5)) / 2;
const FAMILY_RATIO = [1.0, PHI, PHI * PHI];
/** Each family occupies its own shell, so scale repeats without self-similarity. */
const FAMILY_SHELL = [1.0, 0.62, 0.38];

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
  /** Nodes a disturbance may be seeded at: outer shell, well separated. */
  seeds: Uint32Array;
  stats: Record<string, number>;
}

type Vec = [number, number, number];

/**
 * Three global rotation modes about unshared axes.
 *
 * A rotation field is the most *ordered* thing a vector field can be: every
 * curve in it obeys one visible rule, which is the first requirement of the
 * opening form. One of them alone is a sphere of latitude lines — a flower,
 * and forbidden. Three about axes that share no plane, weighted by slow
 * non-commensurate envelopes, stay locally coherent while never agreeing
 * globally, so the eye finds system everywhere and symmetry nowhere.
 *
 * Pre-normalised; a module-level const cannot call a helper.
 */
const MODE_AXES: Vec[] = [
  [0.5773, 0.5773, 0.5773],
  [-0.6247, 0.4162, 0.6614],
  [0.2673, -0.8018, 0.5345],
];
const MODE_ENV: Vec[] = [
  [0.21, 0.13, -0.17],
  [-0.11, 0.24, 0.19],
  [0.16, -0.19, 0.12],
];
const MODE_PHASE = [0.0, 2.1, 4.3];

/**
 * Below this tangential speed a trajectory is approaching a stagnation point
 * and stops. Tuned by looking: too low and the eyes come back, too high and
 * the shells break into short marks instead of long curves.
 */
const STALL = 0.55;

/**
 * How far the envelope swings across the unit sphere. Large enough that the
 * three modes visibly trade dominance from one side of the structure to the
 * other; that trade is what stops any region settling into a single rotation.
 */
const ENV_SWING = 3.4;

/**
 * Half-thickness of a family's band, as a fraction of its shell radius. A
 * family is a layer, not a surface.
 */
const BAND = 0.085;

/**
 * The flow, tangential to the shell the trajectory lives on.
 *
 * The radial component is projected out every step, so curves wind *around*
 * the structure instead of wandering out of it. That is what produces layers:
 * each family stays on its own surface, the surfaces nest, and the projection
 * of one across another is the interference the direction asks for.
 */
function flow(p: Vec, twist: number, out: Vec): number {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;

  const rm = Math.hypot(p[0], p[1], p[2]) || 1;
  const r: Vec = [p[0] / rm, p[1] / rm, p[2] / rm];

  for (let m = 0; m < 3; m++) {
    const a = MODE_AXES[m];
    const e = MODE_ENV[m];
    // The envelope reads DIRECTION, not position.
    //
    // Against raw position it varied by a radian and a half across the outer
    // shell and barely half of one across the innermost, so the inner shells
    // saw what was effectively a single rotation mode — and a single rotation
    // mode is a sphere of latitude lines. That is why the middle of the frame
    // came back as concentric rings. Against the unit direction every shell
    // sees the full swing of the envelope, so no shell is more symmetric than
    // any other.
    const w =
      0.55 + 0.45 * Math.sin(ENV_SWING * (e[0] * r[0] + e[1] * r[1] + e[2] * r[2]) + MODE_PHASE[m]);
    out[0] += w * (a[1] * p[2] - a[2] * p[1]);
    out[1] += w * (a[2] * p[0] - a[0] * p[2]);
    out[2] += w * (a[0] * p[1] - a[1] * p[0]);
  }

  // Tangential only.
  const radial = out[0] * r[0] + out[1] * r[1] + out[2] * r[2];
  out[0] -= radial * r[0];
  out[1] -= radial * r[1];
  out[2] -= radial * r[2];

  // Precession, across the shell rather than out of it.
  //
  // A pure tangential flow closes, and a closed curve is a loop the eye names
  // instantly — a coil, a spool, a ball of wire. The previous cure added a
  // RADIAL lean, which did nothing at all: the integrator re-seats every step
  // onto the shell, so the radial part was removed again immediately. The
  // drift has to be sideways *within* the surface. `r × flow` is tangential
  // and perpendicular to the travel, so each pass lands beside the last one
  // and the trajectory sweeps the whole shell without ever repeating.
  const sx = r[1] * out[2] - r[2] * out[1];
  const sy = r[2] * out[0] - r[0] * out[2];
  const sz = r[0] * out[1] - r[1] * out[0];
  const lean = twist * (1.35 + Math.sin(1.7 * (r[0] - 0.6 * r[1] + 0.8 * r[2])));
  out[0] += lean * sx;
  out[1] += lean * sy;
  out[2] += lean * sz;

  // The magnitude before normalising, returned so the caller can stop.
  //
  // A continuous tangent field on a closed shell must vanish somewhere — the
  // hairy ball theorem, and not negotiable by tuning. At those points curves
  // spiral in and the frame grows eyes: whirlpools, locally rotationally
  // symmetric, exactly the flower this form may not contain. They cannot be
  // removed, so trajectories are ended before they reach one. The stagnation
  // point then reads as a void the structure curves around, which is
  // negative space doing work rather than a defect.
  const m2 = Math.hypot(out[0], out[1], out[2]);
  const safe = m2 || 1;
  out[0] /= safe;
  out[1] /= safe;
  out[2] /= safe;
  return m2;
}

/**
 * The shell a family lives on: a sphere pushed out of shape on three
 * unshared axes, so no view of it is a circle and no pose down an axis
 * produces a ring.
 */
function shellRadius(dir: Vec, base: number): number {
  const a = 0.30 * (dir[0] * dir[1] + dir[1] * dir[2]);
  const b = 0.24 * (dir[2] * dir[2] - dir[0] * dir[0]);
  const c = 0.19 * dir[0] * dir[1] * dir[2];
  return base * (1 + a + b + c);
}

/**
 * RK4, then snapped back onto the shell.
 *
 * The projection in `flow` removes the radial *velocity*, but integration
 * error still accumulates radially over forty steps and the curve slowly
 * spirals off its surface. Re-seating it each step is what keeps the layers
 * legible as layers.
 */
function advance(p: Vec, twist: number, h: number, shell: number): Vec {
  const t: Vec = [0, 0, 0];
  const a: Vec = [0, 0, 0];
  const b: Vec = [0, 0, 0];
  const c: Vec = [0, 0, 0];
  const d: Vec = [0, 0, 0];

  flow(p, twist, a);
  t[0] = p[0] + (h / 2) * a[0];
  t[1] = p[1] + (h / 2) * a[1];
  t[2] = p[2] + (h / 2) * a[2];
  flow(t, twist, b);
  t[0] = p[0] + (h / 2) * b[0];
  t[1] = p[1] + (h / 2) * b[1];
  t[2] = p[2] + (h / 2) * b[2];
  flow(t, twist, c);
  t[0] = p[0] + h * c[0];
  t[1] = p[1] + h * c[1];
  t[2] = p[2] + h * c[2];
  flow(t, twist, d);

  const q: Vec = [
    p[0] + (h / 6) * (a[0] + 2 * b[0] + 2 * c[0] + d[0]),
    p[1] + (h / 6) * (a[1] + 2 * b[1] + 2 * c[1] + d[1]),
    p[2] + (h / 6) * (a[2] + 2 * b[2] + 2 * c[2] + d[2]),
  ];

  const m = Math.hypot(q[0], q[1], q[2]) || 1;
  const dir: Vec = [q[0] / m, q[1] / m, q[2] / m];
  const target = shellRadius(dir, shell);
  return [dir[0] * target, dir[1] * target, dir[2] * target];
}

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
  /** Along-trajectory adjacency, built first; cross-links are added after. */
  const along: Array<[number, number]> = [];

  /**
   * The forbidden volume. Off-centre and unaligned with every axis, so the
   * structure has an interior it curves around rather than a hole through it.
   * The planet occupies this later; in Act I it is simply absent, and its
   * absence is what gives the form somewhere to be about.
   */
  const VOID_CENTRE: Vec = [0.42, -0.31, 0.55];
  const VOID_RADIUS = 1.55;
  let lineId = 0;

  for (let f = 0; f < FAMILY_RATIO.length; f++) {
    // The precession that keeps a curve from closing, scaled per family so
    // the shells never drift at the same rate and never come into step.
    const twist = 0.26 * FAMILY_RATIO[f];
    const shell = FAMILY_SHELL[f] * config.radius;
    let placed = 0;

    for (let attempt = 0; attempt < config.linesPerFamily * 40 && placed < config.linesPerFamily; attempt++) {
      // Low-discrepancy on the sphere, then seated on the deformed shell.
      // Never a ring: the elevation term is sampled, not swept.
      const u = random();
      const v = random();
      const theta = 2 * Math.PI * u;
      const z = 2 * v - 1;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const dir: Vec = [r * Math.cos(theta), r * Math.sin(theta), z];

      // Each trajectory gets its OWN radius inside the family's band.
      //
      // Sharing one surface, every curve in a family sweeps it under the same
      // precession and converges on the same arc family — evenly spaced
      // parallel lines, which is a comb, and a comb is the fault that killed
      // the last abstract carrier. Spread across a band they interleave at
      // different depths instead, and their crossings in projection are the
      // layered interference the direction actually asks for.
      const lineShell = shell * (1 + BAND * (random() * 2 - 1));
      const seat = shellRadius(dir, lineShell);
      let p: Vec = [dir[0] * seat, dir[1] * seat, dir[2] * seat];

      // Reject seeds inside the void or already outside the structure.
      const d0 = Math.hypot(p[0] - VOID_CENTRE[0], p[1] - VOID_CENTRE[1], p[2] - VOID_CENTRE[2]);
      if (d0 < VOID_RADIUS * 1.15) continue;
      placed++;

      const first = positions.length / 3;
      const thisLine = lineId++;
      let previous = -1;

      for (let s = 0; s < config.samplesPerLine; s++) {
        const rad = Math.hypot(p[0], p[1], p[2]);
        const dVoid = Math.hypot(
          p[0] - VOID_CENTRE[0],
          p[1] - VOID_CENTRE[1],
          p[2] - VOID_CENTRE[2]
        );
        // A curve that reaches the void simply ends. Trajectories of different
        // lengths are what stop a family reading as combed hair.
        if (rad > config.radius * 1.35 || dVoid < VOID_RADIUS) break;

        const t: Vec = [0, 0, 0];
        const speed = flow(p, twist, t);
        // Ending here is what keeps the eyes out of the frame.
        if (speed < STALL) break;

        const index = positions.length / 3;
        positions.push(p[0], p[1], p[2]);
        tangents.push([t[0], t[1], t[2]]);
        family.push(f);
        line.push(thisLine);
        depth.push(1 - Math.min(1, rad / config.radius));
        param.push(s / (config.samplesPerLine - 1));

        if (previous >= 0) along.push([previous, index]);
        previous = index;

        p = advance(p, twist, config.stride, lineShell);
      }

      // A stub is not a trajectory — and a short one ends in the frame as a
      // loose tip, which is what makes a field of curves read as hair.
      if (positions.length / 3 - first < 24) {
        const drop = positions.length / 3 - first;
        positions.length -= drop * 3;
        tangents.length -= drop;
        family.length -= drop;
        line.length -= drop;
        depth.length -= drop;
        param.length -= drop;
        while (along.length && along[along.length - 1][1] >= first) along.pop();
        placed--;
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
