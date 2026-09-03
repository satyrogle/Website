/**
 * THE DELTA, VERIFIED. docs/THE_DELTA.md sections 4, 6 and 7.
 *
 * The site makes two claims out loud. This asserts them against the real
 * kernel instead of trusting them:
 *
 *   THE SAME CAUSE MAKES THE SAME FUTURE.
 *   THE INTERVENTION IS CHOSEN. THE CONSEQUENCES ARE NOT.
 *
 * A clean console is not verification - but a claim about determinism is
 * one of the few things in this project that IS provable by measurement
 * rather than by looking, so it gets measured. Everything about how any
 * of it LOOKS still waits on the Z keyframe.
 *
 *   node tools/delta-verify.mjs
 *
 * Reads the TypeScript kernel through a tiny inline transpile so there is
 * no build step and no test framework to install.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Node strips TypeScript itself (unflagged since 23.6), so the kernel is
// imported as-is rather than through a hand-rolled regex stripper. The
// one thing Node will not do is resolve an extensionless specifier, so
// the files are copied to a temp dir with './rng' pointed at './rng.ts'.
// Nothing else is rewritten: what runs here is the shipped source.
const dir = mkdtempSync(join(tmpdir(), 'dl-delta-'));
for (const f of ['rng', 'Delta', 'Journey']) {
  const src = readFileSync(join(root, 'src', 'core', `${f}.ts`), 'utf8');
  writeFileSync(
    join(dir, `${f}.ts`),
    src.replace("from './rng'", "from './rng.ts'").replace("from './Delta'", "from './Delta.ts'")
  );
}
const D = await import(pathToFileURL(join(dir, 'Delta.ts')).href);
const J = await import(pathToFileURL(join(dir, 'Journey.ts')).href);

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
};

const SEED = 20569487;

// ---- THE SAME CAUSE MAKES THE SAME FUTURE ----

const a = D.computeSequence(SEED, null);
const b = D.computeSequence(SEED, null);
check(
  'baseline is reproducible',
  D.checksum(a) === D.checksum(b),
  `checksum ${D.checksum(a)}`
);

for (const d of D.DETENTS) {
  const p = D.computeSequence(SEED, d);
  const q = D.computeSequence(SEED, d);
  check(`detent ${d >= 0 ? '+' : ''}${d} is reproducible`, D.checksum(p) === D.checksum(q));
}

const other = D.computeSequence(SEED + 1, null);
check(
  'a different seed is a different world',
  D.checksum(other) !== D.checksum(a),
  'otherwise the seed is decorative'
);

// ---- NO DIFFERENCE MEANS NO SEPARATION ----

const fam = D.computeFamilies(SEED);

check(
  'the neutral detent is exactly the baseline',
  D.checksum(fam.altered.get(0)) === D.checksum(fam.baseline),
  'neutral must open no gap at all'
);

for (const d of [-1, 1]) {
  const delta = fam.delta.get(d);
  const before = delta.frames.slice(0, D.HINGE).every((f) => f.diverged === 0);
  check(`detent ${d > 0 ? '+' : ''}${d}: futures are identical before the hinge`, before);
  check(
    `detent ${d > 0 ? '+' : ''}${d}: divergence begins at the intervention`,
    delta.onsetTick >= D.HINGE,
    `onset tick ${delta.onsetTick}, hinge ${D.HINGE}`
  );
}

// ---- THE INTERVENTION IS CHOSEN, THE CONSEQUENCES ARE NOT ----

for (const d of [-1, 1]) {
  const delta = fam.delta.get(d);
  check(
    `detent ${d > 0 ? '+' : ''}${d}: consequence reaches sections nobody touched`,
    delta.derived.length > 0,
    `${delta.derived.length} derived sections, blade is ${D.BLADE}`
  );

  // the delayed consequence: something has to cross a threshold well
  // after the visitor believes the reaction has finished. THE_DELTA
  // section 6 - this is scroll distance, never a clock.
  const last = delta.frames[D.TICKS - 1];
  const atOnset = delta.frames[delta.onsetTick];
  const lateGrowth = last.diverged - atOnset.diverged;
  check(
    `detent ${d > 0 ? '+' : ''}${d}: the difference keeps spreading after onset`,
    lateGrowth > 0,
    `${atOnset.diverged} sections at onset, ${last.diverged} at the end`
  );

  // Z'S DIMENSIONS MUST VARY ACROSS SPACE. THE_DELTA section 7: small
  // consequence means surfaces almost touching, amplified consequence
  // means a large volume opens. A field of equal gaps is a corridor of
  // constant width, which is exactly what the frame test exists to fail.
  //
  // This measures the spread of gap widths ACROSS the field at the end,
  // not peak-over-time. The first version compared the final peak to the
  // peak just after the hinge, which mostly measured whether the blade's
  // own displacement happened to run with or against its natural yield
  // direction - nothing to do with whether the space has variety in it.
  //
  // And it is measured over gaps that are actually VISIBLE. Counting
  // everything above a 1e-9 epsilon gave a ratio of twenty-two million,
  // which only proved the narrowest gap was float dust. Z cannot be
  // built out of differences too small to see, so the threshold is a
  // fraction of the widest gap: those are the walls that will really
  // stand apart.
  const allGaps = delta.frames[D.TICKS - 1].gap;
  const widest = Math.max(...allGaps);
  const visible = allGaps.filter((g) => g > widest * 0.01);
  const narrowest = Math.min(...visible);
  check(
    `detent ${d > 0 ? '+' : ''}${d}: gap widths vary across the field`,
    widest / narrowest > 3 && visible.length >= 6,
    `${visible.length} visible gaps of ${D.SECTIONS}, widest is ${(widest / narrowest).toFixed(1)}x the narrowest`
  );
}

// the two interventions must not produce the same world, or the three
// detents are one detent wearing three labels
check(
  'the two interventions produce different worlds',
  D.checksum(fam.altered.get(-1)) !== D.checksum(fam.altered.get(1))
);

// ---- REPLAY: SCROLLING BACK IS EXACT ----

// every frame is a stored snapshot, so scrubbing to tick t and back must
// return the identical state. Assert it against a fresh run rather than
// against the same array, or this proves nothing.
const fresh = D.computeSequence(SEED, 1);
const stored = fam.altered.get(1);
let drift = 0;
for (let t = 0; t < D.TICKS; t++) {
  for (let i = 0; i < D.SECTIONS; i++) {
    drift = Math.max(drift, Math.abs(fresh.frames[t][i].offset - stored.frames[t][i].offset));
  }
}
check('scrubbing is exact in both directions', drift === 0, `max drift ${drift}`);

// ---- NO Math.random IN THE AUTHORITATIVE PATH ----

// the CALL, not the words: the kernel's own comments say "no
// Math.random anywhere", and a bare substring test flagged that comment
// as a violation of itself.
const kernelSrc = readFileSync(join(root, 'src', 'core', 'Delta.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
check('kernel calls no Math.random', !/Math\s*\.\s*random\s*\(/.test(kernelSrc));

// ---- THE JOURNEY IS A PURE FUNCTION OF SCROLL ----

// walk the whole page at fine resolution, forwards then backwards, and
// require every value to retrace exactly. This is the law the entrance
// was rebuilt around and the one most easily lost.
{
  const fwd = [];
  for (let i = 0; i <= 4000; i++) fwd.push(J.journeyAt(i / 4000, 1));
  let mismatch = 0;
  for (let i = 4000; i >= 0; i--) {
    const back = J.journeyAt(i / 4000, 1);
    const f = fwd[i];
    if (
      back.phase !== f.phase ||
      back.tick !== f.tick ||
      back.unfold !== f.unfold ||
      back.unfoldRequested !== f.unfoldRequested ||
      back.bladeLive !== f.bladeLive ||
      back.hasDelta !== f.hasDelta
    ) {
      mismatch++;
    }
  }
  check('journey retraces exactly in reverse', mismatch === 0, `${mismatch} of 4001 differ`);
}

// the tick may never run backwards while scroll runs forwards, or the
// visitor is watching the future un-compute itself
{
  let worst = 0;
  let prev = -Infinity;
  for (let i = 0; i <= 4000; i++) {
    const t = J.journeyAt(i / 4000, 1).tick;
    worst = Math.min(worst, t - prev);
    prev = t;
  }
  check('tick never runs backwards as scroll advances', worst >= 0, `worst step ${worst}`);
}

// no jump at a beat boundary: the pages are one continuous scene, so the
// tick has to be continuous across every seam between them
{
  let worst = 0;
  let where = '';
  for (const [name, at] of Object.entries(J.BEATS)) {
    const before = J.journeyAt(at - 1e-6, 1).tick;
    const after = J.journeyAt(at + 1e-6, 1).tick;
    const gap = Math.abs(after - before);
    if (gap > worst) {
      worst = gap;
      where = name;
    }
  }
  check(
    'tick is continuous across every beat boundary',
    worst < 0.01,
    worst > 0 ? `largest jump ${worst.toFixed(4)} at ${where}` : 'no discontinuity'
  );
}

// X hands over to the hinge exactly, and Y starts from it
check(
  'X ends on the hinge and Y begins there',
  Math.abs(J.journeyAt(J.BEATS.xEnd - 1e-6, 1).tick - D.HINGE) < 0.01 &&
    J.journeyAt(J.BEATS.tickZeroEnd + 1e-6, 1).tick >= D.HINGE,
  `hinge is tick ${D.HINGE}`
);

// the blade is offered at Tick Zero and nowhere else
{
  let live = 0;
  let liveOutside = 0;
  for (let i = 0; i <= 4000; i++) {
    const p = i / 4000;
    const st = J.journeyAt(p, 0);
    if (st.bladeLive) {
      live++;
      if (st.phase !== 'tickzero') liveOutside++;
    }
  }
  check('the blade is live only at Tick Zero', live > 0 && liveOutside === 0, `${live} live samples`);
}

// AN INTERVENTION CANNOT CHANGE THE PAST. The detent must make no
// difference anywhere before the hinge.
{
  let differs = 0;
  for (let i = 0; i <= 4000; i++) {
    const p = i / 4000;
    const a = J.journeyAt(p, -1);
    const b = J.journeyAt(p, 1);
    if (a.tick <= D.HINGE && (a.tick !== b.tick || a.phase !== b.phase)) differs++;
  }
  check('the detent changes nothing before the hinge', differs === 0, `${differs} samples differ`);
}

// reduced motion must still tell the story: fewer states, not no states
{
  const ticks = new Set();
  const phases = new Set();
  for (let i = 0; i <= 2000; i++) {
    const st = J.journeyAt(i / 2000, 1, true);
    ticks.add(st.tick.toFixed(6));
    phases.add(st.phase);
  }
  check(
    'reduced motion holds every beat with fewer states',
    phases.size === 5 && ticks.size > 3 && ticks.size < 40,
    `${phases.size} phases, ${ticks.size} distinct ticks`
  );
}

// ---- NEUTRAL IS THE ZERO-DELTA STATE ----
// Resolved 2026-08-30. Neutral is not a third Z outcome: it is the proof
// that Z only exists when something actually changed. The visitor is never
// blocked, so the threshold stays reachable, but the world cannot open.
{
  // no matter how far scroll asks Z to open, neutral opens nothing
  let leaked = 0;
  let reachable = 0;
  for (let i = 0; i <= 2000; i++) {
    const p = i / 2000;
    const st = J.journeyAt(p, 0);
    if (st.unfold !== 0) leaked++;
    if (st.phase === 'z' && st.unfoldRequested > 0.5) reachable++;
  }
  check(
    'neutral never unfolds Z, at any scroll position',
    leaked === 0,
    `${leaked} of 2001 samples opened a field that does not exist`
  );
  check(
    'but the Z threshold is still reachable at neutral',
    reachable > 0,
    'the visitor is never blocked, and never told to go back'
  );
}

// the delta itself must be zero at neutral - the state model and the
// kernel have to agree, or one of them is lying
check(
  'the kernel agrees: neutral is zero delta',
  D.checksum(fam.altered.get(0)) === D.checksum(fam.baseline),
  'already asserted above; restated here as the ground the Z rule stands on'
);

// moving off neutral opens Z from the SAME scroll position, with no jump
{
  const p = 0.9;
  const n = J.journeyAt(p, 0);
  const a = J.journeyAt(p, 1);
  check(
    'moving off neutral opens Z from the same scroll position',
    n.unfold === 0 && a.unfold === n.unfoldRequested && a.unfold > 0,
    `requested ${n.unfoldRequested.toFixed(3)} -> neutral 0, detent ${a.unfold.toFixed(3)}`
  );
}

// and returning to neutral recompresses it exactly, because unfold is
// derived rather than accumulated
{
  const p = 0.9;
  const before = J.journeyAt(p, 0).unfold;
  J.journeyAt(p, 1);
  const after = J.journeyAt(p, 0).unfold;
  check(
    'returning to neutral recompresses the field to exactly zero',
    before === 0 && after === 0,
    'no accumulation, no residue'
  );
}

check(
  'neutral reports no second future, and a detent does',
  J.journeyAt(0.95, 0).hasDelta === false && J.journeyAt(0.95, 1).hasDelta === true
);

// the blade steps between three notches and stops at the ends
check(
  'the blade steps and clamps, never wraps',
  J.stepDetent(-1, -1) === -1 &&
    J.stepDetent(1, 1) === 1 &&
    J.stepDetent(0, -1) === -1 &&
    J.stepDetent(0, 1) === 1
);

console.log(
  `\n${failures === 0 ? 'ALL CLAIMS HOLD' : `${failures} FAILED`}` +
    `  ·  ${D.SECTIONS} sections · ${D.TICKS} ticks · hinge ${D.HINGE} · blade ${D.BLADE}`
);
process.exit(failures === 0 ? 0 : 1);
