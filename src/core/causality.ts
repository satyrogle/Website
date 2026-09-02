import { SECTIONS, TICKS, HINGE, BLADE } from './Delta';
import type { Sequence, DeltaField, Detent, Families } from './Delta';

/**
 * THE CAUSAL READING. Derived from the kernel; it decides nothing.
 *
 * Delta.ts answers "how far apart are the two futures". That is a
 * question about MAGNITUDE, and it is the one the geometry currently
 * reads. This file asks the other question:
 *
 *   WHERE DID THE CONSEQUENCE ACTUALLY GO, AND WHAT DID IT CHANGE?
 *
 * The distinction is not academic. A section whose offset differs by
 * 2e-9 is "diverged" by the epsilon test and invisible in every frame
 * that will ever be rendered. A section that crossed its threshold in
 * one future and not the other is a different EVENT - the world
 * genuinely happened differently there. THE_DELTA section 6 wants the
 * second thing and the kernel currently measures the first, so the
 * numbers that sound impressive ("24 derived sections") and the numbers
 * that would be visible ("7") are not the same number.
 *
 * Nothing here is authored. Every value is read back out of the two
 * computed futures, which is the same rule the rest of the project
 * runs on: a consequence that was arranged is not a consequence.
 *
 * Pure, headless, no Three.js, no DOM, no Math.random. Import it from a
 * renderer or from a verify script; both observe, neither owns.
 */

/**
 * Below this fraction of the widest gap, a difference is not a thing
 * the visitor can see - it is float residue with a section index.
 *
 * The same 1% that tools/delta-verify.mjs settled on when it stopped
 * counting everything above 1e-9 and started counting walls that will
 * really stand apart. Kept identical on purpose: two files disagreeing
 * about what "visible" means is how a claim quietly stops being true.
 */
export const VISIBLE_FRACTION = 0.01;

/** How one section's yield event differs between the two futures. */
export interface EventChange {
  section: number;
  /** tick this section yielded in the baseline, or -1 if it never did */
  baseTick: number;
  /** tick it yielded in the altered future, or -1 */
  alteredTick: number;
  /**
   * What kind of change this is. A `flip` is the strong form: the
   * section yields in one future and never in the other, so the two
   * worlds contain a different set of events, not the same events at
   * different times. `shift` is the weak form. `forced` is the blade
   * itself, which the intervention sets directly - never evidence of
   * anything, and excluded from every derived count below.
   */
  kind: 'flip-on' | 'flip-off' | 'shift' | 'forced';
  /** alteredTick - baseTick, for a shift. 0 for a flip. */
  shift: number;
}

export interface Causality {
  detent: Detent;

  /** first tick each section yielded, per future. -1 means it never did. */
  yieldBase: number[];
  yieldAltered: number[];

  /** every section whose yield event differs, blade included and marked */
  events: EventChange[];
  /** sections that yielded ONLY because of the intervention */
  flippedOn: number[];
  /** sections the intervention PREVENTED from ever yielding */
  flippedOff: number[];
  /** sections that still yielded, but at a different tick. Blade excluded. */
  shifted: number[];

  /**
   * Sections whose final gap is big enough to see, sorted by index.
   * This is Z's real width: the walls that actually stand apart.
   */
  visible: number[];
  /** how many sections the consequence visibly spans, end to end */
  visibleSpan: number;
  /** the section carrying the widest final gap, blade included */
  peakSection: number;
  /** how many sections diverge at all, visible or not - the flattering number */
  divergedCount: number;

  /**
   * Per-section falloff along the visible run: gap[i] / gap[i-1].
   * A consequence that travels has ratios near 1. A consequence that
   * dies locally halves every section, and these read ~0.2-0.5.
   */
  decay: number[];
  /** geometric mean of `decay` - one number for "does it travel?" */
  decayMean: number;

  /**
   * First tick each section's gap became visible; -1 if it never did.
   * The propagation wavefront - how fast the consequence walks the stack.
   */
  front: number[];
  /**
   * Sections that became visible at some tick and are NOT visible at
   * the end: the consequence arrived there and then left. Their
   * existence is why there is no single "wavefront" to time.
   */
  retreated: number[];
  /**
   * Whether arrival ticks increase with distance from the blade. False
   * means the difference does not propagate outward in order - it
   * sloshes, and any "speed" quoted for it is a fiction.
   */
  frontMonotone: boolean;
  /** ticks between the first arrival and the last */
  spreadTicks: number;
  /** arrived sections per tick of spread. Only meaningful if monotone. */
  frontSpeed: number;

