import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';


import latticeVert from '../shaders/lattice.vert.glsl?raw';
import latticeFrag from '../shaders/lattice.frag.glsl?raw';
import ringVert from '../shaders/ring.vert.glsl?raw';
import ringFrag from '../shaders/ring.frag.glsl?raw';

/**
 * LatticeModel — ENTITY v7: THE CROWNED CONVERGENCE
 *
 * Rebuilt to the founder's reference sheet ("Entity Hybrid // 04 Hollow
 * Convergence + 10 Silent Crown", Aug 2026). The previous kite-door
 * monolith is dead: its tall almond silhouette with a central vertical
 * seam read as anatomy, and its two swinging leaves swept the lens as a
 * pale wall — the "white door" that survived every dimming pass because
 * it was the geometry, not the lighting.
 *
 * The replacement is built from the sheet's structure breakdown:
 *
 *   OUTER CROWN — seven major obsidian slabs (plus spike satellites and
 *   a back shell) in a top-heavy, deliberately irregular wreath around
 *   a recessed throat. Asymmetric harmony: nothing about the spacing,
 *   scale or lean repeats. The silhouette is all points.
 *
 *   RING SYSTEM — three nested faceted rings inside the throat, turning
 *   against each other. Dormant they barely creep; they spin up as the
 *   visitor approaches. "The rings turn. The pull strengthens."
 *
 *   CORE — a recessed pupil of small shards around a burning kernel,
 *   deep inside. From the hero distance it is a cold eye looking back
 *   down the rail. When the crown yields, the kernel recedes down the
 *   corridor — the light withdraws, and the finale is meeting it again.
 *
 *   HALO — the silent crown. One thin amber ring, stable orbit, the
 *   only calm element in the composition. During the opening it tilts
 *   down and descends to become the threshold: the camera passes
 *   THROUGH it into the tunnel. The far twin keeps its halo burning
 *   for the arrival.
 *
 * The far gate is the same build mirrored at the end of the corridor,
 * sealed forever. The tunnel rings between them are untouched — the
 * registered mandala and the deep DMT bloom are locked at 10/10.
 *
 * Graveyard (do not rebuild): kite door with vertical seam ("looks like
 * anatomy"); swinging door leaves (white wall at the tear); plus the
 * full v3–v5 graveyard recorded in project memory.
 */

/**
 * Half-extent of the object-space XY projection the reaction field is
 * sampled through. Must COVER the object's XY footprint (crown spikes
 * reach ~4.3, tunnel rings ~5.4). Duplicated as 4.5 in
 * reaction.frag.glsl and seed.frag.glsl — keep the three in step.
 */
const FIELD_EXTENT = 9.0;

/** Tunnel rings between the two crowns. */
export const RINGS = 11;
export const RING_SPACING = 1.7;
/** First ring sits just behind the near crown's throat. */
const RING_START_Z = -2.4;
/** Ring outer/aperture radii. The aperture is the camera's clearance. */
const RING_OUTER = 4.9;
const RING_APERTURE = 1.55;
/**
 * Far crown centre. Far enough past the last ring (-19.4) that the
 * finale can frame the whole entity from ~9.5 units out.
 */
export const FAR_DOOR_Z = -33.6;

/**
 * The throat point: where the convergence light lives, gate-local.
 * The vertex/fragment shaders and the infall particles all aim here —
 * one shared depth is what makes the recess read as a single socket.
 */
const THROAT_Z = -1.6;
/** Kernel centre, gate-local — duplicated in lattice.vert.glsl. */
const KERNEL_Z = -2.02;

export interface LatticeLayerState {
  offset: THREE.Vector3;
  focus: number;
}

interface BuildOptions {
  detail: number;
  veinCount: number;
}

/**
 * Geometry roles:
 * 0 = crown slab (yields radially when the near gate opens)
 * 1 = tunnel ring (locked — the mandala/DMT canvas)
 * 2 = gyre ring (counter-rotating nested rings in the throat)
 * 3 = core (aShell 0 = pupil shard, 1 = burning kernel)
 */
