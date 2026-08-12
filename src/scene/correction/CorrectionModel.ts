import * as THREE from 'three';

import ribbonVert from '../../shaders/correction-ribbon.vert.glsl?raw';
import ribbonFrag from '../../shaders/correction-ribbon.frag.glsl?raw';
import type { CorrectionSnapshot, StructureHandoff } from './sim/PulseClient';

/**
 * CorrectionModel — the ribbon field as geometry.
 *
 * Each ribbon is a triangle strip two vertices wide, displaced every frame by
 * the authoritative state. They are surfaces with width, orientation and real
 * depth, so they occlude one another and turn their faces as they move.
 *
 * Not lines. A line set has no orientation and no thickness, so it cannot
 * occlude, cannot catch light at a grazing angle and cannot show that a ribbon
 * has turned — and a field of one-pixel strokes reads as a network diagram
 * whatever it is doing. The whole point of the field is that these are
 * separate physical things obeying one law, and a diagram cannot say that.
 *
 * There is no record object any more. The approved state used to be a second,
 * static line set drawn coincident with the world; here it is the grazing
 * light on the ribbons themselves, which is both cheaper and truer — the
 * record is not a thing beside the world, it is the state the world is held in.
 */

export interface CorrectionModelOptions {
  structure: StructureHandoff;
}

/**
 * World units of movement per unit of simulation displacement.
 *
 * A deviation of 0.35 lifts a ribbon about a unit out of the flow, against a
 * field roughly four units deep. Far enough that an escaped group is
 * unmistakably outside the permitted path — visible in grayscale, because its
 * curvature and spacing are wrong rather than because it is a different colour
 * — and not so far that it leaves the field altogether.
 */
const DISPLACEMENT_SCALE = 2.9;

/** How sharply the grazing edge falls off across a ribbon's face. */
const EDGE_POWER = 3.4;

/**
 * Brightness of the approved state.
 *
 * This is what carries the calm, and it is the only light in the frame at
 * rest. Measured rather than chosen: below about this the field disappears on
 * an ordinary monitor, which has already happened once here.
 */
const RECORD_GAIN = 0.95;

export class CorrectionModel {
  readonly group = new THREE.Group();
  readonly nodeCount: number;

  private readonly positions: Float32Array;
  private readonly directions: Float32Array;

  private readonly stateTexture: THREE.DataTexture;
  private readonly stateData: Float32Array<ArrayBuffer>;
  private readonly textureSize: number;

  private readonly ribbons: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  private readonly hitPoint = new THREE.Vector3();

  constructor(options: CorrectionModelOptions) {
    const { structure } = options;
    this.nodeCount = structure.nodeCount;
    this.positions = structure.positions;
    this.directions = structure.directions;
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
    // chance of a node reading a neighbour's state.
    this.stateTexture.minFilter = THREE.NearestFilter;
    this.stateTexture.magFilter = THREE.NearestFilter;
    this.stateTexture.generateMipmaps = false;
    this.stateTexture.needsUpdate = true;

    // -------------------------------------------------------------- geometry
    //
    // Two vertices per node, one either side of the ribbon's centreline, and a
    // pair of triangles between consecutive samples.

    const { starts, lengths, widths, binormals } = structure.layout;
    const vertexCount = this.nodeCount * 2;

    const position = new Float32Array(vertexCount * 3);
    const direction = new Float32Array(vertexCount * 3);
    const binormal = new Float32Array(vertexCount * 3);
    const width = new Float32Array(vertexCount);
    const side = new Float32Array(vertexCount);
    const nodeIndex = new Float32Array(vertexCount);

    for (let node = 0; node < this.nodeCount; node++) {
      const from = node * 3;
      for (let s = 0; s < 2; s++) {
        const vertex = node * 2 + s;
        const at = vertex * 3;
        position[at] = this.positions[from];
        position[at + 1] = this.positions[from + 1];
        position[at + 2] = this.positions[from + 2];
        direction[at] = this.directions[from];
        direction[at + 1] = this.directions[from + 1];
        direction[at + 2] = this.directions[from + 2];
        binormal[at] = binormals[from];
        binormal[at + 1] = binormals[from + 1];
        binormal[at + 2] = binormals[from + 2];
        width[vertex] = widths[node];
        side[vertex] = s === 0 ? -1 : 1;
        nodeIndex[vertex] = node;
      }
    }

    const triangles: number[] = [];
    for (let r = 0; r < structure.layout.count; r++) {
      const start = starts[r];
      for (let i = 0; i + 1 < lengths[r]; i++) {
        const a = (start + i) * 2;
        const b = a + 1;
        const c = (start + i + 1) * 2;
        const d = c + 1;
        triangles.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aDirection', new THREE.BufferAttribute(direction, 3));
    geometry.setAttribute('aBinormal', new THREE.BufferAttribute(binormal, 3));
    geometry.setAttribute('aWidth', new THREE.BufferAttribute(width, 1));
    geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geometry.setAttribute('aNode', new THREE.BufferAttribute(nodeIndex, 1));
    geometry.setIndex(triangles);

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: ribbonVert,
      fragmentShader: ribbonFrag,
      uniforms: {
        uState: { value: this.stateTexture },
        uTextureSize: { value: this.textureSize },
        uDisplacement: { value: DISPLACEMENT_SCALE },
        uRecord: { value: new THREE.Color('#d9d5c8') },
        uWorld: { value: new THREE.Color('#4dd0ff') },
        uConsequence: { value: new THREE.Color('#a45fd6') },
        uEdge: { value: EDGE_POWER },
        uRecordGain: { value: RECORD_GAIN },
        // Cyan is the deviation and only the deviation:
        //
        //   ambient drift  0.026  ->  0.02   effectively absent
        //   engagement     0.100  ->  0.13   the system starts to react here
        //   struck peak    0.350  ->  0.97   the escape
        uGlowScale: { value: 2.8 },
        uGlowGamma: { value: 1.6 },
        uContactScale: { value: 20 },
        uContactGamma: { value: 0.5 },
        uBruiseScale: { value: 8 },
        uBruiseGamma: { value: 0.6 },
        uBruiseWeight: { value: 0.55 },
        uExposure: { value: 1 },
      },
      // Opaque and depth-tested, because the ribbons have to occlude each
      // other. Additive blending would make the field one transparent haze
      // with no depth order, which is exactly the particle-cloud read.
      transparent: false,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
    });

    this.ribbons = new THREE.Mesh(geometry, this.material);
    this.ribbons.frustumCulled = false;
    this.group.add(this.ribbons);
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

  /** Cold-open reveal, and the machine-off cut. */
  setExposure(value: number): void {
    this.material.uniforms.uExposure.value = value;
  }

  /**
   * Nearest node to a ray, by perpendicular distance.
   *
   * Tested against the displaced structure rather than the rest positions, so
   * a press lands on the ribbon the visitor can actually see.
   */
  nodeUnderRay(ray: THREE.Ray, tolerance = 1.4): number {
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
    this.ribbons.geometry.dispose();
    this.material.dispose();
    this.stateTexture.dispose();
  }
}
