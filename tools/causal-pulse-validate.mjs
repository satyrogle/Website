/**
 * causal-pulse-validate.mjs — does the pulse actually propagate through the
 * structure, and does it reproduce?
 *
 * This runs the authoritative simulation headlessly, with no renderer, so a
 * failure here is a failure of the idea rather than of a shader. Every claim
 * the spike makes is measured in this file.
 *
 *   node tools/causal-pulse-validate.mjs
 *   node tools/causal-pulse-validate.mjs --damping 0.3 --c 12 --profile
 */

import { readFileSync } from 'node:fs';
import { decodeGraph } from '../src/labs/causal-pulse/graph/GraphAsset.ts';
import { CausalPulseSimulation, DEFAULT_PARAMETERS } from '../src/labs/causal-pulse/simulation/CausalPulseSimulation.ts';

const DIR = 'public/generated/causal-pulse';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const flag = (name) => process.argv.includes(`--${name}`);

const TICKS = arg('ticks', 900);

const manifest = JSON.parse(readFileSync(`${DIR}/graph-manifest.json`, 'utf8'));
const raw = readFileSync(`${DIR}/graph.bin`);
const graph = decodeGraph(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const bounds = manifest.stability;

const PARAMS = {
  ...DEFAULT_PARAMETERS,
  waveSpeed: arg('c', DEFAULT_PARAMETERS.waveSpeed),
  waveDamping: arg('damping', DEFAULT_PARAMETERS.waveDamping),
  diffusionRate: arg('kappa', DEFAULT_PARAMETERS.diffusionRate),
  diffusionDecay: arg('decay', DEFAULT_PARAMETERS.diffusionDecay),
  arrivalThreshold: arg('threshold', DEFAULT_PARAMETERS.arrivalThreshold),
  memoryFromWave: arg('alpha', DEFAULT_PARAMETERS.memoryFromWave),
  memoryFromActivity: arg('beta', DEFAULT_PARAMETERS.memoryFromActivity),
};

// ------------------------------------------------------------- graph metrics

function hopDistance(from) {
  const dist = new Int32Array(graph.nodeCount).fill(-1);
  dist[from] = 0;
  let frontier = [from];
  while (frontier.length) {
    const next = [];
    for (const i of frontier) {
      for (let k = graph.offsets[i]; k < graph.offsets[i + 1]; k++) {
        const j = graph.neighbours[k];
        if (dist[j] === -1) { dist[j] = dist[i] + 1; next.push(j); }
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * Shortest path by summed edge LENGTH — the physically meaningful graph metric.
 *
 * Hop count is not a usable proxy here: the entity is unevenly tessellated, so
 * a finely-clustered region costs more hops for the same physical distance.
 * That confound is what made an earlier hop-based test read as anti-structural.
 * Geodesic distance is what a wave travelling through the material follows, and
 * it separates from straight-line distance exactly where the structure forces a
 * detour — around the throat, or via a bridge between parts.
 */
function geodesicDistance(from) {
  const dist = new Float64Array(graph.nodeCount).fill(Infinity);
  dist[from] = 0;

  // Binary heap keyed on tentative distance.
  const heap = [{ node: from, d: 0 }];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].d <= heap[i].d) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let small = i;
        if (l < heap.length && heap[l].d < heap[small].d) small = l;
        if (r < heap.length && heap[r].d < heap[small].d) small = r;
        if (small === i) break;
        [heap[small], heap[i]] = [heap[i], heap[small]];
        i = small;
      }
    }
    return top;
  };

  while (heap.length) {
    const { node, d } = pop();
    if (d > dist[node]) continue;
    for (let k = graph.offsets[node]; k < graph.offsets[node + 1]; k++) {
      const j = graph.neighbours[k];
      const length = Math.hypot(
        graph.positions[node * 3] - graph.positions[j * 3],
        graph.positions[node * 3 + 1] - graph.positions[j * 3 + 1],
        graph.positions[node * 3 + 2] - graph.positions[j * 3 + 2],
      );
      const next = d + length;
      if (next < dist[j]) { dist[j] = next; push({ node: j, d: next }); }
    }
  }

  return dist;
}

