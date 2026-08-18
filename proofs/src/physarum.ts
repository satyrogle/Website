/**
 * PROOF 1A — PHYSARUM. Hidden rule: OPTIMISATION THROUGH ABANDONMENT.
 *
 * One persistent seeded world observed at two scales from the SAME state, per
 * the standardised medium kill test in CLAUDE.md. No company copy, no mobile,
 * no Blender, no winner.
 *
 * The system: agents route between seeded mass nodes in a 3D volume, sensing
 * deposited trail ahead of themselves and reinforcing what works. Efficient
 * routes strengthen; everything else decays. The far view renders DENSITY
 * TOPOLOGY only, per the macro-conceals rule; individual agents exist on
 * screen only in the micro view.
 *
 * The visitor action: at a recorded tick, one new resource appears at a seeded
 * position. Agents that reach it are marked, and their subsequent deposits
 * write to an event channel rendered in the single permitted event colour.
 * The new route they build is the retained consequence.
 *
 * Determinism language, per CLAUDE.md: seeded, fixed-step, replayable in this
 * environment. No bitwise cross-hardware claim.
 */

import * as THREE from 'three';
import { PALETTE, markReady, mulberry32 } from '../../gate-b/src/core';

/* ------------------------------------------------------------------ config */

const N = 112;               // trail volume resolution
const AGENTS = 110000;
const STEPS = 300;
const EVENT_TICK = 185;
const SEED = 0xf17a;

const SPEED = 0.55;          // voxels per step
const SENSE_DIST = 3.4;      // voxels ahead
const SENSE_ANGLE = 0.55;    // radians off axis
const TURN = 0.34;
const DEPOSIT = 13;
const NODE_DEPOSIT = 46;
const DECAY = 0.93;          // applied every 2nd step: weak routes starve fast

const rng = mulberry32(SEED);
const vi = (x: number, y: number, z: number) =>
  Math.min(N - 1, Math.max(0, x | 0)) +
  N * (Math.min(N - 1, Math.max(0, y | 0)) + N * Math.min(N - 1, Math.max(0, z | 0)));

/* ------------------------------------------------------------------- nodes */

// Seeded mass nodes: the sparse data the network exists to connect. Placed in
// a flattened slab so the far view reads as a web with voids, not a ball.
// Full-volume seeding. The first pass confined nodes to a slab and the
// network filled a visible box: flat faces and wall-streaks read as "web in a
// crate". Fewer nodes across the whole volume gives longer filaments and
// larger voids, which is the hierarchy a cosmic-web read needs.
const NODES: number[][] = [];
for (let k = 0; k < 26; k++) {
  const x = 10 + rng() * (N - 20);
  const y = 10 + rng() * (N - 20);
  const z = 10 + rng() * (N - 20);
  NODES.push([x, y, z]);
}

/* ------------------------------------------------------------------ agents */

const px = new Float32Array(AGENTS);
const py = new Float32Array(AGENTS);
const pz = new Float32Array(AGENTS);
const dx = new Float32Array(AGENTS);
const dy = new Float32Array(AGENTS);
const dz = new Float32Array(AGENTS);
const touched = new Uint8Array(AGENTS); // reached the event resource

for (let i = 0; i < AGENTS; i++) {
  const n = NODES[(rng() * NODES.length) | 0];
  px[i] = n[0] + (rng() - 0.5) * 3;
  py[i] = n[1] + (rng() - 0.5) * 3;
  pz[i] = n[2] + (rng() - 0.5) * 3;
  const th = rng() * Math.PI * 2;
  const ph = Math.acos(2 * rng() - 1);
  dx[i] = Math.sin(ph) * Math.cos(th);
  dy[i] = Math.sin(ph) * Math.sin(th);
  dz[i] = Math.cos(ph);
}

const trail = new Float32Array(N * N * N);
const eventTrail = new Float32Array(N * N * N);

// The visitor's event: one new resource at a seeded position, at a recorded
// tick. This is the input trace.
const EVENT_POS = [N * 0.6, N * 0.42, N * 0.52];

const sense = (x: number, y: number, z: number, t: number) =>
  trail[vi(x, y, z)] + (t >= EVENT_TICK ? eventTrail[vi(x, y, z)] * 1.6 : 0);

/* -------------------------------------------------------------- simulation */

