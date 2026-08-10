/**
 * The authoritative simulation. Runs on a fixed timestep, owns all state, and
 * is the only thing that decides what the entity is doing. The GPU visualises
 * what comes out of here; it never feeds back in.
 *
 * Three coupled systems over the same graph:
 *
 *   damped wave      immediate impact and structural echo
 *   diffusion        slower travelling activity
 *   retained memory  monotonic, never decreases
 *
 * Kept free of Worker and DOM APIs so it can be stepped directly in a test.
 */

import type { CausalGraph } from '../graph/GraphAsset';

export interface SimulationParameters {
  /** Fixed timestep in seconds. */
  dt: number;
  /** Wave speed. Stability requires c * dt < manifest.stability.waveDtMax. */
  waveSpeed: number;
  /** Wave damping — how fast the transient dies. */
  waveDamping: number;
  /** Diffusion rate. Stability requires kappa * dt < manifest.stability.diffusionDtMax. */
  diffusionRate: number;
  /** Diffusion decay — activity fades rather than filling the object. */
  diffusionDecay: number;
  /**
   * Memory deposition rate from wave amplitude, per second. Memory INTEGRATES
   * the disturbance rather than recording its peak: a node the front dwells on
   * retains more than one it merely brushed, which is what makes the trace read
   * as the accumulation of the whole passage.
   */
  memoryFromWave: number;
  /** Memory deposition rate from diffused activity, per second. */
  memoryFromActivity: number;
  /** |u| above which a node counts as reached, for arrival-time measurement. */
  arrivalThreshold: number;
}

/**
 * Measured, not guessed. Wave speed and damping were swept against
 * tools/causal-pulse-validate.mjs: c=8 with heavy damping attenuated the front
 * by 100x within 16 hops and never crossed the object.
 */
export const DEFAULT_PARAMETERS: SimulationParameters = {
  dt: 1 / 120,
  waveSpeed: 20,
  waveDamping: 0.3,
  diffusionRate: 1.2,
  diffusionDecay: 0.35,
  memoryFromWave: 60,
  memoryFromActivity: 6,
  arrivalThreshold: 0.0005,
};

export interface StabilityBounds {
  waveDtMax: number;
  diffusionDtMax: number;
}