function euclideanDistance(from) {
  const out = new Float64Array(graph.nodeCount);
  const x = graph.positions[from * 3], y = graph.positions[from * 3 + 1], z = graph.positions[from * 3 + 2];
  for (let i = 0; i < graph.nodeCount; i++) {
    out[i] = Math.hypot(graph.positions[i * 3] - x, graph.positions[i * 3 + 1] - y, graph.positions[i * 3 + 2] - z);
  }
  return out;
}

function pearson(a, b) {
  const n = a.length;
  if (n < 2) return NaN;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db);
}

function pickInjectionNode() {
  const explicit = arg('node', -1);
  if (explicit >= 0) return explicit;
  const shardRole = manifest.roles.indexOf('shard');
  let best = 0, bestDegree = -1;
  for (let i = 0; i < graph.nodeCount; i++) {
    if (graph.role[i] !== shardRole) continue;
    const degree = graph.offsets[i + 1] - graph.offsets[i];
    if (degree > bestDegree) { bestDegree = degree; best = i; }
  }
  return best;
}

const INJECT = pickInjectionNode();
const hops = hopDistance(INJECT);
const euclid = euclideanDistance(INJECT);
const geodesic = geodesicDistance(INJECT);

let maxHop = 0;
for (let i = 0; i < graph.nodeCount; i++) if (hops[i] > maxHop) maxHop = hops[i];

// A node genuinely far away across the structure, for the checksum sensitivity
// check — chosen by hop distance so it exists regardless of what propagated.
let farNode = INJECT;
for (let i = 0; i < graph.nodeCount; i++) if (hops[i] === maxHop) { farNode = i; break; }

// --------------------------------------------------------------------- run

function run(ticks, injectNode, { trackMonotonicity = false, profileAt = null } = {}) {
  const sim = new CausalPulseSimulation(graph, bounds, PARAMS);
  sim.inject(injectNode, 1);

  let monotonicityViolations = 0;
  const previous = trackMonotonicity ? Float32Array.from(sim.m) : null;
  const trace = [];
  const profiles = [];

  for (let t = 0; t < ticks; t++) {
    sim.step();

    if (trackMonotonicity) {
      for (let i = 0; i < sim.nodeCount; i++) if (sim.m[i] < previous[i] - 1e-9) monotonicityViolations++;
      previous.set(sim.m);
    }

    if (t % 60 === 59) trace.push(sim.metrics());

    if (profileAt && profileAt.includes(t + 1)) {
      const bands = [];
      const bandSize = Math.max(1, Math.ceil(maxHop / 8));
      for (let b = 0; b * bandSize <= maxHop; b++) {
        let peak = 0, count = 0;
        for (let i = 0; i < graph.nodeCount; i++) {
          if (hops[i] < 0) continue;
          if (Math.floor(hops[i] / bandSize) !== b) continue;
          count++;
          const abs = Math.abs(sim.u[i]);
          if (abs > peak) peak = abs;
        }
        if (count) bands.push({ hop: b * bandSize, peak, count });
      }
      profiles.push({ tick: t + 1, seconds: (t + 1) * PARAMS.dt, bands });
    }
  }

  return { sim, monotonicityViolations, trace, profiles };
}

// ------------------------------------------------------------------ report

console.log(`graph      ${graph.nodeCount} nodes, ${graph.entryCount / 2} edges, mean degree ${manifest.graph.degree.mean}, max hop ${maxHop}`);
console.log(`injection  node ${INJECT} (${manifest.roles[graph.role[INJECT]]}, degree ${graph.offsets[INJECT + 1] - graph.offsets[INJECT]})`);
console.log(`params     c ${PARAMS.waveSpeed}  gamma ${PARAMS.waveDamping}  kappa ${PARAMS.diffusionRate}  decay ${PARAMS.diffusionDecay}  threshold ${PARAMS.arrivalThreshold}`);
console.log(`stability  c*dt ${(PARAMS.waveSpeed * PARAMS.dt).toFixed(5)} < ${bounds.waveDtMax.toFixed(5)}   kappa*dt ${(PARAMS.diffusionRate * PARAMS.dt).toFixed(5)} < ${bounds.diffusionDtMax.toFixed(5)}`);
console.log('');

