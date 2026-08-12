/**
 * correction-validate.mjs — does the correction actually happen, and does it
 * reproduce?
 *
 * Runs the authoritative system headlessly, with no renderer, so a failure here
 * is a failure of the mechanism rather than of a shader. Adapted from the
 * spike's tools/causal-pulse-validate.mjs.
 *
 *   node tools/correction-validate.mjs
 *   node tools/correction-validate.mjs --energy 3 --ticks 900 --trace
 *
 * Exits non-zero if any assertion fails.
 */

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Node strips types from .ts on its own, but it will not guess an extension the
 * way a bundler does, and the site's source is written against Vite's
 * resolution. Rather than pollute src/ with .ts specifiers for the benefit of
 * one script, the extension is supplied here. No dependency, no build step —
 * this file steps the same modules the browser does.
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

const { synthesiseGraph, DEFAULT_SYNTH } = await import('../src/scene/correction/graph/GraphSynth.ts');
const { CorrectionSystem, DEFAULT_SYSTEM } = await import('../src/scene/correction/sim/CorrectionSystem.ts');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const flag = (name) => process.argv.includes(`--${name}`);

const ENERGY = arg('energy', 2.2);
const TICKS = arg('ticks', 1200);

const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const f = (x, n = 4) => Number(x).toFixed(n);

// ---------------------------------------------------------------- the graph

console.log('\nGRAPH');

const t0 = performance.now();
const { graph, bounds, stats } = synthesiseGraph(DEFAULT_SYNTH);
const synthMs = performance.now() - t0;

console.log(`  nodes ${stats.nodes}   edges ${stats.edges}   entries ${graph.entryCount}`);
console.log(
  `  degree min ${stats.degreeMin} mean ${f(stats.degreeMean, 2)} max ${stats.degreeMax}   ` +
    `median edge ${f(stats.medianEdgeLength, 3)}`
);
console.log(`  components ${stats.components} (bridges added ${stats.bridgesAdded})   synth ${f(synthMs, 1)}ms`);
console.log(
  `  stability  maxWeightedDegree ${f(bounds.maxWeightedDegree, 3)}  ` +
    `waveDtMax ${f(bounds.waveDtMax, 4)}  c*dt ${f(DEFAULT_SYSTEM.wave.waveSpeed * DEFAULT_SYSTEM.wave.dt, 4)}`
);

check('node count in the 2,000–4,000 band', stats.nodes >= 2000 && stats.nodes <= 4000, `${stats.nodes}`);
check('no isolated nodes', stats.degreeMin >= 1, `min degree ${stats.degreeMin}`);
check('single connected component after bridging', (() => {
  const seen = new Uint8Array(graph.nodeCount);
  const stack = [0];
  seen[0] = 1;
  let count = 1;
  while (stack.length) {
    const i = stack.pop();
    for (let k = graph.offsets[i]; k < graph.offsets[i + 1]; k++) {
      const j = graph.neighbours[k];
      if (!seen[j]) { seen[j] = 1; count++; stack.push(j); }
    }
  }
  return count === graph.nodeCount;
})());
check(
  'timestep inside the spectral bound',
  DEFAULT_SYSTEM.wave.waveSpeed * DEFAULT_SYSTEM.wave.dt < bounds.waveDtMax,
  `margin ${f(bounds.waveDtMax - DEFAULT_SYSTEM.wave.waveSpeed * DEFAULT_SYSTEM.wave.dt, 4)}`
);

// CSR symmetry. An asymmetric adjacency still renders, which is the worst kind
// of failure, so it is asserted rather than assumed.
check('CSR adjacency symmetric', (() => {
  for (let i = 0; i < graph.nodeCount; i++) {
    for (let k = graph.offsets[i]; k < graph.offsets[i + 1]; k++) {
      const j = graph.neighbours[k];
      let found = false;
      for (let m = graph.offsets[j]; m < graph.offsets[j + 1]; m++) {
        if (graph.neighbours[m] === i && graph.weights[m] === graph.weights[k]) { found = true; break; }
      }
      if (!found) return false;
    }
  }
  return true;
})());

