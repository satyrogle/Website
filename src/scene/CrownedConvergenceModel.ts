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

/**
 * Stable per-part crack seed.
 *
 * Derived from the authored name rather than from position, so a mass
 * keeps its own fracture across reloads and across asset revisions that
 * move it. Two masses never share a pattern; the same mass never
 * changes one.
 */
function seedFromName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * The scroll band across which the portal opens — the approach into the
 * corridor, ending as the camera reaches the mouth. Each ring is offset
 * later than the one in front of it, so the band each ring actually
 * uses is this window shifted by its own stagger.
 */
const PORTAL_FROM = 0.08;
const PORTAL_TO = 0.30;

/** The corridor's travel axis, and so each ring's own spin axis. */
const RING_AXIS = new THREE.Vector3(0, 0, 1);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Gyre tiers, from the handoff pack's GyreController — the one file in
 * that pack whose numbers are correct as written, because it is the
 * only one authored against a seconds clock rather than milliseconds.
 * Three speeds, opposing directions, offset phases: never synchronised,
 * because synchronised rings read as a loading spinner.
 */
const GYRE_TIERS = [
  { speed: 0.085, direction: 1, phase: 0.0 },
  { speed: 0.053, direction: -1, phase: 2.1 },
  { speed: 0.110, direction: 1, phase: 4.4 },
];

interface GyreInstance {
  part: Part;
  tier: number;
  /** 1 inside the Crowned shell, ~0.15 inside the quieter Latent Form. */
  activity: number;
  baseQuaternion: THREE.Quaternion;
  baseZ: number;
}

interface RingInstance {
  part: Part;
  /** Ordered near to far — this is what staggers the iris. */
  index: number;
  baseQuaternion: THREE.Quaternion;
  baseScale: THREE.Vector3;
}

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
  dl_gyre_tier?: number;
  dl_gyre_activity?: number;
}

interface Part {
  mesh: THREE.Mesh;
  material: THREE.RawShaderMaterial;
  role: string;
  stage: string;
  stageFrom: number;
  stageTo: number;
  /** World-space Z of the part's nearest face, cached at load. */
  nearZ: number;
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

  private rings: RingInstance[] = [];
  private gyres: GyreInstance[] = [];
  /** Last narrative progress, so update() can drive the portal. */
  private progress = 0;

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

