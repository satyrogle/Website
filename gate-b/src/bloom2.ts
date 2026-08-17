/**
 * GATE B — DIRECTION A: THE CRITICAL BLOOM, rebuilt primitive
 *
 * Jacob's verdict on the first build: the architecture is right, the
 * representation is wrong. Dark occluded centre, organised field, one retained
 * cyan deviation — keep. Three hundred white strands — kill. They read as
 * combed fibres growing on a lump, and a nameable form destroys the mystery.
 *
 * THE CHANGE IS THE PRIMITIVE, NOT THE STYLING.
 *
 * Nothing here draws a field line. The same deterministic field is used to
 * advect several thousand samples, and what gets rendered is the DENSITY those
 * samples accumulate into — then thresholded steeply, so only genuine
 * compression survives. That is a caustic: light concentrated exactly where the
 * flow is being squeezed, which is Jacob's "luminance at actual compression and
 * correction boundaries" stated as arithmetic.
 *
 * Why this cannot become hair: a single path contributes roughly one part in a
 * hundred of the visible threshold. One strand is invisible by construction.
 * Structure only appears where many paths agree, so the frame shows regions,
 * not filaments — broad dead areas, a small number of intense caustic ridges,
 * and occasional branching where density is marginal.
 *
 * The cyan fault stays a coherent trajectory ON PURPOSE. Once everything else
 * has dissolved into diffuse topology, the one thing that still has a definite
 * path is the anomaly. The system erased the rest and did not erase this.
 */

import * as THREE from 'three';
import { PALETTE, makeOccluder, markReady, mulberry32, trace, type Field, type Streamline } from './core';

const canvas = document.getElementById('field') as HTMLCanvasElement;
const rng = mulberry32(0x8f2a41);

/* ------------------------------------------------------------------ renderer */

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(PALETTE.void, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const W = canvas.clientWidth;
const H = canvas.clientHeight;
renderer.setSize(W, H, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 1000);

/**
 * Half-float, because density has to accumulate far past 1.0 before the
 * transfer curve decides what is visible. An 8-bit target clips at the first
 * few overlaps and every region saturates to flat white, which is the flat
 * texture problem again in a different place.
 */
const target = new THREE.WebGLRenderTarget(
  Math.round(W * renderer.getPixelRatio()),
  Math.round(H * renderer.getPixelRatio()),
  { type: THREE.HalfFloatType, depthBuffer: true }
);

/* --------------------------------------------------------------- the field */

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
  const swirl = 0.5 * Math.exp(-(((r - 1.05) / 0.5) ** 2));
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
  // Tighter than 0.62. The looser envelope let the cloud reach every corner of
  // the frame, so the phenomenon sat on top of the type instead of beside it.
  out.multiplyScalar(Math.exp(-r * 1.02));
};

/* ----------------------------------------------------- advected sample cloud */

/**
 * Seeded across a volume rather than on a contour. A contour of seeds produces
 * a contour of samples, and the eye finds it. Volume seeding means the only
 * structure in the result is structure the FIELD put there.
 */
/**
 * Sample count is a smoothness parameter, not a performance knob.
 *
 * At 5,200 paths the estimated density was noisy enough that thresholding cut
 * it into islands, and the frame read as torn flecks. Enough samples that the
 * per-path spacing falls well under the kernel width is what turns a stipple
 * into a continuous field, and it is also what makes an individual trajectory
 * unrecoverable by eye — which is the property that stops this becoming
 * strands again.
 */
const PATHS = 13000;
const positions: number[] = [];
const weights: number[] = [];

for (let i = 0; i < PATHS; i++) {
  const th = rng() * Math.PI * 2;
  const rad = 0.34 + Math.sqrt(rng()) * 1.75;
  const start = new THREE.Vector3(
    Math.cos(th) * rad,
    Math.sin(th) * rad,
    (rng() - 0.5) * 1.15
  );
  const line: Streamline = trace(bloomField, start, 170, 0.021);
  for (let s = 0; s < line.points.length; s++) {
    const p = line.points[s];
    positions.push(p.x, p.y, p.z);
    // Depth falloff, so the far half of the volume disappears into black
    // instead of contributing an even haze. Jacob: depth disappearing into black.
    weights.push(Math.exp(-Math.max(0, -p.z) * 0.9));
  }
}

