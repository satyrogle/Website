import * as THREE from 'three';
import { mulberry32, gaussian } from '../core/rng';
import {
  FSQ_VERT,
  COPY_FRAG,
  AGENT_UPDATE_FRAG,
  DEPOSIT_VERT,
  DEPOSIT_FRAG,
  DIFFUSE_FRAG,
  STAMP_VERT,
  STAMP_FRAG,
  HEALTH_FRAG
} from './shaders';

/**
 * The one authoritative world.
 *
 * A transport network: agents sense, turn toward strength, move, and
 * deposit. Beacons are the regions the network serves. The law the
 * front page does not mention: a region that stops earning traffic is
 * starved, and a starved region is removed. Visitor marks are beacons
 * too, held to exactly the same law.
 *
 * Seeded, fixed-step, replayable in the tested environment. There is no
 * Math.random in here and no second simulation anywhere.
 */

export interface WorldEvent {
  kind: 'seed' | 'placed' | 'removed';
  tick: number;
  text: string;
}

interface Beacon {
  label: string;
  x: number;
  y: number;
  strength: number;
  alive: boolean;
  born: number;
  origin: 'seed' | 'visitor';
}

export interface KernelOptions {
  seed: number;
  agentDim: number;
  onEvent: (e: WorldEvent) => void;
}

const WORLD_SIZE = 1024;
const HEALTH_SIZE = 64;
const MAX_BEACONS = 16;
const STARVE_INTERVAL = 600; // ticks between audits (10 s at 60 Hz)
const STARVE_GRACE = 1800; // ticks a region is safe after birth
const MIN_ALIVE = 3;
const MAX_VISITOR = 8;
const MARK_COOLDOWN = 30;

export class SimulationKernel {
  tick = 0;
  readonly agentCount: number;
  readonly refGeometry: THREE.BufferGeometry;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly onEvent: (e: WorldEvent) => void;
  private readonly camera = new THREE.Camera();

  private agentRead: THREE.WebGLRenderTarget;
  private agentWrite: THREE.WebGLRenderTarget;
  private trailRead: THREE.WebGLRenderTarget;
  private trailWrite: THREE.WebGLRenderTarget;
  private readonly healthTarget: THREE.WebGLRenderTarget;
  private readonly healthBuffer = new Float32Array(HEALTH_SIZE * HEALTH_SIZE * 4);

  private readonly copyScene: THREE.Scene;
  private readonly copyMat: THREE.RawShaderMaterial;
  private readonly agentScene: THREE.Scene;
  private readonly agentMat: THREE.RawShaderMaterial;
  private readonly depositScene: THREE.Scene;
  private readonly depositMat: THREE.RawShaderMaterial;
  private readonly diffuseScene: THREE.Scene;
  private readonly diffuseMat: THREE.RawShaderMaterial;
  private readonly stampScene: THREE.Scene;
  private readonly stampMat: THREE.RawShaderMaterial;
  private readonly healthScene: THREE.Scene;
  private readonly healthMat: THREE.RawShaderMaterial;

