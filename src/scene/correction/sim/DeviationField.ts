/**
 * DeviationField — how far each blade is from the law, and how that changes.
 *
 * `uᵢ` is one signed number per blade: the angle it currently sits away from
 * its approved orientation. Zero is obedience. The world's whole physical
 * state is this array.
 *
 *     u̇ᵢ = −γ·uᵢ + κ·Σⱼ wᵢⱼ(uⱼ − uᵢ) + driveᵢ
 *
 * First order, deliberately. The band that this replaced ran a second-order
 * graph wave, and five rounds of tuning were spent fighting the consequences:
 * the front travelled at the wrong speed, reflected off free ends and came back
 * through itself, and at any damping low enough to let a deviation survive
 * being noticed it left the whole structure ringing below the sensor's
 * threshold — permanently deviating, never corrected, so the approved state
 * stopped being a state the world returns to.
 *
 * None of that is tuned away here; it is absent. A first-order system has no
 * momentum, so it cannot oscillate, cannot propagate a front and has nothing to
 * reflect. A deviation spreads to its neighbours, decays, and stops.
 *
 * That is also the truer model. The law already exists everywhere in the field.
 * Nothing has to travel to tell a blade what it should be doing — it is already
 * wrong or already right, locally, and correction means returning to the local
 * law rather than waiting for news to arrive.
 *
 * Kept free of Worker and DOM APIs so it steps identically in node.
 */

import type { CausalGraph, StabilityBounds } from '../graph/GraphAsset';

export interface FieldParameters {
  /** Fixed timestep in seconds. */
  dt: number;
  /**
   * γ — how fast a blade returns to the law on its own, per second.
   *
   * This is the world's own tendency, not the system's enforcement. It has to
   * be slow enough that a deviation outlives the awareness latency — otherwise
   * the disturbance settles by itself, the operator never has to act, and the
   * site's entire proposition goes unwitnessed.
   */
  relaxation: number;
  /**
   * κ — how strongly a blade is pulled toward the state of its neighbours.
   *
   * What makes a press disturb a region rather than a point. Set so a
   * deviation bleeds two or three graph hops before enforcement engages: far
   * enough that the surrounding field is visibly involved, near enough that the
   * escape stays a local cluster the eye can hold.
   */
  coupling: number;
}

export const DEFAULT_DYNAMICS: FieldParameters = {
  dt: 1 / 120,
  relaxation: 2.2,
  coupling: 6,
};

/** Radius of one press, in world units. Mutable so the dev panel can move it. */
export const INJECTION = {
  /**
   * Spatial rather than measured in graph hops. Over hops the profile jumped
   * wherever a coupling edge happened to be long, so the initial disturbance
   * was ragged before it had spread anywhere. A smooth falloff over distance
   * gives a clean cluster whatever the topology under it.
   */
  radius: 2.6,
};

export class DeviationField {
  readonly nodeCount: number;
  readonly parameters: FieldParameters;

  /** Angle away from the approved orientation, per blade. The world. */
  readonly u: Float32Array;
  /**
   * du/dt as of the last step.
   *
   * Diagnostic only — nothing integrates it, because a first-order system has
   * no momentum to carry. It exists because `CorrectionOperator` takes the
   * momentum out of a node it has taken hold of, and that contract is worth
   * keeping honest rather than special-casing: here there is simply nothing for
   * it to remove.
   */
  readonly rate: Float32Array;

  /** This tick's external forcing, consumed and cleared by `step`. */
  readonly forcing: Float32Array;

  private readonly graph: CausalGraph;
  private readonly coupled: Float32Array;
  private tickCount = 0;
  private injections = 0;

  constructor(graph: CausalGraph, bounds: StabilityBounds, parameters: FieldParameters = DEFAULT_DYNAMICS) {
    this.graph = graph;
    this.parameters = parameters;
    this.nodeCount = graph.nodeCount;

    // Checked against the structure the synthesiser actually produced rather
    // than tuned until it stops exploding. The bound is the accuracy one, well
    // inside stability: explicit Euler survives to 2, and anything above about
    // 0.5 starts visibly under-damping a step it should have resolved.
    const step = parameters.dt * (parameters.relaxation + parameters.coupling * bounds.lambdaMaxBound);
    if (step > 0.5) {
      throw new Error(
        `unstable relaxation: dt·(γ + κ·λ) = ${step.toFixed(4)} must be ≤ 0.5 ` +
          `(γ=${parameters.relaxation}, κ=${parameters.coupling}, λ=${bounds.lambdaMaxBound.toFixed(3)})`
      );
    }

    this.u = new Float32Array(graph.nodeCount);
    this.rate = new Float32Array(graph.nodeCount);
    this.forcing = new Float32Array(graph.nodeCount);
    this.coupled = new Float32Array(graph.nodeCount);
  }

  get tick(): number {
    return this.tickCount;
  }

  get injectionCount(): number {
    return this.injections;
  }

  /**
   * Knock a region of the choir out of the law.
   *
   * Spread over a neighbourhood with a raised-cosine falloff rather than dumped
   * on one blade: a single-blade disturbance is almost entirely high spatial
   * frequency, and high frequencies on a coupled field are exactly what the
   * coupling term smooths away fastest. It would die where it landed. A broad,
   * smooth cluster is what survives long enough to be noticed, resisted and
   * forced back — which is the event the whole site is about.
   */
  inject(nodeId: number, energy = 1): void {
    if (nodeId < 0 || nodeId >= this.nodeCount) throw new RangeError(`node ${nodeId} out of range`);

    const { positions } = this.graph;
    const radius = INJECTION.radius;
    const at = nodeId * 3;

    for (let i = 0; i < this.nodeCount; i++) {
      const dx = positions[i * 3] - positions[at];
      const dy = positions[i * 3 + 1] - positions[at + 1];
      const dz = positions[i * 3 + 2] - positions[at + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d >= radius) continue;
      this.u[i] += 0.5 * (1 + Math.cos((Math.PI * d) / radius)) * energy;
    }

    this.injections++;
  }

  /** Advance exactly one fixed timestep. */
  step(): void {
    const { offsets, neighbours, weights } = this.graph;
    const { dt, relaxation, coupling } = this.parameters;
    const { u, rate, forcing, coupled } = this;
    const n = this.nodeCount;

    // Read the coupling term for every node from the previous state, so the
    // update is simultaneous rather than order-dependent — otherwise the result
    // would depend on the order the synthesiser happened to emit blades in, and
    // the determinism claim would be about the array layout rather than the
    // physics.
    for (let i = 0; i < n; i++) {
      const ui = u[i];
      let acc = 0;
      for (let k = offsets[i]; k < offsets[i + 1]; k++) {
        acc += weights[k] * (u[neighbours[k]] - ui);
      }
      coupled[i] = acc;
    }

    for (let i = 0; i < n; i++) {
      const derivative = -relaxation * u[i] + coupling * coupled[i];
      rate[i] = derivative;
      u[i] += derivative * dt + forcing[i];
      forcing[i] = 0;
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
