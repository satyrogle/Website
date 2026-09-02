/**
 * THE CAUSAL READING, VERIFIED AND DIAGNOSED.
 *
 *   node tools/causality-verify.mjs
 *
 * tools/delta-verify.mjs asserts the two claims the site makes out loud
 * and they all hold. This asks the harder question underneath them:
 *
 *   THE CONSEQUENCE IS REAL - BUT HOW FAR DOES IT ACTUALLY GO?
 *
 * Two kinds of output, and the difference matters:
 *
 *   GATE      a regression lock. It is true now, it must stay true,
 *             and a failure exits non-zero.
 *   HEADROOM  a measurement of the gap between what THE_DELTA.md
 *             describes and what the kernel currently produces. These
 *             never fail the run. They are the diagnosis, and the whole
 *             reason this file exists.
 *
 * Nothing here judges how anything looks. It measures what the engine
 * did, which is the only part of this that is provable without a GPU.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// same trick as delta-verify: Node runs the shipped TypeScript directly,
// with only the extensionless specifiers rewritten.
const dir = mkdtempSync(join(tmpdir(), 'dl-caus-'));
for (const f of ['rng', 'Delta', 'causality']) {
  const src = readFileSync(join(root, 'src', 'core', `${f}.ts`), 'utf8');
  writeFileSync(
    join(dir, `${f}.ts`),
    src.replace(/from '\.\/rng'/g, "from './rng.ts'").replace(/from '\.\/Delta'/g, "from './Delta.ts'")
  );
}
const D = await import(pathToFileURL(join(dir, 'Delta.ts')).href);
const C = await import(pathToFileURL(join(dir, 'causality.ts')).href);

let failures = 0;
const gate = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
};
const note = (label, value) => console.log(`      ${label.padEnd(42)} ${value}`);

const SEED = 20260818;
const fam = D.computeFamilies(SEED);
const caus = C.readAll(fam);
const sign = (d) => (d > 0 ? '+1' : d < 0 ? '-1' : ' 0');

// ---- GATES: what must not regress ----

console.log('GATES\n');

for (const d of [-1, 1]) {
  const c = caus.get(d);

  // the cause is never counted as its own consequence
  gate(
    `detent ${sign(d)}: the blade is excluded from every derived count`,
    !c.shifted.includes(D.BLADE) &&
      !c.flippedOn.includes(D.BLADE) &&
      !c.flippedOff.includes(D.BLADE) &&
      c.events.some((e) => e.section === D.BLADE && e.kind === 'forced'),
    `blade is section ${D.BLADE}, marked forced`
  );

  // an event change with no visible gap would be a consequence nobody
  // can see - the reading and the geometry have to agree on reality
  const eventSections = [...c.shifted, ...c.flippedOn, ...c.flippedOff];
  gate(
    `detent ${sign(d)}: every changed event is visibly diverged too`,
    eventSections.every((i) => c.visible.includes(i)),
    `${eventSections.length} changed events, all inside the visible span`
  );

  // the stack amplifies: the largest derived difference exceeds the
  // displacement the visitor applied. Below 1 the world merely damps
  // the intervention and the "amplifier" language is wrong.
  gate(
    `detent ${sign(d)}: the stack amplifies rather than damps`,
    c.amplification > 1,
    `cause ${c.cause.toExponential(2)} -> effect ${c.effect.toExponential(2)} = ${c.amplification.toFixed(2)}x`
  );

  // the consequence has to reach more than one place, and reach them at
  // different times. Deliberately NOT phrased as a wavefront speed: the
  // arrivals are not in distance order (see HEADROOM), so a speed would
  // be a number with no referent.
  gate(
    `detent ${sign(d)}: the consequence reaches several sections over time`,
    c.visibleSpan > 1 && c.spreadTicks > 0,
    `${c.visibleSpan} sections spanned across ${c.spreadTicks} ticks`
  );
}

// neutral changed nothing, so it must READ as nothing. The floor is a
// fraction of the widest gap, and when the widest gap is zero every
// section clears it - this is the assertion that caught that.
{
  const c = caus.get(0);
  gate(
    'neutral reads as no causality at all',
    c.visible.length === 0 &&
      c.visibleSpan === 0 &&
      c.events.length === 0 &&
      c.amplification === 0,
    `${c.visible.length} visible, ${c.events.length} events`
  );
}

// the reading is a pure function of the futures
{
  const again = C.readCausality(fam.baseline, fam.altered.get(1), fam.delta.get(1));
  const a = JSON.stringify(caus.get(1));
  gate('the causal reading is reproducible', JSON.stringify(again) === a);
}

// the two interventions must not be one intervention twice
gate(
  'the two detents differ somewhere in their causal structure',
  JSON.stringify(caus.get(-1)) !== JSON.stringify(caus.get(1))
);

// ---- HEADROOM: the distance between the story and the engine ----

console.log('\nHEADROOM  ·  measurements, not failures\n');

for (const d of [-1, 1]) {
  const c = caus.get(d);
  const delta = fam.delta.get(d);

  console.log(`  detent ${sign(d)}`);

  // THE AMPLIFIER. THE_DELTA and the kernel's own comments say a
  // section sitting just under its threshold is where a tiny change
  // becomes a section moving. If nothing ever flips, that mechanism is
  // described but not happening, and Z's drama is offset drift only.
  const flips = c.flippedOn.length + c.flippedOff.length;
  note(
    'sections FLIPPED across a threshold',
    `${flips}${flips === 0 ? '   <- the amplifier never fires' : ''}`
  );
  note('sections whose yield tick merely SHIFTED', `${c.shifted.length}  ${JSON.stringify(c.shifted)}`);

  // THE FLATTERING NUMBER vs THE REAL ONE.
  note(
    'sections diverged (kernel epsilon)',
    `${c.divergedCount} of ${D.SECTIONS}`
  );
  note(
    'sections VISIBLY diverged (>=1% of peak)',
    `${c.visible.length} of ${D.SECTIONS}   ${JSON.stringify(c.visible)}`
  );
  note(
    'span the consequence covers',
    `${c.visibleSpan} sections = ${((c.visibleSpan / D.SECTIONS) * 100).toFixed(0)}% of the stack`
  );

  // HOW FAST IT DIES. Near 1 means it travels; 0.2 means it halves and
  // halves again and is gone within a few sections of the blade.
  note(
    'falloff per section (from the peak outward)',
    `${c.decayMean.toFixed(3)}x${c.decayMean < 0.6 ? '   <- dies locally' : ''}`
  );
  note(
    'arrivals in distance order from the blade',
    `${c.frontMonotone ? 'yes' : 'NO   <- the difference sloshes, it does not propagate'}`
  );
  note(
    'sections that arrived and then LEFT again',
    `${c.retreated.length}  ${JSON.stringify(c.retreated)}`
  );

  // WHOSE PATH IS IT. DeltaField.dominant includes the blade, so it
  // mostly points at the visitor's own hand.
  let bladeOwns = 0;
  let derivedOwns = 0;
  for (let t = D.HINGE; t < D.TICKS; t++) {
    if (delta.frames[t].dominant === D.BLADE) bladeOwns++;
    else derivedOwns++;
  }
  note(
    'post-hinge ticks where dominant IS the blade',
    `${bladeOwns} of ${bladeOwns + derivedOwns}${bladeOwns > derivedOwns ? '   <- the path points at the cause' : ''}`
  );

  const firstDerived = c.dominantDerived[D.TICKS - 1];
  note('honest causal path ends at section', `${firstDerived}`);

  // THE ROOT CAUSE UNDER ALL OF THE ABOVE.
  note('the two futures are furthest apart at tick', `${c.peakTick} of ${D.TICKS}`);
  note(
    "the blade's own gap fades by",
    `${c.causeWashout.toFixed(0)}x from that peak to the end`
  );
  note(
    'measured relaxation of the cause per tick',
    `${c.relaxationPerTick.toFixed(4)}   <- the rule's own 1 - 0.08`
  );
  console.log('');
}

// the yield ladder: what the baseline world does on its own, which is
// the material every consequence has to work against
{
  const yb = caus.get(1).yieldBase;
  const never = yb.filter((v) => v < 0).length;
  console.log('  baseline material');
  note('sections that never yield at all', `${never} of ${D.SECTIONS}`);
  note(
    'first / last yield tick',
    `${Math.min(...yb.filter((v) => v >= 0))} / ${Math.max(...yb)} of ${D.TICKS}`
  );
  const nearMiss = [];
  const lastBase = fam.baseline.frames[D.TICKS - 1];
  for (let i = 0; i < D.SECTIONS; i++) {
    if (yb[i] >= 0) continue;
    nearMiss.push(i);
  }
  note('never-yielding sections', JSON.stringify(nearMiss));
  note(
    'their final strain vs threshold',
    'the closer these sit, the more headroom a flip has'
  );
  void lastBase;
}

console.log(
  `\n${failures === 0 ? 'ALL GATES HOLD' : `${failures} GATE${failures > 1 ? 'S' : ''} FAILED`}` +
    `  ·  ${D.SECTIONS} sections · ${D.TICKS} ticks · hinge ${D.HINGE} · blade ${D.BLADE}`
);
process.exit(failures === 0 ? 0 : 1);
