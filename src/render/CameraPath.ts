import * as THREE from 'three';

/**
 * The single authored travel: exterior, approach, entry, descent, core.
 * Same architecture as the reference: one continuous camera journey,
 * content at spatial stops, ending at the entity. Scroll drives
 * progress; this class never invents behaviour.
 */

interface PathKey {
  p: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
  sev: number;
}

/**
 * THE FALSE HEAVEN. The sea lies at y 0, the light layer at y 26, the
 * rows run toward -z and agree at the vanishing point. The journey:
 * beneath the firmament (the approved frame), the rise, the passage
 * between the rows (the tunnel, made of the rows themselves), the
 * breach onto the maintenance side, and the service run along the
 * sockets to the end.
 */
const KEYS: PathKey[] = [
  { p: 0.0, pos: [0, 4.5, 55], look: [0, 15, -260], fov: 44, sev: 0.0 },
  { p: 0.1, pos: [0, 5.5, 42], look: [0, 16, -250], fov: 44, sev: 0.0 },
  { p: 0.22, pos: [2, 9, 18], look: [0, 20, -240], fov: 46, sev: 0.06 },
  { p: 0.34, pos: [1.5, 16, -12], look: [1.5, 24.2, -200], fov: 48, sev: 0.18 },
  { p: 0.46, pos: [1.5, 24.6, -55], look: [1.5, 25.6, -260], fov: 52, sev: 0.4 },
  { p: 0.58, pos: [1.5, 27.5, -105], look: [1.5, 27, -300], fov: 52, sev: 0.6 },
  { p: 0.7, pos: [0, 30, -150], look: [0, 27.5, -320], fov: 50, sev: 0.78 },
  { p: 0.84, pos: [1.2, 29.5, -205], look: [0, 27, -360], fov: 48, sev: 0.9 },
  { p: 0.92, pos: [0, 29, -240], look: [0, 26.8, -380], fov: 46, sev: 0.9 },
  { p: 1.0, pos: [0, 28.6, -258], look: [0, 26.2, -400], fov: 44, sev: 0.85 }
];

export interface CameraState {
  severity: number;
}

export class CameraPath {
  readonly state: CameraState = { severity: 0 };

  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly targetPos = new THREE.Vector3();
  private readonly targetLook = new THREE.Vector3();
  private fov = 40;
  private initialised = false;

  /** Advance toward the scroll target; smoothing follows input, never leads. */
  update(camera: THREE.PerspectiveCamera, progress: number, dt: number, snap: boolean): void {
    evaluate(progress, this.targetPos, this.targetLook);
    const t = evalScalar(progress);

    const k = snap || !this.initialised ? 1 : 1 - Math.exp(-dt * 5.0);
    this.initialised = true;
    this.pos.lerp(this.targetPos, k);
    this.look.lerp(this.targetLook, k);
    this.fov += (t.fov - this.fov) * k;
    this.state.severity += (t.sev - this.state.severity) * k;

    camera.position.copy(this.pos);
    camera.lookAt(this.look);
    if (Math.abs(camera.fov - this.fov) > 0.05) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }

  /** Where a press lands: a fixed reach ahead of the camera. */
  markPoint(camera: THREE.PerspectiveCamera, ndcX: number, ndcY: number): THREE.Vector3 {
    const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
    return camera.position.clone().add(dir.multiplyScalar(14));
  }
}

function evaluate(p: number, outPos: THREE.Vector3, outLook: THREE.Vector3): void {
  const seg = segment(p);
  outPos.set(
    lerp(seg.a.pos[0], seg.b.pos[0], seg.t),
    lerp(seg.a.pos[1], seg.b.pos[1], seg.t),
    lerp(seg.a.pos[2], seg.b.pos[2], seg.t)
  );
  outLook.set(
    lerp(seg.a.look[0], seg.b.look[0], seg.t),
    lerp(seg.a.look[1], seg.b.look[1], seg.t),
    lerp(seg.a.look[2], seg.b.look[2], seg.t)
  );
}

function evalScalar(p: number): { fov: number; sev: number } {
  const seg = segment(p);
  return {
    fov: lerp(seg.a.fov, seg.b.fov, seg.t),
    sev: lerp(seg.a.sev, seg.b.sev, seg.t)
  };
}

function segment(p: number): { a: PathKey; b: PathKey; t: number } {
  const first = KEYS[0]!;
  const last = KEYS[KEYS.length - 1]!;
  if (p <= first.p) return { a: first, b: first, t: 0 };
  if (p >= last.p) return { a: last, b: last, t: 0 };
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    if (p >= a.p && p <= b.p) {
      const raw = (p - a.p) / (b.p - a.p);
      return { a, b, t: raw * raw * (3 - 2 * raw) };
    }
  }
  return { a: last, b: last, t: 0 };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
