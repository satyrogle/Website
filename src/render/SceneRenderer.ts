import * as THREE from 'three';
import type { SimulationKernel } from '../sim/SimulationKernel';
import type { ViewState } from './ObservationModel';
import { FSQ_VERT, PRESENT_FRAG, AGENT_POINTS_VERT, AGENT_POINTS_FRAG } from '../sim/shaders';

/**
 * The screen pass. Observes the kernel's textures through the
 * ObservationModel's view; owns the WebGL context and nothing
 * authoritative.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly presentMat: THREE.RawShaderMaterial;
  private readonly agentsMat: THREE.RawShaderMaterial;
  private agentPoints: THREE.Points | null = null;
  private readonly maxDpr: number;

  constructor(canvas: HTMLCanvasElement, maxDpr: number) {
    this.maxDpr = maxDpr;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x020304, 1);

    this.presentMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FSQ_VERT,
      fragmentShader: PRESENT_FRAG,
      uniforms: {
        uTrail: { value: null },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uWin: { value: new THREE.Vector2(1, 1) },
        uSeverity: { value: 0 },
        uExposure: { value: 0.3 },
        uGlow: { value: 0.9 },
        uTime: { value: 0 }
      },
      depthTest: false,
      depthWrite: false
    });
    const fsq = new THREE.BufferGeometry();
    fsq.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
    );
    const presentMesh = new THREE.Mesh(fsq, this.presentMat);
    presentMesh.frustumCulled = false;
    presentMesh.renderOrder = 0;
    this.scene.add(presentMesh);

    this.agentsMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: AGENT_POINTS_VERT,
      fragmentShader: AGENT_POINTS_FRAG,
      uniforms: {
        uAgents: { value: null },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uWin: { value: new THREE.Vector2(1, 1) },
        uPointSize: { value: 2 },
        uOpacity: { value: 0 },
        uSeverity: { value: 0 }
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor
    });

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /** The agent overlay shares the kernel's reference geometry. */
  attachKernel(kernel: SimulationKernel): void {
    this.agentPoints = new THREE.Points(kernel.refGeometry, this.agentsMat);
    this.agentPoints.frustumCulled = false;
    this.agentPoints.renderOrder = 1;
    this.agentPoints.visible = false;
    this.scene.add(this.agentPoints);
  }

  render(kernel: SimulationKernel, view: ViewState): void {
    const pu = this.presentMat.uniforms;
    pu.uTrail!.value = kernel.trailTexture;
    pu.uCenter!.value.set(view.centerX, view.centerY);
    pu.uWin!.value.set(view.winX, view.winY);
    pu.uSeverity!.value = view.severity;
    pu.uExposure!.value = view.exposure;
    pu.uGlow!.value = view.glow;
    pu.uTime!.value = view.time;

    if (this.agentPoints) {
      const show = view.agentOpacity > 0.004;
      this.agentPoints.visible = show;
      if (show) {
        const au = this.agentsMat.uniforms;
        au.uAgents!.value = kernel.agentTexture;
        au.uCenter!.value.set(view.centerX, view.centerY);
        au.uWin!.value.set(view.winX, view.winY);
        au.uOpacity!.value = view.agentOpacity;
        au.uSeverity!.value = view.severity;
        au.uPointSize!.value = Math.max(1.5, this.renderer.getPixelRatio() * 1.6);
      }
    }

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  private readonly resize = (): void => {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxDpr));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.presentMat.dispose();
    this.agentsMat.dispose();
    this.renderer.dispose();
  }
}
