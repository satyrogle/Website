/**
 * causal-pulse-bench.mjs — simulation step cost at each candidate graph size.
 *
 * This measures the authoritative simulation only. Frame time is a separate
 * measurement taken in the browser; what matters here is whether one fixed
 * timestep fits inside its share of the budget, because the Worker has to keep
 * up with a 120Hz clock regardless of what the renderer is doing.
 *
 *   node tools/causal-pulse-bench.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { decodeGraph } from '../src/labs/causal-pulse/graph/GraphAsset.ts';
import { CausalPulseSimulation, DEFAULT_PARAMETERS } from '../src/labs/causal-pulse/simulation/CausalPulseSimulation.ts';

const DIR = 'public/generated/causal-pulse';
const SIZES = [4096, 6144, 8192];
const WARMUP = 120;
const SAMPLES = 900;

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

console.log('graph size   nodes   edges   meanDeg   step mean   step p95   step max   budget@120Hz');
console.log('-'.repeat(92));

const results = [];

for (const size of SIZES) {
  execFileSync('node', ['tools/build-causal-graph.mjs', '--nodes', String(size)], { stdio: 'ignore' });

  const manifest = JSON.parse(readFileSync(`${DIR}/graph-manifest.json`, 'utf8'));
  const raw = readFileSync(`${DIR}/graph.bin`);
  const graph = decodeGraph(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

  const sim = new CausalPulseSimulation(graph, manifest.stability, DEFAULT_PARAMETERS);
  sim.inject(Math.floor(graph.nodeCount / 2), 1);

  for (let i = 0; i < WARMUP; i++) sim.step();

  const times = [];
  for (let i = 0; i < SAMPLES; i++) {
    const start = process.hrtime.bigint();
    sim.step();
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  times.sort((a, b) => a - b);

  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  const p95 = percentile(times, 0.95);
  const budget = (p95 / (DEFAULT_PARAMETERS.dt * 1000)) * 100;

  results.push({ size, nodes: graph.nodeCount, edges: graph.entryCount / 2, meanDegree: manifest.graph.degree.mean, mean, p95, max: times[times.length - 1], budget });

  console.log(
    `${String(size).padStart(10)}${String(graph.nodeCount).padStart(8)}${String(graph.entryCount / 2).padStart(8)}`
    + `${manifest.graph.degree.mean.toFixed(2).padStart(10)}`
    + `${mean.toFixed(3).padStart(12)}ms`
    + `${p95.toFixed(3).padStart(10)}ms`
    + `${times[times.length - 1].toFixed(3).padStart(10)}ms`
    + `${budget.toFixed(1).padStart(14)}%`,
  );
}

console.log('');
console.log(`fixed timestep ${(DEFAULT_PARAMETERS.dt * 1000).toFixed(2)}ms (${Math.round(1 / DEFAULT_PARAMETERS.dt)}Hz)`);
console.log('budget@120Hz = share of one tick period consumed by the simulation step.');
console.log('');
console.log(JSON.stringify({ measuredOn: 'node ' + process.version, results }, null, 2));
