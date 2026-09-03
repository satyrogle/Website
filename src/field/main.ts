/**
 * THE FIELD, Beat 1: the room. Built directly, not from a picture.
 *
 * Nine image batches on 2026-09-02 failed nine different ways, because a
 * generator cannot see our world, our light law or the entrance's
 * vocabulary. Jacob asked whether the reference was needed at all. It is
 * not. This is the frame built in the medium that has to ship it, with
 * every decision on a slider so he judges it live instead of through my
 * description of it. Whatever he approves here is reachable by
 * construction, which is the check THE GRAIN never had.
 *
 * What is in the frame, from docs/THE_FIELD.md Beat 1 and his corrections:
 *   - camera at the mouth of a passage; two sheer black slabs frame the
 *     edges (the entrance's material, not rock)
 *   - a field of tall stalks, above head height, seeded, clumped, with
 *     real voids; screen-space density held roughly even with distance
 *   - backlight from ahead: tips gold, roots dark, ground near black
 *   - light pooled in a few world-space areas; everything else dim amber
 *   - the far field dissolves into a pale gold void with no horizon line,
 *     black above
 *   - optional descending light: narrow and bright high up, wide and
 *     faint at the field, and it can be turned to zero
 *
 * Seeded with the project's own mulberry32: same seed, same field. Wind
 * is visual state driven by the clock and claims nothing.
 */
