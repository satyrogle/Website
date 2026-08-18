/**
 * PROOF — 3D physarum, GPGPU, on the real card.
 *
 * The question this answers is narrow and it is not about Dark Lattice: can an
 * emergent simulation reach the material quality of the reference board, or
 * does it look like haze the way every previous field did.
 *
 * No concept, no company copy, no architecture, no authored assets.
 *
 * HOW IT WORKS
 *
 *   agents      2.36M, stored as two float textures (position, heading)
 *   volume      160^3 density field, held as a 13x13 tiled 2D atlas so it can
 *               be written with ordinary additive point rendering. WebGL2 can
 *               sample a 3D texture but cannot scatter into one without layered
 *               rendering; an atlas sidesteps that entirely.
 *   per frame   1. sense and steer      each agent samples five directions in
 *                                       the volume and turns toward the densest
 *               2. deposit              2.36M additive points into the atlas
 *               3. diffuse and decay    3D blur across tile boundaries
 *               4. raymarch             emission and absorption through the box
 *
 * The rule set is three lines of arithmetic. Everything visible is a
 * consequence of it, which is the one property no previous carrier had.
 *
 * Deterministic: agents are seeded from a hash of their index. No Math.random
 * anywhere, so the same seed gives the same structure every run.
 */

import * as THREE from 'three';

const AGENT_TEX = 1536;
const AGENTS = AGENT_TEX * AGENT_TEX;
const GRID = 128;
const TILES = 12;
const ATLAS = GRID * TILES;

const canvas = document.getElementById('field') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setClearColor(0x000000, 1);
renderer.autoClear = false;

if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required');
const gl = renderer.getContext();
if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float required');

/* ------------------------------------------------------------------ helpers */

function rt(w: number, h: number, type: THREE.TextureDataType = THREE.FloatType) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
        // Clamp, never repeat. Repeat wrapping on a tiled atlas lets the edge of
    // the last tile sample the first one, which stamps hard rectangular scars
    // across the volume.
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
  t.texture.generateMipmaps = false;
  return t;
}

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadGeo = new THREE.PlaneGeometry(2, 2);

function pass(fragment: string, uniforms: Record<string, THREE.IUniform>) {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(quadGeo, mat));
  return { scene, mat };
}

/** Shared GLSL: the atlas mapping, and trilinear-ish sampling of the volume. */
const VOLUME_GLSL = [
  'const float GRID = ' + GRID.toFixed(1) + ';',
  'const float TILES = ' + TILES.toFixed(1) + ';',
  'const float ATLAS = ' + ATLAS.toFixed(1) + ';',
  // xy is clamped to half a texel INSIDE the tile. Without that, bilinear
  // filtering at a tile edge reaches into the neighbouring slice, which is a
  // completely unrelated z, and the volume grows small rectangular scars.
  'vec2 voxelToAtlas(vec3 p){',
  '  float z = clamp(floor(p.z), 0.0, GRID - 1.0);',
  '  vec2 xy = clamp(p.xy, vec2(0.5), vec2(GRID - 0.5));',
  '  float tx = mod(z, TILES);',
  '  float ty = floor(z / TILES);',
  '  return (vec2(tx, ty) * GRID + xy) / ATLAS;',
  '}',
  'float sampleVol(sampler2D tex, vec3 p){',
  '  float z0 = clamp(floor(p.z), 0.0, GRID - 1.0);',
  '  float f = clamp(p.z - z0, 0.0, 1.0);',
  '  float a = texture(tex, voxelToAtlas(vec3(p.xy, z0))).r;',
  '  float b = texture(tex, voxelToAtlas(vec3(p.xy, min(z0 + 1.0, GRID - 1.0)))).r;',
  '  return mix(a, b, f);',
  '}',
].join('\n');

/* ------------------------------------------------------------- agent state */

const posA = rt(AGENT_TEX, AGENT_TEX);
const posB = rt(AGENT_TEX, AGENT_TEX);
const dirA = rt(AGENT_TEX, AGENT_TEX);
const dirB = rt(AGENT_TEX, AGENT_TEX);
let posSrc = posA, posDst = posB, dirSrc = dirA, dirDst = dirB;

const trailA = rt(ATLAS, ATLAS, THREE.HalfFloatType);
const trailB = rt(ATLAS, ATLAS, THREE.HalfFloatType);
let trailSrc = trailA, trailDst = trailB;

