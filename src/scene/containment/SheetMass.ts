/**
 * Level 1 — the silhouette.
 *
 * The sheets drawn as actual surfaces: near-black faces that OCCLUDE, with
 * light only at their grazing edges. That combination is what produces a shape
 * at thumbnail size without producing a bright slab — the eye finds the form
 * from its rim and from what it hides, which is how mass reads on black.
 *
 * These write depth. Everything else in the field is additive and depth-tested
 * against them, so a fibre behind a sheet is hidden and a fibre in front is
 * not. Occlusion is the entire reason this layer exists; without it the sheets
 * would be five more transparent things in a pile and the frame would gain no
 * hierarchy at all.
 */

import * as THREE from 'three';
import { SHEETS, frameAt, surfacePoint, surfaceNormal } from './Sheets';

/** Tessellation. Along the spine, and across the width. */
const ALONG = 96;
const ACROSS = 14;

export interface MassLook {
  /** How dark the face is. Near zero: this is mass, not a lamp. */
  face: number;
  /** Light at the grazing edge, which is the silhouette. */
  rim: number;
  /** Extra light at the two long edges of a vane, where it ends. */
  edge: number;
}

export const MASS_LOOK: MassLook = {
  // Dark, and grazing only. The vanes are large enough that a generous rim
  // covers most of their area from most angles, and a sheet lit across its
  // whole face is a slab rather than a mass.
  face: 0.012,
  rim: 0.16,
  edge: 0.13,
};

export class SheetMass {
  readonly object: THREE.Mesh;
  /** Which sheet each vertex belongs to, so a ray hit names a lobe. */
  private readonly sheetOf: Uint8Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(look: MassLook = MASS_LOOK) {
    const positions: number[] = [];
    const normals: number[] = [];
    const acrossAttr: number[] = [];
    const alongAttr: number[] = [];
    const index: number[] = [];
    const owners: number[] = [];

    let base = 0;
    for (let sheetIndex = 0; sheetIndex < SHEETS.length; sheetIndex++) {
      const sheet = SHEETS[sheetIndex];
      for (let i = 0; i <= ALONG; i++) {
        const u = i / ALONG;
        const frame = frameAt(sheet, u);
        for (let j = 0; j <= ACROSS; j++) {
          const v = (j / ACROSS) * 2 - 1;
          const p = surfacePoint(sheet, u, v, frame);
          const n = surfaceNormal(sheet, u, v);
          positions.push(p[0], p[1], p[2]);
          normals.push(n[0], n[1], n[2]);
          acrossAttr.push(Math.abs(v));
          alongAttr.push(u);
          owners.push(sheetIndex);
        }
      }
      const stride = ACROSS + 1;
      for (let i = 0; i < ALONG; i++) {
        for (let j = 0; j < ACROSS; j++) {
          const a = base + i * stride + j;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          index.push(a, c, b, b, c, d);
        }
      }
      base += (ALONG + 1) * stride;
    }

    this.sheetOf = new Uint8Array(owners);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    this.geometry.setAttribute('aAcross', new THREE.BufferAttribute(new Float32Array(acrossAttr), 1));
    this.geometry.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(alongAttr), 1));
    this.geometry.setIndex(index);

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      uniforms: {
        uFace: { value: look.face },
        uRim: { value: look.rim },
        uEdge: { value: look.edge },
        uExposure: { value: 1 },
      },
      vertexShader: /* glsl */ `
        in float aAcross;
        in float aAlong;
        out vec3 vNormal;
        out vec3 vView;
        out float vAcross;
        out float vAlong;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - world.xyz);
          vAcross = aAcross;
          vAlong = aAlong;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uFace;
        uniform float uRim;
        uniform float uEdge;
        uniform float uExposure;
        in vec3 vNormal;
        in vec3 vView;
        in float vAcross;
        in float vAlong;
        out vec4 fragColour;

        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(vView);

          // Grazing only. A broad falloff lifts the whole face and the sheet
          // becomes a lit slab; the silhouette lives in the last few degrees
          // before the surface turns away.
          float graze = pow(1.0 - abs(dot(n, v)), 4.5);

          // The two long edges of the vane, where the surface simply stops.
          float edge = pow(vAcross, 7.0);

          // Both ends taper out rather than being cut off, so a sheet has no
          // visible termination anywhere.
          float ends = smoothstep(0.0, 0.10, vAlong) * smoothstep(1.0, 0.90, vAlong);

          vec3 pale = vec3(0.74, 0.79, 0.90);
          float level = uFace + (graze * uRim + edge * uEdge) * ends;

          fragColour = vec4(pale * level * uExposure, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    // Drawn before the additive layers so they depth-test against it.
    mesh.renderOrder = -1;
    this.object = mesh;
  }

  /**
   * Which sheet a ray hit landed on.
   *
   * The mass is one mesh so it raycasts in a single pass, and the vertex the
   * hit belongs to carries its sheet — that is what turns a pixel into a lobe.
   */
  sheetAt(hit: THREE.Intersection): number {
    const face = hit.face;
    return face ? this.sheetOf[face.a] : -1;
  }

  setExposure(value: number): void {
    this.material.uniforms.uExposure.value = value;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
