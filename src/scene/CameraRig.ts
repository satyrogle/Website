import * as THREE from 'three';

/**
 * CameraRig
 *
 * Scroll drives a straight rail through the monolith. x and y never
 * leave the axis; z decreases monotonically; there is no orbit, no roll
 * and no lateral wandering. The entity is moved off centre for the hero
 * by offsetting the projection — a lens shift, not a pan, so the
 * building is still seen from directly in front of it.
 */

export interface CameraKeyframe {
  /** Prologue progress, 0..1. */
  at: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Projection offset right, as a fraction of frame width. */
  shift: number;
  /**
   * Projection offset up, as a fraction of frame height. Portrait has no
   * column beside the subject, so the building is raised in the frame
   * instead and the copy takes the space below it. Same technique as the
   * horizontal shift: the lens moves, the camera does not.
   */
  rise?: number;
}

/**
 * Desktop rail, authored against the asset's real extents:
 *
 *   Full Form   x -1.30..1.30, y -3.30..3.90, z -1.30..1.00
 *   tunnel      z -1.70..-18.00, bore half-width ~0.9
 *   latent core z -19.92..-19.28, half-height 1.05
 */
const DESKTOP_PATH: CameraKeyframe[] = [
  // Full Form — the complete silhouette, halo behind, copy column left.
  { at: 0.0, position: [0, 0.3, 12.2], target: [0, 0.3, 0], fov: 39, shift: 0.18 },
  { at: 0.16, position: [0, 0.3, 11.4], target: [0, 0.3, -0.2], fov: 39, shift: 0.18 },
  // Opening — the masses displace and the passage is revealed.
  { at: 0.24, position: [0, 0.28, 10.4], target: [0, 0.24, -0.7], fov: 39, shift: 0.13 },
  { at: 0.33, position: [0, 0.2, 6.0], target: [0, 0.14, -1.8], fov: 43, shift: 0.04 },
  { at: 0.42, position: [0, 0.05, 1.2], target: [0, 0, -3.0], fov: 49, shift: 0 },
  // Tunnel — dead centre, travel caused by scroll.
  { at: 0.52, position: [0, 0, -3.0], target: [0, 0, -7.0], fov: 51, shift: 0 },
  { at: 0.62, position: [0, 0, -7.2], target: [0, 0, -11.2], fov: 51, shift: 0 },
  { at: 0.72, position: [0, 0, -10.6], target: [0, 0, -14.6], fov: 50, shift: 0 },
  // Latent Form — the camera slows hard and stops in a composed frame.
  { at: 0.84, position: [0, 0, -12.2], target: [0, 0, -17.0], fov: 45, shift: 0.08 },
  { at: 0.94, position: [0, 0, -13.1], target: [0, 0, -18.4], fov: 41, shift: 0.14 },
  { at: 1.0, position: [0, 0, -13.3], target: [0, 0, -18.6], fov: 40, shift: 0.14 },
];

/**
 * Mobile keeps the same three states but does not attempt the desktop
 * flight: it holds each composition and eases briefly between them.
 * There is no lens shift — portrait has no column to protect.
 */
const MOBILE_PATH: CameraKeyframe[] = [
  { at: 0.0, position: [0, 0.3, 16.4], target: [0, 0.3, 0], fov: 44, shift: 0, rise: 0.22 },
  { at: 0.2, position: [0, 0.3, 15.8], target: [0, 0.3, -0.2], fov: 44, shift: 0, rise: 0.22 },
  { at: 0.34, position: [0, 0.2, 9.4], target: [0, 0.1, -1.8], fov: 48, shift: 0, rise: 0.12 },
  { at: 0.46, position: [0, 0, -2.4], target: [0, 0, -6.4], fov: 58, shift: 0, rise: 0 },
  { at: 0.62, position: [0, 0, -6.0], target: [0, 0, -10.0], fov: 58, shift: 0, rise: 0 },
  { at: 0.72, position: [0, 0, -9.0], target: [0, 0, -13.0], fov: 55, shift: 0, rise: 0.04 },
  // Held further back than desktop and raised in the frame: portrait has
  // no column beside the core, so the copy takes the space below it.
  { at: 0.88, position: [0, 0, -11.4], target: [0, 0, -18.2], fov: 46, shift: 0, rise: 0.13 },
  { at: 1.0, position: [0, 0, -11.9], target: [0, 0, -18.6], fov: 44, shift: 0, rise: 0.14 },
];

/**
 * Reduced motion gets three composed stills of the same journey, cut
 * between rather than travelled through. Each one stands on its own.
 */
export const REDUCED_STATES: CameraKeyframe[] = [
  { at: 0.0, position: [0, 0.3, 12.2], target: [0, 0.3, 0], fov: 39, shift: 0.18 },
  { at: 0.36, position: [0, 0, -5.2], target: [0, 0, -9.4], fov: 51, shift: 0 },
  { at: 0.72, position: [0, 0, -13.3], target: [0, 0, -18.6], fov: 40, shift: 0.14 },
];

