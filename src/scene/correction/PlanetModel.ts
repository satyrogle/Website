import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
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
  plates?: ManifestEntry[];
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
  kind: 'body' | 'slab' | 'chunk' | 'crack' | 'plate';
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
export const CORE_GLOW = { base: 2.8, flare: 4.2 };

/** The instanced ejecta field along the corridor. */
export const EJECTA = { perGeometry: 56, geometries: 8, reach: 29.0 };

/**
 * The particulate tier: dust and fragment mist filling the funnel.
 *
 * Two populations, because one size of mote at any count reads as grain on
 * the lens rather than as matter in the corridor: `haze` is the air, far
 * below the threshold of individual visibility, and `motes` are grit close
 * enough to be seen as separate objects catching the rupture's light.
 */
export const DUST = {
  reach: 30.0,
  haze: { count: 17000, size: 0.05, opacity: 0.19 },
  motes: { count: 3200, size: 0.13, opacity: 0.32 },
  /** Share of each population that gathers into streaks rather than filling evenly. */
  clumped: 0.66,
  /** How many streaks the field is drawn into. */
  streaks: 34,
};

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

/**
 * A unit direction for thrown matter, in the authored frame: drawn around
 * the whole sphere, weighted toward the rupture hemisphere (+X) where most
 * of the mass left. Sixty-some percent lands rupture-side; the far side
 * still sheds — a body coming apart has no quiet half.
 */
