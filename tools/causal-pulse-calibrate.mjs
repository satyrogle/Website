/**
 * causal-pulse-calibrate.mjs — fix the retained-memory display mapping.
 *
 * Runs the scripted strike plus three fixed injections on other structural
 * roles, pools the retained field across all four, and picks ONE mapping that
 * works for every route. Written into graph-manifest.json so the runtime never
 * normalises per frame or per interaction.
 *
 *   node tools/causal-pulse-calibrate.mjs [--ticks 900]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { decodeGraph } from '../src/labs/causal-pulse/graph/GraphAsset.ts';
import { CausalPulseSimulation, DEFAULT_PARAMETERS } from '../src/labs/causal-pulse/simulation/CausalPulseSimulation.ts';

const DIR = 'public/generated/causal-pulse';
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const TICKS = arg('ticks', 900);

const manifest = JSON.parse(readFileSync(`${DIR}/graph-manifest.json`, 'utf8'));
const raw = readFileSync(`${DIR}/graph.bin`);
const graph = decodeGraph(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

const haloRole = manifest.roles.indexOf('halo');
const isBody = (i) => graph.role[i] !== haloRole;
const bodyCount = Array.from({ length: graph.nodeCount }, (_, i) => i).filter(isBody).length;

/** Highest-degree node of a role — deterministic, no randomness. */
function pickByRole(role) {
  const index = manifest.roles.indexOf(role);
  let best = -1;
  let bestDegree = -1;
  for (let i = 0; i < graph.nodeCount; i++) {
    if (graph.role[i] !== index) continue;
    const degree = graph.offsets[i + 1] - graph.offsets[i];
    if (degree > bestDegree) { bestDegree = degree; best = i; }
  }
  return best;
}

// The scripted strike, plus three on different structural roles.
const ROUTES = [
  { role: 'shard', node: pickByRole('shard') },
  { role: 'tunnel_ring', node: pickByRole('tunnel_ring') },
  { role: 'gyre', node: pickByRole('gyre') },
  { role: 'latent', node: pickByRole('latent') },
];

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

function run(node) {
  const sim = new CausalPulseSimulation(graph, manifest.stability, DEFAULT_PARAMETERS);
  sim.inject(node, 1);
  for (let t = 0; t < TICKS; t++) sim.step();
  return sim;
}

/**
 * Structure of the retained field at a cut level, expressed as an absolute
 * memory value. Coverage, how many structural roles it touches, and whether it
 * forms one route or scattered specks.
 */
