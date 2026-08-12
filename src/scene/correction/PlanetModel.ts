import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import planetVert from '../../shaders/planet-fragment.vert.glsl?raw';
import planetFrag from '../../shaders/planet-fragment.frag.glsl?raw';

/**
 * PlanetModel — the ruptured world, staged from its own manifest.
 *
 * The geometry and the layout are authored together in
 * `tools/blender/build-planet.py` (v2, after Jacob's reference script): one
 * wounded shell of a planet, five curved crust slabs that visibly came off it,
 * sixteen solid chunks down the corridor, and crack tubes across the surviving
 * crust. Node transforms carry the staging; `planet-manifest.json` carries
 * what the runtime needs to know — the stops, their extents, the corridor
 * axis. This file places nothing by formula: it loads a scene that was
 * composed, and drives it.
 *
 * Everything is authored along +X. The whole group is rotated onto the site's
 * diagonal funnel axis here, so no world axis ever aligns with the blast and
 * the manifest stays readable.
 *
 * The light architecture is the reference script's: an incandescent core
 * mesh sits INSIDE the hollow body, so the source is occluded by crust and
 * pours out of the wounds — shaped light. The volumetric halo pass behind the
 * meshes carries the aureole around the silhouette; this core carries the
 * interior. Between them, the glow Jacob approved twice is back without the
 * whiteout he rejected once.
 */

export interface PlanetModelOptions {
  /** Where the fragments were thrown. Unit vector, world space. */
  axis: THREE.Vector3;
  /** The source, in world space. */
  starPosition: THREE.Vector3;
}

interface ManifestEntry {
  name: string;
  position: [number, number, number];
  extent: number;
}

interface Manifest {
  bodyRadius: number;
  coreRadius: number;
  stops: ManifestEntry[];
  mediums: ManifestEntry[];
}

export interface Piece {
  mesh: THREE.Object3D;
  /** Rest position in the authored (local) frame. */
  home: THREE.Vector3;
  /** Continuation direction, local frame, applied by the flare. */
  drift: THREE.Vector3;
  spin: THREE.Vector3;
  extent: number;
  kind: 'body' | 'slab' | 'chunk' | 'crack';
}

/** A stop the rail can visit, in world space. */
export interface Stop {
  name: string;
  home: THREE.Vector3;
  extent: number;
}

/** Material response. On sliders; these are the shipped defaults. */
export const MATERIAL = { heat: 1.1, crustLight: 1.0, rim: 0.9 };

/** The core's emission, and how much the flare drives it. */
export const CORE_GLOW = { base: 2.1, flare: 3.6 };

/** The instanced ejecta field along the corridor. */
export const EJECTA = { perGeometry: 34, geometries: 6, reach: 27.0 };

/** mulberry32 — staging jitter must be identical on every machine and visit. */
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

/** Blender world (Z-up) to glTF/Three world (Y-up), as the exporter maps it. */
const yUp = (p: [number, number, number]): THREE.Vector3 =>
  new THREE.Vector3(p[0], p[2], -p[1]);

export class PlanetModel {
  readonly group = new THREE.Group();

  private readonly inner = new THREE.Group();
  private readonly ejecta = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly coreMaterial: THREE.ShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly coreUniforms: Record<string, THREE.IUniform>;
  private readonly pieces: Piece[] = [];
  private readonly scratch = new THREE.Vector3();
  private stopsWorld: Stop[] = [];

