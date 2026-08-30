import { HINGE, TICKS, type Detent } from './Delta';

/**
 * THE JOURNEY STATE. docs/THE_DELTA.md sections 3 to 7.
 *
 * Maps scroll position onto which page the visitor is in and which tick of
 * the computed futures they are looking at. Headless on purpose: no
 * Three.js, no DOM, no camera, no materials. The Z keyframe has not passed
 * its gate (THE_DELTA section 8), so nothing here decides how any of it
 * LOOKS - only what is true at a given scroll position.
 *
 * That split is what makes this safe to build now. An approved frame will
 * change plate positions, camera and scale; it cannot change the fact that
 * X scrubs the run up to the hinge, that the blade is offered at the hinge,
 * or that Y runs the same kernel forward from it.
 *
 * THE ONE LAW: state is a pure function of (scroll, detent). No latches, no
 * eases, no smoothing, no time. Scroll backwards and every value retraces
 * exactly, which is asserted in tools/delta-verify.mjs rather than believed.
 *
 * The detent is the single exception to "function of scroll", and it is the
 * intended one: it is the visitor's one input, held like the seed. Changing
 * it re-derives everything downstream, because everything downstream is
 * computed from it rather than stored.
 */

/**
 * Beat boundaries in page scroll. PROVISIONAL - these are page-layout
 * numbers, not direction, and they will move once the Z frame exists and
 * the real dwell of each page is known. Nothing else in this file depends
 * on their exact values.
 *
 * The entrance ends where the built journey already puts it: the dive at
 * 0.31 and the crossing veil closing by 0.342.
 */
export const BEATS = {
  entranceEnd: 0.34,
  // X compressed 0.52 -> 0.46: at 18% of the page it was "a drag"
  // (Jacob, 2026-08-30) - the monolith earns a look, not a crawl
  xEnd: 0.46,
  tickZeroEnd: 0.51,
  yEnd: 0.78
} as const;

export type Phase = 'entrance' | 'x' | 'tickzero' | 'y' | 'z';

export interface JourneyState {
  phase: Phase;
  /** progress within the current phase, 0 to 1 */
  local: number;
  /**
   * Which tick of the computed sequences is on screen. X scrubs 0 to
   * HINGE, the hinge holds at HINGE, Y runs HINGE to the end, and Z stands
   * at the final state while the field unfolds around it.
   */
  tick: number;
  /** the blade accepts input only at Tick Zero */
  bladeLive: boolean;
  /**
   * How far scroll has carried the visitor into Z. This rises whatever the
   * blade is set to, so the threshold composition is always reachable and
   * the visitor is never blocked or told to go back.
   */
  unfoldRequested: number;
  /**
   * How far the delta field has ACTUALLY opened. Identical to
   * unfoldRequested when a difference exists, and exactly zero when it
   * does not - because there is nothing to open. This is the value the
   * world is built from.
   */
  unfold: number;
  /**
   * Whether a second future exists at all. Before the hinge there is only
   * one, and that is not a rendering choice - the sequences are identical
   * there by construction. It is also false for the whole run at neutral,
   * because the kernel proves neutral is bit-identical to the baseline.
   */
  hasDelta: boolean;
}

/**
 * NEUTRAL IS THE ZERO-DELTA STATE. Resolved by Jacob, 2026-08-30.
 *
 * The kernel proves the neutral family is bit-identical to the baseline, so
 * a visitor who never touches the blade has no second future and nothing to
 * inhabit. The question was whether that should be a third Z outcome.
 *
 * It is not. An empty Z page would be mathematically honest and would read
 * as the site failing to load. Neutral is instead the PROOF of the rule the
 * whole direction rests on:
 *
 *   You changed nothing. Therefore there is no difference to inhabit.
 *
 * So the visitor is never blocked and never instructed. Scroll carries them
 * into the Z threshold exactly as it would otherwise - unfoldRequested
 * rises normally - but the world does not open, because baseline and
 * altered are the same geometry and the gap between them is zero. No
 * warning text, no gate, no "choose something". The mechanism says it.
 *
 * Snap the blade to -1 or +1 and Z unfolds from the same scroll position,
 * with no jump: the delta was always the thing being drawn, and it stopped
 * being zero. Return it to neutral and the field recompresses exactly to
 * nothing, because unfold is derived, never accumulated.
 *
 * The sinister register comes free. Most sites are desperate to react to a
 * visitor - hover, ripple, particles, look-you-matter. At neutral this one
 * does not care that anyone arrived. Reality diverges only if you alter
 * something.
 */

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function span(p: number, a: number, b: number): number {
  return b > a ? clamp01((p - a) / (b - a)) : 0;
}

