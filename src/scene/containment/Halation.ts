/**
 * Halation — light spreading out of the events, and almost out of nothing else.
 *
 * The scene is drawn twice: once whole, and once in emissive-only mode. Only
 * the second buffer is blurred, so what may bloom is decided by construction
 * rather than by a brightness threshold.
 *
 * What emissive-only means, in one place, because it used to mean three:
 *
 * - **The body contributes nothing.** It is mass. It is understood by what it
 *   occludes and by its grazing edge, and a rim that bloomed would make it
 *   glow. It still draws in that pass — everything behind it must be occluded
 *   there exactly as it is in the scene — but it outputs black. It had no
 *   emissive mode at all, so its rim and its wash went into the blur at full
 *   weight and the resting silhouette carried a halo.
 * - **The trajectories and the ridges contribute `REST_HALATION` of their
 *   resting level, and both contribute the SAME fraction.** Not zero: a faint
 *   sacred glow along the structure is the angelic first read, and this file
 *   previously claimed zero while shipping 0.30. Halved after measuring the
 *   corrected frame, which leaves an event more headroom to be the thing that
 *   visibly changes.
 * - **Everything above the resting floor is event light**, and an event is the
 *   only thing that can produce it.
 *
 * Two levels, because an event needs both readings at once: a tight core so a
 * junction is a hard point of light, and a wide halo so a cascade throws
 * something into the black around it. A single radius gives either a smear or a
 * dot.
 *
 * Half-float targets throughout. The emissive pass routinely exceeds one, and
 * clamping it to eight bits before the blur is what makes bloom look like grey
 * fog instead of like energy.
 */

import * as THREE from 'three';

/**
 * The share of its resting level each layer carries into the blurred buffer.
 * One table, imported by every layer that has a resting level, so "resting
 * bloom" cannot drift apart again.
 */
export const REST_HALATION = {
  /**
   * The fine graph: NONE.
   *
   * Thousands of resting fibres bleeding into one another is what made the
   * entity read as feather, silk and hair — the bloom joined them into a
   * single luminous grain running one way. They bloom from event energy and
   * from nothing else now, which is also what the law always said.
   */
  fibres: 0.0,
  /** The structural ridges: a trace, so the resting body is not pure matte. */
  ridges: 0.10,
  /** The body's rim only, never its faces. The silhouette may breathe. */
  rim: 0.20,
};

export interface HalationLook {
  /** How much of the wide halo reaches the frame. */
  halo: number;
  /** How much of the tight core does. */
  core: number;
}

export const HALATION_LOOK: HalationLook = {
  halo: 0.85,
  core: 1.15,
};

/** A screen-filling triangle. Cheaper than a quad and has no diagonal seam. */
function fullScreen(material: THREE.RawShaderMaterial | THREE.ShaderMaterial): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

