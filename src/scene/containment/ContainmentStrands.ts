/**
 * The near field, with mass.
 *
 * A WebGL line is one pixel at any distance, so from outside and from inside
 * the structure looked identical in weight — the descent flew into a wireframe
 * rather than into something colossal. This pass draws the SAME trajectories a
 * second time as view-facing ribbons of constant world width, so perspective
 * gives them physical size as the camera arrives.
 *
 * **Only the near ones.** Width ramps to zero beyond a few units, and a
 * zero-width ribbon is a degenerate quad that costs a vertex and draws nothing,
 * so distant trajectories are carried entirely by the hairline pass and stay
 * impossibly delicate. Turning every line into a tube would be the spaghetti
 * fault with extra triangles: the transformation has to be that the tiny line
 * you saw from outside turns out to be enormous, which only reads if most of
 * the frame is still tiny lines.
 *
 * Nothing is added to the scene. The graph, the topology and the simulation are
 * untouched; this is the same edge list drawn with width instead of without.
 */

import * as THREE from 'three';
import type { ContainmentStructure } from './ContainmentSynth';
import { REST_HALATION } from './Halation';
import { REST_FRACTION, REVEAL_TARGET } from './ContainmentField';

export interface StrandLook {
  /** Half-width in world units, at full mass. */
  halfWidth: number;
  /** Full mass closer than this. */
  near: number;
  /** No mass at all beyond this — the hairline carries it. */
  far: number;
  /** Brightness relative to the hairline pass. */
  gain: number;
}

export const STRAND_LOOK: StrandLook = {
  // ~16px across at one unit in a 900px frame, and around 50 at a third of a
  // unit. Tuned against the frame, not chosen: the whole point is what this
  // measures on screen when the camera is between the trajectories.
  halfWidth: 0.011,
  // Tight, and close.
  //
  // A constant-width strand looks thick from wherever it is near, and at
  // OBSERVE the closest trajectories are only 1.8 units away — a loose window
  // put mass on them and the opening stopped being delicate. Under a third of
  // a unit is inside the structure and nowhere else, so the transformation
  // stays something the descent earns rather than something the geometry
  // always had.
  near: 0.4,
  far: 1.9,
  gain: 0.55,
};

export class ContainmentStrands {
  readonly object: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly energyAttr: THREE.BufferAttribute;
  private readonly contactAttr: THREE.BufferAttribute;
  /** Node index per ribbon vertex, so simulation energy can be scattered in. */
  private readonly owner: Uint32Array;

