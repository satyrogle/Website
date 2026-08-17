/**
 * GATE B — DIRECTION 03: THE WITNESS FIELD  (brief section 11)
 *
 * An immaculate official surface. Underneath it, what actually happened.
 *
 * ITERATION 2. The first build failed on the concept, not on the styling: it
 * drew 240 near-parallel streamlines of a uniform left-to-right flow, which is
 * horizontal hair, and it placed the hidden record 0.42 units below a plate too
 * small to cover it, so the blue field spilled across the whole lower frame.
 * Everything was visible at once, which is the exact opposite of the argument.
 *
 * What this build does instead:
 *
 *  1. THE SURFACE STRAIGHTENS. Five permitted routes are the only paths the
 *     official surface admits. Every traced path is pulled onto its nearest
 *     route and then runs along it, so the frame SHOWS the straightening rather
 *     than asserting it. Paths converge and merge; nothing runs parallel.
 *  2. THE HIDDEN RECORD IS THE SAME SEEDS, NOT STRAIGHTENED. The identical
 *     start points are traced through a field with the route attraction
 *     removed. They wander and never converge. Official and actual are the same
 *     events written down differently, which is the whole thesis.
 *  3. IT IS GENUINELY HIDDEN. A solid void plate writes depth between the
 *     camera and the lower field. The actual record is legible in exactly three
 *     ways, all of them geometric: past the plate's near edge at grazing angle,
 *     past its far edge, and through four irregular apertures. Move the camera
 *     and you would see more or less of it. That is occlusion doing the work,
 *     which is what Gate A demanded and what the first build faked.
 */

import * as THREE from 'three';
import {
  PALETTE,
  buildLines,
  makeStage,
  markReady,
  mulberry32,
  trace,
  type Field,
  type Streamline,
} from './core';

const stage = makeStage(document.getElementById('field') as HTMLCanvasElement, 34);
const rng = mulberry32(0x71ad03);

/* ------------------------------------------------------ the permitted routes */

/** The five paths the official surface is willing to record. */
const ROUTES = [
  { a: -1.75, b: 0.40, c: 0.55, d: 1.2 },
  { a: -0.8, b: 0.28, c: 0.82, d: -0.4 },
  { a: 0.2, b: 0.5, c: 0.42, d: 2.1 },
  { a: 1.15, b: 0.24, c: 0.95, d: 0.7 },
  { a: 2.0, b: 0.36, c: 0.62, d: -1.5 },
];
const routeY = (r: typeof ROUTES[0], x: number) => r.a + r.b * Math.sin(r.c * x + r.d);
const routeSlope = (r: typeof ROUTES[0], x: number) => r.b * r.c * Math.cos(r.c * x + r.d);

/** Gentle irregularity, shared by both fields so they start from one reality. */
const OBSTACLES = Array.from({ length: 7 }, () => ({
  x: (rng() - 0.5) * 11,
  y: (rng() - 0.5) * 4.4,
  w: (rng() - 0.4) * 1.9,
  soft: 0.3 + rng() * 0.7,
}));

function wander(p: THREE.Vector3): number {
  let v = 0;
  for (const o of OBSTACLES) {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    v += (o.w * dx) / (dx * dx + dy * dy + o.soft);
  }
  return v;
}

/**
 * The official surface. Travel along x, plus a hard pull onto the nearest
 * permitted route. The pull term is what produces the visible bend, and the
 * field is strongest exactly where a path is being corrected, so the
 * straightening is the brightest thing on the plate.
 */
const officialField: Field = (p, out) => {
  let best = ROUTES[0];
  let bestD = Infinity;
  for (const r of ROUTES) {
    const d = Math.abs(p.y - routeY(r, p.x));
    if (d < bestD) { bestD = d; best = r; }
  }
  const dy = routeY(best, p.x) - p.y;
  // Softer than 2.4. A hard pull snapped every path onto its route within a
  // fraction of the plate, so the straightening happened off-frame and the
  // visible result was five bare curves. The bend IS the argument and it has to
  // occur where it can be seen.
  out.set(1, routeSlope(best, p.x) + dy * 1.4 + wander(p) * 0.25, 0);
};