const profileTicks = flag('profile') ? [30, 60, 120, 240, 480] : null;
const { sim, monotonicityViolations, trace, profiles } = run(TICKS, INJECT, { trackMonotonicity: true, profileAt: profileTicks });
const final = sim.metrics();

console.log('propagation over time');
console.log('  t(s)   reached   active    peak|u|   meanRetained   retaining');
for (const row of trace.filter((_, i) => i % 3 === 0 || i === trace.length - 1)) {
  console.log(
    `  ${row.simulatedSeconds.toFixed(2).padStart(5)}`
    + `${String(row.reachedNodes).padStart(9)}`
    + `${String(row.activeNodes).padStart(9)}`
    + `${row.peakWave.toExponential(2).padStart(11)}`
    + `${row.meanRetained.toFixed(5).padStart(15)}`
    + `${String(row.retainingNodes).padStart(12)}`,
  );
}
console.log('');

if (profiles.length) {
  console.log('wave amplitude by hop distance (is there a travelling front?)');
  for (const p of profiles) {
    console.log(`  t=${p.seconds.toFixed(2)}s  ` + p.bands.map((b) => `h${b.hop}:${b.peak.toExponential(1)}`).join('  '));
  }
  console.log('');
}

/**
 * Front arrival, measured per node against a fraction of that node's OWN
 * eventual peak.
 *
 * Two earlier estimators both failed for identifiable reasons. A fixed
 * amplitude threshold is confounded by local degree — a low-degree node
 * concentrates the same energy and trips early, a hub dilutes it and trips
 * late, which produced a NEGATIVE structural correlation. Global time-to-peak
 * is confounded by reflection: over several seconds the wave crosses the object
 * repeatedly, so the largest excursion is set by resonance rather than by
 * arrival, which produced no correlation at all.
 *
 * A relative threshold is scale-free like time-to-peak, but it fires on the
 * leading edge instead of the loudest moment. Costs one extra pass.
 */
function arrivalByRelativeThreshold(ticks, injectNode, fraction = 0.25) {
  const first = new CausalPulseSimulation(graph, bounds, PARAMS);
  first.inject(injectNode, 1);
  for (let t = 0; t < ticks; t++) first.step();
  const peaks = Float32Array.from(first.peakValue);

  const second = new CausalPulseSimulation(graph, bounds, PARAMS);
  second.inject(injectNode, 1);
  const arrival = new Int32Array(graph.nodeCount).fill(-1);

  for (let t = 0; t < ticks; t++) {
    second.step();
    const tick = t + 1;
    for (let i = 0; i < graph.nodeCount; i++) {
      if (arrival[i] !== -1) continue;
      if (peaks[i] <= 0) continue;
      if (Math.abs(second.u[i]) >= fraction * peaks[i]) arrival[i] = tick;
    }
  }

  return { arrival, peaks };
}

const { arrival: frontArrival, peaks: frontPeaks } = arrivalByRelativeThreshold(TICKS, INJECT);

const reachedIdx = [];
for (let i = 0; i < graph.nodeCount; i++) {
  if (frontArrival[i] > 0 && hops[i] > 0 && frontPeaks[i] > PARAMS.arrivalThreshold) reachedIdx.push(i);
}

// Median front arrival per hop band — the most direct evidence of a front.
{
  const band = Math.max(1, Math.ceil(maxHop / 10));
  const rows = [];
  for (let b = 0; b * band <= maxHop; b++) {
    const times = reachedIdx.filter((i) => Math.floor(hops[i] / band) === b).map((i) => frontArrival[i]).sort((x, y) => x - y);
    if (times.length >= 10) rows.push(`h${b * band}:${(times[Math.floor(times.length / 2)] * PARAMS.dt).toFixed(2)}s`);
  }
  console.log('median front arrival by hop distance');
  console.log(`  ${rows.join('  ')}`);
  console.log('');
}

// Time-to-peak throughout, for the reason documented on peakTick.
const arrival = Float64Array.from(reachedIdx, (i) => frontArrival[i]);
const rHop = pearson(arrival, Float64Array.from(reachedIdx, (i) => hops[i]));
const rEuclid = pearson(arrival, Float64Array.from(reachedIdx, (i) => euclid[i]));

