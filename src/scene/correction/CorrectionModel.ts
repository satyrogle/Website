import * as THREE from 'three';

import surfaceVert from '../../shaders/correction-surface.vert.glsl?raw';
import surfaceFrag from '../../shaders/correction-surface.frag.glsl?raw';
import recordVert from '../../shaders/correction-record.vert.glsl?raw';
import recordFrag from '../../shaders/correction-record.frag.glsl?raw';
import type { CorrectionSnapshot, StructureHandoff } from './sim/PulseClient';

/**
 * CorrectionModel — two surfaces, because there are two things.
 *
 * The world is a mesh whose vertices are displaced every frame by the
 * authoritative state, shaded matte under one grazing light. The record is a
 * second mesh, baked once, sitting exactly ε below where the world was
 * recorded — the floor of the approved tolerance band.
 *
 * Both are opaque and depth tested, which does the grammar's work for free.
 * While the world stays inside the band it covers the record completely and no
 * amber is drawn at all: agreement is invisible. Where the world falls out of
 * the band the record is exposed, and what you are then looking at is the file.
 * Where the world rises out of it, cyan. Nothing had to be composited to say
 * that.
 *
 * The previous build drew hairlines with additive blending, which put both
 * colours on the same geometry and cancelled them to grey across most of the
 * frame — mean lit colour RGB 31,39,39. Opacity and depth fix that by
 * construction rather than by tuning.
 */

export interface CorrectionModelOptions {
  structure: StructureHandoff;
  record: Float32Array;
  /** Tolerance half-width in simulation units — how far the record sits below. */
  epsilon: number;
}

/**
 * World units of movement per unit of simulation displacement.
 *
 * A struck peak near 0.42 becomes 0.38 units against a plate spanning 22 —
 * under two percent, which as a *shape* is nothing. It does not need to be a
 * shape. At a few degrees of light incidence that swelling's slope swings the
 * shading from black to full, which is the entire reason this object is lit the
 * way it is.
 */
const DISPLACEMENT_SCALE = 0.9;

/** Shrink applied to the record in plan, so its rim never shows past the world's. */
const RECORD_INSET = 0.985;

/** Direction the key light arrives from. Almost in the plane of the plate. */
const LIGHT = new THREE.Vector3(-0.87, 0.075, -0.49).normalize();

export class CorrectionModel {
  readonly group = new THREE.Group();
  readonly nodeCount: number;

  private readonly positions: Float32Array;
  private readonly directions: Float32Array;

  private readonly stateTexture: THREE.DataTexture;
  private readonly slopeTexture: THREE.DataTexture;
  private readonly stateData: Float32Array<ArrayBuffer>;
  private readonly slopeData: Float32Array<ArrayBuffer>;
  private readonly textureSize: number;

  private readonly world: THREE.Mesh;
  private readonly record: THREE.Mesh;
  private readonly worldMaterial: THREE.ShaderMaterial;
  private readonly recordMaterial: THREE.ShaderMaterial;

  private readonly hitPoint = new THREE.Vector3();

