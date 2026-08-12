import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import planetVert from '../../shaders/planet-fragment.vert.glsl?raw';
import planetFrag from '../../shaders/planet-fragment.frag.glsl?raw';

/**
 * PlanetModel — the ruptured world, as real geometry.
 *
 * Thirty-eight authored fragments from `tools/blender/build-planet.py`: one
 * displaced sphere cut into Voronoi cells, so every piece has genuine crustal
 * relief, genuine thickness, and break faces that expose a cross-section when
 * it turns. Each vertex carries a crust mark — 1 on the original planetary
 * surface, 0 on a face made by the break — and the shader lights only the
 * breaks.
 *
 * Why authored rather than generated: procedural primitives produced ribbons
 * that read as a cutting board, lamellae that read as anatomy, an implicit
 * field that read as skin disease, and fragments that read as gridded boxes.
 * Founder ruling, 2026-08-12: a dying planet is a form problem, we know what
 * the form is, so author it and let the code do placement, drift, the rail,
 * the shader and the flare. Meshes in glTF are still live geometry — flown
 * through, rotated, shaded, thrown further apart — which is the distinction
 * my earlier objection failed to make.
 *
 * The hierarchy the brief demands is produced here rather than in Blender,
 * because it is a placement decision: the largest pieces stay near where they
 * began so the planetary silhouette survives, and everything else is thrown
 * down the blast corridor by size — the smaller it is, the further it got.
 */

export interface PlanetModelOptions {
  /** Where the fragments were thrown. Unit vector. */
  axis: THREE.Vector3;
  /** The source, in world space. */
  starPosition: THREE.Vector3;
}

/**
 * How much of the body stays recognisable.
 *
 * The brief asks for 55–70% of the planetary silhouette to remain inferable.
 * These are the ranks that hold their original position, opened outward just
 * enough to let the interior light out between them.
 */
export const CORE_PIECES = 14;

/** How far the held pieces drift off their rest positions. */
export const CORE_SPREAD = 0.42;

/** The blast corridor: how far the thrown pieces travel, by rank. */
export const THROW = { near: 3.4, far: 26.0, spread: 5.2 };

/** Material response. */
/**
 * Material response.
 *
 * Bracketed by two failures. With the crust mark topping out at half, the
 * whole world glowed amber — every surface reading as half a fracture. With
 * it corrected but the crust unlit, the pieces vanished into the void and only
 * one break face survived. The crust needs just enough response to hold a
 * silhouette against black; the heat belongs to the breaks.
 */
export const MATERIAL = { heat: 1.05, crustLight: 3.4, rim: 3.2 };

/** The planet's own radius once staged. Everything else scales off it. */
export const WORLD_SCALE = 3.1;

export interface Piece {
  mesh: THREE.Mesh;
  /** Rest position on the intact planet, scaled to world. */
  rest: THREE.Vector3;
  /** Where it sits now, after being thrown. */
  home: THREE.Vector3;
  /** Direction and rate it continues to travel when the flare drives on. */
  drift: THREE.Vector3;
  /** Seeded slow tumble. */
  spin: THREE.Vector3;
  /** Rough radius, for the camera to stand off by. */
  extent: number;
  /** 0 for the largest fragment, rising with rank. */
  rank: number;
}

