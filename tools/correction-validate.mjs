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

/**
 * Tuning overrides, so a sweep does not need a source edit between runs. With
 * no flags this is exactly the shipped configuration.
 */
const SYSTEM = {
  ...DEFAULT_SYSTEM,
  ambient: {
    ...DEFAULT_SYSTEM.ambient,
    amplitude: arg('ambient', DEFAULT_SYSTEM.ambient.amplitude),
  },
  correction: {
    ...DEFAULT_SYSTEM.correction,
    thetaOn: arg('thetaOn', DEFAULT_SYSTEM.correction.thetaOn),
    thetaOff: arg('thetaOff', DEFAULT_SYSTEM.correction.thetaOff),
    holdTicks: arg('hold', DEFAULT_SYSTEM.correction.holdTicks),
    stiffnessTo: arg('stiffnessTo', DEFAULT_SYSTEM.correction.stiffnessTo),
    rampTicks: arg('ramp', DEFAULT_SYSTEM.correction.rampTicks),
    senseSeconds: arg('sense', DEFAULT_SYSTEM.correction.senseSeconds),
  },
};

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

const system = new CorrectionSystem(SYSTEM);
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

const EPSILON = SYSTEM.correction.epsilon;
const THETA_ON = SYSTEM.correction.thetaOn;
console.log(`  peak |u - u*| over 7.5s of calm: ${f(calmPeak)}   epsilon ${EPSILON}   theta_on ${THETA_ON}`);
console.log(`  wave peak |u| ${f(system.simulation.peak())}`);

// The threshold that guarantees zero violet is the engagement threshold, not
// the tolerance band. ε is what the operator pulls a node back to; θ_on beyond
// it is what the operator can see at all. An ambient sitting between the two is
// exactly the sub-threshold drift the direction is built on — error the file
// tolerates because it never notices it.
const ENGAGE_AT = EPSILON + THETA_ON;
check(
  'ambient harmonic never reaches the engagement threshold',
  calmPeak < ENGAGE_AT * 0.7,
  `${f(calmPeak)} < ${f(ENGAGE_AT * 0.7)} (engages at ${f(ENGAGE_AT, 2)})`
);
check('calm produces zero enforcement', system.operator.adjustments === 0, `adjustments ${system.operator.adjustments}`);
check('calm produces zero violet', system.operator.engagedCount() === 0);
// Steady state. The harmonic is continuously forced, so "it was fine for seven
// seconds" is not the claim that matters — the claim is that it plateaus and
// never creeps into the system's view during a long visit.
let lateCalmPeak = 0;
for (let t = 0; t < 7200; t++) {
  system.step();
  if (t > 3600) lateCalmPeak = Math.max(lateCalmPeak, system.peakDeviation());
}
console.log(`  peak |u - u*| over the second half of a 60s visit: ${f(lateCalmPeak)}`);
check('the harmonic plateaus rather than creeping', lateCalmPeak < ENGAGE_AT * 0.7, `${f(lateCalmPeak)}`);
check('and still never engages after a minute', system.operator.adjustments === 0, `${system.operator.adjustments}`);

// How far each node actually travels, in the units a visitor sees.
//
// "Peak |u - u*|" is one number for the single most-displaced node at its
// extreme, and it is not what makes a structure look alive: what matters is
// whether a typical filament moves far enough to be seen at all. Reported in
// screen pixels against the shipped camera, because sub-pixel motion on a
// one-pixel line is not motion, it is shimmer.
const DISPLACEMENT_SCALE = 2.8;   // CorrectionModel
const PIXELS_PER_UNIT = 900 / (2 * 22.5 * Math.tan((30 / 2) * Math.PI / 180));

const low = new Float32Array(graph.nodeCount).fill(Infinity);
const high = new Float32Array(graph.nodeCount).fill(-Infinity);
for (let t = 0; t < 1200; t++) {
  system.step();
  const u = system.simulation.u;
  for (let i = 0; i < u.length; i++) {
    if (u[i] < low[i]) low[i] = u[i];
    if (u[i] > high[i]) high[i] = u[i];
  }
}
const travel = Array.from({ length: graph.nodeCount }, (_, i) => high[i] - low[i]).sort((x, y) => x - y);
const at = (q) => travel[Math.floor(travel.length * q)] * DISPLACEMENT_SCALE * PIXELS_PER_UNIT;
console.log(
  `  travel over 10s of calm, px on screen:  p10 ${f(at(0.1), 1)}  median ${f(at(0.5), 1)}  ` +
    `p90 ${f(at(0.9), 1)}  max ${f(at(0.999), 1)}`
);