/** What actually happened. Same reality, no straightening. */
const actualField: Field = (p, out) => {
  out.set(1, wander(p) * 1.35 + 0.06, 0);
};

/* ------------------------------------------------------------ shared seeds */

// Seeded inside the visible span, not off its left edge, and dense enough that
// five converged channels read as lit rather than as five lines.
const SEEDS: THREE.Vector3[] = [];
for (let i = 0; i < 260; i++) {
  SEEDS.push(new THREE.Vector3(-4.1, -3.1 + (i / 260) * 6.2 + (rng() - 0.5) * 0.05, 0));
}

const official: Streamline[] = SEEDS.map((s) =>
  trace(officialField, s.clone().setZ(0.02), 330, 0.034)
);
const actual: Streamline[] = SEEDS.map((s) =>
  trace(actualField, s.clone().setZ(-0.62), 330, 0.034)
);

/**
 * `fullScale` is pinned rather than taken from the 98th percentile.
 *
 * The percentile is dominated by the correction term, which is huge while a
 * path is being pulled onto its route and near zero once it is running along
 * one. Normalising against that made the bends bright and the routes
 * themselves almost invisible, which inverts the argument: the permitted
 * routes are the official record and must be the brightest thing on the plate.
 * Pinning to the on-route magnitude clamps the corrections to full and keeps
 * the channels lit.
 */
stage.scene.add(
  buildLines(official, {
    colour: PALETTE.bone,
    gain: 0.52,
    gamma: 1,
    fullScale: 1.25,
    // A long head fade, which is the argument as much as it is a fix. The
    // un-straightened input arrives faint and the filed route is what the
    // surface renders brightly. It also kills the dense fan at the seed line,
    // which was washing grey across the headline and the Desk42 copy.
    headFade: 0.42,
    tailFade: 0.08,
  })
);

// What actually happened. Below the plate, and mostly not visible from here.
stage.scene.add(
  buildLines(actual, {
    colour: PALETTE.cherenkov,
    gain: 0.72,
    gamma: 1,
    fullScale: 1.25,
    // A long head fade, which is the argument as much as it is a fix. The
    // un-straightened input arrives faint and the filed route is what the
    // surface renders brightly. It also kills the dense fan at the seed line,
    // which was washing grey across the headline and the Desk42 copy.
    headFade: 0.42,
    tailFade: 0.08,
  })
);

/* -------------------------------------------------------------- the plate */

