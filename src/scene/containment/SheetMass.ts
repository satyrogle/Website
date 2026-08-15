/**
 * Level 1 — the silhouette.
 *
 * The body Blender authored, loaded as a GLB and shaded here.
 *
 * Near-black faces that OCCLUDE, with light only at their grazing edges. That combination is what produces a shape
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
export interface MassLook {
  /** How dark the face is. Near zero: this is mass, not a lamp. */
  face: number;
  /** Light at the grazing edge, which is the silhouette. */
  rim: number;
  /** Extra light at the two long edges of a vane, where it ends. */
  edge: number;
}

export const MASS_LOOK: MassLook = {
  // Almost nothing. The visitor understands the body through its grazing edge,
  // through what it occludes, and through the veins beneath it — not by it
  // glowing. A translucent, milky surface reads as fabric or as a wing; an
  // opaque near-black one reads as mass.
  face: 0.008,
  rim: 0.30,
  edge: 0.0,
};

export class SheetMass {
  readonly object: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(geometry: THREE.BufferGeometry, look: MassLook = MASS_LOOK) {
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      uniforms: {
        uFace: { value: look.face },
        uRim: { value: look.rim },
        uExposure: { value: 1 },
      },
      vertexShader: /* glsl */ `
        out vec3 vNormal;
        out vec3 vView;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uFace;
        uniform float uRim;
        uniform float uExposure;
        in vec3 vNormal;
        in vec3 vView;
        out vec4 fragColour;

        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(vView);

          // Grazing only, and tight. A broad falloff lifts the whole face and
          // the body becomes a lit slab; the silhouette lives in the last few
          // degrees before the surface turns away.
          float graze = pow(1.0 - abs(dot(n, v)), 5.5);

          // Bone, very slightly warm. Not cyan: cyan is reserved for a real
          // deviation, and spending it on the resting state leaves the
          // grammar with nothing to say when something actually happens.
          vec3 bone = vec3(0.92, 0.90, 0.84);
          fragColour = vec4(bone * (uFace + graze * uRim) * uExposure, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.frustumCulled = false;
    // Drawn before the additive layers so they depth-test against it.
    mesh.renderOrder = -1;
    this.object = mesh;
  }

  /** The whole body is one lobe now, so a hit is simply a hit. */
  sheetAt(): number {
    return 0;
  }

  setExposure(value: number): void {
    this.material.uniforms.uExposure.value = value;
  }

  dispose(): void {
    this.material.dispose();
  }
}