// Rotational-symmetry guard. Every retired direction died as concentric rings,
// so this measures whether node radius about the structure's own centroid
// clusters into shells. A ring construction produces a spiky radius histogram;
// an irregular scatter produces a smooth one.
{
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < graph.nodeCount; i++) {
    cx += graph.positions[i * 3];
    cy += graph.positions[i * 3 + 1];
    cz += graph.positions[i * 3 + 2];
  }
  cx /= graph.nodeCount; cy /= graph.nodeCount; cz /= graph.nodeCount;

  const BINS = 48;
  const radii = [];
  let maxR = 0;
  for (let i = 0; i < graph.nodeCount; i++) {
    const r = Math.hypot(
      graph.positions[i * 3] - cx,
      graph.positions[i * 3 + 1] - cy,
      graph.positions[i * 3 + 2] - cz
    );
    radii.push(r);
    if (r > maxR) maxR = r;
  }
  const hist = new Array(BINS).fill(0);
  for (const r of radii) hist[Math.min(BINS - 1, Math.floor((r / maxR) * BINS))]++;
  const mean = graph.nodeCount / BINS;
  let peak = 0;
  for (const h of hist) if (h > peak) peak = h;
  // Concentric construction puts a whole ring in one bin: ratios of 5–20x.
  check('radius histogram has no shell spikes', peak / mean < 3.2, `peak/mean ${f(peak / mean, 2)}`);

  // And the veil must actually be anisotropic, not a ball.
  let ex = 0, ey = 0, ez = 0;
  for (let i = 0; i < graph.nodeCount; i++) {
    ex = Math.max(ex, Math.abs(graph.positions[i * 3] - cx));
    ey = Math.max(ey, Math.abs(graph.positions[i * 3 + 1] - cy));
    ez = Math.max(ez, Math.abs(graph.positions[i * 3 + 2] - cz));
  }
  console.log(`  extent  x ${f(ex, 2)}  y ${f(ey, 2)}  z ${f(ez, 2)}`);
  check('anisotropic: long axis at least 3x the thin axis', ex / ey >= 3, `x/y ${f(ex / ey, 2)}`);
}

// -------------------------------------------------------------- the calm

console.log('\nCALM AND RECORD');

const system = new CorrectionSystem();
const warmStart = performance.now();
system.warmUp();
const warmMs = performance.now() - warmStart;

console.log(
  `  warm-up ${DEFAULT_SYSTEM.warmUpTicks} ticks in ${f(warmMs, 1)}ms ` +
    `(${f((warmMs / DEFAULT_SYSTEM.warmUpTicks) * 1000, 1)}µs/tick)`
);

// Let the harmonic run past the record and measure how far it drifts.
let calmPeak = 0;
for (let t = 0; t < 900; t++) {
  system.step();
  calmPeak = Math.max(calmPeak, system.peakDeviation());
}

const EPSILON = DEFAULT_SYSTEM.correction.epsilon;
const THETA_ON = DEFAULT_SYSTEM.correction.thetaOn;
console.log(`  peak |u - u*| over 7.5s of calm: ${f(calmPeak)}   epsilon ${EPSILON}   theta_on ${THETA_ON}`);
console.log(`  wave peak |u| ${f(system.simulation.peak())}`);

check('ambient harmonic stays inside the tolerance band', calmPeak < EPSILON, `${f(calmPeak)} < ${EPSILON}`);
check('calm produces zero enforcement', system.operator.adjustments === 0, `adjustments ${system.operator.adjustments}`);
check('calm produces zero violet', system.operator.engagedCount() === 0);
check('the harmonic is not dead', calmPeak > EPSILON * 0.15, `${f(calmPeak)} > ${f(EPSILON * 0.15)}`);

// ------------------------------------------------------ one correction event

console.log('\nONE CORRECTION EVENT');

// Deterministic target: the node nearest a fixed point off the structure's
// centre, so the strike lands somewhere with neighbours in every direction.
const target = (() => {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < graph.nodeCount; i++) {
    const d = Math.hypot(
      graph.positions[i * 3] - 1.4,
      graph.positions[i * 3 + 1],
      graph.positions[i * 3 + 2] + 0.6
    );
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
})();

const injectTick = system.tick;
system.inject(target, ENERGY);

let peakDeviation = 0;
let peakTick = -1;
let firstEngageTick = -1;
let lastEngageTick = -1;
let maxEngaged = 0;
const trace = [];

