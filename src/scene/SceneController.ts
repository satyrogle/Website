import * as THREE from 'three';

import { QualityManager, type QualitySettings } from './QualityManager';
import { ReactionField, type PresetName } from './ReactionField';
import { CrownedConvergenceModel } from './CrownedConvergenceModel';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { PostPipeline } from './PostPipeline';

/**
 * SceneController
 *
 * Owns the renderer, the single persistent scene and the frame loop, and
 * exposes the small surface the scroll director is allowed to touch.
 *
 * Everything the narrative can change is a parameter of one continuous
 * system — field rates, layer offsets, layer focus, camera progress. No
 * caller can swap scenes, reseed the field or rebuild the object, which
 * is what keeps the site a single continuous world by construction.
 */

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

export class SceneController {
  readonly quality: QualityManager;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly entity: CrownedConvergenceModel;
  readonly field: ReactionField;
  readonly lighting: Lighting;

  private renderer: THREE.WebGLRenderer;
  private post: PostPipeline;
  private clock = new THREE.Clock();
  private frameHandle = 0;
  private running = false;
  private reducedMotion: boolean;

  private raycaster = new THREE.Raycaster();
  private fieldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private hitPoint = new THREE.Vector3();
  private pointerNdc = new THREE.Vector2();
  private pointerActive = false;
  private lastPointerMove = 0;

  private progress = 0;
  private wake = 0;
  private wakeTarget = 0;

  /** Corridor tear-open, tracks narrative progress. */
  private rip = 0;

  /** Layer separation, 0 = assembled, 1 = fully exposed. */
  private separation = 0;
  private separationTarget = 0;
  private focusTargets: [number, number, number] = [1, 1, 1];

  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  constructor(options: SceneOptions) {
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
    this.renderer.setClearColor(new THREE.Color('#080b10'), 1);
    this.renderer.setPixelRatio(this.quality.pixelRatio());

    const { clientWidth, clientHeight } = this.canvasSize();
    this.renderer.setSize(clientWidth, clientHeight, false);

    const settings = this.quality.settings;
    const mobile = window.innerWidth < 820;

    this.field = new ReactionField(this.renderer, settings.simResolution);
    this.field.seed();

    // The entity is the Blender-authored Crowned Convergence, loaded
    // from a GLB. It is empty until loadEntity() resolves; the scene,
    // the rig and the field are all live before then so the loader can
    // report real progress against real work.
    this.entity = new CrownedConvergenceModel({ reducedMotion: this.reducedMotion });
    this.scene.add(this.entity.group);

    this.rig = new CameraRig(clientWidth / Math.max(clientHeight, 1), mobile);
    this.lighting = new Lighting();

    const dpr = this.renderer.getPixelRatio();
    this.post = new PostPipeline(
      this.renderer,
      Math.floor(clientWidth * dpr),
      Math.floor(clientHeight * dpr),
      settings.tier === 'high' ? 4 : settings.tier === 'medium' ? 2 : 0
    );
    this.post.enabled = settings.bloom;

    if (this.reducedMotion) {
      // A composed still: no drift, no parallax, no travel.
      this.rig.setMotionScale(0, 0);
      this.rig.applyPoster();
    }

    this.quality.onChange((s) => this.applyQuality(s));
    this.bindEvents();
  }

  private canvasSize(): { clientWidth: number; clientHeight: number } {
    return {
      clientWidth: Math.max(1, window.innerWidth),
      clientHeight: Math.max(1, window.innerHeight),
    };
  }

  private applyQuality(settings: QualitySettings): void {
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    this.post.enabled = settings.bloom;
    this.field.resize(settings.simResolution);
    this.entity.bindField(this.field.texture);
    this.resize();
  }

