/**
 * The simulation Worker. Ported from the causal-pulse spike
 * (`src/labs/causal-pulse/simulation/PulseWorker.ts`) with the asset loader
 * replaced by the synthesiser and the correction pass folded into the step.
 *
 * This is the authority: it owns the state, advances it on a fixed timestep,
 * and publishes a snapshot. Nothing on the main thread feeds back into it, so
 * what the renderer draws can never influence what the system does.
 *
 * Snapshots are packed as RGBA per node so they upload straight into a texture
 * without a repack on the main thread, and the buffers cycle between the two
 * threads by transfer rather than being reallocated sixty times a second.
 *
 *   R  u        displacement along the node's own direction
 *   G  glow     envelope of |u − u*| — the light law
 *   B  bruise   decaying trace plus permanent scar
 *   A  contact  smoothed |δ| this tick — V = D × C
 */

import { CorrectionSystem, DEFAULT_SYSTEM } from './CorrectionSystem';

export interface ReadyMessage {
  type: 'ready';
  nodeCount: number;
  edgeCount: number;
  textureSize: number;
  /** p₀ per node, xyz. */
  positions: ArrayBuffer;
  /** n̂ per node, xyz. */
  directions: ArrayBuffer;
  /** Endpoint pairs, i < j. */
  edges: ArrayBuffer;
  stats: Record<string, number>;
}

export interface ProgressMessage {
  type: 'progress';
  fraction: number;
  stage: 'synth' | 'warmup' | 'record';
}

export interface RecordMessage {
  type: 'record';
  /** u* per node. The approved state, derived from the warm-up. */
  record: ArrayBuffer;
}

export interface StateMessage {
  type: 'state';
  buffer: ArrayBuffer;
  tick: number;
  adjustments: number;
  engaged: number;
  correctionEnergy: number;
  peakDeviation: number;
  /** The largest violation the system can still see. What the floor reports. */
  residual: number;
  injections: number;
  stepMs: number;
}

/**
 * One still from a scripted correction event, for the reduced-motion path.
 *
 * The three stages are found by watching the system rather than by naming
 * ticks: a frame is taken the moment before enforcement first engages, again
 * while the ramp is still climbing, and once the operator has let go and
 * stayed off. The stills are therefore the event, not an illustration of it.
 */
export interface FrameMessage {
  type: 'frame';
  stage: 'deviation' | 'strain' | 'settled';
  buffer: ArrayBuffer;
  tick: number;
  adjustments: number;
  engaged: number;
  peakDeviation: number;
}

export type WorkerOutbound =
  | ReadyMessage
  | ProgressMessage
  | RecordMessage
  | StateMessage
  | FrameMessage
  | { type: 'error'; message: string };

export type WorkerInbound =
  | { type: 'init' }
  | { type: 'inject'; node: number; energy: number }
  /**
   * Narrative depth. It changes what the system does, so it travels the same
   * channel as an injection and belongs to the recorded trace — seed plus this
   * message stream still replays to an identical checksum.
   */
  | { type: 'gain'; value: number }
  /**
   * Run one correction event to completion and report three stills from it.
   * The world is left where the event left it — struck, corrected, bruised —
   * because that settled state is what the reduced-motion path shows live.
   */
  | { type: 'triptych' }
  | { type: 'recycle'; buffer: ArrayBuffer }
  | { type: 'setRunning'; running: boolean };

/**
 * `self` resolves to Window under the DOM lib, which has a different
 * postMessage signature. A narrow local alias avoids pulling the webworker lib
 * in alongside DOM and having the two collide.
 */
const ctx = self as unknown as {
  postMessage(message: WorkerOutbound, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerInbound>) => void) | null;
};

/** Real time is capped per frame so a backgrounded tab cannot spiral. */
const MAX_STEPS_PER_FRAME = 8;
const PUBLISH_EVERY = 2;

let system: CorrectionSystem | null = null;
let textureSize = 0;
let running = true;
let accumulator = 0;
let lastTime = 0;
let sincePublish = 0;
let stepMsAverage = 0;

const pool: ArrayBuffer[] = [];

function packInto(view: Float32Array, s: CorrectionSystem): void {
  const { u } = s.simulation;
  const { glow, bruise, scar, contact } = s.operator;

  for (let i = 0; i < u.length; i++) {
    const at = i * 4;
    view[at] = u[i];
    view[at + 1] = glow[i];
    view[at + 2] = bruise[i] + scar[i];
    view[at + 3] = contact[i];
  }
}

function packSnapshot(s: CorrectionSystem): ArrayBuffer {
  const floats = textureSize * textureSize * 4;
  const buffer = pool.pop() ?? new ArrayBuffer(floats * 4);
  packInto(new Float32Array(buffer), s);
  return buffer;
}

