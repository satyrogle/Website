/**
 * REJECTED — v1 box grammar. Retained only as a reproducible record of
 * the geometry the v2 review rejected, and it must not produce the
 * active production asset.
 *
 * The Full Form it builds is six pier assemblies, one lintel, repeated
 * belt courses and a spine made of two jambs, a lintel and a sill around
 * a rectangular aperture. That vocabulary reads as scaffolding and a
 * ruined doorway, and no amount of shader work changes it. See
 * docs/V2_DEFECT_REGISTER.md, defects A-01 to A-09.
 *
 * The active pipeline is tools/blender/build_monolith_v2.py.
 */

/**
 * Builds the canonical production asset:
 *
 *   public/models/DL_Monolith_v01.glb
 *
 * Seven unequal outer masses, one recessed inner spine, the tunnel that
 * is the spine's own interior, the condensed latent core and the halo.
 * Everything is deterministic — the same seed always produces the same
 * building — so the asset is reproducible from source rather than being
 * an opaque binary that arrived from a modelling session.
 *
 *   node tools/build-monolith.mjs [outPath]
 *
 * Node extras carry the runtime contract (role, material class, stage
 * window, reaction weight, projection, open vector). The runtime reads
 * those and nothing else, so restaging a mass is an asset change.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] ?? 'public/models/DL_Monolith_v01.glb');

// ---------------------------------------------------------------------
//  Locked dimensions
// ---------------------------------------------------------------------

/** Overall width of the Full Form. Open translations are a % of this. */
const WIDTH = 2.6;
const GROUND = -3.3;
const APEX = 3.9; // 7.2 tall / 2.6 wide = 2.77
const TUNNEL_NEAR = -1.7;
const TUNNEL_FAR = -15.2;
const LATENT_Z = -18.6;

// ---------------------------------------------------------------------
//  Deterministic noise
// ---------------------------------------------------------------------

function hash3(x, y, z, seed) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.37) * 43758.5453;
  return h - Math.floor(h);
}

function noise3(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const w =
          (i ? ux : 1 - ux) * (j ? uy : 1 - uy) * (k ? uz : 1 - uz);
        v += w * hash3(ix + i, iy + j, iz + k, seed);
      }
    }
  }
  return v;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
//  Geometry
// ---------------------------------------------------------------------

/**
 * One fractured block.
 *
 * Displacement is radial from the block centre rather than along each
 * face normal, so the vertices two faces share along an edge move
 * identically and the block never splits open at its corners.
 */
function block({ x0, x1, y0, y1, z0, z1, seg = 4, amp = 0.026, freq = 2.1, seed = 0 }) {
  const positions = [];
  const indices = [];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;

  const push = (px, py, pz) => {
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    const n = noise3(px * freq, py * freq, pz * freq, seed) - 0.5;
    // Corners fracture harder than face centres; that is what reads as
    // broken stone rather than as a dented box.
    const corner = Math.min(
      1,
      (Math.abs(dx) / Math.max(x1 - x0, 1e-6) +
        Math.abs(dy) / Math.max(y1 - y0, 1e-6) +
        Math.abs(dz) / Math.max(z1 - z0, 1e-6)) * 0.72
    );
    const d = n * amp * (0.45 + corner);
    positions.push(px + (dx / len) * d, py + (dy / len) * d, pz + (dz / len) * d);
    return positions.length / 3 - 1;
  };

  // axis: 0 = x fixed, 1 = y fixed, 2 = z fixed
  const face = (axis, value, uMin, uMax, vMin, vMax, flip) => {
    const base = [];
    for (let v = 0; v <= seg; v++) {
      for (let u = 0; u <= seg; u++) {
        const uu = uMin + ((uMax - uMin) * u) / seg;
        const vv = vMin + ((vMax - vMin) * v) / seg;
        const p =
          axis === 0 ? [value, uu, vv] : axis === 1 ? [uu, value, vv] : [uu, vv, value];
        base.push(push(p[0], p[1], p[2]));
      }
    }
    for (let v = 0; v < seg; v++) {
      for (let u = 0; u < seg; u++) {
        const a = base[v * (seg + 1) + u];
        const b = base[v * (seg + 1) + u + 1];
        const c = base[(v + 1) * (seg + 1) + u + 1];
        const d = base[(v + 1) * (seg + 1) + u];
        if (flip) indices.push(a, c, b, a, d, c);
        else indices.push(a, b, c, a, c, d);
      }
    }
  };

  face(0, x0, y0, y1, z0, z1, true);
  face(0, x1, y0, y1, z0, z1, false);
  face(1, y0, x0, x1, z0, z1, false);
  face(1, y1, x0, x1, z0, z1, true);
  face(2, z0, x0, x1, y0, y1, true);
  face(2, z1, x0, x1, y0, y1, false);

  return { positions, indices };
}