function cloud(pos: number[], w: number[], channel: THREE.Vector3, size: number, gain: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aw', new THREE.Float32BufferAttribute(w, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uChannel: { value: channel },
      uSize: { value: size * renderer.getPixelRatio() },
      uGain: { value: gain },
    },
    vertexShader: `
      attribute float aw;
      varying float vw;
      uniform float uSize;
      void main() {
        vw = aw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize;
      }
    `,
    /**
     * A soft radial kernel, not a dot.
     *
     * One-pixel splats do not estimate density, they draw a stipple: the
     * samples never overlap enough to form a continuous field, so the eye reads
     * thousands of tiny dashes and "dust" becomes the new nameable primitive.
     * A Gaussian kernel several pixels wide is what makes overlapping samples
     * sum into regions, which is the whole point of rendering density instead
     * of geometry.
     */
    fragmentShader: `
      varying float vw;
      uniform vec3 uChannel;
      uniform float uGain;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d2 = dot(q, q) * 4.0;
        if (d2 > 1.0) discard;
        float k = exp(-3.6 * d2);
        gl_FragColor = vec4(uChannel * vw * uGain * k, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  return new THREE.Points(g, m);
}

// Field density accumulates in RED. The fault accumulates in GREEN. One pass,
// two independent quantities, resolved separately by the transfer curve.
scene.add(cloud(positions, weights, new THREE.Vector3(1, 0, 0), 12.0, 0.0042));

/* ------------------------------------------------------------- the fault */

const faultField: Field = (p, out) => {
  bloomField(p, out);
  const th = Math.atan2(p.y, p.x);
  const win = Math.exp(-(((th - 0.62) / 0.26) ** 2));
  const r = Math.max(Math.hypot(p.x, p.y), 0.24);
  const fade = Math.exp(-r * 0.62);
  out.x += (p.y / r) * 1.5 * win * fade;
  out.y -= (p.x / r) * 1.5 * win * fade;
};

const faultPos: number[] = [];
const faultW: number[] = [];
for (let i = 0; i < 90; i++) {
  const th = 0.62 + (rng() - 0.5) * 0.16;
  const r0 = 0.46 + rng() * 0.07;
  const line = trace(
    faultField,
    new THREE.Vector3(Math.cos(th) * r0, Math.sin(th) * r0, (rng() - 0.5) * 0.06),
    260,
    0.021
  );
  for (const p of line.points) {
    faultPos.push(p.x, p.y, p.z);
    faultW.push(1);
  }
}
scene.add(cloud(faultPos, faultW, new THREE.Vector3(0, 1, 0), 3.4, 0.085));

/* ----------------------------------------------------------------- the core */

scene.add(makeOccluder(0.5, 0x51c3));

/* ------------------------------------------------------------------ camera */

camera.position.set(1.5, -0.7, 6.6);
camera.lookAt(0.1, 0.16, 0);
// Far enough right to clear the type column, near enough that the retained
// fault stays inside the frame. Pushed to 1.24 the fault clipped the right
// edge, and the fault is the one element that says a deviation survived.
scene.position.set(0.94, 0.14, 0);
scene.rotation.z = -0.62;

/* --------------------------------------------------------------- composite */

/**
 * The transfer curve is the design.
 *
 * `smoothstep(T0, T1, d)` with a high T0 is what produces broad areas where
 * nothing is visible: below T0 the answer is exactly zero, not "very dim".
 * Between T0 and T1 the caustic edges resolve. Above T1 the compression cores
 * go to peak white. Lowering T0 does not make the image richer, it re-grows the
 * strands, because a lone path's density sits just under T0 by construction.
 */
const composite = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: target.texture },
      uBone: { value: new THREE.Vector3(PALETTE.bone.r, PALETTE.bone.g, PALETTE.bone.b) },
      uPeak: { value: new THREE.Vector3(PALETTE.peak.r, PALETTE.peak.g, PALETTE.peak.b) },
      uCyan: { value: new THREE.Vector3(PALETTE.cherenkov.r, PALETTE.cherenkov.g, PALETTE.cherenkov.b) },
      // Set from the density measured at 13,000 paths with a 12px kernel:
      //   p50 0.047   p90 0.439   p99 0.675   p99.9 0.878
      // T0 sits at the 90th percentile, so nine tenths of the frame is exactly
      // zero rather than faintly grey. T1 is the 99th, where a caustic edge
      // resolves. The core term reaches peak white near the 99.9th, which is
      // the handful of genuine compression cores.
      uT0: { value: 0.44 },
      uT1: { value: 0.68 },
      uF0: { value: 0.3 },
      uF1: { value: 1.4 },
      uDebug: { value: new URLSearchParams(location.search).has('density') ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform vec3 uBone, uPeak, uCyan;
      uniform float uT0, uT1, uF0, uF1, uDebug;
      void main() {
        vec2 d = texture2D(uTex, vUv).rg;

        // Linear probe. Set uDebug to 1 to view raw accumulated density scaled
        // by 0.25, so the capture harness's own luminance percentiles report
        // the density distribution and the thresholds can be set from measured
        // numbers instead of guessed ones.
        if (uDebug > 0.5) { gl_FragColor = vec4(vec3(d.r * 0.25), 1.0); return; }

        // Field: hard floor, then caustic edge, then compression core.
        float f = smoothstep(uT0, uT1, d.r);
        float core = smoothstep(uT1, uT1 * 1.29, d.r);
        vec3 col = mix(uBone * f, uPeak, core * 0.85);

        // Fault: its own curve, so the anomaly is not competing for the same
        // threshold as the field it is cutting through.
        float g = smoothstep(uF0, uF1, d.g);
        col += uCyan * g * 1.25;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  })
);
const flat = new THREE.Scene();
flat.add(composite);
const flatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

renderer.setRenderTarget(target);
renderer.clear();
renderer.render(scene, camera);
renderer.setRenderTarget(null);
renderer.render(flat, flatCam);

markReady();