  constructor(options: CorrectionModelOptions) {
    const { structure, record, epsilon } = options;
    this.nodeCount = structure.nodeCount;
    this.positions = structure.positions;
    this.directions = structure.directions;
    this.textureSize = structure.textureSize;

    const block = this.textureSize * this.textureSize * 4;
    this.stateData = new Float32Array(block);
    this.slopeData = new Float32Array(block);
    this.stateTexture = this.makeTexture(this.stateData);
    this.slopeTexture = this.makeTexture(this.slopeData);

    // ------------------------------------------------------------- the world
    const worldGeometry = new THREE.BufferGeometry();
    worldGeometry.setAttribute('position', new THREE.BufferAttribute(structure.positions, 3));
    worldGeometry.setAttribute('aNormal', new THREE.BufferAttribute(structure.directions, 3));

    const nodeIndex = new Float32Array(structure.nodeCount);
    for (let i = 0; i < structure.nodeCount; i++) nodeIndex[i] = i;
    worldGeometry.setAttribute('aNode', new THREE.BufferAttribute(nodeIndex, 1));
    worldGeometry.setIndex(new THREE.BufferAttribute(structure.triangles, 1));

    this.worldMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: surfaceVert,
      fragmentShader: surfaceFrag,
      uniforms: {
        uState: { value: this.stateTexture },
        uSlope: { value: this.slopeTexture },
        uTextureSize: { value: this.textureSize },
        uDisplacement: { value: DISPLACEMENT_SCALE },
        // Reads as a dark graphite on screen, which is much lighter as a hex
        // than it looks: #2b2f34 is 0.03 in linear light, and multiplied by a
        // grazing N·L of 0.075 the plate came out at a tenth of full and read
        // as a flat navy shape. Colour management converts this to linear
        // before it reaches the shader, so the value has to be chosen against
        // the lit result, not against the swatch.
        uMaterial: { value: new THREE.Color('#7d848c') },
        uWorldColour: { value: new THREE.Color('#4dd0ff') },
        uConsequence: { value: new THREE.Color('#a45fd6') },
        uLight: { value: LIGHT.clone() },
        uEye: { value: new THREE.Vector3() },
        uKey: { value: 1.9 },
        uFill: { value: 0.025 },
        uSheen: { value: 0.2 },
        // Ambient drift sits near 0.04, a struck peak near 0.42. Scale and
        // gamma rather than a saturating exponential, so brightness ranks
        // magnitude instead of clipping everything to full.
        // Low enough that the resting drift tints the surface rather than
        // colouring it: the material is what you see at rest, and cyan is what
        // the deviation adds to it.
        uGlowScale: { value: 1.3 },
        uGlowGamma: { value: 0.6 },
        uContactScale: { value: 20 },
        uContactGamma: { value: 0.5 },
        uBruiseScale: { value: 8 },
        uBruiseGamma: { value: 0.6 },
        uBruiseWeight: { value: 0.45 },
        uExposure: { value: 1 },
      },
      side: THREE.FrontSide,
    });

    this.world = new THREE.Mesh(worldGeometry, this.worldMaterial);
    this.world.frustumCulled = false;

    // ------------------------------------------------------------ the record
    //
    // Baked at the recorded state minus the tolerance: the floor of the band,
    // not its centre. That single offset is what makes agreement render
    // nothing — the world has to genuinely leave the band before any amber can
    // appear.
    const recordPositions = new Float32Array(structure.nodeCount * 3);
    for (let i = 0; i < structure.nodeCount; i++) {
      const at = i * 3;
      const drop = (record[i] - epsilon) * DISPLACEMENT_SCALE;
      // Inset in plan as well as dropped. The record sits below the world, so
      // at the plate's rim it would otherwise show past the edge as a thin
      // amber line all the way round — which reads as disagreement at exactly
      // the place where there is none. Pulling it in by a little over a tenth
      // of a unit keeps it hidden until the world genuinely leaves it.
      recordPositions[at] = (this.positions[at] + this.directions[at] * drop) * RECORD_INSET;
      recordPositions[at + 1] = this.positions[at + 1] + this.directions[at + 1] * drop;
      recordPositions[at + 2] = (this.positions[at + 2] + this.directions[at + 2] * drop) * RECORD_INSET;
    }

    const recordGeometry = new THREE.BufferGeometry();
    recordGeometry.setAttribute('position', new THREE.BufferAttribute(recordPositions, 3));
    recordGeometry.setAttribute('normal', new THREE.BufferAttribute(structure.directions.slice(), 3));
    recordGeometry.setIndex(new THREE.BufferAttribute(structure.triangles.slice(), 1));

    this.recordMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: recordVert,
      fragmentShader: recordFrag,
      uniforms: {
        uRecord: { value: new THREE.Color('#e8bf68') },
        uLight: { value: LIGHT.clone() },
        uKey: { value: 1.6 },
        uFill: { value: 0.06 },
        uExposure: { value: 1 },
      },
      side: THREE.FrontSide,
    });

    this.record = new THREE.Mesh(recordGeometry, this.recordMaterial);
    this.record.frustumCulled = false;

    this.group.add(this.record);
    this.group.add(this.world);
  }

  private makeTexture(data: Float32Array<ArrayBuffer>): THREE.DataTexture {
    const texture = new THREE.DataTexture(
      data,
      this.textureSize,
      this.textureSize,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    // Sampled with texelFetch at exact integer coordinates: no filtering, no
    // wrapping, no chance of a vertex reading a neighbour's state.
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  /** Uploads one authoritative snapshot. The only path state takes to the GPU. */
  applySnapshot(snapshot: CorrectionSnapshot): void {
    const block = this.stateData.length;
    this.stateData.set(snapshot.data.subarray(0, block));
    this.slopeData.set(snapshot.data.subarray(block, block * 2));
    this.stateTexture.needsUpdate = true;
    this.slopeTexture.needsUpdate = true;
  }

  /** Camera position, for the grazing sheen. */
  setEye(eye: THREE.Vector3): void {
    this.worldMaterial.uniforms.uEye.value.copy(eye);
  }

  /** Cold-open reveal and, later, the machine-off cut. */
  setExposure(value: number): void {
    this.worldMaterial.uniforms.uExposure.value = value;
    this.recordMaterial.uniforms.uExposure.value = value;
  }

  /**
   * Nearest node to a ray, by perpendicular distance to the *displaced*
   * surface, so a press lands where the visitor can actually see it. Linear
   * over ~3,400 nodes: well under a millisecond, and only on a press.
   */
  nodeUnderRay(ray: THREE.Ray, tolerance = 1.2): number {
    let best = -1;
    let bestScore = Infinity;

    for (let i = 0; i < this.nodeCount; i++) {
      const at = i * 3;
      const u = this.stateData[i * 4] * DISPLACEMENT_SCALE;
      this.hitPoint.set(
        this.positions[at] + this.directions[at] * u,
        this.positions[at + 1] + this.directions[at + 1] * u,
        this.positions[at + 2] + this.directions[at + 2] * u
      );

      const distance = ray.distanceSqToPoint(this.hitPoint);
      if (distance < bestScore) {
        bestScore = distance;
        best = i;
      }
    }

    return bestScore <= tolerance * tolerance ? best : -1;
  }

  dispose(): void {
    this.world.geometry.dispose();
    this.record.geometry.dispose();
    this.worldMaterial.dispose();
    this.recordMaterial.dispose();
    this.stateTexture.dispose();
    this.slopeTexture.dispose();
  }
}
