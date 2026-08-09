import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import monolithVert from '../shaders/monolith.vert.glsl?raw';
import monolithFrag from '../shaders/monolith.frag.glsl?raw';

/**
 * DarkLatticeMonolithModel
 *
 * Owns the production asset: loads DL_Monolith_v01.glb, resolves each
 * part's authored role, and drives it from prologue progress.
 *
 * The class knows almost nothing about the building's composition.
 * Which parts exist, when each is relevant, how hard each answers the
 * reaction field and how far each mass displaces all arrive as glTF
 * extras, so restaging a mass is an asset change.
 */

export const MATERIAL_CLASSES = [
  'MAT_OBSIDIAN',
  'MAT_SPINE',
  'MAT_RIB',
  'MAT_WALL',
  'MAT_LATENT',
  'MAT_HALO',
] as const;

export type MaterialClass = (typeof MATERIAL_CLASSES)[number];

export type PartRole =
  | 'outer_mass'
  | 'inner_spine'
  | 'tunnel_rib'
  | 'tunnel_wall'
  | 'latent_core'
  | 'halo';

/**
 * Locked palette. Most of the building is one of the four structural
 * blacks; teal and cyan are the baseline active fissures; violet is
 * reserved for retained consequence; amber exists only on the halo.
 */
const PALETTE = {
  void: new THREE.Color('#010204'),
  obsidian: new THREE.Color('#080B10'),
  shell: new THREE.Color('#0D1219'),
  graphite: new THREE.Color('#141C26'),
  raised: new THREE.Color('#212C3B'),
  teal: new THREE.Color('#31CFC4'),
  cyan: new THREE.Color('#4AC9F5'),
  violet: new THREE.Color('#8A5CD8'),
  coldSilver: new THREE.Color('#BFE4F2'),
  haloWarm: new THREE.Color('#C0954B'),
};

const PROJECTION_INDEX: Record<string, number> = {
  planar: 0,
  cylindrical: 1,
  none: 2,
};

/** Stable per-part seed, derived from the authored name. */
function seedFromName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

interface PartExtras {
  dl_role?: string;
  dl_material_class?: string;
  dl_visibility_stage?: string;
  dl_stage_from?: number;
  dl_stage_to?: number;
  dl_reaction?: number;
  dl_projection?: string;
  dl_open_translation?: number[];
  dl_open_rotation?: number[];
}

interface Part {
  mesh: THREE.Mesh;
  material: THREE.RawShaderMaterial;
  role: PartRole;
  stageFrom: number;
  stageTo: number;
  /**
   * World-space Z of the part's DEEPEST face, cached at load. The cull
   * has to wait until the whole part is behind the lens: the tunnel
   * walls are single meshes fifteen units long, and testing their near
   * edge removed the entire corridor the moment the camera entered it.
   */
  farZ: number;
}

export interface EntityLightState {
  keyDir: [number, number, number];
  emissive: number;
  wake: number;
  fog: number;
  keyIntensity: number;
  rimIntensity: number;
  fillIntensity: number;
  displace: number;
  sharp: number;
  halo: number;
}

export class DarkLatticeMonolithModel {
  readonly group = new THREE.Group();

  private parts: Part[] = [];
  private byRole = new Map<PartRole, Part[]>();
  private materials: THREE.RawShaderMaterial[] = [];
  private disposed = false;

  private boundsMin = new THREE.Vector3(-1.3, -3.3, -1.4);
  private boundsMax = new THREE.Vector3(1.3, 3.9, 1.0);
  private tunnelSpan = new THREE.Vector2(-1.7, -16.4);

  /** Retained consequence. Rises across the prologue and never falls. */
  private retained = 0;
  private trace = new THREE.Vector4(0.5, 0.54, 0.11, 0);

  private reducedMotion: boolean;

  constructor(options: { reducedMotion: boolean }) {
    this.reducedMotion = options.reducedMotion;
  }

  async load(url: string, onProgress?: (fraction: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
      loader.load(
        url,
        (result) => resolve(result as unknown as { scene: THREE.Object3D }),
        (event) => {
          if (event.total > 0) onProgress?.(Math.min(event.loaded / event.total, 1));
        },
        reject
      );
    });

