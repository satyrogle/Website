/**
 * correction-validate.mjs — does the correction actually happen, and does it
 * reproduce?
 *
 * Runs the authoritative system headlessly, with no renderer, so a failure here
 * is a failure of the mechanism rather than of a shader. It steps the exact
 * modules the browser steps — `CorrectionSystem` has no Worker and no DOM
 * dependency for precisely this reason — so a claim made here is a claim about
 * what runs in production.
 *
 *   node tools/correction-validate.mjs
 *   node tools/correction-validate.mjs --energy 1.2 --ticks 1600
 *
 * Exits non-zero if any gate fails.
 *
 * Rewritten for the choir. The band-era version swept wave speed and damping
 * against reflection artefacts; there is no wave any more, so those gates were
 * measuring a mechanism that no longer exists.
 */

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Node strips types from .ts on its own, but it will not guess an extension the
 * way a bundler does, and the site's source is written against Vite's
 * resolution. Rather than pollute src/ with .ts specifiers for the benefit of
 * one script, the extension is supplied here. No dependency, no build step.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
      const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.argv[1];
      const candidate = resolvePath(dirname(parent), `${specifier}.ts`);
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const { CorrectionSystem, DEFAULT_SYSTEM } = await import(
  '../src/scene/correction/sim/CorrectionSystem.ts'
);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};

const ENERGY = arg('energy', 0.8);
const TICKS = arg('ticks', 1400);

/** Where the scripted press lands, in field coordinates. */
const STRIKE = [-1.4, 1.1, 0.4];

let failures = 0;
const gate = (name, pass, detail) => {
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// ---------------------------------------------------------------- the field

console.log('\nTHE LAW');

const built = new CorrectionSystem(DEFAULT_SYSTEM);
const { audit, stats, bounds } = built.synthesised;
const { minAlignment } = DEFAULT_SYSTEM.synth.field;
const { dt, relaxation, coupling } = DEFAULT_SYSTEM.dynamics;
const step = dt * (relaxation + coupling * bounds.lambdaMaxBound);

// The cone clamp in ChoirField.sample guarantees this. A failure means the
// construction has been broken and nothing is stopping closed circulation —
// which is how every retired direction here became a ring.
gate(
  'flow invariant holds across the domain',
  audit.minAlignment >= minAlignment - 1e-3,
  `min alignment ${audit.minAlignment.toFixed(4)} vs ${minAlignment}, over ${audit.samples} samples`
);
gate(
  'streamlines never turn back',
  audit.minAdvance > 0,
  `smallest advance along the flow ${audit.minAdvance.toFixed(5)}`
);
gate(
  'every blade is coupled to the field',
  stats.degreeMin >= 1,
  `degree ${stats.degreeMin}–${stats.degreeMax}, mean ${stats.degreeMean.toFixed(2)}`
);
gate('timestep is inside the accuracy bound', step <= 0.5, `dt·(γ + κ·λ) = ${step.toFixed(4)}`);

console.log(
  `  ${stats.nodes} blades, ${stats.edges} coupling edges, ` +
    `${stats.shellNodes} in the shell, ${stats.giants} near field`
);

// ------------------------------------------------------------------ the calm

console.log('\nTHE CALM — deviation the system cannot see');

built.warmUp();
const ambientPeak = built.peakDeviation();
const threshold = DEFAULT_SYSTEM.correction.epsilon + DEFAULT_SYSTEM.correction.thetaOn;

gate(
  'ambient drift never engages the operator',
  built.operator.adjustments === 0 && built.operator.engagedCount() === 0,
  `${built.operator.adjustments} adjustments after warm-up`
);
gate(
  'ambient stays clear of the sensor',
  ambientPeak < threshold * 0.5,
  `peak |u − u*| ${ambientPeak.toFixed(4)} against engagement at ${threshold.toFixed(3)}`
);

// And it must not be a still image. The opening is a held breath, not a
// photograph — a gate that only checked the threshold would pass a world that
// never moved at all, which is the failure this half exists to catch.
const before = Float32Array.from(built.simulation.u);
for (let i = 0; i < 600; i++) built.step();
let moved = 0;
for (let i = 0; i < before.length; i++) {
  const d = Math.abs(built.simulation.u[i] - before[i]);
  if (d > moved) moved = d;
}
gate('the calm is not static', moved > 0.01, `largest blade movement over 5 s: ${moved.toFixed(4)}`);

// ----------------------------------------------------------- one enforcement

console.log('\nONE ENFORCEMENT EVENT');

const strike = built.synthesised.field.toWorld(STRIKE);
const node = built.nearestNode(strike[0], strike[1], strike[2]);
const adjustmentsBefore = built.operator.adjustments;
built.inject(node, ENERGY);

let noticedAt = -1;
let releasedAt = -1;
let peakHeld = 0;
for (let t = 0; t < TICKS; t++) {
  built.step();
  const held = built.operator.engagedCount();
  if (held > 0) {
    if (noticedAt < 0) noticedAt = t;
    releasedAt = t;
    if (held > peakHeld) peakHeld = held;
  }
}

const adjustments = built.operator.adjustments - adjustmentsBefore;

gate(
  'the system notices',
  noticedAt >= 0,
  noticedAt < 0 ? 'never engaged' : `after ${(noticedAt / 120).toFixed(2)} s`
);
gate(
  'it waits before acting',
  noticedAt >= DEFAULT_SYSTEM.correction.holdTicks * 0.5,
  `awareness latency ${noticedAt} ticks`
);
gate('it takes hold of a region, not a blade', peakHeld >= 8, `${peakHeld} blades held at peak`);
gate(
  'the grip lasts long enough to watch',
  releasedAt - noticedAt >= 60,
  `${((releasedAt - noticedAt) / 120).toFixed(2)} s of enforcement`
);
gate('it lets go', built.operator.engagedCount() === 0, `${built.operator.engagedCount()} still held`);
gate(
  'the world returns to the record',
  built.operator.visibleResidual() === 0,
  `visible residual ${built.operator.visibleResidual().toFixed(5)}`
);
gate('the correction is counted', adjustments > 0, `${adjustments} adjustments`);

let scarred = 0;
for (let i = 0; i < built.operator.scar.length; i++) if (built.operator.scar[i] > 1e-4) scarred++;
gate('a mark is left behind', scarred > 0, `${scarred} blades carry a scar`);

// ------------------------------------------------------------- determinism

console.log('\nDETERMINISM — same seed, same trace, same world');

function run() {
  const system = new CorrectionSystem(DEFAULT_SYSTEM);
  system.warmUp();
  const point = system.synthesised.field.toWorld(STRIKE);
  const at = system.nearestNode(point[0], point[1], point[2]);
  system.inject(at, ENERGY);
  // A gain change mid-run, because narrative gain is an input to the run: a
  // replay that scrolled differently is a different run, and the checksum has
  // to be able to tell.
  for (let t = 0; t < 400; t++) {
    if (t === 120) system.setGain(1.6);
    system.step();
  }
  return { checksum: system.checksum(), adjustments: system.operator.adjustments };
}

const first = run();
const second = run();
gate(
  'two runs agree exactly',
  first.checksum === second.checksum && first.adjustments === second.adjustments,
  `${first.checksum.toString(16)} vs ${second.checksum.toString(16)}, ` +
    `${first.adjustments} vs ${second.adjustments} adjustments`
);

console.log(`\n${failures === 0 ? 'all gates passed' : `${failures} gate(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