  constructor(structure: ContainmentStructure, look: StrandLook = STRAND_LOOK) {
    const { graph, edgeIndex, edgeKind, depth, param } = structure;
    const p = graph.positions;

    // One quad per along-trajectory edge. Cross-links stay undrawn here for
    // the same reason they are undrawn as lines: a short rung between two
    // near-parallel trajectories is a girder, and with width it would be a
    // very convincing one.
    const edges: Array<[number, number]> = [];
    for (let e = 0; e < edgeKind.length; e++) {
      if (edgeKind[e] !== 0) continue;
      edges.push([edgeIndex[e * 2], edgeIndex[e * 2 + 1]]);
    }

    const quads = edges.length;
    const position = new Float32Array(quads * 4 * 3);
    const other = new Float32Array(quads * 4 * 3);
    const side = new Float32Array(quads * 4);
    const along = new Float32Array(quads * 4);
    const depths = new Float32Array(quads * 4);
    const params = new Float32Array(quads * 4);
    const owner = new Uint32Array(quads * 4);
    const index = new Uint32Array(quads * 6);

    for (let q = 0; q < quads; q++) {
      const [a, b] = edges[q];
      // Corner order: a-left, a-right, b-left, b-right.
      const ends = [a, a, b, b];
      const mates = [b, b, a, a];
      const sides = [-1, 1, -1, 1];

      for (let c = 0; c < 4; c++) {
        const v = q * 4 + c;
        const n = ends[c];
        const m = mates[c];
        position[v * 3] = p[n * 3];
        position[v * 3 + 1] = p[n * 3 + 1];
        position[v * 3 + 2] = p[n * 3 + 2];
        other[v * 3] = p[m * 3];
        other[v * 3 + 1] = p[m * 3 + 1];
        other[v * 3 + 2] = p[m * 3 + 2];
        side[v] = sides[c];
        along[v] = c < 2 ? 0 : 1;
        depths[v] = depth[n];
        params[v] = param[n];
        owner[v] = n;
      }

      const base = q * 4;
      const i = q * 6;
      index[i] = base;
      index[i + 1] = base + 1;
      index[i + 2] = base + 2;
      index[i + 3] = base + 1;
      index[i + 4] = base + 3;
      index[i + 5] = base + 2;
    }

    this.owner = owner;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.geometry.setAttribute('aOther', new THREE.BufferAttribute(other, 3));
    this.geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    this.geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
    this.geometry.setAttribute('aParam', new THREE.BufferAttribute(params, 1));
    this.energyAttr = new THREE.BufferAttribute(new Float32Array(quads * 4), 1);
    this.energyAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aEnergy', this.energyAttr);

    this.contactAttr = new THREE.BufferAttribute(new Float32Array(quads * 4), 1);
    this.contactAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aContact', this.contactAttr);
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uHalfWidth: { value: look.halfWidth },
        uNear: { value: look.near },
        uFar: { value: look.far },
        uGain: { value: look.gain },
        uExposure: { value: 1 },
        uEmissiveOnly: { value: 0 },
        uRest: { value: REST_HALATION.fibres },
        uRestFraction: { value: REST_FRACTION },
        uRevealTarget: { value: REVEAL_TARGET },
      },
      vertexShader: /* glsl */ `
        in vec3 aOther;
        in float aSide;
        in float aAlong;
        in float aDepth;
        in float aParam;
        in float aEnergy;
        in float aContact;
        uniform float uHalfWidth;
        uniform float uNear;
        uniform float uFar;
        out float vAcross;
        out float vMass;
        out float vDepth;
        out float vParam;
        out float vEnergy;
        out float vContact;

        void main() {
          vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 mate = (modelMatrix * vec4(aOther, 1.0)).xyz;
          vec3 toEye = cameraPosition - world;
          float dist = length(toEye);

          // Mass arrives with proximity and is gone by uFar, where the quad
          // collapses to zero area and the hairline pass owns the trajectory
          // again. No popping: the two representations are the same colour and
          // the same brightness at the crossover.
          float mass = smoothstep(uFar, uNear, dist);
          vec3 dir = normalize(mate - world);
          // flat is a reserved interpolation qualifier in GLSL ES 3.0.
          vec3 sideways = normalize(cross(dir, toEye / max(dist, 1e-5)));

          world += sideways * aSide * uHalfWidth * mass;

          vAcross = aSide;
          vMass = mass;
          vDepth = aDepth;
          vParam = aParam;
          vEnergy = aEnergy;
          vContact = aContact;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uGain;
        uniform float uExposure;
        uniform float uEmissiveOnly;
        uniform float uRest;
        uniform float uRestFraction;
        uniform float uRevealTarget;
        in float vAcross;
        in float vMass;
        in float vDepth;
        in float vParam;
        in float vEnergy;
        in float vContact;
        out vec4 fragColour;

        void main() {
          if (vMass <= 0.001) discard;

          // Round, not flat. A ribbon shaded evenly across its width is tape,
          // and flat quads lighting flat is the fault that killed an earlier
          // carrier — so the across-coordinate drives a circular falloff, which
          // is exactly the projection of a cylinder's surface. The strand reads
          // as something with a back.
          // Named girth rather than round, which is a built-in.
          float girth = sqrt(max(1.0 - vAcross * vAcross, 0.0));

          // No ends.
          //
          // A trajectory that stops has a tip, and a tip is the thing that
          // makes the eye call it a strand: it can be counted because it can
          // be traced to where it finishes. Fading each curve in and out along
          // its own length hides every terminus, so what remains is flow with
          // no beginning and no end anywhere in it.
          float ends = smoothstep(0.0, 0.14, vParam) * smoothstep(1.0, 0.86, vParam);
          girth *= ends;

          vec3 rest = mix(vec3(0.82, 0.86, 0.94), vec3(0.68, 0.74, 0.88), vDepth);
          vec3 deviating = vec3(0.30, 0.92, 1.00);
          vec3 arrested  = vec3(0.72, 0.42, 1.00);

          float e = clamp(vEnergy, 0.0, 2.5);
          // Presence reveals; only the system deviates. Subtracting contact
          // before tinting stops a hover reading as cyan.
          float event = max(e - min(vContact, 1.0), 0.0);
          float reveal = smoothstep(0.02, 0.35, vContact);
          vec3 colour = rest;
          colour = mix(colour, deviating, clamp(event, 0.0, 1.0) * 0.85);
          colour = mix(colour, arrested, clamp((event - 1.0) / 0.55, 0.0, 1.0) * 0.95);

          float deviation = min(event, 1.0);
          float arrest = max(event - 1.0, 0.0);
          // Hidden at rest with the rest of the graph, brought back by
          // presence over the same third of a second.
          float level = (0.55 * mix(uRestFraction, uRevealTarget, reveal) + deviation * 4.3 + arrest * 6.2) * uGain * vMass * girth;

          // The emissive pass draws only what an event produced, so the
          // resting structure contributes nothing to the halation.
          // The resting field glows too.
          //
          // Excluding it entirely kept the opening pale, and pale thin lines
          // read as separate strokes rather than as one structure — which is
          // most of why the form was not cohering. Light that bleeds joins
          // them: a luminous body instead of a tally of curves. Events still
          // overwhelm it by several times, so the escalation survives.
          if (uEmissiveOnly > 0.5) {
            level = (uRest * 0.55 + deviation * 4.3 + arrest * 6.2) * uGain * vMass * girth;
          }

          fragColour = vec4(colour * level * uExposure, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.object = mesh;
  }

  setEnergy(energy: Float32Array, contact: Float32Array): void {
    const target = this.energyAttr.array as Float32Array;
    const touch = this.contactAttr.array as Float32Array;
    for (let v = 0; v < target.length; v++) {
      const owner = this.owner[v];
      target[v] = energy[owner];
      touch[v] = contact[owner];
    }
    this.energyAttr.needsUpdate = true;
    this.contactAttr.needsUpdate = true;
  }

  setExposure(value: number): void {
    this.material.uniforms.uExposure.value = value;
  }

  setEmissiveOnly(on: boolean): void {
    this.material.uniforms.uEmissiveOnly.value = on ? 1 : 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
