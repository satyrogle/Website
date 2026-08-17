/**
 * GATE B — DIRECTION 02: THE BLACK SUN PROTOCOL  (brief section 10)
 *
 * A fixed black disc, a razor-thin corona, precise field lines. Celestial and
 * sacred, not a planet and not a conventional black hole. The disc is an
 * occlusion device: it hides the interior and presents a controlled boundary.
 *
 * The named risk is a generic eclipse. Three things keep it an instrument:
 *
 *  1. THE FIELD IS A TILTED OFFSET DIPOLE. Lines leave one limb and close on
 *     the other, so the corona has a topology instead of radiating evenly. An
 *     evenly radiating ring is every eclipse photograph ever taken.
 *  2. TWO BOUNDARIES, AND THEY DISAGREE. The direction's own concept, drawn
 *     rather than described: the disc reports a clean circular edge while the
 *     field's actual critical contour has already crossed it in two places.
 *     The instrument is reporting stability the system no longer has.
 *  3. THE CORONA IS ANISOTROPIC. Brightness follows field density along the
 *     limb, so one side is nearly dark.
 *
 * The first build of this file failed on all three: poles sitting on the
 * surface with an inverse-cube falloff made the field singular at the limb and
 * dead everywhere else, so 98 percent of the frame was empty, and an unclamped
 * contour radius threw blue curves clear across the page.
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

const stage = makeStage(document.getElementById('field') as HTMLCanvasElement, 30);
const rng = mulberry32(0x2d70b1);

/** Disc radius. Sized so the disc is about half the frame height, not four fifths. */
const R = 0.95;
const OUTER = R * 2.9;

/* --------------------------------------------------------------- the field */

/**
 * Two dipoles of unequal strength, tilted on unshared axes and offset inside
 * the disc. A dipole is the right primitive here because its field lines close:
 * they leave the surface, arc out, and return. That is a corona. A monopole or
 * a point source sprays, which is a halo.
 */
const DIPOLES = [
  { m: new THREE.Vector3(0.28, 1, 0.22).normalize(), c: new THREE.Vector3(0.06, 0.02, 0), q: 1 },
  { m: new THREE.Vector3(-1, 0.34, -0.3).normalize(), c: new THREE.Vector3(-0.2, -0.14, 0.05), q: 0.44 },
];

const d = new THREE.Vector3();

const sunField: Field = (p, out) => {
  out.set(0, 0, 0);
  for (const dp of DIPOLES) {
    d.copy(p).sub(dp.c);
    const r2 = d.lengthSq() + 0.05;
    const r = Math.sqrt(r2);
    const r3 = r2 * r;
    const r5 = r3 * r2;
    const md = dp.m.dot(d);
    out.x += dp.q * ((3 * d.x * md) / r5 - dp.m.x / r3);
    out.y += dp.q * ((3 * d.y * md) / r5 - dp.m.y / r3);
    out.z += dp.q * ((3 * d.z * md) / r5 - dp.m.z / r3);
  }
  // Gentle confinement so the outer arcs close rather than escaping the frame.
  const r = p.length();
  if (r > OUTER * 0.8) out.multiplyScalar(Math.exp(-(r - OUTER * 0.8) * 2.2));
};

/* ------------------------------------------------------------ corona arcs */

const arcs: Streamline[] = [];
const probe = new THREE.Vector3();

for (let i = 0; i < 900; i++) {
  // Seeded on the surface, weighted by local field strength. Even seeding
  // around the limb is exactly what produces a halo.
  const u = rng() * 2 - 1;
  const phi = rng() * Math.PI * 2;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  // Flattened in z so the structure reads as a corona seen near edge-on rather
  // than as a sphere of hair.
  const n = new THREE.Vector3(s * Math.cos(phi), s * Math.sin(phi), u * 0.42).normalize();
  const seat = n.clone().multiplyScalar(R * 1.02);

  sunField(seat, probe);
  // Capped, and weakly weighted. Weighting hard by field strength piles almost
  // every line onto the two poles, and a dense spray leaving one pole reads as
  // a fountain or a shaving brush. The limb should be unevenly populated, not
  // populated in two clumps.
  if (rng() > Math.min(0.72, 0.12 + probe.length() * 0.16)) continue;

  arcs.push(
    trace(sunField, seat, 340, 0.016, (q, step) => step > 6 && (q.length() < R * 1.005 || q.length() > OUTER))
  );
}

