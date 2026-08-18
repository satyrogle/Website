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
 * The mass sits around z 20, the core at z -48. The path runs from far
 * exterior straight through the body of the lattice to the core
 * chamber. The entry leg runs parallel to a lattice axis on purpose:
 * looking down an axis, the aligned nodes form nested receding frames.
 * That is the tunnel, made of nothing but the lattice itself.
 */
const KEYS: PathKey[] = [
  { p: 0.0, pos: [0, 8, 175], look: [0, 0, 10], fov: 40, sev: 0.0 },
  { p: 0.1, pos: [4, 6, 140], look: [0, 0, 8], fov: 42, sev: 0.0 },
  { p: 0.2, pos: [10, 3, 100], look: [0, -1, 8], fov: 44, sev: 0.05 },
  { p: 0.32, pos: [3, 1, 62], look: [0, -1, -10], fov: 48, sev: 0.12 },
  { p: 0.44, pos: [1.2, -0.5, 34], look: [1.2, -0.5, -30], fov: 52, sev: 0.35 },
  { p: 0.56, pos: [1.2, -1, 8], look: [1.2, -1, -46], fov: 54, sev: 0.6 },
  { p: 0.68, pos: [-4, -2, -14], look: [0, 0, -46], fov: 52, sev: 0.78 },
  { p: 0.8, pos: [-3, 2.5, -27], look: [0, 0, -48], fov: 48, sev: 0.9 },
  { p: 0.92, pos: [-0.5, 1.8, -30], look: [0, 0, -48], fov: 46, sev: 0.9 },
  { p: 1.0, pos: [0, 2.2, -31.5], look: [0, -0.3, -48], fov: 44, sev: 0.85 }
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
