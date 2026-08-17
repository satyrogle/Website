/**
 * GATE B — DIRECTION B: THE WITNESS FIELD, rebuilt mechanism
 *
 * Jacob's test, literally:
 *
 *   State A   almost perfectly black. ONE immaculate thin surface. A path is
 *             drawn.
 *   State B   the system straightens it. Beautiful, ordered, perfect.
 *   State C   the camera moves only slightly. Behind that perfect record is the
 *             original displaced path.
 *
 *   "Not thousands of lines. Perhaps two realities. That is enough."
 *
 * So this frame contains exactly two trajectories and one surface. Everything
 * that made the previous build a wall of scan lines is gone: no field of 260
 * streamlines, no contour stack, no accumulated hair. The previous version
 * started at chaos, which left the concept nowhere to travel — the surface has
 * to READ as immaculate before the discovery underneath can mean anything.
 *
 * The three states are compressed into one still because a styleframe cannot
 * animate: the drawn path, the filed path that replaced it, and the angle that
 * exposes the difference are all present at once. The camera sits just below
 * the plane of the record, which is the whole mechanism — a frontal camera
 * would show one clean line and prove nothing.
 */

import * as THREE from 'three';
import { PALETTE, makeStage, markReady, mulberry32 } from './core';

const stage = makeStage(document.getElementById('field') as HTMLCanvasElement, 30);
const rng = mulberry32(0x4d1188);

/* ------------------------------------------------------------- the surface */

/**
 * The official surface. Near-black, enormous, cropped by the frame at both
 * ends so it reads as a section of something far larger, and carrying only a
 * luminous leading edge.
 *
 * It writes depth. That is its entire job: it is what makes the displaced
 * record a secret rather than a second drawing.
 */
const PLANE_W = 60;
const NEAR_EDGE = 1.5;
const FAR_EDGE = -14;

{
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE_W, NEAR_EDGE - FAR_EDGE),
    new THREE.MeshBasicMaterial({ color: PALETTE.void, depthWrite: true })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, 0, (NEAR_EDGE + FAR_EDGE) / 2);
  plate.renderOrder = -1;
  stage.scene.add(plate);
}