    // NO rotation here. The Blender export runs with export_yup, which
    // already maps Blender (x, y, z) to glTF (x, z, -y) — so "up" is
    // +Y and "into the entity" is -Z, which is exactly the site's world
    // and exactly what the camera rail was authored against. Rotating
    // again double-transformed everything: depths came out as Blender's
    // own axes and the whole entity culled itself out of frame.
    this.group.updateMatrixWorld(true);
    this.cacheDepths();
    this.measureSamplingSpaces();
    this.cacheRings();
  }

  /**
   * Measures the spaces the reaction field is sampled against, from the
   * geometry that actually loaded.
   *
   * The GLB carries `dl_exterior_bounds` and `dl_tunnel_span`, but both
   * are written in BLENDER's axes while the export runs `export_yup` —
   * so the corridor's depth arrives as Y when the runtime's depth is Z,
   * and the crown's bounds arrive transposed. Trusting them mapped the
   * corridor onto a single constant depth and the crown onto a sliver.
   *
   * Measuring here rather than fixing the exporter means the runtime
   * stays correct for any asset revision, including ones authored in a
   * different orientation.
   */
  private measureSamplingSpaces(): void {
    const TUNNEL_ROLES = new Set([
      'convergence_ring',
      'tunnel_shell',
      'threshold_chamber',
    ]);

    const box = new THREE.Box3();
    const crown = new THREE.Box3().makeEmpty();
    const tunnel = new THREE.Box3().makeEmpty();

    for (const part of this.parts) {
      box.setFromObject(part.mesh);
      if (box.isEmpty()) continue;
      if (part.role === 'crown_slab') crown.union(box);
      if (TUNNEL_ROLES.has(part.role)) tunnel.union(box);
    }

    // Fall back to the whole entity rather than to the baked defaults:
    // a wrong-but-plausible span is harder to spot than a wide one.
    if (crown.isEmpty()) {
      for (const part of this.parts) {
        box.setFromObject(part.mesh);
        if (!box.isEmpty()) crown.union(box);
      }
    }
    if (!crown.isEmpty()) {
      this.boundsMin.copy(crown.min);
      this.boundsMax.copy(crown.max);
    }

    // Near first, far second: the camera travels toward -Z.
    if (!tunnel.isEmpty()) {
      this.tunnelSpan.set(tunnel.max.z, tunnel.min.z);
    }

    // Crack frequency is expressed in entity widths, so it survives an
    // asset swap at a different scale without re-tuning the shader.
    const span = crown.isEmpty()
      ? 5.4
      : Math.max(...crown.getSize(new THREE.Vector3()).toArray());

    // Where the corridor leans. Measured from the core itself so the
    // pull light stays aimed if the Latent Form moves.
    const core = new THREE.Box3().makeEmpty();
    for (const part of this.parts) {
      if (part.role !== 'core' && part.role !== 'latent_seam') continue;
      box.setFromObject(part.mesh);
      if (!box.isEmpty()) core.union(box);
    }
    const coreZ = core.isEmpty()
      ? (tunnel.isEmpty() ? -11 : tunnel.min.z)
      : core.getCenter(new THREE.Vector3()).z;

    for (const material of this.materials) {
      material.uniforms.uCrackScale.value = 1 / Math.max(span, 1e-6);
      material.uniforms.uCoreZ.value = coreZ;
    }
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

  /**
   * Resolves a mesh's authored extras.
   *
   * The glTF exporter splits any object with more than one material
   * slot into separate primitives — `<name>_MESH`, `<name>_MESH_1` —
   * and those children carry NO extras; the properties stay on the
   * parent node. Reading `mesh.userData` alone therefore silently lost
   * the role, stage and reaction weight for every multi-material part,
   * which defaulted them to "crown slab, always visible" and left the
   * corridor empty while stray crown masses hung in frame.
   */
  private resolveExtras(mesh: THREE.Mesh): PartExtras {
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

    // A mesh with no resolvable role has no contract with this runtime,
    // and guessing one is worse than drawing nothing. The old fallback
    // was "crown slab, always visible", which has already cost this
    // build twice: once when the exporter split multi-material parts
    // and stranded their extras, leaving stray masses hanging in frame
    // and the corridor empty; and again with the Blender layout guides
    // DL_CameraPath / DL_CameraClearance, which shipped as renderable
    // geometry and only became visible once the crown had a hole in it.
    if (!extras.dl_role) {
      if (import.meta.env.DEV) {
        console.warn(
          `[entity] "${mesh.name}" has no dl_role — not rendered. ` +
            `Give it extras in the Blender build, or strip it from the asset.`
        );
      }
      mesh.visible = false;
      return;
    }

    const role = extras.dl_role;
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
      // Interior surfaces are single-skinned tubes and the camera flies
      // down the inside of them, where front-face culling would leave
      // the corridor completely empty.
      side:
        role === 'tunnel_shell' || role === 'threshold_chamber'
          ? THREE.DoubleSide
          : THREE.FrontSide,
      // The core is a light source, not a surface. Drawn additively and
      // without depth writes, its edge dissolves into the void; drawn
      // as opaque geometry it cuts a hard circle and reads as a plastic
      // ball once the camera gets close to it at the finale.
      transparent: className === 'MAT_CORE',
      blending:
        className === 'MAT_CORE' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: className !== 'MAT_CORE',
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
        uSeed: { value: seedFromName(mesh.name) },
        // Overwritten once the entity has been measured, below.
        uCrackScale: { value: 0.2 },
        uProgress: { value: 0 },
        uEmissive: { value: 1 },
        uWake: { value: 0 },
        uRetained: { value: 0 },
        uOpacity: { value: 1 },
        uPsy: { value: 0 },
        uDivinity: { value: 1 },
        uRingGain: { value: 1.3 },
        uSharp: { value: 0.5 },
        uCoreZ: { value: -11 },
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
      nearZ: 0,
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
  private applyStages(progress: number, cameraZ: number): void {
    const margin = 0.04;
    for (const part of this.parts) {
      const inWindow =
        progress >= part.stageFrom - margin && progress <= part.stageTo + margin;

      // Behind-camera cull. A part stops mattering once the camera has
      // passed it, and switching there is invisible — which is exactly
      // why the directive asks for occlusion switches rather than
      // crossfading transparent geometry. The slack keeps a part alive
      // slightly past the lens so nothing blinks out at the edge.
      const behind = part.nearZ > cameraZ + 1.2;

      part.mesh.visible = inWindow && !behind;
    }
  }

  /** Caches each part's nearest world Z once the graph is final. */
  private cacheDepths(): void {
    const box = new THREE.Box3();
    for (const part of this.parts) {
      box.setFromObject(part.mesh);
      part.nearZ = box.max.z;
    }
  }

  /**
   * Narrative update. Everything the site can change about the entity
   * passes through here.
   */
  setProgress(progress: number, yieldAmount: number, cameraZ = -99): void {
    this.progress = progress;
    this.applyStages(progress, cameraZ);

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
  /**
   * Focus the corridor on one of the three foundation layers.
   *
   * This matched ring names against NEAR / MID / FAR, which were the
   * names the RETIRED builder produced. The shipped rings are
   * DL_TunnelRing_00..10, so findIndex returned -1 for every one of
   * them and the whole method was a no-op — the accessible layer
   * tablist was wired all the way through to the entity and changed
   * nothing on the canvas.
   *
   * Grouping is now by depth order, which is data the runtime already
   * has from cacheRings() and which cannot drift from an asset rename.
   * The positional spread is gone: it was retired in ScrollDirector for
   * reading as unexplained drift, and moving corridor geometry along Y
   * was wrong anyway — the corridor's axis is Z.
   */
  setSeparation(_amount: number, focus: [number, number, number]): void {
    if (!this.rings.length) return;
    const perGroup = Math.ceil(this.rings.length / 3);
    for (const ring of this.rings) {
      const group = Math.min(Math.floor(ring.index / perGroup), 2);
      // resolveExtras, not mesh.userData: the exporter splits
      // multi-material parts into primitives whose userData is empty.
      const base = this.resolveExtras(ring.part.mesh).dl_reaction ?? 0.55;
      ring.part.material.uniforms.uReaction.value =
        base * (0.35 + 0.65 * (focus[group] ?? 1));
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
    psy: number;
    divinity: number;
    ring: number;
    sharp: number;
  }): void {
    for (const material of this.materials) {
      const uniforms = material.uniforms;
      uniforms.uPsy.value = state.psy;
      uniforms.uDivinity.value = state.divinity;
      uniforms.uRingGain.value = state.ring;
      uniforms.uSharp.value = state.sharp;
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

  /**
   * Caches each ring's authored transform, ordered near to far.
   *
   * The order is what makes the portal read: a staggered iris that
   * opens from the mouth inward is an aperture; every ring turning at
   * once is a machine.
   */
  private cacheRings(): void {
    const rings = (this.byRole.get('convergence_ring') ?? []).slice();
    rings.sort((a, b) => b.nearZ - a.nearZ); // nearest (largest Z) first
    const gyreParts = this.byRole.get('gyre') ?? [];
    this.gyres = gyreParts.map((part) => {
      const extras = this.resolveExtras(part.mesh) as PartExtras;
      return {
        part,
        tier: extras.dl_gyre_tier ?? 0,
        activity: extras.dl_gyre_activity ?? 1,
        baseQuaternion: part.mesh.quaternion.clone(),
        baseZ: part.mesh.position.z,
      };
    });

    this.rings = rings.map((part, index) => ({
      part,
      index,
      baseQuaternion: part.mesh.quaternion.clone(),
      baseScale: part.mesh.scale.clone(),
    }));
  }

  /**
   * Tunnel motion, and the portal.
   *
   * Two things run here. A perpetual alternating drift, so the corridor
   * is never still even at rest; and a staggered opening across the
   * approach, which is the portal.
   *
   * Rates are in RADIANS PER SECOND, because the runtime clock is
   * `getElapsedTime()`. The handoff pack's TunnelMotion used 0.00008,
   * which is one revolution per twenty-two hours — written against a
   * millisecond clock and silent rather than wrong-looking.
   *
   * Nothing here touches Z. Rings sliding toward the camera while the
   * camera advances is motion the visitor did not cause, and it is what
   * made the old tunnel exit feel wrong.
   */
  private updateTunnel(time: number, progress: number): void {
    if (!this.rings.length) return;

    const spin = new THREE.Quaternion();
    const count = this.rings.length;

    for (const ring of this.rings) {
      const { index, part } = ring;
      const direction = index % 2 === 0 ? 1 : -1;

      // Perpetual, unsynchronised, and slow enough to sit under notice.
      const rate = 0.020 + (index % 3) * 0.007;
      let angle = direction * time * rate;

      // The portal. Each ring starts opening slightly later than the one
      // in front of it, so the aperture unwinds down the shaft rather
      // than snapping open as a unit.
      const stagger = (index / count) * 0.10;
      const open = smoothstep(
        PORTAL_FROM + stagger,
        PORTAL_TO + stagger,
        progress
      );
      angle += direction * open * 0.62;

      // Compose about the ring's OWN axis, so this survives whatever
      // orientation the exporter baked into the node.
      spin.setFromAxisAngle(RING_AXIS, angle);
      part.mesh.quaternion.copy(ring.baseQuaternion).multiply(spin);

      // Asynchronous breathing, plus the opening widening the aperture.
      const breath = Math.sin(time * 0.22 + index * 1.618) * 0.012;
      const s = 1 + breath + open * 0.09;
      part.mesh.scale.set(
        ring.baseScale.x * s,
        ring.baseScale.y * s,
        ring.baseScale.z
      );
    }
  }

  /**
   * The internal ring system.
   *
   * Barely turning at rest, rising with approach. The Latent Form runs
   * the same system at about 15%: it is the same species, older and
   * quieter. Rotation composes onto each gyre's authored orientation
   * about its own axis, so it survives whatever the exporter baked in.
   */
  private updateGyres(time: number, progress: number): void {
    if (!this.gyres.length) return;
    const spin = new THREE.Quaternion();
    // Activity rises across the approach and holds once inside.
    const approach = smoothstep(0.02, 0.42, progress);

    for (const gyre of this.gyres) {
      const tier = GYRE_TIERS[gyre.tier % GYRE_TIERS.length];
      const act = gyre.activity * Math.max(approach, 0.08);
      const angle =
        tier.phase + time * tier.speed * tier.direction * (0.08 + 0.92 * act);
      spin.setFromAxisAngle(RING_AXIS, angle);
      gyre.part.mesh.quaternion.copy(gyre.baseQuaternion).multiply(spin);
      // A shallow asynchronous bob, so the tiers never sit as a stack.
      gyre.part.mesh.position.z =
        gyre.baseZ + Math.sin(time * 0.31 + tier.phase) * 0.018 * act;
    }
  }

  update(time: number): void {
    for (const material of this.materials) {
      material.uniforms.uTime.value = time;
    }
    if (!this.reducedMotion) {
      this.updateTunnel(time, this.progress);
      this.updateGyres(time, this.progress);
    }
  }

  /** Maps a world XY point into the planar field's UV space. */
  fieldUvFromWorld(x: number, y: number): [number, number] {
    const spanX = Math.max(this.boundsMax.x - this.boundsMin.x, 0.001);
    // Y, not Z. The shader's planar branch samples X/Y
    // (convergence.vert.glsl), but this mirror still fed a world Y
    // coordinate through the Z origin and the Z span — so a click
    // bloomed about a sixth of the crown's height above the cursor, and
    // the top of the crown mapped past v = 1.1 and was silently
    // discarded by the caller's guard.
    const spanY = Math.max(this.boundsMax.y - this.boundsMin.y, 0.001);
    return [(x - this.boundsMin.x) / spanX, (y - this.boundsMin.y) / spanY];
  }

  /** Dev diagnostic: why each part is or is not on screen. */
  describe(progress: number, cameraZ: number): unknown[] {
    return this.parts.map((p) => ({
      name: p.mesh.name,
      role: p.role,
      from: p.stageFrom,
      to: p.stageTo,
      nearZ: +p.nearZ.toFixed(2),
      inWindow: progress >= p.stageFrom - 0.04 && progress <= p.stageTo + 0.04,
      behind: p.nearZ > cameraZ + 1.2,
      visible: p.mesh.visible,
    }));
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