for (let t = 0; t < STEPS; t++) {
  // Standing deposits anchor the network at the nodes.
  for (const n of NODES) trail[vi(n[0], n[1], n[2])] += NODE_DEPOSIT;
  if (t >= EVENT_TICK) eventTrail[vi(EVENT_POS[0], EVENT_POS[1], EVENT_POS[2])] += NODE_DEPOSIT * 1.5;

  for (let i = 0; i < AGENTS; i++) {
    const x = px[i], y = py[i], z = pz[i];
    let vx = dx[i], vy = dy[i], vz = dz[i];

    // Two perpendiculars to the heading, cheaply.
    let ax = -vy, ay = vx, az = 0;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = vy * az - vz * ay, by = vz * ax - vx * az, bz = vx * ay - vy * ax;

    const sd = SENSE_DIST;
    const sa = Math.sin(SENSE_ANGLE), ca = Math.cos(SENSE_ANGLE);
    const f = sense(x + vx * sd, y + vy * sd, z + vz * sd, t);
    const s1 = sense(x + (vx * ca + ax * sa) * sd, y + (vy * ca + ay * sa) * sd, z + (vz * ca + az * sa) * sd, t);
    const s2 = sense(x + (vx * ca - ax * sa) * sd, y + (vy * ca - ay * sa) * sd, z + (vz * ca - az * sa) * sd, t);
    const s3 = sense(x + (vx * ca + bx * sa) * sd, y + (vy * ca + by * sa) * sd, z + (vz * ca + bz * sa) * sd, t);

    if (s1 > f && s1 >= s2 && s1 >= s3) { vx = vx * ca + ax * sa * TURN * 3; vy = vy * ca + ay * sa * TURN * 3; vz = vz * ca + az * sa * TURN * 3; }
    else if (s2 > f && s2 >= s3) { vx = vx * ca - ax * sa * TURN * 3; vy = vy * ca - ay * sa * TURN * 3; vz = vz * ca - az * sa * TURN * 3; }
    else if (s3 > f) { vx = vx * ca + bx * sa * TURN * 3; vy = vy * ca + by * sa * TURN * 3; vz = vz * ca + bz * sa * TURN * 3; }

    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;

    let nx = x + vx * SPEED, ny = y + vy * SPEED, nz = z + vz * SPEED;
    // An agent that reaches the boundary respawns at a seeded node rather
    // than bouncing: wall-crawlers were drawing the bounding box into the
    // render as straight streaks, and a box is a nameable object.
    if (nx < 3 || nx > N - 4 || ny < 3 || ny > N - 4 || nz < 3 || nz > N - 4) {
      const home = NODES[(rng() * NODES.length) | 0];
      nx = home[0] + (rng() - 0.5) * 2;
      ny = home[1] + (rng() - 0.5) * 2;
      nz = home[2] + (rng() - 0.5) * 2;
      const th2 = rng() * Math.PI * 2;
      const ph2 = Math.acos(2 * rng() - 1);
      vx = Math.sin(ph2) * Math.cos(th2);
      vy = Math.sin(ph2) * Math.sin(th2);
      vz = Math.cos(ph2);
    }

    px[i] = nx; py[i] = ny; pz[i] = nz;
    dx[i] = vx; dy[i] = vy; dz[i] = vz;

    const id = vi(nx, ny, nz);
    trail[id] += DEPOSIT;
    if (t >= EVENT_TICK) {
      if (!touched[i]) {
        const ex = nx - EVENT_POS[0], ey = ny - EVENT_POS[1], ez = nz - EVENT_POS[2];
        if (ex * ex + ey * ey + ez * ez < 48) touched[i] = 1;
      } else {
        eventTrail[id] += DEPOSIT * 0.9;
      }
    }
  }

  if ((t & 1) === 1) {
    for (let i = 0; i < trail.length; i++) trail[i] *= DECAY;
    if (t >= EVENT_TICK) for (let i = 0; i < eventTrail.length; i++) eventTrail[i] *= 0.97;
  }
}

let touchedCount = 0;
for (let i = 0; i < AGENTS; i++) touchedCount += touched[i];

/* ------------------------------------------------------- pack + calibrate */

// Self-calibrating transfer: percentiles of the actual trail distribution set
// the render thresholds, which is the measured-not-guessed lesson.
const sample: number[] = [];
for (let i = 0; i < trail.length; i += 7) if (trail[i] > 0.5) sample.push(trail[i]);
sample.sort((a, b) => a - b);
const q = (p: number) => sample.length ? sample[Math.min(sample.length - 1, (sample.length * p) | 0)] : 1;
const P50 = q(0.5), P90 = q(0.9), P99 = q(0.99);

