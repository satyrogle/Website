/**
 * guide.mjs — author grayscale composition/depth guides with no dependencies.
 *
 * Art-direction tooling. These are thumbnail sketches in depth form, used to
 * IMPOSE a composition on image generation. Words set the grade; the guide sets
 * the massing. See `.claude/skills/dark-lattice-web/references/toolchain.md`
 * for the probe that proved this is necessary.
 *
 * Not a renderer, not a shader, not a simulation, and nothing it makes is a
 * production asset.
 *
 * Depth convention: 1.0 nearest, 0.0 furthest.
 */

import zlib from 'node:zlib';

/* ---------- canvas ---------- */

export function canvas(w, h, fill = 0) {
  return { w, h, px: new Float32Array(w * h).fill(fill) };
}

/** Even-odd fill of an arbitrary polygon. `value` may be a fn(u,v)->depth. */
export function fillPoly(c, pts, value) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(c.w - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(c.h - 1, Math.ceil(Math.max(...ys)));
  const spanX = Math.max(1, x1 - x0);
  const spanY = Math.max(1, y1 - y0);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) continue;
      const v = typeof value === 'function'
        ? value((x - x0) / spanX, (y - y0) / spanY)
        : value;
      const i = y * c.w + x;
      // Nearer wins, so masses occlude correctly without ordering care.
      if (v > c.px[i]) c.px[i] = v;
    }
  }
  return c;
}

/** Axis-aligned box, optionally skewed by `skew` px at the top edge. */
export function box(c, x, y, w, h, value, skew = 0) {
  return fillPoly(c, [
    [x + skew, y], [x + w + skew, y], [x + w, y + h], [x, y + h],
  ], value);
}

/** Separable box blur, repeated for a gaussian-ish falloff. */
export function blur(c, radius, passes = 3) {
  const { w, h } = c;
  let src = c.px;
  let dst = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= w) continue;
          s += src[y * w + xx]; n++;
        }
        dst[y * w + x] = s / n;
      }
    }
    [src, dst] = [dst, src];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= h) continue;
          s += src[yy * w + x]; n++;
        }
        dst[y * w + x] = s / n;
      }
    }
    [src, dst] = [dst, src];
  }
  c.px = src;
  return c;
}

