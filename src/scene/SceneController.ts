import * as THREE from 'three';

import { QualityManager, type QualitySettings } from './QualityManager';
import { ReactionField, type PresetName } from './ReactionField';
import { DarkLatticeMonolithModel } from './DarkLatticeMonolithModel';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { PostPipeline } from './PostPipeline';
import { Particulate } from './Particulate';

/**
 * SceneController
 *
 * Owns the renderer, the one persistent scene and the frame loop, and
 * exposes the small surface the prologue director is allowed to touch.
 *
 * No caller can swap scenes, reseed the field or rebuild the monolith.
 * That is what makes the disturbance made in the Full Form provably the
 * same one arriving at the latent core.
 */

export type PrologueState = 'full' | 'opening' | 'tunnel' | 'latent';

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
}

function smoothstep01(x: number): number {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
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
 * Where the disturbance is allowed to land, in the planar field's UV.
 *
 * The spine itself is recessed behind the outer masses and is not
 * visible head-on, so the trace is placed on the inner masses flanking
 * the passage — on the spine's own axis, and actually on screen. The
 * aperture band in the middle is skipped for the same reason: a mark
 * made in the open gap would have no surface to appear on.
 */
const TRACE_U = [0.32, 0.68] as const;
const TRACE_V = [0.3, 0.72] as const;
const APERTURE_U = [0.42, 0.58] as const;
const TRACE_DEFAULT: [number, number] = [0.385, 0.52];

export class SceneController {
  readonly quality: QualityManager;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly entity: DarkLatticeMonolithModel;
  readonly field: ReactionField;
  readonly lighting: Lighting;
  /** The air. Nothing else in the void sits at a different distance. */
  readonly motes: Particulate;

  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private post: PostPipeline;
  private clock = new THREE.Clock();
  private frameHandle = 0;
  private running = false;
  private reducedMotion: boolean;

  private raycaster = new THREE.Raycaster();
  private tracePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.5);
  private hitPoint = new THREE.Vector3();
  private pointerNdc = new THREE.Vector2();

  private progress = 0;
  private state: PrologueState = 'full';
  private wake = 0;
  private wakeTarget = 0;
  /** Tectonic opening. Eased, rises once and holds. */
  private open = 0;

  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  constructor(options: SceneOptions) {
    this.canvas = options.canvas;
    this.reducedMotion = options.reducedMotion;
    this.quality = new QualityManager();

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: false, // the composite pass and grain hide edge aliasing
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    // The void. The monolith has to be the brightest thing in frame for
    // the silhouette to read at all.
    this.renderer.setClearColor(new THREE.Color('#010204'), 1);
    this.renderer.setPixelRatio(this.quality.pixelRatio());

    const { width, height } = this.canvasSize();
    this.renderer.setSize(width, height, false);

    const settings = this.quality.settings;
    const mobile = window.innerWidth < 820;

    this.field = new ReactionField(this.renderer, settings.simResolution);
    this.field.seed();

    this.entity = new DarkLatticeMonolithModel({ reducedMotion: this.reducedMotion });
    this.scene.add(this.entity.group);

    this.rig = new CameraRig(width / Math.max(height, 1), mobile);
    this.lighting = new Lighting();

    const moteCount =
      settings.tier === 'high' ? 4200 : settings.tier === 'medium' ? 2400 : 1100;
    this.motes = new Particulate(moteCount, this.renderer.getPixelRatio());
    this.scene.add(this.motes.points);

    const dpr = this.renderer.getPixelRatio();
    this.post = new PostPipeline(
      this.renderer,
      Math.floor(width * dpr),
      Math.floor(height * dpr),
      settings.tier === 'high' ? 4 : settings.tier === 'medium' ? 2 : 0
    );
    this.post.enabled = settings.bloom;

    if (this.reducedMotion) {
      this.rig.setMotionScale(0);
      this.rig.applyPoster();
    }

    this.quality.onChange((s) => this.applyQuality(s));
    this.bindEvents();
  }

  private canvasSize(): { width: number; height: number } {
    return {
      width: Math.max(1, this.canvas.clientWidth || window.innerWidth),
      height: Math.max(1, this.canvas.clientHeight || window.innerHeight),
    };
  }

  private applyQuality(settings: QualitySettings): void {
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    this.post.enabled = settings.bloom;
    this.motes.setPixelRatio(this.renderer.getPixelRatio());
    this.resize();
  }

  // ------------------------------------------------------------------
  //  Events
  // ------------------------------------------------------------------

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(document.documentElement);
    }
  }

  private onResize = (): void => {
    this.resize();
  };

  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else if (!this.disposed && this.wasRunning) this.start();
  };

  /** Remembers intent across a tab switch, so a paused prologue stays paused. */
  private wasRunning = false;

  resize(): void {
    const { width, height } = this.canvasSize();
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / Math.max(height, 1));
    this.rig.setPath(window.innerWidth < 820);

    const dpr = this.renderer.getPixelRatio();
    this.post.setSize(Math.floor(width * dpr), Math.floor(height * dpr));
    if (!this.running) this.renderStill();
  }

  // ------------------------------------------------------------------
  //  Narrative surface — the only things the director may change
  // ------------------------------------------------------------------

  /** Prologue progress, 0..1. */
  setProgress(p: number): void {
    this.progress = Math.min(Math.max(p, 0), 1);
    this.rig.setProgress(this.progress);

    // Retained consequence tracks the descent and never falls; the model
    // enforces the monotonicity.
    if (this.entity.hasTrace) {
      this.entity.setRetained(smoothstep01((this.progress - 0.24) / 0.62));
    }

    if (this.reducedMotion) {
      this.rig.applyReducedState(this.progress);
      this.open = smoothstep01((this.progress - 0.22) / 0.14);
      this.renderStill();
    }
  }

  setState(state: PrologueState): void {
    if (state === this.state) return;
    this.state = state;
    this.field.setPreset(
      state === 'full' ? 'base' : state === 'latent' ? 'settled' : 'active'
    );
  }

  get prologueState(): PrologueState {
    return this.state;
  }

  setFieldPreset(name: PresetName): void {
    this.field.setPreset(name);
  }

  /**
   * The one causal demonstration.
   *
   * Places a single disturbance on or near the inner spine, both in the
   * chemistry and as the legible trace the fragment stage draws. Called
   * once per visit — either by the visitor or automatically — and then
   * never touched again.
   */
  disturb(clientX?: number, clientY?: number): boolean {
    if (this.entity.hasTrace) return false;

    let u = TRACE_DEFAULT[0];
    let v = TRACE_DEFAULT[1];

    if (clientX !== undefined && clientY !== undefined) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerNdc.set(
        ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -(((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
      );
      this.raycaster.setFromCamera(this.pointerNdc, this.rig.camera);
      if (this.raycaster.ray.intersectPlane(this.tracePlane, this.hitPoint)) {
        const [pu, pv] = this.entity.fieldUvFromWorld(this.hitPoint.x, this.hitPoint.y);
        u = Math.min(Math.max(pu, TRACE_U[0]), TRACE_U[1]);
        v = Math.min(Math.max(pv, TRACE_V[0]), TRACE_V[1]);
        if (u > APERTURE_U[0] && u < APERTURE_U[1]) {
          u = u < 0.5 ? APERTURE_U[0] - 0.02 : APERTURE_U[1] + 0.02;
        }
      }
    }

    this.field.splat(u, v, 0.05, 0.95);
    this.entity.setTrace(u, v, 1);
    if (!this.running) this.renderStill();
    return true;
  }

  get hasDisturbance(): boolean {
    return this.entity.hasTrace;
  }

  /**
   * Grows the reaction field to a developed state before the first frame
   * is presented. Time-boxed rather than a fixed step count: a software
   * renderer would take tens of seconds for the same work.
   */
  async warmUpField(
    targetSteps: number,
    budgetMs: number,
    onProgress?: (fraction: number) => void
  ): Promise<void> {
    const chunk = 60;
    const started = performance.now();
    let done = 0;

    while (done < targetSteps) {
      this.field.warmUp(Math.min(chunk, targetSteps - done));
      done += chunk;

      const elapsed = performance.now() - started;
      onProgress?.(Math.min(Math.max(done / targetSteps, elapsed / budgetMs), 1));
      if (elapsed > budgetMs) break;

      // Hand the frame back so the page stays responsive — but never
      // wait on rAF alone. A tab that is not compositing (backgrounded,
      // or an undisplayed embedded view) never fires it, and boot would
      // hang behind the poster indefinitely.
      await new Promise((resolve) => {
        const done = () => {
          window.clearTimeout(timer);
          resolve(null);
        };
        const timer = window.setTimeout(done, 120);
        requestAnimationFrame(done);
      });
    }

    onProgress?.(1);
    this.entity.bindField(this.field.texture);
  }

  async loadEntity(url: string, onProgress?: (fraction: number) => void): Promise<void> {
    await this.entity.load(url, onProgress);
    this.entity.bindField(this.field.texture);
  }

  /** Drives the reveal out of near-darkness. */
  setWake(target: number): void {
    this.wakeTarget = Math.min(Math.max(target, 0), 1);
  }

  // ------------------------------------------------------------------
  //  Loop
  // ------------------------------------------------------------------

  start(): void {
    this.wasRunning = true;
    if (this.running || this.disposed || document.hidden) return;
    this.running = true;
    this.clock.getDelta();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  /** Fully stops the loop. Nothing is consumed behind the editorial page. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  /** Called by the director when the prologue leaves the viewport. */
  suspend(): void {
    this.wasRunning = false;
    this.stop();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Renders exactly one frame — the reduced-motion and poster path. */
  renderStill(): void {
    const time = this.clock.getElapsedTime();
    this.wake = 1;
    this.field.update(this.quality.settings.simStepsPerFrame, 1 / 60);
    this.entity.bindField(this.field.texture);
    this.entity.update(time);
    this.motes.update(time, 1);
    this.lighting.setWake(1);
    this.lighting.update(this.progress, time, 1 / 60);
    this.entity.setProgress(
      this.progress,
      this.reducedMotion ? this.open : smoothstep01((this.progress - 0.22) / 0.14),
      this.rig.camera.position.z
    );
    this.entity.setLighting(this.lighting.entityState);
    if (!this.reducedMotion) this.rig.applyPoster();
    this.post.setState(
      this.lighting.post.exposure,
      this.lighting.post.bloom,
      this.lighting.post.vignette,
      time
    );
    this.post.render(this.scene, this.rig.camera);
  }

  private tick = (): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.tick);

    const rawDelta = this.clock.getDelta();
    // Clamp so a tab return cannot fire a huge simulation step.
    const dt = Math.min(rawDelta, 1 / 20);
    const time = this.clock.getElapsedTime();

    this.quality.sample(rawDelta * 1000, performance.now());

    this.wake += (this.wakeTarget - this.wake) * (1 - Math.pow(0.05, dt));
    this.lighting.setWake(this.wake);

    // The masses yield once, early, and the opening remains.
    const target = smoothstep01((this.progress - 0.22) / 0.14);
    this.open += (target - this.open) * (1 - Math.pow(0.0012, dt));

    this.entity.setProgress(this.progress, this.open, this.rig.camera.position.z);

    this.field.update(this.quality.settings.simStepsPerFrame, dt);
    this.entity.bindField(this.field.texture);
    this.entity.update(time);
    this.motes.update(time, this.wake);

    this.rig.update(time, dt);
    this.lighting.update(this.progress, time, dt);
    this.entity.setLighting(this.lighting.entityState);

    this.post.setState(
      this.lighting.post.exposure,
      this.lighting.post.bloom,
      this.lighting.post.vignette,
      time
    );
    this.post.render(this.scene, this.rig.camera);
  };

  dispose(): void {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver?.disconnect();
    this.field.dispose();
    this.motes.dispose();
    this.entity.dispose();
    this.post.dispose();
    this.renderer.dispose();
  }
}
