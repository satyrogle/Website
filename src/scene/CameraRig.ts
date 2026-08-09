import * as THREE from 'three';

/**
 * CameraRig
 *
 * Scroll drives a path through a fixed set of keyframes; idle drift and
 * pointer parallax are added on top as small offsets, never as competing
 * motion systems. Because the offsets are additive and damped, scroll
 * position always dominates: the visitor reads camera movement as caused
 * by their scrolling, which is the causal link the brief asks for.
 */

export interface CameraKeyframe {
  /** Global scroll progress, 0..1. */
  at: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Object roll at this point in the path. */
  roll?: number;
}

/**
 * Desktop path, authored against the Blender asset's real world extents:
 *
 *     crown        z  +1.09 .. -2.24, half-height 2.75
 *     rings        z  -0.56 .. -7.36
 *     tunnel shell z  -1.85 .. -7.80, bore radius ~1.4
 *     chamber      z  -7.55 .. -11.10
 *     Latent Form  z -11.22 .. -10.28 (after production fit)
 *
 * THE RAIL. x and y never leave zero; scroll maps to depth, and z
 * decreases monotonically — the camera never reverses, never orbits and
 * never rolls. FOV follows the directive's bands (hero 34-40, entry
 * 44-50, tunnel 46-54, threshold 40-46, resolution 34-40) and widens
 * inside the corridor to open it up, never as a zoom effect.
 */
const DESKTOP_PATH: CameraKeyframe[] = [
  // 01 — hero. Outside the crown, the whole entity composed.
  // Standoff raised from 11.0. The entity filled the frame at the
  // hero and the display type had nowhere to go that was not across
  // its cavity. This is along the rail — no lateral move, which reads
  // as the scroll going everywhere.
  // Target dropped below the entity so the mass rides HIGHER in frame
  // and its cavity clears the display type. Vertical only — the rail
  // stays dead straight on x.
  { at: 0.0, position: [0, 0, 11.8], target: [0, -0.72, 0], fov: 38 },
  { at: 0.085, position: [0, 0, 10.2], target: [0, -0.45, -0.4], fov: 39 },
  // 02 — premise. The crown yields; the camera closes on the cavity.
  { at: 0.185, position: [0, 0, 4.2], target: [0, -0.2, -1.6], fov: 45 },
  { at: 0.26, position: [0, 0, -0.6], target: [0, 0, -3.5], fov: 50 },
  // 03 — the corridor.
  { at: 0.35, position: [0, 0, -2.0], target: [0, 0, -5.0], fov: 52 },
  { at: 0.45, position: [0, 0, -3.2], target: [0, 0, -6.5], fov: 52 },
  { at: 0.55, position: [0, 0, -3.9], target: [0, 0, -7.4], fov: 51 },
  // 04 — foundation. The ring groups separate ahead of the camera.
  { at: 0.655, position: [0, 0, -4.4], target: [0, 0, -8.4], fov: 49 },
  // 05 — accumulation. Threshold approach; the Latent Form appears.
  { at: 0.775, position: [0, 0, -4.9], target: [0, 0, -9.6], fov: 46 },
  // 06 — evidence. Movement slows hard; the destination holds still.
  { at: 0.885, position: [0, 0, -5.3], target: [0, 0, -10.6], fov: 42 },
  // 07 — resolution. Arrived: 5.2 units off the Latent Form at 38
  // degrees, framing it at roughly 73% of frame height.
  { at: 1.0, position: [0, 0, -5.6], target: [0, 0, -10.8], fov: 38 },
];

/**
 * Mobile: same rail, same asset, pulled back for portrait and travelling
 * less far. The directive is explicit that mobile should not attempt the
 * full desktop corridor.
 */
