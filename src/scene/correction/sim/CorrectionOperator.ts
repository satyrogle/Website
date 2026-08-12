/**
 * CorrectionOperator — the system acting on the world.
 *
 * Runs after every integration step. It compares the world `u` against the
 * approved record `u*`, and where the disagreement is large enough and has
 * lasted long enough, it forces the world back inside the record's tolerance
 * band. Nothing here is animated: every displacement the visitor sees during a
 * correction is a δ this operator computed and applied to the authoritative
 * state.
 *
 *   D = |u − u*|          disagreement, measured in full
 *   C = engaged           contact, sparse and thresholded and hysteretic
 *   V = D × C             consequence — violet, and the retained bruise
 *
 * Two consequences of the threshold fall out of the model rather than being
 * decorated on afterwards:
 *
 *   - the system's sensor is sparse. Drift under θ_on is never seen, so it is
 *     never corrected. The record tolerates invisible error while violently
 *     correcting visible deviation.
 *   - the calm is a result. A region at rest is a region the operator has
 *     already finished with.
 *
 * No Math.random anywhere: the same seed and the same injection trace replay
 * to the same state, including the enforcement.
 */

import type { Checksum } from './CausalPulseSimulation';

export interface CorrectionParameters {
  /** Tolerance half-width around the record. Inside this, nothing is wrong. */
  epsilon: number;
  /** Violation beyond ε that starts the awareness clock. */
  thetaOn: number;
  /** Violation beyond ε below which enforcement releases. Hysteresis. */
  thetaOff: number;
  /** T_hold — ticks the violation must persist before the system notices. */
  holdTicks: number;
  /** K — projected iterations applied per tick while engaged. */
  iterations: number;
  /** Per-iteration pull at the start of an engagement — the strain phase. */
  stiffnessFrom: number;
  /** Per-iteration pull once the ramp has completed — the snap. */
  stiffnessTo: number;
  /** Ticks over which stiffness ramps from `from` to `to`. */
  rampTicks: number;
  /** Per-tick decay of the fresh bruise. */
  bruiseDecay: number;
  /** Fraction of removed displacement that becomes a permanent scar. */
  scarGain: number;
  /** Ceiling on the permanent scar, so a hammered node cannot go white. */
  scarCeiling: number;
  /**
   * The sensor's time constant in seconds — how long a reading persists in the
   * system's own monitor. Sets how long enforcement keeps hold of a node after
   * the deviation has actually gone.
   */
  senseSeconds: number;
  /** Most completed events retained for inspection. */
  eventLogLimit: number;
}

/**
 * Starting parameters are the build plan's, with one deliberate rescale.
 *
 * The plan specifies a stiffness ramp of 0.15 → 1.0 across K = 6 projected
 * iterations. Applied per tick at 120 Hz that removes 1 − 0.85⁶ = 62% of the
 * excess on the very first tick and 100% at the top of the ramp: the whole
 * correction completes inside one displayed frame, so stages 3 to 5 — strain,
 * snap, settle — never exist. The ramp shape is kept exactly; only its range is
 * rescaled so the six-stage event has a timeline a person can watch.
 *
 *   stiffnessFrom 0.0028 → 1 − (1−s)⁶ ≈ 1.7% removed per tick  ≈ 0.5 s constant
 *   stiffnessTo   0.0750 → 1 − (1−s)⁶ ≈ 37%  removed per tick  ≈ 27 ms constant
 *
 * The ramp spans 20 ticks, not 54, and the sensor holds its reading for 0.40 s
 * rather than 0.12. Both came out of the same measurement: at the plan's ramp a
 * node released after 13 ticks, before the ramp had finished, so it strained and
 * was then let go while the wave moved on. Nothing ever snapped, and an operator
 * that only glows while a deviation subsides on its own is decoration. Swept
 * together (tools/correction-validate.mjs --ramp --sense), 20/0.40 gives a
 * median grip of 47 ticks with the ramp completing at 20 — 170 ms of visible
 * resistance, then the node loses — and raises the region held at once from a
 * mean of 10 to 28, peaking at 116.
 *
 * ε, T_hold and K are the plan's values unchanged.
 *
 * θ_on and θ_off are halved from 0.12/0.05. Swept against
 * tools/correction-validate.mjs: at the plan's thresholds one strike engages a
 * mean of 10 nodes and violet is present on 80% of the event's ticks, which
 * renders as a sparkle rather than as the system taking hold of a region. At
 * 0.06/0.025 the same strike engages a mean of 16 with peaks of 74, and violet
 * is continuous across 96% of the event. The calm still produces zero
 * enforcement and zero violet — engagement now sits at |u−u*| > 0.10 against an
 * ambient peak of 0.020, which is five times the margin the sensor needs.
 *
 * Bruise decay is slowed from 0.995 (1.2 s half-life — a blink) to 0.9985
 * (3.9 s), and split into a decaying bruise plus a monotonic scar, because the
 * plan requires the trace to decay "but never fully clear".
 */
