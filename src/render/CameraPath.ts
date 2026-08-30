import * as THREE from 'three';
import { DELTA_Y } from './DeltaAct';

/**
 * The journey, 2026-08-28: the approved hero pose is no longer a held
 * encounter, it is the FIRST FRAME of a descent. Scroll carries the
 * camera off the stand, along the worn axis, and INTO the seam itself.
 * There is no tunnel object and no parting animation: the slit that
 * has been in the monument since genesis is five units wide at the
 * base, and the camera simply commits to it. The travel is a straight
 * rail on the monument's axis. No orbit, no swoop.
 *
 * The pose keys are authored, not procedural. K0 is the approved hero
 * frame, bit for bit. K4 holds INSIDE the cleft, a body's length short
 * of the standing blade of light (the fissure plane sits at z = -2.2;
 * the camera never crosses it - what waits past the light is the
 * latent form, and that station is reserved).
 */
const HERO_FOV = 45;

interface PoseKey {
  p: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

const KEYS: PoseKey[] = [
  // STRESS + PATH = FORM, compressed to the wire: hero to THROUGH
  // THE PORTAL by ~31% of the page (Jacob, 2026-08-29, third
  // compression and the charm). The fall owns everything after.
  { p: 0.0, pos: new THREE.Vector3(0, 10, 262), look: new THREE.Vector3(0, 86, 0), fov: HERO_FOV },
  { p: 0.05, pos: new THREE.Vector3(0, 24, 215), look: new THREE.Vector3(0, 80, 0), fov: 45 },
  { p: 0.1, pos: new THREE.Vector3(0, 34, 120), look: new THREE.Vector3(0, 74, 0), fov: 45 },
  { p: 0.19, pos: new THREE.Vector3(0, 38, 96), look: new THREE.Vector3(0, 66, 0), fov: 46 },
  // THE CAMERA WATCHES THE GATE OPEN - Jacob, 2026-08-29: "the gate
  // opening just feels like camera switch rather than actual event".
  // It was closing 120 to 70 across the same stretch the stone was
  // parting, so the two changes were the same size on screen and could
  // not be told apart - the dolly read as the whole event and the
  // stone read as nothing. Through the resolution the eye now nearly
  // holds station, so the ONLY thing changing in the frame is the
  // stone tearing itself open. It still never retreats; it stops
  // closing and then commits.
  { p: 0.27, pos: new THREE.Vector3(0, 40, 92), look: new THREE.Vector3(0, 58, -6), fov: 48 },
  // and THEN it commits, through a door it watched open
  { p: 0.29, pos: new THREE.Vector3(0, 46, 52), look: new THREE.Vector3(0, 54, -30), fov: 50 },
  { p: 0.31, pos: new THREE.Vector3(0, 48, 12), look: new THREE.Vector3(0, 50, -90), fov: 52 },
  // THE DELTA ACT (docs/THE_DELTA.md). The teleport under the veil now
  // lands inside the seam's own thickness: the strata monolith of the
  // delta world, far below the entrance in its own void. Beats mirror
  // Journey.BEATS exactly - the camera and the state read one clock.
  // X: arrive before the colossal stack and push in while it computes.
  // ARRIVAL AT 0.33, NOT 0.34: the crossing veil dies at 0.342, and an
  // arrival key at 0.34 left the last stretch of the dive - thousands
  // of units of open sky - in plain view. Jacob saw the smear at the
  // opening and photographed it, 2026-08-30. The teleport must finish
  // while the veil still owns the frame.
  { p: 0.33, pos: new THREE.Vector3(0, DELTA_Y + 148, 165), look: new THREE.Vector3(0, DELTA_Y + 104, 0), fov: 50 },
  // ...to the blade's height: close, compressed, material
  { p: 0.52, pos: new THREE.Vector3(5, DELTA_Y + 84, 30), look: new THREE.Vector3(0, DELTA_Y + 76, 0), fov: 48 },
  // TICK ZERO: near-hold. The world is still; the blade is offered.
  { p: 0.57, pos: new THREE.Vector3(3.5, DELTA_Y + 80, 24), look: new THREE.Vector3(0, DELTA_Y + 75, -2), fov: 47 },
  // Y: close enough that a socket opening is an EVENT, not a detail -
  // 92 units back read as nothing happening (Jacob's contact sheet)
  { p: 0.78, pos: new THREE.Vector3(-14, DELTA_Y + 96, 62), look: new THREE.Vector3(2, DELTA_Y + 84, -4), fov: 52 },
  // Z: back onto the cleft axis - the visitor's own line since the
  // hero - while the field unfolds AROUND that axis. Embedded, not
  // travelling toward anything: the no-tunnel law as a camera rule.
  // ...one step OFF the axis: standing exactly on the worldline put a
  // 1-unit gold box millimetres from the lens and it rendered as a
  // wall a third of the frame wide (photographed 2026-08-30). From a
  // stride away it reads as what it is - the line through the field.
  { p: 0.9, pos: new THREE.Vector3(7, DELTA_Y + 92, 13), look: new THREE.Vector3(-14, DELTA_Y + 146, -40), fov: 56 },
  { p: 1.0, pos: new THREE.Vector3(6, DELTA_Y + 97, 10), look: new THREE.Vector3(20, DELTA_Y + 56, -46), fov: 58 }
];

export interface CameraState {
  severity: number;
  /** 0 outside, 1 once the walls of the cleft own the frame. */
  inside: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export class CameraPath {
  readonly state: CameraState = { severity: 0, inside: 0 };
  private readonly look = KEYS[0]!.look.clone();
  private progress = 0;

  /** Scroll progress, 0 at the hero frame, 1 held inside the cleft. */
  setProgress(p: number): void {
    this.progress = Math.min(1, Math.max(0, p));
  }

  /** Current look target, retained for the hero's restrained pointer parallax. */
  get lookPoint(): THREE.Vector3 {
    return this.look;
  }

  /** Applied progress, for systems that pace themselves by the fall. */
  get progressValue(): number {
    return this.progress;
  }

  update(camera: THREE.PerspectiveCamera): void {
    const p = this.progress;
    let a = KEYS[0]!;
    let b = KEYS[KEYS.length - 1]!;
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (p >= KEYS[i]!.p && p <= KEYS[i + 1]!.p) {
        a = KEYS[i]!;
        b = KEYS[i + 1]!;
        break;
      }
    }
    const span = b.p - a.p;
    const t = span > 0 ? (p - a.p) / span : 0;

    camera.position.lerpVectors(a.pos, b.pos, t);
    this.look.lerpVectors(a.look, b.look, t);
    camera.lookAt(this.look);

    const fov = a.fov + (b.fov - a.fov) * t;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    this.state.severity = 0;
    this.state.inside = clamp01((p - 0.12) / 0.1);
  }
}
