import * as THREE from 'three';

import reactionVert from '../shaders/reaction.vert.glsl?raw';
import bloomFrag from '../shaders/bloom.frag.glsl?raw';
import compositeFrag from '../shaders/composite.frag.glsl?raw';

/**
 * PostPipeline
 *
 * Scene → quarter-res bright pass → composite. Two extra draws, both
 * cheap, and the bright pass is dropped entirely on the low tier.
 *
 * Written by hand rather than pulled in from EffectComposer: this needs
 * exactly one bloom and one composite, and the hand-rolled version
 * avoids shipping the whole post-processing framework for two passes.
 */
export class PostPipeline {
  enabled = true;

  private renderer: THREE.WebGLRenderer;
  private sceneTarget: THREE.WebGLRenderTarget;
  private bloomTarget: THREE.WebGLRenderTarget;

  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;

  private bloomMaterial: THREE.RawShaderMaterial;
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

    this.compositeMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: reactionVert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.sceneTarget.texture },
        uBloom: { value: this.bloomTarget.texture },
        uBloomStrength: { value: 0.7 },
        uVignette: { value: 0.9 },
        uGrain: { value: 0.022 },
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
    this.compositeMaterial.uniforms.uResolution.value.set(this.width, this.height);
  }

  setState(exposure: number, bloom: number, vignette: number, time: number): void {
    const u = this.compositeMaterial.uniforms;
    u.uExposure.value = exposure;
    u.uBloomStrength.value = this.enabled ? bloom : 0;
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
    }

    this.quad.material = this.compositeMaterial;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.sceneTarget.dispose();
    this.bloomTarget.dispose();
    this.quad.geometry.dispose();
    this.bloomMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
