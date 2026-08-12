import * as THREE from 'three';

import { QualityManager } from './QualityManager';
import { FieldModel } from './correction/FieldModel';
import { PulseClient } from './correction/sim/PulseClient';

/**
 * SceneController
 *
 * Owns the renderer, the single persistent scene and the frame loop, and
 * exposes the small surface the scroll director is allowed to touch.
 *
 * There is one path and it is THE CORRECTION: a synthesised structure stepped
 * in a Worker and drawn from authoritative snapshots. The retired entity
 * system that used to sit alongside it is gone from the tree entirely; git
 * history is where it lives now.
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

const CAMERA = { fov: 38 };

/**
 * The rail, in world space.
 *
 * Authored in world coordinates now, and close in. The choir's rail lived in a
 * flow frame that no longer exists, and it held the camera twenty units out
 * from a form about four across — which is why the first frame off the implicit
 * field read as a small contained lump rather than as something enormous.
 *
 * An apparition has to exceed the frame. The eye is inside the field's outer
 * folds looking through them, so the structure runs off every edge, parallax
 * separates its layers as the camera moves, and there is no silhouette to
 * measure it against. Scale is a lie the composition tells, and it can only
 * tell it if the boundaries are outside the picture.
 */
const RAIL = {
  eyeFrom: [5.6, 2.05, 8.1] as const,
  eyeTo: [3.4, 1.15, 5.0] as const,
  aimFrom: [0.35, 0.15, -0.2] as const,
  aimTo: [0.1, -0.05, -0.55] as const,
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

/**
 * Portrait recomposition.
 *
 * Not the landscape frame scaled down. The veil is eighteen units long and
 * under two thick, and a tall viewport's horizontal field is narrow: held
 * level it would be cropped to a fragment, and pulling back far enough to fit
 * it would reduce it to a thread across the middle of the frame.
 *
 * So the frame turns instead of the object. Rolling the camera puts the veil
 * on the diagonal, which is the longest run a portrait frame has — about
 * sixteen units against seven across the width — and the composition fills
 * rather than shrinks. The camera is still on a straight rail; only its
 * horizon is different.
 */
const PORTRAIT = { fov: 34, roll: -0.92, below: 0.85, retreat: 1.7, drop: 1.0 };

const smoothstep = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/**
 * Energy of one press. Bounded — the visitor gets an action, not a sandbox.
 *
 * Under the first-order field this lands directly in the state rather than in a
 * velocity to be integrated, so it is read in the same units the renderer
 * swings by: 0.8 turns the struck blades about eighteen degrees out of the comb
 * their neighbours are still in. Measured rather than chosen — at 0.8 the
 * system notices after 0.28 s, takes hold of about fifty blades, and lets go
 * 2.2 s later with the residual back at zero.
 */
export const PRESS_ENERGY = 0.8;

/** Longest a touch can rest and still be a tap rather than a hold. */
const TAP_MS = 350;
/** Movement that turns a tap into travel, in CSS pixels. */
const TAP_SLOP = 8;

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

/**
 * How long one press takes to come back.
 *
 * The budget exists so the structure cannot become a toy, and it did its job
 * too well: spend twelve and the site stops responding to clicks entirely,
 * which does not read as restraint, it reads as broken. A visitor who has been
 * exploring for a minute is exactly the visitor who should still be able to
 * strike it.
 *
 * So the budget is a rate now rather than a quota. It is still bounded at any
 * instant — twelve is the most that can ever be spent at once, and rapid
 * clicking still runs dry — but it refills while the visitor watches what they
 * did, which is the pace the event happens at anyway.
 */
const PRESS_RECHARGE_MS = 5000;

export class SceneController {
  readonly quality: QualityManager;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  model: FieldModel | null = null;

  private renderer: THREE.WebGLRenderer;
  private client: PulseClient | null = null;
  private frameHandle = 0;
  private running = false;
  private reducedMotion: boolean;
  private disposed = false;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  /** True when the viewport is tall enough to need its own composition. */
  private portrait = false;

  /** Scratch for the camera rail, so a frame allocates nothing. */
  private railTarget = new THREE.Vector3();
  private railOffset = new THREE.Vector3();

  /** False past the floor, where the machine is off. */
  private machineOn = true;
  /** Bounded injection energy, in presses. */
  private pressesLeft = PRESS_BUDGET;
  /** When the budget was last reconciled against the clock. */
  private budgetAt = 0;
  /** Live so the dev panel can move it. */
  private pressEnergy = PRESS_ENERGY;
  /** True once anything has struck the structure, whoever started it. */
  private pressed = false;
  /** A touch in progress that has not yet disqualified itself as a tap. */
  private tap: { id: number; x: number; y: number; at: number } | null = null;

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
      // The ribbons are opaque and have to occlude one another, so there is a
      // depth buffer now. The old line field was additive and order-free.
      depth: true,
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
    this.compose();
    this.applyCamera();

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
  async warmUp(
    onProgress?: (fraction: number, stage: 'synth' | 'warmup' | 'record') => void
  ): Promise<void> {
    const client = new PulseClient();
    this.client = client;

    client.onProgress = (message) => {
      // Graph synthesis is a tenth of it; the warm-up ticks are the rest.
      const fraction = message.stage === 'synth' ? 0 : 0.1 + message.fraction * 0.9;
      onProgress?.(Math.min(fraction, 1), message.stage);
    };

    client.start();
    await client.ready;

    if (!client.structure || !client.record) {
      throw new Error('correction: worker reported ready without a structure');
    }

    this.model = new FieldModel();
    this.scene.add(this.model.group);
    this.resize();

    // The first snapshot is drained so telemetry starts from the settled world
    // rather than from zero. The field does not read it yet — see `consume`.
    const first = client.take();
    if (first) client.release(first);

    onProgress?.(1, 'record');
  }

  // ------------------------------------------------------------------
  //  Events
  // ------------------------------------------------------------------

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    // Press, not hover, and never preventDefault-ed, so it can never
    // interfere with scrolling. A mouse presses on the way down; a finger
    // has to finish the gesture first — see `onPointerDown`.
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerCancel, { passive: true });

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
    } else if (!this.disposed && this.machineOn && !this.reducedMotion) {
      // Only resume what the narrative says should be running: returning to
      // the tab while the visitor is reading the editorial must not restart
      // the machine behind it, and the reduced-motion world does not run at
      // all after boot.
      this.client?.setRunning(true);
      this.start();
    }
  };

  /**
   * A mouse means it on the way down. A finger does not.
   *
   * `pointerdown` fires the instant a finger touches the glass, before the
   * browser has decided whether the gesture is a tap or a scroll — and the
   * machine's bands are mostly empty space, so on a phone every flick down
   * the descent was landing as a press. That spent the visit's whole budget
   * on scrolling and, worse, marked the structure as struck, which is the one
   * condition that cancels the false first action. The visitor was being
   * charged for deciding to look.
   *
   * So touch and pen arm a tap and resolve it on release: short enough, and
   * still in the same place. Anything else is travel, and travel is free.
   */
  private onPointerDown = (event: PointerEvent): void => {
    if (this.isReading(event.target)) return;

    if (event.pointerType === 'mouse') {
      this.pressAt(event.clientX, event.clientY);
      return;
    }

    this.tap = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
  };

  private onPointerMove = (event: PointerEvent): void => {
    const tap = this.tap;
    if (!tap || event.pointerId !== tap.id) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) this.tap = null;
  };

  private onPointerUp = (event: PointerEvent): void => {
    const tap = this.tap;
    if (!tap || event.pointerId !== tap.id) return;
    this.tap = null;

    if (performance.now() - tap.at > TAP_MS) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) return;
    if (this.isReading(event.target)) return;

    this.pressAt(event.clientX, event.clientY);
  };

  /** The browser took the gesture for itself — a scroll, or a system edge swipe. */
  private onPointerCancel = (event: PointerEvent): void => {
    if (this.tap?.id === event.pointerId) this.tap = null;
  };

  /**
   * Surfaces that are being read rather than touched. The record panel is on
   * the list because it is the one piece of the machine's own text a visitor
   * is meant to stop and read, and reading it should not strike anything.
   */
  private isReading(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el?.closest?.('a, button, details, summary, input, textarea, select, [data-record]');
  }

  /**
   * One press, one bounded impulse. The raycast resolves to a node so the
   * deviation starts where the visitor touched — the causal link between the
   * action and what happens next is the whole point of the interaction.
   */
  pressAt(clientX: number, clientY: number, tolerance?: number): number {
    if (!this.model || !this.client) return -1;

    this.recharge();
    if (this.pressesLeft <= 0) return -1;

    // Only while there is something to press.
    //
    // Past the floor the machine is off and the editorial's own ground is
    // covering the canvas — but a raycast does not know that, so a click on
    // body copy was reaching through it, spending budget on a deviation
    // nobody could see and parking it in a paused Worker to erupt whenever
    // the visitor scrolled back up. Under reduced motion the same press went
    // into a world that is never re-rendered. In both cases the action has no
    // consequence the visitor can observe, and an action without an
    // observable consequence is the one thing this interaction cannot be.
    if (!this.machineOn || this.reducedMotion) return -1;

    this.pointerNdc.set(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1)
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    // Deliberately dead while the carrier is being judged.
    //
    // The implicit field has no elements to raycast against and no deviation
    // input attached yet, so a press would spend budget, mark the structure as
    // struck, cancel the false first action, and show the visitor nothing. An
    // action without an observable consequence is the one thing this
    // interaction cannot be, so it is off rather than half-wired.
    void tolerance;
    const node = -1;
    if (node < 0) return -1;

    this.client.inject(node, this.pressEnergy);
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

  /**
   * Development only. Routes a tuning patch to whichever layer owns each
   * number — the Worker for anything the simulation reads, the material for
   * anything the renderer reads.
   */
  tune(patch: {
    dynamics?: Record<string, number>;
    correction?: Record<string, number>;
    render?: Record<string, number>;
    hops?: number;
    energy?: number;
  }): void {
    if (patch.dynamics || patch.correction || patch.hops !== undefined) {
      this.client?.tune({
        dynamics: patch.dynamics,
        correction: patch.correction,
        hops: patch.hops,
      });
    }
    if (patch.render) this.model?.tune(patch.render);
    if (patch.energy !== undefined) this.pressEnergy = patch.energy;
  }

  /** Returns spent presses at a fixed rate, up to the cap. */
  private recharge(): void {
    const now = performance.now();
    if (this.budgetAt === 0) {
      this.budgetAt = now;
      return;
    }
    const earned = Math.floor((now - this.budgetAt) / PRESS_RECHARGE_MS);
    if (earned <= 0) return;
    this.budgetAt += earned * PRESS_RECHARGE_MS;
    this.pressesLeft = Math.min(PRESS_BUDGET, this.pressesLeft + earned);
  }

  /** Presses available right now. */
  get budgetLeft(): number {
    this.recharge();
    return this.pressesLeft;
  }

  /**
   * Adjustments this visit is answerable for.
   *
   * Not the same as the Worker's total. The reduced-motion path runs a real
   * correction event at boot to render the triptych, and those two hundred
   * adjustments belong to the demonstration, not to a visitor who has not
   * touched anything — putting them on the record would say they did
   * something they were never even shown happening. Subtracting the
   * system's own work is what makes YOUR RECORD true on every path.
   */
  get visitAdjustments(): number {
    const own = this.telemetry.adjustments - (this.client?.systemAdjustments ?? 0);
    return own > 0 ? own : 0;
  }

  /**
   * Takes the newest counters without drawing anything. The reduced-motion
   * path has no render loop, so this is how the record panel reads a world
   * that is otherwise only ever consumed by a frame.
   */
  pollTelemetry(): void {
    this.consume();
  }

  /** Whether the structure has been struck at all yet. */
  get struck(): boolean {
    return this.pressed;
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.canvasSize();
    const ratio = this.quality.pixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    // The march is per pixel, so the quality tier buys steps here rather than
    // elements. This is the whole performance story of the new carrier.
    this.model?.setSize(clientWidth * ratio, clientHeight * ratio);
    this.model?.setSteps(ratio > 1.25 ? 96 : 144);
    this.compose();
  }

  /** Picks the composition the viewport shape needs, and nothing else. */
  private compose(): void {
    const { clientWidth, clientHeight } = this.canvasSize();
    this.portrait = clientWidth / Math.max(clientHeight, 1) < PORTRAIT.below;

    this.camera.fov = this.portrait ? PORTRAIT.fov : CAMERA.fov;
    if (this.portrait) {
      this.camera.up.set(Math.sin(PORTRAIT.roll), Math.cos(PORTRAIT.roll), 0);
    } else {
      this.camera.up.set(0, 1, 0);
    }
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
      // Reduced motion is deliberately not resumed. Its world was stepped
      // once, at boot, to produce the triptych and the state behind it; there
      // is no render loop consuming snapshots, so resuming the Worker would
      // advance the simulation where nobody can see it and leave the held
      // frame describing a past that no longer matches the counters.
      if (this.reducedMotion) return;
      this.client?.setRunning(true);
      this.start();
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

  /**
   * Three stills of one correction event, rendered off the same scene the
   * live path uses.
   *
   * This is the reduced-motion explanation. A before-and-after pair would be
   * the failure the direction was warned about — an unexplained change — so
   * the middle frame is the one that matters: the system has hold of the
   * deviation and has not won yet.
   *
   * Rendered at a fixed size rather than at the viewport's, so the three
   * stills are the same shape on every machine, and taken while the loader is
   * still up so the temporary resize is never seen.
   */
  async captureTriptych(width = 1000): Promise<Array<{ stage: string; url: string }>> {
    if (!this.client || !this.model) return [];

    const frames = await this.client.triptych();
    const height = Math.round(width * 0.6);

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);

    // The stills are landscape thumbnails whatever the viewport is, so they
    // get the landscape pose. A phone would otherwise inherit the portrait
    // roll and render three diagonal compositions inside three wide frames —
    // the recomposition applied to the one place it does not belong. The
    // portrait flag is lowered for the same reason: applyCamera reads it for
    // the retreat, and these frames are the landscape composition. The
    // closing resize() puts the viewport's own composition back.
    this.portrait = false;
    this.camera.fov = CAMERA.fov;
    this.camera.up.set(0, 1, 0);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.model.setExposure(1);
    this.applyCamera();

    const stills = frames.map((frame) => {
      this.model?.setCamera(this.camera);
      this.renderer.render(this.scene, this.camera);
      return { stage: frame.stage, url: this.renderer.domElement.toDataURL('image/png') };
    });

    // Back to the viewport, and back to the world the event left behind.
    this.resize();
    this.consume();
    this.renderStill();

    return stills;
  }

  /** Renders exactly one frame — used for the reduced-motion still. */
  renderStill(): void {
    this.exposure = 1;
    this.consume();
    this.applyCamera();
    this.model?.setCamera(this.camera);
    this.model?.setExposure(1);
    this.renderer.render(this.scene, this.camera);
  }

  /** Takes the newest authoritative snapshot, if one has arrived. */
  private consume(): void {
    const client = this.client;
    if (!client || !this.model) return;

    const snapshot = client.take();
    if (!snapshot) return;

    // Telemetry only. The authoritative world is still stepped in the Worker
    // and still counts its own corrections, but nothing renders it: the field
    // carrier is being judged on the approved state before the deviation is
    // attached to it, because every carrier before this one was wired to state
    // first and then thrown away on the frame.
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

  /** A point on the rail, in world space, at rail parameter `t`. */
  private railPose(t: number, eye: THREE.Vector3, aim: THREE.Vector3): void {
    const lerp = (from: readonly number[], to: readonly number[], index: number): number =>
      from[index] + (to[index] - from[index]) * t;

    eye.set(
      lerp(RAIL.eyeFrom, RAIL.eyeTo, 0),
      lerp(RAIL.eyeFrom, RAIL.eyeTo, 1),
      lerp(RAIL.eyeFrom, RAIL.eyeTo, 2)
    );
    aim.set(
      lerp(RAIL.aimFrom, RAIL.aimTo, 0),
      lerp(RAIL.aimFrom, RAIL.aimTo, 1),
      lerp(RAIL.aimFrom, RAIL.aimTo, 2)
    );
  }

  /**
   * The no-rings guardrail, restated for a field with no axis.
   *
   * The camera cone is retired with the flow it protected: there is no
   * privileged direction here to look down. The rule that outlived four
   * directions has not gone anywhere, it has moved into the shader — every
   * fold is offset before it mirrors and rotated on an axis shared with
   * nothing, because origin-centred mirrors and radial domain repetition are
   * the two ways a raymarcher manufactures concentric arcs. That construction
   * cannot be asserted from here; it is checked by looking, on real hardware,
   * from several poses.
   */

  private applyCamera(): void {
    // Eased against progress rather than tweened against time: the camera is a
    // readout of where the visitor is on the page, so it must be able to run
    // backwards exactly as it ran forwards, with no easing state to unwind.
    // Reduced motion holds it at the head of the rail, which is the same pose
    // by construction rather than a second set of numbers to keep in step.
    const t = this.reducedMotion ? 0 : smoothstep(this.progress);

    this.railPose(t, this.railOffset, this.railTarget);

    // A tall frame sees far less across its width, and the choir's long axis
    // runs across the frame — held level it would be cropped to a fragment. So
    // portrait stands further back along the same line and aims lower, which
    // carries the field into the frame's upper reach and leaves the copy on its
    // own ground. Still one straight rail; only distance and aim move.
    if (this.portrait) {
      this.railOffset.sub(this.railTarget).multiplyScalar(PORTRAIT.retreat).add(this.railTarget);
      this.railTarget.y -= PORTRAIT.drop;
    }

    this.camera.position.copy(this.railOffset);
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
    this.model?.setCamera(this.camera);
    this.model?.setTime(now / 1000);
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
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