const HASH = [
  'float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }',
  'vec3 hash31(float p){',
  '  vec3 q = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));',
  '  q += dot(q, q.yxz + 33.33);',
  '  return fract((q.xxy + q.yzz) * q.zyx);',
  '}',
].join('\n');

/**
 * Seed. Agents start on a thick shell rather than filling the box: a uniform
 * fill converges to uniform mush, and the shell gives the simulation somewhere
 * to grow into, which is what produces the large-scale filament structure.
 */
const seedPos = pass(
  [
    'precision highp float;',
    'varying vec2 vUv;',
    HASH,
    'uniform float uSeed;',
    'void main(){',
    '  float id = floor(vUv.x * ' + AGENT_TEX.toFixed(1) + ') + floor(vUv.y * ' + AGENT_TEX.toFixed(1) + ') * ' + AGENT_TEX.toFixed(1) + ';',
    '  vec3 h = hash31(id + uSeed);',
    '  float th = h.x * 6.28318;',
    '  float z = h.y * 2.0 - 1.0;',
    '  float r = 0.26 + 0.16 * h.z;',
    '  float s = sqrt(max(0.0, 1.0 - z * z));',
    '  vec3 p = vec3(cos(th) * s, sin(th) * s, z) * r + 0.5;',
    '  gl_FragColor = vec4(p * ' + GRID.toFixed(1) + ', 1.0);',
    '}',
  ].join('\n'),
  { uSeed: { value: 17.0 } }
);

const seedDir = pass(
  [
    'precision highp float;',
    'varying vec2 vUv;',
    HASH,
    'uniform float uSeed;',
    'void main(){',
    '  float id = floor(vUv.x * ' + AGENT_TEX.toFixed(1) + ') + floor(vUv.y * ' + AGENT_TEX.toFixed(1) + ') * ' + AGENT_TEX.toFixed(1) + ';',
    '  vec3 h = hash31(id * 1.7 + uSeed);',
    '  float th = h.x * 6.28318;',
    '  float z = h.y * 2.0 - 1.0;',
    '  float s = sqrt(max(0.0, 1.0 - z * z));',
    '  gl_FragColor = vec4(normalize(vec3(cos(th) * s, sin(th) * s, z)), 1.0);',
    '}',
  ].join('\n'),
  { uSeed: { value: 91.0 } }
);

/* --------------------------------------------------------- sense and steer */

const UP = [
  'void basis(vec3 f, out vec3 r, out vec3 u){',
  '  vec3 a = abs(f.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);',
  '  r = normalize(cross(a, f));',
  '  u = cross(f, r);',
  '}',
].join('\n');

const update = pass(
  [
    'precision highp float;',
    'varying vec2 vUv;',
    HASH,
    VOLUME_GLSL,
    UP,
    'uniform sampler2D uPos;',
    'uniform sampler2D uDir;',
    'uniform sampler2D uTrail;',
    'uniform float uSense;',
    'uniform float uSpread;',
    'uniform float uTurn;',
    'uniform float uStep;',
    'uniform float uFrame;',
    'void main(){',
    '  vec3 p = texture(uPos, vUv).xyz;',
    '  vec3 d = normalize(texture(uDir, vUv).xyz);',
    '  vec3 r, u;',
    '  basis(d, r, u);',
    // Five sensors: straight ahead, and four lateral offsets. Steering toward
    // the densest is the entire rule. Everything in the image comes from this.
    '  vec3 s0 = p + d * uSense;',
    '  vec3 s1 = p + normalize(d + r * uSpread) * uSense;',
    '  vec3 s2 = p + normalize(d - r * uSpread) * uSense;',
    '  vec3 s3 = p + normalize(d + u * uSpread) * uSense;',
    '  vec3 s4 = p + normalize(d - u * uSpread) * uSense;',
    '  float f0 = sampleVol(uTrail, s0);',
    '  float f1 = sampleVol(uTrail, s1);',
    '  float f2 = sampleVol(uTrail, s2);',
    '  float f3 = sampleVol(uTrail, s3);',
    '  float f4 = sampleVol(uTrail, s4);',
    '  vec3 steer = vec3(0.0);',
    '  float best = f0;',
    '  if (f1 > best) { best = f1; steer = r; }',
    '  if (f2 > best) { best = f2; steer = -r; }',
    '  if (f3 > best) { best = f3; steer = u; }',
    '  if (f4 > best) { best = f4; steer = -u; }',
    // A small deterministic wobble keeps the population from locking into a
    // lattice. Hashed from agent id and frame, so it is reproducible.
    '  float id = floor(vUv.x * ' + AGENT_TEX.toFixed(1) + ') + floor(vUv.y * ' + AGENT_TEX.toFixed(1) + ') * ' + AGENT_TEX.toFixed(1) + ';',
    '  vec3 j = hash31(id + uFrame * 0.618) - 0.5;',
    '  d = normalize(d + steer * uTurn + j * 0.13);',
    '  p += d * uStep;',
    // Reflect at the boundary instead of wrapping. Wrapping smears structure
    // across the far face and reads as a seam.
    '  vec3 c = vec3(GRID * 0.5);',
    '  vec3 rel = p - c;',
    '  float rad = length(rel);',
    '  float lim = GRID * 0.465;',
    '  if (rad > lim) {',
    '    vec3 n = rel / rad;',
    '    p = c + n * lim;',
    '    d = normalize(reflect(d, n) * 0.6 - n * 0.4);',
    '  }',
    '  gl_FragColor = vec4(p, 1.0);',
    '  #ifdef WRITE_DIR',
    '  gl_FragColor = vec4(d, 1.0);',
    '  #endif',
    '}',
  ].join('\n'),
  {
    uPos: { value: null },
    uDir: { value: null },
    uTrail: { value: null },
    uSense: { value: 3.2 },
    uSpread: { value: 0.55 },
    uTurn: { value: 0.14 },
    uStep: { value: 0.75 },
    uFrame: { value: 0 },
  }
);

