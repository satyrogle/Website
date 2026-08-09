import * as THREE from 'three';

import reactionVert from '../shaders/reaction.vert.glsl?raw';
import bloomFrag from '../shaders/bloom.frag.glsl?raw';
import compositeFrag from '../shaders/composite.frag.glsl?raw';

/**
 * PostPipeline
 *
 * Scene → quarter-res bright pass → sixteenth-res haze → composite.
 * Three extra draws, all cheap, and the bright pass and the haze are
 * dropped together on the low tier.
 *
 * Written by hand rather than pulled in from EffectComposer: this needs
 * exactly one bloom, one haze and one composite, and the hand-rolled
 * version avoids shipping the whole post-processing framework.
 *
 * THE HAZE is what puts the entity in a medium rather than on top of a
 * black rectangle. It is the bright pass blurred again, far wider and at
 * a sixteenth of the resolution, added back weak — so the veins bleed
 * into the surrounding void as atmosphere.
 *
 * It reads as volumetric without being volumetric, and more importantly
 * it is derived from the entity's OWN emissive: the colour, the position
 * and the motion of the glow in the void are the entity's, one blur
 * removed. Nothing has to be authored to match it and nothing can drift
 * out of step with it, which is exactly what a painted backplate could
 * never do — that plate was a MeshBasicMaterial and could not respond to
 * the entity, the field or the lighting arc by construction.
 */
/**
 * Haze strength as a fraction of the bloom's. Deliberately under half:
 * the atmosphere has to be felt before it is seen, and past about 0.8 it
 * stops reading as a medium and starts reading as a dirty lens.
 */
const HAZE_GAIN = 0.6;

export class PostPipeline {
  enabled = true;

  private renderer: THREE.WebGLRenderer;
  private sceneTarget: THREE.WebGLRenderTarget;
  private bloomTarget: THREE.WebGLRenderTarget;
  private hazeTarget: THREE.WebGLRenderTarget;

  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;

  private bloomMaterial: THREE.RawShaderMaterial;
  private hazeMaterial: THREE.RawShaderMaterial;
  private compositeMaterial: THREE.RawShaderMaterial;

  private width = 1;
  private height = 1;

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number, samples = 4) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    this.sceneTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      // MSAA on the offscreen target. The renderer itself has antialias
      // off because it never presents directly — without this, the thin
      // vein filaments and plate edges crawl badly, which is the single
      // most obvious "cheap WebGL" tell.
      samples,
    });

    const bw = Math.max(1, Math.floor(width / 4));
    const bh = Math.max(1, Math.floor(height / 4));
    this.bloomTarget = new THREE.WebGLRenderTarget(bw, bh, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });

    this.bloomMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: reactionVert,
      fragmentShader: bloomFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.sceneTarget.texture },
        uTexel: { value: new THREE.Vector2(1 / bw, 1 / bh) },
        uThreshold: { value: 0.62 },
        uRadius: { value: 1.35 },
      },
    });

    const hw = Math.max(1, Math.floor(width / 16));
    const hh = Math.max(1, Math.floor(height / 16));
    this.hazeTarget = new THREE.WebGLRenderTarget(hw, hh, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });

    // The same bright-pass shader, run a second time over the bloom
    // buffer. Threshold 0 because the cut has already been made — a
    // second cut at 0.62 would eat the dim tail, and the dim tail IS the
    // atmosphere. The radius is what does the work: at a sixteenth of
    // the resolution these taps reach roughly a tenth of the screen.
    this.hazeMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: reactionVert,
      fragmentShader: bloomFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.bloomTarget.texture },
        uTexel: { value: new THREE.Vector2(1 / hw, 1 / hh) },
        uThreshold: { value: 0.0 },
        uRadius: { value: 3.2 },
      },
    });

    this.compositeMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: reactionVert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.sceneTarget.texture },
        uBloom: { value: this.bloomTarget.texture },
        uHaze: { value: this.hazeTarget.texture },
        uBloomStrength: { value: 0.7 },
        uHazeStrength: { value: 0.0 },
        uVignette: { value: 0.9 },
        uGrain: { value: 0.022 },
        // Particulate drift. Larger than the grain because it is a much
        // lower frequency and only ever appears in the deep black.
        uDrift: { value: 0.055 },
        uTime: { value: 0 },
        uExposure: { value: 1.1 },
        uResolution: { value: new THREE.Vector2(width, height) },
      },
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.sceneTarget.setSize(this.width, this.height);

    const bw = Math.max(1, Math.floor(this.width / 4));
    const bh = Math.max(1, Math.floor(this.height / 4));
    this.bloomTarget.setSize(bw, bh);
    this.bloomMaterial.uniforms.uTexel.value.set(1 / bw, 1 / bh);

    const hw = Math.max(1, Math.floor(this.width / 16));
    const hh = Math.max(1, Math.floor(this.height / 16));
    this.hazeTarget.setSize(hw, hh);
    this.hazeMaterial.uniforms.uTexel.value.set(1 / hw, 1 / hh);

    this.compositeMaterial.uniforms.uResolution.value.set(this.width, this.height);
  }

  setState(exposure: number, bloom: number, vignette: number, time: number): void {
    const u = this.compositeMaterial.uniforms;
    u.uExposure.value = exposure;
    u.uBloomStrength.value = this.enabled ? bloom : 0;
    // Rides the same arc as the bloom rather than carrying its own
    // schedule: the atmosphere is the entity's light, so it has to rise
    // and fall with it or the two come apart across the journey.
    u.uHazeStrength.value = this.enabled ? bloom * HAZE_GAIN : 0;
    u.uVignette.value = vignette;
    u.uTime.value = time;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    if (this.enabled) {
      this.quad.material = this.bloomMaterial;
      this.renderer.setRenderTarget(this.bloomTarget);
      this.renderer.render(this.quadScene, this.quadCamera);

      this.quad.material = this.hazeMaterial;
      this.renderer.setRenderTarget(this.hazeTarget);
      this.renderer.render(this.quadScene, this.quadCamera);
    }

    this.quad.material = this.compositeMaterial;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.sceneTarget.dispose();
    this.bloomTarget.dispose();
    this.hazeTarget.dispose();
    this.quad.geometry.dispose();
    this.bloomMaterial.dispose();
    this.hazeMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
