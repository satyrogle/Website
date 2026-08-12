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

const { synthesiseSurface, DEFAULT_SURFACE } = await import('../src/scene/correction/graph/SurfaceSynth.ts');
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
const { graph, bounds, stats, triangles } = synthesiseSurface(DEFAULT_SURFACE);
const synthMs = performance.now() - t0;

console.log(`  nodes ${stats.nodes}   edges ${stats.edges}   triangles ${stats.triangles}   entries ${graph.entryCount}`);
console.log(
  `  degree min ${stats.degreeMin} mean ${f(stats.degreeMean, 2)} max ${stats.degreeMax}   ` +
    `median edge ${f(stats.medianEdgeLength, 3)}`
);
console.log(`  synth ${f(synthMs, 1)}ms`);
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

// Construction guards.
//
// The old radius-histogram shell test is gone: on a flat convex plate, distance
// from the centroid measures the outline of the polygon and nothing else, so it
// reported the plate's own corners as ring structure. The ring risk for a
// surface is not in where the points are, it is in how a disturbance spreads —
// a point strike on an isotropic medium makes circular ripples. That is tested
// against the live deviation field after the strike, below, which is where it
// can actually happen.
{
  // Spacing must be irregular. A grid or a jittered grid has a sharply peaked
  // nearest-neighbour distribution; Poisson-disk points do not.
  const spacings = [];
  for (let i = 0; i < graph.nodeCount; i++) {
    let nearest = Infinity;
    for (let k = graph.offsets[i]; k < graph.offsets[i + 1]; k++) {
      const j = graph.neighbours[k];
      const d = Math.hypot(graph.positions[j * 3] - graph.positions[i * 3], graph.positions[j * 3 + 2] - graph.positions[i * 3 + 2]);
      if (d < nearest) nearest = d;
    }
    spacings.push(nearest);
  }
  spacings.sort((a, b) => a - b);
  const spread = spacings[Math.floor(spacings.length * 0.9)] / spacings[Math.floor(spacings.length * 0.1)];
  console.log(`  nearest-neighbour spacing p10..p90 spread ${f(spread, 2)}x`);
  check('spacing is irregular, not a grid', spread > 1.12, `${f(spread, 2)}x`);

  // Every triangle must be a real triangle: a triangulation with slivers or
  // zero-area faces shades as a field of black creases.
  let worstAspect = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const ab = Math.hypot(graph.positions[b * 3] - graph.positions[a * 3], graph.positions[b * 3 + 2] - graph.positions[a * 3 + 2]);
    const bc = Math.hypot(graph.positions[c * 3] - graph.positions[b * 3], graph.positions[c * 3 + 2] - graph.positions[b * 3 + 2]);
    const ca = Math.hypot(graph.positions[a * 3] - graph.positions[c * 3], graph.positions[a * 3 + 2] - graph.positions[c * 3 + 2]);
    const sp = (ab + bc + ca) / 2;
    const area = Math.sqrt(Math.max(sp * (sp - ab) * (sp - bc) * (sp - ca), 0));
    const aspect = area > 0 ? (ab * bc * ca) / (8 * (sp - ab) * (sp - bc) * (sp - ca)) : Infinity;
    if (aspect > worstAspect) worstAspect = aspect;
  }
  console.log(`  worst triangle aspect ratio ${f(worstAspect, 2)}`);
  check('no sliver triangles', worstAspect < 12, `${f(worstAspect, 2)}`);
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

// What the light actually reads.
//
// Pixel travel was the right metric for a line structure and is the wrong one
// here: this surface is seen by its shading, and shading responds to *slope*,
// not to height. With the key light raking at 0.075 radians above the plate, a
// slope change of a hundredth of a radian swings N·L by more than a tenth. A
// swelling far too shallow to see as a shape is unmissable, and a broad gentle
// heave with no slope in it is invisible however far it moves.
const DISPLACEMENT_SCALE = 0.9;   // CorrectionModel
const LIGHT_ELEVATION = 0.075;    // CorrectionModel LIGHT.y

