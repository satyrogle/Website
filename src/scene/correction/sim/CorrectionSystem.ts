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
import { CorrectionOperator, DEFAULT_CORRECTION, type CorrectionParameters } from './CorrectionOperator';
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

    const pairs = new Uint32Array((graph.entryCount / 2) * 2);
    let at = 0;
    for (let i = 0; i < graph.nodeCount; i++) {
      for (let k = graph.offsets[i]; k < graph.offsets[i + 1]; k++) {
        const j = graph.neighbours[k];
        if (i < j) {
          pairs[at++] = i;
          pairs[at++] = j;
        }
      }
    }
    this.edgeIndices = pairs.subarray(0, at);
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