/**
 * REDUCED MOTION gets equivalent narrative states, never an empty version
 * (THE_DELTA section 11). Continuous scrubbing becomes a small number of
 * stable holds: the same beats, the same order, the same meaning, without
 * the travel. Quantising the TICK is what does that - every downstream
 * value follows from it, so nothing needs a second code path.
 */
const REDUCED_STEPS = 6;

function quantise(t: number, lo: number, hi: number): number {
  const n = REDUCED_STEPS - 1;
  const u = hi > lo ? (t - lo) / (hi - lo) : 0;
  return lo + (Math.round(u * n) / n) * (hi - lo);
}

/**
 * The whole journey at one scroll position.
 *
 * `detent` is the visitor's selection at Tick Zero. It has no effect
 * before the hinge, which the verify script asserts: an intervention that
 * changed the past would not be an intervention.
 */
export function journeyAt(p: number, detent: Detent, reduced = false): JourneyState {
  const s = clamp01(p);
  const last = TICKS - 1;

  if (s < BEATS.entranceEnd) {
    return {
      phase: 'entrance',
      local: span(s, 0, BEATS.entranceEnd),
      tick: 0,
      bladeLive: false,
      unfoldRequested: 0,
      unfold: 0,
      hasDelta: false
    };
  }

  if (s < BEATS.xEnd) {
    const local = span(s, BEATS.entranceEnd, BEATS.xEnd);
    const raw = local * HINGE;
    return {
      phase: 'x',
      local,
      tick: reduced ? quantise(raw, 0, HINGE) : raw,
      bladeLive: false,
      unfoldRequested: 0,
      unfold: 0,
      hasDelta: false
    };
  }

  if (s < BEATS.tickZeroEnd) {
    // every state compresses into one aligned moment and the blade is
    // offered. The tick does not advance here: the hold IS the hinge.
    return {
      phase: 'tickzero',
      local: span(s, BEATS.xEnd, BEATS.tickZeroEnd),
      tick: HINGE,
      bladeLive: true,
      unfoldRequested: 0,
      unfold: 0,
      hasDelta: false
    };
  }

  if (s < BEATS.yEnd) {
    const local = span(s, BEATS.tickZeroEnd, BEATS.yEnd);
    const raw = HINGE + local * (last - HINGE);
    return {
      phase: 'y',
      local,
      tick: reduced ? quantise(raw, HINGE, last) : raw,
      bladeLive: false,
      unfoldRequested: 0,
      unfold: 0,
      // a second future exists from the hinge on - unless the blade was
      // left at neutral, in which case there is genuinely only one.
      hasDelta: detent !== 0
    };
  }

  const local = span(s, BEATS.yEnd, 1);
  const requested = reduced ? quantise(local, 0, 1) : local;
  const hasDelta = detent !== 0;
  return {
    phase: 'z',
    local,
    tick: last,
    bladeLive: false,
    // the threshold is always reachable: the visitor is never blocked
    unfoldRequested: requested,
    // but the world only opens if there is a difference to open. Derived,
    // never accumulated, so returning the blade to neutral recompresses
    // the field to exactly nothing.
    unfold: hasDelta ? requested : 0,
    hasDelta
  };
}

/** The detent order the blade steps through, for keyboard and swipe. */
export const DETENT_ORDER: readonly Detent[] = [-1, 0, 1];

/**
 * Step the blade between its three notches. Bounded, never wrapping: a
 * control that wraps around invites spinning, and this is a mechanical
 * detent, not a dial.
 */
export function stepDetent(current: Detent, direction: -1 | 1): Detent {
  const i = DETENT_ORDER.indexOf(current);
  const next = Math.min(DETENT_ORDER.length - 1, Math.max(0, i + direction));
  return DETENT_ORDER[next]!;
}
