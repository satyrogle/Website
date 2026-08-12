/**
 * AmbientHarmonic — the calm, and the drift the system cannot see.
 *
 * The opening frame is not still. A faint standing harmonic runs through the
 * whole structure the entire time, and its amplitude is deliberately held under
 * the record's tolerance ε. That makes it invisible to the correction operator
 * forever: the system's sensor only fires on violations past θ_on sustained
 * past T_hold, so this movement is error the file tolerates because it never
 * notices it. The calm the visitor opens on is not an absence of deviation. It
 * is deviation under the threshold.
 *
 * It is a standing wave, which means a *mode shape* — every node forced by a
 * smooth spatial pattern, moving together, with the pattern's nodes and
 * antinodes fixed in space. It was first written as a handful of seeded point
 * anchors, which was wrong and measurably so: with damping, a point source
 * moves its immediate neighbourhood and nothing else, so the median filament
 * travelled about one pixel over ten seconds and the structure read as a still
 * image. Three superposed modes at incommensurate frequencies give the whole
 * veil a slow undulation that never repeats inside a visit.
 *
 * Forcing is a pure function of the tick index, so it replays exactly.
 */

export interface AmbientParameters {
  seed: number;
  /** Superposed standing modes. */
  modes: number;
  /** Acceleration applied per second at unit mode weight. */
  amplitude: number;
  /**
   * Temporal frequency per mode, Hz. Kept incommensurate, and kept above about
   * a quarter of a hertz: at the 0.07–0.19 Hz this started with, a mode barely
   * completed a cycle inside the time anyone looks at the frame, so nearly all
   * of the movement was slow one-way drift away from the record. That costs the
   * tolerance budget without buying any visible breathing.
   */
  frequencies: [number, number, number];
  /**
   * Spatial frequency of the coarsest mode, radians per world unit.
   *
   * The surface is read by its shading, and shading responds to slope, which is
   * amplitude over wavelength. A long-wavelength heave moves the geometry a
   * long way and changes the light not at all — which is how the first version
   * of this managed to be both over budget on tolerance and invisible.
   */
  spatialFrequency: number;
}

export const DEFAULT_AMBIENT: AmbientParameters = {
  seed: 0x0ca1_9a11,
  modes: 3,
  // Tuned so the steady-state peak |u − u*| settles well under the engagement
  // threshold ε + θ_on = 0.10, while a typical filament still travels several
  // pixels on screen. Both halves are asserted in
  // tools/correction-validate.mjs — never engages, and never static.
  amplitude: 0.09,
  frequencies: [0.29, 0.43, 0.71],
  spatialFrequency: 1.35,
};

export class AmbientHarmonic {
  private readonly parameters: AmbientParameters;
  /** Mode weight per node, laid out mode-major. */
  private readonly weights: Float32Array;
  private readonly phases: Float32Array;

  constructor(positions: Float32Array, parameters: AmbientParameters) {
    this.parameters = parameters;
    const nodeCount = positions.length / 3;

    // Local RNG: the mode shapes have to be identical in the browser, the
    // Worker and node, and they must not consume from the graph synthesiser's
    // stream.
    let a = parameters.seed >>> 0;
    const random = (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    this.weights = new Float32Array(parameters.modes * nodeCount);
    this.phases = new Float32Array(parameters.modes);

    for (let m = 0; m < parameters.modes; m++) {
      this.phases[m] = random() * Math.PI * 2;

      // Each mode is a product of two travelling directions — a standing
      // pattern across the veil with fixed nodes and antinodes. Directions are
      // seeded and the wavelength shortens with each mode, so the superposition
      // has structure at more than one scale without any of them being aligned
      // to an axis.
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

  /** Adds this tick's forcing to velocity. Pure function of `tick`. */
  drive(velocity: Float32Array, tick: number, dt: number): void {
    const { amplitude, frequencies, modes } = this.parameters;
    const nodeCount = velocity.length;
    const seconds = tick * dt;
    const scale = amplitude * dt;

    for (let m = 0; m < modes; m++) {
      const swing = Math.sin(seconds * frequencies[m] * Math.PI * 2 + this.phases[m]) * scale;
      const base = m * nodeCount;
      for (let i = 0; i < nodeCount; i++) velocity[i] += this.weights[base + i] * swing;
    }
  }
}