/**
 * Hop distance and straight-line distance are strongly correlated on a surface
 * mesh, so comparing their raw correlations says little. The sharp question is
 * whether structure still explains arrival AFTER controlling for how far away a
 * node is in space: bucket nodes into narrow euclidean shells, and inside each
 * shell — where every node is the same distance from the strike — see whether
 * the ones that are further around the structure arrive later.
 *
 * A radial ripple scores ~0 here by construction. A wave travelling through the
 * object scores positive.
 */
/**
 * The decisive test. Restricted to DETOUR nodes — those whose path through the
 * structure is meaningfully longer than the straight line to them, i.e. the
 * nodes a wave can only reach by going around something.
 *
 * For those nodes the two hypotheses make opposite predictions: a wave inside
 * the material arrives late, in step with the detour; anything drawn in screen
 * space or expanding as a sphere arrives on straight-line schedule. Comparing
 * the correlations only where they disagree is where the test has power.
 */
function detourTest() {
  const detour = reachedIdx.filter((i) => euclid[i] > 1e-6 && Number.isFinite(geodesic[i]) && geodesic[i] / euclid[i] > 1.3);
  if (detour.length < 50) return { count: detour.length, rGeodesic: NaN, rEuclid: NaN };

  const t = Float64Array.from(detour, (i) => frontArrival[i]);
  return {
    count: detour.length,
    share: detour.length / reachedIdx.length,
    medianRatio: detour.map((i) => geodesic[i] / euclid[i]).sort((a, b) => a - b)[Math.floor(detour.length / 2)],
    rGeodesic: pearson(t, Float64Array.from(detour, (i) => geodesic[i])),
    rEuclid: pearson(t, Float64Array.from(detour, (i) => euclid[i])),
  };
}

function withinShellCorrelation() {
  const sorted = [...reachedIdx].sort((x, y) => euclid[x] - euclid[y]);
  const shells = 12;
  const perShell = Math.floor(sorted.length / shells);
  if (perShell < 30) return { r: NaN, shells: 0, sampled: 0 };

  let weighted = 0;
  let total = 0;
  let used = 0;

  for (let sIdx = 0; sIdx < shells; sIdx++) {
    const slice = sorted.slice(sIdx * perShell, (sIdx + 1) * perShell);
    const distinct = new Set(slice.map((i) => hops[i]));
    if (distinct.size < 2) continue; // no hop variation to explain anything with

    const r = pearson(
      Float64Array.from(slice, (i) => frontArrival[i]),
      Float64Array.from(slice, (i) => hops[i]),
    );
    if (!Number.isFinite(r)) continue;

    weighted += r * slice.length;
    total += slice.length;
    used++;
  }

  return { r: total ? weighted / total : NaN, shells: used, sampled: total };
}

const shell = withinShellCorrelation();
const detour = detourTest();
const rGeodesicAll = pearson(arrival, Float64Array.from(reachedIdx, (i) => geodesic[i]));

console.log('structural propagation');
console.log(`  reached nodes                    ${reachedIdx.length} / ${graph.nodeCount} (${((reachedIdx.length / graph.nodeCount) * 100).toFixed(1)}%)`);
console.log(`  arrival vs GEODESIC distance     r = ${rGeodesicAll.toFixed(4)}`);
console.log(`  arrival vs EUCLIDEAN distance    r = ${rEuclid.toFixed(4)}`);
console.log(`  arrival vs hop count             r = ${rHop.toFixed(4)}`);
console.log('');
console.log(`  detour nodes (geodesic/euclid > 1.3)`);
console.log(`    count                          ${detour.count}${detour.share ? ` (${(detour.share * 100).toFixed(1)}% of reached, median ratio ${detour.medianRatio.toFixed(2)}x)` : ''}`);
console.log(`    arrival vs GEODESIC            r = ${detour.rGeodesic.toFixed(4)}`);
console.log(`    arrival vs EUCLIDEAN          r = ${detour.rEuclid.toFixed(4)}`);
console.log(`    margin                         ${detour.rGeodesic - detour.rEuclid >= 0 ? '+' : ''}${(detour.rGeodesic - detour.rEuclid).toFixed(4)}  ${detour.rGeodesic > detour.rEuclid ? 'follows the structure around the detour' : 'RADIAL — ignores the detour'}`);
console.log('');

