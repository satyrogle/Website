import { mulberry32 } from './rng';

/**
 * THE DELTA KERNEL. docs/THE_DELTA.md, locked 2026-08-30.
 *
 *   X = baseline sequence
 *   Y = one discrete intervention
 *   Z = altered sequence - baseline sequence
 *
 * This is the authoritative state for X, Y and Z, and it is deliberately
 * headless: no Three.js, no DOM, no camera, no look. It computes futures
 * and the difference between them; the renderer observes snapshots and
 * owns nothing. That separation is what lets the claim be TESTED rather
 * than asserted, which is what tools/delta-verify.mjs does.
 *
 * The site's whole pitch reduces to two sentences this file has to make
 * literally true:
 *
 *   THE SAME CAUSE MAKES THE SAME FUTURE.
 *   THE INTERVENTION IS CHOSEN. THE CONSEQUENCES ARE NOT.
 *
 * So: seeded, fixed-step, no Math.random, and every consequence derived
 * by the step rule rather than authored anywhere. Nothing in here knows
 * what the visitor is supposed to feel.
 *
 * WHAT IS NOT LOCKED YET. The step rule in `advance` is a load-transfer
 * model over a stack of sections - explicit, plausible and replaceable.
 * The Z keyframe has not been judged (docs/THE_DELTA.md section 8), so
 * the geometry these numbers eventually drive is not fixed, and tuning
 * the rule to serve an approved frame is expected. The FRAMEWORK around
 * it - families, fixed step, difference, replay - is what is being
 * settled here, and that survives any change to the rule.
 */

/** Sections in the stack. X reads as ~40-60 cross-sections of the hero. */
export const SECTIONS = 48;

/** Fixed-step ticks per family. Depth in X and Y is this axis. */
export const TICKS = 240;

/**
 * The tick at which the visitor's condition enters. Before this the
 * futures are identical BY CONSTRUCTION, which is what makes the "no
 * difference means no separation" rule true rather than tuned.
 */
export const HINGE = 60;

/** The three physical detents. Not a slider - see THE_DELTA section 6. */
export type Detent = -1 | 0 | 1;
export const DETENTS: readonly Detent[] = [-1, 0, 1];

/** How far one detent moves the blade, in section-local units. */
const DETENT_STEP = 0.06;

/** The section the visitor is allowed to touch, at Tick Zero. */
export const BLADE = 18;

/** One section's state at one tick. */
export interface SectionState {
  /** displacement along the stack's shear axis */
  offset: number;
  /** load currently carried */
  load: number;
  /** accumulated strain: what the runes answer to, where they appear */
  strain: number;
  /** true once this section has crossed its threshold and moved */
  yielded: boolean;
}

/** Every section at one tick. */
export type Frame = SectionState[];

/** A complete computed future. */
export interface Sequence {
  detent: Detent | null;
  frames: Frame[];
}

/** The difference between an altered future and the baseline, per tick. */
export interface DeltaFrame {
  /** |altered - baseline| offset per section: Z's gap widths */
  gap: number[];
  /** the largest gap anywhere at this tick */
  peak: number;
  /** how many sections differ at all */
  diverged: number;
  /** index of the section carrying the most difference: the causal path */
  dominant: number;
}

export interface DeltaField {
  detent: Detent;
  frames: DeltaFrame[];
  /** first tick at which anything differs at all */
  onsetTick: number;
  /** sections that diverged WITHOUT being the one the visitor touched */
  derived: number[];
}

/** Anything below this is not a difference: it is float noise. */
const EPS = 1e-9;

/**
 * Per-section constants, seeded once. These are the material: which
 * sections are stiff, which are close to giving, how load passes on.
 * Same seed, same material, every visit.
 */
interface Material {
  threshold: number[];
  stiffness: number[];
  transfer: number[];
}

/** Each section's own weight, added to whatever it inherits. */
const WEIGHT = 0.22;

function material(seed: number): Material {
  const rng = mulberry32((seed ^ 0x0de17a) | 0);
  const threshold: number[] = [];
  const stiffness: number[] = [];
  const transfer: number[] = [];
  for (let i = 0; i < SECTIONS; i++) {
    // THRESHOLDS ARE THE AMPLIFIER. Spread so that sections cross over
    // the whole run rather than all at once: a section sitting just
    // under its threshold is where a change of one part in a thousand
    // becomes a section moving. That is the only reason a consequence
    // can travel a long way from a small cause, and the verify script
    // asserts it actually does.
    threshold.push(0.1 + rng() * 0.52);
    stiffness.push(0.55 + rng() * 0.7);
    transfer.push(0.55 + rng() * 0.3);
  }
  return { threshold, stiffness, transfer };
}

function seedFrame(m: Material): Frame {
  const f: Frame = [];
  for (let i = 0; i < SECTIONS; i++) {
    f.push({ offset: 0, load: 0, strain: 0, yielded: false });
  }
  void m;
  return f;
}

function cloneFrame(f: Frame): Frame {
  const out: Frame = new Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = f[i]!;
    out[i] = { offset: s.offset, load: s.load, strain: s.strain, yielded: s.yielded };
  }
  return out;
}

/**
 * ONE FIXED STEP. Load runs down the stack; a section that exceeds its
 * threshold yields, shifts, and passes a different load on. Clearance
 * created by one section changes what the next one receives, which is
 * how a change here becomes a change somewhere it was never applied.
 *
 * Every term is explicit and local. No global "make it look good" pass,
 * because a consequence that was arranged is not a consequence.
 */