import {
  AdditiveBlending,
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { mulberry32 } from '../core/rng';
import { buildPanel, type Group as PanelGroup } from '../grain/panel';

/* ------------------------------------------------------------------ */
/* parameters, all on sliders                                          */
/* ------------------------------------------------------------------ */

const P: Record<string, number> = {
  // LAYOUT IS JACOB'S, AND THESE ARE HIS NUMBERS. Camera, lens, the wedge and
  // the column are exactly as he left the panel on 2026-09-03. Nothing below
  // the "mine" line may move them.
  camY: 2.3, targetY: 1.6, targetZ: 10, fov: 27,
  vPoint: 0, vBase: 1.5, vFlare: 63, vFeather: 5, vWobble: 0, vDark: 0,
  colGain: 40, colWidth: 10.5, colCentre: 49.6, colReach: 70,
  seed: 490, spreadX: 210,

  // ---- mine: material, air and light ----------------------------------
  exposure: 62, fogDensity: 22, voidLift: 26, ambient: 11, litThrough: 105,
  rim: 22, rootDark: 74, poolGain: 55, goldWarmth: 84, paleMix: 14,
  headSize: 76, headGlow: 300, earCut: 40, earPaint: 100,
  sunElev: 22, sunSide: -29, bloom: 8, bloomThreshold: 23, bloomRadius: 46,
  // the air, and the light it is holding at the far edge
  airGlow: 18, horizon: 14, horizonHeight: 430, nearDark: 32,
  skyPaint: 62, strokeScale: 52, skyLane: 9,
  // painted: jewel understory, stepped light, ink on the big forms only
  underGain: 34, underViolet: 26, skyLight: 92, canopy: 18, cel: 0, celBands: 5, ink: 0, inkRadius: 3.0, inkEdge: 11,
  // WHERE THE FIELD ENDS. Not at the horizon: a flat field run to the
  // horizon has its whole fade squeezed into two pixels, which is the
  // scissor cut. Ending nearer leaves real screen height for it to die in.
  fieldEnd: 66, fieldFade: 26,
  count: 88, depth: 150, near: 4.0, hMin: 100, hSpan: 72, tallPct: 0,
  thick: 16, voidLevel: 6, clumpScale: 18, nearThin: 118, swell: 95, stems: 0,
  openNear: 0, openFar: 4, clearDepth: 60,
  skyGlow: 7,
  motes: 27, lift: 4, grain: 2, colShafts: 4, colLean: 9, shaftPaint: 48, shaftSlab: 85,
  wind: 17, windSpeed: 20,
  passHalf: 4.25, passZ: 4.6, passAngle: 29, passOn: 0, apexY: 10.7,
  beam: 35, beamSpread: 200, beamHeight: 135
};

const GROUPS: PanelGroup[] = [
  { title: 'camera', fields: [
    { key: 'camY', label: 'eye height m', min: 0.4, max: 4, step: 0.05 },
    { key: 'targetY', label: 'look at height m', min: -4, max: 12, step: 0.1 },
    { key: 'targetZ', label: 'look at distance m', min: 10, max: 260, step: 1 },
    { key: 'fov', label: 'fov', min: 20, max: 70, step: 1 }
  ] },
  { title: 'light', fields: [
    { key: 'exposure', label: 'exposure %', min: 20, max: 300, step: 1 },
    { key: 'sunElev', label: 'sun height deg', min: 0, max: 80, step: 1 },
    { key: 'sunSide', label: 'sun off-axis deg', min: -60, max: 60, step: 1 },
    { key: 'litThrough', label: 'lit through', min: 0, max: 500, step: 5 },
    { key: 'rim', label: 'rim', min: 0, max: 300, step: 5 },
    { key: 'ambient', label: 'dark field level', min: 0, max: 100, step: 1 },
    { key: 'rootDark', label: 'root darkness', min: 0, max: 100, step: 1 },
    { key: 'nearDark', label: 'near field falls away', min: 0, max: 100, step: 1 },
    { key: 'headSize', label: 'ear size cm', min: 8, max: 60, step: 1 },
    { key: 'headGlow', label: 'ear glow', min: 0, max: 400, step: 5 },
    { key: 'earCut', label: 'ear solidity', min: 10, max: 95, step: 1 },
    { key: 'earPaint', label: 'ear keeps its own paint', min: 0, max: 100, step: 1 },
    { key: 'poolGain', label: 'pool glow', min: 0, max: 400, step: 5 },
    { key: 'fogDensity', label: 'haze', min: 0, max: 120, step: 1 },
    { key: 'voidLift', label: 'haze brightness', min: 0, max: 200, step: 1 },
    { key: 'airGlow', label: 'lit air', min: 0, max: 200, step: 1 },
    { key: 'horizon', label: 'far edge glow', min: 0, max: 200, step: 1 },
    { key: 'horizonHeight', label: 'sky paint height m', min: 2, max: 600, step: 2 },
    { key: 'skyPaint', label: 'painted sky', min: 0, max: 200, step: 1 },
    { key: 'strokeScale', label: 'stroke size %', min: 20, max: 300, step: 2 },
    { key: 'skyLane', label: 'dark lane width %', min: 0, max: 60, step: 1 },
    { key: 'goldWarmth', label: 'gold warmth', min: 0, max: 100, step: 1 },
    { key: 'paleMix', label: 'pale straw share', min: 0, max: 100, step: 1 },
    { key: 'bloom', label: 'bloom', min: 0, max: 150, step: 1 },
    { key: 'bloomThreshold', label: 'bloom threshold', min: 0, max: 100, step: 1 },
    { key: 'bloomRadius', label: 'bloom radius', min: 0, max: 100, step: 1 }
  ] },
  { title: 'painted', fields: [
    { key: 'underGain', label: 'jewel understory', min: 0, max: 100, step: 1 },
    { key: 'underViolet', label: 'indigo to violet', min: 0, max: 100, step: 1 },
    { key: 'skyLight', label: 'skylight is blue', min: 0, max: 100, step: 1 },
    { key: 'canopy', label: 'sheltered ears go dark', min: 0, max: 100, step: 1 },
    { key: 'cel', label: 'stepped light', min: 0, max: 100, step: 1 },
    { key: 'celBands', label: 'steps', min: 2, max: 10, step: 1 },
    { key: 'ink', label: 'ink', min: 0, max: 100, step: 1 },
    { key: 'inkRadius', label: 'ink width px', min: 1, max: 10, step: 0.2 },
    { key: 'inkEdge', label: 'ink threshold', min: 2, max: 100, step: 1 }
  ] },
  { title: 'field (rebuilds)', fields: [
    { key: 'seed', label: 'seed', min: 1, max: 999, step: 1, heavy: true },
    { key: 'count', label: 'stalks x1000', min: 5, max: 200, step: 1, heavy: true },
    { key: 'depth', label: 'depth m', min: 40, max: 400, step: 5, heavy: true },
    { key: 'near', label: 'nearest m', min: 0.3, max: 6, step: 0.1, heavy: true },
    { key: 'hMin', label: 'height min cm', min: 60, max: 400, step: 5, heavy: true },
    { key: 'hSpan', label: 'height span cm', min: 0, max: 300, step: 5, heavy: true },
    { key: 'tallPct', label: 'towering %', min: 0, max: 60, step: 1, heavy: true },
    { key: 'thick', label: 'blade width mm', min: 5, max: 120, step: 1, heavy: true },
    { key: 'stems', label: 'stems visible', min: 0, max: 100, step: 1 },
    { key: 'voidLevel', label: 'voids', min: 0, max: 80, step: 1, heavy: true },
    { key: 'clumpScale', label: 'clump size m', min: 2, max: 40, step: 1, heavy: true },
    { key: 'swell', label: 'ground swell cm', min: 0, max: 400, step: 5, heavy: true },
    { key: 'spreadX', label: 'width %', min: 60, max: 300, step: 5, heavy: true },
    { key: 'nearThin', label: 'near thinning', min: 30, max: 130, step: 1, heavy: true },
    { key: 'openNear', label: 'opening at feet %', min: 0, max: 60, step: 1, heavy: true },
    { key: 'openFar', label: 'opening ahead %', min: 0, max: 100, step: 1, heavy: true },
    { key: 'clearDepth', label: 'opens over m', min: 5, max: 200, step: 1, heavy: true }
  ] },
  { title: 'field edge', fields: [
    { key: 'fieldEnd', label: 'field ends at m', min: 20, max: 400, step: 1 },
    { key: 'fieldFade', label: 'end fade m', min: 1, max: 150, step: 1 }
  ] },
  { title: 'the column of light and grade', fields: [
    { key: 'colGain', label: 'column brightness', min: 0, max: 300, step: 1 },
    { key: 'colWidth', label: 'column width %', min: 2, max: 60, step: 0.5 },
    { key: 'colShafts', label: 'shafts', min: 1, max: 7, step: 1 },
    { key: 'colLean', label: 'shaft lean %', min: 0, max: 40, step: 1 },
    { key: 'shaftPaint', label: 'shaft is painted', min: 0, max: 100, step: 1 },
    { key: 'shaftSlab', label: 'shaft slab size %', min: 20, max: 300, step: 5 },
    { key: 'colCentre', label: 'column centre %', min: 30, max: 70, step: 0.1 },
    { key: 'colReach', label: 'column reaches down to %', min: 10, max: 100, step: 1 },
    { key: 'motes', label: 'motes', min: 0, max: 200, step: 1 },
    { key: 'lift', label: 'black lift', min: 0, max: 20, step: 0.5 },
    { key: 'grain', label: 'grain', min: 0, max: 15, step: 0.5 }
  ] },
  { title: 'the cone of darkness', fields: [
    { key: 'vPoint', label: 'point height % of frame', min: 0, max: 60, step: 1 },
    { key: 'vBase', label: 'width at feet %', min: 0, max: 10, step: 0.1 },
    { key: 'vFlare', label: 'flare', min: 0, max: 200, step: 1 },
    { key: 'vFeather', label: 'edge scatter', min: 0, max: 30, step: 0.5 },
    { key: 'vWobble', label: 'edge wander', min: 0, max: 12, step: 0.5 },
    { key: 'vDark', label: 'light inside', min: 0, max: 40, step: 0.5 },
    { key: 'skyGlow', label: 'sky glow', min: 0, max: 200, step: 1 }
  ] },
  { title: 'wind', fields: [
    { key: 'wind', label: 'strength', min: 0, max: 100, step: 1 },
    { key: 'windSpeed', label: 'speed', min: 0, max: 200, step: 1 }
  ] },
  { title: 'passage', fields: [
    { key: 'passOn', label: 'on', min: 0, max: 1, step: 1 },
    { key: 'passHalf', label: 'half width m', min: 0.4, max: 6, step: 0.05 },
    { key: 'passZ', label: 'distance m', min: 0.5, max: 12, step: 0.1 },
    { key: 'passAngle', label: 'splay deg', min: -30, max: 45, step: 1 },
    { key: 'apexY', label: 'walls meet at m', min: 1, max: 30, step: 0.1 }
  ] },
  { title: 'descending light', fields: [
    { key: 'beam', label: 'intensity', min: 0, max: 100, step: 1 },
    { key: 'beamSpread', label: 'spread %', min: 40, max: 400, step: 5 },
    { key: 'beamHeight', label: 'height m', min: 20, max: 300, step: 5 }
  ] }
];

/* ------------------------------------------------------------------ */
/* renderer                                                            */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('field') as HTMLCanvasElement;
const status = document.getElementById('status') as HTMLElement;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
renderer.setClearColor(0x020304, 1);

const scene = new Scene();
const camera = new PerspectiveCamera(42, 1, 0.1, 2000);

const GOLD = new Color();
const PALE = new Color();
const DARK = new Color();
const VOID = new Color();
const HAZE = new Color();
const UNDER = new Color();
const SKYLIGHT = new Color();

function palette(): void {
  const w = P.goldWarmth! / 100;
  GOLD.setRGB(1.0, 0.72 + 0.12 * (1 - w), 0.30 + 0.25 * (1 - w));
  PALE.setRGB(1.0, 0.94, 0.74);
  DARK.setRGB(0.045, 0.026, 0.010);
  // the air dies into deep amber-black, never grey
  VOID.setRGB(0.16, 0.085, 0.028).multiplyScalar(P.voidLift! / 100);
  // THE AIR IS HOLDING THE SUN. Deep air over a lit field is not an absence;
  // it is the brightest thing in the picture at the far edge, which is what
  // stops the field ending on a cut line.
  HAZE.setRGB(1.0, 0.80, 0.50).multiplyScalar(P.airGlow! / 100);
  // crimson at the canopy's edge, violet deep down
  // an absorption, not a paint: it takes the red out of the shadow and leaves
  // indigo, and lets that go violet on the slider. Gold reads as gold because
  // of what is next to it.
  UNDER.setRGB(0.26, 0.46, 1.0).lerp(new Color(0.62, 0.34, 1.0), P.underViolet! / 100);
  SKYLIGHT.setRGB(0.16, 0.30, 1.0).lerp(new Color(1, 1, 1), 1 - P.skyLight! / 100);
}

/* ------------------------------------------------------------------ */
/* light pools: a few world-space areas that carry the light           */
/* ------------------------------------------------------------------ */

const POOL_MAX = 4;
const pools: Vector4[] = [];
for (let i = 0; i < POOL_MAX; i++) pools.push(new Vector4(0, 0, 1, 0));

function placePools(rng: () => number, depth: number): void {
  const n = 2 + Math.floor(rng() * 2);
  // THE LIGHT COMES DOWN THE COLUMN, SO IT LANDS UNDER IT. One large pool on
  // the axis in the middle distance, where the wedge opens: the field is
  // brightest where the light arrives and falls away to either side, instead
  // of being lit evenly edge to edge by nothing in particular.
  pools[0]!.set(0, -Math.max(18, depth * 0.24), Math.max(16, depth * 0.2), 0.72);
  for (let i = 1; i < POOL_MAX; i++) {
    if (i < n + 1) {
      const z = -(8 + rng() * depth * 0.45);
      const half = -z * Math.tan((P.fov! * Math.PI) / 360) * 1.1;
      pools[i]!.set((rng() * 2 - 1) * half, z, 6 + rng() * 16, 0.7 + rng() * 0.5);
    } else {
      pools[i]!.set(0, 0, 1, 0);
    }
  }
}

/* ------------------------------------------------------------------ */
/* the stalks                                                          */
/* ------------------------------------------------------------------ */

const stalkVert = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iAttr;   // height, lean, phase, half width
  attribute float iTone;
  attribute float iHue;
  uniform float uTime, uWind, uWindSpeed;
  uniform vec3 uCanopy;   // shelter, height floor, height span
  uniform float uSunPhase;
  uniform vec3 uCamPos;
  uniform float uPixelWorld, uProcHead;
  uniform vec4 uPools[4];
  varying float vH, vGlow, vDist, vTone, vHead, vX, vHue, vGlint, vJitter, vTall, vFace;
  varying vec2 vBaseUv;
  varying vec3 vN, vV, vWorld;

  void main() {
    float h = iAttr.x, lean = iAttr.y, phase = iAttr.z, halfW = iAttr.w;
    float t = position.y;

    // a thin stem, then a heavier head that droops. The head's serrated
    // silhouette is cut in the fragment shader.
    float headT = clamp((t - 0.84) / 0.16, 0.0, 1.0);
    float stemW = halfW * (1.0 - 0.35 * t);
    float headW = halfW * 3.2 * sin(headT * 3.14159) * (0.75 + 0.25 * sin(phase * 7.0));
    float w = mix(stemW, mix(stemW, headW, uProcHead), step(0.84, t));

    // the blade faces the camera around y, so a thin strip never vanishes
    vec3 toCam = uCamPos - iPos;
    // and never thinner than about a pixel: a sub-pixel blade in wind is a
    // flicker, and eighty thousand of them are a headache
    w = max(w, uPixelWorld * length(toCam) * 0.55);
    vec3 right = normalize(vec3(-toCam.z, 0.0, toCam.x));

    // wind: a slow travelling gust plus a faster flutter, bending the tip most
    float gust = sin(uTime * uWindSpeed * 0.55 + iPos.z * 0.05 + phase) * 0.65
               + sin(uTime * uWindSpeed * 1.7 + phase * 3.3 + iPos.x * 0.21) * 0.35;
    vec2 leanDir = vec2(cos(phase * 5.1), sin(phase * 5.1));
    float curve = t * t + 0.12 * sin(t * 3.0 + phase) * t;
    vec2 bend = (leanDir * lean + vec2(1.0, 0.35) * gust * uWind) * h * curve * (1.0 + 0.6 * headT);

    vec3 world = iPos + right * (position.x * w) + vec3(bend.x, t * h, bend.y);
    vWorld = world;

    // A BLADE HAS A CROSS-SECTION. The normal rolls from one edge to the
    // other, so light lands differently across its width and the strip
    // stops reading as paper.
    vec3 faceN = normalize(vec3(toCam.x, 0.0, toCam.z));
    vN = normalize(faceN * 0.7 + right * position.x * 1.3 + vec3(0.0, 0.25 + 0.3 * headT, 0.0));
    vV = normalize(uCamPos - world);

    vGlow = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 p = uPools[i];
      vec2 d = (iPos.xz - p.xy) / max(p.z, 0.01);
      vGlow += p.w * exp(-dot(d, d));
    }
    vH = t;
    vHead = headT;
    vX = position.x * 2.0;
    vTone = iTone;
    vHue = iHue;
    vTall = clamp((h - uCanopy.y) / max(uCanopy.z, 1e-3), 0.0, 1.0);
    vFace = 0.42 + 0.72 * pow(max(0.0, cos(phase - uSunPhase) * 0.5 + 0.5), 2.2);
    vGlint = pow(max(0.0, sin(phase * 13.0 + uTime * 0.6 + iPos.x * 0.5)), 48.0) * 0.5;
    // where this stalk's FOOT lands on the screen, and a die roll of its own,
    // so the cone's edge is decided one whole stalk at a time
    vec4 bc = projectionMatrix * modelViewMatrix * vec4(iPos, 1.0);
    vBaseUv = bc.xy / max(bc.w, 1e-4) * 0.5 + 0.5;
    vJitter = fract(phase * 7.31 + iTone * 3.7);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

// THE CONE OF DARKNESS IS A SHAPE IN THE FRAME. A wedge on the ground can
// never read as a V: perspective squashes everything past fifteen metres
// into a thin band at the horizon, so it comes out as a slit with parallel
// edges however fast it opens. The camera is fixed for this beat, so the
// shape is a decision about the picture, made in screen space, with a
// small feather so the edge is an edge and not a saw.
const coneGlsl = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uVPoint, uVBase, uVFlare, uVFeather, uVWobble, uVDark;
  // signed distance of a screen position from the cone's edge: negative
  // inside. The arms wander with two slow waves, so nothing is ruled.
  float coneDist(vec2 suv) {
    float rise = (suv.y - uVPoint) / max(1.0 - uVPoint, 1e-3);
    float wander = uVWobble * (sin(suv.y * 5.7 + 1.3) * 0.6 + sin(suv.y * 13.1 + 0.4) * 0.4) * rise;
    // measured off the frame: a slender wedge that flares as the square
    float hw = uVBase + uVFlare * rise * rise + wander;
    return abs(suv.x - 0.5) - hw;
  }
  // HOW MUCH AIR IS IN THE WAY. Slightly super-linear, so the near field
  // stays clear and the far field genuinely dissolves. The squared law it
  // replaced did almost nothing until past the last stalk.
  uniform float uFogK;
  float airDepth(float d) {
    return 1.0 - exp(-pow(max(uFogK * d, 0.0), 1.35));
  }
  // WHERE THE FIELD ENDS, IN PLAN. A distance alone projects as a ruled
  // line, which is the scissor cut. The end wanders in depth with the
  // world's x, so the top edge of the picture has a profile instead.
  float fieldEndAt(vec3 w, float endDist) {
    float m = sin(w.x * 0.021 + 1.7) * 0.6 + sin(w.x * 0.0074 - 0.9) * 0.4;
    return endDist * (1.0 + 0.26 * m);
  }
  // the ground: a plain soft fall-off, it is barely seen
  float coneLight(vec3 w) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    if (suv.y <= uVPoint) return 1.0;
    return mix(uVDark, 1.0, smoothstep(-uVFeather, uVFeather * 0.35, coneDist(suv)));
  }
