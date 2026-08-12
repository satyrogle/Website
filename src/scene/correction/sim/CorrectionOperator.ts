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

import type { Checksum } from './Checksum';

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
   *
   * Lengthened when the wave was sped up, and for a reason worth keeping: a
   * fast front passes through a node in a few ticks, so at a short memory the
   * sensor lost the reading before the hold clock finished and enforcement
   * flickered on and off behind the wave — violet on 64% of the event's ticks,
   * which reads as a sparkle rather than as the system taking hold. A monitor
   * that forgets faster than its subject moves is not a sparse sensor, it is a
   * broken one.
   */
  senseSeconds: number;
  /** Most completed events retained for inspection. */
  eventLogLimit: number;
  /**
   * Enforcement gain at the fringe of the veil, where the file is loosest.
   *
   * Pinned at 1: the fringe is the region the site opens on and the region the
   * first press lands in, and its behaviour is the tuning that was judged. The
   * gradient is only ever allowed to tighten from here, never to loosen — a
   * spatial field that scaled enforcement down would quietly re-tune the one
   * event the whole direction is judged on.
   */
  spatialGainLow: number;
  /**
   * Enforcement gain in the deep body, where the calm is more nearly total.
   *
   * Gain scales how soon the system notices and how hard it pulls, never what
   * it can see, so the calm stays outside the sensor at every depth.
   */
  spatialGainHigh: number;
  /**
   * Normalised depth at which the gradient starts to climb. Everything nearer
   * than this — which is the whole of the opening view and where the first
   * press lands — is enforced at exactly the judged tuning.
   */
  spatialGainOnset: number;
  /** Hard ceiling on per-iteration stiffness, so gain can never reach 1. */
  stiffnessCeiling: number;
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
  thetaOn: 0.14,
  thetaOff: 0.06,
  holdTicks: 34,
  iterations: 6,
  stiffnessFrom: 0.0028,
  stiffnessTo: 0.15,
  rampTicks: 20,
  bruiseDecay: 0.9985,
  scarGain: 0.014,
  scarCeiling: 0.32,
  senseSeconds: 1.2,
  eventLogLimit: 256,
  spatialGainLow: 1.0,
  spatialGainHigh: 1.55,
  spatialGainOnset: 0.55,
  stiffnessCeiling: 0.3,
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
  /**
   * Per-node enforcement gain, fixed at construction from where the node sits
   * in the veil. One scalar with three consequences — the system notices
   * sooner, loses patience sooner, and pulls harder — so a low-gain region does
   * not merely correct more gently, it lets a deviation live.
   */
  readonly gainField: Float32Array;

  /**
   * Narrative gain. Multiplies the field, and is the one quantity the site
   * drives from outside: scrolling deeper raises it. It arrives as a message on
   * the same channel as an injection, so it is part of the recorded trace and a
   * replay still reproduces the run exactly.
   */
  gain = 1;

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
    this.gainField = new Float32Array(nodeCount).fill(1);
    this.hold = new Uint16Array(nodeCount);
    this.engagedTicks = new Uint16Array(nodeCount);
    this.openedAt = new Int32Array(nodeCount).fill(-1);
    this.openedRemoved = new Float32Array(nodeCount);
  }

  /** Installed once, by the system that knows the geometry. */
  setGainField(field: Float32Array): void {
    this.gainField.set(field);
  }

  /**
   * Narrative gain. Clamped rather than trusted: this is the one value the
   * outside world sets, and the stiffness ceiling below depends on it staying
   * in a sane range.
   */
  setGain(value: number): void {
    this.gain = value < 0.25 ? 0.25 : value > 4 ? 4 : value;
  }

  /** Completed events, oldest first, capped at `eventLogLimit`. */
  get log(): readonly CorrectionEvent[] {
    return this.events;
  }

  /**
   * The largest violation the system can still see anywhere.
   *
   * Measured against the release threshold, not against the record: below
   * ε + θ_off the operator has let go, so as far as the file is concerned
   * there is nothing there. This is the number the floor reports, and it is
   * derived rather than authored — which is the only reason it is allowed to
   * be a zero printed under a world that is still visibly moving.
   */
  visibleResidual(): number {
    const limit = this.parameters.epsilon + this.parameters.thetaOff;
    let peak = 0;
    for (let i = 0; i < this.sensed.length; i++) {
      const over = this.sensed[i] - limit;
      if (over > peak) peak = over;
    }
    return peak;
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
   * One enforcement pass over the whole graph. `u` and `rate` are the
   * simulation's own arrays and are written in place — this operator is not an
   * observer, it is the thing that acts.
   *
   * `rate` is du/dt as of the last step. Under the first-order field it is
   * diagnostic: nothing integrates it, so taking it out of a held blade
   * changes nothing. The line survives because the contract it expresses — the
   * operator takes the momentum as well as the displacement — is the one that
   * made enforcement terminate rather than vibrate, and the day this field
   * gains momentum again it has to still be here.
   */
  apply(u: Float32Array, rate: Float32Array, tick: number): void {
    const p = this.parameters;
    const { record, engaged, bruise, scar, contact, sensed, glow, gainField, hold, engagedTicks, openedAt, openedRemoved } =
      this;
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

    const sense = senseDecay(p.senseSeconds, 1 / 120);
    const narrative = this.gain;

    for (let i = 0; i < n; i++) {
      // Thresholds are deliberately NOT scaled by gain. What the system can see
      // is a property of its sensor and stays fixed, so the ambient harmonic
      // remains under the threshold at every gain and the calm is never
      // enforced anywhere. Gain changes what happens once something IS seen.
      const g = gainField[i] * narrative;
      const rampSpan = Math.max(p.rampTicks / g, 1);
      const holdRequired = Math.max(p.holdTicks / g, 1);

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

        if (hold[i] >= holdRequired) {
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
        const raw = (p.stiffnessFrom + (p.stiffnessTo - p.stiffnessFrom) * shaped) * g;
        const stiffness = raw > p.stiffnessCeiling ? p.stiffnessCeiling : raw;

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
        rate[i] -= rate[i] * pull;

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
    // Narrative gain is an input to the run, so it belongs in the run's
    // identity: a replay that scrolled differently is a different run.
    checksum.mix(Math.round(this.gain * 256));
  }
}
