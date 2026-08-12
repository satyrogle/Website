/**
 * CorrectionSystem — surface, wave, harmonic and operator as one steppable unit.
 *
 * This is the composition root for everything authoritative. It has no Worker
 * and no DOM dependency, so `tools/correction-validate.mjs` steps the exact
 * object the site steps, and a determinism claim made here is a claim about
 * what runs in production rather than about a test double.
 *
 * Order inside a tick is fixed and load-bearing:
 *
 *   1. ambient forcing        the surface is nudged
 *   2. wave integration       the surface moves
 *   3. correction pass        the system reads the surface and acts on it
 *
 * The operator runs last because it must see the state the renderer will show.
 */

import {
  synthesiseSurface,
  DEFAULT_SURFACE,
  type SurfaceSynthConfig,
  type SynthesisedSurface,
} from '../graph/SurfaceSynth';
import { CausalPulseSimulation, Checksum, DEFAULT_WAVE, type WaveParameters } from './CausalPulseSimulation';
import { CorrectionOperator, DEFAULT_CORRECTION, type CorrectionParameters } from './CorrectionOperator';
import { AmbientHarmonic, DEFAULT_AMBIENT, type AmbientParameters } from './AmbientHarmonic';

export interface CorrectionSystemConfig {
  surface: SurfaceSynthConfig;
  wave: WaveParameters;
  correction: CorrectionParameters;
  ambient: AmbientParameters;
  /** Ticks stepped before the record is taken. 10 s of simulated time. */
  warmUpTicks: number;
  /** Closing ticks of warm-up averaged into the record. */
  recordWindowTicks: number;
}

export const DEFAULT_SYSTEM: CorrectionSystemConfig = {
  surface: DEFAULT_SURFACE,
  wave: DEFAULT_WAVE,
  correction: DEFAULT_CORRECTION,
  ambient: DEFAULT_AMBIENT,
  warmUpTicks: 1200,
  recordWindowTicks: 480,
};

export class CorrectionSystem {
  readonly config: CorrectionSystemConfig;
  readonly synthesised: SynthesisedSurface;
  readonly simulation: CausalPulseSimulation;
  readonly operator: CorrectionOperator;
  readonly ambient: AmbientHarmonic;

  /** ∂u/∂x and ∂u/∂z at each node. Display only — the light reads these. */
  readonly gradientX: Float32Array;
  readonly gradientZ: Float32Array;

  private readonly recordSum: Float64Array;
  private recordSamples = 0;

  constructor(config: CorrectionSystemConfig = DEFAULT_SYSTEM) {
    this.config = config;
    this.synthesised = synthesiseSurface(config.surface);

    const { graph, bounds } = this.synthesised;
    this.simulation = new CausalPulseSimulation(graph, bounds, config.wave);
    this.operator = new CorrectionOperator(graph.nodeCount, config.correction);
    this.ambient = new AmbientHarmonic(graph.positions, config.ambient);
    this.recordSum = new Float64Array(graph.nodeCount);
    this.gradientX = new Float32Array(graph.nodeCount);
    this.gradientZ = new Float32Array(graph.nodeCount);
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
   * Surface gradient of the deviation, for the renderer's normal.
   *
   * A swelling that does not tilt its own normal is invisible under any light,
   * and this surface is read entirely by its shading. Run once per published
   * snapshot rather than once per tick — it is display state, so it is derived
   * from the authoritative arrays and never feeds back into them.
   */
  computeGradients(): void {
    const { offsets, neighbours } = this.synthesised.graph;
    const { gradientX: cx, gradientZ: cz } = this.synthesised;
    const { u } = this.simulation;
    const { record } = this.operator;

    for (let i = 0; i < u.length; i++) {
      const centre = u[i] - record[i];
      let gx = 0;
      let gz = 0;
      for (let k = offsets[i]; k < offsets[i + 1]; k++) {
        const difference = u[neighbours[k]] - record[neighbours[k]] - centre;
        gx += cx[k] * difference;
        gz += cz[k] * difference;
      }
      this.gradientX[i] = gx;
      this.gradientZ[i] = gz;
    }
  }

  /**
   * Steps the surface to a settled harmonic and then takes the record from it.
   *
   * The operator is inert throughout — there is nothing to enforce against
   * until the record exists — so warm-up is the one stretch of the run in which
   * the surface is genuinely unsupervised.
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
    this.computeGradients();
    onProgress?.(1);
  }

  /**
   * Largest |u − u*| anywhere. Reported so the ambient harmonic can be checked
   * against the engagement threshold rather than assumed to sit under it.
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
   * Run checksum over the surface and the enforcement together. Two runs from
   * the same seed and the same injection trace agree here or the determinism
   * claim is false.
   */
  checksum(): number {
    const checksum = new Checksum();
    const { u } = this.simulation;
    for (let i = 0; i < u.length; i++) checksum.mixSigned(u[i], 2);
    this.operator.mixInto(checksum);
    return checksum.value;
  }
}
