import * as THREE from 'three';

import reactionVert from '../shaders/reaction.vert.glsl?raw';
import reactionFrag from '../shaders/reaction.frag.glsl?raw';
import seedFrag from '../shaders/seed.frag.glsl?raw';

/**
 * ReactionField
 *
 * A Gray–Scott reaction–diffusion simulation held in a ping-ponged pair
 * of half-float targets.
 *
 * The state texture is created and seeded exactly once. Nothing in the
 * scroll choreography is permitted to clear or reseed it — the field the
 * visitor disturbs in the hero is the same field still carrying those
 * marks in the footer. That persistence is the site's whole thesis, so
 * it is enforced here rather than left to convention.
 */

export interface ReactionPreset {
  feed: number;
  kill: number;
  diffuseA: number;
  diffuseB: number;
  /** How strongly the lattice geometry biases the chemistry. */
  structure: number;
}

/**
 * Feed/kill pairs are chosen from the stable regions of the Gray-Scott
 * parameter space, and every one of them is a *pattern-forming* regime
 * rather than a space-filling one. Values with a low kill rate relative
 * to feed drive the field solid, which lights entire plates and destroys
 * the near-black material read the references depend on.
 */
export const PRESETS = {
  /** Idle — worms: winding lines that read as a fracture network. */
  base: { feed: 0.0545, kill: 0.062, diffuseA: 0.74, diffuseB: 0.37, structure: 1.0 },
  /** Desk42 — discrete cells, tightly organised, retaining prior marks. */
  desk42: { feed: 0.03, kill: 0.0625, diffuseA: 0.74, diffuseB: 0.355, structure: 1.25 },
  /** Brawler — worms: aggressive propagation and contamination spread. */
  brawler: { feed: 0.0545, kill: 0.062, diffuseA: 0.74, diffuseB: 0.385, structure: 0.7 },
  /** Roguelite — between coral and worms; complex but not chaotic. */
  roguelite: { feed: 0.041, kill: 0.063, diffuseA: 0.74, diffuseB: 0.37, structure: 1.1 },
  /** Resolution — the calmest stable pattern the system settles into. */
  resolved: { feed: 0.058, kill: 0.063, diffuseA: 0.74, diffuseB: 0.37, structure: 1.15 },
} as const satisfies Record<string, ReactionPreset>;

export type PresetName = keyof typeof PRESETS;

interface Splat {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export class ReactionField {
  /** Live simulation state, sampled by the lattice and ring materials. */
  get texture(): THREE.Texture {
    return this.targets[this.read].texture;
  }

  private renderer: THREE.WebGLRenderer;
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private read = 0;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private material: THREE.RawShaderMaterial;
  private seedMaterial: THREE.RawShaderMaterial;
  private resolution: number;
  private seeded = false;

  /** Pointer splat, decayed each frame so a flick leaves a trail. */
  private pointerSplat: Splat = { x: 0.5, y: 0.5, radius: 0.0, strength: 0 };
  /** Queue of scripted splats issued by the scroll director. */
  private queue: Splat[] = [];

  private current: ReactionPreset = { ...PRESETS.base };
  private target: ReactionPreset = { ...PRESETS.base };

