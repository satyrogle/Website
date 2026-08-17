/**
 * The containment field, drawn.
 *
 * One LineSegments draw over the synthesised graph. The trajectories are
 * hairlines — a WebGL line is one pixel and that is the correct width here,
 * because the form has to read as drawn rather than as modelled.
 *
 * Brightness is accumulated, not painted: additive blending means the image is
 * built by trajectories crossing at different depths, which is the layered
 * interference the direction asks for. Any individual line is nearly invisible;
 * the structure is what the overlaps make.
 *
 * Per-node energy comes from the simulation. At rest it is zero everywhere and
 * the field sits at its floor — the approved state. Light above that floor is
 * only ever produced by propagation and arrest.
 */

import * as THREE from 'three';
import type { ContainmentStructure } from './ContainmentSynth';
import { ContainmentStrands } from './ContainmentStrands';
import { REST_HALATION } from './Halation';

export interface FieldLook {
  /** The resting glow of an undisturbed trajectory. */
  floor: number;
  /** How much a cross-link is dimmed against an along-trajectory edge. */
  crossDim: number;
  /** Distance fade, world units, so the far side of the structure recedes. */
  near: number;
  far: number;
}

/**
 * What the fine graph keeps at rest, as a fraction of its authored floor.
 *
 * The entity read as feather, silk and hair because at rest it WAS thousands
 * of bright parallel fibres — the graph was the object, and the mass behind it
 * was invisible. At an eighth it becomes texture found inside a near-black
 * body rather than the body itself, and everything the fibres are for still
 * happens: the visitor's presence brings them back locally, and an event
 * brings them back violently.
 */
export const REST_FRACTION = 0.12;

/**
 * What a revealed fibre rises to, as a fraction of its floor.
 *
 * Not all the way back. The graph is dense enough that lifting two thousand
 * fibres to full floor inside one screen region saturates additively into a
 * white blob — which reveals nothing, when the entire point of the reveal is
 * that the visitor sees PATHS. Held below the point where the overlaps clip,
 * the same region resolves as legible veining.
 */
export const REVEAL_TARGET = 0.55;

export const FIELD_LOOK: FieldLook = {
  // 0.085, not 1.15.
  //
  // Fifty-three thousand edges accumulate where nine thousand did, and the
  // per-curve level has to fall by the same factor or the merge that finally
  // produced one flowing structure produces one flowing white. Black is scale
  // here; losing it costs more than the coherence gained.
  // Subdued: this is Level 3 now. The sheets carry the silhouette and the
  // fibres are what the eye finds inside them on approach, so they must not
  // compete with the mass at distance.
  floor: 0.055,
  crossDim: 0.42,
  // Set against the pose, not the object: the near and far sides of the
  // structure must arrive with different weight or the form flattens into a
  // screen pattern. These bracket the body at the OBSERVE distance.
  near: 3.0,
  far: 15.0,
};

export class ContainmentField {
  readonly object: THREE.Object3D;
  /**
   * The near field, drawn with width.
   *
   * Same edges, same energy, same colour — the only difference is that these
   * have world-space thickness and so gain physical size as the camera
   * arrives. Far away they collapse to nothing and the hairlines carry the
   * structure alone.
   */
  private readonly strands: ContainmentStrands;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly energyAttr: THREE.BufferAttribute;
  private readonly contactAttr: THREE.BufferAttribute;

  constructor(
    private readonly structure: ContainmentStructure,
    look: FieldLook = FIELD_LOOK
  ) {
    const { graph, edgeIndex, edgeKind, depth, family } = structure;
    const n = graph.nodeCount;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(graph.positions, 3));
    this.geometry.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
    this.geometry.setAttribute('aParam', new THREE.BufferAttribute(structure.param, 1));
    this.geometry.setAttribute('aNormal', new THREE.BufferAttribute(structure.normals, 3));

    const fam = new Float32Array(n);
    for (let i = 0; i < n; i++) fam[i] = family[i];
    this.geometry.setAttribute('aFamily', new THREE.BufferAttribute(fam, 1));

    // Energy is per node and updated every frame from the simulation.
    this.energyAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.energyAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aEnergy', this.energyAttr);

    // Contact travels separately from energy, because the shader has to tell
    // the visitor's presence apart from the system's own deviation: one
    // reveals the fibres, the other is cyan.
    this.contactAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.contactAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aContact', this.contactAttr);