/** The composition the static poster and the social image are cut from. */
export const POSTER_FRAME: CameraKeyframe = DESKTOP_PATH[0];

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private path: CameraKeyframe[];
  private progress = 0;
  private rawProgress = 0;
  private progressVel = 0;

  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly smoothedPosition = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private smoothedFov = 38;
  private shift = 0;

  private idleAmount = 1;
  private initialised = false;
  private mobile = false;
  private appliedShift = -1;
  private appliedRise = -1;
  private rise = 0;
  /** The real frame aspect, which setViewOffset would otherwise clobber. */
  private frameAspect = 1.6;

  constructor(aspect: number, mobile: boolean) {
    this.mobile = mobile;
    this.frameAspect = aspect;
    this.path = mobile ? MOBILE_PATH : DESKTOP_PATH;
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 90);
    this.applyKeyframe(this.path[0]);
    this.smoothedPosition.copy(this.position);
    this.smoothedTarget.copy(this.target);
  }

  setPath(mobile: boolean): void {
    this.mobile = mobile;
    this.path = mobile ? MOBILE_PATH : DESKTOP_PATH;
  }

  /**
   * Offsets the projection so the subject sits right of centre and the
   * copy gets a column of its own. Panning the target instead would
   * rotate the view and skew the far side of the building.
   */
  private applyShift(shift: number, rise: number): void {
    const wantedX = this.mobile ? 0 : shift;
    const wantedY = this.mobile ? rise : 0;
    if (
      Math.abs(wantedX - this.appliedShift) < 0.0005 &&
      Math.abs(wantedY - this.appliedRise) < 0.0005
    ) {
      return;
    }
    this.appliedShift = wantedX;
    this.appliedRise = wantedY;
    if (wantedX <= 0.0005 && Math.abs(wantedY) <= 0.0005) {
      this.camera.clearViewOffset();
      // clearViewOffset does not restore the aspect setViewOffset
      // overwrote, so it has to be put back by hand.
      this.camera.aspect = this.frameAspect;
      this.camera.updateProjectionMatrix();
      return;
    }
    // fullWidth / fullHeight must carry the real aspect: setViewOffset
    // assigns camera.aspect = fullWidth / fullHeight internally.
    const w = this.frameAspect;
    this.camera.setViewOffset(w, 1, -wantedX * w, wantedY, w, 1);
  }

  setProgress(p: number): void {
    this.rawProgress = Math.min(Math.max(p, 0), 1);
  }

  get smoothedProgress(): number {
    return this.progress;
  }

  /** 0 disables idle drift entirely (reduced motion). */
  setMotionScale(idle: number): void {
    this.idleAmount = idle;
  }

  /** Snaps to the composed reduced-motion state for this progress. */
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
    this.applyShift(chosen.shift, chosen.rise ?? 0);
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
    this.applyShift(POSTER_FRAME.shift, POSTER_FRAME.rise ?? 0);
    this.camera.updateProjectionMatrix();
  }

  private applyKeyframe(k: CameraKeyframe): void {
    this.position.set(...k.position);
    this.target.set(...k.target);
    this.smoothedFov = k.fov;
    this.shift = k.shift;
    this.rise = k.rise ?? 0;
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
    this.shift = a.shift + (b.shift - a.shift) * t;
    this.rise = (a.rise ?? 0) + ((b.rise ?? 0) - (a.rise ?? 0)) * t;
  }

  update(time: number, dt: number): void {
    // Critically damped spring from scroll to camera progress. Velocity
    // stays continuous, so a rate change at a beat boundary arrives as a
    // gradient rather than a kick.
    const omega = 9.0;
    const accel =
      omega * omega * (this.rawProgress - this.progress) - 2.0 * omega * this.progressVel;
    this.progressVel += accel * dt;
    this.progress = Math.min(Math.max(this.progress + this.progressVel * dt, 0), 1);

    this.sample();

    // Idle drift, well under the amplitude of any scroll-driven move so
    // the two never compete. No lateral component: the rail is straight.
    const drift = this.idleAmount;
    const driftY = Math.cos(time * 0.13) * 0.022 * drift;
    const driftZ = Math.sin(time * 0.087 + 1.1) * 0.02 * drift;

    const goalY = this.position.y + driftY;
    const goalZ = this.position.z + driftZ;

    // Snap on the first frame so the hero is composed immediately.
    const ease = this.initialised ? 1 - Math.pow(0.000004, dt) : 1;
    this.initialised = true;

    this.smoothedPosition.x += (this.position.x - this.smoothedPosition.x) * ease;
    this.smoothedPosition.y += (goalY - this.smoothedPosition.y) * ease;
    this.smoothedPosition.z += (goalZ - this.smoothedPosition.z) * ease;

    this.smoothedTarget.x += (this.target.x - this.smoothedTarget.x) * ease;
    this.smoothedTarget.y += (this.target.y - this.smoothedTarget.y) * ease;
    this.smoothedTarget.z += (this.target.z - this.smoothedTarget.z) * ease;

    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedTarget);
    this.camera.rotation.z = 0;

    this.applyShift(this.shift, this.rise);

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
    const shift = this.appliedShift;
    const rise = this.appliedRise;
    this.appliedShift = -1;
    this.appliedRise = -1;
    this.applyShift(Math.max(shift, 0), rise);
    this.camera.updateProjectionMatrix();
  }
}