const lowX = new Float32Array(graph.nodeCount).fill(Infinity);
const highX = new Float32Array(graph.nodeCount).fill(-Infinity);
const lowZ = new Float32Array(graph.nodeCount).fill(Infinity);
const highZ = new Float32Array(graph.nodeCount).fill(-Infinity);
for (let t = 0; t < 1200; t++) {
  system.step();
  if (t % 6) continue;
  system.computeGradients();
  for (let i = 0; i < graph.nodeCount; i++) {
    const gx = system.gradientX[i];
    const gz = system.gradientZ[i];
    if (gx < lowX[i]) lowX[i] = gx;
    if (gx > highX[i]) highX[i] = gx;
    if (gz < lowZ[i]) lowZ[i] = gz;
    if (gz > highZ[i]) highZ[i] = gz;
  }
}
const swing = Array.from({ length: graph.nodeCount }, (_, i) =>
  Math.hypot(highX[i] - lowX[i], highZ[i] - lowZ[i]) * DISPLACEMENT_SCALE
).sort((a, b) => a - b);
const q = (p) => swing[Math.floor(swing.length * p)];
console.log(
  `  slope swing over 10s of calm, as a fraction of the light's elevation:  ` +
    `p10 ${f(q(0.1) / LIGHT_ELEVATION, 2)}  median ${f(q(0.5) / LIGHT_ELEVATION, 2)}  p90 ${f(q(0.9) / LIGHT_ELEVATION, 2)}`
);

check('the harmonic is not dead', calmPeak > EPSILON * 0.15, `${f(calmPeak)} > ${f(EPSILON * 0.15)}`);
// Below about three pixels of travel a one-pixel line only changes its
// antialiasing, which reads as faint noise rather than as a structure breathing.
// Calibrated against the browser rather than picked: at a median slope swing of
// 0.30 of the light's elevation, tools/correction-capture.mjs --motion measures
// each covered pixel changing by a median of 28% of its own brightness, which
// is plainly alive. The bars sit just under what has been seen to work.
check('the calm changes the shading', q(0.5) >= LIGHT_ELEVATION * 0.28, `median ${f(q(0.5) / LIGHT_ELEVATION, 2)}x`);
check('it changes it everywhere, not in a few spots', q(0.1) >= LIGHT_ELEVATION * 0.12, `p10 ${f(q(0.1) / LIGHT_ELEVATION, 2)}x`);

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

const strikeX = graph.positions[target * 3];
const strikeZ = graph.positions[target * 3 + 2];
let worstRingCv = Infinity;
let worstRingTick = 0;

/** Angular variation of |u - u*| within annuli around the strike. */
function ringVariation() {
  const u = system.simulation.u;
  const record = system.operator.record;
  const width = 0.9;
  const cvs = [];
  for (let r = 1; r <= 10; r++) {
    const inner = r * width;
    const outer = inner + width;
    let n = 0, sum = 0, sumSq = 0;
    for (let i = 0; i < graph.nodeCount; i++) {
      const d = Math.hypot(graph.positions[i * 3] - strikeX, graph.positions[i * 3 + 2] - strikeZ);
      if (d < inner || d >= outer) continue;
      const v = Math.abs(u[i] - record[i]);
      n++; sum += v; sumSq += v * v;
    }
    if (n < 24) continue;
    const mean = sum / n;
    if (mean <= 1e-5) continue;
    cvs.push(Math.sqrt(Math.max(sumSq / n - mean * mean, 0)) / mean);
  }
  cvs.sort((a, b) => a - b);
  return cvs.length ? cvs[cvs.length >> 1] : Infinity;
}

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

  // Only while the strike still dominates the ambient; after that the field is
  // the calm again and its angular statistics say nothing about the event.
  if (t % 8 === 0 && deviation > EPSILON * 2.5) {
    const cv = ringVariation();
    if (cv < worstRingCv) { worstRingCv = cv; worstRingTick = t; }
  }
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

