import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LatticeWorld, CELL, HALF, TOWER_TOP, SEA_Y } from '../world/LatticeWorld';
import { TIP_T, prongCentre, surfacePoint } from '../world/monumentForm';
import { CameraPath } from './CameraPath';

const UP = new THREE.Vector3(0, 1, 0);

/** how far behind the form the glow sprites sit, in world units */
const HALO_DEPTH = 78;

const FRAG_COMMON = `#include <common>
varying vec3 vMonoW;
uniform float uDecay;
uniform float uSeverity;
uniform float uTime;
uniform float uCalm;
uniform vec3 uHover;
uniform float uHoverAmt;
uniform vec3 uInner;
uniform float uInnerAmt;
uniform float uSignal;
uniform float uAlign;
float vMonoEng;
float vMonoRough = 0.9;
float monoHash(vec3 c) { return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`;

const FRAG_MAP = `#include <map_fragment>
{
  float heightT = clamp(vMonoW.y / 195.0, 0.0, 1.0);

  // THE SPLIT SPIRE is a wedge: no twist to unwrap. Courses run across
  // the outer face by depth, then wrap the flank
  float sideS = vMonoW.x >= 0.0 ? 1.0 : -1.0;
  float formS = 1.0 - 0.9 * pow(max(heightT, 1e-4), 1.0);
  float cutX = sideS * (5.0 - 3.9 * clamp(heightT, 0.0, 1.0));
  float fromFissure = abs(vMonoW.x - cutX);
  float outward = fromFissure / max(31.0 * formS, 0.001);
  float across = clamp(vMonoW.z / max(17.0 * formS, 0.001), -1.0, 1.0);
  float ang = across * 1.5 + sign(vMonoW.z) * smoothstep(0.5, 1.0, outward) * 1.2;

  // decay eats plates, and a plate is bounded by the macro cracks
  float plateId = floor(vMonoW.y / 2.4) * 17.0 + floor((ang + 3.0) * 6.5);
  float h = monoHash(vec3(plateId, sideS, 3.0));
  float cluster = 0.5 + 0.5 * sin(plateId * 0.61 + sideS + h * 9.0);
  float th = clamp(0.2 + 0.78 * (1.0 - heightT) + 0.28 * (cluster - 0.5) + (h - 0.5) * 0.12, 0.06, 0.985);
  if (uDecay > th) discard;
  float dying = smoothstep(0.035, 0.0, th - uDecay);

  if (!gl_FrontFacing) {
    diffuseColor.rgb = vec3(0.02, 0.023, 0.028);
    vMonoEng = 0.0;
    vMonoRough = 0.62;
  } else {

  // ---- SIGNAL SKIN ----
  // Sintered graphite, machined. The engravings live in ROUGHNESS and
  // specular, not in albedo, so they are nearly invisible head on and
  // only surface as the light rakes across them.
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  float graze = 1.0 - abs(dot(N, V));
  graze = smoothstep(0.25, 0.92, graze);

  // THE GLYPH LANGUAGE. Columns, not scatter: the face is divided
  // into vertical lanes and each lane carries a run of small marks
  // stacked down it, the way the spec sheets inscribe them. Two
  // systems overlaid at different lane widths.
  float glyph = 0.0;
  for (int sys = 0; sys < 2; sys++) {
    float laneW = sys == 0 ? 34.0 : 21.0;
    float rowH = sys == 0 ? 1.30 : 2.05;
    float lane = floor(ang * laneW);
    float lanePhase = monoHash(vec3(lane, sideS, float(sys) * 3.0));
    // not every lane is inscribed: the density the spec asks for
    if (lanePhase < 0.30) continue;
    float lx = fract(ang * laneW);
    float row = floor(vMonoW.y / rowH + lanePhase * 5.0);
    float ly = fract(vMonoW.y / rowH + lanePhase * 5.0);
    float gh = monoHash(vec3(lane, row, sideS + float(sys) * 7.0));
    if (gh < 0.34) continue;
    // a mark: a vertical stem with one or two crossbars, or a short
    // stroke. Small, hard edged, machined
    float mark = 0.0;
    float stem = smoothstep(0.055, 0.022, abs(lx - 0.5))
               * smoothstep(0.06, 0.10, ly) * smoothstep(0.94, 0.90, ly);
    mark = max(mark, stem * step(0.45, gh));
    for (int b = 0; b < 2; b++) {
      float bh = fract(gh * (5.7 + float(b) * 9.3));
      if (bh < 0.4) continue;
      float by = 0.22 + 0.52 * fract(bh * 3.3);
      float barHalf = 0.16 + 0.20 * fract(bh * 11.0);
      float bar = smoothstep(0.05, 0.02, abs(ly - by))
                * smoothstep(barHalf, barHalf - 0.06, abs(lx - 0.5));
      mark = max(mark, bar);
    }
    glyph = max(glyph, mark);
  }

  // long scratch lines: the fine diagonal hairlines the sheets carry
  // across every face, at a much longer scale than the glyphs
  float scratch = 0.0;
  for (int sc = 0; sc < 3; sc++) {
    float band = 3.0 + float(sc) * 2.3;
    vec2 sp = vec2(ang, vMonoW.y * 0.055);
    float sa = 0.6 + float(sc) * 0.9;
    float proj = sp.x * cos(sa) + sp.y * sin(sa);
    float lane = floor(proj * band);
    float lh = monoHash(vec3(lane, sideS, float(sc) * 11.0));
    if (lh < 0.55) continue;
    float d = abs(fract(proj * band) - 0.5) / band;
    float run = smoothstep(0.9, 0.2, abs(fract(sp.y * 0.35 + lh * 3.0) - 0.5) * 2.0);
    scratch = max(scratch, smoothstep(0.020, 0.002, d * band) * run);
  }

  // macro plate cracks: sparse and thin, a few per face. A periodic
  // fract() here striped the whole skin like corduroy
  vec2 pc = vec2(ang * 1.15, vMonoW.y * 0.026);
  vec2 pcell = floor(pc);
  float ph = monoHash(vec3(pcell, sideS));
  float crack = 0.0;
  if (ph > 0.62) {
    vec2 pf = fract(pc) - vec2(0.35 + 0.3 * fract(ph * 7.0), 0.5);
    float pa = (fract(ph * 13.0) - 0.5) * 2.2;
    float dd = abs(pf.x * cos(pa) + pf.y * sin(pa));
    crack = smoothstep(0.035, 0.004, dd);
  }

  // ROUGHNESS is where the engraving lives. Grooves hold a duller,
  // rougher surface inside a polished skin, so they read as light
  // catches the lip and skips the groove
  // sintered grain: fine, irregular, no periodicity to lock onto, and
  // a slow large scale drift over the top of it
  float micro = monoHash(floor(vec3(ang * 130.0, vMonoW.y * 26.0, sideS)));
  float macroVar = monoHash(floor(vec3(ang * 3.0, vMonoW.y * 0.5, sideS + 9.0)));
  // spec: roughness 0.48, variation plus or minus 0.08
  float rough = 0.48 + 0.045 * (micro - 0.5) * 2.0 + 0.035 * (macroVar - 0.5) * 2.0;
  rough += glyph * 0.16;
  rough += crack * 0.14;
  rough -= scratch * 0.26;
  vMonoRough = clamp(rough, 0.24, 0.92);

  // albedo barely moves: a hint of darkening in the deepest grooves,
  // and only where the light is already raking
  diffuseColor.rgb *= 1.0 - glyph * 0.10 * graze;
  // a scratch is a polished cut: it catches, never darkens
  diffuseColor.rgb += diffuseColor.rgb * scratch * graze * 1.6;
  diffuseColor.rgb *= 1.0 - crack * 0.28;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.76, 1.05), uSeverity * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.35, diffuseColor.rgb, smoothstep(0.0, 4.0, vMonoW.y));
  if (dying > 0.0) {
    float gt = 0.72 + 0.22 * sin(uTime * (1.0 + h * 1.4) + h * 40.0);
    diffuseColor.rgb *= mix(1.0, mix(gt, 0.8, uCalm), dying);
  }

  // ---- PROXIMITY / SIGNAL ----
  // Activity is a function of distance from the fissure. The wave of
  // roughness travels first; light follows it, and only ever in
  // fragments, never a whole glyph
  float prox = exp(-fromFissure * 0.22);
  float wavePhase = vMonoW.y * 0.055 - uTime * 0.42 - uSignal * 2.4;
  float wave = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(wavePhase));
  vMonoRough = clamp(vMonoRough - wave * prox * 0.16, 0.05, 0.95);

  float frag = step(0.945, monoHash(vec3(floor(ang * 26.0), floor(vMonoW.y * 2.2), sideS)));
  float lit = glyph * frag * wave * prox;
  // cross-gap alignment: when the eye is square to the fissure, the
  // two faces momentarily agree
  lit *= 1.0 + uAlign * 2.2;
  vMonoEng = lit * (1.0 - uCalm * 0.45);
  }
}`;

