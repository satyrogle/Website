  // Slow enough to watch it travel.
  //
  // At 14 a strike crossed a ribbon in about two seconds, which sounds slow
  // and is not: the wave reached most of the structure inside the first few
  // frames, so every part of a ribbon started moving at once and the motion
  // read as rigid — the whole strand hinging rather than a ripple running
  // along it. A deviation that arrives everywhere simultaneously is a
  // displacement, not a wave, and the difference is the entire reason the
  // correction has something to chase.
/**
 * The wave engine. Ported from the causal-pulse spike
 * (`claude/causal-pulse-spike-v1`,
 * `src/labs/causal-pulse/simulation/CausalPulseSimulation.ts`).
 *
 * It is the authority for what the world is doing: fixed timestep, typed
 * arrays over CSR adjacency, symplectic Euler, seeded, checksummed. The GPU
 * visualises what comes out of here and never feeds back in.
 *
 * Three things the spike carried are deliberately not ported. The diffusion
 * channel and the edge-strain memory belonged to the retired entity work, and
 * the arrival/peak instrumentation existed to answer a question about that
 * object's topology. What THE CORRECTION needs from this file is exactly the
 * damped graph wave — the passive world. Everything that notices the world and
 * acts on it lives in `CorrectionOperator`.
 *
 * Kept free of Worker and DOM APIs so it steps identically in node.
 */

import type { CausalGraph, StabilityBounds } from '../graph/GraphAsset';

export interface WaveParameters {
  /** Fixed timestep in seconds. */
  dt: number;
  /** Wave speed. Stability requires waveSpeed * dt < bounds.waveDtMax. */
  waveSpeed: number;
  /** How fast a transient dies once nothing is driving it. */
  waveDamping: number;
}

export const DEFAULT_WAVE: WaveParameters = {
  dt: 1 / 120,
  /**
   * Fast enough to watch it leave.
   *
   * The number that matters is not this one, it is this one times the edge
   * length: propagation runs at waveSpeed × 0.235 units a second. At 7 that is
   * 1.65 u/s, so in the half second after a press the front moved about a unit
   * and a half — the strike read as a bump appearing and shaking in place
   * until it faded, which is exactly "it just hits you, it doesn't wave". At
   * 30 the front covers ten units in the first second and crosses a whole
   * strand: a deviation running away from the hand that caused it.
   *
   * Measured, not guessed. Disarming the correction entirely changed the
   * front's reach by less than half a unit, so the operator was never what was
   * eating it — the wave was simply too slow to look like one.
   */
  waveSpeed: 30,
  // The deviation has to survive long enough to be noticed, resisted and
  // forced back — if damping kills it first the system never has to act, and
  // there is nothing to watch. But it also has to stop.
  //
  // On the swept lattice the wave travels far better than it did on the old
  // scatter, which was the point, and at 0.55 the consequence was that a
  // single strike left the entire surface ringing below the sensor's
  // threshold: permanently cyan, permanently deviating, never corrected. The
  // approved state stopped being a state the world returns to. Raised until
  // the residual dies away and the surface comes back to the record, while the
  // strike itself still outlives the awareness latency by a wide margin.
  waveDamping: 0.55,
};

/** Hops the press profile reaches. Roughly a 1.5-unit contact patch. */
export const INJECTION = {
  /**
   * Radius of the press, in world units.
   *
   * Spatial, not hops. Measured across graph hops the profile jumped between
   * ribbons wherever a coupling edge happened to sit, so the initial bump was
   * ragged before it had travelled anywhere — the wave was lumpy from the
   * moment it was made. A smooth falloff over distance gives a clean pulse
   * whatever the topology under it.
   */
  radius: 2.6,
};

/** How hard the ends of a ribbon swallow a wave that reaches them. */
const ABSORB_STRENGTH = 6;

export class CausalPulseSimulation {
  readonly nodeCount: number;
  readonly parameters: WaveParameters;

  /** Wave displacement along each node's own direction. */
  readonly u: Float32Array;
  /** Wave velocity. */
  readonly velocity: Float32Array;

  /**
   * Extra damping per node, from the synthesiser: nothing through the body of
   * a ribbon, total at its ends. Without it a wave reaching a free end
   * reflects and travels back through itself, and a strand carrying a pulse in
   * both directions reads as a tape being shaken rather than as a wave. With
   * it the front leaves and keeps leaving.
   */
  private readonly absorption: Float32Array;

  private readonly graph: CausalGraph;
  private readonly lapU: Float32Array;
  private tickCount = 0;
  private injections = 0;