export const KIND_CROWN = 0;
export const KIND_RING = 1;
export const KIND_GYRE = 2;
export const KIND_CORE = 3;

/**
 * Prepares a primitive for merging.
 *
 * Everything is flattened to non-indexed first. Box primitives are
 * indexed and the polyhedra are not, and mergeGeometries requires the
 * whole set to agree. Non-indexed is the right side to land on anyway:
 * it gives the slabs genuinely flat per-face normals, which is what
 * makes the object read as cut crystal rather than a smoothed solid.
 */
function prepare(
  source: THREE.BufferGeometry,
  layer: number,
  seed: number,
  kind: number = KIND_CROWN,
  /** Gyre index for KIND_GYRE; 1 marks the kernel for KIND_CORE. */
  shell: number = 0,
  /** Which gate along the corridor this belongs to (0 near, 99 far). */
  gate: number = 0,
  /** Piece pivot in final baked coordinates — the choreography hinge. */
  center: THREE.Vector3 = ORIGIN
): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();

  const count = geometry.attributes.position.count;
  const layers = new Float32Array(count).fill(layer);
  const seeds = new Float32Array(count).fill(seed);
  const kinds = new Float32Array(count).fill(kind);
  const shells = new Float32Array(count).fill(shell);
  const gates = new Float32Array(count).fill(gate);
  const centers = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    centers[i * 3 + 0] = center.x;
    centers[i * 3 + 1] = center.y;
    centers[i * 3 + 2] = center.z;
  }
  geometry.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute('aShell', new THREE.BufferAttribute(shells, 1));
  geometry.setAttribute('aGate', new THREE.BufferAttribute(gates, 1));
  geometry.setAttribute('aCenter', new THREE.BufferAttribute(centers, 3));
  if (!geometry.attributes.uv) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return geometry;
}

const ORIGIN = new THREE.Vector3();

/** Deterministic pseudo-random so the object is identical every load. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function smoothstep01(x: number): number {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
}

/** Infall particle parameters, one record per particle. */
interface InfallParams {
  r0: Float32Array;
  th0: Float32Array;
  z0: Float32Array;
  rate: Float32Array;
  phase: Float32Array;
  swirl: Float32Array;
  far: Float32Array;
}

export class LatticeModel {
  readonly group = new THREE.Group();
  readonly core: THREE.Mesh;
  readonly ring: THREE.Mesh;
  readonly ringFar!: THREE.Mesh;
  readonly shed: THREE.Points | null = null;

  readonly material: THREE.RawShaderMaterial;
  readonly ringMaterial: THREE.RawShaderMaterial;
  private shedMaterial: THREE.PointsMaterial | null = null;
  private infall: InfallParams | null = null;

  readonly layers: LatticeLayerState[] = [
    { offset: new THREE.Vector3(), focus: 1 },
    { offset: new THREE.Vector3(), focus: 1 },
    { offset: new THREE.Vector3(), focus: 1 },
  ];

  /**
   * Halo rest pose. The halo crowns the mass — clearly inside the hero
   * frame, tilted just off horizontal so it reads as an ellipse, subtly
   * askew so it never looks machined onto the entity's axis.
   */
  private static readonly HALO_Y = 3.5;
  private static readonly HALO_Z = 0.35;
  private static readonly HALO_TILT = 1.12;
  private static readonly HALO_SKEW = 0.1;