function structure(sim, cut) {
  let max = 0;
  for (let i = 0; i < graph.nodeCount; i++) if (isBody(i) && sim.m[i] > max) max = sim.m[i];

  const selected = [];
  const roles = new Set();
  for (let i = 0; i < graph.nodeCount; i++) {
    if (!isBody(i) || sim.m[i] < cut) continue;
    selected.push(i);
    roles.add(manifest.roles[graph.role[i]]);
  }

  // Largest connected component among the selected nodes.
  const inSet = new Uint8Array(graph.nodeCount);
  for (const i of selected) inSet[i] = 1;
  const seen = new Uint8Array(graph.nodeCount);
  let largest = 0;
  for (const start of selected) {
    if (seen[start]) continue;
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const current = stack.pop();
      size++;
      for (let k = graph.offsets[current]; k < graph.offsets[current + 1]; k++) {
        const j = graph.neighbours[k];
        if (inSet[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (size > largest) largest = size;
  }

  return {
    max,
    count: selected.length,
    coverage: selected.length / bodyCount,
    roles: [...roles].sort(),
    largestComponent: largest,
    componentShare: selected.length ? largest / selected.length : 0,
  };
}

console.log(`body nodes ${bodyCount}   ticks ${TICKS}`);
console.log('');

const pooled = [];
const runs = [];

for (const route of ROUTES) {
  const sim = run(route.node);
  const body = [];
  for (let i = 0; i < graph.nodeCount; i++) if (isBody(i)) body.push(sim.m[i]);
  body.sort((a, b) => a - b);
  pooled.push(...body);

  const p50 = percentile(body, 0.5);
  const p90 = percentile(body, 0.9);
  let max = 0;
  for (const v of body) if (v > max) max = v;

  runs.push({ ...route, sim, p50, p90, max, ratio: p50 > 0 ? p90 / p50 : Infinity });

  console.log(
    `${route.role.padEnd(12)} node ${String(route.node).padStart(5)}  `
    + `max ${max.toExponential(3)}  p50 ${p50.toExponential(3)}  p90 ${p90.toExponential(3)}  `
    + `p90/p50 ${(p90 / p50).toFixed(2).padStart(8)}  raw>=35%max ${String(structure(sim, max * 0.35).count).padStart(4)}`,
  );
}

pooled.sort((a, b) => a - b);

// The low anchor puts resting structure at exactly zero so untouched regions
// stay near-black rather than carrying a faint global wash.
const low = percentile(pooled, 0.75);

/**
 * The high anchor decides how much of the object the route occupies, so it is
 * chosen against the structural test rather than picked. Sweep candidates in a
 * fixed order and take the first that satisfies every route at once — one
 * mapping for all four, never tuned per strike.
 */
const DISPLAY_CUT = 0.35;

const satisfies = (s) => s.coverage >= 0.05 && s.coverage <= 0.35 && s.roles.length >= 3 && s.componentShare >= 0.6;

/**
 * Display cut and high anchor collapse to a single absolute threshold
 * T = low + cut*(high - low), so the search is over T directly. Fine grid,
 * scored by how many of the four routes satisfy every condition at once; ties
 * broken toward the threshold that keeps coverage furthest inside the band.
 */
let best = null;
for (let step = 0; step <= 400; step++) {
  const t = low + (percentile(pooled, 0.999) - low) * (step / 400);
  if (t <= low) continue;
  const shapes = runs.map((r) => structure(r.sim, t));
  const passing = shapes.filter(satisfies).length;
  const margin = Math.min(...shapes.map((s) => Math.min(s.coverage - 0.05, 0.35 - s.coverage)));
  if (!best || passing > best.passing || (passing === best.passing && margin > best.margin)) {
    best = { t, shapes, passing, margin };
  }
}

const high = low + (best.t - low) / DISPLAY_CUT;
const chosen = { shapes: best.shapes, passing: best.passing, threshold: best.t };

console.log('');
console.log(`pooled retained  p50 ${percentile(pooled, 0.5).toExponential(3)}  p90 ${percentile(pooled, 0.9).toExponential(3)}  p99.5 ${percentile(pooled, 0.995).toExponential(3)}`);
console.log(`display mapping  low ${low.toExponential(6)}  high ${high.toExponential(6)}  threshold ${chosen.threshold.toExponential(4)}  routes satisfying all conditions ${chosen.passing}/4`);
console.log('');
console.log(`structure at ${(DISPLAY_CUT * 100).toFixed(0)}% of displayed maximum:`);
runs.forEach((r, i) => {
  const s = chosen.shapes[i];
  console.log(
    `  ${r.role.padEnd(12)} ${String(s.count).padStart(5)} nodes (${(s.coverage * 100).toFixed(1)}%)  `
    + `roles ${s.roles.length} [${s.roles.join(' ')}]  largest component ${(s.componentShare * 100).toFixed(0)}%`,
  );
});

manifest.retainedDisplay = {
  low,
  high,
  displayCut: DISPLAY_CUT,
  absoluteThreshold: chosen.threshold,
  routesSatisfyingAll: chosen.passing,

  ticks: TICKS,
  routes: runs.map((r, i) => ({
    role: r.role,
    node: r.node,
    max: r.max,
    p50: r.p50,
    p90: r.p90,
    p90OverP50: r.ratio,
    atDisplayCut: {
      count: chosen.shapes[i].count,
      coverage: chosen.shapes[i].coverage,
      roles: chosen.shapes[i].roles,
      componentShare: chosen.shapes[i].componentShare,
    },
  })),
  note: 'Fixed across all routes. The runtime must not normalise per frame or per interaction.',
};

writeFileSync(`${DIR}/graph-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nwrote ${DIR}/graph-manifest.json`);
