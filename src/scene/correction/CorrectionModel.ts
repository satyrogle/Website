import * as THREE from 'three';

import bladeVert from '../../shaders/correction-blade.vert.glsl?raw';
import bladeFrag from '../../shaders/correction-blade.frag.glsl?raw';
import type { CorrectionSnapshot, StructureHandoff } from './sim/PulseClient';

/**
 * CorrectionModel — the choir as geometry.
 *
 * One instanced draw of thousands of thin tapered blades, each placed and
 * oriented by the law, each displaced every frame by the authoritative state.
 * They are solid bodies with width, orientation and real depth, so they occlude
 * one another and turn their faces as they move.
 *
 * Not lines and not points. A line has no orientation and no thickness, so it
 * cannot occlude, cannot catch light at a grazing angle and cannot show that a
 * blade has turned — and a field of one-pixel strokes reads as a network
 * diagram whatever it is doing. The proposition is that these are separate
 * physical things obeying one law, and a diagram cannot say that.
 *
 * Two passes over the same geometry:
 *
 *   world   where each blade actually is
 *   ghost   where the law says it should be — invisible while they agree
 *
 * The ghost is the record made visible, and it costs nothing at rest because
 * its opacity is driven by the disagreement itself.
 */

export interface CorrectionModelOptions {
  structure: StructureHandoff;
}

/** Segments along a blade. Enough for the taper and the bow to read as curves. */
const SEGMENTS = 5;

/**
 * Vertices across a blade's width.
 *
 * Four, not two. A two-vertex strip is flat, and a flat surface has one normal
 * and therefore one tone — six thousand of them rendered as uniformly lit
 * shards with nothing for a grazing light to catch. Four columns make the
 * cross-section a shallow arc, which is what gives every blade a dark body and
 * a lit edge.
 */
const COLUMNS = 4;

/**
 * Radians of swing per unit of state.
 *
 * A press peaks around 0.8, so an escaped blade turns about eighteen degrees
 * out of the comb its neighbours are still in — unmistakable in greyscale.
 * Ambient drift peaks at 0.027, which is under a degree: the held breath the
 * opening is supposed to be, rather than sway.
 */
export const SWING = 0.38;

/** Hard ceiling on the swing, so a runaway state cannot turn a blade inside out. */
export const SWING_CLAMP = 0.52;

/** Sideways slip per unit of state, as a fraction of blade length. */
export const SLIP = 0.15;

/**
 * Blade width at the tip, as a fraction of its width at the base.
 *
 * Between the thicket of thorns 0.14 produced and the blunt rounded heads 0.34
 * produced. Narrow enough to be a blade, square enough not to be a spike — and
 * the slant cut does most of the work of making the end read as made.
 */
export const TIP = 0.28;

/** Lengthwise bow, as a fraction of blade length. */
export const BOW = 0.06;

/**
 * The angle between a blade's two facets, in radians.
 *
 * The single most important number in the material. At zero every blade is a
 * flat plate with one tone. Smoothly fanned it becomes a rounded tube. Creased,
 * each half is flat and takes the light at its own angle, so one side goes
 * bright while the other stays black and the ridge draws a hard line down the
 * blade.
 */
export const CREASE = 0.5;

/** Depth of the fold along the crease, as a fraction of blade width. */
export const FOLD = 0.32;

/** How far the tip is cut back on one side, as a fraction of blade length. */
export const CHISEL = 0.12;

/** How sharply the grazing edge falls off across a blade's face. */
export const EDGE_POWER = 2.4;

/**
 * The record's light.
 *
 * One fixed direction, held in view space so the choir is lit the same way at
 * every point on the rail. A blade runs bright where its length agrees with it,
 * so what the light shows is the agreement itself.
 */
export const SHEEN = { weight: 0.75, power: 48 };
export const LIGHT_DIRECTION = { x: -0.38, y: 0.62, z: 0.69 };

/** Brightness of the approved state. This is what carries the calm. */
export const RECORD_GAIN = 1.7;

/**
 * Extra edge light on blades crowding past the absence.
 *
 * The aureole, and the only place in the pipeline that knows the absence
 * exists at all. It is a gain on an accumulation of lit edges — never an
 * emitter, never a disc, never a ring.
 */
export const SHELL_GAIN = 4.2;

/**
 * Where the far field starts giving its light back, and over what distance.
 *
 * The choir is about twenty-two units deep and was rendering every blade at the
 * same brightness whatever its distance, which is why it read as one flat sheet
 * of texture rather than as three zones. Everything nearer than `near` is at
 * full strength; past it, light falls away exponentially into black.
 */