/**
 * One hairline along the near edge.
 *
 * Without it, void on void is not a surface. With it, this line is the exact
 * place where reality stops being visible and only the record continues, which
 * is the single most important edge in the direction.
 */
{
  const y = 0.001;
  const z = NEAR_EDGE;
  const pts: THREE.Vector3[] = [];
  const cols: number[] = [];
  const N = 900;
  for (let i = 0; i < N; i++) {
    const xa = -PLANE_W / 2 + (i / N) * PLANE_W;
    const xb = -PLANE_W / 2 + ((i + 1) / N) * PLANE_W;
    // Brightest directly ahead, falling away toward the crop, so the edge
    // recedes rather than terminating.
    const f = (x: number) => Math.exp(-((x / 9) ** 2)) * 0.85 + 0.06;
    pts.push(new THREE.Vector3(xa, y, z), new THREE.Vector3(xb, y, z));
    const a = f(xa);
    const b = f(xb);
    cols.push(
      PALETTE.bone.r * a, PALETTE.bone.g * a, PALETTE.bone.b * a,
      PALETTE.bone.r * b, PALETTE.bone.g * b, PALETTE.bone.b * b
    );
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  stage.scene.add(
    new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
}

/**
 * The permitted routes, at the threshold of visibility.
 *
 * Five of them, at roughly eight percent brightness. They exist so the surface
 * reads as RULED rather than blank — an official instrument with a system on it
 * — without becoming the field of lines that wrecked the last build. If these
 * ever become legible as a pattern, they have failed and should be removed.
 */
{
  const pts: THREE.Vector3[] = [];
  for (let r = 0; r < 5; r++) {
    // Running down the length of the record, not fanning across it. Fanned
    // lines read as random diagonals; parallel ones read as ruling on an
    // instrument, which is the only thing they are here to say.
    const x0 = -7.5 + r * 3.7 + (rng() - 0.5) * 0.5;
    const drift = (rng() - 0.5) * 0.9;
    const N = 120;
    for (let i = 0; i < N; i++) {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const z0 = NEAR_EDGE - t0 * (NEAR_EDGE - FAR_EDGE);
      const z1 = NEAR_EDGE - t1 * (NEAR_EDGE - FAR_EDGE);
      pts.push(
        new THREE.Vector3(x0 + drift * t0, 0.002, z0),
        new THREE.Vector3(x0 + drift * t1, 0.002, z1)
      );
    }
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  stage.scene.add(
    new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        color: PALETTE.bone,
        transparent: true,
        opacity: 0.085,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
}

/* --------------------------------------------------------- the two realities */

function polyline(pts: THREE.Vector3[], colour: THREE.Color, level: (t: number) => number) {
  const seg: THREE.Vector3[] = [];
  const cols: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    seg.push(pts[i], pts[i + 1]);
    const a = level(i / (pts.length - 1));
    const b = level((i + 1) / (pts.length - 1));
    cols.push(
      colour.r * a, colour.g * a, colour.b * a,
      colour.r * b, colour.g * b, colour.b * b
    );
  }
  const g = new THREE.BufferGeometry().setFromPoints(seg);
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
}

const N = 420;

/**
 * REALITY ONE — the filed record.
 *
 * Perfectly smooth, lying exactly on the surface, running to the vanishing
 * point. This is what the system says happened. It is the brightest thing in
 * the frame because the official version is always the legible one.
 */
// Only a short stretch exists in front of the record's near edge. Any longer
// and that segment sits close to the camera, magnifies, and sweeps off the
// bottom of the frame — which is what wrecked the two previous passes. It needs
// to be just long enough to show both realities before one of them is swallowed.
const START_Z = 3;
const END_Z = -13;

const filed: THREE.Vector3[] = [];
for (let i = 0; i <= N; i++) {
  const t = i / N;
  const z = START_Z - t * (START_Z - END_Z);
  filed.push(new THREE.Vector3(-1.0 + t * 2.1, 0.004, z));
}
stage.scene.add(
  polyline(filed, PALETTE.peak, (t) => (1 - t) ** 0.7 * 0.95 + 0.05)
);

/**
 * REALITY TWO — what was actually drawn.
 *
 * The same journey, wandering, sitting BELOW the surface. From a frontal camera
 * it does not exist. From here, a shallow angle under the plane, it is visible
 * where the surface has run out and as a thin displaced shadow of the official
 * line elsewhere.
 *
 * Violation red, used exactly once in this frame and nowhere else.
 */
const drawn: THREE.Vector3[] = [];
for (let i = 0; i <= N; i++) {
  const t = i / N;
  const z = START_Z - t * (START_Z - END_Z);
  const wander = Math.sin(t * 5.1 + 0.7) * 0.7 + Math.sin(t * 11.3 - 1.2) * 0.22;
  drawn.push(new THREE.Vector3(-1.0 + t * 2.1 + wander, -0.42, z));
}
stage.scene.add(polyline(drawn, PALETTE.violation, (t) => (1 - t) ** 0.9 * 0.9 + 0.04));

/**
 * The divergence itself, drawn as the gap.
 *
 * Short Cherenkov ties between the two records at intervals, so the eye reads
 * them as the SAME event in two versions rather than as two unrelated lines.
 * This is the only place the disagreement is stated rather than implied.
 */
{
  const pts: THREE.Vector3[] = [];
  const cols: number[] = [];
  for (let i = 12; i < N; i += 26) {
    const t = i / N;
    const a = filed[i];
    const b = drawn[i];
    const v = (1 - t) ** 1.2 * 0.8;
    pts.push(a.clone(), b.clone());
    cols.push(
      PALETTE.cherenkov.r * v, PALETTE.cherenkov.g * v, PALETTE.cherenkov.b * v,
      PALETTE.cherenkov.r * v * 0.35, PALETTE.cherenkov.g * v * 0.35, PALETTE.cherenkov.b * v * 0.35
    );
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  stage.scene.add(
    new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
}

/* ------------------------------------------------------------------ camera */

/**
 * Above the plane, looking down the length of the record.
 *
 * The previous pass put the camera BELOW it, which turned the surface into a
 * ceiling: it hid nothing and presented nothing, and the frame had no scale.
 * From here the record recedes to a vanishing point, and the near edge becomes
 * the exact place where reality stops being visible.
 *
 * Both trajectories run from in front of that edge, where the drawn path and
 * the filed path are visible together, to far behind it, where only the filed
 * one survives. That is States A, B and C in a single still: the camera height
 * is the mechanism, not an effect applied to it.
 */
stage.camera.position.set(0.5, 4.5, 17);
stage.camera.lookAt(0.6, 0, -3);
// Rolled, so the record's edge is not a dead horizontal bisecting the page.
stage.camera.rotation.z += 0.15;

stage.scene.position.set(0.35, 0, 0);

stage.render();
markReady();
