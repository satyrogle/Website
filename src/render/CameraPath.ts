import * as THREE from 'three';
import { FORM_H, cleftDir } from '../world/monumentForm';

/**
 * The single authored travel: exterior, approach, the cleft, descent,
 * the foot, the return. One continuous camera journey with content at
 * spatial stops. Scroll drives progress; this class never invents
 * behaviour.
 */

interface PathKey {
  p: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
  sev: number;
}

/**
 * A point in the cleft's open passage at height y: d is the offset
 * along the passage direction, negative on the approach side, positive
 * on the exit side. Computed from the form so the travel turns with
 * the twist.
 */
function cleftKey(y: number, d: number): [number, number, number] {
  const dir = cleftDir(y / FORM_H);
  return [dir[0] * d, y, dir[1] * d];
}

/**
 * The score: dwell where a panel is read, travel between. The approach
 * orbits so the twist reads in three dimensions; the climb hugs the
 * inscribed face; the breach enters the cleft between the prongs,
 * Brawler is read inside it among the ties, the passage corkscrews
 * down with the twist and exits low on the far side; the journey ends
 * at the foot, then the distance is given back: the opening frame
 * again, stripped, understood.
 */
const KEYS: PathKey[] = [
  // ENTER: the approved opening frame, held
  { p: 0.0, pos: [0, 14, 300], look: [0, 96, 0], fov: 40, sev: 0.0 },
  { p: 0.045, pos: [2, 14, 288], look: [0, 95, 0], fov: 40, sev: 0.0 },
  // travel: the orbit in, the twist revealing itself
  { p: 0.115, pos: [30, 22, 120], look: [0, 74, 0], fov: 43, sev: 0.03 },
  // SYSTEM: dwell low at the face
  { p: 0.15, pos: [30, 28, 60], look: [2, 60, 0], fov: 46, sev: 0.06 },
  { p: 0.185, pos: [28, 30, 54], look: [2, 64, 0], fov: 46, sev: 0.08 },
  // DESK42: dwell wide, the monument entire above its sea
  { p: 0.255, pos: [78, 32, 220], look: [-6, 94, 0], fov: 44, sev: 0.12 },
  { p: 0.325, pos: [72, 34, 212], look: [-6, 96, 0], fov: 44, sev: 0.16 },
  // RULE: dwell close on the inscribed flank, courses sweeping past
  { p: 0.395, pos: [18, 100, 34], look: [5, 110, -2], fov: 50, sev: 0.42 },
  { p: 0.462, pos: [12, 118, 30], look: [2, 126, -4], fov: 50, sev: 0.55 },
  // travel: to the mouth of the cleft
  { p: 0.5, pos: cleftKey(138, -30), look: cleftKey(134, -4), fov: 52, sev: 0.66 },
  // BRAWLER: dwell inside, between the prongs, among the ties
  { p: 0.53, pos: cleftKey(130, -7), look: cleftKey(112, -2), fov: 52, sev: 0.72 },
  { p: 0.6, pos: cleftKey(114, -5), look: cleftKey(96, 2), fov: 52, sev: 0.78 },
  // travel: the corkscrew down, turning with the twist
  { p: 0.64, pos: cleftKey(96, 4), look: cleftKey(78, 12), fov: 50, sev: 0.82 },
  // TECHNOLOGY: emerged low on the far side, the stripped face above
  { p: 0.67, pos: cleftKey(66, 22), look: [0, 86, 0], fov: 47, sev: 0.87 },
  { p: 0.74, pos: cleftKey(56, 40), look: [0, 80, 0], fov: 47, sev: 0.9 },
  // STUDIO: dwell at the foot, above the scree line
  { p: 0.81, pos: [-6, 18, 56], look: [0, 66, 0], fov: 46, sev: 0.88 },
  { p: 0.86, pos: [-2, 15, 64], look: [0, 72, 0], fov: 46, sev: 0.87 },
  // THE RETURN: distance given back, the opening frame again, known
  // now. Framed a little right of centre so the closing words and the
  // revealed lattice share the screen
  { p: 0.9, pos: [0, 18, 110], look: [2, 80, 0], fov: 42, sev: 0.9 },
  { p: 0.95, pos: [-4, 15, 165], look: [3, 90, 0], fov: 40, sev: 0.88 },
  { p: 1.0, pos: [-8, 15, 205], look: [4, 92, 0], fov: 40, sev: 0.86 }
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