const FRAG_EMISSIVE = `#include <emissivemap_fragment>
if (gl_FrontFacing) {
  float heightT = clamp(vMonoW.y / 195.0, 0.0, 1.0);
  vec3 sig = mix(vec3(1.0, 0.98, 0.94), vec3(0.72, 0.86, 1.0), uSeverity);
  // only fragments ever light, and they are small and hard edged
  totalEmissiveRadiance += sig * vMonoEng * 2.4;
  float hd = distance(vMonoW, uHover);
  float camD = distance(cameraPosition, uHover);
  float sigma = clamp(camD * 0.16, 2.5, 15.0);
  float lampF = exp(-hd * hd / (2.0 * sigma * sigma)) * uHoverAmt;
  totalEmissiveRadiance += sig * lampF * 0.16;
  if (uInnerAmt > 0.001) {
    vec3 iv = uInner - vMonoW;
    totalEmissiveRadiance += vec3(0.45, 0.5, 0.6) * (uInnerAmt / (1.0 + dot(iv, iv) * 0.02));
  }
}`;



/**
 * THE MONUMENT, observed. One colossal stele of light cells in a dark
 * sea. Scroll strips it: cells fail and fall, crown first, and the
 * dark frame that was always holding it becomes the subject. The
 * renderer owns no authoritative state: decay is a pure function of
 * scroll, strikes come from the world's law.
 */

/**
 * The light score: every beat is lit on purpose. Warm hero light at
 * the establish, a raking key across the relief at the reading dwells
 * (the igloo move: material is revealed by light direction, not
 * brightness), near-darkness inside the cleft, cold witness light for
 * the return. Lerped by scroll progress.
 */
const LIGHT_KEYS: Array<{
  p: number;
  i: number;
  c: string;
  d: [number, number, number];
  amb: number;
  env: number;
}> = [
  { p: 0.0, i: 0.88, c: '#eef1f4', d: [0.35, 0.75, 0.55], amb: 1.1, env: 0.29 },
  { p: 0.15, i: 1.28, c: '#e8ecf0', d: [0.9, 0.35, 0.15], amb: 0.85, env: 0.33 },
  { p: 0.29, i: 0.88, c: '#e9edf1', d: [0.5, 0.6, 0.45], amb: 1.0, env: 0.30 },
  { p: 0.43, i: 1.33, c: '#e4e9ee', d: [0.95, 0.3, -0.1], amb: 0.7, env: 0.35 },
  { p: 0.53, i: 0.35, c: '#cfd9e4', d: [0.2, 0.9, 0.2], amb: 0.45, env: 0.20 },
  { p: 0.65, i: 0.40, c: '#cfd9e4', d: [0.2, 0.9, 0.2], amb: 0.45, env: 0.20 },
  { p: 0.7, i: 0.62, c: '#c3ccd8', d: [-0.6, 0.5, -0.5], amb: 0.6, env: 0.27 },
  { p: 0.83, i: 0.71, c: '#dbe1e8', d: [0.3, 0.4, 0.8], amb: 0.8, env: 0.27 },
  { p: 0.92, i: 0.48, c: '#b4bfcd', d: [0.2, 0.5, 1.0], amb: 0.7, env: 0.25 },
  { p: 1.0, i: 0.44, c: '#aeb9c8', d: [0.2, 0.5, 1.0], amb: 0.7, env: 0.25 }
];

const CLAD_VERT = /* glsl */ `
  in vec3 aOffset;
  in float aSeed;
  in float aThresh;
  in float aStrike;
  uniform float uDecay;
  uniform float uTime;
  uniform float uFogDensity;
  uniform float uCalmV;
  out vec3 vNormalV;
  out float vSeed;
  out float vFog;
  out float vDying;
  out float vFall;
  out float vHeight;
  out vec2 vUv;
  out float vWorldY;
  out vec3 vWorld;
  void main() {
    vSeed = aSeed;
    // the standing monument is authored stone now; a cube exists only
    // in its moment of failure, as debris in the air. The fall is
    // punctuation, never weather: it completes quickly and goes dark
    float over = max(0.0, uDecay - aThresh);
    // a live strike fells the cell regardless of scroll
    float sinceStrike = aStrike < 0.0 ? -1.0 : max(0.0, uTime - aStrike);
    float fallT = max(over * 40.0, sinceStrike > 0.0 ? sinceStrike * 1.8 : 0.0);
    vFall = fallT;
    vDying = smoothstep(0.035, 0.0, aThresh - uDecay) * step(uDecay, aThresh);

    // masonry: no two cells cut quite alike
    float sizeVar = 0.93 + 0.1 * fract(aSeed * 7.31);
    vec3 wp = position * sizeVar * clamp(1.0 - fallT * 0.85, 0.05, 1.0) + aOffset;
    if (fallT <= 0.0 || fallT > 2.0) wp = vec3(0.0, -9999.0, 0.0);
    if (fallT > 0.0) {
      float ang = fallT * (aSeed * 8.0 - 4.0) + uTime * 0.22 * (aSeed - 0.5) * (1.0 - uCalmV);
      float ca = cos(ang);
      float sa = sin(ang);
      vec3 lp = wp - aOffset;
      lp.xy = mat2(ca, -sa, sa, ca) * lp.xy;
      lp.xz = mat2(ca, -sa, sa, ca) * lp.xz;
      wp = lp + aOffset;
      wp.y -= fallT * fallT * 34.0;
      wp.x += sin(aSeed * 43.0) * fallT * 6.0;
      wp.z += cos(aSeed * 91.0) * fallT * 6.0;
      if (wp.y < -2.0) wp = vec3(0.0, -9999.0, 0.0);
    }
    #ifdef MIRROR
    if (wp.y > -100.0) {
      wp.y = -wp.y - 0.12;
      wp.x += sin(wp.y * 0.32 + uTime * 0.7 + wp.z * 0.11) * 0.4;
    }
    #endif
    vUv = uv;
    vWorldY = wp.y;
    vWorld = wp;
    vHeight = clamp(aOffset.y / 195.0, 0.0, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(1.0, -mv.z);
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  }
`;