export const DEFAULT_CORRECTION: CorrectionParameters = {
  epsilon: 0.04,
  thetaOn: 0.06,
  thetaOff: 0.025,
  holdTicks: 48,
  iterations: 6,
  stiffnessFrom: 0.0028,
  stiffnessTo: 0.075,
  rampTicks: 20,
  bruiseDecay: 0.9985,
  scarGain: 0.014,
  scarCeiling: 0.32,
  senseSeconds: 0.40,
  eventLogLimit: 256,
};

/** One completed correction, as it will be reported and replayed against. */
export interface CorrectionEvent {
  node: number;
  /** Tick at which the system engaged. */
  engagedAt: number;
  /** Ticks the enforcement stayed engaged. */
  heldTicks: number;
  /** Σ|δ| removed from the world over the engagement. */
  removed: number;
}

/** ~0.15 s time constant at 120 Hz. Keeps contact from strobing per tick. */
const CONTACT_DECAY = Math.exp(-(1 / 120) / 0.15);

/** ~0.5 s time constant at 120 Hz, for the display envelope. */
const GLOW_DECAY = Math.exp(-(1 / 120) / 0.5);

/**
 * The sensor thresholds on a short envelope of the disagreement, not on its
 * instantaneous value. This is not smoothing for looks — the deviation is a
 * wave, so it passes through the record twice per cycle, and a threshold on the
 * raw value resets the hold clock every few ticks. The system would then only
 * ever catch nodes carrying a steady offset and would be blind to an
 * oscillation of any amplitude, which is not a sparse sensor, it is a broken
 * one. An envelope gives the sensor a response time, which is what a real
 * monitor has — and it is also what keeps the operator holding a node for long
 * enough that the grip is something a person can watch.
 */
const senseDecay = (seconds: number, dt: number): number => Math.exp(-dt / seconds);

export class CorrectionOperator {
  readonly parameters: CorrectionParameters;

  /** u* — the approved state. Zero until the record is captured. */
  readonly record: Float32Array;
  /** 1 while the operator is actively holding this node. */
  readonly engaged: Uint8Array;
  /** Decaying trace of enforcement. */
  readonly bruise: Float32Array;
  /** Monotonic floor under the bruise. A correction is never fully forgotten. */
  readonly scar: Float32Array;
  /** Smoothed |δ| applied this tick — V = D × C, for the renderer. */
  readonly contact: Float32Array;
  /**
   * What the system can see: a short envelope of |u − u*|. Every threshold in
   * this file reads this and never the raw disagreement, so it is authoritative
   * and is covered by the checksum.
   */
  readonly sensed: Float32Array;
  /**
   * Decaying envelope of |u − u*|. Display only: nothing in the enforcement
   * path reads it, and it is not in the checksum.
   *
   * It is an envelope rather than the instantaneous disagreement because the
   * wave crosses the record many times while a region is active, and a mask
   * built on the instantaneous value collapses at every crossing and strobes.
   * It measures disagreement rather than displacement because that is what the
   * light law is about: the structure is visible where the world and the record
   * differ, not merely where the world has moved.
   */
  readonly glow: Float32Array;