    // Edge kind has to live per vertex, and a vertex can belong to both an
    // along-edge and a cross-link. Expanding the geometry to make it per-edge
    // would double the buffer for a term that only dims; instead a node is
    // marked as cross only when every edge it owns is one.
    // Cross-links are topology, not picture.
    //
    // They exist so a disturbance can jump between families, and drawing them
    // is a mistake: a short link between two nearly parallel trajectories
    // renders as a rung, and enough rungs in a row is a girder — a nameable
    // manufactured object, in the one form that must not be nameable. The
    // interference the direction asks for comes from trajectories crossing in
    // projection at different depths, which needs no drawn connection at all.
    const drawn: number[] = [];
    for (let e = 0; e < edgeKind.length; e++) {
      if (edgeKind[e] !== 0) continue;
      drawn.push(edgeIndex[e * 2], edgeIndex[e * 2 + 1]);
    }
    this.geometry.setAttribute('aCross', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(drawn), 1));

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uFloor: { value: look.floor },
        uCrossDim: { value: look.crossDim },
        uNear: { value: look.near },
        uFar: { value: look.far },
        uExposure: { value: 1 },
        uEmissiveOnly: { value: 0 },
        // Zero. The fine graph blooms from events and from nothing else — see
        // `Halation`'s header for the rule and for why.
        uRest: { value: REST_HALATION.fibres },
        uRestFraction: { value: REST_FRACTION },
        uRevealTarget: { value: REVEAL_TARGET },
        // Gated values, promoted to uniforms so the dev panel can reach
        // them. Defaults are exactly what passed the four-frame test.
        uDeviationGain: { value: 4.3 },
        uArrestGain: { value: 6.2 },
      },
      vertexShader: /* glsl */ `
        in float aDepth;
        in float aParam;
        in vec3 aNormal;
        in float aEnergy;
        in float aContact;
        in float aCross;
        in float aFamily;
        out float vDepth;
        out float vParam;
        out float vFacing;
        out float vEnergy;
        out float vContact;
        out float vCross;
        out float vFamily;
        out float vCam;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vec4 view = viewMatrix * world;
          vDepth = aDepth;
          vParam = aParam;
          // How square-on the body is here. Veins are spread evenly over the
          // surface, so where it turns edge-on they crowd into few pixels and
          // where it faces the camera they spread thin — the bunching on one
          // side and the bare flat region on the other are the same
          // foreshortening seen from its two ends.
          vFacing = abs(dot(normalize(mat3(modelMatrix) * aNormal),
                            normalize(cameraPosition - world.xyz)));
          vEnergy = aEnergy;
          vContact = aContact;
          vCross = aCross;
          vFamily = aFamily;
          vCam = -view.z;
          gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uFloor;
        uniform float uCrossDim;
        uniform float uNear;
        uniform float uFar;
        uniform float uExposure;
        uniform float uEmissiveOnly;
        uniform float uRest;
        uniform float uRestFraction;
        uniform float uRevealTarget;
        uniform float uDeviationGain;
        uniform float uArrestGain;
        in float vDepth;
        in float vParam;
        in float vFacing;
        in float vEnergy;
        in float vContact;
        in float vCross;
        in float vFamily;
        in float vCam;
        out vec4 fragColour;

        void main() {
          // The resting field is pale and almost colourless — the approved
          // state, and the model of the world rather than the world. Interior
          // shells sit fractionally cooler so the structure has an inside
          // without any part of it being tinted.
          vec3 rest = mix(vec3(0.82, 0.86, 0.94), vec3(0.68, 0.74, 0.88), vDepth);

          // Deviation is the world doing what it would actually do; arrest is
          // the consequence of the disagreement. Both are carried by energy,
          // which is zero at rest, so the palette is not a decoration — it is
          // a readout.
          vec3 deviating = vec3(0.30, 0.92, 1.00);
          vec3 arrested  = vec3(0.72, 0.42, 1.00);

          float e = clamp(vEnergy, 0.0, 2.5);
          // Presence is not deviation. Contact raises a node's energy exactly
          // as a cascade does, so colouring straight from energy turned every
          // hover cyan and spent the grammar's loudest word on someone moving
          // a mouse. What the visitor's own presence explains is subtracted
          // before anything is tinted; the rest is the system's.
          float event = max(e - min(vContact, 1.0), 0.0);
          vec3 colour = rest;
          colour = mix(colour, deviating, clamp(event, 0.0, 1.0) * 0.85);
          // Arrest is everything past the deviation range, and it has to
          // engage over the range the correction actually produces. Ramped to
          // 2.0 it reached a third strength at the levels a real withdrawal
          // reaches, so the one violet moment in the scene came out blue.
          colour = mix(colour, arrested, clamp((event - 1.0) / 0.55, 0.0, 1.0) * 0.95);

          // Recession. A line at the far side of the structure must not arrive
          // with the same weight as one at the near side, or the form flattens
          // into a screen pattern and its depth is gone.
          float recede = 1.0 - smoothstep(uNear, uFar, vCam);
          recede = 0.14 + 0.86 * recede * recede;

          // No ends.
          //
          // A trajectory that stops has a tip, and a tip is the thing that
          // makes the eye call it a strand: it can be counted because it can
          // be traced to where it finishes. Fading each curve in and out along
          // its own length hides every terminus, so what remains is flow with
          // no beginning and no end anywhere in it.
          float ends = smoothstep(0.0, 0.14, vParam) * smoothstep(1.0, 0.86, vParam);
          recede *= ends;

          // Compensate for it, by DIMMING where they crowd.
          //
          // This was the reciprocal, which multiplied the edge-on regions by
          // up to 2.75 — brightening precisely where the veins were already
          // stacking into few pixels, and leaving the face-on regions at 1.0.
          // It was tuned when the mesh and the veins were ninety degrees
          // apart, so what it was judged against was two objects. Measured on
          // the corrected body: it drove 0.64% of the frame to white with no
          // event running, which is decorative energy by the only law this
          // file has. Direct, it is 0.06%.
          recede *= mix(1.0, max(vFacing, 0.30), 0.75);

          // HIDDEN AT REST, and revealed where the visitor is.
          //
          // Thousands of pale fibres, all running one way, were the object at
          // rest — and an object made of parallel filaments is hair, silk or a
          // feather whatever shape it is cut into. So at rest the graph drops
          // to a fraction of its level and becomes texture inside the mass;
          // the near-black body and a dozen ridges carry the silhouette.
          //
          // Contact brings the local fibres back over roughly a third of a
          // second — the smoothstep does the easing, so no timing anywhere in
          // the simulation had to move for it. Only the region under the
          // cursor wakes, which is the point: the body answers where it is
          // touched, and the visitor learns it is full of paths.
          float reveal = smoothstep(0.02, 0.35, vContact);
          float level = uFloor * mix(uRestFraction, uRevealTarget, reveal) * mix(1.0, uCrossDim, vCross);
          level *= recede;

          // A disturbance has to overwhelm the resting field, not tint it.
          //
          // The cascade lights a few hundred nodes out of ten thousand, so at
          // anything under a few times the floor it is statistically invisible
          // however correct the simulation is. This is the one place the frame
          // is allowed to be loud, and it is earned: every unit of it came
          // from a propagation event.
          // Deviation and arrest are weighted apart: a correction does not
          // need to be brighter than the cascade, it needs to be a different
          // colour, and piling level onto it only drives every channel to one
          // and turns the violet white.
          //
          // 4.3, not 5.4. At 5.4 the peak stopped being a network and became a
          // luminous slab — the upper lobe went to white and the branching,
          // which is the entire thing the cascade exists to show, disappeared
          // inside it. The event still has to be violent; it has to stay
          // legible as paths, junctions and forks while it is.
          float deviation = min(event, 1.0);
          float arrest = max(event - 1.0, 0.0);
          // The cascade is the moment the body admits how much of it there is,
          // so it is allowed to be violent against a resting field that is now
          // nearly dark. The arrest is weighted far closer to it than before:
          // at 1.5 against 3.4 the correction read as a minor aftereffect of
          // something beautiful, when it is the thing the site is about.
          level += (deviation * uDeviationGain + arrest * uArrestGain) * recede;

          // Additive blending already weights the source by its alpha, so the
          // level goes into the colour and the alpha stays at one. Putting it
          // in both squares it, and the whole field renders at a tenth of the
          // authored brightness.
          // The emissive pass carries halation, and the law is that the
          // resting field does not glow. Dropping the floor here rather than
          // thresholding brightness afterwards makes that structural: no
          // amount of accumulated crossings can bloom, because the approved
          // state contributes literally zero to the buffer that gets blurred.
          // The resting field glows too.
          //
          // Excluding it entirely kept the opening pale, and pale thin lines
          // read as separate strokes rather than as one structure — which is
          // most of why the form was not cohering. Light that bleeds joins
          // them: a luminous body instead of a tally of curves. Events still
          // overwhelm it by several times, so the escalation survives.
          if (uEmissiveOnly > 0.5) {
            level = (uRest * uFloor * mix(1.0, uCrossDim, vCross) + deviation * uDeviationGain + arrest * uArrestGain) * recede;
          }

          fragColour = vec4(colour * level * uExposure, 1.0);
        }
      `,
    });

    const lines = new THREE.LineSegments(this.geometry, this.material);
    lines.frustumCulled = false;

    this.strands = new ContainmentStrands(structure);

    const group = new THREE.Group();
    group.add(lines, this.strands.object);
    this.object = group;
  }

  /** Per-node energy and per-node contact from the authoritative simulation. */
  setEnergy(energy: Float32Array, contact: Float32Array): void {
    const target = this.energyAttr.array as Float32Array;
    target.set(energy.subarray(0, target.length));
    this.energyAttr.needsUpdate = true;

    const touch = this.contactAttr.array as Float32Array;
    touch.set(contact.subarray(0, touch.length));
    this.contactAttr.needsUpdate = true;

    this.strands.setEnergy(energy, contact);
  }

  /** Draw only what an event produced. Used for the halation buffer. */
  setEmissiveOnly(on: boolean): void {
    this.material.uniforms.uEmissiveOnly.value = on ? 1 : 0;
    this.strands.setEmissiveOnly(on);
  }

  setExposure(value: number): void {
    this.material.uniforms.uExposure.value = value;
    this.strands.setExposure(value);
  }

  /**
   * The recession window, driven by the descent.
   *
   * Authored for one distance it stops working at every other: bracketing the
   * body at the OBSERVE pose, everything is inside `near` by the time the
   * camera is between the trajectories, and the entire field arrives at full
   * weight with no depth at all. The window has to travel with the camera.
   */
  setRecession(near: number, far: number): void {
    this.material.uniforms.uNear.value = near;
    this.material.uniforms.uFar.value = far;
  }

  get nodeCount(): number {
    return this.structure.graph.nodeCount;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.strands.dispose();
  }
}