/** mulberry32 — the placement must be identical on every machine and visit. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PlanetModel {
  readonly group = new THREE.Group();
  readonly pieces: Piece[] = [];

  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly axis: THREE.Vector3;
  private readonly scratch = new THREE.Vector3();

  constructor(options: PlanetModelOptions) {
    this.axis = options.axis.clone().normalize();

    this.uniforms = {
      uStarPos: { value: options.starPosition.clone() },
      uRecord: { value: new THREE.Color('#e7dcba') },
      uHeat: { value: MATERIAL.heat },
      uCrustLight: { value: MATERIAL.crustLight },
      uRim: { value: MATERIAL.rim },
      uFlare: { value: 0 },
      uExposure: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: planetVert,
      fragmentShader: planetFrag,
      uniforms: this.uniforms,
      vertexColors: true,
      side: THREE.FrontSide,
    });
  }

  /**
   * Loads the authored fragments and stages them.
   *
   * Resolves once the world exists, so the loader can report real work rather
   * than counting down a timer.
   */
  async load(url = `${import.meta.env.BASE_URL}models/planet.glb`): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);

    const source: Array<{ geometry: THREE.BufferGeometry; rest: THREE.Vector3 }> = [];
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        source.push({ geometry: object.geometry, rest: object.position.clone() });
      }
    });

    // Blender emits them in build order; rank them by size, because every
    // decision below — held or thrown, how far, which are camera stops — is a
    // decision about scale.
    source.sort((a, b) => {
      a.geometry.computeBoundingSphere();
      b.geometry.computeBoundingSphere();
      return (b.geometry.boundingSphere?.radius ?? 0) - (a.geometry.boundingSphere?.radius ?? 0);
    });

    const random = mulberry32(0x9e3779b9);

    source.forEach((entry, rank) => {
      const { geometry, rest } = entry;
      geometry.computeBoundingSphere();
      const extent = (geometry.boundingSphere?.radius ?? 0.2) * WORLD_SCALE;

      const restWorld = rest.clone().multiplyScalar(WORLD_SCALE);
      const outward = restWorld.clone().normalize();
      const home = restWorld.clone();

      if (rank < CORE_PIECES) {
        // The body that survives. Opened along its own radius only — the
        // silhouette has to stay readable as a sphere that came apart, and a
        // piece pushed sideways stops describing where it used to be.
        home.addScaledVector(outward, CORE_SPREAD * (0.25 + random()) * (rank / CORE_PIECES));
      } else {
        // Thrown. Smaller pieces got further, which is both true and what
        // makes the corridor read as one ballistic event rather than a
        // scatter: size falls off with distance down the axis.
        const t = (rank - CORE_PIECES) / Math.max(source.length - CORE_PIECES - 1, 1);
        const eased = t * t * 0.75 + t * 0.25;
        home.addScaledVector(this.axis, THROW.near + (THROW.far - THROW.near) * eased);
        home.addScaledVector(outward, THROW.spread * eased * (0.4 + random() * 0.9));
        // Lateral wander, so the corridor is a broad funnel and not a line.
        home.x += (random() - 0.5) * THROW.spread * eased;
        home.y += (random() - 0.5) * THROW.spread * eased * 0.7;
        home.z += (random() - 0.5) * THROW.spread * eased;
      }

      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.scale.setScalar(WORLD_SCALE);
      mesh.position.copy(home);
      mesh.rotation.set(random() * 6.28, random() * 6.28, random() * 6.28);
      mesh.frustumCulled = true;

      this.group.add(mesh);
      this.pieces.push({
        mesh,
        rest: restWorld,
        home,
        // Continuation: away from the source along the line it already
        // travelled, faster for what is already furthest out.
        drift: home.clone().normalize().multiplyScalar(0.4 + home.length() * 0.055),
        spin: new THREE.Vector3(
          (random() - 0.5) * 0.012,
          (random() - 0.5) * 0.012,
          (random() - 0.5) * 0.012
        ),
        extent,
        rank,
      });
    });
  }

  /** The stops a scroll journey can visit: the biggest thrown pieces, in order. */
  get stops(): Piece[] {
    return this.pieces.filter((p) => p.rank >= CORE_PIECES).slice(0, 5);
  }

  /**
   * The finale. Every piece continues along the line it was already
   * travelling, so the explosion reads as ongoing rather than as a new event.
   */
  setFlare(value: number): void {
    const flare = Math.max(0, Math.min(1, value));
    this.uniforms.uFlare.value = flare;
    for (const piece of this.pieces) {
      this.scratch.copy(piece.home).addScaledVector(piece.drift, flare);
      piece.mesh.position.copy(this.scratch);
    }
  }

  /**
   * Ambient tumble. Massive objects: the rate is set so a fragment turns a few
   * degrees over the time anyone looks at it, which is the difference between
   * suspended wreckage and a frozen render.
   */
  setTime(seconds: number): void {
    for (const piece of this.pieces) {
      piece.mesh.rotation.x += piece.spin.x * 0.016;
      piece.mesh.rotation.y += piece.spin.y * 0.016;
      piece.mesh.rotation.z += piece.spin.z * 0.016;
    }
    void seconds;
  }

  setExposure(value: number): void {
    this.uniforms.uExposure.value = value;
  }

  tune(patch: Record<string, number>): void {
    for (const [key, value] of Object.entries(patch)) {
      const uniform = this.uniforms[key];
      if (uniform) uniform.value = value;
    }
  }

  dispose(): void {
    this.material.dispose();
    for (const piece of this.pieces) piece.mesh.geometry.dispose();
  }
}
