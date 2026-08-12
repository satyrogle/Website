/**
 * AmbientHarmonic — the calm, and the drift the system cannot see.
 *
 * The opening frame is not still. A faint standing harmonic runs through the
 * structure the whole time, driven from a seeded handful of anchor nodes at
 * three incommensurate low frequencies so the pattern never repeats inside a
 * visit and never resolves into a beat.
 *
 * Its amplitude is deliberately held under the record's tolerance ε. That makes
 * it invisible to the correction operator forever: the system's sensor only
 * fires on violations past θ_on sustained past T_hold, so this movement is
 * error the file tolerates because it never notices it. The calm the visitor
 * opens on is not an absence of deviation. It is deviation under the threshold.
 *
 * Forcing is a pure function of the tick index, so it replays exactly.
 */

export interface AmbientParameters {
  seed: number;
  /** Nodes the harmonic is driven from. */
  anchors: number;
  /** Acceleration applied per second at each anchor. */
  amplitude: number;
  /** Base frequencies in Hz. Kept incommensurate. */
  frequencies: [number, number, number];
}

export const DEFAULT_AMBIENT: AmbientParameters = {
  seed: 0x0ca1_9a11,
  anchors: 15,
  // Tuned so the resulting standing amplitude settles under ε = 0.04, which is
  // what keeps the opening frame at zero violet. Verified in
  // tools/correction-validate.mjs, which fails the run if it drifts over.
  amplitude: 0.42,
  frequencies: [0.071, 0.113, 0.187],
};

export class AmbientHarmonic {
  private readonly anchorNodes: Int32Array;
  private readonly phases: Float32Array;
  private readonly gains: Float32Array;
  private readonly parameters: AmbientParameters;

  constructor(nodeCount: number, parameters: AmbientParameters) {
    this.parameters = parameters;

    // Local RNG: the anchors and phases have to be identical everywhere, and
    // they must not consume from the graph synthesiser's stream.
    let a = parameters.seed >>> 0;
    const random = (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    this.anchorNodes = new Int32Array(parameters.anchors);
    this.phases = new Float32Array(parameters.anchors * 3);
    this.gains = new Float32Array(parameters.anchors * 3);

    for (let i = 0; i < parameters.anchors; i++) {
      this.anchorNodes[i] = Math.floor(random() * nodeCount) % nodeCount;
      for (let h = 0; h < 3; h++) {
        this.phases[i * 3 + h] = random() * Math.PI * 2;
        // Signed gains, so anchors pull against each other and the result is a
        // standing pattern rather than the whole veil breathing in unison.
        this.gains[i * 3 + h] = (random() * 2 - 1) * (1 - h * 0.28);
      }
    }
  }

  /** Adds this tick's forcing to velocity. Pure function of `tick`. */
  drive(velocity: Float32Array, tick: number, dt: number): void {
    const { amplitude, frequencies } = this.parameters;
    const seconds = tick * dt;
    const scale = amplitude * dt;

    for (let i = 0; i < this.anchorNodes.length; i++) {
      const node = this.anchorNodes[i];
      let sum = 0;
      for (let h = 0; h < 3; h++) {
        sum +=
          this.gains[i * 3 + h] *
          Math.sin(seconds * frequencies[h] * Math.PI * 2 + this.phases[i * 3 + h]);
      }
      velocity[node] += sum * scale;
    }
  }
}