  constructor(
    graph: CausalGraph,
    bounds: StabilityBounds,
    parameters: WaveParameters = DEFAULT_WAVE,
    absorption?: Float32Array
  ) {
    this.graph = graph;
    this.absorption = absorption ?? new Float32Array(graph.nodeCount);
    this.parameters = parameters;
    this.nodeCount = graph.nodeCount;

    // The bound comes from the synthesised graph, so the timestep is checked
    // against the structure rather than tuned until it stops exploding.
    const waveCfl = parameters.waveSpeed * parameters.dt;
    if (waveCfl >= bounds.waveDtMax) {
      throw new Error(
        `unstable wave: waveSpeed*dt = ${waveCfl.toFixed(5)} must be < ${bounds.waveDtMax.toFixed(5)}`
      );
    }

    this.u = new Float32Array(graph.nodeCount);
    this.velocity = new Float32Array(graph.nodeCount);
    this.lapU = new Float32Array(graph.nodeCount);
  }

  get tick(): number {
    return this.tickCount;
  }

  get injectionCount(): number {
    return this.injections;
  }

  /**
   * Strike the structure at one node.
   *
   * The impulse is spread over a several-hop neighbourhood with a raised-cosine
   * falloff rather than dumped on a single vertex. That is not softening for
   * its own sake: a one-node impulse is almost entirely high spatial frequency,
   * and high frequencies on a graph wave disperse and damp within a couple of
   * hops. It dies where it lands. A broad, smooth impulse carries low-frequency
   * energy, which is what actually travels — so the press reads as a deviation
   * moving through the structure instead of a dot flickering under the cursor.
   */
  inject(nodeId: number, energy = 1): void {
    if (nodeId < 0 || nodeId >= this.nodeCount) throw new RangeError(`node ${nodeId} out of range`);

    const { positions } = this.graph;
    const radius = INJECTION.radius;
    const at = nodeId * 3;

    // A raised cosine over distance. Smooth to its own edge, so the pulse has
    // no corner in it anywhere — a bump with a discontinuous slope carries
    // high spatial frequencies, and those disperse into the lumpy, ragged
    // motion this is meant to avoid.
    for (let i = 0; i < this.nodeCount; i++) {
      const dx = positions[i * 3] - positions[at];
      const dy = positions[i * 3 + 1] - positions[at + 1];
      const dz = positions[i * 3 + 2] - positions[at + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d >= radius) continue;
      this.velocity[i] += 0.5 * (1 + Math.cos((Math.PI * d) / radius)) * energy;
    }

    this.injections++;
  }

  /** Advance exactly one fixed timestep. */
  step(): void {
    const { offsets, neighbours, weights } = this.graph;
    const { dt, waveSpeed, waveDamping } = this.parameters;
    const { u, velocity, lapU } = this;
    const n = this.nodeCount;

    // The Laplacian is taken from the previous state for every node, so the
    // update is simultaneous rather than order-dependent.
    for (let i = 0; i < n; i++) {
      const ui = u[i];
      let acc = 0;
      for (let k = offsets[i]; k < offsets[i + 1]; k++) {
        acc += weights[k] * (u[neighbours[k]] - ui);
      }
      lapU[i] = acc;
    }

    const c2 = waveSpeed * waveSpeed;

    for (let i = 0; i < n; i++) {
      // Symplectic Euler: velocity first, then position from the new velocity.
      const damping = waveDamping + this.absorption[i] * ABSORB_STRENGTH;
      velocity[i] += (c2 * lapU[i] - damping * velocity[i]) * dt;
      u[i] += velocity[i] * dt;
    }

    this.tickCount++;
  }

  /** Largest |u| anywhere, for pacing checks. */
  peak(): number {
    let peak = 0;
    for (let i = 0; i < this.nodeCount; i++) {
      const abs = Math.abs(this.u[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }
}

/**
 * FNV-1a over quantised state. Quantisation is the point: float noise in the
 * last bits would make an otherwise identical run report as divergent, so the
 * checksum answers "did this reproduce" rather than "are these bit-identical".
 */
export class Checksum {
  private hash = 0x811c9dc5;

  mix(value: number): void {
    this.hash ^= value & 0xff;
    this.hash = Math.imul(this.hash, 0x01000193);
    this.hash ^= (value >>> 8) & 0xff;
    this.hash = Math.imul(this.hash, 0x01000193);
  }

  /** Quantises a signed value in [-range, range] to 16 bits before mixing. */
  mixSigned(value: number, range: number): void {
    const t = (value + range) / (2 * range);
    this.mix(Math.round(Math.min(Math.max(t, 0), 1) * 65535));
  }

  /** Quantises a non-negative value in [0, range] to 16 bits before mixing. */
  mixUnsigned(value: number, range: number): void {
    const t = value / range;
    this.mix(Math.round(Math.min(Math.max(t, 0), 1) * 65535));
  }

  get value(): number {
    return this.hash >>> 0;
  }
}