const MOBILE_PATH: CameraKeyframe[] = [
  { at: 0.0, position: [0, 0, 13.6], target: [0, 0, 0], fov: 44 },
  { at: 0.085, position: [0, 0, 11.8], target: [0, 0, -0.4], fov: 45 },
  { at: 0.185, position: [0, 0, 5.6], target: [0, 0, -1.6], fov: 50 },
  { at: 0.26, position: [0, 0, 0.4], target: [0, 0, -3.5], fov: 55 },
  { at: 0.35, position: [0, 0, -1.4], target: [0, 0, -5.2], fov: 57 },
  { at: 0.45, position: [0, 0, -2.6], target: [0, 0, -6.8], fov: 57 },
  { at: 0.55, position: [0, 0, -3.4], target: [0, 0, -7.6], fov: 56 },
  { at: 0.655, position: [0, 0, -3.9], target: [0, 0, -8.6], fov: 54 },
  { at: 0.775, position: [0, 0, -4.4], target: [0, 0, -9.8], fov: 50 },
  { at: 0.885, position: [0, 0, -4.8], target: [0, 0, -10.6], fov: 46 },
  { at: 1.0, position: [0, 0, -5.1], target: [0, 0, -10.8], fov: 43 },
];

/**
 * Reduced motion gets composed STATES rather than travel.
 *
 * The directive is explicit: no long zoom, no continual rotation, no
 * continuous camera flight. These four are stills of the same journey —
 * outside the crown, the opened cavity, the corridor interior, the
 * threshold and Latent Form — and the page cuts between them as the
 * visitor scrolls. Every one is a composition that stands on its own,
 * because a visitor who needs reduced motion still gets the whole story.
 */
export const REDUCED_STATES: CameraKeyframe[] = [
  { at: 0.00, position: [0.35, 0.15, 10.6], target: [0, 0.1, 0], fov: 39 },
  { at: 0.26, position: [0, 0, 3.4], target: [0, 0, -2.0], fov: 46 },
  { at: 0.55, position: [0, 0, -3.4], target: [0, 0, -7.0], fov: 51 },
  { at: 0.88, position: [0, 0, -5.4], target: [0, 0, -10.8], fov: 40 },
];

/** Composed still used for the WebGL poster frame. */
export const POSTER_FRAME: CameraKeyframe = {
  at: 0,
  position: [0.35, 0.15, 10.6],
  target: [0, 0.1, 0],
  fov: 39,
};

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * HERO LENS SHIFT — how far the entity is pushed right of centre, as a
 * fraction of frame width, and the progress by which it is gone.
 *
 * A lens shift, not a pan. Panning the target to move the entity off
 * centre also ROTATES the view, so the object is seen from an angle it
 * is not actually at and the far side skews — at the offset this needs,
 * about fifteen degrees of it. Offsetting the projection instead is what
 * a shift lens does: the entity moves across the frame with its
 * perspective untouched.
 *
 * It decays to zero well before the camera reaches the aperture at 26%,
 * so the flight down the throat is dead-centre exactly as before. The
 * rail is still straight; this only changes which part of the frustum is
 * being looked through.
 */
