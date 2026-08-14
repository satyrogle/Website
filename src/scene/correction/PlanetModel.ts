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
  /**
   * u — how far this piece has escaped its recorded seat, along its own
   * drift. Zero is the approved composition, and at zero the staging is
   * bit-identical to the frame that was signed off. The visitor moves this;
   * the correction returns it.
   */
  deviation: number;
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
  /** Separate from `scratch`, which `place` owns. */
  private readonly aim = new THREE.Vector3();
  private stopsWorld: Stop[] = [];
  private dustTexture: THREE.CanvasTexture | null = null;
  private dustMaterials: { material: THREE.PointsMaterial; opacity: number }[] = [];
  private core: THREE.Mesh | null = null;
  private flareValue = 0;

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
    // Not a lamp, and not an airbrushed gradient either. The interior is a
    // crusted melt: thin cooled plates rafting on the molten body, and the
    // heat burning through the seams between them — the same law the whole
    // hero obeys, light belongs to the break, applied one layer deeper.
    // Structure comes from two scales of domain-warped cellular fracture
    // (warped so the plates raft rather than tile); regional convection
    // makes some provinces more broken and brighter than others; one
    // blackbody ramp carries ember plate -> orange seam -> white-hot core
    // of the widest cracks. The flare widens the seams and drives the whole
    // ramp toward white, so the finale keeps its escalation.
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

        vec3 hash3(vec3 p) {
          p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                   dot(p, vec3(269.5, 183.3, 246.1)),
                   dot(p, vec3(113.5, 271.9, 124.6)));
          return fract(sin(p) * 43758.5453);
        }

        // F1/F2 cellular distances: F2-F1 is ~0 on a border between plates
        // and grows toward each plate's centre.
        vec2 plates(vec3 x) {
          vec3 n = floor(x);
          vec3 f = fract(x);
          float d1 = 8.0;
          float d2 = 8.0;
          for (int k = -1; k <= 1; k++)
          for (int j = -1; j <= 1; j++)
          for (int i = -1; i <= 1; i++) {
            vec3 g = vec3(float(i), float(j), float(k));
            vec3 r = g + hash3(n + g) - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; }
            else if (d < d2) { d2 = d; }
          }
          return sqrt(vec2(d1, d2));
        }

        // One temperature ramp for everything: deep ember, through orange,
        // into yellow-white. Premium is one consistent physics, not many
        // painted colours.
        vec3 ramp(float t) {
          vec3 c = mix(vec3(0.32, 0.05, 0.01), vec3(1.0, 0.42, 0.08), clamp(t * 1.4, 0.0, 1.0));
          c = mix(c, vec3(1.0, 0.85, 0.55), clamp((t - 0.75) * 2.2, 0.0, 1.0));
          return mix(c, vec3(1.0, 0.97, 0.90), clamp((t - 1.25) * 1.6, 0.0, 0.9));
        }

        void main() {
          float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);

          // Rafted, not tiled: the cell domain is bent by a slow flow first.
          // Plate size is authored for the wound aperture: at 0.95 the hot
          // province showed a dozen cells at once and read as honeycomb
          // (Jacob). At 0.62 the aperture holds two to four monumental
          // rafts — fracture, not pattern.
          vec3 p = vLocal * 0.62
                 + 0.50 * vec3(sin(vLocal.y * 0.8 + vLocal.z * 0.5),
                               sin(vLocal.z * 0.9 - vLocal.x * 0.4),
                               sin(vLocal.x * 0.7 + vLocal.y * 0.6));
          vec2 major = plates(p);
          vec2 minor = plates(p * 2.9 + 7.31);

          // Regional convection: whole provinces run hotter and more broken.
          // Squared into a hard unevenness — the first cellular pass lit
          // every seam white and the interior read as lace; an interior
          // reads as pressure when most of it is dark crust with ember
          // cracks and ONE province is burning through.
          float bend = 1.7 * sin(vLocal.y * 0.9 + vLocal.x * 0.5);
          float cells = sin(vLocal.x * 2.3 + bend) * sin(vLocal.y * 2.0 - bend)
                      + 0.6 * sin(vLocal.z * 3.4 + bend * 1.3) * sin(vLocal.x * 2.9 - vLocal.z * 1.1);
          float region = clamp(0.5 + 0.31 * cells, 0.0, 1.0);
          float province = 0.18 + 0.82 * region * region;

          // Each seam is a thin incandescent line inside a wide molten
          // bleed; fine fractures vein the plates' skin. The flare parts
          // everything further.
          float gap = major.y - major.x;
          float hot = 1.0 - smoothstep(0.0, 0.10 + 0.10 * uFlare, gap);
          float warm = 1.0 - smoothstep(0.0, 0.45, gap);
          float fine = 1.0 - smoothstep(0.0, 0.13, minor.y - minor.x);

          float pressure = uCoreBase + uFlare * uCoreFlare;
          float skin = 0.09 + 0.20 * region;
          float melt = (0.85 * hot + 0.38 * warm + 0.20 * fine) * province;
          float energy = pressure * (skin + melt) * (0.45 + 0.55 * pow(facing, 1.4));

          fragColour = vec4(ramp(energy) * energy * uExposure, 1.0);
        }
      `,
      side: THREE.FrontSide,
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
        deviation: 0,
      });
    });

    // The interior. Slightly under the manifest's core radius so it never
    // z-fights the inner lining of the shell.
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(manifest.coreRadius * 0.96, 3),
      this.coreMaterial
    );
    this.inner.add(this.core);

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

  /**
   * The finale: everything already moving keeps moving along its own line,
   * the interior's output climbs, and the body holds — a continuation of the
   * event, driven by scroll and therefore exactly reversible.
   */
  setFlare(value: number): void {
    const flare = Math.max(0, Math.min(1, value));
    this.flareValue = flare;
    this.uniforms.uFlare.value = flare;
    this.coreUniforms.uFlare.value = flare;
    for (const piece of this.pieces) {
      if (piece.kind === 'body' || piece.kind === 'crack') continue;
      this.place(piece);
    }
    // The small debris expands radially from the body, because that is what
    // it is doing — the old corridor push slid the whole field sideways as
    // if the explosion had a direction it never had.
    this.ejecta.scale.setScalar(1 + flare * 0.16);
  }

  /**
   * Where a piece actually sits: its recorded seat, plus the finale's global
   * continuation, plus whatever the visitor has pulled it out to.
   *
   * Both offsets ride the same `drift`, so a deviation is the piece
   * continuing the flight it was already on rather than being shoved in some
   * direction the event never had. At `flare = 0` and `deviation = 0` this
   * writes the authored position back exactly.
   */
  private place(piece: Piece): void {
    this.scratch
      .copy(piece.home)
      .addScaledVector(piece.drift, this.flareValue + piece.deviation);
    piece.mesh.position.copy(this.scratch);
  }

  /** Everything a visitor is allowed to disturb. The body holds; it always has. */
  get pressable(): Piece[] {
    return this.pieces.filter((p) => p.kind === 'slab' || p.kind === 'chunk');
  }

  /** Move one piece off its recorded seat. `u` is in drift lengths. */
  setDeviation(index: number, u: number): void {
    const piece = this.pressable[index];
    if (!piece) return;
    piece.deviation = u;
    this.place(piece);
  }

  /**
   * Which pressable piece the pointer is over, or -1.
   *
   * Raycast against the pressable set only. The body is most of the
   * silhouette, and letting it absorb presses would mean most clicks landing
   * on the one thing that cannot move.
   */
  pick(
    raycaster: THREE.Raycaster,
    camera?: THREE.Camera,
    ndc?: THREE.Vector2,
    tolerance = 0.20
  ): number {
    const pressable = this.pressable;
    const hits = raycaster.intersectObjects(
      pressable.map((p) => p.mesh),
      false
    );
    if (hits.length) return pressable.findIndex((p) => p.mesh === hits[0].object);

    // Nothing directly under the pointer, so take the nearest piece on
    // screen. A strict raycast covered sixteen percent of the frame — the
    // debris is small and mostly void — which meant five clicks in six did
    // nothing at all. An action without an observable consequence is the one
    // thing this interaction cannot be, and that applies just as much to the
    // press that missed as to the press that was never wired.
    if (!camera || !ndc) return -1;
    let best = -1;
    let bestDistance = tolerance;
    for (let i = 0; i < pressable.length; i++) {
      const projected = pressable[i].mesh.getWorldPosition(this.aim).project(camera);
      if (projected.z > 1) continue;
      // Weighted, not merely nearest. A press that lands on a speck of debris
      // twenty units away moves something the visitor cannot see moving, and
      // reads as nothing happening. The hero slabs are the subject of the
      // frame, so they win ties by a wide margin and pull from further off.
      const prominence = pressable[i].kind === 'slab' ? 0.42 : 1.0;
      const d = Math.hypot(projected.x - ndc.x, projected.y - ndc.y) * prominence;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  }

  /** Heavy, slow. A slab turns a few degrees in the time anyone watches. */
  setTime(seconds: number): void {
    for (const piece of this.pieces) {
      piece.mesh.rotation.x += piece.spin.x * 0.016;
      piece.mesh.rotation.y += piece.spin.y * 0.016;
      piece.mesh.rotation.z += piece.spin.z * 0.016;
    }
    // The melt convects: the plate pattern crawls across the wound at a rate
    // only a held gaze notices. Two unequal axes, so the drift never reads
    // as a turntable.
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