  /** OFF→ON transitions. This is the N the floor panel will report. */
  adjustments = 0;
  /** Σ|δ| removed from the world across the whole session. */
  correctionEnergy = 0;
  /** True once `captureRecord` has run. Before that the operator is inert. */
  armed = false;

  private readonly hold: Uint16Array;
  private readonly engagedTicks: Uint16Array;
  private readonly openedAt: Int32Array;
  private readonly openedRemoved: Float32Array;
  private readonly events: CorrectionEvent[] = [];

  constructor(nodeCount: number, parameters: CorrectionParameters = DEFAULT_CORRECTION) {
    this.parameters = parameters;
    this.record = new Float32Array(nodeCount);
    this.engaged = new Uint8Array(nodeCount);
    this.bruise = new Float32Array(nodeCount);
    this.scar = new Float32Array(nodeCount);
    this.contact = new Float32Array(nodeCount);
    this.sensed = new Float32Array(nodeCount);
    this.glow = new Float32Array(nodeCount);
    this.hold = new Uint16Array(nodeCount);
    this.engagedTicks = new Uint16Array(nodeCount);
    this.openedAt = new Int32Array(nodeCount).fill(-1);
    this.openedRemoved = new Float32Array(nodeCount);
  }

  /** Completed events, oldest first, capped at `eventLogLimit`. */
  get log(): readonly CorrectionEvent[] {
    return this.events;
  }

  /** Nodes the operator is holding right now. */
  engagedCount(): number {
    let count = 0;
    for (let i = 0; i < this.engaged.length; i++) count += this.engaged[i];
    return count;
  }

  /**
   * Takes the record. `u*` is the mean of the world over the closing stretch of
   * warm-up, not an instantaneous frame: the ambient harmonic is still moving,
   * and centring the band on one arbitrary phase of it would put half the veil
   * permanently off-centre inside its own tolerance.
   *
   * The band is therefore derived from a recording of the world, exactly as the
   * proposition claims. Nothing about it is authored.
   */
  captureRecord(mean: Float32Array): void {
    this.record.set(mean);
    this.armed = true;
  }

