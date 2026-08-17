/**
 * GATE B — DIRECTION 01: THE CRITICAL BLOOM  (brief section 9)
 *
 * A luminous radial bloom, part halo, part flower, part precision instrument,
 * with structure receding into a shallow tunnel.
 *
 * The named risk is a portal or a music visualiser. The first build of this
 * file was the music visualiser: 1,500 densely seeded streamlines at even
 * azimuth, each normalised against its own maximum, which lit every fibre
 * equally and produced brushed hair covering three quarters of the frame.
 *
 * What that cost, and what fixes it:
 *
 *  1. NORMALISE THE FIELD, NOT THE LINE. Per-line normalisation is what made
 *     every fibre equally bright. Now one scale serves the whole field, with a
 *     gamma above 1, so weak regions are genuinely black.
 *  2. SHOW LESS AT REST. 420 lines, not 1,500. This is the same cure that
 *     fixed the previous hero: the fault was never the sculpt, it was how much
 *     of the system was on screen at once.
 *  3. SEED BY DENSITY, NOT EVENLY. Sectors of the bloom are nearly empty.
 *     Even azimuthal seeding is what makes a radial form read as a brush.
 *  4. OCCLUDE. A solid void core takes the far half of the field out of sight,
 *     so depth comes from occlusion as Gate A requires, not from recession.
 */

import * as THREE from 'three';
import {
  PALETTE,
  buildLines,
  makeOccluder,
  makeStage,
  markReady,
  mulberry32,
  trace,
  type Field,
  type Streamline,
} from './core';

const stage = makeStage(document.getElementById('field') as HTMLCanvasElement, 30);
const rng = mulberry32(0x8f2a41);

/* --------------------------------------------------------------- the field */

/** Irregular local sources, to break the residual symmetry of the harmonics. */
const ATTRACTORS = Array.from({ length: 7 }, () => {
  const th = rng() * Math.PI * 2;
  const r = 0.8 + rng() * 2.1;
  return {
    x: Math.cos(th) * r,
    y: Math.sin(th) * r,
    z: (rng() - 0.5) * 0.8,
    w: (rng() - 0.4) * 0.26,
    soft: 0.12 + rng() * 0.3,
  };
});

/** Azimuthal shape of the bloom. Coprime harmonics never return to register. */
function lobe(th: number): number {
  return (
    1 +
    0.5 * Math.cos(3 * th + 0.71) +
    0.3 * Math.cos(7 * th - 1.93) +
    0.14 * Math.cos(11 * th + 2.58)
  );
}

const bloomField: Field = (p, out) => {
  const { x, y, z } = p;
  const r = Math.hypot(x, y);
  const rc = Math.max(r, 0.24);
  const th = Math.atan2(y, x);

  const radial = (1.3 / (rc * rc + 0.3)) * lobe(th);

  // Curl, narrower and gentler than the first build. A wide strong curl turns
  // the whole field into one brushed swirl; a narrow one turns each line
  // through a quarter turn and then lets it go, which is what makes the form
  // read as an instrument rather than as a vortex.
  const swirl = 0.5 * Math.exp(-(((r - 1.05) / 0.5) ** 2));

  // Depth. One limb lifts toward the camera and the other falls away, so the
  // form has a near side and a far side. This is the shallow tunnel as a
  // solid, never as a receding corridor.
  const lift = 0.3 * Math.cos(th - 0.55) * Math.exp(-r * 0.3) - z * 0.18;

  out.set((x / rc) * radial - (y / rc) * swirl, (y / rc) * radial + (x / rc) * swirl, lift);

  for (const a of ATTRACTORS) {
    const dx = x - a.x;
    const dy = y - a.y;
    const dz = z - a.z;
    const k = a.w / (dx * dx + dy * dy + dz * dz + a.soft);
    out.x += dx * k;
    out.y += dy * k;
    out.z += dz * k;
  }

  // Global envelope. The field genuinely dies with radius, so the outer bloom
  // is dark because there is nothing there, not because it was dimmed.
  const fade = Math.exp(-r * 0.62);
  out.multiplyScalar(fade);
};