const vox = new Uint8Array(N * N * N * 4);
for (let i = 0; i < trail.length; i++) {
  const o = i * 4;
  const tr = Math.min(255, (trail[i] / P99) * 255);
  const ev = Math.min(255, (eventTrail[i] / Math.max(1, P99 * 0.7)) * 255);
  vox[o] = tr;
  vox[o + 1] = ev;
  vox[o + 3] = Math.max(tr, ev);
}

const tex = new THREE.Data3DTexture(vox, N, N, N);
tex.format = THREE.RGBAFormat;
tex.minFilter = THREE.LinearFilter;
tex.magFilter = THREE.LinearFilter;
tex.unpackAlignment = 1;
tex.needsUpdate = true;

/* ---------------------------------------------------------------- renderer */

const canvas = document.getElementById('field') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, alpha: false,
  powerPreference: 'high-performance', preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(PALETTE.void, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, canvas.clientWidth / canvas.clientHeight, 0.02, 100);

const mat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uMap: { value: tex },
    uCamPos: { value: new THREE.Vector3() },
    uInvProj: { value: new THREE.Matrix4() },
    uInvView: { value: new THREE.Matrix4() },
    uBone: { value: new THREE.Color(PALETTE.bone.getHex()) },
    uCyan: { value: new THREE.Color(PALETTE.cherenkov.getHex()) },
    uT0: { value: (P50 / P99) * 0.9 },
    uT1: { value: (P90 / P99) },
    uExposure: { value: 1.15 },
    uGray: { value: 0 },
  },
  vertexShader: 'out vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: [
    'precision highp float;',
    'precision highp sampler3D;',
    'in vec2 vUv; out vec4 outColor;',
    'uniform sampler3D uMap;',
    'uniform vec3 uCamPos, uBone, uCyan;',
    'uniform mat4 uInvProj, uInvView;',
    'uniform float uT0, uT1, uExposure, uGray;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }',
    'vec2 boxHit(vec3 ro, vec3 rd){',
    '  vec3 a = (vec3(-0.5) - ro) / rd, b = (vec3(0.5) - ro) / rd;',
    '  vec3 lo = min(a, b), hi = max(a, b);',
    '  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));',
    '}',
    'void main(){',
    '  vec4 ndc = vec4(vUv * 2.0 - 1.0, -1.0, 1.0);',
    '  vec4 vp = uInvProj * ndc; vp /= vp.w;',
    '  vec3 rd = normalize((uInvView * vec4(vp.xyz, 0.0)).xyz);',
    '  vec2 h = boxHit(uCamPos, rd);',
    '  float t0 = max(h.x, 0.0), t1 = h.y;',
    '  vec3 col = vec3(0.0);',
    '  if (t1 > t0) {',
    '    float T = 1.0;',
    '    float dt = (t1 - t0) / 260.0;',
    '    float t = t0 + hash(gl_FragCoord.xy) * dt;',
    '    for (int i = 0; i < 260; i++){',
    '      if (t > t1 || T < 0.01) break;',
    '      vec4 s = texture(uMap, uCamPos + rd * t + 0.5);',
    // Density topology: a hard floor at the median kills the haze of stray
    // trails, the ramp to p90 draws the web, and the top decade carries the
    // concentrations. Event channel rides its own curve.
    '      float w = smoothstep(uT0, uT1, s.r);',
    '      float core = smoothstep(uT1, 1.0, s.r);',
    '      float ev = smoothstep(uT0 * 0.7, uT1, s.g);',
    '      float sigma = (w * 8.0 + core * 30.0 + ev * 14.0);',
    '      float a = 1.0 - exp(-sigma * dt * 1.9);',
    '      vec3 c = uBone * (0.35 * w + 1.5 * core) + uCyan * ev * 1.7;',
    '      col += T * a * c;',
    '      T *= 1.0 - a;',
    '      t += dt;',
    '    }',
    '  }',
    '  col = 1.0 - exp(-col * uExposure);',
    '  if (uGray > 0.5) col = vec3(dot(col, vec3(0.2126, 0.7152, 0.0722)));',
    '  outColor = vec4(col, 1.0);',
    '}',
  ].join('\n'),
  depthWrite: false, depthTest: false,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

/* -------------------------------------------- micro view: the agents exist */

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'far';
const evBox = new THREE.Vector3(EVENT_POS[0] / N - 0.5, EVENT_POS[1] / N - 0.5, EVENT_POS[2] / N - 0.5);