  constructor(options: BuildOptions, shedding: boolean) {
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: latticeVert,
      fragmentShader: latticeFrag,
      // Every piece is a closed solid, so back faces are never seen even
      // when the camera is inside the lattice. Halves the fragment work.
      side: THREE.FrontSide,
      uniforms: {
        uField: { value: null },
        uFieldExtent: { value: FIELD_EXTENT },
        uDisplace: { value: 0.055 },
        uTime: { value: 0 },
        uFarZ: { value: FAR_DOOR_Z },

        uLayerOffset0: { value: this.layers[0].offset },
        uLayerOffset1: { value: this.layers[1].offset },
        uLayerOffset2: { value: this.layers[2].offset },
        uLayerFocus: { value: new THREE.Vector3(1, 1, 1) },

        uKeyDir: { value: new THREE.Vector3(0.45, 0.82, 0.36).normalize() },
        uKeyColor: { value: new THREE.Color('#dff9ff') },
        uKeyIntensity: { value: 1.0 },

        uRimDir: { value: new THREE.Vector3(-0.6, 0.32, -0.72).normalize() },
        uRimColor: { value: new THREE.Color('#cfeaff') },
        uRimIntensity: { value: 1.35 },

        uFillColor: { value: new THREE.Color('#121923') },
        uFillIntensity: { value: 1.1 },

        uBaseColor: { value: new THREE.Color('#1c2634') },
        uRoughness: { value: 0.62 },
        uMetalness: { value: 0.7 },

        uIndigo: { value: new THREE.Color('#4634d8') },
        uMagenta: { value: new THREE.Color('#e14bff') },
        uFlow: { value: 0 },
        uTeal: { value: new THREE.Color('#36e0b0') },
        uCyan: { value: new THREE.Color('#4dd0ff') },
        uColdWhite: { value: new THREE.Color('#dff9ff') },
        uAmber: { value: new THREE.Color('#c9a24a') },
        uEmissive: { value: 1.0 },
        uAmberMix: { value: 0 },
        uFieldSharp: { value: 0.5 },

        uWake: { value: 0 },
        uSeparation: { value: 0 },
        uPsy: { value: 0 },
        uRip: { value: 0 },
        uTear: { value: 0 },
        uArrive: { value: 0 },
        /** Gyre activity: how hard the rings turn. 0 dormant, ~1.7 open. */
        uGyre: { value: 0.35 },
        uFogDensity: { value: 0.052 },
        uFogColor: { value: new THREE.Color('#080b10') },
      },
    });

    this.core = new THREE.Mesh(this.buildCore(options), this.material);
    this.core.frustumCulled = false;
    this.group.add(this.core);

    this.ringMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      side: THREE.DoubleSide,
      uniforms: {
        uField: { value: null },
        uFieldExtent: { value: FIELD_EXTENT },
        uTime: { value: 0 },
        uBreathe: { value: 1 },
        uColorCore: { value: new THREE.Color('#ffeac2') },
        uColorEdge: { value: new THREE.Color('#d9a75e') },
        uAmber: { value: new THREE.Color('#c9a24a') },
        uAmberMix: { value: 0 },
        uIntensity: { value: 2.6 },
        uWake: { value: 0 },
        uSegments: { value: 34 },
        uFlow: { value: 0 },
        uRip: { value: 0 },
        uTear: { value: 0 },
        uArrive: { value: 0 },
        /** 0 = crown overhead, 1 = threshold facing the camera. */
        uGateway: { value: 0 },
      },
    });

    // The halo is a single hair-thin CONTINUOUS band — MAT_HALO on the
    // founder's sheet: stable orbit, MINIMAL REACTION. On the sheet it
    // spans barely over half the crown's width and carries no glare;
    // the wide bright ring read as a lamp. It sits close over the
    // apex, dim at rest (below the bloom threshold — glare belongs to
    // the gateway and the arrival only).
    const radial = Math.max(96, Math.round(240 * options.detail));
    const tubular = Math.max(6, Math.round(12 * options.detail));
    const ringGeometry = new THREE.TorusGeometry(2.0, 0.016, tubular, radial);
    this.ring = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.ring.frustumCulled = false;
    this.group.add(this.ring);
    this.setGateway(0);

    // The far crown keeps its halo for the whole journey: a beacon at
    // the end of the tunnel, burning steady above the sealed twin. It
    // sits slightly lower than the near halo — the finale camera frames
    // the twin from 10.5 units with a 38° lens, and at the shared
    // height the ring's crest clips the header band.
    this.ringFar = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.ringFar.rotation.x = LatticeModel.HALO_TILT;
    this.ringFar.rotation.z = -LatticeModel.HALO_SKEW;
    this.ringFar.position.set(0, 3.2, FAR_DOOR_Z - LatticeModel.HALO_Z);
    this.ringFar.frustumCulled = false;
    this.group.add(this.ringFar);

    if (shedding) {
      this.shed = this.buildInfall();
      this.group.add(this.shed);
    }
  }

  // ------------------------------------------------------------------
  //  Geometry
  // ------------------------------------------------------------------

  private buildCore(options: BuildOptions): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const bevelSegments = options.detail >= 0.9 ? 2 : 1;

    /**
     * One jagged shard: an irregular convex-ish polygon, extruded thin.
     * Long axis along +X — the radial direction before placement. The
     * spike vertex is always the one at angle 0, i.e. it always points
     * OUTWARD once placed: spikes serve the silhouette. Vertices on the
     * inner side (cos < -0.2) are jitter-capped so no slab can reach
     * across the mouth and hide the recessed core from the rail.
     */
    const shard = (
      seed: number,
      length: number,
      width: number,
      thickness: number
    ): THREE.ExtrudeGeometry => {
      const n = 5 + Math.floor(rand(seed * 3.1) * 2); // 5 or 6 vertices
      const shape = new THREE.Shape();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const inner = Math.cos(a) < -0.2;
        // Inner vertices are FIXED short: with only seven big slabs on
        // a tight radius, a jittered inner tip can cross the axis and
        // block the rail's sightline to the kernel.
        const jitter = inner ? 0.62 : 0.72 + rand(seed * 9.3 + i * 2.7) * 0.56;
        const spike = i === 0 ? 1.45 : 1.0;
        const x = Math.cos(a) * length * 0.5 * jitter * spike;
        const y = Math.sin(a) * width * 0.5 * jitter * (i === 0 ? 0.72 : 1.0);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.05,
        bevelSegments,
        curveSegments: 1,
      });
    };

    /** Applies the far-gate mirror to a finished gate-local geometry. */
    const finalize = (
      g: THREE.BufferGeometry,
      far: boolean,
      center: THREE.Vector3
    ): THREE.Vector3 => {
      if (far) {
        g.rotateY(Math.PI);
        g.translate(0, 0, FAR_DOOR_Z);
        center.set(-center.x, center.y, -center.z + FAR_DOOR_Z);
      }
      return center;
    };

    // ---- The crowned convergence, one per gate ----------------------
    const buildCrown = (gate: number, far: boolean) => {
      const gs = gate * 7.1 + 2.3;

      // OUTER CROWN — rugged, COHERENT armour. Seven major plates on a
      // near-regular heptagon with seven smaller infill shards seated
      // in the gaps behind them: the sheet's fidelity comes from a
      // clear big/small hierarchy, not from scatter. Placement
      // variance is deliberately SMALL — uniform lean, near-zero roll,
      // tight radius band — so the plates read as one suit of armour
      // wrapping the throat. Random thetas, rolls and scales were
      // tried twice and both times read as debris, not a being.
      const MAJORS = 7;
      const STEP = (Math.PI * 2) / MAJORS;
      for (let i = 0; i < MAJORS; i++) {
        const seed = rand(gs + i * 3.3);
        const theta = i * STEP + Math.PI / 2 + (rand(gs + i * 7.7) - 0.5) * 0.14;
        // Top-heavy, gently: the upper plates carry a fifth more mass.
        const topness = Math.sin(theta) * 0.5 + 0.5;
        const scale = 0.98 + topness * 0.2 + seed * 0.06;
        const radius = 2.0 + (rand(gs + i * 11.3) - 0.5) * 0.25;

        const g = shard(gs + i * 13.7, 3.2 * scale, 2.5 * scale, 1.15 + seed * 0.2);
        // Uniform steep lean into the throat; the armour agrees on its
        // own geometry. Foreshortening still does the composition's
        // work — the rail sees edges and bevels, not faces.
        g.rotateY(-(0.6 + rand(gs + i * 17.9) * 0.12));
        g.rotateX((rand(gs + i * 19.3) - 0.5) * 0.25);
        g.rotateZ(theta);
        const cx = Math.cos(theta) * radius;
        const cy = Math.sin(theta) * radius;
        const cz = -0.4 - seed * 0.25;
        g.translate(cx, cy, cz);
        const center = finalize(g, far, new THREE.Vector3(cx, cy, cz));
        parts.push(prepare(g, 1, seed, KIND_CROWN, 0, gate, center));

        // Infill shard: half-scale, seated in the gap behind the
        // majors at larger radius — MAT_STRUCTURE, the quiet support
        // layer. aShell 1 marks it so the fragment stage mutes its
        // veins and darkens its base: material hierarchy, not clutter.
        const seed2 = rand(gs + i * 23.9);
        const theta2 = theta + STEP * 0.5 + (rand(gs + i * 29.3) - 0.5) * 0.08;
        const g2 = shard(gs + i * 27.1, 1.7 * scale, 1.35 * scale, 0.6);
        g2.rotateY(-(0.68 + rand(gs + i * 31.7) * 0.1));
        g2.rotateX((rand(gs + i * 33.1) - 0.5) * 0.2);
        g2.rotateZ(theta2);
        const r2 = 2.6 + (rand(gs + i * 35.9) - 0.5) * 0.2;
        const c2x = Math.cos(theta2) * r2;
        const c2y = Math.sin(theta2) * r2;
        const c2z = -0.9 - seed2 * 0.2;
        g2.translate(c2x, c2y, c2z);
        const center2 = finalize(g2, far, new THREE.Vector3(c2x, c2y, c2z));
        parts.push(prepare(g2, 1, seed2, KIND_CROWN, 1, gate, center2));
      }

      // RING SYSTEM — three nested faceted rings in the throat. Nine
      // irregular segments each, apertures stepping down toward the
      // core. They counter-rotate in the vertex stage.
      const GYRES: [number, number, number][] = [
        // [outer radius, aperture, z] — stepping down into the socket
        [2.0, 1.58, -0.65],
        [1.62, 1.28, -1.15],
        [1.28, 1.0, -1.62],
      ];
      GYRES.forEach(([outer, aperture, z], k) => {
        const seed = rand(gs + 90 + k * 4.7);
        const shape = new THREE.Shape();
        const hole = new THREE.Path();
        const SEG = 9;
        for (let s = 0; s < SEG; s++) {
          const a = (s / SEG) * Math.PI * 2 + k * 0.35;
          const wobble = 1 + (rand(gs + 93 + k * 31.7 + s * 3.1) - 0.5) * 0.09;
          const ox = Math.cos(a) * outer * wobble;
          const oy = Math.sin(a) * outer * wobble;
          if (s === 0) shape.moveTo(ox, oy);
          else shape.lineTo(ox, oy);
          const ix = Math.cos(a) * aperture;
          const iy = Math.sin(a) * aperture;
          if (s === 0) hole.moveTo(ix, iy);
          else hole.lineTo(ix, iy);
        }
        shape.closePath();
        hole.closePath();
        shape.holes.push(hole);

        const g = new THREE.ExtrudeGeometry(shape, {
          depth: 0.22,
          bevelEnabled: true,
          bevelThickness: 0.04,
          bevelSize: 0.04,
          bevelSegments,
          curveSegments: 1,
        });
        g.translate(0, 0, z - 0.11);
        const center = finalize(g, far, new THREE.Vector3(0, 0, z));
        parts.push(prepare(g, 1, seed, KIND_GYRE, k, gate, center));
      });

      // CORE PUPIL — a tight ring of small shards around the kernel,
      // deep in the socket. Dense enough that from the hero distance the
      // gaps vanish and it reads as the dark limb of a burning eye.
      const PUPIL = 11;
      for (let i = 0; i < PUPIL; i++) {
        const seed = rand(gs + 110 + i * 2.9);
        const theta = (i / PUPIL) * Math.PI * 2 + (rand(gs + 113 + i) - 0.5) * 0.3;
        const radius = 0.8 + (rand(gs + 116 + i) - 0.5) * 0.12;

        const g = shard(gs + 119 + i * 6.7, 0.62, 0.4, 0.2);
        g.rotateY(-(0.15 + rand(gs + 122 + i) * 0.35));
        g.rotateZ(theta);
        const cx = Math.cos(theta) * radius;
        const cy = Math.sin(theta) * radius;
        const cz = -1.9;
        g.translate(cx, cy, cz);
        const center = finalize(g, far, new THREE.Vector3(cx, cy, cz));
        parts.push(prepare(g, 1, seed, KIND_CORE, 0, gate, center));
      }

      // KERNEL — the light source itself. On the near gate it recedes
      // as the crown yields; on the far gate it never moves and ignites
      // at the arrival.
      const kernel = new THREE.IcosahedronGeometry(0.5, 1);
      kernel.translate(0, 0, KERNEL_Z);
      const kcenter = finalize(kernel, far, new THREE.Vector3(0, 0, KERNEL_Z));
      parts.push(prepare(kernel, 1, rand(gs + 130), KIND_CORE, 1, gate, kcenter));
    };

    // Near crown: gate 0, yields. Far crown: gate 99, never does.
    buildCrown(0, false);
    buildCrown(99, true);

    // ---- The tunnel rings — LOCKED ----------------------------------
    // Whole octagonal rings — no split, no rails, no axis. Their inner
    // walls are the trip's canvas; the aperture is generous so the
    // straight-rail camera always has clean air.
    for (let r = 0; r < RINGS; r++) {
      const z = RING_START_Z - r * RING_SPACING;
      const seed = rand(r * 17.3 + 2.9);
      const outer = RING_OUTER * (1 + r * 0.02);
      const aperture = RING_APERTURE * (1 - r * 0.012);

      const shape = new THREE.Shape();
      const hole = new THREE.Path();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const wobble = 1 + (rand(r * 31.7 + k * 3.1) - 0.5) * 0.06;
        const ox = Math.cos(a) * outer * wobble;
        const oy = Math.sin(a) * outer * wobble;
        if (k === 0) shape.moveTo(ox, oy);
        else shape.lineTo(ox, oy);

        const ix = Math.cos(a) * aperture;
        const iy = Math.sin(a) * aperture;
        if (k === 0) hole.moveTo(ix, iy);
        else hole.lineTo(ix, iy);
      }
      shape.closePath();
      hole.closePath();
      shape.holes.push(hole);

      const depth = 0.5 + seed * 0.25;
      const ring = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments,
        curveSegments: 1,
      });
      ring.translate(0, 0, z - depth * 0.5);

      // Thirds along the corridor, for the foundation separation.
      const layer = r < RINGS / 3 ? 0 : r < (RINGS * 2) / 3 ? 1 : 2;
      parts.push(prepare(ring, layer, seed, KIND_RING, 0, 1, ORIGIN));
    }

    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());

    if (!merged) {
      throw new Error('Lattice geometry merge failed');
    }
    merged.computeBoundingSphere();
    return merged;
  }

  /**
   * The pull, made visible: particles sampled from the crown's own
   * surface spiral inward and vanish into the throat, endlessly. They
   * belong to the object — every particle starts on a real vertex —
   * and their motion is the entity's one continuous statement:
   * everything nearby is being drawn in.
   */
  private buildInfall(): THREE.Points {
    const source = this.core.geometry.attributes.position;
    const gates = this.core.geometry.attributes.aGate;
    const kinds = this.core.geometry.attributes.aKind;

    // Sample crown vertices only, from both gates.
    const COUNT = 640;
    const positions = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const params: InfallParams = {
      r0: new Float32Array(COUNT),
      th0: new Float32Array(COUNT),
      z0: new Float32Array(COUNT),
      rate: new Float32Array(COUNT),
      phase: new Float32Array(COUNT),
      swirl: new Float32Array(COUNT),
      far: new Float32Array(COUNT),
    };

    let placed = 0;
    let cursor = 0;
    const stride = Math.max(1, Math.floor(source.count / (COUNT * 2)));
    while (placed < COUNT && cursor < source.count) {
      const kind = kinds.getX(cursor);
      if (kind === KIND_CROWN) {
        const far = gates.getX(cursor) > 50 ? 1 : 0;
        const x = source.getX(cursor);
        const y = source.getY(cursor);
        const z = source.getZ(cursor) - far * FAR_DOOR_Z;
        const r = Math.hypot(x, y);
        if (r > 1.1) {
          const i = placed;
          params.r0[i] = Math.min(r * (1.02 + rand(i * 1.7) * 0.1), 4.4);
          // Mirrored gate: bake the angle from the mirrored x.
          params.th0[i] = Math.atan2(y, far ? -x : x);
          params.z0[i] = far ? -z : z;
          params.rate[i] = 0.045 + rand(i * 3.1) * 0.05;
          params.phase[i] = rand(i * 5.3);
          params.swirl[i] = 0.1 + rand(i * 7.9) * 0.14;
          params.far[i] = far;
          sizes[i] = 0.4 + rand(i * 3.3) * 0.8;
          placed++;
        }
      }
      cursor += stride;
    }

    this.infall = params;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setDrawRange(0, placed);

    this.shedMaterial = new THREE.PointsMaterial({
      size: 0.016,
      color: new THREE.Color('#4dd0ff'),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, this.shedMaterial);
    points.frustumCulled = false;
    return points;
  }

  // ------------------------------------------------------------------
  //  Runtime
  // ------------------------------------------------------------------

  bindField(texture: THREE.Texture): void {
    this.material.uniforms.uField.value = texture;
    this.ringMaterial.uniforms.uField.value = texture;
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
    this.ringMaterial.uniforms.uTime.value = time;

    const focus = this.material.uniforms.uLayerFocus.value as THREE.Vector3;
    focus.set(this.layers[0].focus, this.layers[1].focus, this.layers[2].focus);

    if (this.shed && this.infall) {
      // Each particle rides one endless infall cycle: spawn on its home
      // vertex, spiral inward with the swirl accelerating as the radius
      // dies, get swallowed at the throat, respawn. fract() gives the
      // cycle; the power on the radius makes the last third of the fall
      // visibly faster than the first — the pull strengthening.
      const p = this.infall;
      const attr = this.shed.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const n = this.shed.geometry.drawRange.count;
      for (let i = 0; i < n; i++) {
        const cycle = (time * p.rate[i] + p.phase[i]) % 1;
        const fall = Math.pow(cycle, 0.72);
        const r = p.r0[i] * (1 - fall) + 0.06;
        const th = p.th0[i] - time * p.swirl[i] - fall * 2.1;
        const z = p.z0[i] + (THROAT_Z - p.z0[i]) * Math.pow(cycle, 1.35);
        const far = p.far[i];
        const x = Math.cos(th) * r;
        arr[i * 3 + 0] = far ? -x : x;
        arr[i * 3 + 1] = Math.sin(th) * r;
        arr[i * 3 + 2] = far ? -z + FAR_DOOR_Z : z;
      }
      attr.needsUpdate = true;
    }
  }

  /**
   * The halo's second job. At rest it crowns the entity; as the crown
   * yields (g = eased rip, 0..1) it tilts down to face the camera,
   * descends to the rail and widens — the threshold the visitor passes
   * through on the way into the corridor. The far halo never moves:
   * stable orbit, minimal reaction, exactly as the sheet specifies.
   */
  setGateway(g: number): void {
    // The descent rides the FIRST half of the yield: by the time the
    // camera dives for the mouth the ring is already down, facing it,
    // burning — so the pass-through happens in frame, not overhead.
    const t = smoothstep01(g / 0.55);
    this.ring.rotation.x = LatticeModel.HALO_TILT * (1 - t);
    this.ring.rotation.z = LatticeModel.HALO_SKEW * (1 - t);
    this.ring.position.set(
      0,
      LatticeModel.HALO_Y * (1 - t),
      LatticeModel.HALO_Z + t * 0.85
    );
    this.ring.scale.setScalar(1 + t * 0.28);
    this.ringMaterial.uniforms.uGateway.value = t;
  }

  /** Maps a viewport-normalised point onto the field's projection space. */
  static fieldUvFromWorld(x: number, y: number): [number, number] {
    return [x / FIELD_EXTENT + 0.5, y / FIELD_EXTENT + 0.5];
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.ring.geometry.dispose();
    this.material.dispose();
    this.ringMaterial.dispose();
    this.shed?.geometry.dispose();
    this.shedMaterial?.dispose();
  }
}