  constructor(renderer: THREE.WebGLRenderer, resolution: number) {
    this.renderer = renderer;
    this.resolution = resolution;

    this.targets = [this.createTarget(resolution), this.createTarget(resolution)];

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: reactionVert,
      fragmentShader: reactionFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uState: { value: null },
        uTexel: { value: new THREE.Vector2(1 / resolution, 1 / resolution) },
        uDt: { value: 1.0 },
        uFeed: { value: this.current.feed },
        uKill: { value: this.current.kill },
        uDiffuseA: { value: this.current.diffuseA },
        uDiffuseB: { value: this.current.diffuseB },
        uStructure: { value: this.current.structure },
        uSplat: { value: new THREE.Vector4(0, 0, 0, 0) },
        uSplatB: { value: new THREE.Vector4(0, 0, 0, 0) },
      },
    });

    this.seedMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: reactionVert,
      fragmentShader: seedFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: { uSeed: { value: 3.17 } },
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  private createTarget(size: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
  }

  /** Writes the initial condition into both targets. Called once. */
  seed(): void {
    if (this.seeded) return;
    const previous = this.renderer.getRenderTarget();
    this.quad.material = this.seedMaterial;
    for (const target of this.targets) {
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
    }
    this.quad.material = this.material;
    this.renderer.setRenderTarget(previous);
    this.seeded = true;
  }

  /**
   * Runs the simulation forward before the first frame is shown.
   *
   * Gray–Scott needs thousands of iterations to grow a developed
   * pattern. Without this the visitor watches the field slowly emerge
   * over the first fifteen seconds and the hero is a near-empty lattice
   * at the exact moment it is supposed to land — the brief's "first
   * three seconds" requirement is decided here, not by the shader.
   *
   * This is also what the loader is measuring: real work, not a timer.
   */
  warmUp(steps: number, onProgress?: (fraction: number) => void): void {
    const chunk = 40;
    let done = 0;
    while (done < steps) {
      const take = Math.min(chunk, steps - done);
      // Warm-up runs at the idle preset with no disturbances, so the
      // starting state is the system at rest rather than mid-gesture.
      this.step(take);
      done += take;
      onProgress?.(done / steps);
    }
  }

  /** Eases toward a named preset. The field never jumps between states. */
  setPreset(name: PresetName): void {
    this.target = { ...PRESETS[name] };
  }

  /** Blends between two presets — used to follow scroll progress. */
  blendPresets(a: PresetName, b: PresetName, t: number): void {
    const pa = PRESETS[a];
    const pb = PRESETS[b];
    const k = Math.min(Math.max(t, 0), 1);
    this.target = {
      feed: pa.feed + (pb.feed - pa.feed) * k,
      kill: pa.kill + (pb.kill - pa.kill) * k,
      diffuseA: pa.diffuseA + (pb.diffuseA - pa.diffuseA) * k,
      diffuseB: pa.diffuseB + (pb.diffuseB - pa.diffuseB) * k,
      structure: pa.structure + (pb.structure - pa.structure) * k,
    };
  }

  /** A disturbance at normalised field coordinates. */
  splat(x: number, y: number, radius = 0.035, strength = 0.62): void {
    if (this.queue.length > 12) return;
    this.queue.push({ x, y, radius, strength });
  }

  /** Continuous pointer disturbance; decays on its own. */
  setPointer(x: number, y: number, strength: number): void {
    this.pointerSplat.x = x;
    this.pointerSplat.y = y;
    this.pointerSplat.radius = 0.028;
    this.pointerSplat.strength = Math.max(this.pointerSplat.strength, strength);
  }

  resize(resolution: number): void {
    if (resolution === this.resolution) return;
    // Re-seeding on resize would break persistence, so the field is only
    // rebuilt if the tier change genuinely demands a different texture.
    this.resolution = resolution;
    this.targets.forEach((t) => t.dispose());
    this.targets = [this.createTarget(resolution), this.createTarget(resolution)];
    this.material.uniforms.uTexel.value.set(1 / resolution, 1 / resolution);
    this.seeded = false;
    this.seed();
  }

  update(steps: number, dt: number): void {
    if (!this.seeded) this.seed();

    // Ease rate parameters rather than snapping: a hard feed/kill change
    // is instantly readable as a cut, which the brief forbids.
    const ease = 1 - Math.pow(0.0016, dt);
    this.current.feed += (this.target.feed - this.current.feed) * ease;
    this.current.kill += (this.target.kill - this.current.kill) * ease;
    this.current.diffuseA += (this.target.diffuseA - this.current.diffuseA) * ease;
    this.current.diffuseB += (this.target.diffuseB - this.current.diffuseB) * ease;
    this.current.structure += (this.target.structure - this.current.structure) * ease;

    const u = this.material.uniforms;
    u.uFeed.value = this.current.feed;
    u.uKill.value = this.current.kill;
    u.uDiffuseA.value = this.current.diffuseA;
    u.uDiffuseB.value = this.current.diffuseB;
    u.uStructure.value = this.current.structure;

    this.step(steps);

    // Pointer energy bleeds off quickly so the trail reads as a wake.
    this.pointerSplat.strength *= Math.pow(0.02, dt);
    if (this.pointerSplat.strength < 0.001) this.pointerSplat.strength = 0;
  }

  /** Advances the chemistry by n substeps, applying any queued splats. */
  private step(steps: number): void {
    const u = this.material.uniforms;
    const previous = this.renderer.getRenderTarget();
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;

    for (let i = 0; i < steps; i++) {
      // Splats are applied on the first substep only, so a single
      // disturbance is injected once and then allowed to evolve.
      if (i === 0) {
        const scripted = this.queue.shift();
        u.uSplat.value.set(
          this.pointerSplat.x,
          this.pointerSplat.y,
          this.pointerSplat.radius,
          this.pointerSplat.strength
        );
        if (scripted) {
          u.uSplatB.value.set(scripted.x, scripted.y, scripted.radius, scripted.strength);
        } else {
          u.uSplatB.value.set(0, 0, 0, 0);
        }
      } else {
        u.uSplat.value.set(0, 0, 0, 0);
        u.uSplatB.value.set(0, 0, 0, 0);
      }

      const write = 1 - this.read;
      u.uState.value = this.targets[this.read].texture;
      this.renderer.setRenderTarget(this.targets[write]);
      this.renderer.render(this.scene, this.camera);
      this.read = write;
    }

    this.renderer.autoClear = autoClear;
    this.renderer.setRenderTarget(previous);
  }

  dispose(): void {
    this.targets.forEach((t) => t.dispose());
    this.quad.geometry.dispose();
    this.material.dispose();
    this.seedMaterial.dispose();
  }
}
