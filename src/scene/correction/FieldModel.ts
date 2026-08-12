import * as THREE from 'three';

import fieldVert from '../../shaders/correction-field.vert.glsl?raw';
import fieldFrag from '../../shaders/correction-field.frag.glsl?raw';

/**
 * FieldModel — a star that has already blown apart.
 *
 * One screen-filling draw, marched per pixel: a dying star, and five great
 * fragments of the world it destroyed floating in the void, trailing away from
 * it in a narrowing funnel. Scroll travels from fragment to fragment down that
 * funnel; the floor pulls wide to see the whole event; then the star flares.
 *
 * Direction logged in docs/HERO_DIRECTION.md and it is Jacob's, verbatim:
 * "dying star exploding everywhere debris everywhere and each floating debris
 * will be our scrolling and we travel like a funnel and we go see the
 * exploding star."
 *
 * Two approved things carried whole from the previous field, not redecorated:
 * the armour plating (each fragment is a piece of a made thing), and the glow
 * (light accumulated along the ray, never painted on a surface).
 */

export interface FieldModelOptions {
  /** Step budget for the march. The quality tier's only lever. */
  steps?: number;
}

/** The approved plating. Do not redecorate. */
export const PLATING = {
  /** Armour plate size. Higher is finer greebling. */
  freq: 1.9,
  /** How far plates sit above and below each other. */
  relief: 0.075,
  /** How deep the seams are cut between plates. */
  groove: 0.05,
  /** Light held in the seams. */
  heat: 1.6,
};

/**
 * The dying star, at the throat of the funnel. Not a lamp: `noise` breaks the
 * luminous edge, `ejecta` throws radial filaments off the core. Zero on either
 * is the clean-orb read the direction explicitly kills.
 */
export const STAR = {
  /**
   * Radius of the luminous core. It sits well inside the assembled shell
   * (world radius ~3.1), so from outside it is visible only through the wound
   * and the gaps between plates - shaped light, never a disc.
   */
  radius: 2.6,
  glow: 1.5,
  noise: 0.4,
  ejecta: 1.5,
  /** The ruptured crust around it. */
  body: 2.45,
  /** Plate size on the crust. */
  frac: 0.7,
  /** How far the plates have already drifted apart, before any flare. */
  break: 0.42,
};

/** How much further the flare drives the crust apart. */
export const FLARE_BREAK = 0.55;

/** Trailing ejecta behind each great fragment, back toward the source. */
export const TRAIL = 0.9;

/**
 * The small-debris field filling the blast cone. `cell` is the repetition
 * size in world units; `density` is how full the cone is. The cone itself is
 * fitted to the great fragments' funnel so the dust and the stops describe
 * the same event.
 */
export const DEBRIS_FIELD = { cell: 1.35, density: 0.4 };
export const CONE = { r0: -0.11, slope: 0.375, length: 14.0 };

/** Heat escaping from the broken faces of the fragments. */
export const LAVA = 2.2;

/** The approved glow: overall emission, and boundary concentration. */
export const GLOW = 1.9;
export const DENSITY = 9.0;

/** The approved hover response. */
export const HOVER_RADIUS = 0.42;
export const HOVER_GAIN = 2.6;
export const HOVER_FRINGE = 0.7;

/**
 * The funnel's axis, diagonal to every world axis so no camera pose aligns
 * with anything by accident.
 */
const AXIS = new THREE.Vector3(0.62, 0.18, -0.76).normalize();
const SIDE = new THREE.Vector3().crossVectors(AXIS, new THREE.Vector3(0, 1, 0)).normalize();
const LIFT = new THREE.Vector3().crossVectors(SIDE, AXIS).normalize();

export interface Fragment {
  /** Rest position, world space. */
  position: THREE.Vector3;
  /** Shell radius — the fragment's rough size. */
  shell: number;
  /** Fixed rotation, axis + angle. */
  rotation: THREE.Vector4;
  /** Where the flare pushes it: outward from the star, at its own rate. */
  drift: THREE.Vector3;
}

/**
 * The debris, laid out as a funnel.
 *
 * Distances shrink toward the star and so do the funnel radii, so the trail
 * narrows as it approaches the throat. The angles are irregular on purpose —
 * evenly stepped angles are a drawn spiral, and a drawn spiral seen anywhere
 * near its axis is the concentric read this project has died of six times.
 * Nothing about these numbers repeats.
 */
export const DEBRIS: readonly Fragment[] = [
  { distance: 11.5, radius: 4.2, angle: 0.7, shell: 1.5, spin: [0.41, 0.83, -0.37, 0.9] },
  { distance: 9.0, radius: 3.1, angle: 2.7, shell: 1.2, spin: [-0.72, 0.28, 0.63, 2.1] },
  { distance: 6.8, radius: 2.35, angle: 4.5, shell: 1.0, spin: [0.2, -0.9, 0.38, 4.2] },
  { distance: 4.8, radius: 1.65, angle: 6.1, shell: 0.85, spin: [0.86, 0.12, 0.5, 1.4] },
  { distance: 3.1, radius: 1.05, angle: 8.3, shell: 0.62, spin: [-0.33, 0.61, -0.72, 3.3] },
].map((f) => {
  const position = new THREE.Vector3()
    .addScaledVector(AXIS, f.distance)
    .addScaledVector(SIDE, Math.cos(f.angle) * f.radius)
    .addScaledVector(LIFT, Math.sin(f.angle) * f.radius);
  return {
    position,
    shell: f.shell,
    rotation: new THREE.Vector4(f.spin[0], f.spin[1], f.spin[2], f.spin[3]),
    // Away from the star, faster for the outer pieces: the explosion reads as
    // one event with the near debris already further along its arc.
    drift: position.clone().normalize().multiplyScalar(0.55 + f.distance * 0.09),
  };
});