function merge(parts) {
  const positions = [];
  const indices = [];
  for (const part of parts) {
    const offset = positions.length / 3;
    positions.push(...part.positions);
    for (const i of part.indices) indices.push(i + offset);
  }
  return { positions, indices };
}

/** Area-weighted vertex normals. Only the vertex stage consumes these. */
function normalsFor(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const idx of [a, b, c]) {
      normals[idx] += nx;
      normals[idx + 1] += ny;
      normals[idx + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return normals;
}

// ---------------------------------------------------------------------
//  The building
// ---------------------------------------------------------------------

/**
 * A vertical mass: stacked blocks with setbacks and a base buttress.
 * Steps are deliberately uneven so no two masses share a rhythm.
 */
function pier({ x0, x1, top, zFront, depth, seed, steps = 3 }) {
  const rnd = mulberry32(seed);
  const parts = [];
  const height = top - GROUND;
  let y = GROUND;

  // Base buttress — wider and deeper than the shaft it carries.
  const buttress = 0.14 + rnd() * 0.08;
  parts.push(
    block({
      x0: x0 - buttress * 0.5,
      x1: x1 + buttress * 0.4,
      y0: GROUND,
      y1: GROUND + height * (0.14 + rnd() * 0.08),
      z0: zFront - depth - 0.12,
      z1: zFront + 0.1,
      amp: 0.05,
      seed: seed + 1,
    })
  );
  y = GROUND + height * 0.16;

  let w0 = x0;
  let w1 = x1;
  let front = zFront;
  let back = zFront - depth;

  for (let i = 0; i < steps; i++) {
    const remaining = top - y;
    const segment = remaining * (i === steps - 1 ? 1 : 0.34 + rnd() * 0.24);
    const y1 = Math.min(top, y + segment);
    parts.push(
      block({
        x0: w0,
        x1: w1,
        y0: y - 0.03,
        y1,
        z0: back,
        z1: front,
        amp: 0.03 + rnd() * 0.03,
        seed: seed + 11 + i * 7,
      })
    );
    // Setback: the shaft loses a little on one side per step, never
    // symmetrically, so the silhouette steps rather than tapers. Kept
    // small — a mass that sheds 10% a step arrives at the top as a
    // sliver and the building reads as scaffolding.
    const bite = (w1 - w0) * (0.02 + rnd() * 0.045);
    if (rnd() > 0.45) w1 -= bite;
    else w0 += bite;
    front -= (front - back) * (0.03 + rnd() * 0.07);

    // A belt course at each step: wider than the shaft and projecting
    // forward, so the piers read as one banded façade rather than as
    // seven separate poles.
    if (i < steps - 1) {
      parts.push(
        block({
          x0: w0 - 0.035 - rnd() * 0.03,
          x1: w1 + 0.035 + rnd() * 0.03,
          y0: y1 - 0.1 - rnd() * 0.06,
          y1: y1 + 0.06 + rnd() * 0.05,
          z0: back - 0.04,
          z1: front + 0.09 + rnd() * 0.07,
          seg: 3,
          amp: 0.03,
          seed: seed + 300 + i * 3,
        })
      );
    }

    y = y1;
    if (y >= top - 0.02) break;
  }
  return merge(parts);
}

/** A horizontal mass — the bridge over the passage. */
function lintel({ x0, x1, y0, y1, zFront, depth, seed }) {
  const rnd = mulberry32(seed);
  const parts = [];
  const span = x1 - x0;
  let x = x0;
  let i = 0;
  while (x < x1 - 0.02) {
    const w = Math.min(x1 - x, span * (0.16 + rnd() * 0.16));
    const drop = rnd() * (y1 - y0) * 0.22;
    parts.push(
      block({
        x0: x,
        x1: x + w,
        y0: y0 + drop * (rnd() > 0.5 ? 1 : 0),
        y1: y1 - drop * 0.5,
        z0: zFront - depth - rnd() * 0.1,
        z1: zFront - rnd() * 0.12,
        amp: 0.034,
        seed: seed + i * 13,
      })
    );
    x += w;
    i++;
  }
  return merge(parts);
}

/**
 * The inner spine: two jambs, a lintel and a sill bounding the passage,
 * recessed behind the outer masses. One mesh, and the same language the
 * tunnel and the latent core are built from.
 */
function spine() {
  const rnd = mulberry32(4211);
  const parts = [];
  const APERTURE_X0 = -0.34;
  const APERTURE_X1 = 0.3;
  const APERTURE_Y0 = -1.05;
  const APERTURE_Y1 = 1.55;
  const X0 = -0.62;
  const X1 = 0.6;

  const slab = (x0, x1, y0, y1, seed, layers = 3) => {
    let z = -0.05;
    for (let i = 0; i < layers; i++) {
      const d = 0.3 + rnd() * 0.22;
      const inset = i * (0.012 + rnd() * 0.02);
      parts.push(
        block({
          x0: x0 + inset,
          x1: x1 - inset,
          y0: y0 + inset,
          y1: y1 - inset,
          z0: z - d,
          z1: z,
          amp: 0.028,
          seed: seed + i * 5,
        })
      );
      z -= d;
    }
  };

  // Jambs run the full height; the lintel and sill close the aperture.
  slab(X0, APERTURE_X0, GROUND, 3.3, 101, 4);
  slab(APERTURE_X1, X1, GROUND, 3.3, 211, 4);
  slab(APERTURE_X0, APERTURE_X1, APERTURE_Y1, 3.3, 311, 3);
  slab(APERTURE_X0, APERTURE_X1, GROUND, APERTURE_Y0, 411, 3);

  return merge(parts);
}

/** One tunnel rib: two wall piers and the beams that close them. */
function rib(z, index) {
  const rnd = mulberry32(7000 + index * 31);
  const inner = 0.84 + rnd() * 0.12;
  const outer = inner + 0.24 + rnd() * 0.14;
  const height = 1.72 + rnd() * 0.26;
  const depth = 0.2 + rnd() * 0.2;
  const parts = [
    block({
      x0: -outer, x1: -inner, y0: -height, y1: height,
      z0: z - depth, z1: z, amp: 0.035, seed: 900 + index,
    }),
    block({
      x0: inner, x1: outer, y0: -height * (0.92 + rnd() * 0.14), y1: height,
      z0: z - depth, z1: z, amp: 0.035, seed: 940 + index,
    }),
    block({
      x0: -outer, x1: outer, y0: height, y1: height + 0.2 + rnd() * 0.16,
      z0: z - depth * 0.8, z1: z, amp: 0.03, seed: 980 + index,
    }),
    block({
      x0: -outer, x1: outer, y0: -height - 0.24, y1: -height,
      z0: z - depth * 0.8, z1: z, amp: 0.03, seed: 1020 + index,
    }),
  ];
  return merge(parts);
}

/** Fractured wall panels behind the ribs. */
function wall(zFrom, zTo, side, index) {
  const rnd = mulberry32(3300 + index * 17);
  const parts = [];
  const sign = side === 'left' ? -1 : 1;
  let z = zFrom;
  let i = 0;
  while (z > zTo) {
    const len = Math.min(z - zTo, 1.1 + rnd() * 1.5);
    const inner = 1.06 + rnd() * 0.1;
    const outer = inner + 0.24 + rnd() * 0.22;
    const y0 = -1.9 - rnd() * 0.3;
    const y1 = 1.9 + rnd() * 0.3;
    parts.push(
      block({
        x0: sign < 0 ? -outer : inner,
        x1: sign < 0 ? -inner : outer,
        y0, y1,
        z0: z - len, z1: z,
        seg: 3,
        amp: 0.05,
        seed: 5000 + index * 40 + i,
      })
    );
    z -= len;
    i++;
  }
  return merge(parts);
}

function ceilingOrFloor(zFrom, zTo, isCeiling, index) {
  const rnd = mulberry32(6100 + index * 23);
  const parts = [];
  let z = zFrom;
  let i = 0;
  while (z > zTo) {
    const len = Math.min(z - zTo, 1.4 + rnd() * 1.6);
    const base = isCeiling ? 2.02 : -2.02;
    const thick = 0.24 + rnd() * 0.2;
    parts.push(
      block({
        x0: -1.3 - rnd() * 0.1,
        x1: 1.3 + rnd() * 0.1,
        y0: isCeiling ? base : base - thick,
        y1: isCeiling ? base + thick : base,
        z0: z - len, z1: z,
        seg: 3,
        amp: 0.05,
        seed: 8100 + index * 30 + i,
      })
    );
    z -= len;
    i++;
  }
  return merge(parts);
}

/** The halo: a broad disc standing behind the Full Form. */
function halo() {
  const positions = [];
  const indices = [];
  const R = 4.2;
  const RINGS = 5;
  const SEG = 72;
  const z = -6.5;
  positions.push(0, 0.4, z);
  for (let r = 1; r <= RINGS; r++) {
    const radius = (R * r) / RINGS;
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      positions.push(Math.cos(a) * radius, Math.sin(a) * radius + 0.4, z);
    }
  }
  for (let s = 0; s < SEG; s++) {
    indices.push(0, 1 + s, 1 + ((s + 1) % SEG));
  }
  for (let r = 0; r < RINGS - 1; r++) {
    const a0 = 1 + r * SEG;
    const a1 = 1 + (r + 1) * SEG;
    for (let s = 0; s < SEG; s++) {
      const n = (s + 1) % SEG;
      indices.push(a0 + s, a1 + s, a1 + n, a0 + s, a1 + n, a0 + n);
    }
  }
  return { positions, indices };
}