function publish(s: CorrectionSystem): void {
  const buffer = packSnapshot(s);
  const message: StateMessage = {
    type: 'state',
    buffer,
    tick: s.tick,
    adjustments: s.operator.adjustments,
    engaged: s.operator.engagedCount(),
    correctionEnergy: s.operator.correctionEnergy,
    peakDeviation: s.peakDeviation(),
    residual: s.operator.visibleResidual(),
    injections: s.simulation.injectionCount,
    stepMs: stepMsAverage,
  };
  ctx.postMessage(message, [buffer]);
}

/**
 * Where the scripted event lands.
 *
 * A position rather than a node index: the index would only mean anything for
 * one seed, and the same seed has to produce the same three stills on every
 * machine and every visit.
 */
const TRIPTYCH_POINT: [number, number, number] = [1.4, 0, -0.6];

/**
 * One correction event, reported as three stills.
 *
 * The event itself — including how the three moments are found — lives in
 * `CorrectionSystem.scriptedEvent`, where the mechanism gate can assert that
 * they are the moments they claim to be. This function is transport: it packs
 * whatever state that loop points at and posts it.
 *
 * Run synchronously. It is a couple of thousand fixed steps inside a Worker,
 * and nothing else may advance the state while it happens or the stills would
 * not belong to the same event.
 */
function runTriptych(s: CorrectionSystem): void {
  running = false;

  const floats = textureSize * textureSize * 4;
  const current = new Float32Array(floats);

  const send = (stage: FrameMessage['stage'], source: Float32Array, tick: number): void => {
    const buffer = new ArrayBuffer(floats * 4);
    new Float32Array(buffer).set(source);
    const message: FrameMessage = {
      type: 'frame',
      stage,
      buffer,
      tick,
      adjustments: s.operator.adjustments,
      engaged: s.operator.engagedCount(),
      peakDeviation: s.peakDeviation(),
    };
    ctx.postMessage(message, [buffer]);
  };

  const [x, y, z] = TRIPTYCH_POINT;

  s.scriptedEvent(
    s.nearestNode(x, y, z),
    2.2,
    (stage, tick) => send(stage, current, tick),
    () => packInto(current, s)
  );

  // The live canvas shows this state from here on: struck, corrected, and
  // carrying the mark. Nothing further advances it.
  publish(s);
}

function frame(): void {
  if (!system) return;

  const now = performance.now();
  if (lastTime === 0) lastTime = now;
  const elapsed = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;

  if (running) {
    accumulator += elapsed;
    let steps = 0;
    const started = performance.now();

    while (accumulator >= system.config.wave.dt && steps < MAX_STEPS_PER_FRAME) {
      system.step();
      accumulator -= system.config.wave.dt;
      steps++;
    }

    if (steps > 0) {
      const perStep = (performance.now() - started) / steps;
      stepMsAverage = stepMsAverage === 0 ? perStep : stepMsAverage * 0.9 + perStep * 0.1;
    }

    if (++sincePublish >= PUBLISH_EVERY) {
      sincePublish = 0;
      publish(system);
    }
  }

  setTimeout(frame, 4);
}

ctx.onmessage = (event: MessageEvent<WorkerInbound>): void => {
  const message = event.data;

  try {
    switch (message.type) {
      case 'init': {
        ctx.postMessage({ type: 'progress', fraction: 0, stage: 'synth' });

        system = new CorrectionSystem(DEFAULT_SYSTEM);
        const { graph, stats } = system.synthesised;
        textureSize = Math.ceil(Math.sqrt(graph.nodeCount));

        // Copies, because the originals stay in the Worker and these are
        // transferred out.
        const positions = graph.positions.slice().buffer;
        const directions = graph.directions.slice().buffer;
        const edges = system.edgeIndices.slice().buffer;

        const ready: ReadyMessage = {
          type: 'ready',
          nodeCount: graph.nodeCount,
          edgeCount: system.edgeIndices.length / 2,
          textureSize,
          positions,
          directions,
          edges,
          stats: { ...stats },
        };
        ctx.postMessage(ready, [positions, directions, edges]);

        // The world runs unsupervised, then the record is taken from it. This
        // is the bulk of real initialisation, so the loader reports it.
        system.warmUp((fraction) => {
          ctx.postMessage({ type: 'progress', fraction, stage: 'warmup' });
        });

        const record = system.operator.record.slice().buffer;
        ctx.postMessage({ type: 'record', record }, [record]);
        ctx.postMessage({ type: 'progress', fraction: 1, stage: 'record' });

        publish(system);
        lastTime = 0;
        frame();
        break;
      }

      case 'inject':
        system?.inject(message.node, message.energy);
        break;

      case 'gain':
        system?.setGain(message.value);
        break;

      case 'triptych':
        if (system) runTriptych(system);
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