const HERO_LENS_SHIFT = 0.18;
const HERO_LENS_SHIFT_END = 0.18;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private path: CameraKeyframe[];
  private progress = 0;
  /** Raw target from the scroll director; progress springs toward it. */
  private rawProgress = 0;
  private progressVel = 0;

  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly smoothedPosition = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private smoothedFov = 46;
  private roll = 0;

  private pointer = new THREE.Vector2();
  private pointerDamped = new THREE.Vector2();

  private idleAmount = 1;
  private parallaxAmount = 1;
  private initialised = false;
  private mobile = false;
  private lensShift = -1;
  /** The real frame aspect, which setViewOffset would otherwise clobber. */
  private frameAspect = 1.6;

  constructor(aspect: number, mobile: boolean) {
    this.mobile = mobile;
    this.frameAspect = aspect;
    this.path = mobile ? MOBILE_PATH : DESKTOP_PATH;
      this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 120);
    this.applyKeyframe(this.path[0]);
    this.smoothedPosition.copy(this.position);
    this.smoothedTarget.copy(this.target);
  }

  setPath(mobile: boolean): void {
    this.mobile = mobile;
    this.path = mobile ? MOBILE_PATH : DESKTOP_PATH;
  }

  /**
   * Offsets the projection so the entity sits right of centre and the
   * display type gets a column of its own.
   *
   * Desktop only. Portrait has no room to stand the type beside the
   * object — the stylesheet already gives up and lets the type own the
   * frame there — so shifting the entity off centre on a phone would
   * just push it out of view.
   */
  private applyLensShift(shift: number): void {
    const wanted = this.mobile ? 0 : shift;
    if (Math.abs(wanted - this.lensShift) < 0.0005) return;
    this.lensShift = wanted;
    if (wanted <= 0.0005) {
      this.camera.clearViewOffset();
      // clearViewOffset does NOT restore the aspect that setViewOffset
      // overwrote, so it has to be put back by hand or the frame stays
      // squeezed for the rest of the journey.
      this.camera.aspect = this.frameAspect;
      this.camera.updateProjectionMatrix();
      return;
    }
    // fullWidth / fullHeight MUST carry the real aspect: setViewOffset
    // assigns camera.aspect = fullWidth / fullHeight internally. Passing
    // 1, 1 — which looks harmless, since only ratios matter to the
    // offset maths — silently reset a 1.6 camera to 1.0 and rendered
    // everything 60% oversized.
    const w = this.frameAspect;
    this.camera.setViewOffset(w, 1, -wanted * w, 0, w, 1);
  }

  setProgress(p: number): void {
    this.rawProgress = Math.min(Math.max(p, 0), 1);
  }

  /** Spring-smoothed narrative progress; drives the trip flow. */
  get smoothedProgress(): number {
    return this.progress;
  }

  setPointer(x: number, y: number): void {
    this.pointer.set(x, y);
  }

  /** 0 disables drift/parallax entirely (reduced motion). */
  setMotionScale(idle: number, parallax: number): void {
    this.idleAmount = idle;
    this.parallaxAmount = parallax;
  }

  /**
   * Snaps to the composed reduced-motion state for this progress. No
   * interpolation: cutting between stills is the point.
   */
  applyReducedState(progress: number): void {
    let chosen = REDUCED_STATES[0];
    for (const state of REDUCED_STATES) {
      if (progress >= state.at) chosen = state;
    }
    this.applyKeyframe(chosen);
    this.smoothedPosition.copy(this.position);
    this.smoothedTarget.copy(this.target);
    this.camera.position.copy(this.position);
    this.camera.fov = chosen.fov;
    this.camera.rotation.z = 0;
    this.camera.lookAt(this.target);
    this.applyLensShift(
      HERO_LENS_SHIFT *
        (1 - smootherstep(Math.min(progress / HERO_LENS_SHIFT_END, 1)))
    );
    this.camera.updateProjectionMatrix();
  }

  /** Freezes the rig on the composed poster frame. */
  applyPoster(): void {
    this.applyKeyframe(POSTER_FRAME);
    this.smoothedPosition.copy(this.position);
    this.smoothedTarget.copy(this.target);
    this.smoothedFov = POSTER_FRAME.fov;
    this.camera.position.copy(this.position);
    this.camera.fov = POSTER_FRAME.fov;
    this.camera.rotation.z = 0;
    this.camera.lookAt(this.target);
    this.camera.rotation.z = POSTER_FRAME.roll ?? 0;
    this.applyLensShift(HERO_LENS_SHIFT);
    this.camera.updateProjectionMatrix();
  }

  private applyKeyframe(k: CameraKeyframe): void {
    this.position.set(...k.position);
    this.target.set(...k.target);
    this.smoothedFov = k.fov;
    this.roll = k.roll ?? 0;
  }

  private sample(): void {
    const p = this.progress;
    const path = this.path;

    let i = 0;
    while (i < path.length - 2 && path[i + 1].at < p) i++;

    const a = path[i];
    const b = path[i + 1] ?? a;
    const span = Math.max(b.at - a.at, 1e-5);
    const t = smootherstep(Math.min(Math.max((p - a.at) / span, 0), 1));

    this.position.set(
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t,
      a.position[2] + (b.position[2] - a.position[2]) * t
    );
    this.target.set(
      a.target[0] + (b.target[0] - a.target[0]) * t,
      a.target[1] + (b.target[1] - a.target[1]) * t,
      a.target[2] + (b.target[2] - a.target[2]) * t
    );
    this.smoothedFov = a.fov + (b.fov - a.fov) * t;
    this.roll = (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * t;
  }

  update(time: number, dt: number): void {
    // Critically damped spring from scroll to camera progress.
    //
    // This is the scroll-feel fix. First-order smoothing keeps position
    // continuous but lets velocity jump — every time the scroll mapping
    // changes rate at a section boundary, the camera kicked, which read
    // as bad scrolling rather than bad damping. A second-order spring
    // keeps velocity continuous too: speed changes arrive as gradients,
    // never as steps, while still settling in a fraction of a second.
    const omega = 9.0;
    const accel =
      omega * omega * (this.rawProgress - this.progress) - 2.0 * omega * this.progressVel;
    this.progressVel += accel * dt;
    this.progress = Math.min(Math.max(this.progress + this.progressVel * dt, 0), 1);

    this.sample();

    // Restrained idle drift — a slow figure-of-eight, well under the
    // amplitude of any scroll-driven move so the two never compete.
    const drift = this.idleAmount;
    const driftX = Math.sin(time * 0.19) * 0.05 * drift;
    const driftY = Math.cos(time * 0.13) * 0.035 * drift;
    const driftZ = Math.sin(time * 0.087 + 1.1) * 0.028 * drift;

    // Pointer parallax, heavily damped.
    const pointerEase = 1 - Math.pow(0.0006, dt);
    this.pointerDamped.x += (this.pointer.x - this.pointerDamped.x) * pointerEase;
    this.pointerDamped.y += (this.pointer.y - this.pointerDamped.y) * pointerEase;
    const px = this.pointerDamped.x * 0.15 * this.parallaxAmount;
    const py = this.pointerDamped.y * 0.11 * this.parallaxAmount;

    const goalX = this.position.x + driftX + px;
    const goalY = this.position.y + driftY + py;
    const goalZ = this.position.z + driftZ;

    // Critically damped follow. On the first frame we snap, so the hero
    // is composed immediately rather than easing in from the origin.
    const ease = this.initialised ? 1 - Math.pow(0.000004, dt) : 1;
    this.initialised = true;

    this.smoothedPosition.x += (goalX - this.smoothedPosition.x) * ease;
    this.smoothedPosition.y += (goalY - this.smoothedPosition.y) * ease;
    this.smoothedPosition.z += (goalZ - this.smoothedPosition.z) * ease;

    this.smoothedTarget.x += (this.target.x - px * 0.35 - this.smoothedTarget.x) * ease;
    this.smoothedTarget.y += (this.target.y - py * 0.35 - this.smoothedTarget.y) * ease;
    this.smoothedTarget.z += (this.target.z - this.smoothedTarget.z) * ease;

    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedTarget);
    this.camera.rotation.z += this.roll;

    // Off the SMOOTHED progress, so the shift releases on the same
    // spring as everything else rather than tracking raw scroll.
    this.applyLensShift(
      HERO_LENS_SHIFT *
        (1 - smootherstep(Math.min(this.progress / HERO_LENS_SHIFT_END, 1)))
    );

    if (Math.abs(this.camera.fov - this.smoothedFov) > 0.001) {
      this.camera.fov = this.smoothedFov;
      this.camera.updateProjectionMatrix();
    }
  }

  resize(aspect: number): void {
    this.frameAspect = aspect;
    this.camera.aspect = aspect;
    // Re-issue the offset against the new aspect; a stale one carries
    // the old frame shape into the resized viewport.
    const shift = this.lensShift;
    this.lensShift = -1;
    this.applyLensShift(Math.max(shift, 0));
    this.camera.updateProjectionMatrix();
  }
}