// ---------------------------------------------------------------------
//  Part table
// ---------------------------------------------------------------------

const PARTS = [];

function addPart(name, geometry, extras) {
  PARTS.push({ name, geometry, extras });
}

const OUTER = [
  { x0: -1.3, x1: -0.92, top: 2.05, zFront: 0.55, depth: 0.7, seed: 17,
    t: [-0.085, 0.03, -0.02], r: [0, 0.028, -0.014], reaction: 0.2 },
  { x0: -0.86, x1: -0.54, top: 3.55, zFront: 0.92, depth: 0.85, seed: 43,
    t: [-0.058, -0.022, 0.04], r: [0.012, -0.02, 0.03], reaction: 0.26 },
  { x0: -0.48, x1: -0.24, top: 1.35, zFront: 0.4, depth: 0.62, seed: 71,
    t: [-0.075, 0.014, 0.055], r: [-0.018, 0.034, 0.022], reaction: 0.34 },
  { bridge: true, x0: -0.62, x1: 0.58, y0: 2.42, y1: 3.9, zFront: 0.66, depth: 0.74, seed: 97,
    t: [0.036, 0.068, -0.03], r: [0.024, 0.01, -0.016], reaction: 0.24 },
  { x0: 0.22, x1: 0.46, top: 1.7, zFront: 0.44, depth: 0.6, seed: 131,
    t: [0.082, -0.018, 0.048], r: [0.016, -0.03, -0.026], reaction: 0.34 },
  { x0: 0.52, x1: 0.88, top: 3.05, zFront: 0.86, depth: 0.8, seed: 167,
    t: [0.062, 0.036, -0.028], r: [-0.022, 0.018, 0.032], reaction: 0.26 },
  { x0: 0.94, x1: 1.3, top: 2.45, zFront: 0.58, depth: 0.68, seed: 199,
    t: [0.094, -0.03, 0.022], r: [0.01, 0.026, -0.02], reaction: 0.2 },
];

