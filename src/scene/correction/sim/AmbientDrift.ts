/**
 * AmbientDrift — the calm, and the movement the system cannot see.
 *
 * The opening frame is not still. A faint standing pattern runs through the
 * whole choir the entire time, and its amplitude is held under the record's
 * tolerance ε. That makes it invisible to the correction operator forever: the
 * sensor only fires on violations past θ_on sustained past T_hold, so this is
 * error the file tolerates because it never notices it.
 *
 * The calm the visitor opens on is not an absence of deviation. It is deviation
 * under the threshold — which is the site's argument in one mechanism, running
 * before anyone has touched anything.
 *
 * It is a standing pattern rather than per-blade noise: a *mode shape*, with
 * every blade forced by a smooth spatial function so the field breathes
 * together with fixed nodes and antinodes. Independent per-blade wander was
 * tried in the band era and was wrong twice over — it read as static, because
 * a coupled field smooths incoherent forcing away almost immediately, and it
 * read as disorder, because blades moving independently are exactly what the
 * law is supposed to prevent.
 *
 * Forcing is a pure function of the tick index, so it replays exactly.
 */

import { mulberry32 } from '../graph/random';

export interface AmbientParameters {
  seed: number;
  /** Superposed standing modes. */
  modes: number;
  /** Forcing per second at unit mode weight. */
  amplitude: number;
  /**
   * Temporal frequency per mode, Hz. Incommensurate, so the superposition
   * never repeats inside a visit — and kept above about a quarter of a hertz,
   * because at lower frequencies a mode barely completes a cycle in the time
   * anyone looks at the frame and nearly all of its movement is one-way drift
   * away from the record, spending the tolerance budget without buying any
   * visible breathing.
   */
  frequencies: [number, number, number];
  /** Spatial frequency of the coarsest mode, radians per world unit. */
  spatialFrequency: number;
}

export const DEFAULT_AMBIENT: AmbientParameters = {
  seed: 0x0ca1_9a11,
  modes: 3,
  /**
   * Sized against the sensor, not by eye.
   *
   * Steady-state amplitude is roughly `amplitude / γ`, so 0.055 against γ = 2.2
   * settles at |u| ≈ 0.025. Engagement needs ε + θ_on = 0.18 sustained for
   * T_hold, which is seven times the margin the sensor needs — and at the
   * renderer's angular gain it is under a degree of swing per blade, which is
   * the held breath the opening is supposed to be rather than sway.
   *
   * Both halves are asserted in tools/correction-validate.mjs: never engages,
   * and never static.
   */
  amplitude: 0.055,
  frequencies: [0.29, 0.43, 0.71],
  spatialFrequency: 0.26,
};

export class AmbientDrift {
  private readonly parameters: AmbientParameters;
  /** Mode weight per node, laid out mode-major. */
  private readonly weights: Float32Array;
  private readonly phases: Float32Array;

  constructor(positions: Float32Array, parameters: AmbientParameters) {
    this.parameters = parameters;
    const nodeCount = positions.length / 3;

    // Its own stream: the mode shapes have to be identical in the browser, the
    // Worker and node, and must not consume from the synthesiser's sequence.
    const random = mulberry32(parameters.seed);

    this.weights = new Float32Array(parameters.modes * nodeCount);
    this.phases = new Float32Array(parameters.modes);

    for (let m = 0; m < parameters.modes; m++) {
      this.phases[m] = random() * Math.PI * 2;

      // Each mode is a product of two travelling directions — a standing
      // pattern with fixed nodes and antinodes. Directions are seeded and the
      // wavelength shortens with each mode, so the superposition has structure
      // at more than one scale without any of them being aligned to an axis.
      const scale = parameters.spatialFrequency * (1 + m * 0.85);
      const ax = (random() * 2 - 1) * scale;
      const az = (random() * 2 - 1) * scale;
      const bx = (random() * 2 - 1) * scale;
      const bz = (random() * 2 - 1) * scale;
      const ay = (random() * 2 - 1) * scale * 2.4;
      const pa = random() * Math.PI * 2;
      const pb = random() * Math.PI * 2;

      for (let i = 0; i < nodeCount; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        this.weights[m * nodeCount + i] =
          Math.sin(x * ax + z * az + y * ay + pa) * Math.cos(x * bx + z * bz + pb);
      }
    }
  }

  /** Adds this tick's forcing. Pure function of `tick`. */
  drive(forcing: Float32Array, tick: number, dt: number): void {
    const { amplitude, frequencies, modes } = this.parameters;
    const nodeCount = forcing.length;
    const seconds = tick * dt;
    const scale = amplitude * dt;

    for (let m = 0; m < modes; m++) {
      const swing = Math.sin(seconds * frequencies[m] * Math.PI * 2 + this.phases[m]) * scale;
      const base = m * nodeCount;
      for (let i = 0; i < nodeCount; i++) forcing[i] += this.weights[base + i] * swing;
    }
  }
}