check('the harmonic is not dead', calmPeak > EPSILON * 0.15, `${f(calmPeak)} > ${f(EPSILON * 0.15)}`);
// Below about three pixels of travel a one-pixel line only changes its
// antialiasing, which reads as faint noise rather than as a structure breathing.
check('a typical filament visibly moves', at(0.5) >= 3, `median ${f(at(0.5), 1)}px`);
check('the calm moves everywhere, not in a few spots', at(0.1) >= 1.5, `p10 ${f(at(0.1), 1)}px`);

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
let engagedTicks = 0;
let engagedSum = 0;
/** Nodes held, per tick, for the whole observation window. */
const engagedSeries = [];
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
    engagedTicks++;
    engagedSum += engaged;
  }
  engagedSeries.push(engaged);
  if (flag('trace') && t % 24 === 0) {
    trace.push(
      `    t+${String(system.tick - injectTick).padStart(4)}  dev ${f(deviation, 3)}  ` +
        `engaged ${String(engaged).padStart(4)}  adjustments ${system.operator.adjustments}`
    );
  }
}

function a_heldStats(log) {
  if (!log.length) return { min: 0, median: 0, max: 0 };
  const held = log.map((e) => e.heldTicks).sort((x, y) => x - y);
  return { min: held[0], median: held[held.length >> 1], max: held[held.length - 1] };
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
  settledAt10s < SYSTEM.correction.thetaOff + EPSILON,
  `${f(settledAt10s)} < ${f(SYSTEM.correction.thetaOff + EPSILON)}`
);
check('and keeps settling toward the ambient floor', settledAt20s < settledAt10s, `${f(settledAt20s)}`);
check('enforcement released', system.operator.engagedCount() === 0, `${system.operator.engagedCount()} held`);
// Duty cycle. The span between the first and last engagement means nothing on
// its own: enforcement that flickers on for four ticks at a time inside a
// three-second window is not something a person can watch, it is a sparkle.
//
// Measured over the body of the event, not out to the last straggler. A single
// node engaging alone two seconds after the correction has finished stretches
// the span and drags the ratio down while changing nothing about what the
// visitor sees, so the window closes once concurrency falls below a tenth of
// its peak and stays there.
const span = lastEngageTick - firstEngageTick + 1;
const floorHeld = Math.max(2, maxEngaged * 0.1);
let bodyEnd = 0;
for (let i = 0; i < engagedSeries.length; i++) if (engagedSeries[i] >= floorHeld) bodyEnd = i;
let bodyStart = engagedSeries.findIndex((n) => n > 0);
let bodyTicks = 0;
for (let i = bodyStart; i <= bodyEnd; i++) if (engagedSeries[i] > 0) bodyTicks++;
const bodySpan = Math.max(bodyEnd - bodyStart + 1, 1);
const duty = bodyTicks / bodySpan;
const held = a_heldStats(system.operator.log);
console.log(
  `  continuity: violet present on ${bodyTicks}/${bodySpan} ticks of the event body ` +
    `(${f(duty * 100, 0)}%, ${ms(bodySpan)}), mean ${f(engagedSum / Math.max(engagedTicks, 1), 1)} nodes held, ` +
    `peak ${maxEngaged}`
);
console.log(`  full span including stragglers: ${ms(span)}`);
console.log(`  per-node hold: min ${held.min} median ${held.median} max ${held.max} ticks (${ms(held.median)} typical)`);

check('enforcement is continuous enough to watch (>=80% duty)', duty >= 0.8, `${f(duty * 100, 0)}%`);
check('a single correction lasts long enough to read (>=0.15s)', held.median * dt >= 0.15, `${ms(held.median)}`);
// If the ramp does not finish inside a typical hold, the node strains and is
// then released as the wave moves on — the snap never happens and the operator
// is only ever glowing at a deviation that was subsiding anyway.
check(
  'the stiffness ramp completes inside a typical hold',
  held.median >= SYSTEM.correction.rampTicks,
  `hold ${held.median} ticks vs ramp ${SYSTEM.correction.rampTicks}`
);
const meanRemoved = system.operator.log.reduce((t, e) => t + e.removed, 0) / Math.max(system.operator.log.length, 1);
console.log(`  mean displacement removed per correction: ${f(meanRemoved, 4)}`);
check('each correction removes real displacement', meanRemoved > 0.05, `${f(meanRemoved, 4)}`);
check('a trace was retained', scarred > 0, `${scarred} nodes`);
// The event log is a bounded ring, so it saturates at the limit while the
// counter keeps going. The counter is what the floor panel reports.
const limit = SYSTEM.correction.eventLogLimit;
const closed = system.operator.adjustments - system.operator.engagedCount();
check(
  'the count is derived, not authored',
  closed >= 0 && system.operator.log.length === Math.min(closed, limit),
  `${system.operator.adjustments} adjustments, ${closed} closed, log holds ${system.operator.log.length} (cap ${limit})`
);

// -------------------------------------------------------- enforcement gain