`;

const stalkFrag = /* glsl */ `
  ${coneGlsl}
  uniform vec3 uDark, uGold, uPale, uVoid, uSun, uLightDir, uHaze, uUnder, uSkyLight, uCanopy;
  uniform float uFog, uAmbient, uTransGain, uRimGain, uPoolGain, uDepth, uRootDark, uFieldEnd, uFieldFade, uProcHead, uNearDark, uStemGain;
  uniform float uUnderGain;
  varying float vH, vGlow, vDist, vTone, vHead, vX, vHue, vGlint, vJitter, vTall, vFace;
  varying vec2 vBaseUv;
  varying vec3 vN, vV, vWorld;

  // THE EDGE OF THE DARKNESS IS MADE OF STALKS. Each stalk is judged where
  // its foot stands, with its own threshold inside a band, and the light
  // reaches its head before its root. A straight pixel gradient reads as
  // scissors; this reads as a shadow lying across a field.
  float coneLightStalk() {
    vec2 suv = gl_FragCoord.xy / uResolution;
    if (suv.y <= uVPoint) return 1.0;
    // the wedge is judged where the pixel is; each stalk nudges the edge by
    // its own die roll, and its head clears the dark before its root does,
    // so the boundary is ragged with whole heads rather than ruled
    float d = coneDist(suv);
    float band = max(uVFeather, 1e-3);
    float roll = (vJitter - 0.5) * band * 0.7;
    float lift = vH * band * 0.15;
    return mix(uVDark, 1.0, smoothstep(-band * 0.25, band * 0.25, d + roll + lift));
  }

  void main() {
    // THE HEAD HAS A SILHOUETTE. Grains alternate along it, so its edge is
    // serrated rather than a widened strip. This is what makes it paddy.
    if (uProcHead > 0.5 && vHead > 0.0) {
      float grain = 0.5 + 0.5 * abs(sin(vHead * 26.0 + vX * 1.5));
      if (abs(vX) > grain) discard;
    }
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    vec3 l = normalize(uLightDir);   // the direction the light travels

    // two golds per stalk, and the root sinks into the ground
    vec3 albedo = mix(uGold, uPale, vHue) * vTone;
    float root = mix(uRootDark, 1.0, smoothstep(0.04, 0.82, vH));
    // everything under the canopy takes the jewel colour rather than mud

    // THE HOLY PART. One low sun behind the field: every blade is lit
    // through toward the eye. Thin edges and the head transmit most.
    float trans = pow(max(0.0, dot(v, l)), 2.0) * (0.55 + 0.45 * vX * vX) * (0.6 + 1.0 * vHead);
    float diff = max(0.0, dot(n, -l)) * 0.35 + max(0.0, n.y) * 0.2;
    float rim = pow(1.0 - abs(dot(n, v)), 3.0) * 0.3;
    float pool = uPoolGain * min(vGlow, 1.4);

    // PAINTED LIGHT HAS STEPS. The light is quantised into a few levels with
    // hard terminators, mixed against the smooth version so it can be dialled
    // from photographic to fully painted.
    float key = uAmbient + diff * 0.6 + pool * 0.5;
    float lit = trans * uTransGain + rim * uRimGain;
    // SHADOW IS A COLOUR. Everything the light missed goes crimson into violet
    // rather than into mud. Keyed on how little light a fragment received, not
    // on its height: keyed on height it lands under the canopy, unseen.
    float shade = uUnderGain * (1.0 - smoothstep(0.02, 0.42, key + lit));
    albedo *= mix(vec3(1.0), uUnder, shade);
    // the sky's own light, filling everything the sun does not reach
    float shelter = mix(uCanopy.x, 1.0, vTall * vTall);
    vec3 c = uSkyLight * uAmbient * 3.2 * root * (0.45 + 0.55 * vTone) * (1.0 - 0.88 * vFace)
           * mix(0.10, 1.0, vTall * vTall) * smoothstep(0.25, 0.95, vH);
    c += albedo * (diff * 0.6 + pool * 0.5) * root * shelter;
    c += uSun * albedo * lit * root * (1.0 + pool) * shelter * vFace;
    c += uPale * vGlint * vHead * 0.9;

    // AIR. Near air dies into amber-black; deep air has scattered so much
    // sun that it turns luminous, so distance reads as depth and not as loss.
    float f = airDepth(vDist);
    vec3 air = mix(uVoid, uHaze, smoothstep(0.55, 1.0, f));
    c = mix(c, air, f);
    // THE FIELD ENDS IN LIGHT, NOT ON A CUT. Past the end the stalks are
    // gone and only the air they stood in is left, dimming with distance.
    c *= mix(uNearDark, 1.0, smoothstep(1.5, 26.0, vDist)) * uStemGain;
    float endAt = fieldEndAt(vWorld, uFieldEnd);
    float endFade = 1.0 - smoothstep(endAt - uFieldFade, endAt + uFieldFade, vDist);
    float tail = exp(-max(0.0, vDist - endAt) / max(uFieldFade * 0.55, 1.0));
    c = mix(air * 0.07 * tail, c, endFade);
    c *= coneLightStalk();
    gl_FragColor = vec4(c, 1.0);
  }