/* ------------------------------------------------------- the resting bloom */

const LINES = 420;
const resting: Streamline[] = [];

for (let i = 0; i < LINES; i++) {
  // Rejection sampling against the lobe function. Dense sectors get many
  // lines, weak sectors get almost none, and the bloom acquires a silhouette
  // instead of a circumference.
  let th = 0;
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = rng() * Math.PI * 2;
    const density = Math.max(0, lobe(candidate)) / 1.94;
    // Cubed, not squared. Squared still left a thin covering of lines in every
    // sector, and a radial form with lines all the way round is a pupil with
    // lashes. Cubed empties the weak sectors completely, which is what turns a
    // circumference into a silhouette.
    if (rng() < density * density * density) {
      th = candidate;
      break;
    }
    th = candidate;
  }

  const r0 = 0.42 + rng() * 0.1;
  const start = new THREE.Vector3(
    Math.cos(th) * r0,
    Math.sin(th) * r0,
    (rng() - 0.5) * 0.3
  );

  // Length by azimuth, so the outer envelope is not a circle.
  const reach = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(3 * th - 0.9));
  const steps = Math.round(70 + 150 * reach);

  resting.push(trace(bloomField, start, steps, 0.022));
}

stage.scene.add(
  buildLines(resting, {
    colour: PALETTE.bone,
    gain: 0.92,
    gamma: 2.3,
    headFade: 0.06,
    tailFade: 0.5,
  })
);

/* --------------------------------------------------------------- the core */

// The aperture. Solid void, so lines behind it are simply not there.
// Irregular, because a perfect circle here is what made the first pass read as
// an eye.
stage.scene.add(makeOccluder(0.5, 0x51c3));

/* ------------------------------------------------------------- the fault */

/**
 * The stored deviation. Brief section 9: on release, one region stays offset
 * and a thin Cherenkov-blue fault persists.
 *
 * Traced through the SAME field with the curl reversed inside a narrow azimuth
 * window, so it runs against the grain of its neighbours rather than being a
 * blue line drawn over them. A system state, not a highlight.
 */
const faultField: Field = (p, out) => {
  bloomField(p, out);
  const th = Math.atan2(p.y, p.x);
  const window = Math.exp(-(((th - 0.62) / 0.26) ** 2));
  const r = Math.max(Math.hypot(p.x, p.y), 0.24);
  const fade = Math.exp(-r * 0.62);
  out.x += (p.y / r) * 1.5 * window * fade;
  out.y -= (p.x / r) * 1.5 * window * fade;
};

const fault: Streamline[] = [];
for (let i = 0; i < 34; i++) {
  const th = 0.62 + (rng() - 0.5) * 0.3;
  const r0 = 0.46 + rng() * 0.12;
  fault.push(
    trace(
      faultField,
      new THREE.Vector3(Math.cos(th) * r0, Math.sin(th) * r0, (rng() - 0.5) * 0.16),
      Math.round(200 + rng() * 70),
      0.022
    )
  );
}

stage.scene.add(
  buildLines(fault, {
    colour: PALETTE.cherenkov,
    gain: 1.15,
    gamma: 1.5,
    headFade: 0.1,
    tailFade: 0.42,
  })
);

/* ------------------------------------------------------------------ camera */

// Off axis. Straight down the middle of a radial form is the portal pose and
// the fastest way to fail this direction's kill test.
stage.camera.position.set(1.5, -0.7, 6.6);
stage.camera.lookAt(0.1, 0.16, 0);

// Right of centre and cropped by the frame edge, so it reads as something the
// page cannot hold rather than as an object placed on a page.
stage.scene.position.set(0.72, 0.1, 0);

// Rolled off the vertical. With the two dense sectors sitting left and right of
// the core the form was bilaterally arranged about a vertical axis, and a dark
// centre inside a bilateral radial mass is an eye. Rolling it destroys the
// bilateral read without touching the field.
stage.scene.rotation.z = -0.62;

stage.render();
markReady();
