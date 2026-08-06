import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import convergenceVert from '../shaders/convergence.vert.glsl?raw';
import convergenceFrag from '../shaders/convergence.frag.glsl?raw';

/**
 * CrownedConvergenceModel
 *
 * Owns the Blender-authored entity: loads the GLB, resolves its named
 * parts, and drives them from narrative progress.
 *
 * The important design decision is that this class knows almost nothing
 * about the entity's composition. Which parts exist, when each becomes
 * relevant, how hard each answers the reaction field, how each moves
 * when the crown yields — all of it arrives as glTF `extras` written by
 * the Blender build. Adding a mass or restaging one is an asset change,
 * not a TypeScript change, which is the only way the two stay in step
 * across revisions.
 *
 * There is one entity at three scales — the crown, the corridor that is
 * its interior, and the Latent Form at its origin. No second world, no
 * portal scene, no duplicate crown at the far end.
 */

export const MATERIAL_CLASSES = [
  'MAT_CROWN_PRIMARY',
  'MAT_CROWN_SECONDARY',
  'MAT_STRUCTURE',
  'MAT_RING',
  'MAT_CORE',
  'MAT_LATENT',
  'MAT_HALO',
] as const;

export type MaterialClass = (typeof MATERIAL_CLASSES)[number];

/** Locked palette, directive 6.2. */
const PALETTE = {
  void: new THREE.Color('#010204'),
  structure: new THREE.Color('#020406'),
  raisedBlack: new THREE.Color('#081016'),
  teal: new THREE.Color('#36E0B0'),
  cyan: new THREE.Color('#4DD0FF'),
  coldWhite: new THREE.Color('#DFF9FF'),
  magenta: new THREE.Color('#FF2B9A'),
  amber: new THREE.Color('#C9A24A'),
};

const PROJECTION_INDEX: Record<string, number> = {
  planar: 0,
  cylindrical: 1,
  none: 2,
};

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
  dl_yield_spin_deg?: number;
}

interface Part {
  mesh: THREE.Mesh;
  material: THREE.RawShaderMaterial;
  role: string;
  stage: string;
  stageFrom: number;
  stageTo: number;
}

export interface ConvergenceOptions {
  /** Camera-relative cull distance behind the lens. */
  reducedMotion: boolean;
}

export class CrownedConvergenceModel {
  readonly group = new THREE.Group();

  private parts: Part[] = [];
  private byRole = new Map<string, Part[]>();
  private materials: THREE.RawShaderMaterial[] = [];
  private disposed = false;

  /** Rises across the journey and never falls: retained consequence. */
  private retained = 0;

  private boundsMin = new THREE.Vector3(-2.7, -1.2, -2.6);
  private boundsMax = new THREE.Vector3(2.7, 2.3, 2.6);
  private tunnelSpan = new THREE.Vector2(0.6, 11.5);

  private reducedMotion: boolean;

  constructor(options: ConvergenceOptions) {
    // Reduced motion suppresses the field's vertex displacement
    // entirely: the surface may glow, but it must not move.
    this.reducedMotion = options.reducedMotion;
  }

  /**
   * Loads the production GLB. Progress is reported so it can feed the
   * site's real loader rather than a fabricated one.
   */
  async load(url: string, onProgress?: (fraction: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await new Promise<any>((resolve, reject) => {
      loader.load(
        url,
        resolve,
        (event) => {
          if (event.total > 0) onProgress?.(Math.min(event.loaded / event.total, 1));
        },
        reject
      );
    });

    const root = gltf.scene as THREE.Object3D;
    this.readRootExtras(root);

    root.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      this.adoptMesh(child as THREE.Mesh);
    });

    // The whole glTF graph goes in, hierarchy intact. Adopting meshes
    // individually would have stripped the authored parenting, and the
    // group empties are what the loader walks to find part groups.
    this.group.add(root);

