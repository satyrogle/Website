/**
 * CorrectionSystem — graph, wave, harmonic and operator as one steppable unit.
 *
 * This is the composition root for everything authoritative. It has no Worker
 * and no DOM dependency, so `tools/correction-validate.mjs` steps the exact
 * object the site steps, and a determinism claim made here is a claim about
 * what runs in production rather than about a test double.
 *
 * Order inside a tick is fixed and load-bearing:
 *
 *   1. ambient forcing        the world is nudged
 *   2. wave integration       the world moves
 *   3. correction pass        the system reads the world and acts on it
 *
 * The operator runs last because it must see the state the renderer will show.
 */

import { synthesiseGraph, DEFAULT_SYNTH, type GraphSynthConfig, type SynthesisedGraph } from '../graph/GraphSynth';
import { CausalPulseSimulation, Checksum, DEFAULT_WAVE, type WaveParameters } from './CausalPulseSimulation';
import {
  CorrectionOperator,
  DEFAULT_CORRECTION,
  type CorrectionParameters,
} from './CorrectionOperator';
import { AmbientHarmonic, DEFAULT_AMBIENT, type AmbientParameters } from './AmbientHarmonic';

export interface CorrectionSystemConfig {
  synth: GraphSynthConfig;
  wave: WaveParameters;
  correction: CorrectionParameters;
  ambient: AmbientParameters;
  /** Ticks stepped before the record is taken. 10 s of simulated time. */
  warmUpTicks: number;
  /** Closing ticks of warm-up averaged into the record. */
  recordWindowTicks: number;
}

export const DEFAULT_SYSTEM: CorrectionSystemConfig = {
  synth: DEFAULT_SYNTH,
  wave: DEFAULT_WAVE,
  correction: DEFAULT_CORRECTION,
  ambient: DEFAULT_AMBIENT,
  warmUpTicks: 1200,
  recordWindowTicks: 480,
};

export class CorrectionSystem {
  readonly config: CorrectionSystemConfig;
  readonly synthesised: SynthesisedGraph;
  readonly simulation: CausalPulseSimulation;
  readonly operator: CorrectionOperator;
  readonly ambient: AmbientHarmonic;

  /** Endpoint pairs for the rendered edges, i < j, CSR order. */
  readonly edgeIndices: Uint32Array;

  private readonly recordSum: Float64Array;
  private recordSamples = 0;

  constructor(config: CorrectionSystemConfig = DEFAULT_SYSTEM) {
    this.config = config;
    this.synthesised = synthesiseGraph(config.synth);

    const { graph, bounds } = this.synthesised;
    this.simulation = new CausalPulseSimulation(graph, bounds, config.wave);
    this.operator = new CorrectionOperator(graph.nodeCount, config.correction);
    this.ambient = new AmbientHarmonic(graph.positions, config.ambient);
    this.recordSum = new Float64Array(graph.nodeCount);

    // What is drawn is a subset of what is simulated. The lattice needs every
    // edge or the wave could only travel along the flow; the picture needs
    // far fewer, because an even mesh reads as a chart rather than as a
    // surface under control.
    this.edgeIndices = this.synthesised.renderEdges;
    this.operator.setGainField(
      CorrectionSystem.gainField(this.synthesised.depth, config.correction)
    );
  }

  /**
   * How hard the file is enforced, per node.
   *
   * A single monotone gradient along the structure's own sweep: loosest at the
   * end the camera opens on, total at the end it travels into. Deliberately
   * not a radial or distance-from-centre field — that would draw a soft
   * ellipse across the structure, and a frame that resolves into concentric
   * anything is how every retired direction died.
   *
   * Nothing about the structure changes as the visitor travels; only how
   * quickly and how hard deviation is put back. That is the whole turn: the
   * calm ahead is not calmer, it is more governed.
   */
  private static gainField(depth: Float32Array, p: CorrectionParameters): Float32Array {
    const field = new Float32Array(depth.length);
    const onset = Math.min(Math.max(p.spatialGainOnset, 0), 0.99);

    for (let i = 0; i < depth.length; i++) {
      // Depth is the structure's own coordinate: 0 where the camera opens, 1
      // at the far end it travels into. The climb starts past the opening
      // view, so the event the visitor is first shown is enforced at the
      // tuning that was judged, and the gradient is something they travel into
      // rather than something applied to the frame they arrived on.
      const t = Math.min(Math.max((depth[i] - onset) / (1 - onset), 0), 1);
      const shaped = t * t * (3 - 2 * t);
      field[i] = p.spatialGainLow + (p.spatialGainHigh - p.spatialGainLow) * shaped;
    }

    return field;
  }

  /** Narrative depth, from the scroll director through the Worker. */
  setGain(value: number): void {
    this.operator.setGain(value);
  }

  get tick(): number {
    return this.simulation.tick;
  }