function radialDirection(out: THREE.Vector3, random: () => number): THREE.Vector3 {
  // Gaussian-ish components via sums of uniforms — enough isotropy here.
  const g = () => random() + random() + random() - 1.5;
  out.set(g(), g(), g());
  if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
  out.normalize();
  if (random() < 0.62) out.x = Math.abs(out.x) * 1.35 + 0.25;
  return out.normalize();
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
  private platesWorld: Stop[] = [];
  private dustTexture: THREE.CanvasTexture | null = null;
  private dustMaterials: { material: THREE.PointsMaterial; opacity: number }[] = [];
  private core: THREE.Mesh | null = null;

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
    // THE INTERIOR HAS NO SURFACE. Every version until now put a sphere
    // here — a mesh with a silhouette — and a sphere is a thing you can
    // point at: "there's the core", and the crust around it becomes an
    // eggshell peeling off a reactor. Jacob, exactly: delete the visible
    // core sphere completely.
    //
    // So this is a volume, not an object. It renders on the INSIDE of an
    // oversized shell, which puts its depth beyond the plates so any plate
    // occludes it and it can only be seen through real gaps; it is additive,
    // so it is light rather than material; and its brightness is a function
    // of how near the sightline passes to the centre, falling smoothly to
    // nothing long before the shell it is drawn on. There is no radius at
    // which it stops — nothing for the eye to find an edge on.
    //
    // Structure without a surface: turbulence sampled along the sightline
    // gives it filaments and pressure cells, and the one blackbody ramp
    // still runs ember -> orange -> white so it belongs to the same fire as
    // every break face.
    this.coreMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.coreUniforms,
      vertexShader: /* glsl */ `
        out vec3 vWorld;
        out vec3 vCentre;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          // Carried from here because modelMatrix is a vertex-stage
          // built-in: reaching for it in the fragment shader fails the whole
          // program, and a failed program is an invisible one — the interior
          // simply was not being drawn.
          vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uFlare;
        uniform float uExposure;
        uniform float uCoreBase;
        uniform float uCoreFlare;
        in vec3 vWorld;
        in vec3 vCentre;
        out vec4 fragColour;

        // One temperature ramp for everything: deep ember, through orange,
        // into yellow-white. Premium is one consistent physics, not many
        // painted colours.
        vec3 ramp(float t) {
          vec3 c = mix(vec3(0.32, 0.05, 0.01), vec3(1.0, 0.42, 0.08), clamp(t * 1.4, 0.0, 1.0));
          c = mix(c, vec3(1.0, 0.85, 0.55), clamp((t - 0.75) * 2.2, 0.0, 1.0));
          return mix(c, vec3(1.0, 0.97, 0.90), clamp((t - 1.25) * 1.6, 0.0, 0.9));
        }

        // Pressure structure: warped sine products, so the volume carries
        // filaments and cells without ever describing a surface. Biased
        // dark by the square, so the density has real voids rather than an
        // even haze — voids are what stop an integral reading as a ball.
        float turbulence(vec3 q) {
          float bend = 1.6 * sin(q.y * 0.72 + q.x * 0.43);
          float a = sin(q.x * 1.5 + bend) * sin(q.y * 1.3 - bend);
          float b = sin(q.z * 2.4 + bend * 1.3) * sin(q.x * 2.0 - q.z * 0.9);
          float c = sin(q.x * 4.1 - bend) * sin(q.y * 3.6 + bend);
          float t = clamp(0.5 + 0.34 * a + 0.22 * b + 0.12 * c, 0.0, 1.0);
          return t * t;
        }

        void main() {
          // The interior is INTEGRATED along the sightline, not evaluated as
          // a function of how near that line passes the centre. The
          // distance form was tried first and it draws a disc: any
          // radially symmetric emission, seen from outside, has a circular
          // extent — the forbidden spherical boundary wearing a soft edge.
          // Marching a turbulent density means each sightline accumulates a
          // different amount through a different part of the volume, so the
          // light ends in a ragged, unrepeatable outline that belongs to no
          // sphere.
          vec3 centre = vCentre;
          vec3 ray = normalize(vWorld - cameraPosition);
          float along = dot(centre - cameraPosition, ray);

          const int STEPS = 10;
          const float SPAN = 13.0;
          float acc = 0.0;
          for (int i = 0; i < STEPS; i++) {
            float t = along + (float(i) / float(STEPS - 1) - 0.5) * SPAN;
            if (t <= 0.0) continue;
            vec3 rel = cameraPosition + ray * t - centre;
            // No pow(): the base is exactly zero on the sightline through
            // the centre, and pow(0, y) is the NaN that once rendered this
            // project's hero black on the real card while software
            // rasterisers showed it fine.
            float r2 = dot(rel, rel) / 10.5;
            acc += exp(-r2) * turbulence(rel * 0.62);
          }
          acc /= float(STEPS);

          float pressure = uCoreBase + uFlare * uCoreFlare;
          float energy = pressure * acc * 3.4;

          // Additive: this is light in the gaps, not a material in them.
          fragColour = vec4(ramp(energy) * energy * uExposure, 1.0);
        }
      `,
      // Drawn on the far side of its own shell, so its depth sits beyond the
      // plates: every plate occludes it, and it reaches the eye only through
      // the openings between them. Additive and depth-write-free, because
      // light does not hide what is behind it.
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  async load(base = `${import.meta.env.BASE_URL}models/`): Promise<void> {
    // The world is Draco-compressed: the geometry is dense enough that
    // connectivity dominated the file, and connectivity is what Draco
    // compresses hardest. Decoding runs in the loader's own worker pool, so
    // the main thread is never blocked while the loader UI is up — the
    // decode is real initialisation work the loader is honestly reporting.
    //
    // Only the WASM decoder ships. The JS fallback was 512 kB that no real
    // visitor ever downloaded, so WebAssembly is now as hard a requirement
    // for the hero as WebGL2 is, and it is declared here rather than
    // discovered halfway through a load. Without this the loader fetches a
    // decoder that is not there, a static host answers a missing asset with
    // index.html and a 200 rather than a 404, and the page dies evaluating
    // markup as JavaScript — measured, not imagined. Refusing up front
    // hands the boot sequence a clean failure, and it already knows what to
    // do with one: the visitor gets the readable site and a recorded visit.
    if (typeof WebAssembly !== 'object') {
      throw new Error('correction: WebAssembly unavailable, cannot decode the world');
    }

    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    const loader = new GLTFLoader().setDRACOLoader(draco);

    try {
      const [gltf, manifest] = await Promise.all([
        loader.loadAsync(`${base}planet.glb`),
        fetch(`${base}planet-manifest.json`).then((r) => r.json() as Promise<Manifest>),
      ]);
      this.stage(gltf, manifest);
    } finally {
      // The decoder workers have done their one job. Held open they are
      // three idle threads for the rest of the visit.
      draco.dispose();
    }
  }

  private stage(gltf: { scene: THREE.Object3D }, manifest: Manifest): void {

    const random = mulberry32(0x517a9e3b);
    const chunkGeometries: THREE.BufferGeometry[] = [];

    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      const name = object.name;
      const kind: Piece['kind'] = name.startsWith('slab')
        ? 'slab'
        : name.startsWith('plate')
          ? 'plate'
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
      // The planet's own plates expand too — there is no body that holds any
      // more — but slowly, at the pace of something planetary letting go;
      // the thrown pieces keep their faster continuation down their lines.
      const plate = kind === 'plate';
      this.pieces.push({
        mesh,
        home,
        drift: still
          ? new THREE.Vector3()
          : home
              .clone()
              .normalize()
              .multiplyScalar(plate ? 0.18 + home.length() * 0.03 : 0.5 + home.length() * 0.06),
        spin: still
          ? new THREE.Vector3()
          : new THREE.Vector3(
              (random() - 0.5) * (plate ? 0.004 : 0.01),
              (random() - 0.5) * (plate ? 0.004 : 0.01),
              (random() - 0.5) * (plate ? 0.004 : 0.01)
            ),
        extent: 1,
        kind,
      });
    });

    // The shell the interior is drawn on — a carrier, not a core. It is
    // deliberately larger than the plate field so its own surface is never
    // where the light appears to end; the falloff decides that, far inside.
    // Nothing about this radius is visible.
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(manifest.coreRadius * 2.4, 2),
      this.coreMaterial
    );
    this.inner.add(this.core);

    // The stops, transformed into world space for the rail.
    const toWorld = (entry: ManifestEntry): Stop => ({
      name: entry.name,
      home: yUp(entry.position).applyQuaternion(this.group.quaternion),
      extent: entry.extent,
    });
    this.stopsWorld = manifest.stops.map(toWorld);
    this.platesWorld = (manifest.plates ?? []).map(toWorld);

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
        // A radial shell around the whole body, not a cone: the explosion
        // was never funnelled, only the view is. Biased toward the rupture
        // (authored +X) where most of the mass left, but nowhere is empty.
        radialDirection(position, random);
        const flight = 1.2 + EJECTA.reach * Math.pow(random(), 1.45);
        position.multiplyScalar(5.2 + flight);

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
   * The smallest tier: particulate dust down the whole funnel. This is what
   * makes the corridor a volume with air in it rather than objects on black
   * — every earlier version read as "a trail of chunks" partly because
   * nothing existed between chunk-size and nothing. Lives inside the ejecta
   * group so the flare carries it with the rest.
   *
   * Density is not a count. Twenty thousand motes seeded evenly through the
   * cone read as grain on the lens: uniform noise has no depth cues, so the
   * eye files it as a filter over the image rather than as matter in front
   * of and behind things. So the field is drawn into streaks — most of the
   * dust gathers into elongated trails with clear lanes between them, which
   * is both what a blast actually leaves and what gives the volume its
   * near-and-far reading.
   */
  private buildDust(random: () => number): void {
    // A soft round sprite, generated rather than shipped: an untextured
    // Points pass draws squares, and thousands of additive squares read as
    // noise. Shared by both populations — one texture, one upload.
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

    // Where the field bunches. Each streak is a RAY out of the body — the
    // track of matter that left together — so the clumps read as the blast's
    // own geometry, radiating, not as lanes down a corridor nobody dug.
    const streaks: { dir: THREE.Vector3; spread: number }[] = [];
    for (let i = 0; i < DUST.streaks; i++) {
      streaks.push({
        dir: radialDirection(new THREE.Vector3(), random).clone(),
        spread: 0.45 + 0.95 * random(),
      });
    }
    const scratchDir = new THREE.Vector3();

    // Sum of three uniforms: a cheap bell, so a streak has a dense spine
    // that thins outward instead of a hard edge.
    const bell = (): number => random() + random() + random() - 1.5;

    const buildTier = (tier: { count: number; size: number; opacity: number }): void => {
      const positions = new Float32Array(tier.count * 3);
      const colours = new Float32Array(tier.count * 3);

      for (let i = 0; i < tier.count; i++) {
        let x: number;
        let y: number;
        let z: number;
        let flight: number;

        if (random() < DUST.clumped) {
          const streak = streaks[Math.floor(random() * streaks.length)];
          flight = Math.pow(random(), 1.15) * DUST.reach;
          const r = 5.0 + flight;
          x = streak.dir.x * r + bell() * streak.spread;
          y = streak.dir.y * r + bell() * streak.spread;
          z = streak.dir.z * r + bell() * streak.spread;
        } else {
          // The rest fills a whole shell around the body, so the space
          // between rays is thin rather than empty and the field has no
          // skin anywhere the camera looks.
          radialDirection(scratchDir, random);
          flight = Math.pow(random(), 1.3) * DUST.reach;
          const r = 5.0 + flight;
          x = scratchDir.x * r;
          y = scratchDir.y * r;
          z = scratchDir.z * r;
        }

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // Ash, not snow: dim, warm near the body it just left, grey by the
        // far shell — and never bright enough to compete with the debris it
        // is meant to sit between. The earlier values read as white UI
        // specks and flattened every frame they touched.
        const heat = Math.max(0, 1 - flight / DUST.reach) * (0.4 + 0.6 * random());
        const shade = 0.11 + 0.33 * random();
        colours[i * 3] = shade * (0.82 + 0.55 * heat);
        colours[i * 3 + 1] = shade * (0.52 + 0.24 * heat);
        colours[i * 3 + 2] = shade * 0.38;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

      const material = new THREE.PointsMaterial({
        size: tier.size,
        sizeAttenuation: true,
        map: this.dustTexture,
        vertexColors: true,
        transparent: true,
        opacity: tier.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.dustMaterials.push({ material, opacity: tier.opacity });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      this.ejecta.add(points);
    };

    buildTier(DUST.haze);
    buildTier(DUST.motes);
  }

  /** The rail's destinations, world space, in authored (near→far) order. */
  get stops(): Stop[] {
    return this.stopsWorld;
  }

  /** Every superplate, world space — the rail needs the whole set. */
  get plates(): Stop[] {
    return this.platesWorld;
  }

  /**
   * The directive's own pass/fail test, made repeatable: hide every piece
   * of debris and leave only the superplates and the interior light. If the
   * wide view does not read as a whole planet exploding outward with the
   * rubble gone, no amount of rubble was ever going to save it.
   */
  setIsolation(on: boolean): void {
    this.ejecta.visible = !on;
    for (const piece of this.pieces) {
      if (piece.kind === 'chunk') piece.mesh.visible = !on;
    }
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
    // The small debris expands radially from the body, because that is what
    // it is doing — the old corridor push slid the whole field sideways as
    // if the explosion had a direction it never had.
    this.ejecta.scale.setScalar(1 + flare * 0.16);
  }

  /** Heavy, slow. A slab turns a few degrees in the time anyone watches. */
  setTime(seconds: number): void {
    for (const piece of this.pieces) {
      piece.mesh.rotation.x += piece.spin.x * 0.016;
      piece.mesh.rotation.y += piece.spin.y * 0.016;
      piece.mesh.rotation.z += piece.spin.z * 0.016;
    }
    // The interior convects: its filaments crawl at a rate only a held gaze
    // notices. Two unequal axes, so the drift never reads as a turntable.
    if (this.core) {
      this.core.rotation.y += 0.0034 * 0.016;
      this.core.rotation.x += 0.0013 * 0.016;
    }
    void seconds;
  }

  setExposure(value: number): void {
    this.uniforms.uExposure.value = value;
    this.coreUniforms.uExposure.value = value;
    // The dust is additive and has no exposure uniform of its own; without
    // this it would hang at full brightness through the cold open. Each
    // population keeps its own base, so the haze never overtakes the grit.
    for (const dust of this.dustMaterials) dust.material.opacity = dust.opacity * value;
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
    for (const dust of this.dustMaterials) dust.material.dispose();
    this.dustTexture?.dispose();
    this.inner.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) object.geometry.dispose();
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
  }
}