/** The star sits at the funnel's throat. */
export const STAR_POSITION = new THREE.Vector3(0, 0, 0);

/** The funnel's frame, for whoever authors a camera against it. */
export const FUNNEL = { axis: AXIS, side: SIDE, lift: LIFT };

export class FieldModel {
  readonly group = new THREE.Group();

  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly basis = new THREE.Matrix4();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  constructor(options: FieldModelOptions = {}) {

    this.uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCamPos: { value: new THREE.Vector3() },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamForward: { value: new THREE.Vector3(0, 0, -1) },
      uTanFov: { value: Math.tan((38 * Math.PI) / 360) },
      uBreath: { value: 0 },
      uSteps: { value: options.steps ?? 128 },

      uRecord: { value: new THREE.Color('#e7dcba') },

      uStarPos: { value: STAR_POSITION.clone() },
      uStarRadius: { value: STAR.radius },
      uStarGlow: { value: STAR.glow },
      uStarNoise: { value: STAR.noise },
      uEjecta: { value: STAR.ejecta },
      // The rupture faces down the funnel — the direction the debris went, and
      // therefore the direction it was thrown.
      uFlare: { value: 0 },
      uExposure: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: fieldVert,
      fragmentShader: fieldFrag,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    // A single oversized triangle rather than a quad: one primitive, no seam
    // across the diagonal.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
    );

    const screen = new THREE.Mesh(geometry, this.material);
    screen.frustumCulled = false;
    this.group.add(screen);
  }

  /** The camera as a basis — the march needs an origin and three axes. */
  setCamera(camera: THREE.PerspectiveCamera): void {
    this.basis.extractRotation(camera.matrixWorld);
    this.right.set(1, 0, 0).applyMatrix4(this.basis);
    this.up.set(0, 1, 0).applyMatrix4(this.basis);
    this.forward.set(0, 0, -1).applyMatrix4(this.basis);

    (this.uniforms.uCamPos.value as THREE.Vector3).copy(camera.position);
    (this.uniforms.uCamRight.value as THREE.Vector3).copy(this.right);
    (this.uniforms.uCamUp.value as THREE.Vector3).copy(this.up);
    (this.uniforms.uCamForward.value as THREE.Vector3).copy(this.forward);
    this.uniforms.uTanFov.value = Math.tan((camera.fov * Math.PI) / 360);
  }

  /**
   * Guarded, because this pass has shed most of its uniforms: the geometry it
   * used to carry is authored meshes now. A setter that assumes a uniform
   * still exists throws on the first frame and takes the whole scene with it,
   * which is exactly what happened.
   */
  private set(key: string, value: number): void {
    const uniform = this.uniforms[key];
    if (uniform) uniform.value = value;
  }

  setSize(width: number, height: number): void {
    (this.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  /** Step budget, from the quality tier. */
  setSteps(steps: number): void {
    this.set('uSteps', Math.max(24, Math.min(256, Math.round(steps))));
  }

  /** Slow drift only. The debris is coasting, not animating. */
  setTime(seconds: number): void {
    this.set('uTime', seconds);
    this.set('uBreath', Math.sin(seconds * 0.11) * 0.6 + Math.sin(seconds * 0.07) * 0.4);
  }

  /**
   * The finale, driven by scroll.
   *
   * The star's output climbs an order of magnitude and every fragment is
   * pushed further out along its own line from the star — the explosion
   * continuing, not a new event. Scroll-bound and therefore reversible;
   * scrolling back up recovers the held moment exactly, because this is a
   * readout of where the visitor is, not a fuse that was lit.
   */
  setFlare(value: number): void {
    this.set('uFlare', Math.max(0, Math.min(1, value)));


  }

  /** Where the pointer is, and how far the field has come up to meet it. */
  /**
   * Kept as a no-op while attention is re-pointed.
   *
   * Hovering used to warm the seams of an SDF surface; those surfaces are
   * authored meshes now, so the response belongs on the fragment material and
   * has not been rebuilt there yet. Silently doing nothing is honest; throwing
   * is not.
   */
  setHover(x: number, y: number, strength: number): void {
    void x;
    void y;
    void strength;
  }

  /** Cold-open reveal, and the machine-off cut. */
  setExposure(value: number): void {
    this.set('uExposure', value);
  }

  /** Development only: the field's numbers, live. */
  tune(patch: Record<string, number>): void {
    for (const [key, value] of Object.entries(patch)) {
      const uniform = this.uniforms[key];
      if (uniform) uniform.value = value;
    }
  }

  dispose(): void {
    this.material.dispose();
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  }
}