`;

const stalkUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.35 },
  uWindSpeed: { value: 0.6 },
  uCamPos: { value: new Vector3() },
  uPools: { value: pools },
  uPixelWorld: { value: 0.001 },
  uProcHead: { value: 1 },
  uDark: { value: DARK },
  uGold: { value: GOLD },
  uPale: { value: PALE },
  uVoid: { value: VOID },
  uHaze: { value: HAZE },
  uSun: { value: new Color(1.0, 0.86, 0.6) },
  uLightDir: { value: new Vector3(0.15, -0.3, 1.0).normalize() },
  uFog: { value: 0.003 },
  uFogK: { value: 0.0088 },
  uAmbient: { value: 0.12 },
  uTransGain: { value: 1.8 },
  uRimGain: { value: 0.9 },
  uRootDark: { value: 0.08 },
  uPoolGain: { value: 0.6 },
  uNearDark: { value: 0.35 },
  uStemGain: { value: 1 },
  uUnder: { value: UNDER },
  uSkyLight: { value: SKYLIGHT },
  uCanopy: { value: new Vector3(0.25, 1.0, 0.72) },
  uSunPhase: { value: 0 },
  uGoldC: { value: GOLD },
  uPaleC: { value: PALE },
  uUnderGain: { value: 0.55 },
  uDepth: { value: 220 },
  uResolution: { value: new Vector2(1, 1) },
  uVPoint: { value: 0 },
  uVBase: { value: 0.011 },
  uVFlare: { value: 0.45 },
  uFieldEnd: { value: 130 },
  uFieldFade: { value: 45 },
  uVFeather: { value: 0.1 },
  uVWobble: { value: 0.03 },
  uVDark: { value: 0 }
};

const stalkMat = new ShaderMaterial({
  vertexShader: stalkVert,
  fragmentShader: stalkFrag,
  uniforms: stalkUniforms,
  side: DoubleSide
});

// THE EARS. Every stalk hangs a real ear from its tip: a quad, billboarded
// around y like the stem, tilted along the stem's own curve so it droops with
// it, textured from an atlas of eleven photographic ears cut against black
// (tools/wheat-atlas.py). Alpha-tested, so it needs no sorting and the awns
// keep their hair width. This is the material the frame was missing.
const headVert = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iAttr;
  attribute float iTone;
  attribute float iHue;
  uniform float uTime, uWind, uWindSpeed, uHeadSize;
  uniform vec3 uCanopy;
  uniform float uSunPhase;
  uniform vec3 uCamPos;
  uniform vec4 uPools[4];
  varying vec2 vUv;
  varying float vGlow, vDist, vTone, vHue, vJitter, vH, vTall, vFace;
  varying vec3 vN, vV, vWorld;

  vec3 stemPoint(float t, float h, float lean, float phase, vec2 leanDir, float gust) {
    float curve = t * t + 0.12 * sin(t * 3.0 + phase) * t;
    float headT = clamp((t - 0.84) / 0.16, 0.0, 1.0);
    vec2 bend = (leanDir * lean + vec2(1.0, 0.35) * gust * uWind) * h * curve * (1.0 + 0.6 * headT);
    return iPos + vec3(bend.x, t * h, bend.y);
  }

  void main() {
    float h = iAttr.x, lean = iAttr.y, phase = iAttr.z;
    vec3 toCam = uCamPos - iPos;
    vec3 right = normalize(vec3(-toCam.z, 0.0, toCam.x));
    float gust = sin(uTime * uWindSpeed * 0.55 + iPos.z * 0.05 + phase) * 0.65
               + sin(uTime * uWindSpeed * 1.7 + phase * 3.3 + iPos.x * 0.21) * 0.35;
    vec2 leanDir = vec2(cos(phase * 5.1), sin(phase * 5.1));
    vec3 base = stemPoint(0.84, h, lean, phase, leanDir, gust);
    vec3 tip = stemPoint(1.0, h, lean, phase, leanDir, gust);
    vec3 up = normalize(tip - base);
    float size = uHeadSize * (0.8 + 0.4 * fract(iHue * 13.7 + iTone * 5.3));
    // the quad is 1 wide by 2 tall in atlas terms; base at the stem's 0.84 point
    vec3 world = base + right * (position.x * size * 0.5) + up * (position.y * size);
    vWorld = world;

    // which ear: one of eleven, chosen per stalk and never changing
    float cell = floor(fract(iTone * 7.13 + iHue * 3.71) * 11.0);
    float col = mod(cell, 4.0);
    float row = floor(cell / 4.0);
    vUv = vec2((col + position.x + 0.5) / 4.0, 1.0 - (row + 1.0 - position.y) / 3.0);

    vec3 faceN = normalize(vec3(toCam.x, 0.0, toCam.z));
    vN = normalize(faceN * 0.8 + right * position.x * 0.8 + vec3(0.0, 0.35, 0.0));
    vV = normalize(uCamPos - world);
    vGlow = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 p = uPools[i];
      vec2 d = (iPos.xz - p.xy) / max(p.z, 0.01);
      vGlow += p.w * exp(-dot(d, d));
    }
    vTone = iTone;
    vHue = iHue;
    vTall = clamp((h - uCanopy.y) / max(uCanopy.z, 1e-3), 0.0, 1.0);
    vFace = 0.42 + 0.72 * pow(max(0.0, cos(phase - uSunPhase) * 0.5 + 0.5), 2.2);
    vJitter = fract(phase * 7.31 + iTone * 3.7);
    vH = 1.0;
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const headFrag = /* glsl */ `
  ${coneGlsl}
  uniform sampler2D uAtlas;
  uniform vec3 uSun, uLightDir, uVoid, uHaze, uUnder, uSkyLight, uGoldC, uPaleC, uCanopy;
  uniform float uUnderGain;
  uniform float uFog, uAmbient, uTransGain, uRimGain, uPoolGain, uFieldEnd, uFieldFade, uHeadGain, uNearDark, uEarCut, uEarPaint;
  varying vec2 vUv;
  varying float vGlow, vDist, vTone, vHue, vJitter, vH, vTall, vFace;
  varying vec3 vN, vV, vWorld;

  float coneLightHead() {
    vec2 suv = gl_FragCoord.xy / uResolution;
    if (suv.y <= uVPoint) return 1.0;
    float d = coneDist(suv);
    float band = max(uVFeather, 1e-3);
    float roll = (vJitter - 0.5) * band * 0.7;
    return mix(uVDark, 1.0, smoothstep(-band * 0.25, band * 0.25, d + roll + band * 0.15));
  }

  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    if (tex.a < uEarCut) discard;
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    vec3 l = normalize(uLightDir);
    // the ear is the brightest thing in the field: lit through toward the eye
    float trans = pow(max(0.0, dot(v, l)), 2.0);
    float rim = pow(1.0 - abs(dot(n, v)), 3.0);
    float pool = uPoolGain * min(vGlow, 1.4);
    float texV = dot(tex.rgb, vec3(0.33));
    vec3 painted = tex.rgb * (1.15 + 0.4 * vTone);
    vec3 recol = mix(uGoldC, uPaleC, vHue * 0.6) * (0.22 + 1.15 * texV) * (0.85 + 0.3 * vTone);
    vec3 albedo = mix(recol, painted, uEarPaint);
    float lit = trans * uTransGain * uHeadGain + rim * uRimGain;
    albedo *= mix(vec3(1.0), uUnder, uUnderGain * (1.0 - smoothstep(0.05, 0.55, lit)));
    float shelter = mix(uCanopy.x, 1.0, vTall * vTall);
    vec3 c = uSkyLight * uAmbient * 2.6 * (0.5 + 0.5 * vTone) * (1.0 - 0.88 * vFace) * mix(0.12, 1.0, vTall);
    c += albedo * pool * 0.5 * shelter;
    c += uSun * albedo * lit * (1.0 + pool) * shelter * vFace;
    float f = airDepth(vDist);
    vec3 air = mix(uVoid, uHaze, smoothstep(0.55, 1.0, f));
    c = mix(c, air, f);
    c *= mix(uNearDark, 1.0, smoothstep(1.5, 26.0, vDist));
    float endAt = fieldEndAt(vWorld, uFieldEnd);
    float endFade = 1.0 - smoothstep(endAt - uFieldFade, endAt + uFieldFade, vDist);
    float tail = exp(-max(0.0, vDist - endAt) / max(uFieldFade * 0.55, 1.0));
    c = mix(air * 0.07 * tail, c, endFade);
    c *= coneLightHead();
    gl_FragColor = vec4(c, 1.0);
  }