  /**
   * One enforcement pass over the whole graph. `u` and `velocity` are the
   * simulation's own arrays and are written in place — this operator is not an
   * observer, it is the thing that acts.
   */
  apply(u: Float32Array, velocity: Float32Array, tick: number): void {
    const p = this.parameters;
    const { record, engaged, bruise, scar, contact, sensed, glow, hold, engagedTicks, openedAt, openedRemoved } = this;
    const n = record.length;

    if (!this.armed) {
      // Before the record exists there is nothing to enforce against, and no
      // record to measure disagreement from — so the envelope tracks the raw
      // displacement for the duration of warm-up. The bruise still decays, so
      // a pre-record state cannot leak forward.
      for (let i = 0; i < n; i++) {
        bruise[i] *= p.bruiseDecay;
        contact[i] *= CONTACT_DECAY;
        const abs = Math.abs(u[i]);
        const decayed = glow[i] * GLOW_DECAY;
        glow[i] = abs > decayed ? abs : decayed;
      }
      return;
    }

    const rampSpan = Math.max(p.rampTicks, 1);
    const sense = senseDecay(p.senseSeconds, 1 / 120);

    for (let i = 0; i < n; i++) {
      const target = record[i];
      const disagreement = Math.abs(u[i] - target);

      // The sensor reading, before any threshold is applied to it.
      const decayedSense = sensed[i] * sense;
      sensed[i] = disagreement > decayedSense ? disagreement : decayedSense;

      const violation = sensed[i] - p.epsilon;
      const v = violation > 0 ? violation : 0;

      if (engaged[i] === 0) {
        // Awareness latency. The violation has to persist, not merely occur —
        // this is the gap that reads as the system noticing.
        if (v > p.thetaOn) {
          if (hold[i] < 65535) hold[i]++;
        } else if (hold[i] !== 0) {
          hold[i] = 0;
        }

        if (hold[i] >= p.holdTicks) {
          engaged[i] = 1;
          engagedTicks[i] = 0;
          hold[i] = 0;
          openedAt[i] = tick;
          openedRemoved[i] = 0;
          this.adjustments++;
        }
      } else if (v < p.thetaOff) {
        // Hysteresis: release is a different threshold from engagement, so a
        // node cannot chatter on the boundary.
        engaged[i] = 0;
        this.closeEvent(i, tick);
      }

      let removed = 0;

      if (engaged[i] === 1) {
        // Stiffness is a function of how long this node has been held, not of
        // the iteration index inside the tick. That is what gives stage 3 a
        // duration: the pull is weak while the deviation resists, and only
        // then does it win.
        const ramp = Math.min(engagedTicks[i] / rampSpan, 1);
        // Eased so the transition from strain to snap is a turn rather than a
        // linear slide. Parameters glide; behaviour snaps.
        const shaped = ramp * ramp * (3 - 2 * ramp);
        const stiffness = p.stiffnessFrom + (p.stiffnessTo - p.stiffnessFrom) * shaped;

        const low = target - p.epsilon;
        const high = target + p.epsilon;

        for (let k = 0; k < p.iterations; k++) {
          const current = u[i];
          const clamped = current < low ? low : current > high ? high : current;
          const delta = stiffness * (clamped - current);
          u[i] = current + delta;
          removed += delta < 0 ? -delta : delta;
        }

        // The operator is holding the node, so it takes the momentum that was
        // carrying it out as well as the displacement. Without this the
        // integrator immediately pushes the node back out and the enforcement
        // never terminates — it would read as a vibration, not a decision.
        const pull = 1 - Math.pow(1 - stiffness, p.iterations);
        velocity[i] -= velocity[i] * pull;

        if (engagedTicks[i] < 65535) engagedTicks[i]++;
        openedRemoved[i] += removed;
        this.correctionEnergy += removed;
      }

      bruise[i] = bruise[i] * p.bruiseDecay + removed;
      if (removed > 0 && scar[i] < p.scarCeiling) {
        const grown = scar[i] + removed * p.scarGain;
        scar[i] = grown > p.scarCeiling ? p.scarCeiling : grown;
      }

      const decayedContact = contact[i] * CONTACT_DECAY;
      contact[i] = removed > decayedContact ? removed : decayedContact;

      // Recomputed after the pass, so the envelope reflects the state the
      // renderer is about to be handed rather than the one before enforcement.
      const corrected = Math.abs(u[i] - target);
      const decayedGlow = glow[i] * GLOW_DECAY;
      glow[i] = corrected > decayedGlow ? corrected : decayedGlow;
    }
  }

  private closeEvent(node: number, tick: number): void {
    const at = this.openedAt[node];
    if (at < 0) return;
    this.events.push({
      node,
      engagedAt: at,
      heldTicks: tick - at,
      removed: this.openedRemoved[node],
    });
    if (this.events.length > this.parameters.eventLogLimit) this.events.shift();
    this.openedAt[node] = -1;
    this.openedRemoved[node] = 0;
  }

  /**
   * Extends the run checksum over the enforcement itself, so "this replayed"
   * covers what the system did and not only what the world did.
   */
  mixInto(checksum: Checksum): void {
    for (let i = 0; i < this.record.length; i++) {
      checksum.mixUnsigned(this.bruise[i], 4);
      checksum.mixUnsigned(this.scar[i], 1);
      checksum.mixUnsigned(this.sensed[i], 2);
      checksum.mix(this.engaged[i]);
    }
    checksum.mix(this.adjustments & 0xffff);
    checksum.mix((this.adjustments >>> 16) & 0xffff);
  }
}
