import * as THREE from 'three';

import { QualityManager } from './QualityManager';
import { CorrectionModel } from './correction/CorrectionModel';
import { PulseClient } from './correction/sim/PulseClient';

/**
 * SceneController
 *
 * Owns the renderer, the single persistent scene and the frame loop, and
 * exposes the small surface the scroll director is allowed to touch.
 *
 * The live path is THE CORRECTION: a synthesised structure stepped in a Worker
 * and drawn from authoritative snapshots. `LatticeModel`, `ReactionField`,
 * `Lighting`, `CameraRig` and `PostPipeline` are the retired entity system —
 * they remain in the tree but are no longer wired, and step 8 of the build plan
 * retires them from the build.
 *
 * No caller can swap scenes, reseed the graph or rebuild the structure, which
 * is what keeps the site a single continuous world by construction.
 */

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
}

export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * The opening camera.
 *
 * Deliberately off every axis of the structure. A view down a clean central
 * axis is how the retired tunnels read as concentric rings, and the rule
 * outlived them: the veil is met obliquely and slightly from above, so it
 * recedes across the frame as a band with the void above and below it.
 */
const CAMERA = {
  fov: 30,
  position: new THREE.Vector3(9.2, 6.2, 22.0),
  target: new THREE.Vector3(-2.0, 1.1, 0.6),
  /** How far scroll walks the camera along the veil. Step 4 authors the rest. */
  travel: new THREE.Vector3(-6.5, -1.4, -4.2),
};

/** Energy of one press. Bounded — the visitor gets an action, not a sandbox. */
const PRESS_ENERGY = 2.2;

export class SceneController {
  readonly quality: QualityManager;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  model: CorrectionModel | null = null;

  private renderer: THREE.WebGLRenderer;
  private client: PulseClient | null = null;
  private frameHandle = 0;
  private running = false;
  private reducedMotion: boolean;
  private disposed = false;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  private progress = 0;
  private exposure = 0;
  private exposureTarget = 0;
  private lastFrameTime = 0;

  /** Latest published counters. Read-only; the Worker owns the truth. */
  telemetry = {
    tick: 0,
    adjustments: 0,
    engaged: 0,
    correctionEnergy: 0,
    peakDeviation: 0,
    injections: 0,
    stepMs: 0,
  };

  private resizeObserver: ResizeObserver | null = null;

