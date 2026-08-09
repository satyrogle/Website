import * as THREE from 'three';

import motesVert from '../shaders/motes.vert.glsl?raw';
import motesFrag from '../shaders/motes.frag.glsl?raw';

/**
 * Particulate
 *
 * The air the entity hangs in.
 *
 * A single object against a uniform background reads as a cutout however
 * well it is lit, because depth is not a property of an object — it is a
 * relationship between things at different distances. The void had
 * nothing else in it at any distance, so there was no relationship to
 * read and the entity sat on the black rather than in it.
 *
 * These motes exist to be parallaxed past. They are deliberately too dim
 * to look at: the moment they read as points of light the frame becomes
 * a space scene, and the brief's environment is a medium, not a sky.
 * Their whole job is to move differentially against the entity as the
 * camera travels, which is the cue the eye actually uses for volume.
 *
 * One draw call, no per-frame CPU work — every mote's drift is derived
 * in the vertex shader from a seed baked into the geometry.
 */

/** Distributed along the whole travel axis, not just around the Full Form. */
const SPAN_NEAR = 14;
const SPAN_FAR = -21;

export class Particulate {
  readonly points: THREE.Points;

  private material: THREE.RawShaderMaterial;
  private disposed = false;

  constructor(count: number, pixelRatio: number) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const motes = new Float32Array(count * 3);

    // Deterministic, so the air is the same on every load and a
    // screenshot can be compared against the last one.
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    for (let i = 0; i < count; i++) {
      // Cylindrical about the travel axis. A cube would put most of the
      // motes in the corners, where the camera never looks, and leave
      // the corridor — the one place the volume has to read — empty.
      const angle = rand() * Math.PI * 2;
      // sqrt keeps the density even across the disc instead of piling
      // everything onto the axis.
      const radius = Math.sqrt(rand()) * 6.4;
      positions[i * 3 + 0] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius * 0.72;
      positions[i * 3 + 2] = SPAN_FAR + rand() * (SPAN_NEAR - SPAN_FAR);

      motes[i * 3 + 0] = rand();
      // SQUARED, not cubed. Cubing crushed almost every mote to 0.1 and
      // left a handful of bright specks — measured at 0.06% of the void
      // above threshold, which is a few pixels, not an atmosphere. The
      // curve still leans dim; there are simply enough of them now for
      // the volume to register rather than the individuals.
      const b = rand();
      motes[i * 3 + 1] = 0.05 + b * b * 0.22;
      motes[i * 3 + 2] = 0.5 + rand() * 1.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aMote', new THREE.BufferAttribute(motes, 3));
    // The motes drift in the shader, so the CPU-side bounds are wrong by
    // up to the drift amplitude. Culling them as a group would pop the
    // whole field out at the frame edge.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: motesVert,
      fragmentShader: motesFrag,
      transparent: true,
      // Additive and depth-blind: particulate does not occlude, and
      // writing depth would punch square holes in the entity behind it.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        uTime: { value: 0 },
        // LARGE and DIM, which is what out-of-focus particulate is.
        // At 34 a mote spanned about two pixels at working distance, and
        // a two-pixel sprite with a squared falloff never reaches full
        // brightness at any pixel — measured identical to having no
        // motes at all. Going bright and small instead produced a
        // starfield. Big and faint is the only combination that reads as
        // air rather than as either nothing or stars.
        uSize: { value: 92 },
        uPixelRatio: { value: pixelRatio },
        uWake: { value: 0 },
        uColdSilver: { value: new THREE.Color('#BFEFFF') },
        // NOT the palette's teal. #36E0B0 is a saturated green, and at
        // this size every mote became a green speck — a starfield, which
        // is the one thing this must not be. Dust is nearly colourless;
        // it takes a faint cast from the light around it and no more.
        uTeal: { value: new THREE.Color('#9FB4C4') },
      },
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
  }

  update(time: number, wake: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uWake.value = wake;
  }

  setPixelRatio(ratio: number): void {
    this.material.uniforms.uPixelRatio.value = ratio;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