/* ---------- PNG (8-bit grayscale) ---------- */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function toPNG(c) {
  const { w, h, px } = c;
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(1, px[y * w + x]));
      raw[y * (w + 1) + 1 + x] = Math.round(v * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 0;  // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ================================================================== *
 * LIT GREY BOX
 *
 * A depth map is not an image, and six probes proved a diffusion model
 * cannot invent a composition it has no category for. So the composition
 * is rendered as a real lit image here, and diffusion is later allowed
 * only to dress it at low denoise.
 *
 * The one rule that matters: contact brightness is DERIVED from the mass
 * standing above it, never authored. Light is the visible cost of holding
 * the structure together, computed rather than painted.
 * ================================================================== */

/** Deterministic, seed-free low-frequency modulation. No Math.random anywhere. */
const wobble = (x, a = 0.013, b = 0.0041) =>
  0.5 + 0.5 * Math.sin(x * a + 1.7) * Math.sin(x * b + 0.3);

const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * masses: [{ poly:[[x,y],...], z:0..1 }]  z = 1 nearest.
 * Returns a canvas of luminance 0..1.
 */
export function renderLit(masses, w, h, opts = {}) {
  const {
    albedo = 0.055,        // graphite is very dark, and stays dark
    haze = 0.16,           // aerial perspective: distance lifts toward this
    contactGain = 1.35,    // how hard accumulated load reads as light
    contactSpread = 7,     // px falloff either side of a bearing edge
    voidScatter = 0.012,   // the dark is never empty
  } = opts;

  const depth = new Float32Array(w * h);          // 0 = void
  const id = new Int32Array(w * h).fill(-1);
  const localY = new Float32Array(w * h);         // 0 at a mass top, 1 at its base

  // --- rasterise, nearest wins -------------------------------------
  masses.forEach((m, mi) => {
    const xs = m.poly.map((p) => p[0]);
    const ys = m.poly.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let inside = false;
        for (let i = 0, j = m.poly.length - 1; i < m.poly.length; j = i++) {
          const [xi, yi] = m.poly[i];
          const [xj, yj] = m.poly[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (!inside) continue;
        const k = y * w + x;
        if (m.z > depth[k]) {
          depth[k] = m.z;
          id[k] = mi;
          localY[k] = (y - y0) / Math.max(1, y1 - y0);
        }
      }
    }
  });

  // --- accumulated load: how much material stands above each pixel --
  // This is the whole direction expressed as arithmetic.
  const load = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y < h; y++) {
      const k = y * w + x;
      if (id[k] >= 0) acc += 1;
      load[k] = acc;
    }
  }
  let maxLoad = 0;
  for (let i = 0; i < load.length; i++) if (load[i] > maxLoad) maxLoad = load[i];
  if (maxLoad > 0) for (let i = 0; i < load.length; i++) load[i] /= maxLoad;

  // --- base shading -------------------------------------------------
  const out = canvas(w, h, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const z = depth[k];
      if (id[k] < 0) {
        // Void: near-black, but carrying faint scattered light with depth.
        out.px[k] = voidScatter * (0.35 + 0.65 * (1 - y / h));
        continue;
      }
      // Darker toward a mass's base: contact occlusion, not a gradient effect.
      const ao = 0.45 + 0.55 * (1 - localY[k]);
      // Raking light from one distant source outside the frame, upper right.
      const rake = 0.75 + 0.45 * smoothstep(0.15, 1.0, x / w);
      let v = albedo * ao * rake;
      // Aerial perspective: far masses lift, near masses stay black.
      v = v * z + haze * (1 - z) * (1 - z);
      out.px[k] = v;
    }
  }

  // --- contact light: horizontal bearing edges between two masses ---
  // Detected geometrically. Brightness scales with the load standing above,
  // so the deepest, most-burdened seams are the brightest in the frame.
  const light = new Float32Array(w * h);
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x, up = k - w;
      if (id[k] < 0 || id[up] < 0) continue;
      if (id[k] === id[up]) continue;                 // same mass, no bearing
      const dz = Math.abs(depth[k] - depth[up]);
      if (dz > 0.35) continue;                        // unrelated, just occlusion
      // Discrete contacts, not a continuous drawn line.
      const m = smoothstep(0.42, 0.78, wobble(x));
      if (m <= 0.001) continue;
      const carried = load[k];
      const intensity = contactGain * m * (0.18 + 0.92 * carried);
      for (let d = -contactSpread; d <= contactSpread; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h) continue;
        const f = 1 - Math.abs(d) / (contactSpread + 1);
        const kk = yy * w + x;
        light[kk] = Math.max(light[kk], intensity * f * f);
      }
    }
  }

  for (let i = 0; i < out.px.length; i++) {
    out.px[i] = Math.min(1, out.px[i] + light[i]);
  }
  return out;
}

/** Share of pixels above a luminance, for checking void and highlights. */
export function histogram(c) {
  let above05 = 0, above20 = 0, above80 = 0, below02 = 0;
  for (const v of c.px) {
    if (v > 0.05) above05++;
    if (v > 0.20) above20++;
    if (v > 0.80) above80++;
    if (v < 0.02) below02++;
  }
  const n = c.px.length;
  return {
    above5: (above05 / n) * 100, above20: (above20 / n) * 100,
    above80: (above80 / n) * 100, below2: (below02 / n) * 100,
  };
}