`;

let heads: Mesh | null = null;
let atlasTexture: Texture | null = null;

let stalks: Mesh | null = null;

const headMat = new ShaderMaterial({
  vertexShader: headVert,
  fragmentShader: headFrag,
  uniforms: {
    ...stalkUniforms,
    uAtlas: { value: null },
    uHeadSize: { value: 0.22 },
    uHeadGain: { value: 1.6 },
    uEarCut: { value: 0.42 },
    uEarPaint: { value: 1 }
  },
  side: DoubleSide
});

new TextureLoader().load('/field/wheat-heads-painted.png', (tex) => {
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  atlasTexture = tex;
  headMat.uniforms.uAtlas!.value = tex;
  stalkUniforms.uProcHead.value = 0;   // the stem stops drawing its own head
  if (heads) heads.visible = true;
});

/** Seeded 2D value noise, for clumps and voids. No Math.random. */
function valueNoise(seed: number): (x: number, z: number) => number {
  const hash = (ix: number, iz: number): number => {
    let h = (ix * 374761393 + iz * 668265263 + seed * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number): number => t * t * (3 - 2 * t);
  return (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = sm(x - ix), fz = sm(z - iz);
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

function buildField(): void {
  if (stalks) {
    scene.remove(stalks);
    stalks.geometry.dispose();
    stalks = null;
  }

  const rng = mulberry32(P.seed! * 7919 + 17);
  const noise = valueNoise(P.seed!);
  const target = P.count! * 1000;
  const near = P.near!;
  const far = P.depth!;
  const tanHalf = Math.tan((P.fov! * Math.PI) / 360) * (window.innerWidth / Math.max(window.innerHeight, 1));
  const spread = P.spreadX! / 100;
  const lnRatio = Math.log(far / near);
  const clump = P.clumpScale!;
  const voidLevel = P.voidLevel! / 100;

  // THE GROUND IS NOT A TABLE. Long low swells, tens of metres across, with
  // a finer ripple riding on them. On a long lens this is the whole
  // difference between a field and a carpet, and it is what gives the far
  // edge a profile instead of a ruled line.
  const swellAmp = P.swell! / 100;
  const swell = (x: number, z: number): number =>
    ((noise(x / 96 + 4.1, z / 138 + 9.7) - 0.5) * 1.35 + (noise(x / 31 + 21.3, z / 44 + 3.2) - 0.5) * 0.5) * swellAmp;

  const pos: number[] = [];
  const attr: number[] = [];
  const tone: number[] = [];
  const hue: number[] = [];
  let placed = 0;
  let tries = 0;
  while (placed < target && tries < target * 12) {
    tries++;
    // log-uniform in depth keeps the screen-space density roughly even;
    // the exponent thins the nearest metres so the eye is not buried
    const z = near * Math.exp(Math.pow(rng(), P.nearThin! / 100) * lnRatio);
    const x = (rng() * 2 - 1) * z * tanHalf * spread;
    // THE OPENING IS A V, NOT AN A. Measured as a fraction of the frame's
    // own half width at that distance, so it is a screen-space wedge: narrow
    // where the visitor stands, widening as it recedes. A clearing that is
    // physically widest at the camera projects as a converging corridor, an
    // A, which is the wrong story - you came out of the narrow thing.
    const t = Math.min(1, z / P.clearDepth!);
    const frac = (P.openNear! + (P.openFar! - P.openNear!) * Math.pow(t, 0.7)) / 100;
    const openHalf = frac * z * tanHalf * (0.72 + 0.56 * noise(x * 0.6 + 31.0, z * 0.35));
    if (Math.abs(x) < openHalf) continue;
    // clumps with voids between them, from one seeded noise field
    const n = noise(x / clump, z / clump) * 0.6 + noise(x / (clump * 0.31) + 7.3, z / (clump * 0.31)) * 0.4;
    if (n < voidLevel) continue;

    const towering = rng() < P.tallPct! / 100;
    let h = (P.hMin! + rng() * P.hSpan!) / 100;
    if (towering) h *= 1.5 + rng() * 0.8;
    if (rng() < 0.1) h *= 0.35 + rng() * 0.4; // the broken and the short
    const halfW = ((P.thick! / 1000) * (0.6 + rng() * 0.8) * (1 + z * 0.012)) / 2;
    pos.push(x, swell(x, z), -z);
    attr.push(h, (rng() * 2 - 1) * 0.28, rng() * Math.PI * 2, halfW);
    const patch =
      noise(x / 26 + 51.7, z / 34 + 12.9) * 0.62 + noise(x / 9.5 + 3.3, z / 11 + 44.1) * 0.38;
    tone.push((0.55 + rng() * 0.75) * (0.28 + 2.1 * patch * patch));
    hue.push(Math.pow(rng(), 1.6));
    placed++;
  }

  const blade = new PlaneGeometry(1, 1, 1, 6);
  blade.translate(0, 0.5, 0);
  const geo = new InstancedBufferGeometry();
  geo.index = blade.index;
  geo.setAttribute('position', blade.getAttribute('position') as BufferAttribute);
  geo.setAttribute('iPos', new InstancedBufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('iAttr', new InstancedBufferAttribute(new Float32Array(attr), 4));
  geo.setAttribute('iTone', new InstancedBufferAttribute(new Float32Array(tone), 1));
  geo.setAttribute('iHue', new InstancedBufferAttribute(new Float32Array(hue), 1));
  geo.instanceCount = placed;

  stalks = new Mesh(geo, stalkMat);
  stalks.frustumCulled = false;
  scene.add(stalks);

  if (heads) {
    scene.remove(heads);
    heads.geometry.dispose();
    heads = null;
  }
  const quad = new PlaneGeometry(1, 1, 1, 1);
  quad.translate(0, 0.5, 0);
  const hgeo = new InstancedBufferGeometry();
  hgeo.index = quad.index;
  hgeo.setAttribute('position', quad.getAttribute('position') as BufferAttribute);
  for (const name of ['iPos', 'iAttr', 'iTone', 'iHue']) hgeo.setAttribute(name, geo.getAttribute(name));
  hgeo.instanceCount = placed;
  heads = new Mesh(hgeo, headMat);
  heads.frustumCulled = false;
  heads.visible = atlasTexture !== null;
  scene.add(heads);

  placePools(rng, far);
  status.textContent = `${placed.toLocaleString()} stalks · seed ${P.seed}`;
}

/* ------------------------------------------------------------------ */
/* ground, void, passage, descending light                             */
/* ------------------------------------------------------------------ */

const groundMat = new ShaderMaterial({
  uniforms: {
    uVoid: { value: VOID }, uFog: stalkUniforms.uFog, uFogK: stalkUniforms.uFogK,
    uDark: { value: DARK }, uHaze: { value: HAZE },
    uResolution: stalkUniforms.uResolution, uVPoint: stalkUniforms.uVPoint,
    uVBase: stalkUniforms.uVBase, uVFlare: stalkUniforms.uVFlare, uVFeather: stalkUniforms.uVFeather,
    uVWobble: stalkUniforms.uVWobble, uVDark: stalkUniforms.uVDark,
    uFieldEnd: stalkUniforms.uFieldEnd, uFieldFade: stalkUniforms.uFieldFade
  },
  vertexShader: /* glsl */ `
    varying float vDist; varying vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDist = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    ${coneGlsl}
    uniform vec3 uVoid, uDark, uHaze; uniform float uFog, uFieldEnd, uFieldFade; varying float vDist; varying vec3 vWorld;
    void main() {
      vec3 c = uDark * 0.22;
      float f = airDepth(vDist);
      vec3 air = mix(uVoid, uHaze, smoothstep(0.55, 1.0, f));
      float endAt = fieldEndAt(vWorld, uFieldEnd);
      float endFade = 1.0 - smoothstep(endAt - uFieldFade, endAt + uFieldFade, vDist);
      float tail = exp(-max(0.0, vDist - endAt) / max(uFieldFade * 0.55, 1.0));
      vec3 lit = mix(air * 0.07 * tail, mix(c, air, f), endFade);
      gl_FragColor = vec4(lit * coneLight(vWorld), 1.0);
    }`
});
const ground = new Mesh(new PlaneGeometry(4000, 4000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.02, -1000);
scene.add(ground);

// THE VOID. A backdrop that is the haze colour at the ground and black high
// up, with no line anywhere: the ground ends in light, and above is black.
const voidMat = new ShaderMaterial({
  uniforms: {
    uVoid: { value: VOID }, uHaze: { value: HAZE }, uLift: { value: 0.6 },
    uHorizonY: { value: 2.4 }, uHorizonH: { value: 40 }, uHorizonGain: { value: 0.2 },
    uPaint: { value: 0.9 }, uStrokeScale: { value: 1.0 },
    uLane: { value: new Vector2(0.05, 0.17) },
    uSkyA: { value: new Color(0.055, 0.085, 0.34) },
    uSkyB: { value: new Color(0.26, 0.09, 0.50) },
    uSkyC: { value: new Color(0.60, 0.08, 0.09) },
    uEmber: { value: new Color(1.0, 0.34, 0.05) },
    uResolution: stalkUniforms.uResolution, uVPoint: stalkUniforms.uVPoint,
    uVBase: stalkUniforms.uVBase, uVFlare: stalkUniforms.uVFlare, uVFeather: stalkUniforms.uVFeather,
    uVWobble: stalkUniforms.uVWobble, uVDark: stalkUniforms.uVDark
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying vec3 vWorld;
    void main() {
      vUv = uv;
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    ${coneGlsl}
    uniform vec3 uVoid, uHaze, uSkyA, uSkyB, uSkyC, uEmber;
    uniform float uLift, uHorizonY, uHorizonH, uHorizonGain, uPaint, uStrokeScale;
    uniform vec2 uLane;
    varying vec2 vUv; varying vec3 vWorld;

    float h11(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

    // PAINT, NOT AIR. The sky is laid in with a knife: flat dashes packed
    // edge to edge, most of them dark indigo, a few violet, fewer crimson and
    // a handful hot. Later strokes cover earlier ones, because that is what
    // paint does, and they sweep around the centre of the picture instead of
    // all lying the same way.
    vec3 knife(vec2 uva, float band, float asp) {
      float lit = 0.10 + 0.90 * band;
      vec3 c = uSkyA * 0.3 * lit;
      for (int L = 0; L < 4; L++) {
        float fl = float(L);
        vec2 grid = vec2(13.0 + fl * 5.0, 19.0 + fl * 7.0) * uStrokeScale;
        vec2 q0 = uva * grid + vec2(h11(vec2(fl, 7.0)), h11(vec2(fl, 13.0))) * 11.0;
        vec2 id = floor(q0);
        vec2 f = fract(q0) - 0.5;
        float r1 = h11(id + fl * 17.0);
        float r2 = h11(id * 1.7 + fl * 31.0);
        float r3 = h11(id * 2.3 + fl * 53.0);
        if (r3 > 0.93) continue;
        float flow = (uva.x / max(asp, 1e-3) - 0.5) * 1.1;
        float ang = flow + (r2 - 0.5) * 0.5;
        vec2 q = vec2(f.x * cos(ang) - f.y * sin(ang), f.x * sin(ang) + f.y * cos(ang));
        float d = max(abs(q.x) / (0.44 + 0.36 * r1), abs(q.y) / (0.15 + 0.10 * r2));
        float m = 1.0 - smoothstep(0.74, 1.0, d);
        if (m <= 0.0) continue;
        vec3 col = uSkyA;
        if (r1 > 0.60) col = uSkyB;
        if (r1 > 0.88 - 0.16 * band) col = uSkyC;
        if (r1 > 0.972 - 0.02 * band) col = uEmber * 0.85;
        c = mix(c, col * (0.30 + 0.95 * r2) * lit, m);
      }
      // embers, small and hot, caught between the strokes
      vec2 ep = uva * 40.0 * uStrokeScale;
      vec2 eid = floor(ep);
      if (h11(eid + 91.0) > 0.955) {
        vec2 ef = fract(ep) - 0.5;
        c += uEmber * (1.0 - smoothstep(0.25, 1.0, length(ef) / 0.12)) * (0.5 + band) * 1.4;
      }
      return c;
    }

    void main() {
      // THE AIR ABOVE THE LAST OF THE FIELD. Thickest at eye level, thinning
      // upward faster than it thins down, so the field's top edge is a
      // boundary between two lit things and never a silhouette on black.
      float h = vWorld.y - uHorizonY;
      float band = exp(-abs(h) / max(uHorizonH, 1.0) * (h > 0.0 ? 1.0 : 2.4));
      float centre = exp(-pow((vUv.x - 0.5) * 2.0, 2.0));
      vec3 c = uHaze * uHorizonGain * band * mix(0.35, 1.0, centre);
      // the old sky lift, still on its own slider
      float up = pow(1.0 - clamp(vUv.y, 0.0, 1.0), 2.6);
      c += uVoid * up * mix(1.0, 0.45, 1.0 - centre) * uLift;
      // the haze belongs to the field, so it stays inside the wedge
      c *= coneLight(vWorld);
      // THE PAINT DOES NOT. The wedge is the dark thing standing in the field;
      // above it the picture is a painted sky with a narrow dark lane up the
      // middle for the light to fall through. Masking the paint with the
      // wedge swallows the whole sky, because the wedge is as wide as the
      // frame by the time it reaches the top.
      vec2 suv = gl_FragCoord.xy / uResolution;
      vec2 uva = vec2(suv.x * (uResolution.x / max(uResolution.y, 1.0)), suv.y);
      float lane = smoothstep(uLane.x, uLane.y, abs(suv.x - 0.5));
      float asp = uResolution.x / max(uResolution.y, 1.0);
      c += knife(uva, band, asp) * uPaint * lane;
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthWrite: false
});
const backdrop = new Mesh(new PlaneGeometry(6000, 900), voidMat);
backdrop.position.set(0, 450 - 60, -1800);
scene.add(backdrop);

const slabMat = new MeshBasicMaterial({ color: 0x000000 });
// pivot at the inner base edge, so leaning the wall moves its top and not
// its foot, and the mass extends OUTWARD from that edge: a wall that leans
// in must still fill the corner behind it, or the field shows through.
const slabGeoL = new BoxGeometry(40, 40, 18).translate(-20, 20, 0);
const slabGeoR = new BoxGeometry(40, 40, 18).translate(20, 20, 0);
const slabL = new Mesh(slabGeoL, slabMat);
const slabR = new Mesh(slabGeoR, slabMat);
scene.add(slabL, slabR);

function placePassage(): void {
  // THE PASSAGE IS AN A. Narrow where the visitor stands, and the two black
  // walls lean inward until their inner faces meet at apexY, so the field
  // ahead is seen through a gap that is wide at the ground and closes
  // overhead. Everything above the walls is black.
  const on = P.passOn! > 0.5;
  slabL.visible = on;
  slabR.visible = on;
  const splay = (P.passAngle! * Math.PI) / 180;
  const lean = Math.atan(P.passHalf! / Math.max(P.apexY!, 0.1));
  slabL.position.set(-P.passHalf!, 0, -P.passZ!);
  slabR.position.set(P.passHalf!, 0, -P.passZ!);
  slabL.rotation.set(0, splay, -lean);
  slabR.rotation.set(0, -splay, lean);
}

// DESCENDING LIGHT. Narrow and bright where it begins, wide and faint where
// it reaches the field. Additive, soft-edged, and it can be zero.
const beamMat = new ShaderMaterial({
  uniforms: { uGold: { value: GOLD }, uBeam: { value: 0.12 } },
  vertexShader: /* glsl */ `
    varying float vY; varying vec3 vN, vV;
    void main() {
      vY = uv.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uGold; uniform float uBeam; varying float vY; varying vec3 vN, vV;
    void main() {
      // a column of light has no surface: fade hard toward its silhouette,
      // brighter high up where it is narrow, faint where it has spread, and
      // never a hard point at the apex. A little noise keeps it from banding.
      float edge = pow(abs(dot(normalize(vN), normalize(vV))), 3.5);
      float along = pow(vY, 2.2) * (1.0 - smoothstep(0.92, 1.0, vY));
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 0.06;
      gl_FragColor = vec4(uGold * uBeam * edge * along * (0.97 + grain), 1.0);
    }`,
  transparent: true,
  blending: AdditiveBlending,
  depthWrite: false,
  side: DoubleSide
});
const beams: Mesh[] = [];
for (let i = 0; i < POOL_MAX; i++) {
  const m = new Mesh(new ConeGeometry(1, 1, 96, 1, true), beamMat);
  scene.add(m);
  beams.push(m);
}

function placeBeams(): void {
  const hgt = P.beamHeight!;
  const spread = P.beamSpread! / 100;
  for (let i = 0; i < POOL_MAX; i++) {
    const p = pools[i]!;
    const m = beams[i]!;
    m.visible = p.w > 0 && P.beam! > 0;
    // cone apex up: geometry apex sits at +0.5, base at -0.5
    m.scale.set(p.z * spread, hgt, p.z * spread);
    m.position.set(p.x, hgt * 0.5, p.y);
  }
}

/* ------------------------------------------------------------------ */
/* apply light / camera params (cheap)                                 */
/* ------------------------------------------------------------------ */

function applyLight(): void {
  palette();
  renderer.toneMappingExposure = P.exposure! / 100;
  stalkUniforms.uFog.value = P.fogDensity! * 1e-4;
  // four times the old scale: the same slider now buys air that is actually
  // in the way of the far field instead of only past it
  stalkUniforms.uFogK.value = P.fogDensity! * 4e-4;
  stalkUniforms.uAmbient.value = P.ambient! / 100;
  stalkUniforms.uTransGain.value = P.litThrough! / 100;
  stalkUniforms.uRimGain.value = P.rim! / 100;
  stalkUniforms.uRootDark.value = P.rootDark! / 100;
  stalkUniforms.uNearDark.value = P.nearDark! / 100;
  if (stalks) stalks.visible = P.stems! > 0;
  stalkUniforms.uStemGain.value = P.stems! / 100;
  stalkUniforms.uUnderGain.value = P.underGain! / 100;
  stalkUniforms.uCanopy.value.set(P.canopy! / 100, P.hMin! / 100, Math.max(P.hSpan! / 100, 0.01));
  stalkUniforms.uSunPhase.value = (P.sunSide! * Math.PI) / 180;
  gradePass.uniforms.uInk!.value.set(P.ink! / 100, P.inkRadius!, P.inkEdge! / 100);
  gradePass.uniforms.uCel!.value = P.cel! / 100;
  gradePass.uniforms.uCelBands!.value = P.celBands!;
  gradePass.uniforms.uShaft!.value.set(P.colShafts!, P.colLean! / 100, P.shaftSlab! / 100, P.shaftPaint! / 100);
  headMat.uniforms.uHeadSize!.value = P.headSize! / 100;
  headMat.uniforms.uHeadGain!.value = P.headGlow! / 100;
  headMat.uniforms.uEarCut!.value = P.earCut! / 100;
  headMat.uniforms.uEarPaint!.value = P.earPaint! / 100;
  stalkUniforms.uPoolGain.value = P.poolGain! / 100;
  stalkUniforms.uDepth.value = P.depth!;
  {
    // the sun sits ahead of the field, low; its light travels toward the eye
    const el = (P.sunElev! * Math.PI) / 180;
    const az = (P.sunSide! * Math.PI) / 180;
    stalkUniforms.uLightDir.value.set(Math.sin(az) * Math.cos(el), -Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  }
  stalkUniforms.uWind.value = P.wind! / 100;
  stalkUniforms.uWindSpeed.value = P.windSpeed! / 100;
  voidMat.uniforms.uLift!.value = P.skyGlow! / 100;
  voidMat.uniforms.uHorizonGain!.value = P.horizon! / 100;
  voidMat.uniforms.uPaint!.value = P.skyPaint! / 100;
  voidMat.uniforms.uStrokeScale!.value = P.strokeScale! / 100;
  voidMat.uniforms.uLane!.value.set(P.skyLane! / 200, P.skyLane! / 100);
  voidMat.uniforms.uHorizonH!.value = P.horizonHeight!;
  voidMat.uniforms.uHorizonY!.value = P.camY!;
  stalkUniforms.uVPoint.value = P.vPoint! / 100;
  stalkUniforms.uVBase.value = P.vBase! / 100;
  stalkUniforms.uVFlare.value = P.vFlare! / 100;
  stalkUniforms.uFieldEnd.value = P.fieldEnd!;
  stalkUniforms.uFieldFade.value = P.fieldFade!;
  stalkUniforms.uVFeather.value = P.vFeather! / 100;
  stalkUniforms.uVWobble.value = P.vWobble! / 100;
  stalkUniforms.uVDark.value = P.vDark! / 100;
  // the backdrop now carries the air above the far edge as well as the old
  // sky lift, and it is masked by the same wedge, so it can always be on
  backdrop.visible = P.skyGlow! > 0 || P.horizon! > 0 || P.skyPaint! > 0;
  PALE.setRGB(1.0, 0.94, 0.74).lerp(GOLD, 1 - P.paleMix! / 100);
  bloomPass.strength = P.bloom! / 100;
  bloomPass.threshold = P.bloomThreshold! / 100;
  bloomPass.radius = P.bloomRadius! / 100;
  gradePass.uniforms.uCol!.value.set(P.colCentre! / 100, P.colWidth! / 100, P.colGain! / 100, P.colReach! / 100);
  gradePass.uniforms.uMotes!.value = P.motes!;
  const lift = P.lift! / 100;
  gradePass.uniforms.uLift!.value.setRGB(lift * 1.25, lift, lift * 0.75);
  gradePass.uniforms.uGrain!.value = P.grain! / 100;
  beamMat.uniforms.uBeam!.value = P.beam! / 100;
  camera.fov = P.fov!;
  stalkUniforms.uPixelWorld.value = (2 * Math.tan((P.fov! * Math.PI) / 360)) / Math.max(stalkUniforms.uResolution.value.y, 1);
  camera.position.set(0, P.camY!, 0);
  camera.lookAt(0, P.targetY!, -P.targetZ!);
  camera.updateProjectionMatrix();

  placePassage();
  placeBeams();
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

// BLOOM, gently. Gold that glows a little past its own edge is the
// difference between vector art and a photograph of light.
// The composer renders into its own target, and a plain target has NO
// multisampling: the moment bloom went in, every thin blade became a
// crawling sub-pixel line. Four samples on a half-float target puts the
// anti-aliasing back where the eye needs it.
const composerTarget = new WebGLRenderTarget(1, 1, { samples: 4 });
const composer = new EffectComposer(renderer, composerTarget);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.55, 0.75);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
// THE COLUMN OF LIGHT, THE MOTES AND THE GRADE, after tone mapping. A soft
// column falling from the top centre, 16% of the width at half max, fading
// before it reaches the field; a few motes drifting in it; the blacks lifted
// to a warm 0.07 as in the picture; fine grain so the darkness is not flat.
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uCol: { value: new Vector4(0.508, 0.16, 0.95, 0.6) },   // centre, width, gain, reach
    uColColor: { value: new Color(1.0, 0.86, 0.6) },
    uMotes: { value: 60 },
    uInk: { value: new Vector3(0.0, 3.0, 0.35) },   // gain, radius in px, threshold
    uCel: { value: 0.0 },
    uCelBands: { value: 5 },
    uShaft: { value: new Vector4(4, 0.09, 1.0, 0.0) },   // count, lean, slab scale, slab depth
    uTexel: { value: new Vector2(1 / 1600, 1 / 900) },
    uLift: { value: new Color(0.075, 0.06, 0.045) },
    uGrain: { value: 0.03 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uMotes, uGrain;
    uniform vec4 uCol;
    uniform vec3 uColColor, uLift, uInk;
    uniform float uCel, uCelBands;
    uniform vec4 uShaft;
    uniform vec2 uTexel;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    // Vertical slabs, hard sided. An even grid of them is a barcode, so the
    // spacing is warped before it is cut: every slab has its own width and its
    // own place, and they run the whole height like a knife pulled downward.
    float slabs(vec2 uva, float scale) {
      float x = uva.x * 26.0 * scale;
      x += sin(x * 0.63 + uva.y * 1.7) * 0.75 + sin(x * 1.87 + 2.1) * 0.3;
      float id = floor(x);
      float f = fract(x) - 0.5;
      float r = hash(id * 37.1);
      float r2 = hash(id * 91.7 + 5.3);
      float w = 0.26 + 0.20 * r;
      float m = 1.0 - smoothstep(w * 0.62, w, abs(f));
      // a slab is not uniform along its length
      float along = 0.82 + 0.30 * sin(uva.y * (5.0 + 6.0 * r2) + r * 9.0);
      return mix(0.62, 1.28, r) * m * along;
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uInk.x > 0.0) {
        vec2 e = uTexel * uInk.y;
        float l00 = dot(texture2D(tDiffuse, vUv + vec2(-e.x, -e.y)).rgb, vec3(0.33));
        float l10 = dot(texture2D(tDiffuse, vUv + vec2(0.0, -e.y)).rgb, vec3(0.33));
        float l20 = dot(texture2D(tDiffuse, vUv + vec2(e.x, -e.y)).rgb, vec3(0.33));
        float l01 = dot(texture2D(tDiffuse, vUv + vec2(-e.x, 0.0)).rgb, vec3(0.33));
        float l21 = dot(texture2D(tDiffuse, vUv + vec2(e.x, 0.0)).rgb, vec3(0.33));
        float l02 = dot(texture2D(tDiffuse, vUv + vec2(-e.x, e.y)).rgb, vec3(0.33));
        float l12 = dot(texture2D(tDiffuse, vUv + vec2(0.0, e.y)).rgb, vec3(0.33));
        float l22 = dot(texture2D(tDiffuse, vUv + vec2(e.x, e.y)).rgb, vec3(0.33));
        float gx = (l20 + 2.0 * l21 + l22) - (l00 + 2.0 * l01 + l02);
        float gy = (l02 + 2.0 * l12 + l22) - (l00 + 2.0 * l10 + l20);
        float g = sqrt(gx * gx + gy * gy);
        c *= 1.0 - uInk.x * smoothstep(uInk.z, uInk.z * 2.2, g);
      }

      // LIGHT THROUGH AN OPENING, NOT A HANGING OBJECT. One soft vertical body
      // that tapers to a rounded end in mid-air is a pendant, and no amount of
      // width or brightness stops it being one. Several leaning shafts of
      // different widths instead, all of them reaching down INTO the field
      // where they land, so nothing terminates in the black.
      float y = vUv.y;
      float reachTop = 1.0 - uCol.w;              // how far down the light gets
      float column = 0.0;
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        if (fi >= uShaft.x) break;
        float h1 = hash(fi * 12.9 + 3.1);
        float h2 = hash(fi * 7.7 + 1.9);
        float h3 = hash(fi * 4.3 + 8.7);
        float w = uCol.y * (0.16 + 0.42 * h2) * (0.55 + 0.75 * y);
        // each leans its own way, so the group is never a symmetrical body
        float cx = uCol.x + (h1 - 0.5) * uCol.y * 3.6 + (h3 - 0.5) * uShaft.y * (1.0 - y);
        float dx = (vUv.x - cx) * uAspect / max(uAspect, 1.0);
        // flatter than a gaussian: a shaft has sides, a blob does not
        float across = exp(-pow(abs(dx) / max(w, 1e-4), 3.0));
        float down = pow(smoothstep(reachTop, 1.0, y), 0.55);
        column += across * down * (0.45 + 0.85 * h2);
      }
      // laid on with a knife, not sprayed
      vec2 uvaG = vec2(vUv.x * uAspect, vUv.y);
      column *= mix(1.0, slabs(uvaG, uShaft.z), uShaft.w);
      column *= uCol.z;
      // air around the group, so the shafts sit in something
      float dxw = (vUv.x - uCol.x) * uAspect / max(uAspect, 1.0);
      float wide = uCol.y * 3.2;
      column += exp(-(dxw * dxw) / (2.0 * wide * wide)) * pow(smoothstep(reachTop, 1.0, y), 0.55) * uCol.z * 0.09;
      c += uColColor * column;
      // motes: slow points drifting down through the light, spread across the
      // whole group of shafts rather than one body
      float w = uCol.y * 0.9;
      float m = 0.0;
      for (int i = 0; i < 64; i++) {
        float fi = float(i);
        if (fi >= uMotes) break;
        float px = uCol.x + (hash(fi * 3.1) - 0.5) * w * 5.0 * (0.4 + hash(fi * 9.7));
        float py = fract(hash(fi * 7.3) - uTime * (0.004 + 0.006 * hash(fi * 1.3)));
        vec2 d = vec2((vUv.x - px) * uAspect, vUv.y - py);
        float r = 0.0012 + 0.0016 * hash(fi * 5.9);
        m += exp(-dot(d, d) / (r * r)) * (0.4 + 0.6 * hash(fi * 2.7)) * smoothstep(reachTop, reachTop + 0.3, py);
      }
      c += uColColor * m * 0.9 * uCol.z;
      // PAINTED VALUE. Brightness is quantised into a few levels with the hue
      // left alone, which is what a painter does and a renderer never does.
      // Near-black is left smooth so the sky cannot band.
      if (uCel > 0.0) {
        float L = max(max(c.r, c.g), c.b);
        if (L > 0.004) {
          float e = pow(L, 0.62);
          float q = pow((floor(e * uCelBands) + 0.62) / uCelBands, 1.0 / 0.62);
          c *= mix(1.0, q / L, uCel * smoothstep(0.012, 0.07, L));
        }
      }
      // the grade: lifted warm blacks, a little grain
      c = c * (1.0 - uLift.g * 1.5) + uLift;
      float g = (hash(vUv.x * 1913.7 + vUv.y * 7717.3 + fract(uTime) * 91.0) - 0.5) * uGrain;
      c += g;
      gl_FragColor = vec4(c, 1.0);
    }`
});
composer.addPass(gradePass);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  gradePass.uniforms.uAspect!.value = w / h;
  gradePass.uniforms.uTexel!.value.set(1 / Math.max(w, 1), 1 / Math.max(h, 1));
  renderer.getDrawingBufferSize(stalkUniforms.uResolution.value);
  stalkUniforms.uPixelWorld.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / stalkUniforms.uResolution.value.y;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Dev only. Mirrors whatever the panel currently holds to disk, so the exact
