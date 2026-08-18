/**
 * PROOF — THE CONSUMING FRONT (working name only, nothing is locked)
 *
 * Jacob's brief, 2026-08-18: not the tunnel object. Particle systems and
 * cellular automata. Something holy at the start, we pass through it, and
 * inside there is a surprise that reframes what we saw.
 *
 * The mechanism IS the form, literally: a deterministic 3D cellular automaton
 * grows from seeded clusters through a seeded nutrient field. Three quantities
 * drive every pixel:
 *
 *   FRONT   cells born where the rule and the field permit. They EMIT. The
 *           holy light, seen from outside, is the growth happening.
 *   BODY    cells that survived and aged. Near-black matter, lit by one
 *           directional light with a volumetric shadow march.
 *   RECORD  cells that died leave a fading trace. The hollow interior is the
 *           structure's own history in deep blue, layered like growth rings.
 *
 * The surprise is not a monster: from outside, a divine luminous front; from
 * inside, the light is revealed as the EATING EDGE and the interior is the
 * record of everything consumed. The reveal reinterprets the first frame,
 * which is the brief's own kill-test requirement.
 *
 * VERSION 2, after the first capture. The first pass failed because an
 * expanding CA's surface is always freshly born, so the entire shell emitted
 * and the frame was a glowing white egg: the banned blob. The cure is the
 * NUTRIENT FIELD: seeded value noise that gates birth. Growth stalls in barren
 * directions, stalled surface ages into dark matter, and the emitting front
 * survives only along fertile lobes. Dark body and living light now coexist in
 * one silhouette, which is what makes it a structure rather than a blob.
 *
 * Determinism: mulberry32 everywhere, fixed step, no Math.random. The rule,
 * seed, step and cell counts shown in the DOM are the sim's real values.
 */

import * as THREE from 'three';
import { PALETTE, markReady, mulberry32 } from './core';

/* ------------------------------------------------------------ simulation */

const N = 96;
const SEED = 0xa11ce7;
// 38, not 46: at 46 the shell reached the simulation boundary and grew flat
// clipped faces against the box walls.
const STEPS = 38;
const B_LO = 5, B_HI = 7, S_LO = 4, S_HI = 13;
const NUT_CUT = 0.5;

const rng = mulberry32(SEED);
const idx = (x: number, y: number, z: number) => x + N * (y + N * z);

/* Seeded value-noise nutrient field: two octaves of a trilinearly interpolated
   random lattice. Part of the world, not decoration: it decides where the
   organism can grow, which is what gives the silhouette its lobes and the
   surface its dark stalled regions. */