console.log('\nENFORCEMENT GAIN');

// The spatial field. It must be a single monotone gradient along the veil's
// long axis: anything centred would draw a soft ellipse across the structure,
// and a frame that resolves into concentric anything fails outright.
{
  const field = system.operator.gainField;
  const order = Array.from({ length: graph.nodeCount }, (_, i) => i).sort(
    (i, j) => graph.positions[j * 3] - graph.positions[i * 3]
  );

  let monotone = true;
  for (let k = 1; k < order.length; k++) {
    // Sorted from +x to -x, gain must never fall.
    if (field[order[k]] < field[order[k - 1]] - 1e-6) { monotone = false; break; }
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < field.length; i++) {
    if (field[i] < lo) lo = field[i];
    if (field[i] > hi) hi = field[i];
  }
  console.log(`  spatial gain  fringe ${f(lo, 3)}  deep ${f(hi, 3)}`);
  check('gain is monotone along the long axis, not radial', monotone);
  check(
    'gain spans the configured range',
    Math.abs(lo - SYSTEM.correction.spatialGainLow) < 0.02 &&
      Math.abs(hi - SYSTEM.correction.spatialGainHigh) < 0.02,
    `${f(lo, 2)}..${f(hi, 2)}`
  );
}

/**
 * Same strike, same node, different narrative depth. The claim being tested is
 * the one the descent is built on: deeper down, deviation dies sooner.
 */
function strikeAt(gain) {
  const s = new CorrectionSystem(SYSTEM);
  s.warmUp();
  s.setGain(gain);
  for (let t = 0; t < 600; t++) s.step();
  const before = s.operator.adjustments;
  s.inject(target, ENERGY);

  let alive = 0;
  const settleAt = SYSTEM.correction.thetaOff + EPSILON;
  for (let t = 0; t < 1800; t++) {
    s.step();
    if (s.peakDeviation() > settleAt) alive = t;
  }
  return { s, alive, adjustments: s.operator.adjustments - before };
}

const shallow = strikeAt(1.0);
const deep = strikeAt(2.2);
console.log(
  `  gain 1.0 (opening)  deviation stays visible ${ms(shallow.alive)}, ${shallow.adjustments} adjustments`
);
console.log(
  `  gain 2.2 (floor)    deviation stays visible ${ms(deep.alive)}, ${deep.adjustments} adjustments`
);
check('raising gain shortens the life of a deviation', deep.alive < shallow.alive * 0.9, `${ms(deep.alive)} < ${ms(shallow.alive)}`);
check('and the system still engages at both ends', shallow.adjustments > 0 && deep.adjustments > 0);

// The calm has to survive the deepest enforcement. Thresholds are deliberately
// not scaled by gain — if they were, the ambient harmonic would eventually be
// seen, the deep calm would fill with violet, and the opening frame would be a
// lie about what the system does.
{
  const s = new CorrectionSystem(SYSTEM);
  s.warmUp();
  s.setGain(2.2);
  let peak = 0;
  for (let t = 0; t < 3600; t++) {
    s.step();
    peak = Math.max(peak, s.peakDeviation());
  }
  console.log(`  calm at maximum gain: peak |u - u*| ${f(peak)}, ${s.operator.adjustments} adjustments`);
  check('the calm is never enforced, even at maximum gain', s.operator.adjustments === 0, `${s.operator.adjustments}`);
}

// ------------------------------------------------------------------- replay

console.log('\nREPLAY');

/**
 * The recorded trace is every input that changes what the system does: the
 * injection AND the scroll-driven gain. If gain were applied outside this
 * channel the determinism claim would quietly stop covering half the run.
 */
const GAIN_TRACE = [
  [0, 1.0],
  [240, 1.4],
  [600, 2.2],
];
const OTHER_TRACE = [
  [0, 1.0],
  [240, 1.0],
  [600, 1.2],
];

function run(gainTrace = GAIN_TRACE) {
  const s = new CorrectionSystem(SYSTEM);
  s.warmUp();
  for (let t = 0; t < 900; t++) s.step();
  s.inject(target, ENERGY);
  for (let t = 0; t < TICKS; t++) {
    for (const [at, value] of gainTrace) if (at === t) s.setGain(value);
    s.step();
  }
  return s;
}

const a = run();
const b = run();

console.log(`  A checksum 0x${a.checksum().toString(16).padStart(8, '0')}   adjustments ${a.operator.adjustments}`);
console.log(`  B checksum 0x${b.checksum().toString(16).padStart(8, '0')}   adjustments ${b.operator.adjustments}`);

check('same seed + same trace replays to the same checksum', a.checksum() === b.checksum());
check(
  'a different scroll is a different run',
  run(OTHER_TRACE).checksum() !== a.checksum()
);
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
  ...SYSTEM,
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
