import * as THREE from 'three';

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
  // the fissure of the split spire runs north-south and does not turn
  // with height: d is distance along it, negative on the approach side
  return [0, y, d];
}

/**
 * The score for THE SPLIT SPIRE. The visitor sees it whole and holy,
 * comes around its flank, reads the inscribed face close, then walks
 * into the fissure at the foot where the halves part. Inside the slit
 * the walls are within touching distance and the light is a blade
 * overhead. The passage carries through and out the far side, and the
 * journey ends by giving the distance back.
 */
const KEYS: PathKey[] = [
  // ENTER: the approved opening frame, held
  // THE PROCESSIONAL VIEW, solved against Jacob's reference frame
  // 2026-08-21. That image gives the ground ~45 percent of the frame
  // and reads the hero as a distant tower at ~44 percent of frame
  // height. At (0,14,300) the eye pitched up 15.3 degrees and the
  // ground got TWELVE percent - which is why every trench, section and
  // reflection built into it was invisible.
  //
  // (0,95,620) looking at y=117 pitches up 2 degrees: horizon at 55
  // percent, ground 45 percent, hero spanning 17.9 of the 40 degree
  // field with 12.9 degrees of clearance above the crown. The hero is
  // deliberately SMALLER than it was - that is what the reference does,
  // and it is what lets the domain carry the frame.
  //
  // choir.py computes its alignment plane FROM this pose. Both move
  // together or the six cuts stop coinciding.
  { p: 0.0, pos: [0, 95, 620], look: [0, 117, 0], fov: 40, sev: 0.0 },
  { p: 0.045, pos: [6, 95, 602], look: [0, 116, 0], fov: 40, sev: 0.0 },
  // travel: around the flank, so the wedge reads as depth not as a card
  { p: 0.115, pos: [86, 26, 150], look: [0, 78, 0], fov: 43, sev: 0.03 },
  // SYSTEM: dwell low, the halves towering
  { p: 0.15, pos: [64, 20, 92], look: [0, 62, 0], fov: 46, sev: 0.06 },
  { p: 0.185, pos: [58, 22, 86], look: [0, 66, 0], fov: 46, sev: 0.08 },
  // DESK42: dwell wide, the spire entire on its shore
  { p: 0.255, pos: [96, 30, 240], look: [-4, 96, 0], fov: 44, sev: 0.12 },
  { p: 0.325, pos: [88, 32, 232], look: [-4, 98, 0], fov: 44, sev: 0.16 },
  // RULE: close on the inscribed face, courses sweeping past
  { p: 0.395, pos: [46, 96, 40], look: [8, 108, 2], fov: 50, sev: 0.42 },
  { p: 0.462, pos: [40, 116, 34], look: [6, 126, 2], fov: 50, sev: 0.55 },
  // travel: down to the mouth of the fissure, where the halves part
  { p: 0.5, pos: cleftKey(52, 92), look: cleftKey(44, 10), fov: 52, sev: 0.66 },
  // BRAWLER: inside the slit, walls close, the light a blade overhead
  { p: 0.53, pos: cleftKey(26, 26), look: cleftKey(40, -6), fov: 54, sev: 0.72 },
  { p: 0.6, pos: cleftKey(22, 8), look: cleftKey(58, -18), fov: 54, sev: 0.78 },
  // travel: through the passage and out behind
  { p: 0.64, pos: cleftKey(20, -14), look: cleftKey(34, -46), fov: 52, sev: 0.82 },
  // TECHNOLOGY: emerged behind, the stripped face above
  { p: 0.67, pos: cleftKey(34, -62), look: [0, 88, 0], fov: 47, sev: 0.87 },
  { p: 0.74, pos: [-30, 40, -110], look: [0, 82, 0], fov: 47, sev: 0.9 },
  // STUDIO: dwell at the foot, above the scree line
  { p: 0.81, pos: [-58, 20, 62], look: [0, 68, 0], fov: 46, sev: 0.88 },
  { p: 0.86, pos: [-40, 16, 84], look: [0, 74, 0], fov: 46, sev: 0.87 },
  // THE RETURN: distance given back, the opening frame again, known now
  { p: 0.9, pos: [-14, 18, 128], look: [2, 82, 0], fov: 42, sev: 0.9 },
  { p: 0.95, pos: [-8, 15, 190], look: [2, 90, 0], fov: 40, sev: 0.88 },
  { p: 1.0, pos: [-4, 14, 240], look: [2, 94, 0], fov: 40, sev: 0.86 }
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
