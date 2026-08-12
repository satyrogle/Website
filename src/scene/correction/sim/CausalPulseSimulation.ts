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
  // Fast enough that the deviation visibly travels through the structure
  // instead of blooming in place. Roughly 14 graph hops per second against a
  // ~0.3-unit median edge, so a strike crosses the veil in about two seconds.
  // The spectral bound allows nearly 60; the margin is deliberate headroom for
  // a denser graph later.
  waveSpeed: 14,
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
  waveDamping: 0.5,
};

/**
 * Hops the press profile reaches.
 *
 * Wide enough that a press lands on a *group* of neighbouring trajectories
 * rather than on one strand. The coupling edges are part of the hop count, so
 * the profile crosses between trajectories the way the constraint field does —
 * which is what makes an escape look like several neighbours leaving together
 * instead of one line lifting on its own.
 */
const INJECTION_HOPS = 9;

export class CausalPulseSimulation {
  readonly nodeCount: number;
  readonly parameters: WaveParameters;

  /** Wave displacement along each node's own direction. */
  readonly u: Float32Array;
  /** Wave velocity. */
  readonly velocity: Float32Array;

  private readonly graph: CausalGraph;
  private readonly lapU: Float32Array;
  /** Scratch for the injection flood fill. Reused so a press allocates nothing. */
  private readonly injectHop: Int32Array;
  private readonly injectFrontier: Uint32Array;
  private tickCount = 0;
  private injections = 0;

  constructor(graph: CausalGraph, bounds: StabilityBounds, parameters: WaveParameters = DEFAULT_WAVE) {
    this.graph = graph;
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
    this.injectHop = new Int32Array(graph.nodeCount);
    this.injectFrontier = new Uint32Array(graph.nodeCount);
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
    const { offsets, neighbours } = this.graph;

    const radius = INJECTION_HOPS;
    const hop = this.injectHop;
    hop.fill(-1);
    hop[nodeId] = 0;

    // Breadth-first, so the frontier is complete before the next ring starts.
    const frontier = this.injectFrontier;
    frontier[0] = nodeId;
    let count = 1;
    let read = 0;

    while (read < count) {
      const i = frontier[read++];
      const next = hop[i] + 1;
      if (next > radius) continue;
      for (let k = offsets[i]; k < offsets[i + 1]; k++) {
        const j = neighbours[k];
        if (hop[j] !== -1) continue;
        hop[j] = next;
        frontier[count++] = j;
      }
    }

    // Fixed amplitude profile rather than fixed total energy. The visitor's
    // press has to mean one thing everywhere: spreading a fixed energy budget
    // over however many nodes happen to be nearby would make the same action
    // produce a weaker deviation in a dense pocket than at the fringe.
    for (let f = 0; f < count; f++) {
      const i = frontier[f];
      this.velocity[i] += 0.5 * (1 + Math.cos((Math.PI * hop[i]) / (radius + 1))) * energy;
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
      velocity[i] += (c2 * lapU[i] - waveDamping * velocity[i]) * dt;
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