/** Upload a PNG buffer to ComfyUI's input folder. Returns the stored name. */
export async function upload(host, buf, name) {
  const fd = new FormData();
  fd.append('image', new Blob([buf], { type: 'image/png' }), name);
  fd.append('overwrite', 'true');
  const res = await fetch(`${host}/upload/image`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`/upload/image ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

/* ================================================================== *
 * PERSPECTIVE GREY BOX
 *
 * The 2D polygon renderer above cannot move a camera, and neither can
 * img2img — proven twice, once by a chained journey and once by a
 * parallel one, both of which returned the anchor's composition at
 * every frame.
 *
 * So the camera has to be real. This raycasts axis-aligned boxes, which
 * is fewer moving parts than a rasteriser and has no clipping or
 * interpolation to get wrong. One world, many camera positions: that is
 * what makes a journey a journey rather than six related pictures.
 *
 * Distance fog runs toward BRIGHT, not dark. Near mass reads black,
 * far depth reads luminous, and a missed ray is the lit depth itself.
 * That is the aerial perspective the whole direction runs on.
 * ================================================================== */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Slab test against an AABB. Returns nearest positive hit and its axis. */
function hitBox(ro, rd, lo, hi) {
  let t0 = -Infinity, t1 = Infinity, axis = 0;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / (rd[i] || 1e-9);
    let ta = (lo[i] - ro[i]) * inv;
    let tb = (hi[i] - ro[i]) * inv;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) { t0 = ta; axis = i; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  return { t: t0 > 0 ? t0 : t1, axis };
}

/**
 * boxes: [{lo:[x,y,z], hi:[x,y,z]}]
 * cam:   {pos, yaw, pitch, fov}   yaw/pitch in degrees, fov horizontal
 */
export function renderScene(boxes, cam, w, h, opts = {}) {
  const {
    albedo = 0.10,
    ambient = 0.026,
    light = norm([0.35, 0.55, 1.0]),   // from the lit depth, slightly above
    fogDensity = 0.0011,               // near mass must stay black
    fogSurface = 0.68,                 // what distant surfaces wash toward
    depthGlow = 1.0,                   // the lit depth itself
    depthFocus = 5,                    // how tightly the glow hugs that axis
    depthAxis = norm([0.20, 0.04, 1]), // the far end of the volume, off to one side
    voidFloor = 0.010,
  } = opts;

  const yaw = (cam.yaw || 0) * Math.PI / 180;
  const pitch = (cam.pitch || 0) * Math.PI / 180;
  const fwd = norm([
    Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch),
  ]);
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const tanX = Math.tan(((cam.fov || 52) * Math.PI / 180) / 2);
  const tanY = tanX * (h / w);

  const out = canvas(w, h, 0);
  const ro = cam.pos;

  for (let y = 0; y < h; y++) {
    const sy = (1 - 2 * (y + 0.5) / h) * tanY;
    for (let x = 0; x < w; x++) {
      const sx = (2 * (x + 0.5) / w - 1) * tanX;
      const rd = norm([
        fwd[0] + right[0] * sx + up[0] * sy,
        fwd[1] + right[1] * sx + up[1] * sy,
        fwd[2] + right[2] * sx + up[2] * sy,
      ]);

      let best = null;
      for (const b of boxes) {
        const hit = hitBox(ro, rd, b.lo, b.hi);
        if (hit && (!best || hit.t < best.t)) best = hit;
      }

      // The luminous depth is a FIXED PLACE in the world, not wherever the
      // camera happens to point. Measuring it against the camera axis pins the
      // glow to the centre of every frame and makes each shot symmetrical,
      // which is the one-point-perspective failure. Against a world axis, the
      // camera can turn away from the light and the composition goes off-centre.
      const axial = Math.max(0, rd[0] * depthAxis[0] + rd[1] * depthAxis[1] + rd[2] * depthAxis[2]);
      const glow = depthGlow * Math.pow(axial, depthFocus);

      let v;
      if (!best) {
        v = glow;                       // a missed ray is the depth. it never closes.
      } else {
        const n = [0, 0, 0];
        n[best.axis] = rd[best.axis] > 0 ? -1 : 1;
        const lam = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
        const surf = ambient + albedo * lam;
        const f = 1 - Math.exp(-best.t * fogDensity);
        v = surf * (1 - f) + fogSurface * glow * f;
      }
      out.px[y * w + x] = Math.max(voidFloor, Math.min(1, v));
    }
  }
  return out;
}

/* ================================================================== *
 * H1-A PROOF SCENE
 *
 * Load-bearing terraces with the supports that carry them, receding
 * upward and to the left, cropped by the right, top and bottom edges.
 * No roof, no floor, no outer edge, no complete silhouette.
 *
 * Everything sits at x >= 636, so the shared text-safe zone
 * (x 85..541, y 418..729 at guide scale) stays a true void.
 *
 * Deliberately irregular: no two supports share a width, no slab is a
 * clean rectangle, and nothing repeats as a module. A repeated identical
 * unit is what makes a structure read as architecture.
 * ================================================================== */

export const H1A_MASSES = [
  // slab, support, support — near to far. z: 1 = nearest.
  { z: 0.90, poly: [[636, 472], [1280, 462], [1280, 524], [640, 528]] },
  { z: 0.88, poly: [[758, 528], [846, 526], [838, 800], [764, 800]] },
  { z: 0.86, poly: [[1032, 526], [1126, 523], [1132, 800], [1040, 800]] },

  { z: 0.60, poly: [[698, 302], [1280, 293], [1280, 341], [702, 348]] },
  { z: 0.58, poly: [[818, 348], [882, 346], [876, 472], [822, 474]] },
  { z: 0.57, poly: [[1086, 345], [1152, 343], [1157, 466], [1092, 468]] },

  { z: 0.36, poly: [[756, 176], [1280, 169], [1280, 205], [759, 210]] },
  { z: 0.35, poly: [[876, 210], [922, 209], [918, 302], [879, 303]] },
  { z: 0.34, poly: [[1118, 208], [1164, 207], [1168, 296], [1123, 297]] },

  { z: 0.20, poly: [[818, 96], [1280, 91], [1280, 119], [820, 122]] },
  { z: 0.19, poly: [[940, 122], [974, 121], [971, 176], [943, 177]] },

  { z: 0.11, poly: [[906, 34], [1280, 30], [1280, 52], [908, 55]] },
];

const SAFE = { x0: 85, y0: 418, x1: 541, y1: 729 };

/* ================================================================== *
 * H2 — ONE WORLD, SIX CAMERAS
 *
 * Built to match the register Jacob picked three times over: low camera,
 * vast enclosed volume running away from the viewer, broken spans left
 * and right, light arriving from the far depth, no floor and no horizon.
 *
 * The spans are deliberately interrupted along z, because unbroken spans
 * read as architecture and broken ones read as depth.
 * ================================================================== */

const CEILING = [
  { lo: [-420, 44, -80], hi: [420, 140, 180] },
  { lo: [-420, 44, 180], hi: [420, 140, 420] },     // omitted in the return
  { lo: [-420, 44, 420], hi: [420, 140, 660] },
  { lo: [-420, 44, 660], hi: [420, 140, 1100] },
];

const STRUCTURE = [
  // left spans, broken
  { lo: [-280, -8, 20], hi: [-50, 10, 180] },
  { lo: [-300, -6, 240], hi: [-60, 12, 420] },
  { lo: [-320, -4, 500], hi: [-70, 14, 700] },
  // right spans, broken on a different rhythm
  { lo: [55, -10, 0], hi: [340, 12, 150] },
  { lo: [60, -8, 210], hi: [360, 14, 400] },
  { lo: [70, -6, 470], hi: [380, 16, 660] },
  { lo: [80, -4, 720], hi: [400, 18, 940] },
  // lower masses, only reached on the descent
  { lo: [-300, -90, 120], hi: [-60, -64, 330] },
  { lo: [70, -96, 260], hi: [350, -68, 520] },
  { lo: [-280, -150, 400], hi: [380, -120, 760] },
  // the strata at the bottom of the world
  { lo: [-420, -230, 300], hi: [420, -200, 1000] },
  { lo: [-420, -196, 380], hi: [420, -176, 1000] },
  { lo: [-420, -172, 460], hi: [420, -158, 1000] },
];

export const H2_PATH = [
  { key: 'g1-opening', cam: { pos: [0, 6, -40], yaw: 0, pitch: -2, fov: 54 } },
  { key: 'g2-approach', cam: { pos: [-30, 4, 90], yaw: 4, pitch: -3, fov: 52 } },
  { key: 'g3-descent', cam: { pos: [0, -40, 220], yaw: -3, pitch: 6, fov: 56 } },
  { key: 'g4-discrepancy', cam: { pos: [-40, -72, 330], yaw: 6, pitch: 4, fov: 50 } },
  { key: 'g5-lower-truth', cam: { pos: [0, -186, 430], yaw: 0, pitch: 5, fov: 58 } },
  // identical to the opening, with one ceiling segment absent
  { key: 'g6-return', cam: { pos: [0, 6, -40], yaw: 0, pitch: -2, fov: 54 }, omitCeiling: 1 },
];

export const h2Boxes = (omit = -1) =>
  [...CEILING.filter((_, i) => i !== omit), ...STRUCTURE];

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/guide.mjs')) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const path = (await import('node:path')).default;
  const W = 1280, H = 800;

  if (!process.argv.includes('--h1')) {
    // Default: the H2 camera path. One world, six positions.
    const out = path.resolve('captures/hybrids/greybox-h2');
    await mkdir(out, { recursive: true });
    console.log('H2 grey box — one world, six cameras. No diffusion has touched these.\n');
    for (const step of H2_PATH) {
      const t0 = Date.now();
      const img = renderScene(h2Boxes(step.omitCeiling ?? -1), step.cam, W, H);
      const h = histogram(img);
      let maxSafe = 0;
      for (let y = SAFE.y0; y <= SAFE.y1; y++) {
        for (let x = SAFE.x0; x <= SAFE.x1; x++) maxSafe = Math.max(maxSafe, img.px[y * W + x]);
      }
      await writeFile(path.join(out, `${step.key}.png`), toPNG(img));
      console.log(`${step.key.padEnd(16)} void ${h.below2.toFixed(0)}%  lit>5% ${h.above5.toFixed(0)}%`
        + `  >20% ${h.above20.toFixed(0)}%  >80% ${h.above80.toFixed(0)}%`
        + `  safe ${maxSafe.toFixed(2)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    console.log('\ncaptures/hybrids/greybox-h2/ — look before anything is dressed');
    process.exit(0);
  }

  const lit = renderLit(H1A_MASSES, W, H);
  const h = histogram(lit);

  let maxSafe = 0;
  for (let y = SAFE.y0; y <= SAFE.y1; y++) {
    for (let x = SAFE.x0; x <= SAFE.x1; x++) maxSafe = Math.max(maxSafe, lit.px[y * W + x]);
  }

  const out = path.resolve('captures/hybrids/greybox');
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'h1a-greybox.png'), toPNG(lit));

  console.log('H1-A lit grey box, authored — no diffusion has touched this');
  console.log(`  written  captures/hybrids/greybox/h1a-greybox.png  ${W}x${H}`);
  console.log(`  void     ${h.below2.toFixed(1)}% of frame below 2%`);
  console.log(`  lit      ${h.above5.toFixed(1)}% above 5%, ${h.above20.toFixed(1)}% above 20%`);
  console.log(`  peaks    ${h.above80.toFixed(2)}% above 80%`);
  console.log(`  safe     max ${maxSafe.toFixed(3)} inside the text zone${maxSafe > 0.08 ? '  <-- INTRUSION' : ''}`);
  console.log('\nThese numbers diagnose. They do not accept. Jacob decides by looking.');
}