stage.scene.add(
  buildLines(arcs, {
    colour: PALETTE.bone,
    gain: 0.95,
    gamma: 1.35,
    headFade: 0.03,
    tailFade: 0.16,
  })
);

/* ------------------------------------------------------------ the two edges */

/** Draws a closed ring from a radius function, with per-vertex colour. */
function ring(
  radiusAt: (a: number) => number,
  colourAt: (a: number) => number,
  colour: THREE.Color,
  segments = 1400
): THREE.LineSegments {
  const pts: THREE.Vector3[] = [];
  const cols: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    pts.push(
      new THREE.Vector3(Math.cos(a) * radiusAt(a), Math.sin(a) * radiusAt(a), 0),
      new THREE.Vector3(Math.cos(b) * radiusAt(b), Math.sin(b) * radiusAt(b), 0)
    );
    const va = Math.max(0, Math.min(1, colourAt(a)));
    const vb = Math.max(0, Math.min(1, colourAt(b)));
    cols.push(
      colour.r * va, colour.g * va, colour.b * va,
      colour.r * vb, colour.g * vb, colour.b * vb
    );
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
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

/** Field strength just off the limb, at angle a. */
function limbStrength(a: number): number {
  sunField(new THREE.Vector3(Math.cos(a) * R * 1.02, Math.sin(a) * R * 1.02, 0), probe);
  return probe.length();
}

// The reported boundary: razor thin, perfectly circular, anisotropic in
// brightness because it is lit by the field it is claiming to bound.
stage.scene.add(ring(() => R, (a) => 0.08 + limbStrength(a) * 0.42, PALETTE.bone));

/**
 * The actual critical contour. It lies exactly on the reported edge for most
 * of its length, then departs where the field has genuinely crossed threshold.
 * Clamped, because an unclamped excess threw curves across the whole frame.
 */
// Set above the limb's median strength on purpose, so the contour coincides
// with the reported edge nearly everywhere and separates from it in only two
// places. At 1.15 the field exceeded it all the way round, which drew a closed
// second circle: two concentric rings, and the single most dangerous read
// available to this direction.
const THRESHOLD = 2.6;
function contourRadius(a: number): number {
  const excess = Math.max(0, limbStrength(a) - THRESHOLD);
  return R * (1 + Math.min(0.13, excess * 0.24));
}

stage.scene.add(
  ring(
    contourRadius,
    (a) => Math.min(1, ((contourRadius(a) - R) / (R * 0.09)) ** 1.3),
    PALETTE.cherenkov
  )
);

/* ----------------------------------------------------------------- the disc */

// Pure void, writing depth, so every arc behind it is genuinely hidden. No
// star field, no accretion disc, no nebula, no dust. Brief section 10.
{
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.997, 256),
    new THREE.MeshBasicMaterial({ color: PALETTE.void, depthWrite: true })
  );
  disc.position.z = 0.001;
  disc.renderOrder = -1;
  stage.scene.add(disc);
}

/* ------------------------------------------------------------------ camera */

// Almost fixed and almost frontal. This direction's argument is a stable
// composition that changes by topology rather than by camera, per brief
// section 10. Tilted just enough that the arcs read three-dimensionally.
stage.camera.position.set(0.2, 0.42, 6.5);
stage.camera.lookAt(0, 0.04, 0);

// Right of the type column, centred slightly above the visual midpoint.
stage.scene.position.set(0.78, 0.42, 0);

stage.render();
markReady();