  /**
   * The section carrying the most difference, EXCLUDING the blade -
   * the honest causal path. `DeltaField.dominant` includes the blade
   * and therefore spends most of the run pointing at the visitor's own
   * hand rather than at a consequence of it.
   */
  dominantDerived: number[];

  /** the cause: the blade's own offset change at the hinge, read back */
  cause: number;
  /** the largest derived gap anywhere, ever, blade excluded */
  effect: number;
  /** effect / cause. Above 1 means the stack amplified the intervention. */
  amplification: number;
}

/** First tick each section yielded in this future. -1 if it never does. */
export function yieldTicks(seq: Sequence): number[] {
  const out = new Array<number>(SECTIONS).fill(-1);
  for (let t = 0; t < TICKS; t++) {
    const f = seq.frames[t]!;
    for (let i = 0; i < SECTIONS; i++) {
      if (out[i]! < 0 && f[i]!.yielded) out[i] = t;
    }
  }
  return out;
}

/**
 * Read the causal structure of one intervention.
 *
 * Takes the two futures AND the delta field that was computed from
 * them; it does not recompute anything, so it cannot disagree with the
 * kernel about what happened.
 */
export function readCausality(
  baseline: Sequence,
  altered: Sequence,
  delta: DeltaField
): Causality {
  const yieldBase = yieldTicks(baseline);
  const yieldAltered = yieldTicks(altered);

  const events: EventChange[] = [];
  const flippedOn: number[] = [];
  const flippedOff: number[] = [];
  const shifted: number[] = [];

  for (let i = 0; i < SECTIONS; i++) {
    const b = yieldBase[i]!;
    const a = yieldAltered[i]!;
    if (a === b) continue;
    if (i === BLADE) {
      // the intervention sets this one directly. It is the cause, so
      // counting it as a consequence would be the project's oldest
      // mistake wearing a new hat.
      events.push({ section: i, baseTick: b, alteredTick: a, kind: 'forced', shift: a - b });
      continue;
    }
    if (b < 0 && a >= 0) {
      events.push({ section: i, baseTick: b, alteredTick: a, kind: 'flip-on', shift: 0 });
      flippedOn.push(i);
    } else if (b >= 0 && a < 0) {
      events.push({ section: i, baseTick: b, alteredTick: a, kind: 'flip-off', shift: 0 });
      flippedOff.push(i);
    } else {
      events.push({ section: i, baseTick: b, alteredTick: a, kind: 'shift', shift: a - b });
      shifted.push(i);
    }
  }

  // ---- reach, measured on the final frame ----

  const finalFrame = delta.frames[TICKS - 1]!;
  const finalGap = finalFrame.gap;
  const widest = Math.max(...finalGap);
  const floor = widest * VISIBLE_FRACTION;
  const visible: number[] = [];
  // NEUTRAL OPENS NOTHING, AND MUST REPORT NOTHING. With widest === 0
  // the floor is 0 too, and `gap >= floor` is true for all 48 sections:
  // a future identical to the baseline would report itself as maximally
  // visible. The zero case is excluded explicitly rather than relying
  // on a comparison that happens to be true.
  if (widest > 0) {
    for (let i = 0; i < SECTIONS; i++) {
      if (finalGap[i]! >= floor) visible.push(i);
    }
  }
  // taken from the kernel's own count rather than recomputed against a
  // second epsilon: two files disagreeing about what "diverged" means
  // is the same failure VISIBLE_FRACTION exists to avoid.
  const divergedCount = finalFrame.diverged;
  const visibleSpan =
    visible.length > 0 ? visible[visible.length - 1]! - visible[0]! + 1 : 0;

  // FALLOFF IS MEASURED OUTWARD FROM THE PEAK, NOT ALONG THE WHOLE RUN.
  // The visible run starts at the blade, whose own gap is small, so the
  // first ratio in the list was the 63x RISE from the blade to the
  // section that carries the consequence. Averaged in with the falloff
  // it cancelled it exactly: a field that visibly drops 100% -> 20% ->
  // 10% -> 2.5% reported a mean falloff of 1.005x, i.e. "it never
  // decays". The rise is the cause arriving; only what happens after
  // the peak is the consequence travelling.
  let peakSection = visible.length > 0 ? visible[0]! : 0;
  for (const i of visible) {
    if (finalGap[i]! > finalGap[peakSection]!) peakSection = i;
  }
  const decay: number[] = [];
  for (const i of visible) {
    if (i <= peakSection) continue;
    const prev = finalGap[i - 1]!;
    if (prev > 0) decay.push(finalGap[i]! / prev);
  }
  let decayMean = 0;
  if (decay.length > 0) {
    let logSum = 0;
    for (const r of decay) logSum += Math.log(Math.max(r, 1e-30));
    decayMean = Math.exp(logSum / decay.length);
  }

  // ---- the wavefront ----

  // THE FLOOR MUST NOT MOVE. Measuring each section against a fraction
  // of the peak AT THAT TICK is a moving goalpost: the blade dominates
  // the peak early, so a section could clear the bar, then stop
  // clearing it as the blade's own gap grew. That produced a "front"
  // that reached section 24 at tick 110 and section 19 at tick 206 -
  // arrival times with no causal order in them at all.
  //
  // One fixed absolute floor, taken from the final field, so the front
  // is a real propagation measurement: the tick each section's gap
  // first became something a visitor could see.
  const front = new Array<number>(SECTIONS).fill(-1);
  if (floor > 0) {
    for (let t = 0; t < TICKS; t++) {
      const f = delta.frames[t]!;
      for (let i = 0; i < SECTIONS; i++) {
        if (front[i]! < 0 && f.gap[i]! >= floor) front[i] = t;
      }
    }
  }
  // THE DIFFERENCE DOES NOT ONLY SPREAD - IT ALSO LEAVES. A section can
  // cross the visibility floor mid-run and be back under it by the end:
  // section 25 arrives at tick 81 and finishes invisible. So arrival
  // order is not distance order, and the first version of this quoted a
  // "wavefront speed" for something with no front. What is measured
  // instead is what is true: who arrived, who left again, and whether
  // the arrivals had any causal order at all.
  const retreated: number[] = [];
  for (let i = 0; i < SECTIONS; i++) {
    if (i === BLADE) continue;
    if (front[i]! >= 0 && !visible.includes(i)) retreated.push(i);
  }

  const arrived: Array<{ i: number; t: number }> = [];
  for (let i = 0; i < SECTIONS; i++) {
    if (i === BLADE || front[i]! < 0) continue;
    arrived.push({ i, t: front[i]! });
  }
  let frontMonotone = true;
  const byDistance = [...arrived].sort(
    (a, b) => Math.abs(a.i - BLADE) - Math.abs(b.i - BLADE)
  );
  for (let k = 1; k < byDistance.length; k++) {
    if (byDistance[k]!.t < byDistance[k - 1]!.t) {
      frontMonotone = false;
      break;
    }
  }
  let firstT = Infinity;
  let lastT = -Infinity;
  for (const a of arrived) {
    if (a.t < firstT) firstT = a.t;
    if (a.t > lastT) lastT = a.t;
  }
  const spreadTicks = arrived.length > 0 ? lastT - firstT : 0;
  const frontSpeed = spreadTicks > 0 ? arrived.length / spreadTicks : 0;

  // ---- the honest causal path ----

  const dominantDerived: number[] = [];
  for (let t = 0; t < TICKS; t++) {
    const g = delta.frames[t]!.gap;
    let best = -1;
    let bestVal = 0;
    for (let i = 0; i < SECTIONS; i++) {
      if (i === BLADE) continue;
      if (g[i]! > bestVal) {
        bestVal = g[i]!;
        best = i;
      }
    }
    dominantDerived.push(best);
  }

  // ---- amplification ----

  // the cause is READ BACK rather than taken from the kernel's private
  // detent constant: whatever the intervention actually did to the
  // blade at the hinge is the input, even if that constant changes.
  const cause = Math.abs(
    altered.frames[HINGE]![BLADE]!.offset - baseline.frames[HINGE]![BLADE]!.offset
  );
  let effect = 0;
  for (const f of delta.frames) {
    for (let i = 0; i < SECTIONS; i++) {
      if (i === BLADE) continue;
      if (f.gap[i]! > effect) effect = f.gap[i]!;
    }
  }

  return {
    detent: delta.detent,
    yieldBase,
    yieldAltered,
    events,
    flippedOn,
    flippedOff,
    shifted,
    visible,
    visibleSpan,
    peakSection,
    divergedCount,
    decay,
    decayMean,
    front,
    retreated,
    frontMonotone,
    spreadTicks,
    frontSpeed,
    dominantDerived,
    cause,
    effect,
    amplification: cause > 0 ? effect / cause : 0
  };
}

/** The causal reading for every detent that opens a gap at all. */
export function readAll(fam: Families): Map<Detent, Causality> {
  const out = new Map<Detent, Causality>();
  for (const [d, seq] of fam.altered) {
    const delta = fam.delta.get(d);
    if (!delta) continue;
    out.set(d, readCausality(fam.baseline, seq, delta));
  }
  return out;
}
