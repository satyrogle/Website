import {
  CorrectionOperator,
  DEFAULT_CORRECTION,
  type CorrectionParameters,
} from './sim/CorrectionOperator';
import type { PlanetModel } from './PlanetModel';

/**
 * PlanetCorrection — the catastrophe is not happening. It is being held.
 *
 * The wounded world and its debris are staged, not simulated: every slab and
 * chunk sits at an authored position, mid-flight, and has sat there since the
 * frame was signed off. That composition is the record. What this adds is the
 * reason it has not moved.
 *
 * Press a piece and it continues the flight it was already on — the only
 * direction it was ever going. The system tolerates that for a beat, notices,
 * strains, and returns it to the exact position it was authored at. The
 * explosion is not allowed to finish.
 *
 * WHY THIS AND NOT A NEW OBJECT. Eleven carriers were built to give the
 * correction something to act on, and all eleven were rejected on sight. The
 * frame that was approved already exists; what it was missing was a reason to
 * be looked at twice. Nothing here changes a vertex, a light or a material. At
 * rest — `deviation` zero on every piece — the render is bit-identical to the
 * approved composition, because `PlanetModel.place` writes the authored
 * position back exactly.
 *
 * ONE SCALAR PER PIECE. A piece escapes along its own `drift` and nothing
 * else, which makes the deviation genuinely one-dimensional and lets the
 * existing `CorrectionOperator` drive it unchanged. Hold latency, the
 * stiffness ramp, hysteresis, the decaying bruise over a monotonic scar and
 * the adjustments count are all already in that class, tuned and checksummed.
 * None of it is reimplemented here.
 */

/**
 * Slower and later than the defaults, which were tuned for blades.
 *
 * A continent-scale slab that flicks back into line reads as a mechanism
 * resetting. It has to read as something massive being overruled, so the
 * system waits longer before admitting the violation and then removes the
 * error over roughly a second rather than a frame.
 */
export const PLANET_CORRECTION: CorrectionParameters = {
  ...DEFAULT_CORRECTION,
  /** ~0.8 s at 120 Hz before the system concedes the piece has moved. */
  holdTicks: 96,
  stiffnessFrom: 0.0008,
  stiffnessTo: 0.022,
  stiffnessCeiling: 0.045,
};

/** The operator's constants are written against this rate. Do not vary it. */
const STEP_HZ = 120;
const STEP_SECONDS = 1 / STEP_HZ;

/** Never advance more than this per frame, so a stalled tab cannot avalanche. */
const MAX_STEPS_PER_FRAME = 8;

/**
 * Deviation injected by one press, in drift lengths.
 *
 * A slab's drift is sized from how far it has already flown, so this is a
 * fraction of a journey the piece has already made — which keeps a near chunk
 * and a far slab both moving a legible amount without either leaving frame.
 */
export const PRESS_ENERGY = 0.9;

/** How a press spreads to what is near it: the region yields, then converges. */
const SPREAD = [0.22, 0.13, 0.07];

/** Idle seconds before the system acts and files it under the visitor. */
const FALSE_FIRST_ACTION_DELAY = 8;

/**
 * Below this, and once the system has let go, a piece is seated exactly.
 *
 * The operator is asymptotic and its release hysteresis disengages while a
 * sliver of offset survives. On a staged composition that sliver is permanent
 * drift away from the authored frame — the thing this whole approach exists
 * to preserve. The path is the operator's; the endpoint is this.
 */
const SETTLE_EPSILON = 0.004;

export class PlanetCorrection {
  readonly operator: CorrectionOperator;

  private readonly u: Float32Array;
  private readonly rate: Float32Array;
  private readonly neighbours: number[][] = [];

  private accumulator = 0;
  private tick = 0;
  private idle = 0;

  /** Adjustments the system caused, which the record will still call yours. */
  systemAdjustments = 0;
  private touched = false;
  private falseActionFired = false;