// frame on screen can be reproduced by the real-GPU capture script instead of
// being described from memory.
function mirrorSettings(): void {
  fetch('/__field-settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(P)
  }).catch(() => undefined);
}

buildPanel(
  GROUPS,
  P,
  (_key, heavy) => {
    if (heavy) buildField();
    applyLight();
    mirrorSettings();
  },
  'field-tuning-v3'
);
mirrorSettings();

palette();
buildField();
applyLight();
// H hides the tuning panel, so the frame can be judged on its own
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') {
    const t = document.getElementById('tune');
    if (t) t.style.display = t.style.display === 'none' ? '' : 'none';
  }
});
// debug handle: read the live uniforms from the console without guessing
// MEASURE FROM INSIDE. Renders once, reads the pixels back, and returns the
// same layout numbers tools/measure-frame.py reads off the approved frame,
// so the build is compared to the picture in numbers rather than by eye.
function measure(): Record<string, unknown> {
  composer.render();
  const gl = renderer.getContext();
  const W = gl.drawingBufferWidth;
  const H = gl.drawingBufferHeight;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const lum = (x: number, yFromTop: number): number => {
    const i = ((H - 1 - yFromTop) * W + x) * 4;
    return (0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!) / 255;
  };
  const rowOuter = (y: number): number => {
    let s = 0, n = 0;
    for (let x = 0; x < W; x += 4) { if (x < W / 3 || x > (2 * W) / 3) { s += lum(x, y); n++; } }
    return s / n;
  };
  let top = -1;
  for (let y = 0; y < H; y += 2) { if (rowOuter(y) > 0.12) { top = y; break; } }
  const v: Record<string, number> = {};
  for (const frac of [0.98, 0.9, 0.8, 0.7, 0.62, 0.56]) {
    const y = Math.min(H - 1, Math.floor(H * frac));
    const ref = rowOuter(y);
    const thr = ref * 0.55;
    let l = Math.floor(W / 2), r = l;
    const sm = (x: number): number => { let s = 0; for (let k = -12; k <= 12; k += 4) s += lum(Math.min(W - 1, Math.max(0, x + k)), y); return s / 7; };
    while (l > 0 && sm(l) < thr) l -= 4;
    while (r < W - 1 && sm(r) < thr) r += 4;
    v[frac.toFixed(2)] = Math.round(((r - l) / 2 / W) * 1000) / 1000;
  }
  let skyS = 0, skyN = 0, fieldS = 0, fieldN = 0, above5 = 0, all = 0;
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const L = lum(x, y); all++; if (L > 0.5) above5++;
    if (top > 0 && y < top * 0.85 && x < W * 0.3) { skyS += L; skyN++; }
    if (top > 0 && y > top + 40 && L > 0.15) { fieldS += L; fieldN++; }
  }
  return { fieldTop: top / H, vHalf: v, skyMean: skyS / Math.max(skyN, 1), fieldLum: fieldS / Math.max(fieldN, 1), above50pct: above5 / all };
}
(window as unknown as { __field: unknown }).__field = { P, stalkUniforms, camera, measure };

const t0 = performance.now();
function frame(): void {
  stalkUniforms.uTime.value = (performance.now() - t0) / 1000;
  gradePass.uniforms.uTime!.value = stalkUniforms.uTime.value;
  stalkUniforms.uCamPos.value.copy(camera.position);
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