export interface SimulationMetrics {
  tick: number;
  simulatedSeconds: number;
  /** Nodes whose |u| has ever crossed the arrival threshold. */
  reachedNodes: number;
  /** Nodes currently carrying activity above 1%. */
  activeNodes: number;
  peakWave: number;
  meanRetained: number;
  maxRetained: number;
  /** Nodes holding any retained memory at all. */
  retainingNodes: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export class CausalPulseSimulation {
  readonly nodeCount: number;
  readonly parameters: SimulationParameters;

  /** Wave displacement. */
  readonly u: Float32Array;
  /** Wave velocity. */
  readonly velocity: Float32Array;
  /** Diffused activity. */
  readonly s: Float32Array;
  /** Retained memory. Monotonic by construction. */
  readonly m: Float32Array;
  /** First tick at which each node was reached, or -1. */
  readonly arrivalTick: Int32Array;
  /**
   * Tick of each node's largest |u| so far. This is the front-arrival estimator
   * that matters: a fixed amplitude threshold is confounded by local degree,
   * because a low-degree node concentrates the same energy and crosses early
   * while a hub dilutes it and crosses late. Time-to-peak is scale-free.
   */
  readonly peakTick: Int32Array;
  /** The largest |u| each node has reached. */
  readonly peakValue: Float32Array;

  private readonly graph: CausalGraph;
  private readonly lapU: Float32Array;
  private readonly lapS: Float32Array;
  private tickCount = 0;
  private injections = 0;

  constructor(graph: CausalGraph, bounds: StabilityBounds, parameters: SimulationParameters = DEFAULT_PARAMETERS) {
    this.graph = graph;
    this.parameters = parameters;
    this.nodeCount = graph.nodeCount;

    // The manifest carries the spectral bound, so the timestep is checked
    // against the graph rather than tuned until it stops exploding.
    const waveCfl = parameters.waveSpeed * parameters.dt;
    if (waveCfl >= bounds.waveDtMax) {
      throw new Error(`unstable wave: waveSpeed*dt = ${waveCfl.toFixed(5)} must be < ${bounds.waveDtMax.toFixed(5)}`);
    }
    const diffusionCfl = parameters.diffusionRate * parameters.dt;
    if (diffusionCfl >= bounds.diffusionDtMax) {
      throw new Error(`unstable diffusion: diffusionRate*dt = ${diffusionCfl.toFixed(5)} must be < ${bounds.diffusionDtMax.toFixed(5)}`);
    }

    this.u = new Float32Array(graph.nodeCount);
    this.velocity = new Float32Array(graph.nodeCount);
    this.s = new Float32Array(graph.nodeCount);
    this.m = new Float32Array(graph.nodeCount);
    this.lapU = new Float32Array(graph.nodeCount);
    this.lapS = new Float32Array(graph.nodeCount);
    this.arrivalTick = new Int32Array(graph.nodeCount).fill(-1);
    this.peakTick = new Int32Array(graph.nodeCount).fill(-1);
    this.peakValue = new Float32Array(graph.nodeCount);
  }

  get tick(): number { return this.tickCount; }
  get injectionCount(): number { return this.injections; }

  /**
   * Strike one node. The impulse spreads across its immediate ring with weight
   * falloff — a single node out of six thousand is below the threshold of
   * perception, and a disturbance that cannot be seen cannot be judged.
   */
  inject(nodeId: number, energy = 1): void {
    if (nodeId < 0 || nodeId >= this.nodeCount) throw new RangeError(`node ${nodeId} out of range`);
    const { offsets, neighbours, weights } = this.graph;

    this.velocity[nodeId] += energy;
    this.s[nodeId] = clamp01(this.s[nodeId] + energy);

    let ringWeight = 0;
    for (let k = offsets[nodeId]; k < offsets[nodeId + 1]; k++) ringWeight += weights[k];
    if (ringWeight > 0) {
      for (let k = offsets[nodeId]; k < offsets[nodeId + 1]; k++) {
        const share = (weights[k] / ringWeight) * 0.5;
        this.velocity[neighbours[k]] += energy * share;
        this.s[neighbours[k]] = clamp01(this.s[neighbours[k]] + energy * share);
      }
    }

    this.injections++;
  }

  /** Advance exactly one fixed timestep. */
  step(): void {
    const { offsets, neighbours, weights } = this.graph;
    const { dt, waveSpeed, waveDamping, diffusionRate, diffusionDecay } = this.parameters;
    const { u, velocity, s, m, lapU, lapS } = this;
    const n = this.nodeCount;

    // Both Laplacians come from the previous state for every node, so the
    // update is simultaneous rather than order-dependent.
    for (let i = 0; i < n; i++) {
      const ui = u[i];
      const si = s[i];
      let accU = 0;
      let accS = 0;
      for (let k = offsets[i]; k < offsets[i + 1]; k++) {
        const j = neighbours[k];
        const w = weights[k];
        accU += w * (u[j] - ui);
        accS += w * (s[j] - si);
      }
      lapU[i] = accU;
      lapS[i] = accS;
    }

    const c2 = waveSpeed * waveSpeed;
    const { memoryFromWave, memoryFromActivity, arrivalThreshold } = this.parameters;
    const tick = this.tickCount + 1;

    for (let i = 0; i < n; i++) {
      // Symplectic Euler: velocity first, then position from the new velocity.
      velocity[i] += (c2 * lapU[i] - waveDamping * velocity[i]) * dt;
      u[i] += velocity[i] * dt;

      s[i] += (diffusionRate * lapS[i] - diffusionDecay * s[i]) * dt;
      if (s[i] < 0) s[i] = 0;

      // Monotonic by construction: only ever added to, and clamped at 1.
      const deposit = (memoryFromWave * Math.abs(u[i]) + memoryFromActivity * s[i]) * dt;
      if (deposit > 0) m[i] = clamp01(m[i] + deposit);

      const abs = Math.abs(u[i]);
      if (this.arrivalTick[i] === -1 && abs >= arrivalThreshold) this.arrivalTick[i] = tick;
      if (abs > this.peakValue[i]) { this.peakValue[i] = abs; this.peakTick[i] = tick; }
    }

    this.tickCount = tick;
  }

  metrics(): SimulationMetrics {
    const { u, s, m } = this;
    let reached = 0;
    let active = 0;
    let peak = 0;
    let retainedSum = 0;
    let retainedMax = 0;
    let retaining = 0;

    for (let i = 0; i < this.nodeCount; i++) {
      if (this.arrivalTick[i] !== -1) reached++;
      if (s[i] > 0.01) active++;
      const abs = Math.abs(u[i]);
      if (abs > peak) peak = abs;
      retainedSum += m[i];
      if (m[i] > retainedMax) retainedMax = m[i];
      if (m[i] > 0) retaining++;
    }

    return {
      tick: this.tickCount,
      simulatedSeconds: this.tickCount * this.parameters.dt,
      reachedNodes: reached,
      activeNodes: active,
      peakWave: peak,
      meanRetained: retainedSum / this.nodeCount,
      maxRetained: retainedMax,
      retainingNodes: retaining,
    };
  }

  /**
   * FNV-1a over quantised state. Quantisation is the point: float noise in the
   * last bits would make an otherwise identical run report as divergent, so the
   * checksum answers "did this reproduce" rather than "are these bit-identical".
   */
  checksum(): number {
    let hash = 0x811c9dc5;
    const mix = (value: number): void => {
      hash ^= value & 0xff; hash = Math.imul(hash, 0x01000193);
      hash ^= (value >>> 8) & 0xff; hash = Math.imul(hash, 0x01000193);
    };

    for (let i = 0; i < this.nodeCount; i++) {
      mix(Math.round(clamp01((this.u[i] + 1) / 2) * 65535));
      mix(Math.round(clamp01(this.s[i]) * 65535));
      mix(Math.round(clamp01(this.m[i]) * 65535));
    }

    return hash >>> 0;
  }
}
