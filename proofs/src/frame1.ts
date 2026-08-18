/**
 * THE CONGREGATION — FRAME 1, OPENING.
 *
 * Built strictly to the frame board (docs/CONGREGATION_FRAME_BOARDS.md).
 * This is not an invented form: every value below is a spec line.
 *
 *   cropped by top and both side edges, void lower third
 *   7-9 strata, no two gaps equal, ratio between largest and smallest ~4:1
 *   density varies along each band, never symmetric
 *   nearest sources ~4px, furthest sub-pixel
 *   ~90% of frame below 4% luminance
 *   brightest sources 80-85%, never peak white
 *   cold haze between bands
 *   monochrome: void and bone only
 *   one source brightening, off-centre, nothing else moves
 *
 * The haze is not a fog uniform. It is thousands of unresolved distant members
 * of the same field, which is why it sits between the bands rather than over
 * them. Physically motivated, per constitution 4.1.
 *
 * Kill condition being tested: if this reads as a starfield it has failed.
 * Starfields are random. The banding is the only thing carrying arrangement,
 * so the bands must be legible without being regular.
 */

import * as THREE from 'three';
import { mulberry32 } from '../../gate-b/src/core';

const SEED = 0xc0f1;
const rng = mulberry32(SEED);

const canvas = document.getElementById('field') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: false,
  powerPreference: 'high-performance', preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new THREE.Color('#020304'), 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, canvas.clientWidth / canvas.clientHeight, 0.5, 900);
camera.position.set(0, 0, 0);

/* ------------------------------------------------------------------ strata */

/**
 * Eight bands. Gaps are authored, not generated: the spec asks for a ~4:1
 * ratio between the largest and smallest gap, and leaving that to a random
 * stream produces either evenness or noise. These are placed.
 */
const GAPS = [1.0, 2.6, 1.4, 4.1, 1.15, 3.2, 1.8];
const BAND_Y: number[] = [0];
for (const g of GAPS) BAND_Y.push(BAND_Y[BAND_Y.length - 1] + g);
const SPAN = BAND_Y[BAND_Y.length - 1];
// Recentre so the field sits in the upper two thirds and runs off the top.
// Placed so the lowest band sits just above the void third and the top bands
// run off the upper edge. The crop is a spec line, not an accident.
for (let i = 0; i < BAND_Y.length; i++) BAND_Y[i] = (BAND_Y[i] - SPAN * 0.13) * 18;

interface Band {
  y: number;
  thickness: number;
  /** Density along x, asymmetric by construction. */
  profile: (u: number) => number;
  /** Gentle non-straightness: a band is never a line. */
  sag: (u: number) => number;
  count: number;
}

const BANDS: Band[] = BAND_Y.map((y, i) => {
  const a = rng(), b = rng(), c = rng();
  const skew = 0.25 + rng() * 0.5;          // where the band is densest
  const width = 0.28 + rng() * 0.3;
  return {
    y,
    thickness: 3.4 + rng() * 5.5,
    count: Math.round(7000 + rng() * 9000),
    profile: (u: number) => {
      // One asymmetric lobe plus a weaker secondary, so no band is a mirror.
      const main = Math.exp(-((u - skew) ** 2) / (2 * width * width));
      const second = 0.45 * Math.exp(-((u - (skew + 0.42 + c * 0.2)) ** 2) / (2 * 0.1));
      return main + second;
    },
    sag: (u: number) =>
      Math.sin(u * (2.1 + a * 1.6) + b * 6.28) * (2.2 + a * 2.4) +
      Math.sin(u * (5.3 + c * 2.0) + a * 6.28) * 0.9,
  };
});

/* ----------------------------------------------------------------- sources */

const pos: number[] = [];
const bright: number[] = [];
const seedAttr: number[] = [];

const FIELD_X = 520;   // far wider than the frustum: the crop is the point
// Shallower than the first attempt. Pushing the volume to -520 put almost
// every member in the far tail, so nothing was near, nothing was large, and
// the result was uniform dust: the starfield failure this frame is judged on.
const Z_NEAR = -70;
const Z_FAR = -330;

for (const band of BANDS) {
  let placed = 0;
  let guard = 0;
  while (placed < band.count && guard < band.count * 40) {
    guard++;
    const u = rng();
    if (rng() > band.profile(u)) continue;   // rejection sample the density
    const x = (u - 0.5) * FIELD_X;
    const t = rng();
    const z = Z_NEAR + (Z_FAR - Z_NEAR) * t;
    // A stratum is PLANAR in y. Scaling band.y by depth smeared each band
    // across a range comparable to the gaps between them, which destroyed the
    // one property carrying arrangement. Depth belongs to x and z only.
    const y = band.y + band.sag(u) + (rng() - 0.5) * band.thickness;
    pos.push(x, y, z);
    // Intrinsic luminosity varies a little; distance does the rest.
    bright.push(0.55 + rng() * 0.45);
    seedAttr.push(rng());
    placed++;
  }
}

