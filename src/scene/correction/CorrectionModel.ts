import * as THREE from 'three';

import edgeVert from '../../shaders/correction-edge.vert.glsl?raw';
import edgeFrag from '../../shaders/correction-edge.frag.glsl?raw';
import ghostVert from '../../shaders/correction-ghost.vert.glsl?raw';
import ghostFrag from '../../shaders/correction-ghost.frag.glsl?raw';
import type { CorrectionSnapshot, StructureHandoff } from './sim/PulseClient';

/**
 * CorrectionModel — two objects, because there are two things.
 *
 * The world is a line set whose vertices are displaced every frame by the
 * authoritative state. The record is a second line set, baked once from u*,
 * that never moves. When they agree they are coincident and the frame is calm.
 * When they disagree you are looking at the disagreement itself, in the
 * geometry, before any colour is involved.
 *
 * Edges rather than nodes: a uniform field of dots is the plexus/constellation
 * cliché, and the brief forbids it. Lines at one pixel over near-black hold
 * their hue, cost one draw call each and read as precision instead of as
 * decoration.
 *
 * No post: no bloom, no fog, no particles. Depth reads through perspective and
 * through additive density, which is honest — brightness where the structure is
 * genuinely denser along the view ray.
 */

export interface CorrectionModelOptions {
  structure: StructureHandoff;
  record: Float32Array;
}

/**
 * World units of movement per unit of simulation displacement.
 *
 * Deviations peak near 0.42, so a strike lifts the veil by roughly 1.2 units
 * against a body about 2.4 units thick. Large enough to read in silhouette
 * from any camera the narrative will use, small enough that the structure is
 * never torn apart by it.
 */
const DISPLACEMENT_SCALE = 2.8;

/**
 * The record's brightness.
 *
 * This is what carries the calm. Once the live channel was calibrated to rank
 * magnitude honestly, a structure at rest emits almost nothing — correctly, but
 * it left the opening frame nearly empty, and the visitor is supposed to meet
 * beauty and order there. Raising cyan to fill it would have been a lie: it
 * would say the world is deviating when it is not.
 *
 * So the calm is lit by the record instead. What you are admiring on arrival is
 * the file — which is the whole proposition, arrived at through the light law
 * rather than asserted on top of it. It stays flat and subordinate; the moment
 * the world deviates, cyan comes out of it and amber is what the deviation is
 * measured against.
 */
const GHOST_INTENSITY = 0.16;

export class CorrectionModel {
  readonly group = new THREE.Group();
  readonly nodeCount: number;

  /** p₀ per node. The unmoved structure, for hit-testing and for the record. */
  private readonly positions: Float32Array;
  private readonly directions: Float32Array;

  private readonly stateTexture: THREE.DataTexture;
  private readonly stateData: Float32Array<ArrayBuffer>;
  private readonly textureSize: number;

  private readonly world: THREE.LineSegments;
  private readonly ghost: THREE.LineSegments;
  private readonly worldMaterial: THREE.ShaderMaterial;
  private readonly ghostMaterial: THREE.ShaderMaterial;

  /** Scratch for hit-testing, so a press allocates nothing. */
  private readonly hitPoint = new THREE.Vector3();

