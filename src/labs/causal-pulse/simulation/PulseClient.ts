/**
 * Main-thread handle on the simulation Worker.
 *
 * Holds exactly one snapshot at a time. If the renderer is slower than the
 * publish rate the older buffer is recycled unread rather than queued, because
 * a backlog of stale frames is worse than a dropped one.
 */

import type { SimulationMetrics } from './CausalPulseSimulation';
import type { StateMessage, WorkerInbound, WorkerOutbound } from './PulseWorker';

export interface PulseSnapshot {
  data: Float32Array;
  buffer: ArrayBuffer;
  tick: number;
  metrics: SimulationMetrics;
  checksum: number;
  injections: number;
  stepMs: number;
}

export class PulseClient {
  private readonly worker: Worker;
  private pending: PulseSnapshot | null = null;

  nodeCount = 0;
  textureSize = 0;
  manifest: unknown = null;
  error: string | null = null;

  private readyResolve: (() => void) | null = null;
  readonly ready: Promise<void>;

  constructor() {
    this.worker = new Worker(new URL('./PulseWorker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((resolve) => { this.readyResolve = resolve; });

    this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const message = event.data;

      if (message.type === 'ready') {
        this.nodeCount = message.nodeCount;
        this.textureSize = message.textureSize;
        this.manifest = message.manifest;
        this.readyResolve?.();
        return;
      }

      if (message.type === 'error') {
        this.error = message.message;
        console.error('[causal-pulse] worker:', message.message);
        return;
      }

      this.accept(message);
    };
  }

  private accept(message: StateMessage): void {
    // Drop the unread frame rather than letting snapshots queue up.
    if (this.pending) this.recycle(this.pending.buffer);

    this.pending = {
      data: new Float32Array(message.buffer),
      buffer: message.buffer,
      tick: message.tick,
      metrics: message.metrics,
      checksum: message.checksum,
      injections: message.injections,
      stepMs: message.stepMs,
    };
  }

  private recycle(buffer: ArrayBuffer): void {
    const message: WorkerInbound = { type: 'recycle', buffer };
    this.worker.postMessage(message, [buffer]);
  }

  start(): void {
    const message: WorkerInbound = { type: 'init' };
    this.worker.postMessage(message);
  }

  inject(node: number, energy = 1): void {
    const message: WorkerInbound = { type: 'inject', node, energy };
    this.worker.postMessage(message);
  }

  setRunning(running: boolean): void {
    const message: WorkerInbound = { type: 'setRunning', running };
    this.worker.postMessage(message);
  }

  /** Latest snapshot, or null if nothing new arrived since the last call. */
  take(): PulseSnapshot | null {
    const snapshot = this.pending;
    this.pending = null;
    return snapshot;
  }

  /** Hand a consumed snapshot's buffer back for reuse. */
  release(snapshot: PulseSnapshot): void {
    this.recycle(snapshot.buffer);
  }

  dispose(): void {
    this.worker.terminate();
  }
}