OUTER.forEach((mass, i) => {
  const name = `DL_FullForm_Outer_0${i + 1}`;
  const geometry = mass.bridge
    ? lintel({ x0: mass.x0, x1: mass.x1, y0: mass.y0, y1: mass.y1, zFront: mass.zFront, depth: mass.depth, seed: mass.seed })
    : pier(mass);
  addPart(name, geometry, {
    dl_role: 'outer_mass',
    dl_material_class: 'MAT_OBSIDIAN',
    dl_visibility_stage: 'full',
    dl_stage_from: 0,
    dl_stage_to: 0.56,
    dl_reaction: mass.reaction,
    dl_projection: 'planar',
    dl_open_translation: mass.t,
    dl_open_rotation: mass.r,
  });
});

addPart('DL_FullForm_Spine', spine(), {
  dl_role: 'inner_spine',
  dl_material_class: 'MAT_SPINE',
  dl_visibility_stage: 'full',
  dl_stage_from: 0,
  dl_stage_to: 0.62,
  dl_reaction: 0.44,
  dl_projection: 'planar',
  dl_open_translation: [0, 0, 0],
  dl_open_rotation: [0, 0, 0],
});

{
  // Irregular rib spacing: a repeating rhythm reads as a machine.
  const rnd = mulberry32(20250809);
  let z = TUNNEL_NEAR;
  let index = 0;
  while (z > TUNNEL_FAR && index < 18) {
    addPart(`DL_Tunnel_Rib_${String(index).padStart(2, '0')}`, rib(z, index), {
      dl_role: 'tunnel_rib',
      dl_material_class: 'MAT_RIB',
      dl_visibility_stage: 'tunnel',
      dl_stage_from: 0.16,
      dl_stage_to: 1,
      dl_reaction: 0.55 + (index % 3) * 0.08,
      dl_projection: 'cylindrical',
      dl_open_translation: [0, 0, 0],
      dl_open_rotation: [0, 0, 0],
    });
    z -= 0.62 + rnd() * 1.15;
    index++;
  }
}