  constructor(private readonly planet: PlanetModel) {
    const pieces = planet.pressable;
    this.operator = new CorrectionOperator(pieces.length, PLANET_CORRECTION);
    this.u = new Float32Array(pieces.length);
    this.rate = new Float32Array(pieces.length);

    // u* is the authored composition. Zero deviation everywhere.
    this.operator.captureRecord(new Float32Array(pieces.length));

    // Enforcement is not uniform: the big near slabs are held hardest,
    // because they carry the silhouette. Small debris far down the field is
    // barely policed, which is what makes the far end read as a system
    // running out of authority rather than as a different art direction.
    const field = new Float32Array(pieces.length);
    const furthest = Math.max(...pieces.map((p) => p.home.length()), 1e-6);
    pieces.forEach((piece, index) => {
      const reach = piece.home.length() / furthest;
      field[index] = (piece.kind === 'slab' ? 1.0 : 0.62) * (1.05 - 0.55 * reach);
    });
    this.operator.setGainField(field);

    // Adjacency by proximity. The staged composition has no partition to read
    // one off, and it does not need a precise graph — only that a press
    // disturbs its own locality rather than the whole field at once.
    pieces.forEach((piece, index) => {
      const near = pieces
        .map((other, j) => ({ j, d: piece.home.distanceTo(other.home) }))
        .filter((entry) => entry.j !== index)
        .sort((a, b) => a.d - b.d)
        .slice(0, SPREAD.length)
        .map((entry) => entry.j);
      this.neighbours[index] = near;
    });
  }

  /** Narrative gain, driven by scroll. */
  setGain(value: number): void {
    this.operator.setGain(value);
  }

  /** A press. Returns the piece that took it, or -1. */
  inject(index: number, energy = PRESS_ENERGY): number {
    if (index < 0 || index >= this.u.length) return -1;
    this.touched = true;
    this.idle = 0;
    this.u[index] += energy;
    this.neighbours[index]?.forEach((target, rank) => {
      this.u[target] += energy * SPREAD[rank];
    });
    return index;
  }

  /** Fixed-step advance. Same input trace, same run, any frame rate. */
  update(deltaSeconds: number): void {
    this.accumulator += Math.min(deltaSeconds, 0.25);
    let steps = 0;
    while (this.accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= STEP_SECONDS;
      this.tick++;
      steps++;
      this.operator.apply(this.u, this.rate, this.tick);

      const { engaged } = this.operator;
      for (let i = 0; i < this.u.length; i++) {
        if (!engaged[i] && this.u[i] !== 0 && Math.abs(this.u[i]) < SETTLE_EPSILON) {
          this.u[i] = 0;
          this.rate[i] = 0;
        }
      }
    }

    if (!this.touched && !this.falseActionFired) {
      this.idle += deltaSeconds;
      if (this.idle >= FALSE_FIRST_ACTION_DELAY) this.fireFalseFirstAction();
    }

    for (let i = 0; i < this.u.length; i++) this.planet.setDeviation(i, this.u[i]);
  }

  /**
   * After eight seconds of nothing the system moves a piece itself, corrects
   * it, and the record's first entry is a visitor who never acted. Counted
   * separately so the truth stays recoverable even though the record will not
   * tell it.
   */
  private fireFalseFirstAction(): void {
    this.falseActionFired = true;
    const before = this.operator.adjustments;
    // The nearest slab: the lie has to be about something the visitor would
    // have seen move, or it is not a lie they can ever catch.
    const pieces = this.planet.pressable;
    let index = 0;
    let nearest = Infinity;
    pieces.forEach((piece, i) => {
      const d = piece.home.length();
      if (piece.kind === 'slab' && d < nearest) {
        nearest = d;
        index = i;
      }
    });
    this.inject(index, PRESS_ENERGY * 0.75);
    this.touched = false;
    this.systemAdjustments += Math.max(this.operator.adjustments - before, 1);
  }

  /** N, for the floor panel. */
  get adjustments(): number {
    return this.operator.adjustments;
  }

  get residual(): number {
    return this.operator.visibleResidual();
  }

  get engaged(): number {
    return this.operator.engagedCount();
  }
}