const CLAD_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vNormalV;
  in float vSeed;
  in float vFog;
  in float vDying;
  in float vFall;
  in float vHeight;
  in vec2 vUv;
  in float vWorldY;
  in vec3 vWorld;
  uniform float uTime;
  uniform float uSeverity;
  uniform float uCalm;
  uniform vec3 uHover;
  uniform float uHoverAmt;
  uniform vec3 uInner;
  uniform float uInnerAmt;
  uniform vec3 uFogColor;
  out vec4 outColor;
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 L = normalize(vec3(0.35, 0.75, 0.55));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    // chunks of the body: dark igneous stone, its light failing with it
    vec3 base = mix(vec3(0.21, 0.205, 0.2), vec3(0.25, 0.24, 0.225), vSeed * 0.5);
    base = mix(base, vec3(0.14, 0.17, 0.23), uSeverity * 0.5);
    vec3 col = base * (0.38 + 0.5 * diff) * mix(0.5, 1.15, vHeight * vHeight);
    // the crown burns near-white: the monument's own lamp
    vec3 crownCol = mix(vec3(1.0, 0.94, 0.8), vec3(0.85, 0.92, 1.0), uSeverity);
    col += crownCol * smoothstep(0.93, 1.0, vHeight) * 1.5 * (1.0 - uSeverity * 0.5);
    // mortar: the joints hold shadow
    vec2 eUv = min(vUv, 1.0 - vUv);
    float edge = min(eUv.x, eUv.y);
    col *= 0.76 + 0.24 * smoothstep(0.0, 0.1, edge);

    // the engravings: every cell inscribed with its own recursive
    // pattern, records carved in light. A slow pulse climbs the
    // monument through them: the tower reading itself.
    if (vFall <= 0.0) {
      float eng = 0.0;
      vec2 p = vUv;
      float amp = 1.0;
      for (int i = 0; i < 4; i++) {
        p = fract(p * 2.0 + vSeed * 13.17 + float(i) * 0.31);
        vec2 dd = abs(p - 0.5);
        float frame = smoothstep(0.5, 0.44, max(dd.x, dd.y)) *
                      smoothstep(0.3, 0.36, max(dd.x, dd.y));
        float keep = step(0.45, fract(vSeed * (7.0 + float(i) * 3.7) + float(i) * 0.37));
        eng = max(eng, frame * keep * amp);
        amp *= 0.72;
      }
      eng *= smoothstep(0.02, 0.09, edge);
      // carved: the grooves hold quiet shadow, dormant until attended
      col *= 1.0 - eng * 0.24;
      // the visitor's lamp: where you point, the records wake. Warm
      // light early; the same touch turns cold as the truth arrives.
      float hd = distance(vWorld, uHover);
      // the pool of attention stays hand-sized on screen: its reach
      // shrinks as the camera closes
      float camD = distance(cameraPosition, uHover);
      float sigma = clamp(camD * 0.16, 2.5, 15.0);
      float lamp = exp(-hd * hd / (2.0 * sigma * sigma)) * uHoverAmt;
      float breathe = 1.0 - (1.0 - uCalm) * 0.08 * (0.5 + 0.5 * sin(uTime * 1.1));
      vec3 lampCol = mix(vec3(1.0, 0.88, 0.68), vec3(0.5, 0.78, 1.0), uSeverity);
      // the stone itself takes the colour of the attention it is given
      col = mix(col, col * lampCol * 1.3, lamp * 0.45);
      col += lampCol * eng * lamp * breathe * 0.7 * mix(1.0, 0.5, vDying);
    }
    // the traveller's light, inside the wall
    if (uInnerAmt > 0.001) {
      vec3 iv = uInner - vWorld;
      float id2 = dot(iv, iv);
      float il = uInnerAmt / (1.0 + id2 * 0.02);
      col += vec3(0.5, 0.55, 0.65) * il * (0.3 + 0.7 * max(dot(n, normalize(iv)), 0.0));
    }
    // the waterline keeps its dark
    col = mix(col * 0.35, col, smoothstep(0.0, 4.0, vWorldY));
    #ifdef MIRROR
    col *= 0.24;
    #endif
    if (vDying > 0.0) {
      // a slow gutter, never a strobe: shallow, smooth, and still under
      // reduced motion
      float g = 0.72 + 0.22 * sin(uTime * (1.0 + vSeed * 1.4) + vSeed * 40.0);
      col *= mix(1.0, mix(g, 0.8, uCalm), vDying);
    }
    if (vFall > 0.0) {
      col *= clamp(1.0 - vFall * 1.1, 0.08, 1.0);
    }
    col = mix(col, uFogColor, vFog);
    outColor = vec4(col, 1.0);
  }
`;

const MARK_VERT = /* glsl */ `
  in float aBorn;
  uniform float uTime;
  uniform float uScale;
  out float vBorn;
  void main() {
    vBorn = aBorn;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
    float ignite = clamp((uTime - aBorn) * 1.4, 0.0, 1.0);
    float swell = 1.0 + (1.0 - ignite) * 2.4;
    gl_PointSize = clamp(uScale * 2.0 * swell / dist, 2.0, 72.0);
  }
`;

const MARK_FRAG = /* glsl */ `
  precision highp float;
  in float vBorn;
  uniform float uTime;
  out vec4 outColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float fall = exp(-r2 * 11.0);
    float ignite = clamp((uTime - vBorn) * 1.4, 0.0, 1.0);
    vec3 col = mix(vec3(1.0), vec3(0.55, 0.87, 1.0), 0.3) * fall * (0.9 + 1.7 * (1.0 - ignite));
    outColor = vec4(col, 1.0);
  }
`;



const MONO_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uFogDensity;
  out vec3 vWorld;
  out vec3 vNormalW;
  out float vFog;
  void main() {
    vec3 wp = position;
    #ifdef MIRROR
    wp.y = -wp.y - 0.12;
    wp.x += sin(wp.y * 0.32 + uTime * 0.7 + wp.z * 0.11) * 0.4;
    #endif
    vWorld = wp;
    vNormalW = normal;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(1.0, -mv.z);
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  }
`;

