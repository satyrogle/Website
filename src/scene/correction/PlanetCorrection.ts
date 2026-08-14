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
 * system waits longer before admitting the violation, strains against it for
 * over half a second, and then removes the error across a couple of seconds.
 * P1 puts the whole beat — press to visibly reseated — between 2.5 and 4.5
 * seconds; at the previous ramp (20 ticks, stiffnessTo 0.0085) the event
 * finished in 1.85 s, a blink the eye files as a bounce rather than a grip.
 */
export const PLANET_CORRECTION: CorrectionParameters = {
  ...DEFAULT_CORRECTION,
  /** ~0.8 s at 120 Hz before the system concedes the piece has moved. */
  holdTicks: 96,
  stiffnessFrom: 0.0009,
  stiffnessTo: 0.0036,
  /** ~0.6 s of visible resistance before the pull wins. */
  rampTicks: 72,
  stiffnessCeiling: 0.02,
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

/**
 * What a press has to be worth, in pixels, on the piece it struck.
 *
 * Deviation was previously sized in world units and the result was measured
 * at thirteen pixels on a piece two hundred and forty across — five percent,
 * a change the eye does not register as an event at all. Energy is therefore
 * solved backwards from screen space at press time: whatever `u` it takes to
 * move this piece, at this camera distance, this far.
 */
const PRESS_TARGET_PX = 165;
const PRESS_TARGET_SHARE_OF_PIECE = 0.30;

/**
 * How long the escape takes.
 *
 * A press used to add its whole deviation in one tick, and a teleport of any
 * size is invisible — the eye catches motion, not displacement. Easing the
 * same distance over a third of a second costs nothing and is the difference
 * between a piece that moved and a piece that is somewhere slightly
 * different. Well inside the operator's hold, so nothing fights it.
 */
const ESCAPE_MS = 380;

/** How a press spreads to what is near it: the region yields, then converges. */
const SPREAD = [0.22, 0.13, 0.07];

/** Idle seconds before the system acts and files it under the visitor. */
const FALSE_FIRST_ACTION_DELAY = 8;

/**
 * Below this, a piece is seated exactly.
 *
 * The operator is asymptotic — it pulls a piece to the EDGE of the record's
 * tolerance band rather than to the seat itself — so a sliver of offset
 * always survives. On a staged composition that sliver is permanent drift
 * away from the authored frame, which is the thing this whole approach exists
 * to preserve. The path is the operator's; the endpoint is this.
 *
 * It used to also require the operator to have let go, and that coupled the
 * reseat to the wrong clock. Release waits on the sensed envelope decaying
 * below the release threshold, and that decay starts from the deviation's
 * peak and runs at the sensor's own time constant — so a bigger press meant a
 * longer wait for the piece to sit down, with the event running to 4.8 s
 * while raising stiffness by a quarter changed it by five milliseconds.
 *
 * The two are separate facts. "Inside the record's tolerance" is about where
 * the piece is; "still engaged" is about whether the system is still
 * watching, and it should keep holding — and keep showing violet — for as
 * long as its sensor says so. Reseating no longer waits on it.
 */
const SETTLE_EPSILON = 0.06;

export class PlanetCorrection {
  readonly operator: CorrectionOperator;

  private readonly u: Float32Array;
  private readonly rate: Float32Array;
  private readonly neighbours: number[][] = [];

  private accumulator = 0;
  private tick = 0;
  private idle = 0;

  /** In-flight escapes: the piece is still leaving, the system not yet involved. */
  private escapes: { index: number; from: number; to: number; t: number }[] = [];

  /** Adjustments the system caused, which the record will still call yours. */
  systemAdjustments = 0;
  private touched = false;
  private falseActionFired = false;
  private falseActionArmed = false;

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

  /**
   * The false first action stays holstered until the visitor has entered the
   * system. It used to fire eight seconds into the untouched opening frame,
   * and with no context in which a moving piece could mean enforcement, it
   * read as the composition breaking — "the planet is off", verbatim. A
   * one-way latch driven by scroll: the lie still happens, but only once
   * there is a system for it to happen inside.
   */
  armFalseAction(): void {
    this.falseActionArmed = true;
  }

  /**
   * A press. Returns the piece that took it, or -1.
   *
   * `energy` is normally solved from screen space by `injectAt`; the raw form
   * stays for scripted events that already know what they want.
   */
  inject(index: number, energy = PRESS_ENERGY): number {
    if (index < 0 || index >= this.u.length) return -1;
    this.touched = true;
    this.idle = 0;
    this.beginEscape(index, energy);
    this.neighbours[index]?.forEach((target, rank) => {
      this.beginEscape(target, energy * SPREAD[rank]);
    });
    return index;
  }

  /**
   * A press, sized so the visitor can see it.
   *
   * Solves the deviation backwards from how many pixels this piece moves per
   * unit of `u` at the current camera pose, so a near slab and a distant
   * chunk both produce an event of comparable weight on screen. Deterministic
   * for a given camera pose and input trace.
   */
  injectAt(
    index: number,
    camera: import('three').Camera,
    width: number,
    height: number,
    piecePx: number
  ): number {
    const wanted = Math.max(PRESS_TARGET_PX, piecePx * PRESS_TARGET_SHARE_OF_PIECE);
    const perUnit = this.planet.pixelsPerDeviation(index, camera, width, height);
    if (perUnit <= 1) return this.inject(index, PRESS_ENERGY);

    // Fixed point, three passes. Each estimate lands further out than the
    // one it was measured at, and pixels-per-unit keeps falling with
    // distance, so a single correction still undershoots — it went 165 asked,
    // 126 delivered. Three passes converge inside a few percent and cost
    // three projections. Deterministic for a given camera pose.
    let energy = wanted / perUnit;
    for (let pass = 0; pass < 3; pass++) {
      const at = this.planet.pixelsPerDeviation(index, camera, width, height, energy);
      if (at <= 1) break;
      energy = wanted / at;
    }
    return this.inject(index, Math.min(energy, 8));
  }

  /** The piece starts leaving. It arrives under its own easing, not instantly. */
  private beginEscape(index: number, energy: number): void {
    const existing = this.escapes.find((e) => e.index === index);
    const from = this.u[index];
    const to = (existing ? existing.to : from) + energy;
    if (existing) {
      existing.from = from;
      existing.to = to;
      existing.t = 0;
      return;
    }
    this.escapes.push({ index, from, to, t: 0 });
  }

  /** Fixed-step advance. Same input trace, same run, any frame rate. */
  update(deltaSeconds: number): void {
    this.accumulator += Math.min(deltaSeconds, 0.25);
    let steps = 0;
    while (this.accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= STEP_SECONDS;
      this.tick++;
      steps++;

      // The escape runs first and owns `u` while it lasts. The operator's
      // hold latency is longer than the escape, so the two never contend:
      // the piece leaves, and only then is it noticed.
      if (this.escapes.length) {
        const step = (STEP_SECONDS * 1000) / ESCAPE_MS;
        this.escapes = this.escapes.filter((escape) => {
          escape.t = Math.min(escape.t + step, 1);
          const eased = 1 - Math.pow(1 - escape.t, 3);
          this.u[escape.index] = escape.from + (escape.to - escape.from) * eased;
          return escape.t < 1;
        });
      }

      this.operator.apply(this.u, this.rate, this.tick);

      for (let i = 0; i < this.u.length; i++) {
        if (this.u[i] === 0 || Math.abs(this.u[i]) >= SETTLE_EPSILON) continue;
        // A piece on its way out is not a piece that has arrived. The escape
        // writes `u` directly and passes through small values on its way to
        // large ones, so without this the snap would zero every press in its
        // first few ticks and no deviation could ever leave the seat.
        if (this.escapes.some((escape) => escape.index === i)) continue;
        this.u[i] = 0;
        this.rate[i] = 0;
      }
    }

    if (this.falseActionArmed && !this.touched && !this.falseActionFired) {
      this.idle += deltaSeconds;
      if (this.idle >= FALSE_FIRST_ACTION_DELAY) this.fireFalseFirstAction();
    }

    const { engaged, contact } = this.operator;
    for (let i = 0; i < this.u.length; i++) {
      this.planet.setDeviation(i, this.u[i], engaged[i] ? Math.min(1, 0.35 + contact[i] * 3) : 0);
    }
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

  /**
   * A scripted escape, staged so the enforcement gradient can be watched
   * rather than merely obeyed.
   *
   * The gradient is real — the gain field holds the near slabs hardest and
   * lets the far field drift — but a visitor only ever sees it if something
   * escapes at both ends of it. Same energy, two distances: out in the field
   * the system engages and takes a long time to win, near the body the same
   * escape is over almost before it is seen.
   *
   * Counted as the system's own. The record will still call these the
   * visitor's, which is the canon — but the truth has to stay recoverable
   * somewhere, and that somewhere is this counter.
   */
  demonstrate(index: number, energy: number): void {
    const before = this.operator.adjustments;
    // A demonstration is not the visitor acting, so it must not cancel the
    // false first action or reset the idle clock.
    const wasTouched = this.touched;
    this.inject(index, energy);
    this.touched = wasTouched;
    // The operator has not engaged yet — it waits out the hold first — so the
    // difference reads zero here and the floor is what actually lands.
    this.systemAdjustments += Math.max(this.operator.adjustments - before, 1);
  }

  /** How far one piece currently sits from its recorded seat. */
  deviationOf(index: number): number {
    return this.u[index] ?? 0;
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