// Reach: nodes whose deviation ever became visible (past ε), and how far the
// furthest of them sits from the strike. This is what decides whether a press
// reads as a ripple through the structure or as a dot lighting up.
const touched = new Uint8Array(graph.nodeCount);
let reachDistance = 0;

for (let t = 0; t < TICKS; t++) {
  system.step();
  const deviation = system.peakDeviation();
  const engaged = system.operator.engagedCount();

  const u = system.simulation.u;
  const record = system.operator.record;
  for (let i = 0; i < u.length; i++) {
    if (touched[i] || Math.abs(u[i] - record[i]) <= EPSILON) continue;
    touched[i] = 1;
    const d = Math.hypot(
      graph.positions[i * 3] - graph.positions[target * 3],
      graph.positions[i * 3 + 1] - graph.positions[target * 3 + 1],
      graph.positions[i * 3 + 2] - graph.positions[target * 3 + 2]
    );
    if (d > reachDistance) reachDistance = d;
  }

  if (deviation > peakDeviation) { peakDeviation = deviation; peakTick = system.tick; }
  if (engaged > 0) {
    if (firstEngageTick === -1) firstEngageTick = system.tick;
    lastEngageTick = system.tick;
    if (engaged > maxEngaged) maxEngaged = engaged;
  }
  if (flag('trace') && t % 24 === 0) {
    trace.push(
      `    t+${String(system.tick - injectTick).padStart(4)}  dev ${f(deviation, 3)}  ` +
        `engaged ${String(engaged).padStart(4)}  adjustments ${system.operator.adjustments}`
    );
  }
}

const dt = DEFAULT_SYSTEM.wave.dt;
const ms = (ticks) => `${Math.round(ticks * dt * 1000)}ms`;

if (flag('trace')) console.log(trace.join('\n'));

console.log(`  strike node ${target}, energy ${ENERGY}`);
console.log(`  1 deviation   peak |u-u*| ${f(peakDeviation)} at t+${peakTick - injectTick} (${ms(peakTick - injectTick)})`);
console.log(`  2 awareness   first engagement t+${firstEngageTick - injectTick} (${ms(firstEngageTick - injectTick)})`);
console.log(`  3-5 strain..settle  enforcement spans ${lastEngageTick - firstEngageTick} ticks (${ms(lastEngageTick - firstEngageTick)})`);
console.log(`  6 trace       adjustments ${system.operator.adjustments}, peak nodes held at once ${maxEngaged}`);
console.log(`  residual |u-u*| ${f(system.peakDeviation())}   correction energy ${f(system.operator.correctionEnergy, 3)}`);

let bruised = 0;
let scarred = 0;
let peakBruise = 0;
for (let i = 0; i < graph.nodeCount; i++) {
  if (system.operator.bruise[i] > 1e-4) bruised++;
  if (system.operator.scar[i] > 1e-4) scarred++;
  peakBruise = Math.max(peakBruise, system.operator.bruise[i] + system.operator.scar[i]);
}
console.log(`  bruised nodes ${bruised}   permanently scarred ${scarred}   peak bruise ${f(peakBruise, 3)}`);

let touchedCount = 0;
for (let i = 0; i < touched.length; i++) touchedCount += touched[i];
console.log(
  `  reach: ${touchedCount} nodes deviated past epsilon (${f((touchedCount / graph.nodeCount) * 100, 1)}%), ` +
    `furthest ${f(reachDistance, 2)} units from the strike`
);
check('the deviation travels rather than blooming in place', reachDistance > 2.0, `${f(reachDistance, 2)} units`);
check('the ripple involves a readable share of the structure', touchedCount >= 120, `${touchedCount} nodes`);