// The walls run past the last rib so the latent chamber is enclosed
// rather than opening into nothing.
const CHAMBER_FAR = TUNNEL_FAR - 0.6;

['left', 'right'].forEach((side, s) => {
  addPart(`DL_Tunnel_Wall_0${s}`, wall(TUNNEL_NEAR, CHAMBER_FAR, side, s), {
    dl_role: 'tunnel_wall',
    dl_material_class: 'MAT_WALL',
    dl_visibility_stage: 'tunnel',
    dl_stage_from: 0.16,
    dl_stage_to: 1,
    dl_reaction: 0.16,
    dl_projection: 'cylindrical',
    dl_open_translation: [0, 0, 0],
    dl_open_rotation: [0, 0, 0],
  });
});

[true, false].forEach((isCeiling, s) => {
  addPart(`DL_Tunnel_Wall_1${s}`, ceilingOrFloor(TUNNEL_NEAR, CHAMBER_FAR, isCeiling, s + 2), {
    dl_role: 'tunnel_wall',
    dl_material_class: 'MAT_WALL',
    dl_visibility_stage: 'tunnel',
    dl_stage_from: 0.16,
    dl_stage_to: 1,
    dl_reaction: 0.14,
    dl_projection: 'cylindrical',
    dl_open_translation: [0, 0, 0],
    dl_open_rotation: [0, 0, 0],
  });
});