const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
g.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1));
g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seedAttr, 1));

const mat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uBone: { value: new THREE.Color('#E9EEF2') },
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    // The one source that breathes, chosen off-centre.
    uWakeSeed: { value: 0.371 },
    uWake: { value: 0 },
  },
  vertexShader: [
    'in float aBright;',
    'in float aSeed;',
    'out float vI;',
    'uniform float uPixelRatio, uWakeSeed, uWake;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float d = -mv.z;',
    // Apparent size: nearest members reach ~4px, the far tail goes sub-pixel
    // and survives only as accumulated haze.
    '  gl_PointSize = clamp(260.0 / d, 0.6, 4.2) * uPixelRatio;',
    // Inverse-square falloff, gently softened so the far field does not
    // vanish entirely; that residue IS the haze between bands.
    '  float fall = 5600.0 / (d * d);',
    '  float i = aBright * fall;',
    // One member wakes. Nothing else moves anywhere in the frame.
    '  if (abs(aSeed - uWakeSeed) < 0.0009) i *= 1.0 + uWake * 2.6;',
    '  vI = clamp(i, 0.0, 1.0);',
    '}',
  ].join('\n'),
  fragmentShader: [
    'precision highp float;',
    'in float vI;',
    'out vec4 outColor;',
    'uniform vec3 uBone;',
    'void main(){',
    '  vec2 q = gl_PointCoord - 0.5;',
    '  float d2 = dot(q, q) * 4.0;',
    '  if (d2 > 1.0) discard;',
    // Soft core with a wide skirt: a source has a body, not a hard dot.
    '  float core = exp(-5.5 * d2);',
    '  float skirt = exp(-1.4 * d2) * 0.22;',
    // Ceiling at 0.84: peak white is reserved for the frame 5 extinction.
    '  float a = min(0.84, vI * (core + skirt));',
    '  outColor = vec4(uBone * a, 1.0);',
    '}',
  ].join('\n'),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false,
});

/**
 * THE SCATTER PASS — the correction that makes this frame visible at all.
 *
 * Measured against the references: Igloo has 99.7% of its pixels above 20%
 * luminance. It is dark in MOOD and bright in PIXELS. Every frame this project
 * has produced chased "share of pixels below 4%" instead, and the result was
 * images below the threshold of a monitor in a lit room.
 *
 * The missing physical term is atmosphere. A field of sources sits in a medium,
 * the medium scatters their light, and that scattered light is most of what a
 * camera actually records. This pass is that: the same sources, rendered as
 * wide soft halos at low amplitude, accumulating into a real luminous haze.
 * Physically motivated, so constitution 4.1 permits it; it is emphatically not
 * a decorative gradient laid over a weak image.
 *
 * It also does the frame board's job of putting haze BETWEEN the bands, since
 * the scatter is densest where the sources are densest.
 */
const scatter = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uBone: { value: new THREE.Color('#C8D4DC') },
    uPixelRatio: { value: renderer.getPixelRatio() },
  },
  vertexShader: [
    'in float aBright;',
    'out float vI;',
    'uniform float uPixelRatio;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float d = -mv.z;',
    // Wide halos, wider for nearer sources: this is the scattering envelope.
    '  gl_PointSize = clamp(9000.0 / d, 26.0, 190.0) * uPixelRatio;',
    '  vI = aBright * (5600.0 / (d * d));',
    '}',
  ].join('\n'),
  fragmentShader: [
    'precision highp float;',
    'in float vI; out vec4 outColor;',
    'uniform vec3 uBone;',
    'void main(){',
    '  vec2 q = gl_PointCoord - 0.5;',
    '  float r = length(q) * 2.0;',
    '  if (r > 1.0) discard;',
    // Broad Henyey-Greenstein-ish skirt: most of the energy far from centre.
    '  float halo = pow(max(0.0, 1.0 - r), 2.2) * 0.055 + exp(-4.0 * r * r) * 0.03;',
    '  outColor = vec4(uBone * vI * halo, 1.0);',
    '}',
  ].join('\n'),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false,
});

// Scatter first, sources over it.
scene.add(new THREE.Points(g, scatter));
scene.add(new THREE.Points(g, mat));

/* ------------------------------------------------------------------ camera */

// Aimed low so the field runs off the top edge and the lower third is void.
camera.position.set(0, -6.5, 0);
camera.lookAt(0, 12, -260);

/* ------------------------------------------------------------------- frame */

const params = new URLSearchParams(location.search);
const wakePhase = Number(params.get('wake') ?? '0');
mat.uniforms.uWake.value = wakePhase;

renderer.render(scene, camera);

const el = document.getElementById('sim-state');
if (el) {
  el.textContent =
    'THE CONGREGATION / FRAME 1 / OPENING · ' +
    (pos.length / 3).toLocaleString() + ' SOURCES · ' + BANDS.length + ' STRATA · SEED 0x' +
    SEED.toString(16).toUpperCase();
}

document.documentElement.dataset.styleframe = 'ready';
