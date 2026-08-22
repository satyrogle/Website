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
  // ENTER: the approved opening frame, held.
  //
  // RESTORED 2026-08-21, and this one does not move again without Jacob
  // asking for it. It stood here for seven commits and it is the frame
  // he means when he says the monument was "soo cool":
  //
  //   "the hero being close made me feel something looking at it it was
  //    soo cool, now its a landscape with so much stuff that is not
  //    necessary like choir is making entity feel small"
  //
  // It was moved out to (0,95,620) to match a processional reference
  // image, which bought the ground 45 percent of the frame and the
  // trenches and sections that had been invisible at twelve. The note
  // written at the time said the hero was "deliberately SMALLER - that
  // is what the reference does". That is exactly the trade that was
  // wrong. A reference names a QUALITY to extract, never a composition
  // to copy, and the quality wanted from that picture was a ruled
  // domain, not a demoted subject. Standing 320 units further back to
  // reveal ground detail cost the one thing the frame had.
  //
  // The eye pitches up 15.3 degrees from a low stand: the monument
  // towers, the ground keeps about twelve percent, and the choir falls
  // far enough back to stop competing for scale.
  //
  // GATE 6 OF THE REFERENCE PICTURE, 2026-08-22, on Jacob's approval -
  // which satisfies the "does not move again without Jacob asking"
  // condition above. Lower still, nearer, wider: eye down 14 to 10,
  // stand in from 300 to 262, lens 40 to 45. Closer buys back exactly
  // what the wider lens costs, so the monument KEEPS its size in frame
  // - the 2026-08-21 restore note stands, the subject is not demoted -
  // while the pitch steepens and the verticals converge harder. Looming
  // is awe; mid-height is a product shot.
  //
  // The choir note that used to sit here ("choir.py computes its
  // alignment plane FROM this pose") described a constraint that was
  // ALREADY broken: choir.py's CAM_W is (0, 95, 620), the abandoned
  // processional pose, so the shipped cuts have not coincided from the
  // runtime opening since the restore. Moving this key breaks nothing
  // that was whole. choir.py's constants now carry the new pose for
  // whenever the masses are next exported.
  { p: 0.0, pos: [0, 10, 262], look: [0, 86, 0], fov: 45, sev: 0.0 },
  { p: 0.045, pos: [3, 10, 252], look: [0, 85, 0], fov: 45, sev: 0.0 },
  // travel: around the flank, so the wedge reads as depth not as a card
  { p: 0.115, pos: [86, 26, 150], look: [0, 78, 0], fov: 43, sev: 0.03 },
  // SYSTEM: dwell low, the halves towering. Look DROPPED 62 to 40,
  // 2026-08-22: the base gates built an entrance - plinth, stair,
  // pylons - and no stop in the whole journey ever looked at it; both
  // close dwells pitched up past the foot. From here the entrance now
  // holds the lower frame while the halves still run out the top of it.
  // Jacob: "i cant actually see the progress of the base clearly".
  { p: 0.15, pos: [64, 20, 92], look: [0, 40, 0], fov: 46, sev: 0.06 },
  { p: 0.185, pos: [58, 22, 86], look: [0, 44, 0], fov: 46, sev: 0.08 },
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
  // THE RETURN: distance given back, the opening frame again, known now.
  // Gate 6 moved the opening; the return moves with it, or the "same
  // frame understood differently" contract breaks into two frames.
  { p: 0.9, pos: [-14, 14, 128], look: [2, 78, 0], fov: 44, sev: 0.9 },
  { p: 0.95, pos: [-8, 11, 190], look: [2, 82, 0], fov: 45, sev: 0.88 },
  { p: 1.0, pos: [-4, 10, 224], look: [2, 84, 0], fov: 45, sev: 0.86 }
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

  // markPoint is gone, 2026-08-22. A fixed 14-unit reach ahead of the
  // camera was right inside the cleft and wrong everywhere else: at the
  // opening it seated every press at the monument's foot. The press ray
  // lives in JourneyRenderer.pressPoint now, on the same raycast the
  // hover uses, so attention and marking share one geometry.
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