if (view === 'micro' || view === 'descent3') {
  // Agents within the revelation radius of the event, as lit points. Only
  // here: at macro scale they must not exist on screen.
  const near: number[] = [];
  for (let i = 0; i < AGENTS; i++) {
    const ex = px[i] / N - 0.5 - evBox.x, ey = py[i] / N - 0.5 - evBox.y, ez = pz[i] / N - 0.5 - evBox.z;
    if (ex * ex + ey * ey + ez * ez < 0.02) near.push(px[i] / N - 0.5, py[i] / N - 0.5, pz[i] / N - 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(near, 3));
  const pm = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uBone: { value: new THREE.Color(PALETTE.bone.getHex()) } },
    vertexShader: [
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = clamp(1.6 / max(0.02, -mv.z), 1.5, 9.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'precision highp float; uniform vec3 uBone; out vec4 outColor;',
      'void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q,q) * 4.0;',
      '  if (d > 1.0) discard; outColor = vec4(uBone * exp(-3.0 * d) * 0.85, 1.0); }',
    ].join('\n'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  });
  const pts = new THREE.Points(g, pm);
  pts.renderOrder = 1;
  scene.add(pts);
}

/* ------------------------------------------------------------------ camera */

const FAR_POS = new THREE.Vector3(1.1, -0.9, 1.85);
const FAR_LOOK = new THREE.Vector3(-0.06, 0.03, 0);
const MICRO_POS = evBox.clone().add(new THREE.Vector3(0.1, -0.075, 0.085));
const MICRO_LOOK = evBox.clone();

const place = (f: number) => {
  // Eased travel along the line between the two observation points, with the
  // look target sliding onto the event.
  const e = f * f * (3 - 2 * f);
  camera.position.lerpVectors(FAR_POS, MICRO_POS, e);
  const look = new THREE.Vector3().lerpVectors(FAR_LOOK, MICRO_LOOK, e);
  camera.lookAt(look);
};

if (view === 'far' || view === 'fargray') place(0);
else if (view === 'micro') place(1);
else if (view.startsWith('descent')) place((Number(view.slice(7)) + 1) / 5);

if (view === 'fargray') mat.uniforms.uGray.value = 1;
if (view === 'micro' || view === 'descent3') {
  // Inside the trail field the accumulated density blows out at the far
  // transfer. Raise the floor and drop exposure: at close range only the
  // reinforced channels should read, exactly as the macro-conceals rule wants
  // the hierarchy inverted.
  mat.uniforms.uExposure.value = 0.7;
  mat.uniforms.uT0.value = Math.min(0.9, (P90 / P99) * 1.15);
  mat.uniforms.uT1.value = 1.0;
}

camera.updateMatrixWorld();
mat.uniforms.uCamPos.value.copy(camera.position);
mat.uniforms.uInvProj.value.copy(camera.projectionMatrix).invert();
mat.uniforms.uInvView.value.copy(camera.matrixWorld);

renderer.render(scene, camera);

/* --------------------------------------------------------------- evidence */

const trace = {
  medium: 'physarum',
  hiddenRule: 'optimisation through abandonment',
  seed: '0x' + SEED.toString(16),
  agents: AGENTS,
  steps: STEPS,
  fixedStep: true,
  rule: { speed: SPEED, senseDist: SENSE_DIST, senseAngle: SENSE_ANGLE, turn: TURN, deposit: DEPOSIT, decay: DECAY },
  nodes: NODES.length,
  event: { tick: EVENT_TICK, type: 'resource', pos: EVENT_POS.map((v) => +(v / N).toFixed(3)) },
  agentsReachedEvent: touchedCount,
  densityPercentiles: { p50: +P50.toFixed(1), p90: +P90.toFixed(1), p99: +P99.toFixed(1) },
  determinismClaim: 'seeded, fixed-step, replayable in tested environment',
};
(window as unknown as { __proofTrace: object }).__proofTrace = trace;

const el = document.getElementById('sim-state');
if (el) {
  el.innerHTML =
    'PHYSARUM &middot; ' + AGENTS.toLocaleString() + ' agents &middot; step ' + STEPS +
    ' &middot; seed 0x' + SEED.toString(16).toUpperCase() + '<br>' +
    'Event: resource at tick ' + EVENT_TICK + ' &middot; ' +
    touchedCount.toLocaleString() + ' agents rerouted';
}

markReady();