// Retained memory that is actually above perceptual dust, not float residue.
let retainedAbove = 0;
for (let i = 0; i < graph.nodeCount; i++) if (sim.m[i] > 0.02) retainedAbove++;

/**
 * The decisive separation between "travels through the object" and "expands
 * through space".
 *
 * The halo is a free-floating ring a few units off the crown — spatially close,
 * structurally unconnected, and deliberately left as its own graph component.
 * Any effect that works in screen space or as an expanding sphere lights it.
 * Nothing that travels along the structure can touch it, at any amplitude.
 */
{
  const haloRole = manifest.roles.indexOf('halo');
  let haloNodes = 0;
  let haloEnergy = 0;
  let haloMemory = 0;
  let nearestHalo = Infinity;

  for (let i = 0; i < graph.nodeCount; i++) {
    if (graph.role[i] !== haloRole) continue;
    haloNodes++;
    haloEnergy += Math.abs(sim.u[i]) + sim.s[i];
    haloMemory += sim.m[i];
    if (euclid[i] < nearestHalo) nearestHalo = euclid[i];
  }

  const bodyReached = reachedIdx.length;
  console.log('spatial isolation (the halo is unconnected but physically near)');
  console.log(`  halo nodes                       ${haloNodes}`);
  console.log(`  nearest halo node to the strike  ${nearestHalo.toFixed(3)} units`);
  console.log(`  total halo energy |u|+s          ${haloEnergy.toExponential(3)}`);
  console.log(`  total halo retained memory       ${haloMemory.toExponential(3)}`);
  console.log(`  body nodes reached in comparison ${bodyReached}`);
  console.log(`  ${haloEnergy === 0 && haloMemory === 0 ? 'ZERO — the pulse cannot cross empty space' : 'LEAKED — energy crossed a structural gap'}`);
  console.log('');

  globalThis.__haloClean = haloEnergy === 0 && haloMemory === 0;
}

console.log('retained memory');
console.log(`  monotonicity violations          ${monotonicityViolations}`);
console.log(`  nodes retaining > 0.02           ${retainedAbove} (${((retainedAbove / graph.nodeCount) * 100).toFixed(1)}%)`);
console.log(`  mean retained                    ${final.meanRetained.toFixed(5)}`);
console.log(`  max retained                     ${final.maxRetained.toFixed(5)}`);
console.log(`  transient decayed to peak|u|     ${final.peakWave.toExponential(2)}`);
console.log('');

const a = run(240, INJECT).sim.checksum();
const b = run(240, INJECT).sim.checksum();
const other = run(240, farNode).sim.checksum();

console.log('determinism');
console.log(`  same graph/params/node/ticks     0x${a.toString(16).padStart(8, '0')}  0x${b.toString(16).padStart(8, '0')}  ${a === b ? 'MATCH' : 'DIVERGED'}`);
console.log(`  injection at far node ${String(farNode).padStart(4)}       0x${other.toString(16).padStart(8, '0')}  ${other !== a ? 'differs (checksum is live)' : 'IDENTICAL — checksum not reading state'}`);
console.log('');

const checks = [
  ['pulse reaches > 60% of nodes', reachedIdx.length / graph.nodeCount > 0.6],
  ['pulse cannot cross empty space (halo untouched)', globalThis.__haloClean === true],
  ['geodesic explains arrival at least as well as euclidean', rGeodesicAll >= rEuclid],
  ['arrival correlates with geodesic distance', rGeodesicAll > 0.5],
  ['retained memory never decreases', monotonicityViolations === 0],
  ['retained memory visible on > 20% of nodes', retainedAbove / graph.nodeCount > 0.2],
  ['transient decays', final.peakWave < 0.05],
  ['identical runs reproduce', a === b],
  ['checksum responds to input', other !== a],
];

let failed = 0;
console.log('acceptance');
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

process.exit(failed === 0 ? 0 : 1);