  constructor(options: CorrectionModelOptions) {
    const { structure, record } = options;
    this.nodeCount = structure.nodeCount;
    this.positions = structure.positions;
    this.directions = structure.directions;
    this.textureSize = structure.textureSize;

    // ----------------------------------------------------------- state texture
    this.stateData = new Float32Array(this.textureSize * this.textureSize * 4);
    this.stateTexture = new THREE.DataTexture(
      this.stateData,
      this.textureSize,
      this.textureSize,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    // Sampled with texelFetch at exact integer coordinates: no filtering, no
    // wrapping, no chance of a node reading a neighbour's state.
    this.stateTexture.minFilter = THREE.NearestFilter;
    this.stateTexture.magFilter = THREE.NearestFilter;
    this.stateTexture.generateMipmaps = false;
    this.stateTexture.needsUpdate = true;

    // ------------------------------------------------------------- the world
    const edges = structure.edges;
    const vertexCount = edges.length;

    const worldPositions = new Float32Array(vertexCount * 3);
    const worldDirections = new Float32Array(vertexCount * 3);
    const worldNodes = new Float32Array(vertexCount);
    const ghostPositions = new Float32Array(vertexCount * 3);

    for (let v = 0; v < vertexCount; v++) {
      const node = edges[v];
      const at = v * 3;
      const from = node * 3;

      worldPositions[at] = this.positions[from];
      worldPositions[at + 1] = this.positions[from + 1];
      worldPositions[at + 2] = this.positions[from + 2];

      worldDirections[at] = this.directions[from];
      worldDirections[at + 1] = this.directions[from + 1];
      worldDirections[at + 2] = this.directions[from + 2];

      worldNodes[v] = node;

      // The record's own geometry: where the approved state says this node is.
      const u = record[node];
      ghostPositions[at] = this.positions[from] + this.directions[from] * u * DISPLACEMENT_SCALE;
      ghostPositions[at + 1] = this.positions[from + 1] + this.directions[from + 1] * u * DISPLACEMENT_SCALE;
      ghostPositions[at + 2] = this.positions[from + 2] + this.directions[from + 2] * u * DISPLACEMENT_SCALE;
    }

    const worldGeometry = new THREE.BufferGeometry();
    worldGeometry.setAttribute('position', new THREE.BufferAttribute(worldPositions, 3));
    worldGeometry.setAttribute('aDirection', new THREE.BufferAttribute(worldDirections, 3));
    worldGeometry.setAttribute('aNode', new THREE.BufferAttribute(worldNodes, 1));

    this.worldMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: edgeVert,
      fragmentShader: edgeFrag,
      uniforms: {
        uState: { value: this.stateTexture },
        uTextureSize: { value: this.textureSize },
        uDisplacement: { value: DISPLACEMENT_SCALE },
        uWorld: { value: new THREE.Color('#4dd0ff') },
        uConsequence: { value: new THREE.Color('#a45fd6') },
        // Calibrated against measured state, not by eye:
        //
        //   ambient drift  0.040  ->  0.24   present, plainly at rest
        //   engagement     0.100  ->  0.40   the system starts to react here
        //   struck peak    0.420  ->  0.91   the deviation
        //
        // Six times the calm at the crest is what makes a press an event.
        uGlowScale: { value: 2.0 },
        uGlowGamma: { value: 0.55 },
        // Contact runs ~0.005/tick while the deviation resists and ~0.05 once
        // the ramp completes, so strain lands near a third and the snap fills.
        uContactScale: { value: 20 },
        uContactGamma: { value: 0.5 },
        uBruiseScale: { value: 8 },
        uBruiseGamma: { value: 0.6 },
        uBruiseWeight: { value: 0.5 },
        uExposure: { value: 1 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    this.world = new THREE.LineSegments(worldGeometry, this.worldMaterial);
    this.world.frustumCulled = false;
    this.world.renderOrder = 1;

    // ------------------------------------------------------------ the record
    const ghostGeometry = new THREE.BufferGeometry();
    ghostGeometry.setAttribute('position', new THREE.BufferAttribute(ghostPositions, 3));

    this.ghostMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: ghostVert,
      fragmentShader: ghostFrag,
      uniforms: {
        uRecord: { value: new THREE.Color('#c9a24a') },
        uIntensity: { value: GHOST_INTENSITY },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    this.ghost = new THREE.LineSegments(ghostGeometry, this.ghostMaterial);
    this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 0;

    this.group.add(this.ghost);
    this.group.add(this.world);
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

  /** Cold-open reveal and, later, the machine-off cut. */
  setExposure(value: number): void {
    this.worldMaterial.uniforms.uExposure.value = value;
    this.ghostMaterial.uniforms.uIntensity.value = GHOST_INTENSITY * value;
  }

  /**
   * Nearest node to a ray, by perpendicular distance.
   *
   * Tested against the *displaced* structure rather than against p₀, so a press
   * lands on the filament the visitor can actually see. Linear over ~3,100
   * nodes: about 0.05 ms, and it only runs on a press.
   *
   * Returns -1 if the ray misses the structure by more than `tolerance`, so a
   * click on empty sky does nothing rather than silently striking something
   * off-screen.
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
    this.world.geometry.dispose();
    this.ghost.geometry.dispose();
    this.worldMaterial.dispose();
    this.ghostMaterial.dispose();
    this.stateTexture.dispose();
  }
}
