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
/**
 * The score: dwell where a panel is read, travel between. The approach
 * orbits so the mass reads in three dimensions; the climb hugs the
 * face so the cells sweep past; the breach enters the upper wound,
 * Brawler is read from inside the wall among the frame's beams, the
 * lower wound exits onto the stripped face, and the journey ends at
 * the foot, looking up at the true form.
 */
const KEYS: PathKey[] = [
  // ENTER: the approved opening frame, held
  { p: 0.0, pos: [0, 14, 300], look: [0, 96, 0], fov: 40, sev: 0.0 },
  { p: 0.07, pos: [3, 14, 282], look: [0, 95, 0], fov: 40, sev: 0.0 },
  // travel: the orbit in
  { p: 0.15, pos: [42, 20, 148], look: [0, 80, 0], fov: 42, sev: 0.03 },
  // SYSTEM: dwell low at the face
  { p: 0.21, pos: [29, 29, 42], look: [4, 58, 2], fov: 46, sev: 0.06 },
  { p: 0.27, pos: [27, 32, 38], look: [2, 64, 0], fov: 46, sev: 0.08 },
  // DESK42: dwell mid-face
  { p: 0.32, pos: [17, 50, 32], look: [0, 84, 4], fov: 47, sev: 0.14 },
  { p: 0.39, pos: [15, 55, 30], look: [0, 90, 5], fov: 47, sev: 0.18 },
  // travel: the climb, cells sweeping past
  { p: 0.44, pos: [11, 82, 27], look: [0, 116, 8], fov: 50, sev: 0.32 },
  // RULE: dwell close on the law face, decay working overhead
  { p: 0.48, pos: [9, 106, 26], look: [2, 134, 10], fov: 50, sev: 0.5 },
  { p: 0.53, pos: [8, 116, 25], look: [4, 138, 12], fov: 50, sev: 0.58 },
  // travel: through the upper wound
  { p: 0.575, pos: [6, 138, 19], look: [3, 132, 2], fov: 52, sev: 0.68 },
  // BRAWLER: dwell inside the wall, among the beams
  { p: 0.61, pos: [3, 122, 9], look: [-3, 94, 3], fov: 52, sev: 0.74 },
  { p: 0.66, pos: [1, 112, 8], look: [-4, 84, 5], fov: 52, sev: 0.78 },
  // travel: descend the cavity toward the lower wound
  { p: 0.71, pos: [-3, 84, 9], look: [-4, 64, 14], fov: 50, sev: 0.82 },
  // TECHNOLOGY: emerged through the exit wound, the stripped face
  { p: 0.75, pos: [-8, 58, 40], look: [0, 76, 0], fov: 47, sev: 0.88 },
  { p: 0.8, pos: [-9, 52, 46], look: [0, 72, 0], fov: 47, sev: 0.9 },
  // STUDIO: dwell at the foot among the scree
  { p: 0.85, pos: [-4, 16, 64], look: [0, 62, 0], fov: 46, sev: 0.88 },
  { p: 0.9, pos: [-2, 12, 70], look: [0, 66, 0], fov: 46, sev: 0.87 },
  // CONTACT: the true form, held
  { p: 0.96, pos: [0, 7.5, 78], look: [0, 96, 0], fov: 46, sev: 0.85 },
  { p: 1.0, pos: [0, 7, 78], look: [0, 98, 0], fov: 46, sev: 0.85 }
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