  inject(node: number, energy: number): void {
    this.simulation.inject(node, energy);
  }

  /** One authoritative tick. */
  step(): void {
    const { dt } = this.config.wave;
    this.ambient.drive(this.simulation.velocity, this.simulation.tick, dt);
    this.simulation.step();
    this.operator.apply(this.simulation.u, this.simulation.velocity, this.simulation.tick);
  }

  /**
   * Steps the world to a settled harmonic and then takes the record from it.
   *
   * The operator is inert throughout — there is nothing to enforce against
   * until the record exists — so warm-up is the one stretch of the run in which
   * the world is genuinely unsupervised.
   *
   * `onProgress` is called between chunks so a caller can report real
   * initialisation instead of a timer.
   */
  warmUp(onProgress?: (fraction: number) => void): void {
    const total = this.config.warmUpTicks;
    const recordFrom = total - this.config.recordWindowTicks;
    const chunk = 120;

    for (let done = 0; done < total; done++) {
      this.step();

      if (done >= recordFrom) {
        const u = this.simulation.u;
        for (let i = 0; i < u.length; i++) this.recordSum[i] += u[i];
        this.recordSamples++;
      }

      if (onProgress && done % chunk === chunk - 1) onProgress(done / total);
    }

    const mean = new Float32Array(this.recordSum.length);
    const inverse = 1 / Math.max(this.recordSamples, 1);
    for (let i = 0; i < mean.length; i++) mean[i] = this.recordSum[i] * inverse;

    this.operator.captureRecord(mean);
    onProgress?.(1);
  }

  /**
   * The node nearest a point in space.
   *
   * A position rather than an index, because an index only means something for
   * one seed and the scripted event has to land in the same place on every
   * machine.
   */
  nearestNode(x: number, y: number, z: number): number {
    const { positions } = this.synthesised.graph;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < positions.length / 3; i++) {
      const dx = positions[i * 3] - x;
      const dy = positions[i * 3 + 1] - y;
      const dz = positions[i * 3 + 2] - z;
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  }

  /**
   * One correction event, stepped to completion, reported as the three moments
   * that make it legible without motion.
   *
   * The stages are found by watching the system rather than by naming ticks:
   * the tick before enforcement first engages, one inside the stiffness ramp,
   * and one after the operator has let go and stayed off. So the stills are the
   * event, not an illustration of it — and because this lives here rather than
   * in the Worker, the mechanism gate can assert that they are.
   *
   * The contract with the caller is that its own copy of the state is correct
   * at every `onFrame`, provided it refreshes that copy in `onTick`. That is
   * what makes the first stage honest: engagement can only be observed after
   * the step that caused it, so by the time this loop can see it, one tick of
   * enforcement is already in the world. Reporting the deviation before the
   * refresh hands back the tick before that — the frame the visitor is told
   * nothing is acting on, in which nothing is.
   */
  scriptedEvent(
    node: number,
    energy: number,
    onFrame: (stage: 'deviation' | 'strain' | 'settled', tick: number) => void,
    onTick?: () => void,
    /** Ticks of quiet that end the event. */
    quietTicks = 240,
    /** Hard bound, so a configuration that never engages still terminates. */
    limit = 4000
  ): void {
    this.inject(node, energy);

    let engagedAt = -1;
    let quiet = 0;
    let strained = false;

    for (let t = 0; t < limit; t++) {
      const held = this.operator.engagedCount();

      if (engagedAt === -1 && held > 0) {
        engagedAt = t;
        onFrame('deviation', this.tick - 1);
      }

      onTick?.();

      // Inside the ramp: the pull is on and has not won yet.
      if (engagedAt !== -1 && !strained && t >= engagedAt + 30) {
        strained = true;
        onFrame('strain', this.tick);
      }

      if (engagedAt !== -1 && strained) {
        quiet = held === 0 ? quiet + 1 : 0;
        if (quiet >= quietTicks) break;
      }

      this.step();
    }

    onTick?.();
    onFrame('settled', this.tick);
  }

  /**
   * Largest |u − u*| anywhere. Reported so the ambient harmonic can be checked
   * against ε rather than assumed to sit under it.
   */
  peakDeviation(): number {
    const { u } = this.simulation;
    const { record } = this.operator;
    let peak = 0;
    for (let i = 0; i < u.length; i++) {
      const d = Math.abs(u[i] - record[i]);
      if (d > peak) peak = d;
    }
    return peak;
  }

  /**
   * Run checksum over the world and the enforcement together. Two runs from the
   * same seed and the same injection trace agree here or the determinism claim
   * is false.
   */
  checksum(): number {
    const checksum = new Checksum();
    const { u } = this.simulation;
    for (let i = 0; i < u.length; i++) checksum.mixSigned(u[i], 2);
    this.operator.mixInto(checksum);
    return checksum.value;
  }
}