const updateDirMat = update.mat.clone();
updateDirMat.defines = { WRITE_DIR: '' };
updateDirMat.uniforms = update.mat.uniforms;
const updateDirScene = new THREE.Scene();
updateDirScene.add(new THREE.Mesh(quadGeo, updateDirMat));

/* ------------------------------------------------------------- deposit pass */

const depositGeo = new THREE.BufferGeometry();
{
  const uvs = new Float32Array(AGENTS * 2);
  let k = 0;
  for (let y = 0; y < AGENT_TEX; y++) {
    for (let x = 0; x < AGENT_TEX; x++) {
      uvs[k++] = (x + 0.5) / AGENT_TEX;
      uvs[k++] = (y + 0.5) / AGENT_TEX;
    }
  }
  depositGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AGENTS * 3), 3));
  depositGeo.setAttribute('aRef', new THREE.BufferAttribute(uvs, 2));
}

const depositMat = new THREE.ShaderMaterial({
  // Equilibrium trail value is deposit x agentsPerVoxel / (1 - decay). With
  // 2.36M agents over roughly 600k occupied voxels and decay 0.955 that is
  // about 90x the deposit, so 0.55 saturated the whole shell to solid white.
  // 0.012 lands the dense cores near 1.0, which is what the transfer curve
  // expects.
  uniforms: { uPos: { value: null }, uAmount: { value: 0.020 } },
  vertexShader: [
    'attribute vec2 aRef;',
    'uniform sampler2D uPos;',
    VOLUME_GLSL,
    'void main(){',
    '  vec3 p = texture(uPos, aRef).xyz;',
    '  vec2 uv = voxelToAtlas(p);',
    '  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);',
    '  gl_PointSize = 1.0;',
    '}',
  ].join('\n'),
  fragmentShader: [
    'precision highp float;',
    'uniform float uAmount;',
    'void main(){ gl_FragColor = vec4(uAmount, 0.0, 0.0, 1.0); }',
  ].join('\n'),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
});
const depositScene = new THREE.Scene();
depositScene.add(new THREE.Points(depositGeo, depositMat));

/* -------------------------------------------------------- diffuse and decay */

