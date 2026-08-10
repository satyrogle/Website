/**
 * The simulation Worker. This is the authority: it owns the state, advances it
 * on a fixed timestep, and publishes a snapshot. Nothing on the main thread
 * feeds back into it, so what the renderer draws can never influence what the
 * system does.
 *
 * Snapshots are packed as RGBA per node (wave, activity, memory, peak) so they
 * upload straight into a texture without a repack on the main thread, and the
 * buffers cycle between the two threads by transfer rather than being
 * reallocated sixty times a second.
 */

import { loadGraphForSimulation } from '../graph/GraphLoader';
import { CausalPulseSimulation, DEFAULT_PARAMETERS, type SimulationMetrics } from './CausalPulseSimulation';

export interface ReadyMessage {
  type: 'ready';
  nodeCount: number;
  textureSize: number;
  manifest: unknown;
}

export interface StateMessage {
  type: 'state';
  buffer: ArrayBuffer;
  tick: number;
  metrics: SimulationMetrics;
  checksum: number;
  injections: number;
  stepMs: number;
}

export type WorkerOutbound = ReadyMessage | StateMessage | { type: 'error'; message: string };

export type WorkerInbound =
  | { type: 'init' }
  | { type: 'inject'; node: number; energy: number }
  | { type: 'recycle'; buffer: ArrayBuffer }
  | { type: 'setRunning'; running: boolean };

/**
 * `self` resolves to Window under the DOM lib, which has a different
 * postMessage signature. A narrow local alias avoids pulling the webworker lib
 * in alongside DOM and having the two collide.
 */
const ctx = self as unknown as {
  postMessage(message: WorkerOutbound, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerInbound>) => void | Promise<void>) | null;
};

/** Real time is capped per frame so a backgrounded tab cannot spiral. */
const MAX_STEPS_PER_FRAME = 8;
const PUBLISH_EVERY = 2;

let simulation: CausalPulseSimulation | null = null;
let textureSize = 0;
let running = true;
let accumulator = 0;
let lastTime = 0;
let sincePublish = 0;
let stepMsAverage = 0;

const pool: ArrayBuffer[] = [];

function packSnapshot(sim: CausalPulseSimulation): ArrayBuffer {
  const floats = textureSize * textureSize * 4;
  const buffer = pool.pop() ?? new ArrayBuffer(floats * 4);
  const view = new Float32Array(buffer);

  for (let i = 0; i < sim.nodeCount; i++) {
    const at = i * 4;
    view[at] = sim.u[i];
    view[at + 1] = sim.s[i];
    view[at + 2] = sim.m[i];
    view[at + 3] = sim.peakValue[i];
  }

  return buffer;
}

function publish(sim: CausalPulseSimulation): void {
  const buffer = packSnapshot(sim);
  const message: StateMessage = {
    type: 'state',
    buffer,
    tick: sim.tick,
    metrics: sim.metrics(),
    checksum: sim.checksum(),
    injections: sim.injectionCount,
    stepMs: stepMsAverage,
  };
  ctx.postMessage(message, [buffer]);
}

function frame(): void {
  if (!simulation) return;

  const now = performance.now();
  if (lastTime === 0) lastTime = now;
  const elapsed = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;

  if (running) {
    accumulator += elapsed;
    let steps = 0;
    const started = performance.now();

    while (accumulator >= simulation.parameters.dt && steps < MAX_STEPS_PER_FRAME) {
      simulation.step();
      accumulator -= simulation.parameters.dt;
      steps++;
    }

    if (steps > 0) {
      const perStep = (performance.now() - started) / steps;
      stepMsAverage = stepMsAverage === 0 ? perStep : stepMsAverage * 0.9 + perStep * 0.1;
    }

    if (++sincePublish >= PUBLISH_EVERY) { sincePublish = 0; publish(simulation); }
  }

  setTimeout(frame, 4);
}

ctx.onmessage = async (event: MessageEvent<WorkerInbound>): Promise<void> => {
  const message = event.data;

  try {
    switch (message.type) {
      case 'init': {
        const { manifest, graph } = await loadGraphForSimulation();
        simulation = new CausalPulseSimulation(graph, manifest.stability, DEFAULT_PARAMETERS);
        textureSize = Math.ceil(Math.sqrt(graph.nodeCount));

        const ready: ReadyMessage = { type: 'ready', nodeCount: graph.nodeCount, textureSize, manifest };
        ctx.postMessage(ready);

        lastTime = 0;
        frame();
        break;
      }

      case 'inject':
        simulation?.inject(message.node, message.energy);
        break;

      case 'recycle':
        // Bounded: two buffers are enough to keep one in flight.
        if (pool.length < 2) pool.push(message.buffer);
        break;

      case 'setRunning':
        running = message.running;
        if (running) lastTime = 0; // do not integrate the paused interval
        break;
    }
  } catch (error) {
    ctx.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