const MONO_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vWorld;
  in vec3 vNormalW;
  in float vFog;
  uniform float uTime;
  uniform float uDecay;
  uniform float uSeverity;
  uniform float uCalm;
  uniform vec3 uHover;
  uniform float uHoverAmt;
  uniform vec3 uInner;
  uniform float uInnerAmt;
  uniform vec3 uFogColor;
  out vec4 outColor;

  float hash3(vec3 c) {
    return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  void main() {
    // the masonry field: continuous stone, coursed in 1.5 unit cells
    vec3 cell = floor(vWorld / 1.5);
    float h = hash3(cell);
    float heightT = clamp(vWorld.y / 195.0, 0.0, 1.0);
    float cluster = 0.5 + 0.5 * sin(cell.x * 0.315 + cell.z * 0.255 + cell.y * 0.165 + h * 9.0);
    float th = clamp(0.2 + 0.78 * (1.0 - heightT) + 0.28 * (cluster - 0.5) + (h - 0.5) * 0.12, 0.06, 0.985);

    // the decay eats the stone in whole courses, never as spray
    if (uDecay > th) discard;
    float dying = smoothstep(0.035, 0.0, th - uDecay);

    vec3 n = normalize(vNormalW);
    // inside of the shell: dark, cool, lit only by the traveller
    if (!gl_FrontFacing) {
      vec3 icol = vec3(0.018, 0.022, 0.028);
      if (uInnerAmt > 0.001) {
        vec3 iv = uInner - vWorld;
        float il = uInnerAmt / (1.0 + dot(iv, iv) * 0.02);
        icol += vec3(0.4, 0.45, 0.55) * il;
      }
      outColor = vec4(mix(icol, uFogColor, vFog), 1.0);
      return;
    }

    vec3 L = normalize(vec3(0.35, 0.75, 0.55));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    vec3 base = mix(vec3(0.15, 0.15, 0.16), vec3(0.19, 0.185, 0.19), h * 0.5);
    base = mix(base, vec3(0.12, 0.14, 0.19), uSeverity * 0.5);
    vec3 col = base * (0.38 + 0.5 * diff) * mix(0.5, 1.15, heightT * heightT);
    vec3 crownCol = mix(vec3(1.0, 0.94, 0.8), vec3(0.85, 0.92, 1.0), uSeverity);
    col += crownCol * smoothstep(0.93, 1.0, heightT) * 1.5 * (1.0 - uSeverity * 0.5);

    // the inscription courses, coarse: this surface is only ever a
    // shivered reflection
    float sideS = vWorld.x >= 0.0 ? 1.0 : -1.0;
    float formS = 1.0 - 0.95 * pow(max(heightT, 1e-4), 1.35);
    float angP = clamp(vWorld.z / max(17.0 * formS, 0.001), -1.0, 1.0) * 1.5;
    float rowH = 1.05;
    float row = floor(vWorld.y / rowH);
    float fv = fract(vWorld.y / rowH);
    float rowSeed = hash3(vec3(row, sideS, 7.0));
    float strata = floor(row / (5.0 + floor(rowSeed * 4.0)));
    col *= 0.86 + 0.26 * hash3(vec3(strata, sideS, 3.3));
    float cols = max(12.0, floor(26.0 * formS));
    float colF = (angP / 6.2831853 + 0.5) * cols + rowSeed * 31.0;
    float block = floor(floor(colF) / 6.0);
    float bs = hash3(vec3(block, row, sideS * 3.7));
    float runLen = 1.0 + floor(bs * 5.0);
    float inBlock = floor(colF) - block * 6.0;
    float inRun = step(inBlock, runLen - 0.5) * step(0.22, bs);
    float vIn = smoothstep(0.30, 0.42, fv) * smoothstep(0.78, 0.66, fv);
    float eng = inRun * vIn;
    col *= 1.0 - eng * 0.4;
    col *= 1.0 - smoothstep(0.045, 0.0, min(fv, 1.0 - fv)) * 0.14;

    // the visitor's lamp
    float hd = distance(vWorld, uHover);
    float camD = distance(cameraPosition, uHover);
    float sigma = clamp(camD * 0.16, 2.5, 15.0);
    float lamp = exp(-hd * hd / (2.0 * sigma * sigma)) * uHoverAmt;
    float breathe = 1.0 - (1.0 - uCalm) * 0.08 * (0.5 + 0.5 * sin(uTime * 1.1));
    vec3 lampCol = mix(vec3(1.0, 0.88, 0.68), vec3(0.5, 0.78, 1.0), uSeverity);
    col = mix(col, col * lampCol * 1.3, lamp * 0.45);
    col += lampCol * eng * lamp * breathe * 0.7;

    // the traveller's light on the stone
    if (uInnerAmt > 0.001) {
      vec3 iv = uInner - vWorld;
      float il = uInnerAmt / (1.0 + dot(iv, iv) * 0.02);
      col += vec3(0.5, 0.55, 0.65) * il * (0.3 + 0.7 * max(dot(n, normalize(iv)), 0.0));
    }

    // a course about to fail gutters, slow and shallow
    if (dying > 0.0) {
      float g = 0.72 + 0.22 * sin(uTime * (1.0 + h * 1.4) + h * 40.0);
      col *= mix(1.0, mix(g, 0.8, uCalm), dying);
    }

    col = mix(col * 0.35, col, smoothstep(0.0, 4.0, vWorld.y));
    #ifdef MIRROR
    col *= 0.24;
    #endif
    col = mix(col, uFogColor, vFog);
    outColor = vec4(col, 1.0);
  }
`;

const MOTE_VERT = /* glsl */ `
  in float aSeed;
  uniform float uTime;
  uniform float uScale;
  out float vSeed;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    // slow rise and drift: the air made visible
    p.y = mod(p.y + uTime * (0.3 + aSeed * 0.5), 34.0);
    p.x += sin(uTime * 0.05 + aSeed * 40.0) * 2.0;
    p.z += cos(uTime * 0.04 + aSeed * 70.0) * 2.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * 0.08 * (0.5 + aSeed) / dist, 1.0, 14.0);
  }
`;

const MOTE_FRAG = /* glsl */ `
  precision highp float;
  in float vSeed;
  uniform float uSeverity;
  uniform float uAmt;
  out vec4 outColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) ;
    if (r2 > 0.25) discard;
    float fall = exp(-r2 * 12.0);
    vec3 warm = vec3(0.62, 0.5, 0.34);
    vec3 cold = vec3(0.3, 0.38, 0.5);
    outColor = vec4(mix(warm, cold, uSeverity) * fall * 0.62 * uAmt, 1.0);
  }
`;

const SEA_VERT = /* glsl */ `
  out vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SEA_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vWorld;
  uniform vec3 uCam;
  uniform float uSeverity;
  uniform float uDecay;
  uniform float uTime;
  out vec4 outColor;
  void main() {
    float dist = length(vWorld - uCam);
    vec3 col = vec3(0.006, 0.009, 0.013);
    if (!gl_FrontFacing) {
      // the surface from beneath: a luminous ceiling, about to break
      float overhead = exp(-max(0.0, dist - 8.0) * 0.02);
      col = vec3(0.16, 0.17, 0.2) * (0.4 + 0.6 * overhead)
          + vec3(0.14, 0.11, 0.06) * overhead * (1.0 - uSeverity * 0.5);
      col *= 0.9 + 0.1 * sin(uTime * 0.4 + vWorld.x * 0.05 + vWorld.z * 0.04);
    }
    // the monument's standing light on the water, dying as it strips
    float r = length(vWorld.xz);
    float pool = exp(-r * 0.016);
    vec3 poolCol = mix(vec3(0.185, 0.155, 0.115), vec3(0.10, 0.12, 0.15), uSeverity);
    col += poolCol * pool * (1.0 - uDecay * 0.75) * (1.0 - uSeverity * 0.4)
        * (0.86 + 0.14 * sin(uTime * 0.3 + vWorld.x * 0.02 + vWorld.z * 0.013));
    float haze = 1.0 - exp(-dist * dist * 0.000004);
    col = mix(col, mix(vec3(0.022, 0.017, 0.012), vec3(0.010, 0.014, 0.020), uSeverity), haze);
    outColor = vec4(col, 0.72);
  }
`;

const SKY_VERT = /* glsl */ `
  out vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 0.0);
    gl_Position = (projectionMatrix * vec4(mv.xyz, 1.0)).xyww;
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vDir;
  uniform float uSeverity;
  out vec4 outColor;
  void main() {
    vec3 d = normalize(vDir);
    // The skin is #050607. A near-black object against a near-black sky
    // is nothing at all, which is why the spire vanished when the spec
    // albedo went in. Every reference sheet stands it against haze, so
    // the atmosphere carries the silhouette and the stone stays honest
    float band = exp(-abs(d.y + 0.02) * 3.2);
    float high = exp(-max(d.y - 0.1, 0.0) * 2.4);
    vec3 base = mix(vec3(0.0075, 0.0072, 0.0080), vec3(0.005, 0.006, 0.009), uSeverity);
    vec3 glow = mix(vec3(0.052, 0.047, 0.041), vec3(0.019, 0.024, 0.033), uSeverity);
    vec3 col = base + glow * band * (0.35 + 0.65 * high);
    outColor = vec4(col, 1.0);
  }