  // ------------------------------------------------------------------
  //  Events
  // ------------------------------------------------------------------

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    if (!this.reducedMotion) {
      // Pointer: desktop only. Touch is read passively and never
      // preventDefault-ed, so it can never interfere with scrolling.
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
      window.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(document.documentElement);
    }
  }

  private onResize = (): void => {
    this.resize();
  };

  private onVisibility = (): void => {
    // Acceptance 26: fully stop the loop when the document is hidden.
    if (document.hidden) {
      this.stop();
    } else if (!this.disposed) {
      this.start();
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    this.pointerActive = true;
    this.lastPointerMove = performance.now();
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -((event.clientY / window.innerHeight) * 2 - 1);
    this.pointerNdc.set(x, y);
    this.rig.setPointer(x, y);

    if (event.pointerType === 'touch') return;
    this.disturbAtPointer(0.32);
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -((event.clientY / window.innerHeight) * 2 - 1);
    this.pointerNdc.set(x, y);
    this.disturbAtPointer(0.85, true);
  };

  private onPointerLeave = (): void => {
    this.pointerActive = false;
    this.rig.setPointer(0, 0);
  };

  /**
   * Projects the pointer onto the field plane so a disturbance lands
   * exactly under the cursor on the object, not at an arbitrary screen
   * coordinate.
   */
  private disturbAtPointer(strength: number, discrete = false): void {
    this.raycaster.setFromCamera(this.pointerNdc, this.rig.camera);
    if (!this.raycaster.ray.intersectPlane(this.fieldPlane, this.hitPoint)) return;
    const [u, v] = this.entity.fieldUvFromWorld(this.hitPoint.x, this.hitPoint.y);
    if (u < -0.1 || u > 1.1 || v < -0.1 || v > 1.1) return;
    if (discrete) {
      this.field.splat(u, v, 0.045, strength);
    } else {
      this.field.setPointer(u, v, strength);
    }
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.canvasSize();
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.rig.resize(clientWidth / Math.max(clientHeight, 1));
    this.rig.setPath(window.innerWidth < 820);

    const dpr = this.renderer.getPixelRatio();
    this.post.setSize(Math.floor(clientWidth * dpr), Math.floor(clientHeight * dpr));
  }

  // ------------------------------------------------------------------
  //  Narrative surface — the only things the director may change
  // ------------------------------------------------------------------

  /** Global scroll progress, 0..1. */
  setProgress(p: number): void {
    this.progress = Math.min(Math.max(p, 0), 1);
    this.rig.setProgress(this.progress);
  }

  setFieldPreset(name: PresetName): void {
    this.field.setPreset(name);
  }

  blendFieldPresets(a: PresetName, b: PresetName, t: number): void {
    this.field.blendPresets(a, b, t);
  }

  /** 0 = layers assembled, 1 = fully separated. */
  setLayerSeparation(amount: number): void {
    this.separationTarget = Math.min(Math.max(amount, 0), 1);
  }

  /** index -1 focuses all layers equally. */
  focusLayer(index: number): void {
    this.focusTargets = index < 0 ? [1, 1, 1] : [0.28, 0.28, 0.28];
    if (index >= 0 && index < 3) this.focusTargets[index] = 1;
  }

  /** Disturbance at normalised field coordinates, for scripted moments. */
  splat(u: number, v: number, radius?: number, strength?: number): void {
    this.field.splat(u, v, radius, strength);
  }

  /**
   * Grows the reaction field to a developed state before the first frame
   * is presented, yielding between chunks so the loader can report it.
   *
   * Time-boxed rather than a fixed step count. A discrete GPU reaches the
   * target in a couple of hundred milliseconds; a software renderer would
   * take tens of seconds for the same work, and the brief is explicit
   * that the loader lasts no longer than necessary. Slow devices get a
   * less developed field and a page that still loads promptly, which is
   * the right trade — the simulation keeps growing once the loop starts.
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

      // Hand the frame back so the loader bar actually paints.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    onProgress?.(1);
    this.entity.bindField(this.field.texture);
  }

  /**
   * Loads the Blender-authored entity. Separate from the constructor so
   * the loader can report real network progress against real work, and
   * so a failed fetch degrades to the poster instead of throwing during
   * scene construction.
   */
  async loadEntity(url: string, onProgress?: (fraction: number) => void): Promise<void> {
    await this.entity.load(url, onProgress);
    this.entity.bindField(this.field.texture);
  }

  /** Drives the cold-open reveal out of near-darkness. */
  setWake(target: number): void {
    this.wakeTarget = Math.min(Math.max(target, 0), 1);
  }

  // ------------------------------------------------------------------
  //  Loop
  // ------------------------------------------------------------------

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.getDelta();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  /** Renders exactly one frame — used for the reduced-motion still. */
  renderStill(): void {
    const time = this.clock.getElapsedTime();
    this.wake = 1;
    this.field.update(this.quality.settings.simStepsPerFrame, 1 / 60);
    this.entity.bindField(this.field.texture);
    this.entity.update(time);
    this.lighting.setWake(1);
    this.lighting.update(this.progress, time, 1 / 60);
    this.entity.setProgress(this.progress, smoothstep01((this.progress - 0.10) / 0.16));
    this.entity.setLighting(this.lighting.entityState);
    this.rig.applyPoster();
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
    // Clamp so a tab return or a long paint cannot fire a huge
    // simulation step and blow the field out.
    const dt = Math.min(rawDelta, 1 / 20);
    const time = this.clock.getElapsedTime();

    this.quality.sample(rawDelta * 1000, performance.now());

    // Cold-open reveal.
    this.wake += (this.wakeTarget - this.wake) * (1 - Math.pow(0.05, dt));
    this.lighting.setWake(this.wake);

    // Tunnel-group separation, eased so a scrub feels physical. This is
    // the foundation movement's three layers; it separates groups WITHIN
    // the corridor rather than exploding the entity.
    this.separation += (this.separationTarget - this.separation) * (1 - Math.pow(0.004, dt));

    // The crown yields once, early, and stays open. Pressure release,
    // not a mechanism: the authored per-mass vectors are already
    // clamped to 0.04-0.14 m and 5 degrees in the asset.
    const yieldTarget = smoothstep01((this.progress - 0.10) / 0.16);
    this.rip += (yieldTarget - this.rip) * (1 - Math.pow(0.0009, dt));

    this.entity.setProgress(this.progress, this.rip);
    this.entity.setSeparation(this.separation, this.focusTargets);

    // Idle pointer decay: if the pointer has been still for a while,
    // stop feeding the field so it can settle.
    if (this.pointerActive && performance.now() - this.lastPointerMove > 900) {
      this.pointerActive = false;
      this.field.setPointer(0, 0, 0);
    }

    this.field.update(this.quality.settings.simStepsPerFrame, dt);
    this.entity.bindField(this.field.texture);
    this.entity.update(time);

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
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerleave', this.onPointerLeave);
    this.resizeObserver?.disconnect();
    this.field.dispose();
    this.entity.dispose();
    this.post.dispose();
    this.renderer.dispose();
  }
}