  constructor(options: PlanetModelOptions) {
    // The authored +X corridor onto the site's diagonal.
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), options.axis.clone().normalize());
    this.group.add(this.inner);

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

    // The interior, as its own material: a body of light the crust occludes.
    // Facing-dependent so the centre burns hotter than the limb — an
    // overpressured volume, not a painted ball.
    this.coreUniforms = {
      uFlare: { value: 0 },
      uExposure: { value: 1 },
      uCoreBase: { value: CORE_GLOW.base },
      uCoreFlare: { value: CORE_GLOW.flare },
    };
    this.coreMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.coreUniforms,
      vertexShader: /* glsl */ `
        out vec3 vNormal;
        out vec3 vView;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uFlare;
        uniform float uExposure;
        uniform float uCoreBase;
        uniform float uCoreFlare;
        in vec3 vNormal;
        in vec3 vView;
        out vec4 fragColour;
        void main() {
          float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
          float energy = (uCoreBase + uFlare * uCoreFlare) * (0.35 + 0.65 * pow(facing, 1.6));
          vec3 colour = mix(vec3(1.0, 0.52, 0.16), vec3(1.0, 0.96, 0.9), clamp(energy * 0.5, 0.0, 0.85));
          fragColour = vec4(colour * energy * uExposure, 1.0);
        }
      `,
      side: THREE.FrontSide,
    });
  }

  async load(base = `${import.meta.env.BASE_URL}models/`): Promise<void> {
    const [gltf, manifest] = await Promise.all([
      new GLTFLoader().loadAsync(`${base}planet.glb`),
      fetch(`${base}planet-manifest.json`).then((r) => r.json() as Promise<Manifest>),
    ]);

    const random = mulberry32(0x517a9e3b);
    const chunkGeometries: THREE.BufferGeometry[] = [];

    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      const name = object.name;
      const kind: Piece['kind'] = name.startsWith('slab')
        ? 'slab'
        : name.startsWith('chunk')
          ? 'chunk'
          : name.startsWith('crack')
            ? 'crack'
            : 'body';

      const mesh = new THREE.Mesh(object.geometry, this.material);
      mesh.position.copy(object.position);
      mesh.quaternion.copy(object.quaternion);
      mesh.scale.copy(object.scale);
      this.inner.add(mesh);

      if (kind === 'chunk') chunkGeometries.push(object.geometry);

      const home = object.position.clone();
      const still = kind === 'body' || kind === 'crack';
      this.pieces.push({
        mesh,
        home,
        // Continuation, in the authored frame: on down the corridor and out of
        // it, faster for what is already furthest. The body and its cracks
        // hold — the event leaves them behind.
        drift: still
          ? new THREE.Vector3()
          : home.clone().normalize().multiplyScalar(0.5 + home.length() * 0.06),
        spin: still
          ? new THREE.Vector3()
          : new THREE.Vector3(
              (random() - 0.5) * 0.01,
              (random() - 0.5) * 0.01,
              (random() - 0.5) * 0.01
            ),
        extent: 1,
        kind,
      });
    });

    // The interior. Slightly under the manifest's core radius so it never
    // z-fights the inner lining of the shell.
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(manifest.coreRadius * 0.96, 3),
      this.coreMaterial
    );
    this.inner.add(core);

    // The stops, transformed into world space for the rail.
    this.stopsWorld = manifest.stops.map((stop) => ({
      name: stop.name,
      home: yUp(stop.position).applyQuaternion(this.group.quaternion),
      extent: stop.extent,
    }));

    this.buildEjecta(chunkGeometries, random);
  }

  /** Small shards along the corridor, instanced from the authored chunks. */
  private buildEjecta(geometries: THREE.BufferGeometry[], random: () => number): void {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();

    for (const geometry of geometries.slice(0, EJECTA.geometries)) {
      const mesh = new THREE.InstancedMesh(geometry, this.material, EJECTA.perGeometry);
      mesh.frustumCulled = false;

      for (let i = 0; i < EJECTA.perGeometry; i++) {
        const t = Math.pow(random(), 1.5);
        const along = 4.5 + EJECTA.reach * t;
        const funnel = (0.9 + 5.5 * t) * (0.25 + random() * 0.75);
        const swing = random() * Math.PI * 2;

        position.set(along, Math.sin(swing) * funnel, Math.cos(swing) * funnel);
        euler.set(random() * 6.28, random() * 6.28, random() * 6.28);
        quaternion.setFromEuler(euler);
        const s = 0.1 + random() * 0.24;
        scale.set(s, s, s);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      this.ejecta.add(mesh);
    }

    this.inner.add(this.ejecta);
  }

  /** The rail's destinations, world space, in authored (near→far) order. */
  get stops(): Stop[] {
    return this.stopsWorld;
  }

  /**
   * The finale: everything already moving keeps moving along its own line,
   * the interior's output climbs, and the body holds — a continuation of the
   * event, driven by scroll and therefore exactly reversible.
   */
  setFlare(value: number): void {
    const flare = Math.max(0, Math.min(1, value));
    this.uniforms.uFlare.value = flare;
    this.coreUniforms.uFlare.value = flare;
    for (const piece of this.pieces) {
      if (piece.kind === 'body' || piece.kind === 'crack') continue;
      this.scratch.copy(piece.home).addScaledVector(piece.drift, flare);
      piece.mesh.position.copy(this.scratch);
    }
    this.ejecta.position.set(flare * 2.2, 0, 0);
  }

  /** Heavy, slow. A slab turns a few degrees in the time anyone watches. */
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
    this.coreUniforms.uExposure.value = value;
  }

  tune(patch: Record<string, number>): void {
    for (const [key, value] of Object.entries(patch)) {
      if (this.uniforms[key]) this.uniforms[key].value = value;
      if (this.coreUniforms[key]) this.coreUniforms[key].value = value;
    }
  }

  dispose(): void {
    this.material.dispose();
    this.coreMaterial.dispose();
    this.inner.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
  }
}
