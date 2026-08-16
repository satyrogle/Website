/**
 * The hero, in the real site.
 *
 * The validated containment entity — the one that passed the four-frame gate
 * on 2026-08-15 (`1530d7f`) — lifted out of `prototype.ts` and given the seam
 * `main.ts` and `ScrollDirector` already speak. Nothing about the entity is
 * reinterpreted here: same GLB, same graph, same fission, same correction,
 * same presentation constants. If a number in this file disagrees with the
 * prototype, this file is wrong.
 *
 * **The cinematic portion is SHORT.** `Descent` still authors six poses and is
 * frozen, but the site travels only OBSERVE → APPROACH → CROSS: the first two
 * fifths of the rail. The visitor scrolls toward the entity, gets one real
 * scale transition, crosses through it, and then the page goes black and
 * becomes editorial. The full descent is not resurrected, and nothing is
 * waiting at the bottom of it.
 *
 * The one sinister beat lives here and nowhere else: hover wakes a region,
 * a cascade propagates, the system takes it back in reverse causal order and
 * leaves a scar. Everything after CROSS communicates in plain English.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadSheets, type EntityManifest } from './containment/Sheets';
import { synthesiseContainment, DEFAULT_CONTAINMENT } from './containment/ContainmentSynth';
import { ContainmentField } from './containment/ContainmentField';
import { Fission, DEFAULT_FISSION } from './containment/Fission';
import { Halation } from './containment/Halation';
import { SheetMass } from './containment/SheetMass';
import { SheetRidges } from './containment/SheetRidges';
import { sampleDescent } from './containment/Descent';

export interface HeroOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
}

/**
 * How much of the authored rail the site actually travels.
 *
 * `Descent` holds six poses and `sampleDescent` spreads them over 0..1, so
 * OBSERVE, APPROACH and CROSS are the first two of five intervals. Truncating
 * here rather than editing the pose list keeps the camera frozen exactly as
 * gated — the later poses still exist, and the site simply never goes there.
 */
const RAIL_END = 2 / 5;

/** How far around the ray hit the visitor's presence is felt. Frozen. */
const TOUCH_RADIUS = 0.75;

/** Nodes bucketed by position, so a region query is a lookup rather than a scan. */
const CELL = 0.55;

export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

interface Contact {
  region: number[];
  lead: number;
  point: [number, number, number];
}

export class ContainmentHero {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  /** Set when a control is pressed while the simulation is deliberately still. */
  onRefusal: ((reason: 'reduced-motion') => void) | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly halation: Halation;
  private readonly reduced: boolean;

  private field!: ContainmentField;
  private fission!: Fission;
  private mass!: SheetMass;
  private ridges!: SheetRidges;
  private structure!: ReturnType<typeof synthesiseContainment>;
  private buckets = new Map<number, number[]>();

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pointer: { x: number; y: number } | null = null;

  private running = false;
  private machine = true;
  private wake = 0;
  private frameHandle = 0;
  private last = 0;
  private carried = 0;

  /** Narrative progress, 0 at OBSERVE and 1 at CROSS, and the eased follow. */
  private progress = 0;
  private eased = 0;

