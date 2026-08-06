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
 * Desktop path. The camera starts close enough to crop the object, moves
 * through the plates at the premise, tracks laterally across the three
 * game states, pulls side-on for the layer separation, then withdraws
 * steadily into the documentary section and settles on the full
 * silhouette.
 */
const DESKTOP_PATH: CameraKeyframe[] = [
  // THE RAIL. x and y never leave zero; scroll maps to depth.
  //
  // 01 — cold open. The sealed monolith and its halo, whole.
  { at: 0.0, position: [0, 0, 16.6], target: [0, 0, 0], fov: 40 },
  { at: 0.085, position: [0, 0, 14.4], target: [0, 0, 0], fov: 41 },
  // 02 — premise. The door swings open; the camera crosses through.
  { at: 0.185, position: [0, 0, 8.0], target: [0, 0, -6], fov: 46 },
  { at: 0.26, position: [0, 0, 1.4], target: [0, 0, -8], fov: 52 },
  // 03 — the trip.
  { at: 0.35, position: [0, 0, -4.6], target: [0, 0, -12], fov: 52 },
  { at: 0.45, position: [0, 0, -9.4], target: [0, 0, -17], fov: 52 },
  { at: 0.55, position: [0, 0, -13.0], target: [0, 0, -21], fov: 52 },
  // 04 — foundation. Ring thirds separate ahead; still inside them.
  { at: 0.655, position: [0, 0, -15.6], target: [0, 0, -26], fov: 50 },
  // 05 — accumulation. Clearing the final rings around ~80%.
  { at: 0.775, position: [0, 0, -18.8], target: [0, 0, -27], fov: 46 },
  // 06 — evidence. The far door and its halo burn ahead — the ending
  // is visible for the whole documentary stretch.
  { at: 0.885, position: [0, 0, -21.6], target: [0, 0, -33], fov: 42 },
  // 07 — resolution. Arrived: the sealed twin, whole, halo above.
  { at: 1.0, position: [0, 0, -23.5], target: [0, 0, -33], fov: 38 },
];

/**
 * Mobile: the same rail, pulled back for portrait framing.
 */
const MOBILE_PATH: CameraKeyframe[] = [
  { at: 0.0, position: [0, 0, 19.8], target: [0, 0, 0], fov: 46 },
  { at: 0.085, position: [0, 0, 17.2], target: [0, 0, 0], fov: 47 },
  { at: 0.185, position: [0, 0, 9.6], target: [0, 0, -6], fov: 52 },
  { at: 0.26, position: [0, 0, 1.8], target: [0, 0, -8], fov: 57 },
  { at: 0.35, position: [0, 0, -4.4], target: [0, 0, -12], fov: 58 },
  { at: 0.45, position: [0, 0, -9.2], target: [0, 0, -17], fov: 58 },
  { at: 0.55, position: [0, 0, -12.8], target: [0, 0, -21], fov: 58 },
  { at: 0.655, position: [0, 0, -15.4], target: [0, 0, -26], fov: 56 },
  { at: 0.775, position: [0, 0, -18.6], target: [0, 0, -27], fov: 50 },
  { at: 0.885, position: [0, 0, -21.2], target: [0, 0, -33], fov: 46 },
  { at: 1.0, position: [0, 0, -22.9], target: [0, 0, -33], fov: 42 },
];

/** Composed still used for reduced motion and the WebGL poster frame. */
export const POSTER_FRAME: CameraKeyframe = {
  at: 0,
  position: [0.4, 0.1, 16.2],
  target: [0, 0, 0],
  fov: 41,
};

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

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

  constructor(aspect: number, mobile: boolean) {
    this.path = mobile ? MOBILE_PATH : DESKTOP_PATH;
    // Far plane pushed out: the corridor is ~17 units deep and the
    // evidence movement watches it from 26 units behind.
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 120);
    this.applyKeyframe(this.path[0]);
    this.smoothedPosition.copy(this.position);
    this.smoothedTarget.copy(this.target);
  }

  setPath(mobile: boolean): void {
    this.path = mobile ? MOBILE_PATH : DESKTOP_PATH;
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

    if (Math.abs(this.camera.fov - this.smoothedFov) > 0.001) {
      this.camera.fov = this.smoothedFov;
      this.camera.updateProjectionMatrix();
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