export const RECESSION = { near: 13, range: 11 };

/** The deviation response. Exported so the dev panel cannot drift from it. */
export const GLOW = { scale: 5.9, gamma: 2.05 };

/** Brightness of the ghost where the world and the record disagree. */
export const GHOST_GAIN = 0.85;

export class CorrectionModel {
  readonly group = new THREE.Group();
  readonly nodeCount: number;

  private readonly positions: Float32Array;
  private readonly directions: Float32Array;
  private readonly tangents: Float32Array;
  private readonly dims: Float32Array;

  private readonly stateTexture: THREE.DataTexture;
  private readonly stateData: Float32Array<ArrayBuffer>;
  private readonly textureSize: number;

  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly ghostMaterial: THREE.ShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;

  private readonly hitPoint = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly arm = new THREE.Vector3();

  /** Live so the dev panel can move it; the shipped value is the default. */
  private swing = SWING;

  constructor(options: CorrectionModelOptions) {
    const { structure } = options;
    this.nodeCount = structure.nodeCount;
    this.positions = structure.positions;
    this.directions = structure.directions;
    this.tangents = structure.tangents;
    this.dims = structure.dims;
    this.textureSize = structure.textureSize;

    // --------------------------------------------------------- state texture
    this.stateData = new Float32Array(this.textureSize * this.textureSize * 4);
    this.stateTexture = new THREE.DataTexture(
      this.stateData,
      this.textureSize,
      this.textureSize,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    // texelFetch at exact integer coordinates: no filtering, no wrapping, no
    // chance of a blade reading a neighbour's state.
    this.stateTexture.minFilter = THREE.NearestFilter;
    this.stateTexture.magFilter = THREE.NearestFilter;
    this.stateTexture.generateMipmaps = false;
    this.stateTexture.needsUpdate = true;

    // ------------------------------------------------------- the unit blade
    //
    // A strip two vertices wide, carried in `position` as (side, along, 0).
    // The vertex shader builds the real thing from the instance's own frame,
    // so this buffer is the same twelve vertices for every blade in the choir.

    const rows = SEGMENTS + 1;
    const unit = new Float32Array(rows * COLUMNS * 3);
    for (let r = 0; r < rows; r++) {
      const along = r / SEGMENTS;
      for (let c = 0; c < COLUMNS; c++) {
        const at = (r * COLUMNS + c) * 3;
        unit[at] = (c / (COLUMNS - 1)) * 2 - 1;
        unit[at + 1] = along;
        unit[at + 2] = 0;
      }
    }

    const indices: number[] = [];
    for (let r = 0; r < SEGMENTS; r++) {
      for (let c = 0; c < COLUMNS - 1; c++) {
        const a = r * COLUMNS + c;
        const b = a + 1;
        const d = a + COLUMNS;
        const e = d + 1;
        indices.push(a, b, d, b, e, d);
      }
    }

    // ---------------------------------------------------------- per instance

    const nodeIndex = new Float32Array(this.nodeCount);
    for (let i = 0; i < this.nodeCount; i++) nodeIndex[i] = i;

    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(unit, 3));
    this.geometry.setIndex(indices);
    this.geometry.setAttribute('iAnchor', new THREE.InstancedBufferAttribute(structure.positions, 3));
    this.geometry.setAttribute('iTangent', new THREE.InstancedBufferAttribute(structure.tangents, 3));
    this.geometry.setAttribute('iNormal', new THREE.InstancedBufferAttribute(structure.directions, 3));
    this.geometry.setAttribute('iDims', new THREE.InstancedBufferAttribute(structure.dims, 2));
    this.geometry.setAttribute('iShape', new THREE.InstancedBufferAttribute(structure.shape, 3));
    this.geometry.setAttribute('iNode', new THREE.InstancedBufferAttribute(nodeIndex, 1));
    this.geometry.instanceCount = this.nodeCount;

    // Shared between both passes, so a tuning change cannot leave the world and
    // its record describing different numbers.
    this.uniforms = {
      uState: { value: this.stateTexture },
      uTextureSize: { value: this.textureSize },
      uSwing: { value: SWING },
      uSwingClamp: { value: SWING_CLAMP },
      uSlip: { value: SLIP },
      uTip: { value: TIP },
      uBow: { value: BOW },
      uCrease: { value: CREASE },
      uFold: { value: FOLD },
      uChisel: { value: CHISEL },
      // Amber in fact, not just in the grammar table — but barely. The original
      // value measured as neutral grey off the canvas; the first correction
      // overshot into gold. Parchment: warm enough to read as the record's
      // colour, pale enough to stay light rather than material.
      uRecord: { value: new THREE.Color('#e7dcba') },
      uWorld: { value: new THREE.Color('#4dd0ff') },
      uConsequence: { value: new THREE.Color('#a45fd6') },
      uEdge: { value: EDGE_POWER },
      uRecordGain: { value: RECORD_GAIN },
      uShellGain: { value: SHELL_GAIN },
      uLightDir: {
        value: new THREE.Vector3(
          LIGHT_DIRECTION.x,
          LIGHT_DIRECTION.y,
          LIGHT_DIRECTION.z
        ).normalize(),
      },
      uSheen: { value: SHEEN.weight },
      uSheenPower: { value: SHEEN.power },
      // Cyan is the deviation and only the deviation:
      //
      //   ambient drift  0.027  ->  0.02   effectively absent
      //   engagement     0.180  ->  0.42   the system starts to react here
      //   struck peak    0.810  ->  1.00   the escape
      uGlowScale: { value: GLOW.scale },
      uGlowGamma: { value: GLOW.gamma },
      uContactScale: { value: 20 },
      uContactGamma: { value: 0.5 },
      uBruiseScale: { value: 8 },
      uBruiseGamma: { value: 0.6 },
      uBruiseWeight: { value: 0.55 },
      uGhostGain: { value: GHOST_GAIN },
      uRecessionNear: { value: RECESSION.near },
      uRecessionRange: { value: RECESSION.range },
      uExposure: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: bladeVert,
      fragmentShader: bladeFrag,
      uniforms: this.uniforms,
      // Opaque and depth-tested, because the blades have to occlude each other.
      // Additive blending would make the choir one transparent haze with no
      // depth order, which is exactly the particle-cloud read.
      transparent: false,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
    });