const diffuse = pass(
  [
    'precision highp float;',
    'varying vec2 vUv;',
    VOLUME_GLSL,
    'uniform sampler2D uTrail;',
    'uniform float uDecay;',
    'uniform float uDiffuse;',
    'void main(){',
    // Recover the voxel this atlas texel represents, so the blur can reach
    // neighbours in z that live in a completely different tile.
    '  vec2 px = vUv * ATLAS - 0.5;',
    '  vec2 tile = floor(px / GRID);',
    '  vec3 v = vec3(px - tile * GRID, tile.y * TILES + tile.x);',
    '  if (v.z > GRID - 1.0) { gl_FragColor = vec4(0.0); return; }',
    '  float c = sampleVol(uTrail, v);',
    '  float n = 0.0;',
    '  n += sampleVol(uTrail, v + vec3(1.0, 0.0, 0.0));',
    '  n += sampleVol(uTrail, v - vec3(1.0, 0.0, 0.0));',
    '  n += sampleVol(uTrail, v + vec3(0.0, 1.0, 0.0));',
    '  n += sampleVol(uTrail, v - vec3(0.0, 1.0, 0.0));',
    '  n += sampleVol(uTrail, v + vec3(0.0, 0.0, 1.0));',
    '  n += sampleVol(uTrail, v - vec3(0.0, 0.0, 1.0));',
    '  float out_ = mix(c, n / 6.0, uDiffuse) * uDecay;',
    '  gl_FragColor = vec4(out_, 0.0, 0.0, 1.0);',
    '}',
  ].join('\n'),
  { uTrail: { value: null }, uDecay: { value: 0.880 }, uDiffuse: { value: 0.06 } }
);

/* ------------------------------------------------------------------ render */

const render = pass(
  [
    'precision highp float;',
    'varying vec2 vUv;',
    HASH,
    VOLUME_GLSL,
    'uniform sampler2D uTrail;',
    'uniform vec3 uCam;',
    'uniform mat3 uBasis;',
    'uniform float uFov;',
    'uniform float uAspect;',
    'uniform float uDensity;',
    'uniform float uAbsorb;',
    'uniform float uSteps;',
    'uniform vec3 uCool;',
    'uniform vec3 uWarm;',
    'uniform vec3 uPeak;',
    'bool boxHit(vec3 ro, vec3 rd, out float t0, out float t1){',
    '  vec3 lo = vec3(1.0), hi = vec3(GRID - 2.0);',
    '  vec3 inv = 1.0 / rd;',
    '  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;',
    '  vec3 mn = min(a, b), mx = max(a, b);',
    '  t0 = max(max(mn.x, mn.y), mn.z);',
    '  t1 = min(min(mx.x, mx.y), mx.z);',
    '  return t1 > max(t0, 0.0);',
    '}',
    'void main(){',
    '  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);',
    '  vec3 rd = normalize(uBasis * vec3(ndc * uFov, -1.0));',
    '  float t0, t1;',
    '  if (!boxHit(uCam, rd, t0, t1)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }',
    '  t0 = max(t0, 0.0);',
    '  float dt = (t1 - t0) / uSteps;',
    // Jittered start. Without it the march produces visible shells, which is a
    // repeating element and would fail on sight.
    '  float jit = hash11(vUv.x * 1731.7 + vUv.y * 913.3);',
    '  float t = t0 + dt * jit;',
    '  vec3 acc = vec3(0.0);',
    '  float trans = 1.0;',
    '  for (int i = 0; i < 220; i++) {',
    '    if (float(i) >= uSteps || trans < 0.004) break;',
    '    vec3 p = uCam + rd * t;',
    '    vec3 rel = p - vec3(GRID * 0.5);',
    '    float fall = 1.0 - smoothstep(GRID * 0.40, GRID * 0.475, length(rel));',
    '    float d = sampleVol(uTrail, p) * uDensity * fall;',
    '    if (d > 0.0007) {',
    // Emission ramps cool to warm to peak with density, so the dense cores
    // read hot while the thin structure stays cold. This is the only place
    // colour is decided.
    '      float k = clamp(d * 1.6, 0.0, 1.0);',
    '      vec3 col = mix(uCool, uWarm, smoothstep(0.0, 0.45, k));',
    '      col = mix(col, uPeak, smoothstep(0.55, 1.0, k));',
    '      float a = 1.0 - exp(-d * uAbsorb * dt);',
    '      acc += trans * a * col * (0.5 + 1.4 * k);',
    '      trans *= 1.0 - a;',
    '    }',
    '    t += dt;',
    '  }',
    '  gl_FragColor = vec4(acc, 1.0);',
    '}',
  ].join('\n'),
  {
    uTrail: { value: null },
    uCam: { value: new THREE.Vector3() },
    uBasis: { value: new THREE.Matrix3() },
    uFov: { value: 0.55 },
    uAspect: { value: canvas.clientWidth / canvas.clientHeight },
    uDensity: { value: 1.0 },
    uAbsorb: { value: 0.42 },
    uSteps: { value: 200 },
    uCool: { value: new THREE.Color('#1546D8').convertSRGBToLinear() },
    uWarm: { value: new THREE.Color('#56D8FF').convertSRGBToLinear() },
    uPeak: { value: new THREE.Color('#F8FBFF').convertSRGBToLinear() },
  }
);