function advance(prev: Frame, m: Material): Frame {
  const next = cloneFrame(prev);
  for (let i = 0; i < SECTIONS; i++) {
    const s = next[i]!;
    const p = prev[i]!;

    // A STACK CARRIES WHAT IS ABOVE IT. Load accumulates downward and
    // settles to a bound; it does not decay away. An earlier version
    // multiplied it down by the transfer coefficient, so by section 18
    // the load was 4e-6, nothing deep ever reached a threshold, and a
    // section that never yields never moves - which meant the blade's
    // change had nowhere to propagate. Caught by delta-verify, not by
    // reading it.
    //
    // The clearance term is the propagation channel: a section that has
    // shifted passes its load on differently, so a change here alters
    // what every section below inherits.
    const up = i > 0 ? prev[i - 1]! : null;
    const clearance = up ? 1 - Math.min(1, Math.abs(up.offset) * 2.2) : 1;
    const inherited = up ? up.load * m.transfer[i]! * (0.62 + 0.38 * clearance) : 0;
    s.load = inherited + WEIGHT;

    // strain accumulates while load is held, slowly enough that
    // thresholds are crossed right across the run
    s.strain = p.strain * 0.997 + s.load * 0.005;

    // the threshold crossing: it gives, and stays given
    if (!s.yielded && s.strain > m.threshold[i]!) {
      s.yielded = true;
    }
    if (s.yielded) {
      // it settles toward a displacement its stiffness decides
      const target = (s.load / m.stiffness[i]!) * 0.22;
      s.offset += (target - s.offset) * 0.08;
    }
  }
  return next;
}

/**
 * Compute one complete future.
 *
 * detent === null is the baseline: nobody intervened. Otherwise the
 * visitor's condition enters at HINGE and nothing else about the run
 * differs - same seed, same material, same rule, same number of steps.
 * That is what makes the difference attributable.
 */
export function computeSequence(seed: number, detent: Detent | null): Sequence {
  const m = material(seed);
  const frames: Frame[] = [];
  let f = seedFrame(m);
  frames.push(cloneFrame(f));
  for (let t = 1; t < TICKS; t++) {
    if (t === HINGE && detent !== null && detent !== 0) {
      // THE ONE CHANGED CONDITION. A single section is displaced by one
      // detent. Everything after this is the rule running, untouched.
      f = cloneFrame(f);
      f[BLADE]!.offset += detent * DETENT_STEP;
      f[BLADE]!.yielded = true;
    }
    f = advance(f, m);
    frames.push(f);
  }
  return { detent, frames };
}

/**
 * The delta field: altered minus baseline, tick by tick. This IS Z -
 * the gaps here are the widths of the space the visitor stands in, so
 * nothing about Z's dimensions is a design choice.
 */
export function computeDelta(baseline: Sequence, altered: Sequence): DeltaField {
  if (altered.detent === null) {
    throw new Error('computeDelta needs an altered sequence, not a second baseline');
  }
  const frames: DeltaFrame[] = [];
  let onsetTick = -1;
  const derivedSet = new Set<number>();

  for (let t = 0; t < TICKS; t++) {
    const a = baseline.frames[t]!;
    const b = altered.frames[t]!;
    const gap: number[] = new Array(SECTIONS);
    let peak = 0;
    let diverged = 0;
    let dominant = 0;
    for (let i = 0; i < SECTIONS; i++) {
      const d = Math.abs(b[i]!.offset - a[i]!.offset);
      gap[i] = d;
      if (d > EPS) {
        diverged++;
        if (i !== BLADE) derivedSet.add(i);
      }
      if (d > peak) {
        peak = d;
        dominant = i;
      }
    }
    if (onsetTick < 0 && diverged > 0) onsetTick = t;
    frames.push({ gap, peak, diverged, dominant });
  }

  return {
    detent: altered.detent,
    frames,
    onsetTick,
    derived: Array.from(derivedSet).sort((p, q) => p - q)
  };
}

/** All four families: the baseline and one per detent. */
export interface Families {
  seed: number;
  baseline: Sequence;
  altered: Map<Detent, Sequence>;
  delta: Map<Detent, DeltaField>;
}

export function computeFamilies(seed: number): Families {
  const baseline = computeSequence(seed, null);
  const altered = new Map<Detent, Sequence>();
  const delta = new Map<Detent, DeltaField>();
  for (const d of DETENTS) {
    const seq = computeSequence(seed, d);
    altered.set(d, seq);
    delta.set(d, computeDelta(baseline, seq));
  }
  return { seed, baseline, altered, delta };
}

/**
 * A checksum over a whole sequence. Two runs that agree here agree
 * everywhere, which is how the determinism claim gets asserted instead
 * of believed. Integer accumulation only - no float drift in the sum.
 */
export function checksum(seq: Sequence): number {
  let h = 0x811c9dc5 | 0;
  for (const f of seq.frames) {
    for (const s of f) {
      h = (Math.imul(h ^ Math.round(s.offset * 1e6), 16777619) | 0);
      h = (Math.imul(h ^ Math.round(s.strain * 1e6), 16777619) | 0);
      h = (Math.imul(h ^ (s.yielded ? 1 : 0), 16777619) | 0);
    }
  }
  return h >>> 0;
}