const nutrient = new Float32Array(N * N * N);
{
  const g = mulberry32(0xfeed5);
  const lat = (size: number) => {
    const a = new Float32Array(size * size * size);
    for (let i = 0; i < a.length; i++) a[i] = g();
    return (x: number, y: number, z: number) => {
      const fx = (x / N) * (size - 1), fy = (y / N) * (size - 1), fz = (z / N) * (size - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
      const tx = fx - x0, ty = fy - y0, tz = fz - z0;
      const s = (xx: number, yy: number, zz: number) =>
        a[Math.min(size - 1, xx) + size * (Math.min(size - 1, yy) + size * Math.min(size - 1, zz))];
      const lerp = (u: number, v: number, t: number) => u + (v - u) * t;
      return lerp(
        lerp(lerp(s(x0, y0, z0), s(x0 + 1, y0, z0), tx), lerp(s(x0, y0 + 1, z0), s(x0 + 1, y0 + 1, z0), tx), ty),
        lerp(lerp(s(x0, y0, z0 + 1), s(x0 + 1, y0, z0 + 1), tx), lerp(s(x0, y0 + 1, z0 + 1), s(x0 + 1, y0 + 1, z0 + 1), tx), ty),
        tz
      );
    };
  };
  const o1 = lat(5);
  const o2 = lat(13);
  // Crystalline anisotropy. Version 2 used isotropic noise and the organism
  // grew soft and lobed; organic mass plus a visible opening reads as anatomy,
  // which is the worst nameable-primitive failure available. Banding the
  // nutrient along three skewed lattice-plane families makes growth advance in
  // sheets and steps: faceted, mineral, and never flesh.
  const p1 = new THREE.Vector3(0.86, 0.31, 0.41).normalize();
  const p2 = new THREE.Vector3(-0.24, 0.9, 0.36).normalize();
  const p3 = new THREE.Vector3(0.33, -0.42, 0.85).normalize();
  const band = (t: number) => Math.abs(((t % 1) + 1) % 1 - 0.5) * 2; // triangle wave
  for (let z = 0; z < N; z++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const base = o1(x, y, z) * 0.5 + o2(x, y, z) * 0.2;
        const crystal =
          0.3 *
          Math.min(
            band((x * p1.x + y * p1.y + z * p1.z) / 7.3),
            Math.min(
              band((x * p2.x + y * p2.y + z * p2.z) / 9.1),
              band((x * p3.x + y * p3.y + z * p3.z) / 5.7)
            )
          ) * 2;
        nutrient[idx(x, y, z)] = base + crystal;
      }
}

let alive = new Uint8Array(N * N * N);
let ageArr = new Uint8Array(N * N * N);
const record = new Uint8Array(N * N * N);

{
  const c = N / 2;
  for (let k = 0; k < 7; k++) {
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const r = 3 + rng() * 11;
    const cx = c + Math.sin(ph) * Math.cos(th) * r;
    const cy = c + Math.sin(ph) * Math.sin(th) * r;
    const cz = c + Math.cos(ph) * r * 0.7;
    const rad = 2 + rng() * 2.4;
    for (let z = Math.floor(cz - rad); z <= cz + rad; z++)
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
        for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
          const d = Math.hypot(x - cx, y - cy, z - cz);
          if (d <= rad && rng() > 0.25) alive[idx(x, y, z)] = 1;
        }
  }
}

const OFF: number[] = [];
for (let z = -1; z <= 1; z++)
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++)
      if (x || y || z) OFF.push(x + N * (y + N * z));

let next = new Uint8Array(N * N * N);
let nextAge = new Uint8Array(N * N * N);

for (let step = 0; step < STEPS; step++) {
  next.fill(0);
  for (let z = 1; z < N - 1; z++)
    for (let y = 1; y < N - 1; y++) {
      let i = idx(1, y, z);
      for (let x = 1; x < N - 1; x++, i++) {
        let n = 0;
        for (let o = 0; o < 26; o++) n += alive[i + OFF[o]];
        if (alive[i]) {
          if (n >= S_LO && n <= S_HI) {
            next[i] = 1;
            nextAge[i] = Math.min(255, ageArr[i] + 1);
          } else {
            next[i] = 0;
            nextAge[i] = 0;
            record[i] = 255;
          }
        } else if (n >= B_LO && n <= B_HI && nutrient[i] > NUT_CUT) {
          next[i] = 1;
          nextAge[i] = 0;
        } else {
          nextAge[i] = 0;
        }
      }
    }
  for (let i = 0; i < record.length; i++) if (record[i] > 0 && !next[i]) record[i] = Math.max(0, record[i] - 1);
  [alive, next] = [next, alive];
  [ageArr, nextAge] = [nextAge, ageArr];
}

/* ------------------------------------------------- volume texture packing */

const vox = new Uint8Array(N * N * N * 4);
let frontCount = 0;
let bodyCount = 0;
const frontCells: number[] = [];
const c0 = N / 2;

// Shell radius first, in its own pass. The record mask below divides by it,
// so computing it inside the pack loop would give early cells a partial value.
let shellR = 0;
for (let z = 0; z < N; z++)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (alive[idx(x, y, z)]) {
        const r = Math.hypot(x - c0, y - c0, z - c0);
        if (r > shellR) shellR = r;
      }