// The concentric-ring guard, sampled while the front is actually travelling.
//
// The first version of this measured ten seconds after the strike, by which
// time the deviation has spread everywhere and decayed into the ambient — it
// was reporting the calm, not the event. Rings, if they exist, exist in the
// first second.
console.log(`  angular variation of the deviation within annuli, worst moment: ${f(worstRingCv, 3)} (at t+${worstRingTick})`);
check('the deviation never resolves into rings', worstRingCv > 0.30, `CV ${f(worstRingCv, 3)}`);

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
// What is left behind, and whether it is ever noticed.
//
// A strike does not decay back to the record, and that is not a bug. The wave
// operator restores a node toward its neighbours, not toward u*, so once
// enforcement has pushed a region inside the band there is nothing left that
// pulls it any closer. What remains is a permanent offset from the record,
// below θ_on, which the system cannot see and therefore never corrects.
//
// That is the proposition, stated in the dossier as the sparse sensor: the file
// tolerates invisible error while violently correcting visible deviation. The
// claim worth testing is not that the residue decays — it is that it saturates
// at the edge of what the system can see and never accumulates past it, however
// many times the visitor presses.
function peakOver(ticks) {
  let peak = 0;
  for (let t = 0; t < ticks; t++) {
    system.step();
    const d = system.peakDeviation();
    if (d > peak) peak = d;
  }
  return peak;
}

const ENGAGE_THRESHOLD = SYSTEM.correction.thetaOn + EPSILON;
const settledAfterOne = peakOver(1800);
console.log(`  residue after one strike: ${f(settledAfterOne)}   (the calm alone peaks at ${f(calmPeak)})`);

const beforeRepeats = system.operator.adjustments;
for (let strike = 0; strike < 8; strike++) {
  const node = (target * 7 + strike * 461) % graph.nodeCount;
  system.inject(node, ENERGY);
  peakOver(900);
}
const settledAfterNine = peakOver(2400);
const quietStart = system.operator.adjustments;
peakOver(3600);
const unprompted = system.operator.adjustments - quietStart;

console.log(
  `  residue after nine strikes: ${f(settledAfterNine)}   engagement threshold ${f(ENGAGE_THRESHOLD, 2)}   ` +
    `(${system.operator.adjustments - beforeRepeats} adjustments across the eight)`
);

// Saturation, tested as sub-linearity rather than as a ceiling. The residue
// settles *at* the threshold, not below it — that is the predicted equilibrium,
// since anything above θ_on is corrected and anything below is invisible — so a
// strict ceiling fails by a thousandth while the mechanism is working perfectly.
// What distinguishes saturation from accumulation is the slope: nine strikes
// leave 0.049 of excess where one leaves 0.031, against 0.28 if it stacked.
const excessOne = settledAfterOne - calmPeak;
const excessNine = settledAfterNine - calmPeak;
console.log(`  excess over the calm: ${f(excessOne)} after one, ${f(excessNine)} after nine (${f(excessNine / excessOne, 2)}x for 9x the input)`);
check(
  'the residue saturates instead of accumulating',
  excessNine < excessOne * 3 && settledAfterNine <= ENGAGE_THRESHOLD * 1.05,
  `${f(excessNine / excessOne, 2)}x for nine strikes, capped at ${f(settledAfterNine)}`
);
check(
  'and the system never notices its own residue',
  unprompted === 0,
  `${unprompted} unprompted adjustments across 30s of quiet`
);
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

// ------------------------------------------------------------------- replay

console.log('\nREPLAY');

function run() {
  const s = new CorrectionSystem(SYSTEM);
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
  ...SYSTEM,
  surface: { ...DEFAULT_SURFACE, seed: DEFAULT_SURFACE.seed ^ 0x1234 },
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