/**
 * The official surface itself: solid void, writing depth. This is the only
 * reason the lower field is a secret. Four irregular apertures, because a
 * circle reads as a porthole and a grid of them reads as perforation.
 */
{
  const shape = new THREE.Shape();
  shape.moveTo(-7, -2.55);
  shape.lineTo(7, -2.55);
  shape.lineTo(7, 2.55);
  shape.lineTo(-7, 2.55);
  shape.closePath();

  // Placed across the span the camera actually sees. The first set put three of
  // four outside the frame, so the plate read as solid and the argument rested
  // on a single visible hole.
  const holes = [
    { x: -2.2, y: 0.7, r: 0.46 },
    { x: -0.2, y: -1.05, r: 0.34 },
    { x: 1.9, y: 0.95, r: 0.56 },
    { x: 3.6, y: -0.5, r: 0.4 },
    { x: 5.1, y: 1.3, r: 0.3 },
  ];
  for (const h of holes) {
    const path = new THREE.Path();
    const n = 11;
    for (let i = 0; i < n; i++) {
      // Wound clockwise so ShapeGeometry treats it as a hole.
      const t = -(i / n) * Math.PI * 2;
      const rr = h.r * (0.66 + rng() * 0.62);
      const px = h.x + Math.cos(t) * rr;
      const py = h.y + Math.sin(t) * rr * 0.8;
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    }
    path.closePath();
    shape.holes.push(path);
  }

  const plate = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.void, depthWrite: true, side: THREE.DoubleSide })
  );
  plate.position.z = -0.16;
  plate.renderOrder = -1;
  stage.scene.add(plate);

  /**
   * The plate's own boundary, as a hairline.
   *
   * Void on void is invisible: without this the surface could only be inferred
   * from what it hid, so the frame read as loose curves in empty space rather
   * than as an authoritative plane. One hairline around the edge and around
   * each aperture is what makes it a SURFACE, and it is the cheapest possible
   * way to say so. The apertures get an edge too, because a hole with a drawn
   * rim reads as an opening in something, while a hole without one reads as a
   * stain.
   */
  const rim: THREE.Vector3[] = [];
  const push = (pts: THREE.Vector2[], z: number) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      rim.push(new THREE.Vector3(a.x, a.y, z), new THREE.Vector3(b.x, b.y, z));
    }
  };
  push(shape.getPoints(1), -0.15);
  for (const h of shape.holes) push(h.getPoints(1), -0.15);

  const rimGeo = new THREE.BufferGeometry().setFromPoints(rim);
  stage.scene.add(
    new THREE.LineSegments(
      rimGeo,
      new THREE.LineBasicMaterial({
        color: PALETTE.bone,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
}

/* ------------------------------------------------ the visitor's intervention */

/**
 * One path the visitor drew, in both records. The filed version lies on the
 * surface in peak white and runs clean along a permitted route. What was
 * actually done sits below in Violation red, and is visible only where the
 * plate is not.
 *
 * Red appears exactly once in this frame and nowhere else, which is the whole
 * of the constitution's rule about spending an event colour.
 */
{
  const line = (pts: THREE.Vector3[], colour: THREE.Color, level: number) => {
    const seg: THREE.Vector3[] = [];
    const cols: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      seg.push(pts[i], pts[i + 1]);
      const e = Math.min(1, Math.min(i, pts.length - 2 - i) / 14) * level;
      cols.push(colour.r * e, colour.g * e, colour.b * e, colour.r * e, colour.g * e, colour.b * e);
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
  };

  const filed: THREE.Vector3[] = [];
  const drawn: THREE.Vector3[] = [];
  const r = ROUTES[2];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const x = -4.2 + t * 8.6;
    filed.push(new THREE.Vector3(x, routeY(r, x), 0.05));
    drawn.push(new THREE.Vector3(x, routeY(r, x) - 0.72 + Math.sin(t * 5.2 + 0.4) * 0.66, -0.66));
  }
  stage.scene.add(line(filed, PALETTE.peak, 1));
  stage.scene.add(line(drawn, PALETTE.violation, 0.95));
}

/* ------------------------------------------------------------------ camera */

/**
 * The plate is tilted away from a camera that stays back, rather than the
 * camera being flown down onto the plate.
 *
 * The previous pass put the camera 2.4 units from the plate's near edge and 7
 * from its far edge. That ratio magnified the near edge until its lines swept
 * across the entire frame as diagonal scratches, and the plate never read as a
 * surface at all. Tilting the scene and holding the camera back keeps the
 * foreshortening in a range where the plane reads as a plane.
 *
 * The roll runs it lower left to upper right, per brief section 11, and the
 * whole scene is pushed right so the wedge of exposed record under the near
 * edge falls clear of the type column instead of across the evidence row.
 */
stage.camera.position.set(0, 0.35, 6.3);
stage.camera.lookAt(0, -0.12, 0);

stage.scene.rotation.x = -0.86;
stage.scene.rotation.z = 0.3;
stage.scene.position.set(1.62, -0.24, 0);

stage.render();
markReady();