check('the deviation is visible before it is noticed', peakDeviation > THETA_ON + EPSILON, `${f(peakDeviation)}`);
check('the system engaged', firstEngageTick !== -1, `${system.operator.adjustments} adjustments`);
check(
  'awareness latency is a visible gap (0.3-1.2s after the strike)',
  firstEngageTick !== -1 && (firstEngageTick - injectTick) * dt >= 0.3 && (firstEngageTick - injectTick) * dt <= 1.2,
  firstEngageTick === -1 ? 'never engaged' : ms(firstEngageTick - injectTick)
);
check(
  'enforcement takes long enough to watch (>=0.25s) and terminates (<8s)',
  firstEngageTick !== -1 && (lastEngageTick - firstEngageTick) * dt >= 0.25 && (lastEngageTick - firstEngageTick) * dt < 8,
  firstEngageTick === -1 ? 'never engaged' : ms(lastEngageTick - firstEngageTick)
);
// The world is returned below what the system will act on, not to the record.
// Everything under θ_off is invisible to the operator by construction — this is
// the sparse-sensor consequence the direction is built on, so asserting a
// return to zero would be asserting against the model.
const settledAt10s = system.peakDeviation();
for (let t = 0; t < 1200; t++) system.step();
const settledAt20s = system.peakDeviation();
console.log(`  settle: |u-u*| ${f(settledAt10s)} at +10s  →  ${f(settledAt20s)} at +20s   (ambient floor ~${f(calmPeak)})`);

check(
  'the world is returned below the release threshold',
  settledAt10s < DEFAULT_SYSTEM.correction.thetaOff + EPSILON,
  `${f(settledAt10s)} < ${f(DEFAULT_SYSTEM.correction.thetaOff + EPSILON)}`
);
check('and keeps settling toward the ambient floor', settledAt20s < settledAt10s, `${f(settledAt20s)}`);
check('enforcement released', system.operator.engagedCount() === 0, `${system.operator.engagedCount()} held`);
check('a trace was retained', scarred > 0, `${scarred} nodes`);
check('the count is derived, not authored', system.operator.adjustments === system.operator.log.length + system.operator.engagedCount(),
  `${system.operator.adjustments} = ${system.operator.log.length} closed + ${system.operator.engagedCount()} open`);

// ------------------------------------------------------------------- replay

console.log('\nREPLAY');

function run() {
  const s = new CorrectionSystem();
  s.warmUp();
  for (let t = 0; t < 900; t++) s.step();
  s.inject(target, ENERGY);
  for (let t = 0; t < TICKS; t++) s.step();
  return s;
}

const a = run();
const b = run();

console.log(`  A checksum 0x${a.checksum().toString(16).padStart(8, '0')}   adjustments ${a.operator.adjustments}`);
console.log(`  B checksum 0x${b.checksum().toString(16).padStart(8, '0')}   adjustments ${b.operator.adjustments}`);

check('same seed + same trace replays to the same checksum', a.checksum() === b.checksum());
check('same adjustment count', a.operator.adjustments === b.operator.adjustments);
check(
  'correction events match 1:1',
  a.operator.log.length === b.operator.log.length &&
    a.operator.log.every((e, i) => {
      const o = b.operator.log[i];
      return e.node === o.node && e.engagedAt === o.engagedAt && e.heldTicks === o.heldTicks && e.removed === o.removed;
    }),
  `${a.operator.log.length} events`
);

// A different seed must not accidentally produce the same run.
const other = new CorrectionSystem({
  ...DEFAULT_SYSTEM,
  synth: { ...DEFAULT_SYNTH, seed: DEFAULT_SYNTH.seed ^ 0x1234 },
});
other.warmUp();
for (let t = 0; t < 900; t++) other.step();
check('a different seed produces a different run', other.checksum() !== a.checksum());

if (a.operator.log.length) {
  console.log('  first three events {node, engagedAt, heldTicks, removed}:');
  for (const e of a.operator.log.slice(0, 3)) {
    console.log(`    { ${e.node}, ${e.engagedAt}, ${e.heldTicks}, ${f(e.removed, 4)} }`);
  }
}

// -------------------------------------------------------------------- pacing

console.log('\nPACING');
const paceStart = performance.now();
for (let t = 0; t < 1200; t++) a.step();
const paceMs = performance.now() - paceStart;
const perTick = paceMs / 1200;
console.log(`  ${f(perTick * 1000, 1)}µs/tick  →  ${f(perTick * 120, 2)}ms of work per second of simulated time`);
// The system runs in a Worker, so the budget is about staying far enough under
// real time that a low tier still keeps up, not about a frame deadline.
check('Worker keeps ahead of real time with room to spare (<60ms/s)', perTick * 120 < 60, `${f(perTick * 120, 2)}ms`);

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILED: ${failures.join(', ')}`}\n`);
process.exit(failures.length === 0 ? 0 : 1);
