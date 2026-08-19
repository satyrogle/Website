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
  { p: 0.045, pos: [2, 14, 288], look: [0, 95, 0], fov: 40, sev: 0.0 },
  // travel: the orbit in
  { p: 0.115, pos: [30, 22, 120], look: [0, 74, 0], fov: 43, sev: 0.03 },
  // SYSTEM: dwell low at the face
  { p: 0.15, pos: [26, 28, 52], look: [2, 60, 0], fov: 46, sev: 0.06 },
  { p: 0.185, pos: [24, 30, 46], look: [2, 64, 0], fov: 46, sev: 0.08 },
  // DESK42: dwell wide, the monument entire above its sea
  { p: 0.255, pos: [44, 58, 86], look: [0, 84, 0], fov: 44, sev: 0.12 },
  { p: 0.325, pos: [40, 60, 80], look: [0, 88, 0], fov: 44, sev: 0.16 },
  // RULE: dwell close on the law face, the climb behind it
  { p: 0.395, pos: [10, 98, 26], look: [2, 126, 10], fov: 50, sev: 0.42 },
  { p: 0.462, pos: [8, 112, 25], look: [4, 136, 12], fov: 50, sev: 0.55 },
  // travel: through the upper wound
  { p: 0.5, pos: [6, 136, 20], look: [4, 134, 4], fov: 52, sev: 0.66 },
  // BRAWLER: dwell inside the wall, gaze along the cavity
  { p: 0.53, pos: [3, 124, 10], look: [-2, 106, 2], fov: 52, sev: 0.72 },
  { p: 0.6, pos: [0, 108, 8], look: [-4, 86, 4], fov: 52, sev: 0.78 },
  // travel: descend the cavity toward the lower wound
  { p: 0.64, pos: [-3, 84, 10], look: [-4, 68, 16], fov: 50, sev: 0.82 },
  // TECHNOLOGY: emerged through the exit wound, the stripped face
  { p: 0.67, pos: [-14, 60, 46], look: [0, 78, -2], fov: 47, sev: 0.87 },
  { p: 0.74, pos: [-17, 52, 58], look: [0, 72, 0], fov: 47, sev: 0.9 },
  // STUDIO: dwell at the foot, above the scree line
  { p: 0.81, pos: [-4, 20, 62], look: [0, 66, 0], fov: 46, sev: 0.88 },
  { p: 0.86, pos: [-2, 15, 68], look: [0, 74, 0], fov: 46, sev: 0.87 },
  // the tip: the ground gives, the crown recedes
  { p: 0.885, pos: [0, 8, 66], look: [0, 150, 0], fov: 50, sev: 0.88 },
  // THE FALL: through the surface
  { p: 0.905, pos: [0, -2, 60], look: [0, 120, 8], fov: 58, sev: 0.9 },
  { p: 0.93, pos: [0, -26, 52], look: [0, 70, 16], fov: 66, sev: 0.9 },
  // the drowned world: the monument hangs above, inverted
  { p: 0.965, pos: [0, -50, 46], look: [0, -60, 0], fov: 56, sev: 0.9 },
  { p: 1.0, pos: [0, -46, 50], look: [0, -104, 0], fov: 50, sev: 0.88 }
];

export interface CameraState {
  severity: number;
}

export class CameraPath {
  readonly state: CameraState = { severity: 0 };

  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  /** the current look target, for orbit-style parallax around it */
  get lookPoint(): THREE.Vector3 {
    return this.look;
  }
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
      // linear between keys: the pursuit filter provides the smoothing,
      // so velocity never dies at a key and the travel cannot lurch
      return { a, b, t: (p - a.p) / (b.p - a.p) };
    }
  }
  return { a: last, b: last, t: 0 };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