const VERT = /* glsl */ `
  in vec3 position;
  in vec2 uv;
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

interface Emissive {
  setEmissiveOnly(on: boolean): void;
}

export class Halation {
  private scene!: THREE.WebGLRenderTarget;
  private bright: THREE.WebGLRenderTarget[] = [];
  private scratch: THREE.WebGLRenderTarget[] = [];

  private readonly blurMaterial: THREE.RawShaderMaterial;
  private readonly compositeMaterial: THREE.RawShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly compositeQuad: THREE.Mesh;
  private readonly view = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(width: number, height: number, look: HalationLook = HALATION_LOOK) {
    this.blurMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uSource: { value: null },
        uStep: { value: new THREE.Vector2() },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uSource;
        uniform vec2 uStep;
        in vec2 vUv;
        out vec4 fragColour;

        // Nine taps, separable, run once per axis. The weights are a gaussian
        // normalised to one so a blur cannot brighten what it spreads.
        const float W0 = 0.2270270270;
        const float W1 = 0.1945945946;
        const float W2 = 0.1216216216;
        const float W3 = 0.0540540541;
        const float W4 = 0.0162162162;

        void main() {
          vec3 sum = texture(uSource, vUv).rgb * W0;
          sum += texture(uSource, vUv + uStep).rgb * W1;
          sum += texture(uSource, vUv - uStep).rgb * W1;
          sum += texture(uSource, vUv + uStep * 2.0).rgb * W2;
          sum += texture(uSource, vUv - uStep * 2.0).rgb * W2;
          sum += texture(uSource, vUv + uStep * 3.0).rgb * W3;
          sum += texture(uSource, vUv - uStep * 3.0).rgb * W3;
          sum += texture(uSource, vUv + uStep * 4.0).rgb * W4;
          sum += texture(uSource, vUv - uStep * 4.0).rgb * W4;
          fragColour = vec4(sum, 1.0);
        }
      `,
    });

    this.compositeMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uScene: { value: null },
        uCore: { value: null },
        uHalo: { value: null },
        uCoreGain: { value: look.core },
        uHaloGain: { value: look.halo },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uScene;
        uniform sampler2D uCore;
        uniform sampler2D uHalo;
        uniform float uCoreGain;
        uniform float uHaloGain;
        in vec2 vUv;
        out vec4 fragColour;

        void main() {
          vec3 c = texture(uScene, vUv).rgb;
          c += texture(uCore, vUv).rgb * uCoreGain;
          c += texture(uHalo, vUv).rgb * uHaloGain;

          // Rolled off rather than clipped. Straight clamping drives every
          // channel of a bright event to one and the arrest violet comes out
          // white, which loses the only colour that distinguishes a correction
          // from the cascade it is correcting.
          c = c / (1.0 + c * 0.55);
          fragColour = vec4(c, 1.0);
        }
      `,
    });

    this.quad = fullScreen(this.blurMaterial);
    this.compositeQuad = fullScreen(this.compositeMaterial);
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    const make = (w: number, h: number): THREE.WebGLRenderTarget =>
      new THREE.WebGLRenderTarget(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)), {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });

    this.dropTargets();
    this.scene = make(width, height);
    // Two levels: a tight core at half, a wide halo at an eighth.
    for (const divisor of [2, 8]) {
      this.bright.push(make(width / divisor, height / divisor));
      this.scratch.push(make(width / divisor, height / divisor));
    }
  }

  private dropTargets(): void {
    this.scene?.dispose();
    for (const t of this.bright) t.dispose();
    for (const t of this.scratch) t.dispose();
    this.bright = [];
    this.scratch = [];
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    field: Emissive
  ): void {
    const previousTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.scene);
    renderer.clear();
    renderer.render(scene, camera);

    // The same geometry again, carrying only what an event produced.
    field.setEmissiveOnly(true);
    for (let i = 0; i < this.bright.length; i++) {
      renderer.setRenderTarget(this.bright[i]);
      renderer.clear();
      renderer.render(scene, camera);
    }
    field.setEmissiveOnly(false);

    this.view.clear();
    this.view.add(this.quad);
    for (let i = 0; i < this.bright.length; i++) {
      const { width, height } = this.bright[i];
      // Horizontal, then vertical. Separable, so nine taps twice rather than
      // eighty-one once.
      this.blurMaterial.uniforms.uSource.value = this.bright[i].texture;
      this.blurMaterial.uniforms.uStep.value.set(1 / width, 0);
      renderer.setRenderTarget(this.scratch[i]);
      renderer.render(this.view, this.camera);

      this.blurMaterial.uniforms.uSource.value = this.scratch[i].texture;
      this.blurMaterial.uniforms.uStep.value.set(0, 1 / height);
      renderer.setRenderTarget(this.bright[i]);
      renderer.render(this.view, this.camera);
    }

    this.compositeMaterial.uniforms.uScene.value = this.scene.texture;
    this.compositeMaterial.uniforms.uCore.value = this.bright[0].texture;
    this.compositeMaterial.uniforms.uHalo.value = this.bright[1].texture;

    this.view.clear();
    this.view.add(this.compositeQuad);
    renderer.setRenderTarget(previousTarget);
    renderer.render(this.view, this.camera);
  }

  dispose(): void {
    this.dropTargets();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.geometry.dispose();
    this.compositeQuad.geometry.dispose();
  }
}
