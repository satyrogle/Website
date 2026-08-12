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
};

/**
 * The rail.
 *
 * Scroll slides the look-point along the veil's long axis and closes the
 * camera's offset as it goes, so the whole descent is one continuous move:
 * travel plus approach, never a cut and never an orbit. The offset keeps all
 * three components large throughout, which is what holds the veil oblique — a
 * camera that ends up on the structure's own axis is how the retired tunnels
 * resolved into rings, and the rule outlived them.
 *
 * The opening pose is the frame approved at checkpoint A and is not re-authored
 * here: at progress 0 this evaluates to exactly `CAMERA.position` / `.target`.
 */
const RAIL = {
  /** Where the camera is looking, at the start and end of the descent. */
  targetFrom: new THREE.Vector3(-2.0, 1.1, 0.6),
  targetTo: new THREE.Vector3(-7.0, 0.2, -0.4),
  /** Camera position relative to that look-point. */
  offsetFrom: new THREE.Vector3(11.2, 5.1, 21.4),
  offsetTo: new THREE.Vector3(8.0, 3.4, 15.6),
};

/**
 * Enforcement gain against narrative depth.
 *
 * Flat through the opening and the invitation — the visitor's first press has
 * to meet the system at its most permissive, or the six stages have no room to
 * happen. It rises through NOTICE and GRADIENT and plateaus at the floor.
 * Falling back up the page lowers it again: the gradient is scroll-bound in
 * both directions. What does not come back is the damage.
 */
const GAIN = { from: 0.28, to: 0.75, low: 1.0, high: 2.2 };

const smoothstep = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/** Energy of one press. Bounded — the visitor gets an action, not a sandbox. */
const PRESS_ENERGY = 2.2;

/**
 * How many presses a visit is worth.
 *
 * The bound is the difference between an action and a toy. Twelve is enough to
 * strike, watch the whole event, and try it again somewhere else to see whether
 * the system behaves the same way — which is the comparison the GRADIENT band
 * depends on — and few enough that the structure can never become a thing to
 * play with while the meaning drains out of it.
 */
const PRESS_BUDGET = 12;

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

  /** Scratch for the camera rail, so a frame allocates nothing. */
  private railTarget = new THREE.Vector3();
  private railOffset = new THREE.Vector3();

  /** False past the floor, where the machine is off. */
  private machineOn = true;
  /** Bounded injection energy, in presses. */
  private pressesLeft = PRESS_BUDGET;
  /** True once anything has struck the structure, whoever started it. */
  private pressed = false;

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
    residual: 0,
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
    } else if (!this.disposed && this.machineOn) {
      // Only resume what the narrative says should be running: returning to
      // the tab while the visitor is reading the editorial must not restart
      // the machine behind it.
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
  pressAt(clientX: number, clientY: number, tolerance?: number): number {
    if (!this.model || !this.client) return -1;
    if (this.pressesLeft <= 0) return -1;

    this.pointerNdc.set(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1)
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const node = this.model.nodeUnderRay(this.raycaster.ray, tolerance);
    if (node < 0) return -1;

    this.client.inject(node, PRESS_ENERGY);
    this.pressesLeft--;
    this.pressed = true;
    document.dispatchEvent(
      new CustomEvent('injected', { detail: { node, left: this.pressesLeft } })
    );
    return node;
  }

  /**
   * The same action, without a pointer.
   *
   * Fired from the centre of the frame with no distance tolerance, so it
   * always lands on the structure: a keyboard or assistive user gets the
   * action itself, not a control that silently does nothing because their
   * ray missed a filament.
   */
  pressCentre(): number {
    return this.pressAt(window.innerWidth * 0.5, window.innerHeight * 0.5, Infinity);
  }

  /** Presses remaining this visit. */
  get budgetLeft(): number {
    return this.pressesLeft;
  }

  /** Whether the structure has been struck at all yet. */
  get struck(): boolean {
    return this.pressed;
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
   * Global narrative progress, 0..1.
   *
   * Two things hang off it: where the camera is on the rail, and how hard the
   * system enforces. The second is authoritative state, so it is not applied
   * here — it is posted to the Worker, which owns it.
   */
  setProgress(p: number): void {
    this.progress = Math.min(Math.max(p, 0), 1);

    const depth = smoothstep((this.progress - GAIN.from) / (GAIN.to - GAIN.from));
    this.client?.setGain(GAIN.low + (GAIN.high - GAIN.low) * depth);
  }

  /** Drives the cold-open reveal out of darkness. */
  setWake(target: number): void {
    this.exposureTarget = Math.min(Math.max(target, 0), 1);
  }

  /**
   * Machine off.
   *
   * Past the floor there is nothing more to say and the system stops: the
   * render loop ends and the Worker is paused, so the editorial is not a page
   * with a simulation still running behind it. The cut itself is done by the
   * layout — the editorial carries its own ground and rises over the canvas —
   * because a fade timed against the scroll would be a transition, and what
   * the beat needs is a stop.
   *
   * Coming back up restarts it exactly where it was. The state was never
   * rewound, so the bruises and the count are still there: scrolling back is
   * how the visitor finds that out.
   */
  setMachine(running: boolean): void {
    if (this.machineOn === running || this.disposed) return;
    this.machineOn = running;

    if (running) {
      this.client?.setRunning(true);
      if (!this.reducedMotion) this.start();
    } else {
      this.stop();
      this.client?.setRunning(false);
    }
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
      residual: snapshot.residual,
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

    // Eased against progress rather than tweened against time: the camera is a
    // readout of where the visitor is on the page, so it must be able to run
    // backwards exactly as it ran forwards, with no easing state to unwind.
    const t = smoothstep(this.progress);

    this.railTarget.copy(RAIL.targetFrom).lerp(RAIL.targetTo, t);
    this.railOffset.copy(RAIL.offsetFrom).lerp(RAIL.offsetTo, t);

    this.camera.position.copy(this.railTarget).add(this.railOffset);
    this.camera.lookAt(this.railTarget);
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