/* -------------------------------------------------------------------- run */

function draw(scene: THREE.Scene, target: THREE.WebGLRenderTarget | null) {
  renderer.setRenderTarget(target);
  renderer.render(scene, quadCam);
}

renderer.setRenderTarget(trailA); renderer.clear();
renderer.setRenderTarget(trailB); renderer.clear();
draw(seedPos.scene, posSrc);
draw(seedDir.scene, dirSrc);

function step(frame: number) {
  update.mat.uniforms.uPos.value = posSrc.texture;
  update.mat.uniforms.uDir.value = dirSrc.texture;
  update.mat.uniforms.uTrail.value = trailSrc.texture;
  update.mat.uniforms.uFrame.value = frame;

  draw(update.scene, posDst);
  draw(updateDirScene, dirDst);
  [posSrc, posDst] = [posDst, posSrc];
  [dirSrc, dirDst] = [dirDst, dirSrc];

  depositMat.uniforms.uPos.value = posSrc.texture;
  renderer.setRenderTarget(trailSrc);
  renderer.render(depositScene, quadCam);

  diffuse.mat.uniforms.uTrail.value = trailSrc.texture;
  draw(diffuse.scene, trailDst);
  [trailSrc, trailDst] = [trailDst, trailSrc];
}

/* --------------------------------------------------------- stars: the agents */

/**
 * A galaxy is not fog. It is point sources, and the nebula is the minority of
 * the light. The first render of this proof raymarched the 128^3 trail volume
 * alone, which is why it produced a blob: the volume is the simulation's
 * MEMORY, blurred by construction. The agents are the sharp reality. So the
 * agents are rendered directly, one point each, brightness graded by the trail
 * density under them, and the volume stays underneath as faint haze.
 */
const starCam = new THREE.PerspectiveCamera(36, canvas.clientWidth / canvas.clientHeight, 0.5, 1000);

const starMat = new THREE.ShaderMaterial({
  uniforms: {
    uPos: { value: null },
    uTrail: { value: null },
    uGain: { value: 0.12 },
    uCool: { value: new THREE.Color('#1546D8').convertSRGBToLinear() },
    uWarm: { value: new THREE.Color('#56D8FF').convertSRGBToLinear() },
    uPeak: { value: new THREE.Color('#F8FBFF').convertSRGBToLinear() },
  },
  vertexShader: [
    'attribute vec2 aRef;',
    'uniform sampler2D uPos;',
    'uniform sampler2D uTrail;',
    VOLUME_GLSL,
    'varying float vK;',
    'void main(){',
    '  vec3 p = texture(uPos, aRef).xyz;',
    '  vK = sampleVol(uTrail, p);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  gl_PointSize = clamp(96.0 / max(1.0, -mv.z), 1.0, 2.5);',
    '}',
  ].join('\n'),
  fragmentShader: [
    'precision highp float;',
    'varying float vK;',
    'uniform float uGain;',
    'uniform vec3 uCool, uWarm, uPeak;',
    'void main(){',
    '  float k = clamp(vK * 1.5, 0.0, 1.0);',
    '  vec3 col = mix(uCool, uWarm, smoothstep(0.03, 0.45, k));',
    '  col = mix(col, uPeak, smoothstep(0.6, 1.0, k));',
    '  gl_FragColor = vec4(col * uGain * (0.25 + 2.75 * k), 1.0);',
    '}',
  ].join('\n'),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
});
const starScene = new THREE.Scene();
const stars = new THREE.Points(depositGeo, starMat);
stars.frustumCulled = false;
starScene.add(stars);

/**
 * HDR accumulation and a rolling tonemap. Additive stars reach values far
 * above 1.0 in the core; 1 - exp(-x) takes them to white smoothly instead of
 * clipping, which is the difference between a galactic core and a blown blob.
 */
const frameRT = rt(canvas.clientWidth, canvas.clientHeight, THREE.HalfFloatType);
const tonemap = pass(
  [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform float uExposure;',
    'void main(){',
    '  vec3 c = texture(uTex, vUv).rgb;',
    '  c = 1.0 - exp(-c * uExposure);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n'),
  { uTex: { value: frameRT.texture }, uExposure: { value: 1.3 } }
);

