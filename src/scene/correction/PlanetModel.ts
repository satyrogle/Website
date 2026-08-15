import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import planetVert from '../../shaders/planet-fragment.vert.glsl?raw';
import planetFrag from '../../shaders/planet-fragment.frag.glsl?raw';

// Staging jitter must be identical on every machine and every visit, so it
// comes from the same generator as everything else rather than from a copy.
//
// This file used to carry its own byte-identical mulberry32, which made
// `random.ts`'s opening line — "The one random stream, and the only one" —
// untrue, and left the determinism claim with two implementations to keep in
// step. They agreed today; nothing would have caught the day they stopped.
import { mulberry32 } from './graph/random';

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
  private readonly probeVec = new THREE.Vector3();
  private readonly ghosts: THREE.Mesh[] = [];
  private ghostMaterial: THREE.ShaderMaterial | null = null;
  private stopsWorld: Stop[] = [];
  private dustTexture: THREE.CanvasTexture | null = null;
  private dustMaterials: { material: THREE.PointsMaterial; opacity: number }[] = [];
  private core: THREE.Mesh | null = null;
  private flareValue = 0;

  /**
   * The wounded world's own radius, from the manifest. Zero until loaded.
   *
   * Published because composition needs it: a camera cannot decide whether
   * the subject is contained in the frame without knowing how big the
   * subject is, and the alternative is a constant that silently stops
   * matching the geometry the next time the generator runs.
   */
  bodyRadius = 0;

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
      // The rift network is authored in units of the body's own radius, so
      // its frequencies mean something. Written at load, when the manifest
      // is known; the placeholder only has to be non-zero.
      uCoreRadius: { value: 1 },
      // The camera, in the core's own object space. A volume has to be
      // marched along the view ray, and the ray only exists in this space.
      uCamLocal: { value: new THREE.Vector3() },
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
        uniform float uCoreRadius;
        uniform vec3 uCamLocal;
        in vec3 vNormal;
        in vec3 vView;
        in vec3 vLocal;
        out vec4 fragColour;

        // Emission is gathered per unit length, so the march's total is not
        // the surface evaluation's; this restores the authored brightness.
        // Raised with the cracks: the network went from filling half the
        // volume to occupying roughly a tenth of it, and a tenth has to carry
        // the light the half was spreading.
        const float CORE_GAIN = 4.2;

        // The rift network's base frequency, in units of the core radius. All
        // the crack maths below works in this space, so it is named once.
        //
        // Lowered from 2.6, which put four or five plate widths across the
        // wound: at that scale the network stopped being seams between plates
        // and became a tangle — glitter in the wide frame, rope in the
        // close-up, the visible-primitive fault arriving by a new route. The
        // interior is thin cooled plates RAFTING on the melt, and a raft is a
        // large thing.
        //
        // Counted in the wide frame rather than guessed at, because that is
        // the composition and the wound is only about two hundred pixels of
        // it: at 2.6 there were a dozen seams across the aperture and it read
        // as a knot of wire, at 2.0 still eight or nine. Three or four is a
        // broken shell. The one direction this must not go is up.
        const float RIFT_FREQ = 1.35;

        // Crack half-width, same space — an authored width now, rather than a
        // threshold on the field's value. About a tenth of a world unit at the
        // core's scale: a seam between plates, not a river.
        const float RIFT_WIDTH = 0.040;

        // Sin-based, deliberately. A multiply-and-fract hash is cheaper per
        // call and was measured here: it saved nothing outside the noise
        // floor, because this shader is 0.4 ms of the frame, and it changed
        // the realisation enough that the rift network read as cells again —
        // which is the one thing this material exists to avoid.
        float hash1(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }

        float vnoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = hash1(i + vec3(0.0, 0.0, 0.0));
          float n100 = hash1(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash1(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash1(i + vec3(1.0, 1.0, 0.0));
          float n001 = hash1(i + vec3(0.0, 0.0, 1.0));
          float n101 = hash1(i + vec3(1.0, 0.0, 1.0));
          float n011 = hash1(i + vec3(0.0, 1.0, 1.0));
          float n111 = hash1(i + vec3(1.0, 1.0, 1.0));
          return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                     mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
        }

        /**
         * Three octaves, and the third is the last one that helps.
         *
         * A fourth was in here, and all it did was wrinkle the sheets at a
         * scale finer than a plate — which is what turned the seams into
         * tangled cord. Its amplitude was a sixteenth of the field's, so it
         * moved the level set almost not at all, but it contributed as much
         * gradient as the base octave did, and the gradient is what the crack
         * width is now divided by. Cheaper and cleaner without it.
         *
         * Centred by subtracting the octave sum's mean, so fbm(p) - FBM_MEAN
         * is the zero level set rather than an off-centre slice of the field.
         * (No backticks in here: the shader is a template literal, and one
         * pair of them ends it mid-comment and takes the whole page down.)
         */
        const float FBM_MEAN = 0.4375;

        float fbm(vec3 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 3; i++) {
            sum += amp * vnoise(p);
            p = p * 2.03 + 11.7;
            amp *= 0.5;
          }
          return sum;
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
          // Marched, not painted.
          //
          // Every previous version evaluated the rift field at the SURFACE
          // position and wrapped the result on a sphere, which is a texture
          // however good the field is: no parallax as the camera moves, no
          // depth between near cracks and far ones, and a limb that behaves
          // like a decal rather than like a body. Jacob, twice: "it still
          // looks like a texture."
          //
          // So the ray enters at this fragment and travels inward, gathering
          // emission through the field it passes. Cracks at different depths
          // now slide across one another as the camera moves, the centre
          // accumulates more path than the limb, and the interior reads as a
          // volume with pressure in it because that is what is being drawn.
          vec3 ro = vLocal;
          vec3 rd = normalize(vLocal - uCamLocal);
          float R = max(uCoreRadius, 1e-4);

          // The far side, analytically: the entry point lies on the sphere,
          // so the chord to the exit is -2 (ro . rd). Capped, because a ray
          // through the middle would otherwise cost twice a grazing one for
          // light that is absorbed long before it gets there.
          float chord = max(-2.0 * dot(ro, rd), 0.0);
          // Shorter than the 1.7 radii it was, and finer.
          //
          // With the crack width authored rather than inherited from the
          // noise, the limit on how sharp a seam can be is the sampling: the
          // band is never allowed below what one step resolves, so the step is
          // now what sets the width. Spending the march on a shorter chord in
          // more pieces buys the sharpness directly, and the far quarter it
          // gives up arrives through a whole body of plate and contributes
          // almost nothing.
          float far = min(chord, R * 1.25);

          // 26, measured rather than chosen: the four gradient taps make every
          // step four times what it used to cost, and the march is now most of
          // this shader's frame time. 32 and 26 are indistinguishable in the
          // composition — the seams sit at their authored width either way,
          // because the front-loading puts the fine steps where the eye reads
          // — and the difference is worth several frames a second.
          const int STEPS = 26;

          // Where in each segment the sample is taken, varied per pixel.
          //
          // The steps are shared by every ray, so any residual under-sampling
          // lands at the same distance for neighbouring pixels and appears as
          // the concentric shells that were visible in the smoke. Offsetting
          // by a hash of the pixel scatters that into grain instead.
          //
          // Plain white noise. The interleaved-gradient hash that was here
          // first is built to be resolved by a temporal filter, and with no
          // filter to resolve it it laid a regular diagonal hatch across every
          // lit pixel — a grid, arriving in the one place nothing looks for
          // one. A function of gl_FragCoord alone either way: no time term, so
          // it is stable frame to frame rather than a shimmer.
          float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

          vec3 acc = vec3(0.0);
          float trans = 1.0;
          float pressure = uCoreBase + uFlare * uCoreFlare;
          // The flare parts the cracks — the same widening the crust's vents
          // do, one layer deeper.
          float width = RIFT_WIDTH * (1.0 + 0.9 * uFlare);

          float t0 = 0.0;
          for (int i = 0; i < STEPS; i++) {
            // Front-loaded, not uniform.
            //
            // Uniform steps spend as much resolution on the far hemisphere —
            // which arrives through the whole body's absorption and is dim by
            // the time it does — as on the near shell, where the cracks the
            // eye actually reads live and where parallax happens. A power
            // distribution puts the fine steps at the entry: near cracks come
            // out at their authored width, deep ones soften, and softening
            // with depth through a body is what depth looks like.
            float s = float(i + 1) / float(STEPS);
            float t1 = far * s * sqrt(s);
            float dt = t1 - t0;
            vec3 p = ro + rd * (t0 + dt * dither);
            t0 = t1;

            vec3 u = p / R;
            // 0 at the shell, 1 at the centre.
            float depth = 1.0 - clamp(length(u), 0.0, 1.0);

            vec3 q = u * RIFT_FREQ + 11.0;
            float raw = fbm(q);
            float f = raw - FBM_MEAN;

            // A distance to the sheet, not the field's value — and this is the
            // whole of why the interior was smoke.
            //
            // Thresholding |f| directly looks like a level set and is not one.
            // The field this replaced had a standard deviation of 0.111, so
            // its threshold of 0.075 admitted 46% OF THE VOLUME — measured
            // over the ball, not estimated.
            // Half a body glowing softly is a cloud, and no grade turns a
            // cloud into rock under pressure. Worse, the width it did produce
            // was |f| divided by the local gradient, so wherever the field
            // went flat the "crack" swelled into a blob — the soft lobes that
            // filled the wound.
            //
            // Dividing by that gradient recovers the distance the threshold
            // was standing in for. Every crack is then the same width wherever
            // it runs, flat regions of the field stop swelling, and the width
            // becomes something authored rather than something the noise
            // decides. Three extra taps buy it, and they are the cost this
            // material is worth paying.
            const float E = 0.08;
            vec3 grad = (vec3(fbm(q + vec3(E, 0.0, 0.0)),
                              fbm(q + vec3(0.0, E, 0.0)),
                              fbm(q + vec3(0.0, 0.0, E))) - raw) / E;
            float slope = max(length(grad), 1e-3);
            float dist = abs(f) / slope;

            // Widened to what this step can resolve, and dimmed by exactly
            // what the widening added.
            //
            // A crack this narrow is thinner than the gap between samples, and
            // a march that simply misses one produces speckle — which is what
            // the old smoke was hiding rather than solving. So the band never
            // falls below the distance the ray covers across this segment, and
            // the energy that widening would have invented is taken straight
            // back out. Sharp where the sampling can carry it, stable where it
            // cannot, and the same total light either way.
            float footprint = (dt * RIFT_FREQ / R) * abs(dot(grad, rd)) / slope;
            float band = width + 0.5 * footprint;
            float g = (1.0 - smoothstep(0.0, band, dist)) * (width / band);

            // Thread inside bleed — the grammar the crust's vents already use:
            // an incandescent line carrying almost no area, inside a dimmer
            // spill that does the bleeding into the rock beside it.
            // Hard-shouldered, because a crack has an edge. A gentle falloff
            // spreads every seam into the plate beside it, and enough of those
            // shoulders overlapping along a ray is the orange wash the smoke
            // was made of. Squared for the spill, fourth power for the thread
            // inside it: the seam ends where the rock begins.
            float bleed = g * g;
            float thread = bleed * bleed;

            // Pressure lives at the centre, and the skin is nearly cold.
            //
            // With every depth emitting, the march stacked five or six lit
            // sheets on top of one another and the wound filled with tangled
            // wire — the spaghetti the direction names, arriving through the
            // volume instead of through geometry. The cure is not fewer cracks
            // but a dark outer shell: hold the first third of the way in near
            // zero and the near plates stop glowing and start OCCLUDING, which
            // is the only way the eye reads one crack as being in front of
            // another rather than beside it.
            // Held at a sixth on the skin rather than at nothing: with the
            // plate absorption below doing the occluding too, a near-zero
            // shell and an opaque body multiply, and the wound goes empty —
            // which is a worse failure than the smoke was, because an empty
            // frame states nothing at all. One of the two does the ordering;
            // this one only has to keep the outer sheets from competing.
            float lit = (bleed * 0.45 + thread * 1.55) * (0.15 + 0.45 * depth + 1.40 * depth * depth);

            // A short, dim glow around each seam, so the heat sits IN rock
            // rather than hanging in a void. Without it the network is bright
            // line on pure black, which reads as neon tubing however good the
            // network is — light needs something to fall on. Four times the
            // seam's own band and a thirtieth of its strength: a hot margin,
            // not a return to the fog.
            float halo = 1.0 - smoothstep(0.0, band * 4.0, dist);
            lit += halo * halo * 0.05 * (0.15 + 0.85 * depth);

            // A dim continuum, so the space between cracks is molten rather
            // than empty. An eighth of what it was: at the old level this term
            // alone was a fog, filling every gap the cracks left over. It is a
            // floor under the plates, not a light of its own.
            lit += 0.004 * depth * depth;

            float energy = lit * pressure;
            acc += ramp(energy) * energy * trans * dt;

            // Absorption belongs to the PLATE, not to the crack.
            //
            // It was the wrong way round — the glowing gap absorbed and the
            // rock did not — and that is why nothing in here occluded anything
            // and the march read as a flat sum. A crack is the open seam: it
            // emits, and it passes what is behind it. The cooled plate between
            // cracks is the occluder. With it that way round, near plates
            // stand black against the deep network and the interior has a
            // front and a back. Raised until it does that job: at a third of
            // this the plates were translucent, every sheet along the ray
            // arrived at the eye with equal weight, and the network had no
            // front or back to read. Capped where the heart still gets out —
            // a whole body of plate takes it to about a tenth, and past that
            // the interior is simply a closed door.
            trans *= exp(-(0.06 + 0.45 * (1.0 - bleed)) * dt);
            // Cut at a twentieth rather than a fiftieth. What arrives through
            // the last of that is below the grade's floor and costs four noise
            // taps a step to compute.
            if (trans < 0.05) break;
          }

          fragColour = vec4(acc * CORE_GAIN * uExposure, 1.0);
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
    this.bodyRadius = manifest.bodyRadius;
    const coreRadius = manifest.coreRadius * 0.96;
    this.coreUniforms.uCoreRadius.value = coreRadius;
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(coreRadius, 3), this.coreMaterial);
    this.inner.add(this.core);

    // The stops, transformed into world space for the rail.
    this.buildGhosts();

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

  /**
   * The record, as geometry.
   *
   * One ghost per pressable piece, sharing that piece's own mesh, parked at
   * the position the composition was authored with. Amber, because amber is
   * the model of the world and this is literally that: where the system says
   * the piece is. Rim-weighted and depth-tested but not depth-writing, so it
   * reads as a held position rather than as a second solid object.
   *
   * Violet arrives on the same surface while the operator is engaged — the
   * consequence of the world and the record disagreeing, present only while
   * the disagreement is being acted on. That is `V = D x C` drawn where it
   * happens.
   */
  private buildGhosts(): void {
    // Normal blending, deliberately. The seat this marks sits inside the
    // wound — the brightest region of the frame — and an additive amber rim
    // over near-white-hot pixels adds nothing the eye can register: the
    // first build of this ghost passed every check and was invisible in
    // every capture. A normally-blended line asserts its own colour over
    // whatever is behind it, which is what an assertion is.
    this.ghostMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.FrontSide,
      uniforms: { uPresence: { value: 0 }, uEnforce: { value: 0 } },
      vertexShader: /* glsl */ `
        out vec3 vN;
        out vec3 vV;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uPresence;
        uniform float uEnforce;
        in vec3 vN;
        in vec3 vV;
        out vec4 fragColour;

        // Emission is gathered per unit length, so the march's total is not
        // the surface evaluation's; this restores the authored brightness.
        const float CORE_GAIN = 0.85;
        void main() {
          // Rim only. A filled ghost is a second planet; an edge is a
          // position being asserted. The exponent is wide enough to survive
          // being looked at — 2.6 produced a hairline that vanished into the
          // wound light — and the rim's core runs toward white-amber so the
          // line stays legible over the hottest pixels in the frame.
          float facing = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float rim = pow(clamp(facing, 0.0, 1.0), 1.8);
          vec3 amber = vec3(1.0, 0.62, 0.16);
          vec3 violet = vec3(0.55, 0.22, 0.95);
          vec3 colour = mix(amber, violet, clamp(uEnforce, 0.0, 1.0) * 0.75);
          colour = mix(colour, vec3(1.0, 0.9, 0.7), rim * 0.45);
          float a = rim * uPresence * 0.9;
          if (a < 0.004) discard;
          fragColour = vec4(colour, a);
        }`,
    });

    // One material per ghost. Presence and enforcement are per-piece
    // quantities, and a shared material would make every ghost in the scene
    // light up for whichever piece was last touched.
    this.pressable.forEach((piece) => {
      const ghost = new THREE.Mesh(
        (piece.mesh as THREE.Mesh).geometry,
        this.ghostMaterial!.clone()
      );
      ghost.visible = false;
      ghost.renderOrder = 2;
      ghost.scale.copy(piece.mesh.scale);
      this.ghosts.push(ghost);
      this.inner.add(ghost);
    });
  }

  /**
   * Where the camera stands, in the core's own object space.
   *
   * The interior is marched along the view ray, and that ray is only
   * meaningful in the space the field is defined in. Recomputed per frame
   * because the group carries the site's diagonal and the camera travels the
   * rail; a stale value would slide the parallax off the geometry, which is
   * the one artefact that would look worse than the texture it replaces.
   */
  setCameraLocal(camera: THREE.Camera): void {
    if (!this.core) return;
    this.core.updateWorldMatrix(true, false);
    const local = this.coreUniforms.uCamLocal.value as THREE.Vector3;
    local.copy(camera.position);
    this.core.worldToLocal(local);
  }


  /**
   * How many pixels one unit of deviation moves this piece, right now.
   *
   * The press is sized from this, because acceptance is stated in screen
   * space. Deviation measured in world units is meaningless to a visitor: the
   * same 0.79 units is a shove on a near slab and nothing at all on a chunk
   * twenty units further out.
   */
  pixelsPerDeviation(
    index: number,
    camera: THREE.Camera,
    width: number,
    height: number,
    atDeviation = 1
  ): number {
    const piece = this.pressable[index];
    if (!piece) return 0;
    // Measured at the deviation we actually intend, not at one unit.
    // Projection is not linear along the drift — a piece escaping radially is
    // also receding, so it covers fewer pixels per unit the further it goes,
    // and a unit-distance estimate overshoots the energy needed by a third.
    const here = piece.mesh.getWorldPosition(this.aim).clone().project(camera);
    const there = this.probeVec
      .copy(piece.mesh.getWorldPosition(this.aim))
      .add(this.scratch.copy(piece.drift).applyQuaternion(this.group.quaternion).multiplyScalar(atDeviation))
      .project(camera);
    const dx = (there.x - here.x) * 0.5 * width;
    const dy = (there.y - here.y) * 0.5 * height;
    return Math.hypot(dx, dy) / Math.max(atDeviation, 1e-6);
  }

  /** Everything a visitor is allowed to disturb. The body holds; it always has. */
  get pressable(): Piece[] {
    return this.pieces.filter((p) => p.kind === 'slab' || p.kind === 'chunk');
  }

  /** Move one piece off its recorded seat. `u` is in drift lengths. */
  setDeviation(index: number, u: number, enforcing = 0): void {
    const piece = this.pressable[index];
    if (!piece) return;
    piece.deviation = u;
    this.place(piece);

    // The record, made visible. Amber sits at the seat the piece is supposed
    // to occupy, so the deviation has something to be measured against —
    // which is the whole reason a press could move a slab and read as
    // nothing. Presence rises with separation and is gone at rest.
    const ghost = this.ghosts[index];
    if (!ghost) return;
    const separation = Math.abs(u) * piece.drift.length();
    const presence = Math.min(separation / 0.35, 1);
    ghost.visible = presence > 0.004;
    if (ghost.visible) {
      ghost.position.copy(piece.home);
      ghost.quaternion.copy(piece.mesh.quaternion);
      const uniforms = (ghost.material as THREE.ShaderMaterial).uniforms;
      uniforms.uPresence.value = presence;
      uniforms.uEnforce.value = enforcing;
    }
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
    for (const ghost of this.ghosts) (ghost.material as THREE.Material).dispose();
    this.ghostMaterial?.dispose();
    this.ghostMaterial = null;
    this.ghosts.length = 0;

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