`;

export class JourneyRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly path = new CameraPath();

  private readonly scene = new THREE.Scene();
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private mirrorMat!: THREE.ShaderMaterial;
  private readonly cladMat: THREE.ShaderMaterial;
  private readonly markMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly strikeAttr: THREE.InstancedBufferAttribute;
  private readonly markGeom: THREE.BufferGeometry;
  private readonly markPos = new Float32Array(12 * 3);
  private readonly markBorn = new Float32Array(12);
  private readonly scree: THREE.InstancedMesh;
  private readonly screeTotal: number;
  private innerLight!: THREE.PointLight;
  private readonly annos: Array<{
    el: HTMLElement | null;
    point: THREE.Vector3;
    from: number;
    to: number;
  }> = (() => {
    const tipA = prongCentre(TIP_T[0] - 0.01, 0);
    const law = surfacePoint(100 / TOWER_TOP, 0, 0.5);
    return [
      {
        el: document.getElementById('anno-crown'),
        point: new THREE.Vector3(tipA.x, tipA.y + 2, tipA.z),
        from: 0.05,
        to: 0.4
      },
      {
        el: document.getElementById('anno-cleft'),
        point: new THREE.Vector3(0, 40, 16),
        from: 0.3,
        to: 0.44
      },
      {
        el: document.getElementById('anno-law'),
        point: new THREE.Vector3(law.x * 1.05, law.y, law.z * 1.05),
        from: 0.36,
        to: 0.5
      }
    ];
  })();
  private rimLight!: THREE.DirectionalLight;
  private witnessLight!: THREE.DirectionalLight;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private frameMat!: THREE.MeshStandardMaterial;
  private readonly groundU: Record<string, THREE.IUniform> = {
    uGSeverity: { value: 0 },
    uGDecay: { value: 0 }
  };
  private fissureMat!: THREE.ShaderMaterial;
  private frameGroup!: THREE.Group;
  private moteMat!: THREE.ShaderMaterial;
  private monoMat!: THREE.MeshStandardMaterial;
  private monoMirrorMat!: THREE.ShaderMaterial;
  private stoneU!: Record<string, THREE.IUniform>;
  /** resolves once the authored monument is standing */
  readonly ready: Promise<void>;
  private readonly halo: THREE.Sprite;
  private readonly crownHalo: THREE.Sprite;
  private readonly maxDpr: number;
  private time = 0;

  private readonly towerBox = new THREE.Box3(
    new THREE.Vector3(-HALF - 5.5, 0, -HALF - 5.5),
    new THREE.Vector3(HALF + 5.5, TOWER_TOP, HALF + 5.5)
  );
  private readonly raycaster = new THREE.Raycaster();
  private readonly hoverPoint = new THREE.Vector3(0, -999, 0);
  private pointerNdc: { x: number; y: number } | null = null;
  private hoverAmt = 0;
  private parX = 0;
  private parY = 0;
  /** the signal the skin carries: driven by the law, not by a clock */
  private signal = 0;
  private lastStrikeTick = 0;

  constructor(canvas: HTMLCanvasElement, private readonly world: LatticeWorld, maxDpr: number) {
    this.maxDpr = maxDpr;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x020304, 1);
    this.scene.fog = new THREE.FogExp2(0x0c0906, 0.0022);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.3, 900);

    const rt = new THREE.WebGLRenderTarget(2, 2, {
      samples: 4,
      type: THREE.HalfFloatType
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.34, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // --- sky ---
    this.skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uSeverity: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);

    // --- sea ---
    this.seaMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uSeverity: { value: 0 },
        uDecay: { value: 0 },
        uTime: { value: 0 }
      }
    });
    this.seaMat.transparent = true;
    this.seaMat.side = THREE.DoubleSide;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA_Y;
    this.scene.add(sea);

    // --- the cladding: the flesh of light ---
    const box = new THREE.BoxGeometry(CELL * 0.98, CELL * 0.98, CELL * 0.98);
    const cladGeom = new THREE.InstancedBufferGeometry();
    cladGeom.index = box.index;
    cladGeom.attributes.position = box.attributes.position!;
    cladGeom.attributes.normal = box.attributes.normal!;
    cladGeom.attributes.uv = box.attributes.uv!;
    cladGeom.instanceCount = world.nodeCount;
    cladGeom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(world.positions, 3));
    cladGeom.setAttribute('aSeed', new THREE.InstancedBufferAttribute(world.nodeSeeds, 1));
    cladGeom.setAttribute('aThresh', new THREE.InstancedBufferAttribute(world.thresholds, 1));
    this.strikeAttr = new THREE.InstancedBufferAttribute(world.strikeTimes, 1);
    cladGeom.setAttribute('aStrike', this.strikeAttr);

    this.cladMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: CLAD_VERT,
      fragmentShader: CLAD_FRAG,
      uniforms: {
        uDecay: { value: 0 },
        uTime: { value: 0 },
        uSeverity: { value: 0 },
        uCalm: { value: 0 },
        uCalmV: { value: 0 },
        uHover: { value: new THREE.Vector3(0, -999, 0) },
        uHoverAmt: { value: 0 },
        uInner: { value: new THREE.Vector3(0, -999, 0) },
        uInnerAmt: { value: 0 },
        uFogColor: { value: new THREE.Color('#07080a') },
        uFogDensity: { value: 0.0035 }
      }
    });
    const clad = new THREE.Mesh(cladGeom, this.cladMat);
    clad.frustumCulled = false;
    this.scene.add(clad);

    // the monument drowned: a true reflection, shivered by the water
    this.mirrorMat = this.cladMat.clone();
    this.mirrorMat.defines = { MIRROR: '' };
    const mirror = new THREE.Mesh(cladGeom, this.mirrorMat);
    mirror.frustumCulled = false;
    this.scene.add(mirror);

    // --- the true form: the dark lattice that binds the prongs ---
    // Two spines follow the prong cores; ties and diagonals cross the
    // cleft. From outside it is invisible under the stone. From inside
    // the cleft, and after the stone strips, it is the subject.
    // The lattice is the LAST thing the visitor understands, so it may
    // not be legible in the opening frame. Through the widened gap it
    // read as scaffolding and gave the ending away.
    this.frameMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e12,
      roughness: 0.55,
      metalness: 0.25,
      transparent: true,
      opacity: 0
    });
    const frameMat = this.frameMat;
    const frame = new THREE.Group();
    const bar = (a: THREE.Vector3, b: THREE.Vector3, w: number): void => {
      const len = a.distanceTo(b);
      if (len < 0.01) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, len + w * 0.5, w), frameMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
      frame.add(m);
    };
    const fp = (t: number, side: 0 | 1): THREE.Vector3 => {
      const c = prongCentre(Math.min(t, TIP_T[side] - 0.012), side);
      // pull the tie ends INTO the stone so they never float in the slit
      return new THREE.Vector3(c.x * 1.9, c.y, c.z);
    };
    const SPINE_SEGS = 26;
    for (const side of [0, 1] as const) {
      for (let i = 0; i < SPINE_SEGS; i++) {
        bar(fp(i / SPINE_SEGS, side), fp((i + 1) / SPINE_SEGS, side), 1.8);
      }
    }
    // ties live in the middle band only: at the crown the blades pin
    // each other, and braces against the bright sky read as scaffold
    const TIES = 9;
    for (let i = 0; i <= TIES; i++) {
      const t = 0.24 + (i / TIES) * 0.48;
      bar(fp(t, 0), fp(t, 1), 1.0);
      if (i < TIES) {
        const tn = 0.12 + ((i + 1) / TIES) * 0.6;
        // diagonals pulled inboard so their ends stay buried in stone
        const d0a = fp(t, 0);
        const d0b = fp(tn, 1);
        const d1a = fp(t, 1);
        const d1b = fp(tn, 0);
        bar(d0a.clone().lerp(d0b, 0.07), d0b.clone().lerp(d0a, 0.07), 0.7);
        bar(d1a.clone().lerp(d1b, 0.07), d1b.clone().lerp(d1a, 0.07), 0.7);
      }
    }
    this.frameGroup = frame;
    this.scene.add(frame);

    // --- the scree of the struck ---
    this.screeTotal = 1500;
    const screeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f26,
      roughness: 0.9,
      metalness: 0.05
    });
    this.scree = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CELL * 0.9, CELL * 0.55, CELL * 0.9),
      screeMat,
      this.screeTotal
    );
    const dummy = new THREE.Object3D();
    const rng = mulberry32ish(world.seed ^ 0x77aa11);
    for (let i = 0; i < this.screeTotal; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = HALF + 1.5 + Math.sqrt(rng()) * 15;
      dummy.position.set(
        Math.cos(ang) * rad,
        SEA_Y + 0.2 + rng() * 1.6 * Math.exp(-(rad - HALF) * 0.08),
        Math.sin(ang) * rad
      );
      dummy.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.6);
      dummy.updateMatrix();
      this.scree.setMatrixAt(i, dummy.matrix);
    }
    this.scree.count = 0;
    this.scene.add(this.scree);

    // --- light for the standard materials: driven per beat by the
    // light score in update(), never one static rig ---
    this.keyLight = new THREE.DirectionalLight(0xe8eef5, 1.0);
    this.keyLight.position.set(0.35, 0.8, 0.55);
    this.scene.add(this.keyLight);
    this.ambient = new THREE.AmbientLight(0x1a2129, 1.1);
    this.scene.add(this.ambient);

    // the traveller's light: alive only inside the cleft, and kept
    // faint. The passage must stay darkness with structure, never a
    // floodlit cavity
    this.innerLight = new THREE.PointLight(0xbfd4e8, 0, 55, 2.0);
    this.scene.add(this.innerLight);

    // the rim of the true form: cold light from behind and above that
    // rises with severity, so the frame's edges survive the night
    this.rimLight = new THREE.DirectionalLight(0x7fa8d0, 0);
    this.rimLight.position.set(-0.25, 0.9, -0.6);
    this.scene.add(this.rimLight);

    // the fill: a cool, weak light opposite the key. Without it the
    // horn on the key's far side is a black cutout with no material
    // in it at all, which is not restraint, it is absence
    this.fillLight = new THREE.DirectionalLight(0x9db3c8, 0.35);
    this.fillLight.position.set(-0.7, 0.35, -0.35);
    this.scene.add(this.fillLight);

    // the witness light: a cold front fill that arrives only with
    // understanding, so the revealed lattice is legible at the return
    this.witnessLight = new THREE.DirectionalLight(0x9fb4cc, 0);
    this.witnessLight.position.set(0.2, 0.5, 1.0);
    this.scene.add(this.witnessLight);

    // --- THE FISSURE ---
    // The reference's defining feature: not a glow around the spire
    // but a blade of light standing inside the slit, seen through the
    // gap between the halves. It is the doorway, and it is the only
    // bright thing in the opening frame.
    this.fissureMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: `
        out vec2 vUvF;
        void main() {
          vUvF = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        in vec2 vUvF;
        uniform float uSeverity;
        uniform float uDecay;
        uniform float uNear;
        out vec4 outColor;
        void main() {
          // pure, featureless white: the core has no gradient of its
          // own, only soft edges and an irregular width
          float wob = 0.055 * sin(vUvF.y * 21.0) + 0.03 * sin(vUvF.y * 53.0 + 1.7);
          float halfW = 0.30 + wob;
          float d = abs(vUvF.x - 0.5);
          float u = smoothstep(halfW, halfW - 0.09, d);
          float v = smoothstep(0.0, 0.05, vUvF.y) * smoothstep(1.0, 0.80, vUvF.y);
          // spec: emission colour pure #FFFFFF, intensity 8 to 15
          vec3 holy = vec3(1.0);
          vec3 cold = vec3(0.86, 0.93, 1.0);
          float fail = 1.0 - uDecay * 0.55;
          // inside the slit the plane is a few units from the eye, so
          // full strength floods the frame and the walls lose their
          // dark. It burns from a distance and only glows up close
          float near = mix(4.2, 0.85, uNear);
          outColor = vec4(mix(holy, cold, uSeverity) * v * u * near * fail, 1.0);
        }`,
      uniforms: { uSeverity: { value: 0 }, uDecay: { value: 0 }, uNear: { value: 0 } },
      side: THREE.DoubleSide,
      depthWrite: false
    });
    {
      const fis = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 150), this.fissureMat);
      fis.position.set(0, 78, -7.0);
      fis.frustumCulled = false;
      this.scene.add(fis);
    }

    // --- atmosphere ---
    // The halos sit BEHIND the whole form, never on its axis. An
    // additive sprite at the axis is painted over every surface behind
    // it, so the far horn washed out to a ghost while the near one
    // stayed black. Behind the form it backlights the silhouette,
    // which is what a halo was always meant to do.
    // Second law, learned when the frame read as the Eye of Sauron:
    // the glow NEVER sits in the gap between the horns. A lit void
    // framed by two curved forms is an eye. It lives off-axis and low.
    this.halo = makeHalo('#8f9aa8', 180);
    this.halo.position.set(-104, TOWER_TOP * 0.18, -HALO_DEPTH);
    this.scene.add(this.halo);
    // the crown light belongs to the tall horn alone, never centred
    const tallTip = prongCentre(TIP_T[0] - 0.02, 0);
    this.crownHalo = makeHalo('#cdd6e2', 64);
    this.crownHalo.position.set(tallTip.x * 2.2, tallTip.y + 2, tallTip.z - 34);
    this.scene.add(this.crownHalo);

    // --- the air: dust motes over the water, rising slowly ---
    {
      const N = 430;
      const rngM = mulberry32ish(world.seed ^ 0x5150);
      const mp = new Float32Array(N * 3);
      const ms = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const ang = rngM() * Math.PI * 2;
        const rad = 20 + rngM() * 130;
        mp[i * 3] = Math.cos(ang) * rad;
        mp[i * 3 + 1] = rngM() * 34;
        mp[i * 3 + 2] = Math.sin(ang) * rad;
        ms[i] = rngM();
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
      mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
      this.moteMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 900 },
          uSeverity: { value: 0 },
          uAmt: { value: 1 },
          uFall: { value: 0 }
        },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
      });
      const motes = new THREE.Points(mg, this.moteMat);
      motes.frustumCulled = false;
      this.scene.add(motes);
    }

    // --- visitor marks ---
    this.markGeom = new THREE.BufferGeometry();
    this.markGeom.setAttribute('position', new THREE.BufferAttribute(this.markPos, 3));
    this.markGeom.setAttribute('aBorn', new THREE.BufferAttribute(this.markBorn, 1));
    this.markGeom.setDrawRange(0, 0);
    this.markMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: MARK_VERT,
      fragmentShader: MARK_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 900 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });
    const marks = new THREE.Points(this.markGeom, this.markMat);
    marks.frustumCulled = false;
    this.scene.add(marks);

    this.resize();
    window.addEventListener('resize', this.resize);

    // --- image-based light: the single biggest jump toward the
    // reference's material quality ---
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
    this.scene.environmentIntensity = 0.28;

    // --- the monument itself: authored stone, not boxes ---
    const monoUniforms = (): Record<string, THREE.IUniform> => ({
      uTime: { value: 0 },
      uDecay: { value: 0 },
      uSeverity: { value: 0 },
      uCalm: { value: 0 },
      uHover: { value: new THREE.Vector3(0, -999, 0) },
      uHoverAmt: { value: 0 },
      uInner: { value: new THREE.Vector3(0, -999, 0) },
      uInnerAmt: { value: 0 },
      uSignal: { value: 0 },
      uAlign: { value: 0 },
      uFogColor: { value: new THREE.Color('#07080a') },
      uFogDensity: { value: 0.0022 }
    });
    // physically based stone, with the world's law injected into it:
    // dark igneous mass whose relief is REAL, baked from the high-poly
    // sculpt (tools/blender/monument.py) into tangent normal + AO maps
    this.stoneU = monoUniforms();
    const texLoader = new THREE.TextureLoader();
    const stoneNormal = texLoader.load('/models/monument-normal.png');
    stoneNormal.flipY = false;
    stoneNormal.colorSpace = THREE.NoColorSpace;
    const stoneAO = texLoader.load('/models/monument-ao.png');
    stoneAO.flipY = false;
    stoneAO.colorSpace = THREE.NoColorSpace;
    stoneAO.channel = 0;
    // SIGNAL SKIN, to the supplied spec: base #050607, metalness 0.08,
    // roughness 0.48, normal strength held back so the baked relief
    // reads as machined rather than eroded
    const stone = new THREE.MeshStandardMaterial({
      color: 0x050607,
      roughness: 0.48,
      metalness: 0.08,
      normalMap: stoneNormal,
      normalScale: new THREE.Vector2(0.36, 0.36),
      aoMap: stoneAO,
      aoMapIntensity: 1.0,
      side: THREE.DoubleSide
    });
    stone.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.stoneU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMonoW;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvMonoW = (modelMatrix * vec4(position, 1.0)).xyz;'
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', FRAG_COMMON)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = vMonoRough;'
        )
        .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE);
    };
    this.monoMat = stone;
    this.monoMirrorMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: MONO_VERT,
      fragmentShader: MONO_FRAG,
      uniforms: monoUniforms(),
      side: THREE.DoubleSide,
      defines: { MIRROR: '' }
    });
    this.ready = new GLTFLoader()
      .loadAsync('/models/monument.glb')
      .then((gltf) => {
        // THE FLOOR. A flat grey plane under a fully skinned monument
        // reads as paint. It is the same family of material now: the
        // same near-black base, polished enough to hold the fissure's
        // reflection and the sky's sheen at grazing angles, with the
        // same sintered grain running through it.
        const terrainMat = new THREE.MeshStandardMaterial({
          color: 0x06070a,
          roughness: 0.34,
          metalness: 0.04,
          side: THREE.DoubleSide
        });
        terrainMat.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, this.groundU);
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vGroundW;')
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\nvGroundW = (modelMatrix * vec4(position, 1.0)).xyz;'
            );
          sh.fragmentShader = sh.fragmentShader
            .replace(
              '#include <common>',
              `#include <common>
varying vec3 vGroundW;
uniform float uGSeverity;
uniform float uGDecay;
float gHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }`
            )
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
{
  // the fissure lays a reflection down the floor: a long streak on the
  // monument's axis, tightest near the foot and spreading with distance
  float r = length(vGroundW.xz);
  float axis = abs(vGroundW.x) / (2.2 + r * 0.10);
  float streak = exp(-axis * axis) * exp(-r * 0.010) * step(-1.0, vGroundW.z);
  vec3 lit = mix(vec3(1.0), vec3(0.86, 0.93, 1.0), uGSeverity);
  diffuseColor.rgb += lit * streak * 0.30 * (1.0 - uGDecay * 0.5);
  // wet sheen far off, so the plane resolves into a horizon rather
  // than stopping as a painted edge
  diffuseColor.rgb += vec3(0.020, 0.021, 0.026) * smoothstep(120.0, 620.0, r);
  // the same sintered grain the skin carries, at floor scale
  float g = gHash(floor(vGroundW.xz * 1.6));
  diffuseColor.rgb *= 0.86 + 0.28 * g;
}`
            )
            .replace(
              '#include <roughnessmap_fragment>',
              `#include <roughnessmap_fragment>
{
  float rr = length(vGroundW.xz);
  // polished where the light falls, dulling as it runs out to the dunes
  roughnessFactor = mix(0.24, 0.72, smoothstep(40.0, 340.0, rr))
                  + 0.06 * (gHash(floor(vGroundW.xz * 0.5)) - 0.5);
}`
            );
        };
        gltf.scene.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh) return;
          const mesh = o as THREE.Mesh;
          if (mesh.name === 'Terrain') {
            const ground = new THREE.Mesh(mesh.geometry, terrainMat);
            ground.frustumCulled = false;
            this.scene.add(ground);
            return;
          }
          const body = new THREE.Mesh(mesh.geometry, this.monoMat);
          body.frustumCulled = false;
          this.scene.add(body);
          const drowned = new THREE.Mesh(mesh.geometry, this.monoMirrorMat);
          drowned.frustumCulled = false;
          this.scene.add(drowned);
        });
      })
      .catch((e) => {
        console.error('monument.glb failed to load; debris continues without its body', e);
      });
  }

  /** The visitor's attention: where they point at the monument. */
  setPointer(ndcX: number, ndcY: number): void {
    this.pointerNdc = { x: ndcX, y: ndcY };
  }

  clearPointer(): void {
    this.pointerNdc = null;
  }

  update(progress: number, dt: number, reduced: boolean): void {
    this.time += dt;
    this.path.update(this.camera, progress, dt, reduced);
    const inside = smooth01(progress, 0.49, 0.53) * (1 - smooth01(progress, 0.65, 0.69));
    if (!reduced) {
      // the world is never embalmed: the camera orbits its subject,
      // drifting on its own and leaning with the visitor's hand. The
      // hand's reach shrinks inside the cleft: the walls are close
      const t = this.time;
      const reach = 1 - inside * 0.8;
      const px = this.pointerNdc ? this.pointerNdc.x : 0;
      const py = this.pointerNdc ? this.pointerNdc.y : 0;
      this.parX += (px - this.parX) * (1 - Math.exp(-dt * 1.6));
      this.parY += (py - this.parY) * (1 - Math.exp(-dt * 1.6));
      const yaw =
        (this.parX * 0.11 + Math.sin(t * 0.5) * 0.02 + Math.sin(t * 0.13) * 0.012) * reach;
      const pitch = (this.parY * 0.055 + Math.sin(t * 0.34 + 2.0) * 0.014) * reach;
      const lookP = this.path.lookPoint;
      const off = this.camera.position.clone().sub(lookP);
      off.applyAxisAngle(UP, -yaw);
      const right = new THREE.Vector3().crossVectors(off, UP).normalize();
      off.applyAxisAngle(right, pitch);
      off.multiplyScalar(1 + Math.sin(t * 0.21 + 4.0) * 0.02);
      this.camera.position.copy(lookP).add(off);
      // the frame itself leans with the hand: the subject swings gently
      const sway = lookP.clone().addScaledVector(right.normalize(), -this.parX * 5.0);
      sway.y += -this.parY * 3.0 + Math.sin(t * 0.4 + 1.0) * 0.6;
      this.camera.lookAt(sway);
    }
    const sev = this.path.state.severity;
    const decay = 0.9 * smooth01(progress, 0.16, 0.98);

    // the light score: each beat is lit on purpose
    {
      let k = 0;
      while (k < LIGHT_KEYS.length - 2 && LIGHT_KEYS[k + 1]!.p < progress) k++;
      const a = LIGHT_KEYS[k]!;
      const b = LIGHT_KEYS[k + 1]!;
      const f = smooth01(progress, a.p, b.p);
      this.keyLight.intensity = a.i + (b.i - a.i) * f;
      this.keyLight.color.copy(lerpColor(a.c, b.c, f));
      this.keyLight.position.set(
        a.d[0] + (b.d[0] - a.d[0]) * f,
        a.d[1] + (b.d[1] - a.d[1]) * f,
        a.d[2] + (b.d[2] - a.d[2]) * f
      );
      this.ambient.intensity = a.amb + (b.amb - a.amb) * f;
      this.scene.environmentIntensity = a.env + (b.env - a.env) * f;
      // the fill tracks the key, opposite and weak: never a second key
      this.fillLight.position.set(
        -this.keyLight.position.x,
        Math.abs(this.keyLight.position.y) * 0.45,
        -this.keyLight.position.z
      );
      this.fillLight.intensity = this.keyLight.intensity * 0.3;
    }

    // the air thickens on the way in and clears again with the return,
    // so the revealed lattice is seen, not swallowed
    const fogDensity =
      0.0022 + 0.0028 * smooth01(progress, 0.3, 0.7) * (1 - smooth01(progress, 0.86, 0.97));
    const fogColor = lerpColor('#07080a', '#04060a', sev);
    (this.scene.fog as THREE.FogExp2).color.copy(fogColor);
    (this.scene.fog as THREE.FogExp2).density = fogDensity;

    // the lamp follows attention; it wakes and settles smoothly
    let hoverTargetAmt = 0;
    if (this.pointerNdc) {
      this.raycaster.setFromCamera(
        new THREE.Vector2(this.pointerNdc.x, this.pointerNdc.y),
        this.camera
      );
      const hit = this.raycaster.ray.intersectBox(this.towerBox, new THREE.Vector3());
      if (hit) {
        const k = 1 - Math.exp(-dt * 7);
        this.hoverPoint.lerp(hit, this.hoverAmt < 0.02 ? 1 : k);
        hoverTargetAmt = 1;
      }
    }
    this.hoverAmt += (hoverTargetAmt - this.hoverAmt) * (1 - Math.exp(-dt * 5));

    for (const mat of [this.cladMat, this.mirrorMat]) {
      const cu = mat.uniforms;
      cu.uDecay!.value = decay;
      cu.uTime!.value = this.time;
      cu.uSeverity!.value = sev;
      cu.uCalm!.value = reduced ? 1 : 0;
      cu.uCalmV!.value = reduced ? 1 : 0;
      (cu.uHover!.value as THREE.Vector3).copy(this.hoverPoint);
      cu.uHoverAmt!.value = this.hoverAmt;
      (cu.uInner!.value as THREE.Vector3).copy(this.camera.position);
      cu.uInnerAmt!.value = inside * 0.35;
      cu.uFogDensity!.value = fogDensity;
      (cu.uFogColor!.value as THREE.Color).copy(fogColor);
    }

    this.skyMat.uniforms.uSeverity!.value = sev;
    this.fissureMat.uniforms.uSeverity!.value = sev;
    this.fissureMat.uniforms.uDecay!.value = decay;
    this.fissureMat.uniforms.uNear!.value = inside;
    this.groundU.uGSeverity!.value = sev;
    this.groundU.uGDecay!.value = decay;
    // bloom must not smear the fissure across the walls in there
    this.bloom.strength = 0.34 * (1 - inside * 0.72);
    this.seaMat.uniforms.uSeverity!.value = sev;
    this.seaMat.uniforms.uDecay!.value = decay;
    this.seaMat.uniforms.uTime!.value = reduced ? 0 : this.time;
    (this.seaMat.uniforms.uCam!.value as THREE.Vector3).copy(this.camera.position);

    // holiness dims as the monument strips, and never smears the lens
    const haloFade = smooth01(this.camera.position.distanceTo(this.halo.position), 40, 95);
    const crownFade = smooth01(this.camera.position.distanceTo(this.crownHalo.position), 40, 95);
    const breath = reduced ? 1 : 0.88 + 0.12 * Math.sin(this.time * 0.22);
    this.halo.material.opacity = 0.45 * (1 - decay * 0.85) * haloFade * breath;
    this.crownHalo.material.opacity = 0.5 * (1 - decay) * crownFade * (2 - breath) * 0.5;

    // the traveller's light burns only inside the cleft
    this.innerLight.intensity = 24 * inside;
    this.innerLight.position.copy(this.camera.position);
    this.rimLight.intensity = 5.0 * smooth01(sev, 0.6, 0.9);
    this.witnessLight.intensity = 2.6 * smooth01(sev, 0.72, 0.95);

    // the fallen accumulate
    this.scree.count = Math.floor(this.screeTotal * Math.min(1, decay * 1.15));

    // the lattice surfaces only as the stone that hid it fails
    const latticeSeen = smooth01(progress, 0.3, 0.54);
    this.frameMat.opacity = latticeSeen;
    this.frameGroup.visible = latticeSeen > 0.015;

    if (this.world.strikesDirty) {
      this.strikeAttr.needsUpdate = true;
      this.world.strikesDirty = false;
    }

    // THE SIGNAL. The skin is the visible face of the mechanism, so
    // the law drives it: a strike floods the surface and it settles
    // back toward inert. Idle keeps a slow breath so it is never dead
    if (this.world.tick !== this.lastStrikeTick && this.world.strikesDirty) {
      this.signal = 1;
      this.lastStrikeTick = this.world.tick;
    }
    this.signal *= Math.exp(-dt * 0.5);
    const idle = reduced ? 0.06 : 0.09 + 0.05 * Math.sin(this.time * 0.11);
    const signal = Math.min(1, this.signal + idle);

    // CROSS-GAP ALIGNMENT, camera driven: when the eye comes square to
    // the fissure, the faces either side of it agree for a moment
    const toSpire = this.camera.position.clone().setY(0);
    const align = toSpire.lengthSq() > 1 ? Math.abs(toSpire.normalize().x) : 0;
    const alignAmt = smooth01(1 - align, 0.86, 1.0) * (1 - smooth01(progress, 0.46, 0.6));

    for (const mu of [this.stoneU, this.monoMirrorMat.uniforms]) {
      mu.uTime!.value = this.time;
      mu.uDecay!.value = decay;
      mu.uSeverity!.value = sev;
      mu.uCalm!.value = reduced ? 1 : 0;
      (mu.uHover!.value as THREE.Vector3).copy(this.hoverPoint);
      mu.uHoverAmt!.value = this.hoverAmt;
      (mu.uInner!.value as THREE.Vector3).copy(this.camera.position);
      mu.uInnerAmt!.value = inside * 0.35;
      if (mu.uSignal) mu.uSignal.value = signal;
      if (mu.uAlign) mu.uAlign.value = alignAmt;
      if (mu.uFogColor) (mu.uFogColor.value as THREE.Color).copy(fogColor);
      if (mu.uFogDensity) mu.uFogDensity.value = fogDensity;
    }
    this.markMat.uniforms.uTime!.value = this.world.tick / 60;
    this.moteMat.uniforms.uTime!.value = reduced ? 0 : this.time;
    this.moteMat.uniforms.uSeverity!.value = sev;
    this.moteMat.uniforms.uAmt!.value =
      1 - smooth01(progress, 0.45, 0.62) * (1 - smooth01(progress, 0.64, 0.72));
    const marks = this.world.marks;
    for (let m = 0; m < marks.length; m++) {
      const mk = marks[m]!;
      this.markPos[m * 3] = mk.x;
      this.markPos[m * 3 + 1] = mk.y;
      this.markPos[m * 3 + 2] = mk.z;
      this.markBorn[m] = mk.bornTick / 60;
    }
    this.markGeom.setDrawRange(0, marks.length);
    this.markGeom.attributes.position!.needsUpdate = true;
    this.markGeom.attributes.aBorn!.needsUpdate = true;

    // survey annotations track their anchors
    const v = new THREE.Vector3();
    for (const a of this.annos) {
      if (!a.el) continue;
      v.copy(a.point).project(this.camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      const phase = progress > a.from && progress < a.to;
      a.el.style.opacity = vis && phase && !reduced ? '1' : phase && vis ? '1' : '0';
      if (vis) {
        a.el.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px';
        a.el.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px';
      }
    }

    this.composer.render();
  }

  private readonly resize = (): void => {
    const pr = Math.min(window.devicePixelRatio, this.maxDpr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.markMat.uniforms.uScale!.value = window.innerHeight * pr * 0.8;
    if (this.moteMat) this.moteMat.uniforms.uScale!.value = window.innerHeight * pr * 0.8;
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}

/** tiny local PRNG for cosmetic scatter (not authoritative state) */
function mulberry32ish(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeHalo(color: string, scale: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.4, colorWithAlpha(color, 0.22));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.45
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(scale);
  return sprite;
}

function colorWithAlpha(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return (
    'rgba(' +
    Math.round(c.r * 255) +
    ',' +
    Math.round(c.g * 255) +
    ',' +
    Math.round(c.b * 255) +
    ',' +
    a +
    ')'
  );
}

function lerpColor(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

function smooth01(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
