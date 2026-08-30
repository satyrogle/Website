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
  xEnd: 0.52,
  tickZeroEnd: 0.57,
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
  /** how far Z's delta field has opened, 0 to 1 */
  unfold: number;
  /**
   * Whether a second future exists to show at all. Before the hinge there
   * is only one, and that is not a rendering choice - the sequences are
   * identical there by construction.
   *
   * It is ALSO false for the whole run when the blade is left at neutral,
   * because the kernel proves neutral is bit-identical to the baseline.
   * See THE NEUTRAL PROBLEM below.
   */
  showAltered: boolean;
}

/**
 * THE NEUTRAL PROBLEM, surfaced 2026-08-30 and not yet decided.
 *
 * THE_DELTA section 6 gives the blade three detents: negative, neutral,
 * positive. But delta-verify asserts that the neutral family is EXACTLY the
 * baseline - no difference anywhere, at any tick. That assertion is correct
 * and should stay: it is what "no difference means no separation" means.
 *
 * The consequence is that a visitor who leaves the blade at neutral reaches
 * Z and finds nothing there. No gaps, no field, no place. Z is the space
 * between two futures, and they picked the same future twice.
 *
 * That is either a bug or the best beat in the site, and it is Jacob's call:
 *
 *   - neutral is the resting position and the visitor must move OFF it to
 *     proceed, so Z always has a world in it; or
 *   - neutral is allowed, and choosing to change nothing means arriving at
 *     an empty Z. Merciless, entirely honest to the mechanism, and it would
 *     be the one page that punishes caution.
 *
 * Until it is decided, the state model reports the truth - showAltered is
 * false - rather than quietly pretending a difference exists.
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
      unfold: 0,
      showAltered: false
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
      unfold: 0,
      showAltered: false
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
      unfold: 0,
      showAltered: false
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
      unfold: 0,
      // a second future exists from the hinge on - unless the blade was
      // left at neutral, in which case there is genuinely only one.
      showAltered: detent !== 0
    };
  }

  const local = span(s, BEATS.yEnd, 1);
  return {
    phase: 'z',
    local,
    tick: last,
    bladeLive: false,
    unfold: reduced ? quantise(local, 0, 1) : local,
    showAltered: detent !== 0
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
