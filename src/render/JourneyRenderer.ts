import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LatticeWorld, CELL, HALF, TOWER_TOP, SEA_Y } from '../world/LatticeWorld';
import { CameraPath } from './CameraPath';

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
float vMonoEng;
float monoHash(vec3 c) { return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`;

const FRAG_MAP = `#include <map_fragment>
{
  vec3 cell = floor(vMonoW / 1.5);
  float h = monoHash(cell);
  float heightT = clamp(vMonoW.y / 195.0, 0.0, 1.0);
  float cluster = 0.5 + 0.5 * sin(cell.x * 0.315 + cell.z * 0.255 + cell.y * 0.165 + h * 9.0);
  float th = clamp(0.2 + 0.78 * (1.0 - heightT) + 0.28 * (cluster - 0.5) + (h - 0.5) * 0.12, 0.06, 0.985);
  if (uDecay > th) discard;
  float dying = smoothstep(0.035, 0.0, th - uDecay);
  vec3 an = abs(normalize(vNormal));
  vec2 cuv;
  if (an.y > 0.6) cuv = fract(vMonoW.xz / 1.5);
  else if (an.x > an.z) cuv = fract(vMonoW.zy / 1.5);
  else cuv = fract(vMonoW.xy / 1.5);
  vec2 eUv = min(cuv, 1.0 - cuv);
  float edge = min(eUv.x, eUv.y);
  diffuseColor.rgb *= 0.8 + 0.2 * smoothstep(0.0, 0.09, edge);
  float eng = 0.0;
  vec2 pp = cuv;
  float amp = 1.0;
  for (int i = 0; i < 4; i++) {
    pp = fract(pp * 2.0 + h * 13.17 + float(i) * 0.31);
    vec2 dd = abs(pp - 0.5);
    float engFrame = smoothstep(0.5, 0.44, max(dd.x, dd.y)) * smoothstep(0.3, 0.36, max(dd.x, dd.y));
    float keep = step(0.45, fract(h * (7.0 + float(i) * 3.7) + float(i) * 0.37));
    eng = max(eng, engFrame * keep * amp);
    amp *= 0.72;
  }
  eng *= smoothstep(0.02, 0.09, edge);
  diffuseColor.rgb *= 1.0 - eng * 0.3;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.75, 1.05), uSeverity * 0.55);
  diffuseColor.rgb *= mix(0.55, 1.2, heightT * heightT);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.3, diffuseColor.rgb, smoothstep(0.0, 4.0, vMonoW.y));
  if (dying > 0.0) {
    float g = 0.72 + 0.22 * sin(uTime * (1.0 + h * 1.4) + h * 40.0);
    diffuseColor.rgb *= mix(1.0, mix(g, 0.8, uCalm), dying);
  }
  vMonoEng = eng;
}`;

const FRAG_EMISSIVE = `#include <emissivemap_fragment>
{
  float heightT = clamp(vMonoW.y / 195.0, 0.0, 1.0);
  vec3 crownCol = mix(vec3(1.0, 0.9, 0.72), vec3(0.8, 0.9, 1.0), uSeverity);
  totalEmissiveRadiance += crownCol * smoothstep(0.93, 1.0, heightT) * 1.1 * (1.0 - uSeverity * 0.5);
  float hd = distance(vMonoW, uHover);
  float camD = distance(cameraPosition, uHover);
  float sigma = clamp(camD * 0.16, 2.5, 15.0);
  float lampF = exp(-hd * hd / (2.0 * sigma * sigma)) * uHoverAmt;
  vec3 lampCol = mix(vec3(1.0, 0.85, 0.6), vec3(0.5, 0.78, 1.0), uSeverity);
  totalEmissiveRadiance += lampCol * lampF * (0.12 + vMonoEng * 0.55);
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
    // in its moment of failure, as debris in the air
    // scroll decay: past the threshold the cell detaches and falls.
    float over = max(0.0, uDecay - aThresh);
    // a live strike fells the cell regardless of scroll
    float sinceStrike = aStrike < 0.0 ? -1.0 : max(0.0, uTime - aStrike);
    float fallT = max(over * 10.0, sinceStrike > 0.0 ? sinceStrike * 0.9 : 0.0);
    vFall = fallT;
    vDying = smoothstep(0.035, 0.0, aThresh - uDecay) * step(uDecay, aThresh);

    // masonry: no two cells cut quite alike
    float sizeVar = 0.93 + 0.1 * fract(aSeed * 7.31);
    vec3 wp = position * sizeVar * clamp(1.0 - fallT * 0.45, 0.05, 1.0) + aOffset;
    if (fallT <= 0.0 || fallT > 2.4) wp = vec3(0.0, -9999.0, 0.0);
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
    // moonlit stone, not a lightbox: dark grey-blue mass whose holiness
    // is contrast, carried by the burning crown and the lit edges
    vec3 base = mix(vec3(0.42, 0.39, 0.345), vec3(0.46, 0.425, 0.365), vSeed * 0.5);
    base = mix(base, vec3(0.24, 0.3, 0.4), uSeverity * 0.75);
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
    vec3 base = mix(vec3(0.42, 0.39, 0.345), vec3(0.46, 0.425, 0.365), h * 0.5);
    base = mix(base, vec3(0.24, 0.3, 0.4), uSeverity * 0.75);
    vec3 col = base * (0.38 + 0.5 * diff) * mix(0.5, 1.15, heightT * heightT);
    vec3 crownCol = mix(vec3(1.0, 0.94, 0.8), vec3(0.85, 0.92, 1.0), uSeverity);
    col += crownCol * smoothstep(0.93, 1.0, heightT) * 1.5 * (1.0 - uSeverity * 0.5);

    // mortar courses on the dominant face
    vec3 an = abs(n);
    vec2 cuv;
    if (an.y > 0.6) cuv = fract(vWorld.xz / 1.5);
    else if (an.x > an.z) cuv = fract(vWorld.zy / 1.5);
    else cuv = fract(vWorld.xy / 1.5);
    vec2 eUv = min(cuv, 1.0 - cuv);
    float edge = min(eUv.x, eUv.y);
    col *= 0.78 + 0.22 * smoothstep(0.0, 0.09, edge);

    // the engravings, carved into the stone itself
    float eng = 0.0;
    vec2 pp = cuv;
    float amp = 1.0;
    for (int i = 0; i < 4; i++) {
      pp = fract(pp * 2.0 + h * 13.17 + float(i) * 0.31);
      vec2 dd = abs(pp - 0.5);
      float frame = smoothstep(0.5, 0.44, max(dd.x, dd.y)) * smoothstep(0.3, 0.36, max(dd.x, dd.y));
      float keep = step(0.45, fract(h * (7.0 + float(i) * 3.7) + float(i) * 0.37));
      eng = max(eng, frame * keep * amp);
      amp *= 0.72;
    }
    eng *= smoothstep(0.02, 0.09, edge);
    col *= 1.0 - eng * 0.24;

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
    gl_PointSize = clamp(uScale * 0.055 * (0.5 + aSeed) / dist, 0.75, 3.5);
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
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float fall = exp(-r2 * 12.0);
    vec3 warm = vec3(0.62, 0.5, 0.34);
    vec3 cold = vec3(0.3, 0.38, 0.5);
    outColor = vec4(mix(warm, cold, uSeverity) * fall * 0.4 * uAmt, 1.0);
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
    // the monument's standing light on the water, dying as it strips
    float r = length(vWorld.xz);
    float pool = exp(-r * 0.016);
    vec3 poolCol = mix(vec3(0.185, 0.155, 0.115), vec3(0.10, 0.12, 0.15), uSeverity);
    col += poolCol * pool * (1.0 - uDecay * 0.75) * (1.0 - uSeverity * 0.4)
        * (0.92 + 0.08 * sin(uTime * 0.3 + vWorld.x * 0.02 + vWorld.z * 0.013));
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
    float band = exp(-abs(d.y + 0.03) * 8.0);
    vec3 base = mix(vec3(0.006, 0.0045, 0.003), vec3(0.002, 0.003, 0.005), uSeverity);
    vec3 glow = mix(vec3(0.055, 0.038, 0.02), vec3(0.014, 0.02, 0.028), uSeverity);
    vec3 col = base + glow * band;
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
  }> = [
    { el: null, point: new THREE.Vector3(2, 191, 11), from: 0.05, to: 0.4 },
    { el: null, point: new THREE.Vector3(6, 141, 21), from: 0.26, to: 0.52 },
    { el: null, point: new THREE.Vector3(9, 100, 22), from: 0.36, to: 0.5 }
  ];
  private rimLight!: THREE.DirectionalLight;
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
    new THREE.Vector3(-HALF - 0.6, 0, -HALF - 0.6),
    new THREE.Vector3(HALF + 0.6, TOWER_TOP, HALF + 0.6)
  );
  private readonly raycaster = new THREE.Raycaster();
  private readonly hoverPoint = new THREE.Vector3(0, -999, 0);
  private pointerNdc: { x: number; y: number } | null = null;
  private hoverAmt = 0;

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
        uFogColor: { value: new THREE.Color('#0a1016') },
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

    // --- the true form: the dark frame inside ---
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e12,
      roughness: 0.55,
      metalness: 0.25
    });
    const frame = new THREE.Group();
    const colGeom = new THREE.BoxGeometry(1.15, TOWER_TOP, 1.15);
    for (const gx of [-15, -9, -3, 3, 9, 15]) {
      for (const gz of [-15, -9, -3, 3, 9, 15]) {
        if (Math.abs(gx) !== 15 && Math.abs(gz) !== 15) continue; // perimeter frame
        const c = new THREE.Mesh(colGeom, frameMat);
        c.position.set(gx, TOWER_TOP / 2, gz);
        frame.add(c);
      }
    }
    const beamGeomX = new THREE.BoxGeometry(33, 1.0, 1.0);
    const beamGeomZ = new THREE.BoxGeometry(1.0, 1.0, 33);
    for (let ly = 24; ly < TOWER_TOP; ly += 24) {
      for (const off of [-15, 15]) {
        const bx = new THREE.Mesh(beamGeomX, frameMat);
        bx.position.set(0, ly, off);
        frame.add(bx);
        const bz = new THREE.Mesh(beamGeomZ, frameMat);
        bz.position.set(off, ly, 0);
        frame.add(bz);
      }
    }
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

    // --- light for the standard materials ---
    const keyLight = new THREE.DirectionalLight(0xe8eef5, 1.0);
    keyLight.position.set(0.35, 0.8, 0.55);
    this.scene.add(keyLight);
    this.scene.add(new THREE.AmbientLight(0x1a2129, 1.1));

    // the traveller's light: alive only inside the wall, so the cavity
    // reads as darkness with structure rather than a void
    this.innerLight = new THREE.PointLight(0xbfd4e8, 0, 55, 1.6);
    this.scene.add(this.innerLight);

    // the rim of the true form: cold light from behind and above that
    // rises with severity, so the frame's edges survive the night
    this.rimLight = new THREE.DirectionalLight(0x7fa8d0, 0);
    this.rimLight.position.set(-0.25, 0.9, -0.6);
    this.scene.add(this.rimLight);

    // --- atmosphere ---
    this.halo = makeHalo('#c9a071', 240);
    this.halo.position.set(0, TOWER_TOP * 0.45, 0);
    this.scene.add(this.halo);
    this.crownHalo = makeHalo('#ecd0a0', 175);
    this.crownHalo.position.set(0, TOWER_TOP * 0.92, 0);
    this.scene.add(this.crownHalo);

    // --- the air: dust motes over the water, rising slowly ---
    {
      const N = 260;
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
          uAmt: { value: 1 }
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
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;

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
      uFogColor: { value: new THREE.Color('#0c0906') },
      uFogDensity: { value: 0.0022 }
    });
    // physically based stone, with the world's law injected into it
    this.stoneU = monoUniforms();
    const stone = new THREE.MeshStandardMaterial({
      color: 0xb9b2a4,
      roughness: 0.58,
      metalness: 0.03,
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
        const terrainMat = new THREE.MeshStandardMaterial({
          color: 0x181a1e,
          roughness: 0.96,
          metalness: 0.0
        });
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
    if (!reduced) {
      // the sea breathes under the viewpoint, barely
      this.camera.position.x += Math.sin(this.time * 0.09) * 0.16;
      this.camera.position.y += Math.sin(this.time * 0.06 + 2.0) * 0.11;
    }
    const sev = this.path.state.severity;
    const decay = 0.9 * smooth01(progress, 0.16, 0.98);
    const inside = smooth01(progress, 0.49, 0.53) * (1 - smooth01(progress, 0.65, 0.69));

    const fogDensity = 0.0022 + 0.0028 * smooth01(progress, 0.3, 0.7);
    const fogColor = lerpColor('#080603', '#020407', sev);
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
      cu.uInnerAmt!.value = inside * 0.55;
      cu.uFogDensity!.value = fogDensity;
      (cu.uFogColor!.value as THREE.Color).copy(fogColor);
    }

    this.skyMat.uniforms.uSeverity!.value = sev;
    this.seaMat.uniforms.uSeverity!.value = sev;
    this.seaMat.uniforms.uDecay!.value = decay;
    this.seaMat.uniforms.uTime!.value = reduced ? 0 : this.time;
    (this.seaMat.uniforms.uCam!.value as THREE.Vector3).copy(this.camera.position);

    // holiness dims as the monument strips, and never smears the lens
    const haloFade = smooth01(this.camera.position.distanceTo(this.halo.position), 40, 95);
    const crownFade = smooth01(this.camera.position.distanceTo(this.crownHalo.position), 40, 95);
    const breath = reduced ? 1 : 0.93 + 0.07 * Math.sin(this.time * 0.22);
    this.halo.material.opacity = 0.45 * (1 - decay * 0.85) * haloFade * breath;
    this.crownHalo.material.opacity = 0.5 * (1 - decay) * crownFade * (2 - breath) * 0.5;

    // the traveller's light burns only inside the wall
    this.innerLight.intensity = 90 * inside;
    this.innerLight.position.copy(this.camera.position);
    this.rimLight.intensity = 2.4 * smooth01(sev, 0.6, 0.9);

    // the fallen accumulate
    this.scree.count = Math.floor(this.screeTotal * Math.min(1, decay * 1.15));

    if (this.world.strikesDirty) {
      this.strikeAttr.needsUpdate = true;
      this.world.strikesDirty = false;
    }

    for (const mu of [this.stoneU, this.monoMirrorMat.uniforms]) {
      mu.uTime!.value = this.time;
      mu.uDecay!.value = decay;
      mu.uSeverity!.value = sev;
      mu.uCalm!.value = reduced ? 1 : 0;
      (mu.uHover!.value as THREE.Vector3).copy(this.hoverPoint);
      mu.uHoverAmt!.value = this.hoverAmt;
      (mu.uInner!.value as THREE.Vector3).copy(this.camera.position);
      mu.uInnerAmt!.value = inside * 0.55;
      if (mu.uFogColor) (mu.uFogColor.value as THREE.Color).copy(fogColor);
      if (mu.uFogDensity) mu.uFogDensity.value = fogDensity;
    }
    this.markMat.uniforms.uTime!.value = this.world.tick / 60;
    this.moteMat.uniforms.uTime!.value = reduced ? 0 : this.time;
    this.moteMat.uniforms.uSeverity!.value = sev;
    this.moteMat.uniforms.uAmt!.value = 1 - smooth01(progress, 0.45, 0.62) * (1 - smooth01(progress, 0.64, 0.72));
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