/**
 * Camera, position and look target in voxel space, fov in degrees, applied to
 * BOTH renderers so stars and haze share one view.
 *
 * The basis is built with x = cross(f, up), matching three.js. The previous
 * version used cross(up, f), which mirrors the raymarch horizontally relative
 * to the point pass; aligned layers would have been impossible.
 */
function setCamera(pos: THREE.Vector3, target: THREE.Vector3, fovDeg: number) {
  const f = target.clone().sub(pos).normalize();
  const up = Math.abs(f.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const x = new THREE.Vector3().crossVectors(f, up).normalize();
  const y = new THREE.Vector3().crossVectors(x, f);
  render.mat.uniforms.uBasis.value.set(x.x, y.x, -f.x, x.y, y.y, -f.y, x.z, y.z, -f.z);
  render.mat.uniforms.uCam.value.copy(pos);
  render.mat.uniforms.uFov.value = Math.tan((fovDeg * Math.PI) / 360);
  starCam.position.copy(pos);
  starCam.up.copy(up);
  starCam.lookAt(target.x, target.y, target.z);
  starCam.fov = fovDeg;
  starCam.aspect = canvas.clientWidth / canvas.clientHeight;
  starCam.updateProjectionMatrix();
}

const VIEW = new URLSearchParams(location.search).get('view') || 'outside';
const WARM = Number(new URLSearchParams(location.search).get('warm') || 260);

for (let i = 0; i < WARM; i++) step(i);

const qp = new URLSearchParams(location.search);
const GAIN = Number(qp.get('gain') || 0.022);
const EXPOSURE = Number(qp.get('exp') || 1.0);
const NEBULA = Number(qp.get('neb') || 0.10);

/**
 * Auto-framing. The aggregate drifts away from the box centre as it forms, and
 * two frames have already been wasted on a camera aimed at empty space. So the
 * agent positions are read back once and the camera is aimed at the measured
 * centroid, at a distance set by the measured spread. No guessing.
 */
const buf = new Float32Array(AGENT_TEX * AGENT_TEX * 4);
renderer.readRenderTargetPixels(posSrc, 0, 0, AGENT_TEX, AGENT_TEX, buf);
let sx = 0, sy = 0, sz = 0;
const n = AGENT_TEX * AGENT_TEX;
for (let i = 0; i < buf.length; i += 4) { sx += buf[i]; sy += buf[i + 1]; sz += buf[i + 2]; }
const cen = new THREE.Vector3(sx / n, sy / n, sz / n);
let sr = 0;
for (let i = 0; i < buf.length; i += 4) {
  const dx = buf[i] - cen.x, dy = buf[i + 1] - cen.y, dz = buf[i + 2] - cen.z;
  sr += dx * dx + dy * dy + dz * dz;
}
const rms = Math.sqrt(sr / n);

if (VIEW === 'inside') {
  // Just off the centroid, looking through the mass. Same data, different distance.
  const dir = new THREE.Vector3(0.9, -0.35, 0.35).normalize();
  setCamera(
    cen.clone().addScaledVector(dir, rms * 1.25),
    cen.clone().addScaledVector(dir, -rms * 1.2),
    60
  );
  render.mat.uniforms.uDensity.value = NEBULA;
  render.mat.uniforms.uAbsorb.value = 0.7;
} else {
  // Framed so the structure slightly overfills and crops. A body fully
  // contained in the frame reads as an object; a cropped one reads as vast.
  const dir = new THREE.Vector3(1.3, -0.45, 0.75).normalize();
  setCamera(cen.clone().addScaledVector(dir, rms * 3.4), cen, 36);
  render.mat.uniforms.uDensity.value = NEBULA;
  render.mat.uniforms.uAbsorb.value = 0.55;
}

render.mat.uniforms.uTrail.value = trailSrc.texture;
render.mat.uniforms.uAspect.value = canvas.clientWidth / canvas.clientHeight;
starMat.uniforms.uPos.value = posSrc.texture;
starMat.uniforms.uTrail.value = trailSrc.texture;
starMat.uniforms.uGain.value = GAIN;
tonemap.mat.uniforms.uExposure.value = EXPOSURE;

// Nebula first as the base layer, stars added over it in HDR, then one
// tonemap to the screen.
renderer.setRenderTarget(frameRT);
renderer.clear();
renderer.render(render.scene, quadCam);
renderer.render(starScene, starCam);
renderer.setRenderTarget(null);
renderer.clear();
renderer.render(tonemap.scene, quadCam);

requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    document.documentElement.dataset.styleframe = 'ready';
  })
);