  private readonly beacons: Beacon[] = [];
  private readonly beaconUniform = new Float32Array(MAX_BEACONS * 4);
  private markCount = 0;
  private lastMarkTick = -MARK_COOLDOWN;
  private readonly markRng: () => number;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, opts: KernelOptions) {
    this.renderer = renderer;
    this.onEvent = opts.onEvent;
    this.agentCount = opts.agentDim * opts.agentDim;
    this.markRng = mulberry32(opts.seed ^ 0x5f356495);

    const rng = mulberry32(opts.seed);

    // --- the served regions: a loose funnel, one converging axis ---
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const halfw = 0.3 * (1.0 - 0.72 * t);
      this.beacons.push({
        label: 'REGION 0' + String(i + 1),
        x: 0.5 + (rng() * 2 - 1) * halfw,
        y: 0.18 + 0.62 * t,
        strength: 1.0 + rng() * 0.5,
        alive: true,
        born: 0,
        origin: 'seed'
      });
    }

    // --- GPU state ---
    const agentTargetOpts: THREE.RenderTargetOptions = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false
    };
    this.agentRead = new THREE.WebGLRenderTarget(opts.agentDim, opts.agentDim, agentTargetOpts);
    this.agentWrite = new THREE.WebGLRenderTarget(opts.agentDim, opts.agentDim, agentTargetOpts);

    const trailTargetOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true
    };
    this.trailRead = new THREE.WebGLRenderTarget(WORLD_SIZE, WORLD_SIZE, trailTargetOpts);
    this.trailWrite = new THREE.WebGLRenderTarget(WORLD_SIZE, WORLD_SIZE, trailTargetOpts);
    this.trailRead.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.trailRead.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.trailWrite.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.trailWrite.texture.wrapT = THREE.ClampToEdgeWrapping;

    this.healthTarget = new THREE.WebGLRenderTarget(HEALTH_SIZE, HEALTH_SIZE, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false
    });

    // --- passes ---
    const fsq = fullscreenGeometry();

    this.copyMat = rawMat(FSQ_VERT, COPY_FRAG, { uSrc: { value: null } });
    this.copyScene = passScene(new THREE.Mesh(fsq, this.copyMat));

    this.agentMat = rawMat(FSQ_VERT, AGENT_UPDATE_FRAG, {
      uAgents: { value: null },
      uTrail: { value: null },
      uBeacons: { value: this.beaconUniform },
      uBeaconCount: { value: 0 },
      uTick: { value: 0 },
      uSeed: { value: opts.seed | 0 },
      uSensorDist: { value: 0.02 },
      uSensorAngle: { value: 0.5 },
      uTurnRate: { value: 0.36 },
      uSpeed: { value: 0.0013 }
    });
    this.agentScene = passScene(new THREE.Mesh(fsq, this.agentMat));

    // agent reference uvs, one vertex per agent
    const refs = new Float32Array(this.agentCount * 2);
    for (let y = 0; y < opts.agentDim; y++) {
      for (let x = 0; x < opts.agentDim; x++) {
        const i = (y * opts.agentDim + x) * 2;
        refs[i] = (x + 0.5) / opts.agentDim;
        refs[i + 1] = (y + 0.5) / opts.agentDim;
      }
    }
    this.refGeometry = new THREE.BufferGeometry();
    this.refGeometry.setAttribute('ref', new THREE.BufferAttribute(refs, 2));
    // three needs a draw count; ref carries it, no position required
    this.refGeometry.setDrawRange(0, this.agentCount);

    this.depositMat = rawMat(DEPOSIT_VERT, DEPOSIT_FRAG, {
      uAgents: { value: null },
      uDeposit: { value: 0.18 }
    });
    additive(this.depositMat);
    const depositPoints = new THREE.Points(this.refGeometry, this.depositMat);
    depositPoints.frustumCulled = false;
    this.depositScene = passScene(depositPoints);

    this.diffuseMat = rawMat(FSQ_VERT, DIFFUSE_FRAG, {
      uTrail: { value: null },
      uDecay: { value: 0.972 }
    });
    this.diffuseScene = passScene(new THREE.Mesh(fsq, this.diffuseMat));

    this.stampMat = rawMat(STAMP_VERT, STAMP_FRAG, {
      uPos: { value: new THREE.Vector2(0.5, 0.5) },
      uSize: { value: 90 },
      uAmount: { value: 2.2 }
    });
    additive(this.stampMat);
    const stampGeom = new THREE.BufferGeometry();
    stampGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    const stampPoint = new THREE.Points(stampGeom, this.stampMat);
    stampPoint.frustumCulled = false;
    this.stampScene = passScene(stampPoint);

    this.healthMat = rawMat(FSQ_VERT, HEALTH_FRAG, { uTrail: { value: null } });
    this.healthScene = passScene(new THREE.Mesh(fsq, this.healthMat));

    this.seedGpuState(opts.agentDim, rng);
  }

  /** Current trail observation (do not render into it). */
  get trailTexture(): THREE.Texture {
    return this.trailRead.texture;
  }

  /** Current agent state (positions/headings). */
  get agentTexture(): THREE.Texture {
    return this.agentRead.texture;
  }

  /**
   * Where the camera is pulled: the latest living visitor mark that the
   * network is actually serving, else the funnel throat. A mark placed
   * in the far wilderness is retained and recorded, but the descent
   * does not pretend there is anything there to see yet.
   */
  focusPoint(): { x: number; y: number } {
    for (let i = this.beacons.length - 1; i >= 0; i--) {
      const b = this.beacons[i];
      if (b && b.origin === 'visitor' && b.alive && this.healthAt(b.x, b.y) > 0.04) {
        return { x: b.x, y: b.y };
      }
    }
    return { x: 0.5, y: 0.74 };
  }

  /** One fixed step. input -> authoritative state -> visible consequence -> record. */
  step(): void {
    if (this.disposed) return;
    this.tick++;

    this.fillBeaconUniform();

    // 1. agents advance
    this.agentMat.uniforms.uAgents!.value = this.agentRead.texture;
    this.agentMat.uniforms.uTrail!.value = this.trailRead.texture;
    this.agentMat.uniforms.uTick!.value = this.tick;
    this.renderer.setRenderTarget(this.agentWrite);
    this.renderer.render(this.agentScene, this.camera);
    [this.agentRead, this.agentWrite] = [this.agentWrite, this.agentRead];

    // 2. deposit into the live trail (additive, no clear)
    this.depositMat.uniforms.uAgents!.value = this.agentRead.texture;
    this.renderer.setRenderTarget(this.trailRead);
    this.renderer.render(this.depositScene, this.camera);

    // 3. diffuse and decay
    this.diffuseMat.uniforms.uTrail!.value = this.trailRead.texture;
    this.renderer.setRenderTarget(this.trailWrite);
    this.renderer.render(this.diffuseScene, this.camera);
    [this.trailRead, this.trailWrite] = [this.trailWrite, this.trailRead];

    this.renderer.setRenderTarget(null);

    // 4. the audit. Health is read back on a fixed cadence so focus
    // decisions use live data; removals only begin after the grace.
    if (this.tick % STARVE_INTERVAL === 0) {
      this.readHealth();
      if (this.tick > STARVE_GRACE) this.audit();
    }
  }

  /**
   * A visitor press. The world takes the mark, stamps the consequence
   * into the trail immediately, and writes the record.
   */
  placeMark(x: number, y: number): boolean {
    if (this.disposed) return false;
    if (this.tick - this.lastMarkTick < MARK_COOLDOWN) return false;
    const px = Math.min(0.97, Math.max(0.03, x));
    const py = Math.min(0.97, Math.max(0.03, y));
    this.lastMarkTick = this.tick;
    this.markCount++;

    const visitors = this.beacons.filter((b) => b.origin === 'visitor' && b.alive);
    if (visitors.length >= MAX_VISITOR) {
      const oldest = visitors[0];
      if (oldest) {
        oldest.alive = false;
        this.onEvent({
          kind: 'removed',
          tick: this.tick,
          text: oldest.label + ' DISPLACED BY A NEWER MARK · REMOVED'
        });
      }
    }
    // hard cap on total slots: recycle the oldest dead entry if full
    if (this.beacons.length >= MAX_BEACONS) {
      const deadIndex = this.beacons.findIndex((b) => !b.alive);
      if (deadIndex >= 0) this.beacons.splice(deadIndex, 1);
      else this.beacons.shift();
    }

    const label = 'MARK ' + String(this.markCount).padStart(2, '0');
    this.beacons.push({
      label,
      x: px,
      y: py,
      strength: 1.9,
      alive: true,
      born: this.tick,
      origin: 'visitor'
    });

    // instant visible consequence
    this.stampMat.uniforms.uPos!.value.set(px, py);
    this.renderer.setRenderTarget(this.trailRead);
    this.renderer.render(this.stampScene, this.camera);
    this.renderer.setRenderTarget(null);

    this.onEvent({
      kind: 'placed',
      tick: this.tick,
      text:
        label +
        ' PLACED AT ' +
        Math.round(px * 100) +
        ',' +
        Math.round(py * 100) +
        ' · RETAINED'
    });
    return true;
  }

  /** Keyboard path: a deterministic position from the seeded stream. */
  placeMarkAuto(): boolean {
    const x = 0.2 + this.markRng() * 0.6;
    const y = 0.2 + this.markRng() * 0.6;
    return this.placeMark(x, y);
  }

  dispose(): void {
    this.disposed = true;
    this.agentRead.dispose();
    this.agentWrite.dispose();
    this.trailRead.dispose();
    this.trailWrite.dispose();
    this.healthTarget.dispose();
    this.refGeometry.dispose();
    for (const m of [
      this.copyMat,
      this.agentMat,
      this.depositMat,
      this.diffuseMat,
      this.stampMat,
      this.healthMat
    ]) {
      m.dispose();
    }
  }

  // ------------------------------------------------------------------

  private seedGpuState(agentDim: number, rng: () => number): void {
    // agents spawn clustered around the served regions
    const data = new Float32Array(agentDim * agentDim * 4);
    const living = this.beacons.filter((b) => b.alive);
    for (let i = 0; i < agentDim * agentDim; i++) {
      const b = living[Math.floor(rng() * living.length)] ?? { x: 0.5, y: 0.5 };
      data[i * 4] = clamp01(b.x + gaussian(rng) * 0.09);
      data[i * 4 + 1] = clamp01(b.y + gaussian(rng) * 0.09);
      data[i * 4 + 2] = rng() * Math.PI * 2;
      data[i * 4 + 3] = 0;
    }
    const seedTex = new THREE.DataTexture(data, agentDim, agentDim, THREE.RGBAFormat, THREE.FloatType);
    seedTex.minFilter = THREE.NearestFilter;
    seedTex.magFilter = THREE.NearestFilter;
    seedTex.needsUpdate = true;

    this.copyMat.uniforms.uSrc!.value = seedTex;
    this.renderer.setRenderTarget(this.agentRead);
    this.renderer.render(this.copyScene, this.camera);

    // trail starts empty
    this.renderer.setClearColor(0x000000, 1);
    for (const rt of [this.trailRead, this.trailWrite, this.agentWrite, this.healthTarget]) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setRenderTarget(null);
    seedTex.dispose();
  }

  private fillBeaconUniform(): void {
    this.beaconUniform.fill(0);
    let n = 0;
    for (const b of this.beacons) {
      if (n >= MAX_BEACONS) break;
      const wobble = 0.92 + 0.08 * Math.sin(this.tick * 0.004 + n * 1.7);
      // w is the gaussian falloff coefficient: visitor marks broadcast
      // further so the network can find them; 0 means removed.
      const falloff = b.origin === 'visitor' ? 260 : 900;
      this.beaconUniform[n * 4] = b.x;
      this.beaconUniform[n * 4 + 1] = b.y;
      this.beaconUniform[n * 4 + 2] = b.strength * wobble;
      this.beaconUniform[n * 4 + 3] = b.alive ? falloff : 0;
      n++;
    }
    this.agentMat.uniforms.uBeaconCount!.value = n;
  }

  /**
   * The starvation law. Health is real trail density read back from the
   * world, not a script. At most one removal per audit.
   */
  private readHealth(): void {
    this.healthMat.uniforms.uTrail!.value = this.trailRead.texture;
    this.renderer.setRenderTarget(this.healthTarget);
    this.renderer.render(this.healthScene, this.camera);
    this.renderer.readRenderTargetPixels(
      this.healthTarget,
      0,
      0,
      HEALTH_SIZE,
      HEALTH_SIZE,
      this.healthBuffer
    );
    this.renderer.setRenderTarget(null);
  }

  private audit(): void {
    const candidates = this.beacons.filter(
      (b) => b.alive && this.tick - b.born > STARVE_GRACE
    );
    const aliveCount = this.beacons.filter((b) => b.alive).length;
    if (aliveCount <= MIN_ALIVE || candidates.length === 0) return;

    const healths = candidates.map((b) => ({ b, h: this.healthAt(b.x, b.y) }));
    healths.sort((a, z) => a.h - z.h);
    const all = healths.map((e) => e.h).sort((a, z) => a - z);
    const median = all[Math.floor(all.length / 2)] ?? 0;
    const weakest = healths[0];
    if (!weakest) return;

    const threshold = Math.max(0.02, median * 0.3);
    if (weakest.h < threshold) {
      weakest.b.alive = false;
      this.onEvent({
        kind: 'removed',
        tick: this.tick,
        text: weakest.b.label + ' STARVED · REMOVED'
      });
    }
  }

  private healthAt(x: number, y: number): number {
    const cx = Math.min(HEALTH_SIZE - 2, Math.max(1, Math.round(x * HEALTH_SIZE)));
    const cy = Math.min(HEALTH_SIZE - 2, Math.max(1, Math.round(y * HEALTH_SIZE)));
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        sum += this.healthBuffer[((cy + dy) * HEALTH_SIZE + (cx + dx)) * 4] ?? 0;
      }
    }
    return sum / 9;
  }
}

// ---------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.min(0.98, Math.max(0.02, v));
}

function fullscreenGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  return g;
}

function rawMat(
  vert: string,
  frag: string,
  uniforms: Record<string, THREE.IUniform>
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    depthTest: false,
    depthWrite: false
  });
}

function additive(mat: THREE.RawShaderMaterial): void {
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneFactor;
  mat.transparent = true;
}

function passScene(child: THREE.Object3D): THREE.Scene {
  const s = new THREE.Scene();
  if (child instanceof THREE.Mesh) child.frustumCulled = false;
  s.add(child);
  return s;
}