    // The GLB is authored Y-up with +Y travelling into the entity; the
    // site's world has the camera looking down -Z. Rotating the whole
    // group once here keeps every authored coordinate, extras value and
    // camera keyframe in the space it was written in.
    this.group.rotation.x = -Math.PI / 2;
    this.group.updateMatrixWorld(true);
  }

  private readRootExtras(root: THREE.Object3D): void {
    let node: THREE.Object3D | null = root;
    const stack: THREE.Object3D[] = [root];
    while (stack.length) {
      node = stack.pop()!;
      const extras = (node.userData ?? {}) as Record<string, unknown>;
      if (typeof extras.dl_exterior_bounds === 'string') {
        try {
          const bounds = JSON.parse(extras.dl_exterior_bounds as string);
          this.boundsMin.fromArray(bounds.min);
          this.boundsMax.fromArray(bounds.max);
        } catch {
          /* keep defaults */
        }
      }
      if (typeof extras.dl_tunnel_span === 'string') {
        try {
          const span = JSON.parse(extras.dl_tunnel_span as string);
          this.tunnelSpan.set(span.near, span.far);
        } catch {
          /* keep defaults */
        }
      }
      stack.push(...node.children);
    }
  }

  private adoptMesh(mesh: THREE.Mesh): void {
    const extras = (mesh.userData ?? {}) as PartExtras;
    const role = extras.dl_role ?? 'crown_slab';
    const stage = extras.dl_visibility_stage ?? 'exterior';
    const className = (extras.dl_material_class ?? 'MAT_STRUCTURE') as MaterialClass;
    const classIndex = Math.max(0, MATERIAL_CLASSES.indexOf(className));
    const projection = PROJECTION_INDEX[extras.dl_projection ?? 'planar'] ?? 0;

    const translation = extras.dl_open_translation ?? [0, 0, 0];
    const rotation = extras.dl_open_rotation ?? [0, 0, 0];

    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: convergenceVert,
      fragmentShader: convergenceFrag,
      side: THREE.FrontSide,
      transparent: false,
      uniforms: {
        uField: { value: null },
        uTime: { value: 0 },
        uBoundsMin: { value: this.boundsMin },
        uBoundsMax: { value: this.boundsMax },
        uTunnelSpan: { value: this.tunnelSpan },
        uProjection: { value: projection },
        uReaction: { value: extras.dl_reaction ?? 0.4 },
        uDisplace: { value: 0.014 },

        uYield: { value: 0 },
        uYieldTranslation: { value: new THREE.Vector3().fromArray(translation) },
        uYieldRotation: { value: new THREE.Vector3().fromArray(rotation) },
        uYieldSpin: { value: THREE.MathUtils.degToRad(extras.dl_yield_spin_deg ?? 0) },

        uVoid: { value: PALETTE.void },
        uStructure: { value: PALETTE.structure },
        uRaisedBlack: { value: PALETTE.raisedBlack },
        uTeal: { value: PALETTE.teal },
        uCyan: { value: PALETTE.cyan },
        uColdWhite: { value: PALETTE.coldWhite },
        uMagenta: { value: PALETTE.magenta },
        uAmber: { value: PALETTE.amber },

        uClass: { value: classIndex },
        uProgress: { value: 0 },
        uEmissive: { value: 1 },
        uWake: { value: 0 },
        uRetained: { value: 0 },
        uOpacity: { value: 1 },
        uFogDensity: { value: 0.05 },
        uFogColor: { value: PALETTE.void.clone() },
        uKeyDir: { value: new THREE.Vector3(0, 0.82, 0.42).normalize() },
        uKeyIntensity: { value: 1 },
        uRimDir: { value: new THREE.Vector3(0, 0.32, -0.9).normalize() },
        uRimIntensity: { value: 1.35 },
        uFillIntensity: { value: 1 },
      },
    });

    mesh.material = material;
    mesh.frustumCulled = false;

    const part: Part = {
      mesh,
      material,
      role,
      stage,
      stageFrom: extras.dl_stage_from ?? 0,
      stageTo: extras.dl_stage_to ?? 1,
    };

    this.parts.push(part);
    this.materials.push(material);
    const bucket = this.byRole.get(role) ?? [];
    bucket.push(part);
    this.byRole.set(role, bucket);

  }

  bindField(texture: THREE.Texture): void {
    for (const material of this.materials) {
      material.uniforms.uField.value = texture;
    }
  }

  /**
   * Visibility staging. Parts are switched, never crossfaded — the
   * directive is explicit that transparent geometry must not be faded
   * across, and a hard switch behind camera occlusion is invisible
   * anyway. The margin lets a part appear slightly before its window so
   * it is never seen popping into an empty frame.
   */
  private applyStages(progress: number): void {
    const margin = 0.04;
    for (const part of this.parts) {
      const visible =
        progress >= part.stageFrom - margin && progress <= part.stageTo + margin;
      part.mesh.visible = visible;
    }
  }

  /**
   * Narrative update. Everything the site can change about the entity
   * passes through here.
   */
  setProgress(progress: number, yieldAmount: number): void {
    this.applyStages(progress);

    // Retained consequence only ever rises. The magenta a visitor sees
    // at the seam is the accumulation of the whole descent, which is
    // the point of never reseeding the field.
    this.retained = Math.max(this.retained, Math.min(progress * 1.15, 1));

    for (const part of this.parts) {
      const uniforms = part.material.uniforms;
      uniforms.uProgress.value = progress;
      uniforms.uRetained.value = this.retained;
      // Only the crown yields; rings take their authored spin.
      uniforms.uYield.value =
        part.role === 'crown_slab' || part.role === 'convergence_ring'
          ? yieldAmount
          : 0;
    }
  }

  /**
   * The foundation movement's three layers.
   *
   * Directive 9.6 is explicit that the complete entity must not be
   * exploded. So this separates the CONTINUATION RING GROUPS along the
   * travel axis only — the three groups the corridor is already built
   * in — and dims the two that are not selected. The crown, the shell
   * and the Latent Form never move.
   */
  setSeparation(amount: number, focus: [number, number, number]): void {
    const groups = ['NEAR', 'MID', 'FAR'];
    const rings = this.byRole.get('convergence_ring') ?? [];
    for (const part of rings) {
      const index = groups.findIndex((name) =>
        part.mesh.name.toUpperCase().includes(name)
      );
      if (index < 0) continue;
      // Spread along +Y, the corridor's own axis, so the groups pull
      // apart in depth ahead of the camera rather than sideways.
      part.mesh.position.y = (index - 1) * amount * 1.6;
      part.material.uniforms.uReaction.value =
        (part.mesh.userData?.dl_reaction ?? 0.55) *
        (0.35 + 0.65 * (focus[index] ?? 1));
    }
  }

  setLighting(state: {
    keyDir: [number, number, number];
    emissive: number;
    wake: number;
    fog: number;
    keyIntensity: number;
    rimIntensity: number;
    fillIntensity: number;
    displace: number;
  }): void {
    for (const material of this.materials) {
      const uniforms = material.uniforms;
      (uniforms.uKeyDir.value as THREE.Vector3).fromArray(state.keyDir).normalize();
      uniforms.uEmissive.value = state.emissive;
      uniforms.uWake.value = state.wake;
      uniforms.uFogDensity.value = state.fog;
      uniforms.uKeyIntensity.value = state.keyIntensity;
      uniforms.uRimIntensity.value = state.rimIntensity;
      uniforms.uFillIntensity.value = state.fillIntensity;
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
    const spanZ = Math.max(this.boundsMax.z - this.boundsMin.z, 0.001);
    return [(x - this.boundsMin.x) / spanX, (y - this.boundsMin.z) / spanZ];
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