for (let z = 0; z < N; z++)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = idx(x, y, z);
      const o = i * 4;
      if (alive[i]) {
        // Tipness: a young cell with few neighbours is a leading tip and
        // emits hard; a young cell on a flat face barely emits. This is what
        // stops the whole shell from glowing.
        if (ageArr[i] <= 1) {
          let n = 0;
          for (let q = 0; q < 26; q++) n += alive[i + OFF[q]] || 0;
          const tip = Math.max(0.12, 1.35 - n / 10);
          vox[o + 1] = Math.min(255, 255 * tip);
          vox[o] = 60;
          frontCount++;
          // Particles only from genuine tips. Splatting every front cell put
          // faint white speckle over the dark side of the body.
          if (tip > 0.7 && frontCount % 4 === 0) frontCells.push(x, y, z);
        } else {
          vox[o] = 255;
          bodyCount++;
        }
        vox[o + 3] = 255;
      } else if (record[i] > 0) {
        // Radial mask: the record exists only deep inside the organism. Died
        // cells near the surface would otherwise speckle blue through the
        // shell from outside, and the record must be a discovery, not a skin
        // condition.
        const r = Math.hypot(x - c0, y - c0, z - c0);
        const enclose = Math.max(0, Math.min(1, (0.72 - r / Math.max(shellR, 1)) / 0.2));
        if (enclose > 0) {
          vox[o + 2] = Math.round(record[i] * enclose);
          vox[o + 3] = Math.min(80, (record[i] * enclose) / 2);
        }
      }
    }

/* No density blur. The soft rounding it bought is exactly the fleshy read
   that killed version 2; a crystal wants its steps. Trilinear sampling alone
   takes the worst of the aliasing off. */

const shellFrac = shellR / N; // shell radius in box units (box is -0.5..0.5)

const tex = new THREE.Data3DTexture(vox, N, N, N);
tex.format = THREE.RGBAFormat;
tex.type = THREE.UnsignedByteType;
tex.minFilter = THREE.LinearFilter;
tex.magFilter = THREE.LinearFilter;
tex.unpackAlignment = 1;
tex.needsUpdate = true;

/* -------------------------------------------- deterministic gap finding */

let gapDir = new THREE.Vector3(1, 0, 0);
let denseDir = new THREE.Vector3(-1, 0, 0);
{
  // Thinnest direction is where the journey enters. Densest direction is what
  // the opening frame faces: the camera must never frame the way in, because a
  // framed opening in a grown mass reads as anatomy.
  let best = Infinity;
  let worst = -1;
  const g = mulberry32(0x5eed);
  for (let k = 0; k < 400; k++) {
    const th = g() * Math.PI * 2;
    const ph = Math.acos(2 * g() - 1);
    const d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph));
    let sum = 0;
    for (let t = 0; t < N / 2; t++) {
      const x = Math.round(N / 2 + d.x * t);
      const y = Math.round(N / 2 + d.y * t);
      const z = Math.round(N / 2 + d.z * t);
      if (x < 1 || y < 1 || z < 1 || x >= N - 1 || y >= N - 1 || z >= N - 1) break;
      sum += alive[idx(x, y, z)];
    }
    if (sum < best) { best = sum; gapDir = d; }
    if (sum > worst) { worst = sum; denseDir = d; }
  }
}

/* ---------------------------------------------------------------- render */

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
const camera = new THREE.PerspectiveCamera(34, canvas.clientWidth / canvas.clientHeight, 0.05, 100);

const lightDir = new THREE.Vector3(-0.55, 0.35, 0.75).normalize();

const volMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uMap: { value: tex },
    uCamPos: { value: new THREE.Vector3() },
    uInvProj: { value: new THREE.Matrix4() },
    uInvView: { value: new THREE.Matrix4() },
    uLight: { value: lightDir },
    uPeak: { value: new THREE.Color('#F8FBFF') },
    uCarbon: { value: new THREE.Color('#0a0d10') },
    uBlue: { value: new THREE.Color('#1546D8') },
    uExposure: { value: 1.2 },
    uFrontGain: { value: 1.7 },
    uRecGain: { value: 3.4 },
  },
  vertexShader: [
    'out vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  ].join('\n'),
  fragmentShader: [
    'precision highp float;',
    'precision highp sampler3D;',
    'in vec2 vUv;',
    'out vec4 outColor;',
    'uniform sampler3D uMap;',
    'uniform vec3 uCamPos, uLight, uPeak, uCarbon, uBlue;',
    'uniform mat4 uInvProj, uInvView;',
    'uniform float uExposure, uFrontGain, uRecGain;',
    '',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }',
    '',
    'vec2 boxHit(vec3 ro, vec3 rd){',
    '  vec3 t0 = (vec3(-0.5) - ro) / rd;',
    '  vec3 t1 = (vec3( 0.5) - ro) / rd;',
    '  vec3 tmin = min(t0, t1), tmax = max(t0, t1);',
    '  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));',
    '}',
    '',
    'vec4 sampleVol(vec3 p){ return texture(uMap, p + 0.5); }',
    'float densityAt(vec3 p){ return sampleVol(p).a; }',
    '',
    'vec3 gradientAt(vec3 p){',
    '  float e = 1.2 / 96.0;',
    '  return normalize(vec3(',
    '    densityAt(p + vec3(e,0,0)) - densityAt(p - vec3(e,0,0)),',
    '    densityAt(p + vec3(0,e,0)) - densityAt(p - vec3(0,e,0)),',
    '    densityAt(p + vec3(0,0,e)) - densityAt(p - vec3(0,0,e))) + 1e-5);',
    '}',
    '',
    'float shadowMarch(vec3 p){',
    '  float t = 0.02; float acc = 0.0;',
    '  for (int i = 0; i < 12; i++){',
    '    vec3 q = p + uLight * t;',
    '    if (max(abs(q.x), max(abs(q.y), abs(q.z))) > 0.5) break;',
    '    acc += densityAt(q) * 0.5;',
    '    t += 0.035;',
    '  }',
    '  return exp(-acc * 6.0);',
    '}',
    '',
    'void main(){',
    '  vec4 ndc = vec4(vUv * 2.0 - 1.0, -1.0, 1.0);',
    '  vec4 vpos = uInvProj * ndc; vpos /= vpos.w;',
    '  vec3 rd = normalize((uInvView * vec4(vpos.xyz, 0.0)).xyz);',
    '  vec3 ro = uCamPos;',
    '  vec2 hit = boxHit(ro, rd);',
    '  float t0 = max(hit.x, 0.0), t1 = hit.y;',
    '  vec3 col = vec3(0.0);',
    '  if (t1 > t0) {',
    '    float T = 1.0;',
    '    float jitter = hash(gl_FragCoord.xy) * 0.9;',
    '    float dt = (t1 - t0) / 240.0;',
    '    float t = t0 + jitter * dt;',
    '    for (int i = 0; i < 240; i++){',
    '      if (t > t1 || T < 0.012) break;',
    '      vec3 p = ro + rd * t;',
    '      vec4 s = sampleVol(p);',
    '      float dens = s.a;',
    '      if (dens > 0.045) {',
    '        float body = s.r * step(s.g, 0.03);',
    '        float front = s.g;',
    '        float rec = s.b;',
    '        float sigma = dens * (2.0 + 62.0 * body + 30.0 * front + 7.0 * rec);',
    '        float a = 1.0 - exp(-sigma * dt * 96.0 * 0.14);',
    '        vec3 emit = uPeak * front * uFrontGain + uBlue * rec * rec * uRecGain;',
    '        vec3 n = gradientAt(p);',
    '        float dif = max(dot(-n, uLight), 0.0);',
    '        float sh = shadowMarch(p);',
    '        vec3 lit = uCarbon * (0.14 + 2.1 * dif * sh) * body;',
    '        col += T * a * (emit + lit);',
    '        T *= 1.0 - a;',
    '      }',
    '      t += dt;',
    '    }',
    '  }',
    '  col = 1.0 - exp(-col * uExposure);',
    '  outColor = vec4(col, 1.0);',
    '}',
  ].join('\n'),
  depthWrite: false,
  depthTest: false,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), volMat));

