/**
 * Main-thread handle on the simulation Worker. Ported from the causal-pulse
 * spike (`src/labs/causal-pulse/simulation/PulseClient.ts`), extended with the
 * graph hand-off and the record.
 *
 * Holds exactly one snapshot at a time. If the renderer is slower than the
 * publish rate the older buffer is recycled unread rather than queued, because
 * a backlog of stale frames is worse than a dropped one.
 */

import type {
  FrameMessage,
  ProgressMessage,
  StateMessage,
  WorkerInbound,
  WorkerOutbound,
} from './PulseWorker';

/** One still from the scripted correction event. */
export interface TriptychFrame {
  stage: FrameMessage['stage'];
  data: Float32Array;
  tick: number;
  adjustments: number;
  engaged: number;
  peakDeviation: number;
}

/** The synthesised structure, as the renderer needs it. */
export interface StructureHandoff {
  nodeCount: number;
  edgeCount: number;
  textureSize: number;
  positions: Float32Array;
  directions: Float32Array;
  edges: Uint32Array;
  stats: Record<string, number>;
}

export interface CorrectionSnapshot {
  data: Float32Array;
  buffer: ArrayBuffer;
  tick: number;
  adjustments: number;
  engaged: number;
  correctionEnergy: number;
  peakDeviation: number;
  residual: number;
  injections: number;
  stepMs: number;
}

export class PulseClient {
  private readonly worker: Worker;
  private pending: CorrectionSnapshot | null = null;

  structure: StructureHandoff | null = null;
  /** u* — available once the warm-up has been recorded. */
  record: Float32Array | null = null;
  error: string | null = null;
  /** Last gain sent. The Worker holds the authoritative copy. */
  gain = 1;
  /**
   * Adjustments the system had already made to itself before the visitor
   * arrived. Zero on the live path; on the reduced-motion path the scripted
   * event that produces the triptych is a real correction on the real world,
   * so its count is the system's, not theirs.
   */
  systemAdjustments = 0;

  onProgress: ((message: ProgressMessage) => void) | null = null;

  private readonly frames: TriptychFrame[] = [];
  private resolveFrames: ((frames: TriptychFrame[]) => void) | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((reason: Error) => void) | null = null;
  /** Resolves when the structure exists AND the record has been taken. */
  readonly ready: Promise<void>;

  constructor() {
    this.worker = new Worker(new URL('./PulseWorker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const message = event.data;

      switch (message.type) {
        case 'ready':
          this.structure = {
            nodeCount: message.nodeCount,
            edgeCount: message.edgeCount,
            textureSize: message.textureSize,
            positions: new Float32Array(message.positions),
            directions: new Float32Array(message.directions),
            edges: new Uint32Array(message.edges),
            stats: message.stats,
          };
          break;

        case 'progress':
          this.onProgress?.(message);
          break;

        case 'record':
          this.record = new Float32Array(message.record);
          this.resolveReady?.();
          this.resolveReady = null;
          break;

        case 'frame':
          this.frames.push({
            stage: message.stage,
            data: new Float32Array(message.buffer),
            tick: message.tick,
            adjustments: message.adjustments,
            engaged: message.engaged,
            peakDeviation: message.peakDeviation,
          });
          // The settled frame closes the scripted event, so its count is
          // exactly what the demonstration cost.
          if (message.stage === 'settled') this.systemAdjustments = message.adjustments;
          if (this.frames.length === 3) {
            this.resolveFrames?.(this.frames);
            this.resolveFrames = null;
          }
          break;

        case 'error':
          this.error = message.message;
          console.error('[correction] worker:', message.message);
          this.rejectReady?.(new Error(message.message));
          this.rejectReady = null;
          this.resolveReady = null;
          break;

        default:
          this.accept(message);
      }
    };
  }

  private accept(message: StateMessage): void {
    // Drop the unread frame rather than letting snapshots queue up.
    if (this.pending) this.recycle(this.pending.buffer);

    this.pending = {
      data: new Float32Array(message.buffer),
      buffer: message.buffer,
      tick: message.tick,
      adjustments: message.adjustments,
      engaged: message.engaged,
      correctionEnergy: message.correctionEnergy,
      peakDeviation: message.peakDeviation,
      residual: message.residual,
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

  /**
   * Narrative gain. Quantised and deduplicated here rather than in the caller:
   * scroll produces a value every frame, and an unfiltered stream would post
   * sixty messages a second and make the recorded trace unreadable.
   */
  setGain(value: number): void {
    const quantised = Math.round(value * 256) / 256;
    if (quantised === this.gain) return;
    this.gain = quantised;
    const message: WorkerInbound = { type: 'gain', value: quantised };
    this.worker.postMessage(message);
  }

  /**
   * Runs one correction event and returns three stills of it. The world is
   * left where the event left it, which is the state the reduced-motion path
   * shows: struck, corrected, and still carrying the mark.
   */
  triptych(): Promise<TriptychFrame[]> {
    const message: WorkerInbound = { type: 'triptych' };
    this.worker.postMessage(message);
    return new Promise((resolve) => {
      this.resolveFrames = resolve;
    });
  }

  setRunning(running: boolean): void {
    const message: WorkerInbound = { type: 'setRunning', running };
    this.worker.postMessage(message);
  }

  /** Latest snapshot, or null if nothing new arrived since the last call. */
  take(): CorrectionSnapshot | null {
    const snapshot = this.pending;
    this.pending = null;
    return snapshot;
  }

  /** Hand a consumed snapshot's buffer back for reuse. */
  release(snapshot: CorrectionSnapshot): void {
    this.recycle(snapshot.buffer);
  }

  dispose(): void {
    this.worker.terminate();
  }
}