  constructor(options: SceneOptions) {
    this.reducedMotion = options.reducedMotion;
    this.quality = new QualityManager();

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      // On by default now. The structure is drawn as hairlines with no post to
      // hide edge aliasing behind, so multisampling is doing real work.
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: false,
    });
    this.renderer.setClearColor(new THREE.Color('#05070a'), 1);
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    // Tone mapping only, and none of it. Intensities are authored directly in
    // the shaders against a near-black ground, so there is no highlight to roll
    // off — and a filmic curve would desaturate exactly the hues that carry the
    // colour grammar.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const { clientWidth, clientHeight } = this.canvasSize();
    this.renderer.setSize(clientWidth, clientHeight, false);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, clientWidth / Math.max(clientHeight, 1), 0.1, 200);
    this.camera.position.copy(CAMERA.position);
    this.camera.lookAt(CAMERA.target);

    this.quality.onChange(() => this.resize());
    this.bindEvents();
  }

  private canvasSize(): { clientWidth: number; clientHeight: number } {
    return {
      clientWidth: Math.max(1, window.innerWidth),
      clientHeight: Math.max(1, window.innerHeight),
    };
  }

  // ------------------------------------------------------------------
  //  Initialisation — the graph, the calm, and the record
  // ------------------------------------------------------------------

  /**
   * Synthesises the structure, runs it unsupervised, and takes the record from
   * the result. This is the site's real initialisation work, so the loader is
   * reporting progress rather than counting down a timer.
   */
  async warmUp(onProgress?: (fraction: number) => void): Promise<void> {
    const client = new PulseClient();
    this.client = client;

    client.onProgress = (message) => {
      // Graph synthesis is a tenth of it; the warm-up ticks are the rest.
      const fraction = message.stage === 'synth' ? 0 : 0.1 + message.fraction * 0.9;
      onProgress?.(Math.min(fraction, 1));
    };

    client.start();
    await client.ready;

    if (!client.structure || !client.record) {
      throw new Error('correction: worker reported ready without a structure');
    }

    this.model = new CorrectionModel({ structure: client.structure, record: client.record });
    this.scene.add(this.model.group);

    // The first snapshot is published with the record, so the opening frame is
    // the settled world rather than an undisplaced one.
    const first = client.take();
    if (first) {
      this.model.applySnapshot(first);
      client.release(first);
    }

    onProgress?.(1);
  }

  // ------------------------------------------------------------------
  //  Events
  // ------------------------------------------------------------------

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    // Press, not hover. Touch is identical to mouse and is never
    // preventDefault-ed, so it can never interfere with scrolling.
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(document.documentElement);
    }
  }

  private onResize = (): void => {
    this.resize();
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      this.stop();
      this.client?.setRunning(false);
    } else if (!this.disposed) {
      this.client?.setRunning(true);
      this.start();
    }
  };

  private onPointerDown = (event: PointerEvent): void => {
    // Presses on the editorial content are reading, not touching the structure.
    const target = event.target as HTMLElement | null;
    if (target && target.closest('a, button, details, summary, input, textarea, select')) return;

    this.pressAt(event.clientX, event.clientY);
  };

  /**
   * One press, one bounded impulse. The raycast resolves to a node so the
   * deviation starts where the visitor touched — the causal link between the
   * action and what happens next is the whole point of the interaction.
   */
  pressAt(clientX: number, clientY: number): number {
    if (!this.model || !this.client) return -1;

    this.pointerNdc.set(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1)
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const node = this.model.nodeUnderRay(this.raycaster.ray);
    if (node < 0) return -1;

    this.client.inject(node, PRESS_ENERGY);
    return node;
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.canvasSize();
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------
  //  Narrative surface — the only things the director may change
  // ------------------------------------------------------------------

  /**
   * Global scroll progress, 0..1.
   *
   * For now this only walks the camera along the veil so the page is not dead
   * under the scrollbar. Step 4 of the build plan owns the real bands — OPEN,
   * ASK, NOTICE, GRADIENT, FLOOR — and the enforcement gain that rises with
   * them.
   */
  setProgress(p: number): void {
    this.progress = Math.min(Math.max(p, 0), 1);
  }

  /** Drives the cold-open reveal out of darkness. */
  setWake(target: number): void {
    this.exposureTarget = Math.min(Math.max(target, 0), 1);
  }

  // ------------------------------------------------------------------
  //  Loop
  // ------------------------------------------------------------------

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  /** Renders exactly one frame — used for the reduced-motion still. */
  renderStill(): void {
    this.exposure = 1;
    this.consume();
    this.applyCamera();
    this.model?.setExposure(1);
    this.renderer.render(this.scene, this.camera);
  }

  /** Takes the newest authoritative snapshot, if one has arrived. */
  private consume(): void {
    const client = this.client;
    if (!client || !this.model) return;

    const snapshot = client.take();
    if (!snapshot) return;

    this.model.applySnapshot(snapshot);
    this.telemetry = {
      tick: snapshot.tick,
      adjustments: snapshot.adjustments,
      engaged: snapshot.engaged,
      correctionEnergy: snapshot.correctionEnergy,
      peakDeviation: snapshot.peakDeviation,
      injections: snapshot.injections,
      stepMs: snapshot.stepMs,
    };
    client.release(snapshot);
  }

  private applyCamera(): void {
    if (this.reducedMotion) {
      this.camera.position.copy(CAMERA.position);
      this.camera.lookAt(CAMERA.target);
      return;
    }

    this.camera.position.copy(CAMERA.position).addScaledVector(CAMERA.travel, this.progress);
    this.camera.lookAt(CAMERA.target);
  }

  private tick = (): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.tick);

    const now = performance.now();
    const rawDelta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    const dt = Math.min(rawDelta / 1000, 1 / 20);

    this.quality.sample(rawDelta, now);

    // Cold-open reveal. The only eased quantity in the whole system, and it
    // touches exposure alone — never the state, never the geometry.
    this.exposure += (this.exposureTarget - this.exposure) * (1 - Math.pow(0.05, dt));
    this.model?.setExposure(this.exposure);

    this.consume();
    this.applyCamera();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointerdown', this.onPointerDown);
    this.resizeObserver?.disconnect();
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
      this.model = null;
    }
    this.client?.dispose();
    this.client = null;
    this.renderer.dispose();
  }
}
