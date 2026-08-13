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
export const CORE_GLOW = { base: 1.75, flare: 3.6 };

/** The instanced ejecta field along the corridor. */
export const EJECTA = { perGeometry: 56, geometries: 8, reach: 29.0 };

/** The particulate tier: dust and fragment mist filling the funnel. */
export const DUST = { count: 5200, reach: 30.0, size: 0.055, opacity: 0.42 };

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
  private dustTexture: THREE.CanvasTexture | null = null;
  private dustMaterial: THREE.PointsMaterial | null = null;

  constructor(options: PlanetModelOptions) {
    // The authored +X corridor onto the site's diagonal.
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), options.axis.clone().normalize());
    this.group.add(this.inner);

    this.uniforms = {
      uStarPos: { value: options.starPosition.clone() },
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
    // Not a lamp. The first version shaded by facing alone, and through a
    // wound the interior read as a clean white bulb — the directive's named
    // fault. This is layered rupture heat: convection cells of uneven
    // luminosity (two warped wave families, so no banding), white-hot only
    // where the hottest cells face the eye, orange-yellow molten across the
    // mid, deep cooling red toward the limb of the opening. The flare drives
    // the whole gradient toward white, so the finale keeps its escalation.
    this.coreMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.coreUniforms,
      vertexShader: /* glsl */ `
        out vec3 vNormal;
        out vec3 vView;
        out vec3 vLocal;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - world.xyz);
          vLocal = position;
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
        in vec3 vLocal;
        out vec4 fragColour;
        void main() {
          float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
          float bend = 1.7 * sin(vLocal.y * 0.9 + vLocal.x * 0.5);
          float cells = sin(vLocal.x * 2.3 + bend) * sin(vLocal.y * 2.0 - bend)
                      + 0.6 * sin(vLocal.z * 3.4 + bend * 1.3) * sin(vLocal.x * 2.9 - vLocal.z * 1.1);
          float turbulence = clamp(0.5 + 0.31 * cells, 0.0, 1.0);
          float energy = (uCoreBase + uFlare * uCoreFlare)
                       * (0.30 + 0.70 * pow(facing, 1.5))
                       * (0.45 + 0.85 * turbulence);
          vec3 colour = mix(vec3(0.55, 0.10, 0.02), vec3(1.0, 0.52, 0.14),
                            clamp(energy * 0.60, 0.0, 1.0));
          colour = mix(colour, vec3(1.0, 0.96, 0.90),
                       clamp((energy - 1.55) * 0.60, 0.0, 0.85) * (0.30 + 0.70 * turbulence));
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
        const funnel = (1.2 + 6.5 * t) * (0.25 + random() * 0.75);
        const swing = random() * Math.PI * 2;

        position.set(along, Math.sin(swing) * funnel, Math.cos(swing) * funnel);
        euler.set(random() * 6.28, random() * 6.28, random() * 6.28);
        quaternion.setFromEuler(euler);
        // Two shard populations: mist-fine and hand-sized. One band read as
        // gravel poured at a single scale; two read as a breakup.
        const s = random() < 0.62 ? 0.05 + random() * 0.12 : 0.16 + random() * 0.26;
        scale.set(s, s, s);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      this.ejecta.add(mesh);
    }

    this.buildDust(random);
    this.inner.add(this.ejecta);
  }

  /**
   * The smallest tier: particulate dust down the whole funnel, one Points
   * draw. This is what makes the corridor a volume with air in it rather
   * than objects on black — every earlier version read as "a trail of
   * chunks" partly because nothing existed between chunk-size and nothing.
   * Lives inside the ejecta group so the flare carries it with the rest.
   */
  private buildDust(random: () => number): void {
    const positions = new Float32Array(DUST.count * 3);
    const colours = new Float32Array(DUST.count * 3);

    for (let i = 0; i < DUST.count; i++) {
      const t = Math.pow(random(), 1.3) * DUST.reach;
      // The same cone the chunks obey, filled by area so the middle is not
      // artificially dense, with a soft edge so the funnel has no skin.
      const cone = (0.9 + 0.26 * t) * 1.15;
      const radial = cone * Math.sqrt(random()) * (0.35 + 0.65 * random());
      const swing = random() * Math.PI * 2;
      positions[i * 3] = 1.5 + t;
      positions[i * 3 + 1] = Math.sin(swing) * radial;
      positions[i * 3 + 2] = Math.cos(swing) * radial;

      // Warm near the rupture, grey and dim by the corridor's end — the same
      // cooling journey the solid debris makes.
      const heat = Math.max(0, 1 - t / DUST.reach) * (0.4 + 0.6 * random());
      const shade = 0.22 + 0.5 * random();
      colours[i * 3] = shade * (0.75 + 0.55 * heat);
      colours[i * 3 + 1] = shade * (0.55 + 0.25 * heat);
      colours[i * 3 + 2] = shade * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

    // A soft round sprite, generated rather than shipped: an untextured
    // Points pass draws squares, and 5,000 additive squares read as noise.
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const ctx = sprite.getContext('2d');
    if (ctx) {
      const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.45, 'rgba(255,255,255,0.4)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 32, 32);
    }
    this.dustTexture = new THREE.CanvasTexture(sprite);

    this.dustMaterial = new THREE.PointsMaterial({
      size: DUST.size,
      sizeAttenuation: true,
      map: this.dustTexture,
      vertexColors: true,
      transparent: true,
      opacity: DUST.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const dust = new THREE.Points(geometry, this.dustMaterial);
    dust.frustumCulled = false;
    this.ejecta.add(dust);
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
    // The dust is additive and has no exposure uniform of its own; without
    // this it would hang at full brightness through the cold open.
    if (this.dustMaterial) this.dustMaterial.opacity = DUST.opacity * value;
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
    this.dustMaterial?.dispose();
    this.dustTexture?.dispose();
    this.inner.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) object.geometry.dispose();
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
  }
}