    this.ghostMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: bladeVert,
      fragmentShader: bladeFrag,
      uniforms: this.uniforms,
      defines: { GHOST: '' },
      // Additive and depth-tested but not depth-writing: the record is not a
      // second object in the world, it is a claim about where the world should
      // be. It must not occlude anything, and it must be hidden by anything in
      // front of it.
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    });

    const world = new THREE.Mesh(this.geometry, this.material);
    world.frustumCulled = false;

    const ghost = new THREE.Mesh(this.geometry, this.ghostMaterial);
    ghost.frustumCulled = false;
    ghost.renderOrder = 1;

    this.group.add(world);
    this.group.add(ghost);
  }

  /** Uploads one authoritative snapshot. The only path state takes to the GPU. */
  applySnapshot(snapshot: CorrectionSnapshot): void {
    this.applyState(snapshot.data);
  }

  /** The same upload, for a state that did not arrive as a live snapshot. */
  applyState(data: Float32Array): void {
    this.stateData.set(data);
    this.stateTexture.needsUpdate = true;
  }

  /** Development only: the render-side numbers, live. */
  tune(patch: Record<string, number>): void {
    for (const [key, value] of Object.entries(patch)) {
      const uniform = this.uniforms[key];
      if (uniform) uniform.value = value;
    }
    if (patch.uSwing !== undefined) this.swing = patch.uSwing;
  }

  /** Cold-open reveal, and the machine-off cut. */
  setExposure(value: number): void {
    this.uniforms.uExposure.value = value;
  }

  /**
   * Nearest blade to a ray, by perpendicular distance to its midpoint.
   *
   * Tested against the deviated pose rather than the approved one, so a press
   * lands on the blade the visitor can actually see — which matters most
   * exactly when it matters at all, on a blade that has already been knocked
   * out of the comb.
   */
  nodeUnderRay(ray: THREE.Ray, tolerance = 1.4): number {
    let best = -1;
    let bestScore = Infinity;

    for (let i = 0; i < this.nodeCount; i++) {
      const at = i * 3;
      const u = this.stateData[i * 4];
      const angle = Math.max(Math.min(u * this.swing, SWING_CLAMP), -SWING_CLAMP);

      this.axis.set(this.directions[at], this.directions[at + 1], this.directions[at + 2]);
      this.arm
        .set(this.tangents[at], this.tangents[at + 1], this.tangents[at + 2])
        .applyAxisAngle(this.axis, angle)
        .multiplyScalar(this.dims[i * 2] * 0.5);

      this.hitPoint
        .set(this.positions[at], this.positions[at + 1], this.positions[at + 2])
        .add(this.arm);

      const distance = ray.distanceSqToPoint(this.hitPoint);
      if (distance < bestScore) {
        bestScore = distance;
        best = i;
      }
    }

    return bestScore <= tolerance * tolerance ? best : -1;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.ghostMaterial.dispose();
    this.stateTexture.dispose();
  }
}