{
  // The latent core: the spine's jamb / lintel language, compressed.
  const z0 = LATENT_Z - 0.46;
  const z1 = LATENT_Z + 0.46;
  const cores = [
    { name: 'DL_Latent_Core_01', x0: -0.62, x1: -0.16, y0: -1.3, y1: 0.86, seed: 611 },
    { name: 'DL_Latent_Core_02', x0: 0.12, x1: 0.6, y0: -1.3, y1: 0.64, seed: 733 },
    { name: 'DL_Latent_Core_03', x0: -0.68, x1: 0.66, y0: 0.72, y1: 1.3, seed: 857 },
  ];
  cores.forEach((core, i) => {
    const rnd = mulberry32(core.seed);
    const parts = [];
    // A plinth and a belt, so the core reads as compressed architecture
    // rather than as a plain slab.
    parts.push(
      block({
        x0: core.x0 - 0.07, x1: core.x1 + 0.07,
        y0: core.y0, y1: core.y0 + 0.24 + rnd() * 0.1,
        z0: z0 - 0.08, z1: z1 + 0.08,
        seg: 3, amp: 0.02, seed: core.seed + 71,
      })
    );
    parts.push(
      block({
        x0: core.x0 - 0.05, x1: core.x1 + 0.05,
        y0: core.y0 + (core.y1 - core.y0) * 0.52,
        y1: core.y0 + (core.y1 - core.y0) * 0.62,
        z0: z0 - 0.05, z1: z1 + 0.06,
        seg: 3, amp: 0.02, seed: core.seed + 83,
      })
    );
    let z = z1;
    for (let k = 0; k < 3; k++) {
      const d = (z1 - z0) * (0.28 + rnd() * 0.2);
      const inset = k * 0.016;
      parts.push(
        block({
          x0: core.x0 + inset, x1: core.x1 - inset,
          y0: core.y0 + inset, y1: core.y1 - inset,
          z0: z - d, z1: z,
          amp: 0.022,
          seed: core.seed + k * 9,
        })
      );
      z -= d;
    }
    addPart(core.name, merge(parts), {
      dl_role: 'latent_core',
      dl_material_class: 'MAT_LATENT',
      dl_visibility_stage: 'latent',
      dl_stage_from: 0.6,
      dl_stage_to: 1,
      dl_reaction: 0.8 + i * 0.05,
      dl_projection: 'planar',
      dl_open_translation: [0, 0, 0],
      dl_open_rotation: [0, 0, 0],
    });
  });
}

addPart('DL_Halo', halo(), {
  dl_role: 'halo',
  dl_material_class: 'MAT_HALO',
  dl_visibility_stage: 'full',
  dl_stage_from: 0,
  dl_stage_to: 0.36,
  dl_reaction: 0,
  dl_projection: 'none',
  dl_open_translation: [0, 0, 0],
  dl_open_rotation: [0, 0, 0],
});

// ---------------------------------------------------------------------
//  glTF assembly
// ---------------------------------------------------------------------

const bufferViews = [];
const accessors = [];
const meshes = [];
const nodes = [];
const chunks = [];
let byteOffset = 0;

function writeView(typedArray, target) {
  const bytes = Buffer.from(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength
  );
  const padded = bytes.byteLength % 4 === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(4 - (bytes.byteLength % 4))]);
  chunks.push(padded);
  const view = { buffer: 0, byteOffset, byteLength: bytes.byteLength };
  if (target) view.target = target;
  bufferViews.push(view);
  byteOffset += padded.byteLength;
  return bufferViews.length - 1;
}