    const root = gltf.scene;
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) this.adoptMesh(child as THREE.Mesh);
    });

    this.group.add(root);
    this.group.updateMatrixWorld(true);
    this.cacheDepths();
    this.measureSamplingSpaces();
  }

  /**
   * The exporter splits a multi-material object into primitives whose
   * own userData is empty, so extras have to be resolved up the graph.
   */
  private resolveExtras(mesh: THREE.Object3D): PartExtras {
    let node: THREE.Object3D | null = mesh;
    while (node) {
      const data = (node.userData ?? {}) as PartExtras;
      if (data.dl_role) return data;
      node = node.parent;
    }
    return (mesh.userData ?? {}) as PartExtras;
  }

  private adoptMesh(mesh: THREE.Mesh): void {
    const extras = this.resolveExtras(mesh);

    // A mesh with no resolvable role has no contract with this runtime.
    // Guessing one has cost this build before, so it draws nothing.
    if (!extras.dl_role) {
      if (import.meta.env.DEV) {
        console.warn(`[monolith] "${mesh.name}" has no dl_role — not rendered.`);
      }
      mesh.visible = false;
      return;
    }

    const role = extras.dl_role as PartRole;
    const className = (extras.dl_material_class ?? 'MAT_OBSIDIAN') as MaterialClass;
    const classIndex = Math.max(0, MATERIAL_CLASSES.indexOf(className));
    const projection = PROJECTION_INDEX[extras.dl_projection ?? 'planar'] ?? 0;
    const interior = role === 'tunnel_rib' || role === 'tunnel_wall';
    const isHalo = role === 'halo';

    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());

    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      // The camera travels down the inside of the tunnel, where
      // front-face culling would leave the corridor empty.
      side: interior || isHalo ? THREE.DoubleSide : THREE.FrontSide,
      transparent: isHalo,
      blending: isHalo ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !isHalo,
      vertexShader: monolithVert,
      fragmentShader: monolithFrag,
      uniforms: {
        uField: { value: null },
        uTime: { value: 0 },
        uBoundsMin: { value: this.boundsMin },
        uBoundsMax: { value: this.boundsMax },
        uTunnelSpan: { value: this.tunnelSpan },
        uProjection: { value: projection },
        uReaction: { value: extras.dl_reaction ?? 0.45 },
        uDisplace: { value: this.reducedMotion ? 0 : 0.01 },
        uSeed: { value: seedFromName(mesh.name) },

        uOpen: { value: 0 },
        uOpenTranslation: {
          value: new THREE.Vector3().fromArray(extras.dl_open_translation ?? [0, 0, 0]),
        },
        uOpenRotation: {
          value: new THREE.Vector3().fromArray(extras.dl_open_rotation ?? [0, 0, 0]),
        },

        uObsidian: { value: PALETTE.obsidian },
        uShell: { value: PALETTE.shell },
        uGraphite: { value: PALETTE.graphite },
        uRaised: { value: PALETTE.raised },
        uTeal: { value: PALETTE.teal },
        uCyan: { value: PALETTE.cyan },
        uViolet: { value: PALETTE.violet },
        uColdSilver: { value: PALETTE.coldSilver },
        uHaloWarm: { value: PALETTE.haloWarm },
        uFogColor: { value: PALETTE.void.clone() },

        uClass: { value: classIndex },
        uCrackScale: { value: 0.2 },
        uPartRadius: { value: Math.max(size.x, size.y) * 0.5 },

        uProgress: { value: 0 },
        uEmissive: { value: 1 },
        uWake: { value: 0 },
        uFogDensity: { value: 0.03 },
        uKeyDir: { value: new THREE.Vector3(0.28, 0.66, 0.7).normalize() },
        uKeyIntensity: { value: 1 },
        uRimDir: { value: new THREE.Vector3(0, 0.3, -0.92).normalize() },
        uRimIntensity: { value: 1.2 },
        uFillIntensity: { value: 1 },
        uSharp: { value: 0.5 },
        uHaloGain: { value: 1 },

        uTrace: { value: this.trace },
        uTraceStretch: { value: projection > 0.5 ? 7.5 : 1 },
        uRetained: { value: 0 },
      },
    });

    mesh.material = material;
    mesh.frustumCulled = false;
    if (isHalo) mesh.renderOrder = -1;

    const part: Part = {
      mesh,
      material,
      role,
      stageFrom: extras.dl_stage_from ?? 0,
      stageTo: extras.dl_stage_to ?? 1,
      farZ: 0,
    };

    this.parts.push(part);
    this.materials.push(material);
    const bucket = this.byRole.get(role) ?? [];
    bucket.push(part);
    this.byRole.set(role, bucket);
  }

  /** Caches each part's deepest world Z once the graph is final. */
  private cacheDepths(): void {
    const box = new THREE.Box3();
    for (const part of this.parts) {
      box.setFromObject(part.mesh);
      part.farZ = box.min.z;
    }
  }

  /**
   * Measures the spaces the reaction field is sampled against from the
   * geometry that actually loaded, rather than trusting baked bounds.
   */
  private measureSamplingSpaces(): void {
    const box = new THREE.Box3();
    const form = new THREE.Box3().makeEmpty();
    const tunnel = new THREE.Box3().makeEmpty();

    for (const part of this.parts) {
      box.setFromObject(part.mesh);
      if (box.isEmpty()) continue;
      if (part.role === 'outer_mass' || part.role === 'inner_spine') form.union(box);
      if (part.role === 'tunnel_rib' || part.role === 'tunnel_wall') tunnel.union(box);
    }

    if (!form.isEmpty()) {
      this.boundsMin.copy(form.min);
      this.boundsMax.copy(form.max);
    }
    // Near first, far second: the camera travels toward -Z.
    if (!tunnel.isEmpty()) this.tunnelSpan.set(tunnel.max.z, tunnel.min.z);

    // Fissure frequency is expressed in monolith widths, so an asset at
    // a different scale does not silently turn stone into camouflage.
    const span = form.isEmpty() ? 2.6 : Math.max(...form.getSize(new THREE.Vector3()).toArray());
    for (const material of this.materials) {
      material.uniforms.uCrackScale.value = 1 / Math.max(span, 1e-6);
    }
  }

  bindField(texture: THREE.Texture): void {
    for (const material of this.materials) {
      material.uniforms.uField.value = texture;
    }
  }

  /**
   * Visibility staging plus a behind-camera cull. Parts are switched,
   * never crossfaded; a switch behind the lens is invisible.
   */
  private applyStages(progress: number, cameraZ: number): void {
    const margin = 0.04;
    for (const part of this.parts) {
      const inWindow =
        progress >= part.stageFrom - margin && progress <= part.stageTo + margin;
      const behind = part.farZ > cameraZ + 1.0;
      part.mesh.visible = inWindow && !behind;
    }
  }

  /**
   * The tectonic opening. The seven masses move apart once, by their own
   * authored vector, and the opening remains after it has occurred.
   */
  setProgress(progress: number, open: number, cameraZ = -99): void {
    this.applyStages(progress, cameraZ);

    for (const part of this.parts) {
      const uniforms = part.material.uniforms;
      uniforms.uProgress.value = progress;
      uniforms.uOpen.value = part.role === 'outer_mass' ? open : 0;
    }
  }

  /**
   * Places the disturbance. Called once per visit and then left alone:
   * the trace is the site's single causal claim, so it is never
   * reseeded, moved or cleared during the prologue.
   */
  setTrace(u: number, v: number, strength = 1): void {
    this.trace.set(u, v, 0.115, strength);
  }

  get traceUv(): [number, number] {
    return [this.trace.x, this.trace.y];
  }

  get hasTrace(): boolean {
    return this.trace.w > 0.001;
  }

  /** Retained consequence may increase but must never decrease. */
  setRetained(value: number): void {
    this.retained = Math.max(this.retained, Math.min(Math.max(value, 0), 1));
    for (const material of this.materials) {
      material.uniforms.uRetained.value = this.retained;
    }
  }

  setLighting(state: EntityLightState): void {
    for (const material of this.materials) {
      const uniforms = material.uniforms;
      (uniforms.uKeyDir.value as THREE.Vector3).fromArray(state.keyDir).normalize();
      uniforms.uEmissive.value = state.emissive;
      uniforms.uWake.value = state.wake;
      uniforms.uFogDensity.value = state.fog;
      uniforms.uKeyIntensity.value = state.keyIntensity;
      uniforms.uRimIntensity.value = state.rimIntensity;
      uniforms.uFillIntensity.value = state.fillIntensity;
      uniforms.uSharp.value = state.sharp;
      uniforms.uHaloGain.value = state.halo;
      uniforms.uDisplace.value = this.reducedMotion ? 0 : state.displace;
    }
  }

  update(time: number): void {
    for (const material of this.materials) {
      material.uniforms.uTime.value = time;
    }
  }

  /** Maps a world XY point into the planar field's UV space. */
  fieldUvFromWorld(x: number, y: number): [number, number] {
    const spanX = Math.max(this.boundsMax.x - this.boundsMin.x, 0.001);
    const spanY = Math.max(this.boundsMax.y - this.boundsMin.y, 0.001);
    return [(x - this.boundsMin.x) / spanX, (y - this.boundsMin.y) / spanY];
  }

  get partCount(): number {
    return this.parts.length;
  }

  get roles(): string[] {
    return [...this.byRole.keys()].sort();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const part of this.parts) {
      part.mesh.geometry.dispose();
      part.material.dispose();
    }
    this.parts = [];
    this.materials = [];
    this.byRole.clear();
  }
}