/* ------------------------------------------------------ front particles */

{
  const pos = new Float32Array(frontCells.length);
  for (let i = 0; i < frontCells.length; i += 3) {
    pos[i] = frontCells[i] / N - 0.5;
    pos[i + 1] = frontCells[i + 1] / N - 0.5;
    pos[i + 2] = frontCells[i + 2] / N - 0.5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uBone: { value: new THREE.Color('#E9EEF2') } },
    vertexShader: [
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = clamp(7.0 / max(0.05, -mv.z), 1.0, 5.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform vec3 uBone;',
      'out vec4 outColor;',
      'void main(){',
      '  vec2 q = gl_PointCoord - 0.5;',
      '  float d2 = dot(q,q) * 4.0;',
      '  if (d2 > 1.0) discard;',
      '  outColor = vec4(uBone * exp(-4.5 * d2) * 0.3, 1.0);',
      '}',
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = 1;
  scene.add(pts);
}

/* ---------------------------------------------------------------- views */

const view = new URLSearchParams(location.search).get('view') || 'holy';

if (view === 'holy') {
  // Outside, far enough that the organism is an object in the void rather
  // than a cloud filling the lens. Looking left of its centre pushes the mass
  // into the right half, clear of the type.
  const side = new THREE.Vector3().crossVectors(denseDir, new THREE.Vector3(0, 1, 0)).normalize();
  camera.position.copy(denseDir).addScaledVector(side, 0.35);
  camera.position.normalize().multiplyScalar(shellFrac * 3.9);
  camera.lookAt(-shellFrac * 0.55, 0.02, 0);
  volMat.uniforms.uExposure.value = 1.5;
  volMat.uniforms.uFrontGain.value = 3.2;
} else if (view === 'within') {
  // The structural test. Not looking AT the organism: standing inside its
  // passages, mid-shell, looking down a channel toward the thick lit side.
  // If the opening frame works from here, there is no object next to copy,
  // because there is no object. There is a place.
  camera.position.copy(gapDir).multiplyScalar(shellFrac * 0.62);
  camera.lookAt(denseDir.x * shellFrac, denseDir.y * shellFrac * 0.6, denseDir.z * shellFrac);
  volMat.uniforms.uExposure.value = 1.9;
  volMat.uniforms.uFrontGain.value = 3.6;
  volMat.uniforms.uRecGain.value = 2.2;
} else if (view === 'threshold') {
  // Passing through the thin part of the shell. The wall fills the frame
  // edges; the interior void opens ahead.
  camera.position.copy(gapDir).multiplyScalar(shellFrac * 1.06);
  camera.lookAt(-gapDir.x, -gapDir.y, -gapDir.z);
  volMat.uniforms.uExposure.value = 1.35;
} else {
  // Inside the hollow, looking at the far wall: backlit shell, and the
  // record of everything consumed hanging in the dark.
  camera.position.copy(gapDir).multiplyScalar(shellFrac * 0.3);
  camera.lookAt(-gapDir.x + 0.25, -gapDir.y + 0.15, -gapDir.z);
  volMat.uniforms.uExposure.value = 2.1;
  volMat.uniforms.uRecGain.value = 3.0;
}

camera.updateMatrixWorld();
volMat.uniforms.uCamPos.value.copy(camera.position).sub(scene.position);
volMat.uniforms.uInvProj.value.copy(camera.projectionMatrix).invert();
volMat.uniforms.uInvView.value.copy(camera.matrixWorld);

renderer.render(scene, camera);

const el = document.getElementById('sim-state');
if (el) {
  el.innerHTML =
    'Rule B' + B_LO + '-' + B_HI + ' / S' + S_LO + '-' + S_HI + ' of 26<br>' +
    'Step <b>' + STEPS + '</b> &middot; seed <b>0x' + SEED.toString(16).toUpperCase() + '</b><br>' +
    'Front <b>' + frontCount.toLocaleString() + '</b> &middot; body <b>' + bodyCount.toLocaleString() + '</b>';
}

markReady();