  /** Event index. An integer, so a run is reproducible from it. */
  private event = 0;
  /** Enforcement events completed this visit. */
  private applied = 0;

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.pointer = { x: e.clientX, y: e.clientY };
  };
  private readonly onPointerLeave = (): void => {
    this.pointer = null;
  };
  private readonly onResize = (): void => this.resize();

  constructor(options: HeroOptions) {
    this.canvas = options.canvas;
    this.reduced = options.reducedMotion;

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.halation = new Halation(window.innerWidth, window.innerHeight);
  }

  /**
   * The real initialisation: the authored body, the graph synthesised from the
   * same control data, and one warm frame. Reported in stages because the
   * loader is measuring work rather than decorating a timer.
   */
  async warmUp(onProgress: (fraction: number, stage: string) => void): Promise<void> {
    const base = `${import.meta.env.BASE_URL}models/`;
    onProgress(0.05, 'synth');

    const manifest = (await fetch(`${base}entity.json`).then((r) => {
      if (!r.ok) throw new Error(`entity.json: ${r.status}`);
      return r.json();
    })) as EntityManifest;
    loadSheets(manifest);
    onProgress(0.25, 'synth');

    const gltf = await new GLTFLoader().loadAsync(`${base}entity.glb`);
    let geometry: THREE.BufferGeometry | null = null;
    gltf.scene.traverse((child) => {
      if (!geometry && (child as THREE.Mesh).isMesh) geometry = (child as THREE.Mesh).geometry;
    });
    if (!geometry) throw new Error('containment: entity.glb has no mesh');
    onProgress(0.45, 'synth');

    // The veins are placed from the same control data that produced the mesh,
    // so the two cannot drift.
    this.structure = synthesiseContainment(DEFAULT_CONTAINMENT);
    onProgress(0.8, 'warmup');

    this.field = new ContainmentField(this.structure);
    this.fission = new Fission(this.structure, DEFAULT_FISSION);
    // Level 1 first: the silhouette occludes and everything else depth-tests
    // against it.
    this.mass = new SheetMass(geometry);
    this.ridges = new SheetRidges(this.structure);
    this.scene.add(this.mass.object, this.ridges.object, this.field.object);

    const p = this.structure.graph.positions;
    for (let i = 0; i < this.structure.graph.nodeCount; i++) {
      const k = this.key(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      const b = this.buckets.get(k);
      if (b) b.push(i);
      else this.buckets.set(k, [i]);
    }

    this.resize();
    this.applyCamera(0);
    onProgress(1, 'record');
  }

  private key(x: number, y: number, z: number): number {
    return (
      ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 +
      (Math.floor(z / CELL) + 512)
    );
  }

  /**
   * What the visitor is pointing at.
   *
   * A real ray against the body, not a search among the graph: the sheets
   * occlude, so it lands on the lobe being looked at, and everything within a
   * short radius of the hit is the region. Frozen behaviour, ported whole.
   */
  private contactUnder(clientX: number, clientY: number): Contact | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.mass.object, false);
    if (!hits.length) return null;

    const { x, y, z } = hits[0].point;
    const p = this.structure.graph.positions;
    const r2 = TOUCH_RADIUS * TOUCH_RADIUS;
    const region: number[] = [];
    let lead = -1;
    let bestD = Infinity;

    const reach = Math.ceil(TOUCH_RADIUS / CELL);
    const bx = Math.floor(x / CELL);
    const by = Math.floor(y / CELL);
    const bz = Math.floor(z / CELL);
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        for (let k = -reach; k <= reach; k++) {
          const b = this.buckets.get(
            ((bx + i + 512) * 1024 + (by + j + 512)) * 1024 + (bz + k + 512)
          );
          if (!b) continue;
          for (const n of b) {
            const d =
              (p[n * 3] - x) ** 2 + (p[n * 3 + 1] - y) ** 2 + (p[n * 3 + 2] - z) ** 2;
            if (d > r2) continue;
            region.push(n);
            // A cascade has to start somewhere it can branch.
            const degree =
              this.structure.graph.offsets[n + 1] - this.structure.graph.offsets[n];
            if (d < bestD && degree >= 3) {
              bestD = d;
              lead = n;
            }
          }
        }
      }
    }

    if (lead < 0) return null;
    return { region, lead, point: [x, y, z] };
  }

  private disturb(node: number): boolean {
    if (!this.fission.ignite(node, 0x9e37 + this.event * 2654435761)) return false;
    this.event++;
    return true;
  }

  /** A press, for anyone not using a pointer. Aimed at the middle of the body. */
  pressCentre(): number {
    if (this.reduced || !this.machine) {
      this.onRefusal?.('reduced-motion');
      return -1;
    }
    const hit = this.contactUnder(window.innerWidth * 0.62, window.innerHeight * 0.5);
    if (!hit) return -1;
    return this.disturb(hit.lead) ? hit.lead : -1;
  }

  /** Enforcement events completed. This is what `ADJUSTMENTS APPLIED` counts. */
  get visitAdjustments(): number {
    return this.applied;
  }

  private applyCamera(t: number): void {
    // Truncated at CROSS. The later poses are authored and frozen; the site
    // simply never travels to them.
    const state = sampleDescent(Math.min(Math.max(t, 0), 1) * RAIL_END);
    this.camera.position.set(state.position[0], state.position[1], state.position[2]);
    this.camera.lookAt(state.target[0], state.target[1], state.target[2]);
    if (this.camera.fov !== state.fov) {
      this.camera.fov = state.fov;
      this.camera.updateProjectionMatrix();
    }
    this.field.setRecession(state.near, state.far);
  }

  /** Narrative progress from the scroll director, 0 at OBSERVE, 1 at CROSS. */
  setProgress(p: number): void {
    this.progress = Math.min(Math.max(p, 0), 1);
    if (this.reduced) {
      this.eased = this.progress;
      this.applyCamera(this.eased);
    }
  }

  /** How present the hero is. Driven down as the editorial takes over. */
  setWake(target: number): void {
    this.wake = Math.min(Math.max(target, 0), 1);
  }

  /**
   * Whether the machine is live.
   *
   * Off in the editorial: past CROSS the entity is behind black and nothing
   * about it should still be simulating, least of all answering a pointer that
   * is now reading company copy.
   */
  setMachine(running: boolean): void {
    this.machine = running;
    if (!running) this.fission.release();
  }

  /** The visitor moved. Kept for the seam; presence is read per frame. */
  visitorMoved(): void {
    /* no-op: hover is sampled from the pointer each frame */
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const ratio = this.renderer.getPixelRatio();
    this.halation.resize(w * ratio, h * ratio);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onResize);
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const delta = Math.min(now - this.last, 250);
    this.last = now;

    if (this.machine && !this.reduced) {
      // Fixed step, decoupled from the frame: 700ms of growth has to be 700ms
      // on a 60 Hz laptop and on a 165 Hz monitor.
      const step = DEFAULT_FISSION.dt * 1000;
      this.carried += delta;
      while (this.carried >= step) {
        this.fission.step();
        this.carried -= step;
      }

      // Presence is the input. Being near the body disturbs it, and once the
      // disturbance passes what the system can ignore, it answers.
      const seconds = delta / 1000;
      const under = this.pointer ? this.contactUnder(this.pointer.x, this.pointer.y) : null;
      if (under === null) this.fission.release();
      else this.fission.hover(under.region, under.lead, under.point, seconds);
      this.fission.relax(seconds);

      const provoked = this.fission.provoked;
      if (provoked >= 0 && under && this.disturb(provoked)) {
        this.fission.presenceAnswered(under.point);
      }
      this.applied = this.fission.adjustments;

      // Eased toward the scroll position, frame-rate independent: the
      // coefficient is a half-life in milliseconds, not a per-frame fraction.
      const follow = 1 - Math.pow(0.5, delta / 90);
      this.eased += (this.progress - this.eased) * follow;
      if (Math.abs(this.progress - this.eased) < 0.0002) this.eased = this.progress;
      this.applyCamera(this.eased);
    }

    this.draw();
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    this.field.setEnergy(this.fission.energy, this.fission.presence);
    this.ridges.setEnergy(this.fission.energy, this.fission.presence);

    const exposure = this.wake;
    this.field.setExposure(exposure);
    this.ridges.setExposure(exposure);
    this.mass.setExposure(exposure);

    this.halation.render(this.renderer, this.scene, this.camera, {
      setEmissiveOnly: (on: boolean) => {
        this.field.setEmissiveOnly(on);
        this.ridges.setEmissiveOnly(on);
        this.mass.setEmissiveOnly(on);
      },
    });
  }

  /** One frame, without starting the loop. Used behind the loader. */
  renderStill(): void {
    this.applyCamera(this.eased);
    this.draw();
  }

  dispose(): void {
    this.stop();
    this.field.dispose();
    this.ridges.dispose();
    this.mass.dispose();
    this.halation.dispose();
    this.renderer.dispose();
  }
}