let totalTris = 0;

for (const part of PARTS) {
  const { positions, indices } = part.geometry;

  // Centre the mesh on its own bounds and carry the offset on the node,
  // so the runtime's open rotation turns the mass in place.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const origin = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];

  const pos = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    pos[i] = positions[i] - origin[0];
    pos[i + 1] = positions[i + 1] - origin[1];
    pos[i + 2] = positions[i + 2] - origin[2];
  }
  const idx = new Uint32Array(indices);
  const nrm = normalsFor(pos, idx);
  totalTris += idx.length / 3;

  const posView = writeView(pos, 34962);
  const nrmView = writeView(nrm, 34962);
  const idxView = writeView(idx, 34963);

  const posAccessor = accessors.length;
  accessors.push({
    bufferView: posView,
    componentType: 5126,
    count: pos.length / 3,
    type: 'VEC3',
    min: [minX - origin[0], minY - origin[1], minZ - origin[2]],
    max: [maxX - origin[0], maxY - origin[1], maxZ - origin[2]],
  });
  const nrmAccessor = accessors.length;
  accessors.push({
    bufferView: nrmView,
    componentType: 5126,
    count: nrm.length / 3,
    type: 'VEC3',
  });
  const idxAccessor = accessors.length;
  accessors.push({
    bufferView: idxView,
    componentType: 5125,
    count: idx.length,
    type: 'SCALAR',
  });

  meshes.push({
    name: `${part.name}_MESH`,
    primitives: [
      {
        attributes: { POSITION: posAccessor, NORMAL: nrmAccessor },
        indices: idxAccessor,
        material: 0,
        mode: 4,
      },
    ],
  });

  nodes.push({
    name: part.name,
    mesh: meshes.length - 1,
    translation: origin,
    extras: part.extras,
  });
}

const bin = Buffer.concat(chunks);

const gltf = {
  asset: { version: '2.0', generator: 'dark-lattice/tools/build-monolith.mjs' },
  scene: 0,
  scenes: [{ name: 'DL_Monolith', nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.byteLength }],
  materials: [
    {
      name: 'DL_Placeholder',
      pbrMetallicRoughness: {
        baseColorFactor: [0.03, 0.04, 0.06, 1],
        metallicFactor: 0.1,
        roughnessFactor: 0.9,
      },
    },
  ],
  extras: {
    dl_width: WIDTH,
    dl_ground: GROUND,
    dl_apex: APEX,
    dl_tunnel_near: TUNNEL_NEAR,
    dl_tunnel_far: TUNNEL_FAR,
    dl_latent_z: LATENT_Z,
  },
};

function glbChunk(type, payload, padByte) {
  const pad = (4 - (payload.byteLength % 4)) % 4;
  const body = pad ? Buffer.concat([payload, Buffer.alloc(pad, padByte)]) : payload;
  const header = Buffer.alloc(8);
  header.writeUInt32LE(body.byteLength, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, body]);
}

const jsonChunk = glbChunk(0x4e4f534a, Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
const binChunk = glbChunk(0x004e4942, bin, 0);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + jsonChunk.byteLength + binChunk.byteLength, 8);

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, Buffer.concat([header, jsonChunk, binChunk]));

const roleCounts = {};
for (const node of nodes) {
  const role = node.extras.dl_role;
  roleCounts[role] = (roleCounts[role] ?? 0) + 1;
}

console.log(`wrote ${OUT}`);
console.log(`  parts     ${nodes.length}`);
console.log(`  triangles ${totalTris}`);
console.log(`  bytes     ${(12 + jsonChunk.byteLength + binChunk.byteLength).toLocaleString()}`);
console.log(`  roles     ${JSON.stringify(roleCounts)}`);
