import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LatticeWorld, CELL, HALF, TOWER_TOP, SEA_Y } from '../world/LatticeWorld';
import { TIP_T, prongCentre, surfacePoint } from '../world/monumentForm';
import { ChoirGroup } from '../world/ChoirGroup';
import { CameraPath } from './CameraPath';

const UP = new THREE.Vector3(0, 1, 0);

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
float monoHash(vec3 c) { return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float monoNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  float a0 = monoHash(vec3(i, 0.0));
  float b0 = monoHash(vec3(i + vec2(1.0,0.0), 0.0));
  float c0 = monoHash(vec3(i + vec2(0.0,1.0), 0.0));
  float d0 = monoHash(vec3(i + vec2(1.0,1.0), 0.0));
  return mix(mix(a0,b0,f.x), mix(c0,d0,f.x), f.y);
}
float monoFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * monoNoise(p); p *= 2.03; a *= 0.5; }
  return s / 0.9375;
}`;

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
    float laneW = sys == 0 ? 58.0 : 37.0;
    float rowH = sys == 0 ? 0.72 : 1.15;
    float lane = floor(ang * laneW);
    float lanePhase = monoHash(vec3(lane, sideS, float(sys) * 3.0));
    // not every lane is inscribed: the density the spec asks for
    if (lanePhase < 0.10) continue;
    float lx = fract(ang * laneW);
    float row = floor(vMonoW.y / rowH + lanePhase * 5.0);
    float ly = fract(vMonoW.y / rowH + lanePhase * 5.0);
    float gh = monoHash(vec3(lane, row, sideS + float(sys) * 7.0));
    if (gh < 0.20) continue;
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
  // Each scratch is a LINE with its own centre and length along its own
  // axis. Gating length with a repeating wave, as the first version
  // did, only drew them in horizontal bands about fifty units apart,
  // which is why they appeared at the top and bottom and nowhere else
  float scratch = 0.0;
  vec2 sp = vec2(ang, vMonoW.y * 0.055);
  for (int sc = 0; sc < 3; sc++) {
    float band = 3.0 + float(sc) * 2.3;
    float sa = 0.6 + float(sc) * 0.9;
    float ca2 = cos(sa);
    float sa2 = sin(sa);
    float across = sp.x * ca2 + sp.y * sa2;   // perpendicular to the line
    float along = -sp.x * sa2 + sp.y * ca2;   // along it
    float lane = floor(across * band);
    float lh = monoHash(vec3(lane, sideS, float(sc) * 11.0));
    if (lh < 0.42) continue;
    float d = abs(fract(across * band) - 0.5) / band;
    // centre and half length, per lane, so a scratch starts and stops
    // where that scratch happens to start and stop
    float centre = (monoHash(vec3(lane, sideS + 3.0, float(sc))) - 0.5) * 14.0;
    float halfLen = 1.4 + 4.6 * monoHash(vec3(lane, sideS + 7.0, float(sc)));
    float run = smoothstep(halfLen, halfLen * 0.55, abs(along - centre));
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
  // each facet carries its own tone, keyed off its constant normal
  vec3 facetKey = floor(normalize(vNormal) * 18.0);
  float facetTone = 0.86 + 0.30 * monoHash(facetKey);

  // the machined edge: with flat shading the normal changes only at a
  // facet boundary, so its derivative finds every edge in the body
  float edge = smoothstep(0.35, 1.6, length(fwidth(vNormal)) * 26.0);

  // sintered grain: fine, irregular, no periodicity to lock onto, and
  // a slow large scale drift over the top of it
  float micro = monoHash(floor(vec3(ang * 130.0, vMonoW.y * 26.0, sideS)));
  float speck = monoHash(floor(vec3(ang * 420.0, vMonoW.y * 84.0, sideS * 3.0)));
  float pit = step(0.978, speck);
  float macroVar = monoHash(floor(vec3(ang * 3.0, vMonoW.y * 0.5, sideS + 9.0)));
  // spec: roughness 0.48, variation plus or minus 0.08
  float rough = 0.48 + 0.045 * (micro - 0.5) * 2.0 + 0.035 * (macroVar - 0.5) * 2.0;
  rough += glyph * 0.16;
  rough += crack * 0.14;
  rough -= scratch * 0.26;
  rough -= edge * 0.18;
  rough += pit * 0.20;
  vMonoRough = clamp(rough, 0.24, 0.92);

  // albedo barely moves: a hint of darkening in the deepest grooves,
  // and only where the light is already raking
  diffuseColor.rgb *= facetTone;
  diffuseColor.rgb *= 1.0 - glyph * 0.10 * graze;
  // a scratch is a polished cut: it catches, never darkens
  diffuseColor.rgb += diffuseColor.rgb * scratch * (0.55 + 0.45 * graze) * 1.8;
  diffuseColor.rgb *= 1.0 - crack * 0.28;
  // sintered pitting, and the bright machined edge
  diffuseColor.rgb *= 1.0 - pit * 0.45;
  diffuseColor.rgb += vec3(0.055, 0.058, 0.065) * edge;
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

  // ---- THE CORROSION ----
  // Jacob's third set of references, 2026-08-21: "something like this
  // not tribal tattooing my hero".
  //
  // The glowing claw gashes are dead. Bright lines drawn on a face are
  // a tattoo however they are shaped, and that is the one word that
  // covers every version so far - rivulets, helix, claw sets, swathe,
  // bleed, gashes. All of them ADDED marks to the surface.
  //
  // What his references show is the opposite: the surface is EATEN.
  // A diagonal band where the stone has gone vesicular - open dark
  // pits of varying size, with a thin bright cWeb of remaining material
  // between them, densest at the core and thinning to fine veins at the
  // edges. The band reads DARKER than the stone around it, because most
  // of it is holes. Only the webbing catches light. Nothing glows.
  //
  // The cWeb is the ZERO SET of a warped field divided by its own
  // gradient - not a threshold on noise and not cells. This project has
  // the lesson recorded twice: a threshold admits half the volume and
  // reads as smoke, and Voronoi always resolves into a repeating unit,
  // which is what killed the golf-ball core. Dividing by the gradient
  // gives every vein the same width however steep the field is there,
  // which is what makes it read as structure rather than as noise.
  //
  // Surface coordinate is a sheared projection of world x and z, so it
  // varies across the front faces AND the flanks. World x alone streaks
  // on the flank; ang alone barely moves across the front, which is the
  // fault that made an earlier stroke wrap the monument as a bracelet.
  // THE HORIZONTAL IS outward, AND ONLY outward. Three coordinates
  // were tried and measured before this one, all wrong for the same
  // underlying reason - none of them runs monotonically across the
  // visible face:
  //
  //   world x       - constant along the flank, so the pattern smears.
  //   a sheared x/z projection - mixes DEPTH into the horizontal, so it
  //     varies fastest where the surface turns away and the band chased
  //     the blade's silhouette. Scaling it up (2.7, then 9.0) only made
  //     it track the edge harder.
  //   ang           - looked right and is not. The prong's cut edge is
  //     at MAXIMUM depth, so across the visible face across falls 1
  //     to 0 while the outward term rises 0 to 1.2, and the two very
  //     nearly cancel: ang spans 1.5 to 1.2, three tenths, effectively
  //     constant. That is also the real reason an earlier stroke built
  //     on ang collapsed into a bracelet.
  //
  // outward is distance from the cut plane over the half width: 0 at
  // the cleft, 1 at the outer edge, monotonic the whole way. It is
  // already computed at the top of this shader for the plate law.
  float cS = clamp(outward, 0.0, 1.0);
  vec2 CP = vec2(cS * 34.0, vMonoW.y);
  vec2 BP = vec2(cS * 95.0, vMonoW.y);

  // the band: one diagonal, crossing mid-height, edges dissolving
  const float CCA = 0.868, CSA = 0.497;
  float cAcross = -BP.x * CSA + BP.y * CCA - 59.0;
  float cAlong  =  BP.x * CCA + BP.y * CSA;
  cAcross += 26.0 * (monoFbm(vec2(cAlong * 0.010, 5.0)) - 0.5);
  float cHalf = 30.0 + 20.0 * monoFbm(vec2(cAlong * 0.014, 11.0));
  float band = 1.0 - smoothstep(cHalf * 0.22, cHalf, abs(cAcross));
  // clustered, so it takes hold in patches rather than filling the band
  band *= smoothstep(0.30, 0.66, monoFbm(vec2(cAlong * 0.035, cAcross * 0.048)) * 0.55 + band * 0.62);
  band *= step(0.0, sideS) * smoothstep(-12.0, 3.0, vMonoW.z);

  // the vesicular field. Warped BEFORE the level set is taken, or the
  // veins inherit the noise's own roundness and come out as bubbles
  vec2 cq = CP * 0.52;
  cq += (vec2(monoFbm(cq * 0.42), monoFbm(cq * 0.42 + 19.7)) - 0.5) * 3.4;
  float cf = monoFbm(cq) - 0.5;
  float cg = length(vec2(dFdx(cf), dFdy(cf))) + 1e-6;
  float cWeb = (1.0 - smoothstep(0.0, 2.2, abs(cf) / cg));
  // the pits: where the field runs deep, the material is simply gone
  float cPit = smoothstep(0.02, -0.16, cf);
  // pits open up at the core of the band and close to nothing at its
  // edge, so the band ends in fine veins rather than stopping
  float cWebRaw = cWeb;
  cPit *= smoothstep(0.18, 0.78, band);
  cWeb *= smoothstep(0.02, 0.34, band);

  // THE CRACKS, spreading past the band into intact stone. The band has
  // to fray outward or it reads as a decal with a boundary, which is
  // what Jacob's sheets never do: theirs sends fine veins running well
  // clear of the corroded mass. The same web field carries them, so
  // they are continuous with it and cannot look bolted on - but out
  // here only the STRONGEST veins survive, and they break along their
  // length so the network thins to isolated hairlines rather than
  // fading uniformly.
  // Reach and selectivity both matter. At 3.1x the half width the halo
  // covered a hundred and fifty units and the cracks became a second
  // TEXTURE over most of the blade - the intact stone disappeared,
  // which defeats the point of the band being an event. 1.9x, and only
  // the top quarter of the web survives out here, gated again by a
  // slow field so the veins arrive in runs rather than evenly.
  float halo = 1.0 - smoothstep(cHalf * 0.7, cHalf * 1.9, abs(cAcross));
  halo *= step(0.0, sideS) * smoothstep(-12.0, 3.0, vMonoW.z);
  float cCrack = smoothstep(0.76, 0.99, cWebRaw)
               * smoothstep(0.48, 0.82, monoFbm(CP * 0.14 + 31.0))
               * halo * (1.0 - band * 0.85);

  // THE STONE IS EATEN, not painted. The pits are voids and the cWeb is
  // what is left standing between them - so this is a DARKENING with a
  // thin bright residue, and the emissive channel is barely used.
  // THE WEB CARRIES IT, NOT THE PITS. Two faults found by rendering:
  //
  // 1. The web highlight was multiplied by graze at 1.1 + 2.4*graze, so
  //    it was three and a half times stronger at the silhouette than
  //    across the face - and the corrosion hugged the blade's outer
  //    EDGE, following the contour instead of crossing it. It looked
  //    like the band was misplaced when it was simply only visible
  //    where the surface turned away.
  // 2. Darkening does nothing here. The stone is already near black, so
  //    removing 88 percent of almost nothing is invisible. The pits
  //    cannot be what reads; the surviving WEB between them has to be,
  //    and the holes read as the gaps in it.
  //
  // So the web gets an absolute term that does not depend on how lit
  // the fragment already was, and graze is reduced to a modest lift
  // rather than the whole effect.
  diffuseColor.rgb *= 1.0 - cPit * 0.88;
  diffuseColor.rgb += diffuseColor.rgb * cWeb * band * (1.6 + 0.9 * graze);
  diffuseColor.rgb += vec3(0.058, 0.063, 0.072) * cWeb * band;

  // the runs: fine vertical streaks descending out of the band, where
  // it has wept down the face. Broken, because a dried run is dotted
  // THE WEEPING. Sourced from the band ABOVE this fragment, so a run
  // can only exist under something that could have produced it. The
  // band is linear in height - cAcross carries 0.868 per unit of y - so
  // the mask above is just an offset, no re-evaluation and no second
  // field. Four samples with a decaying weight give the reach.
  float cWeep = 0.0;
  for (int i = 1; i <= 4; i++) {
    float a2 = cAcross + 0.868 * float(i) * 15.0;
    cWeep = max(cWeep, (1.0 - smoothstep(cHalf * 0.22, cHalf, abs(a2)))
                       * (1.0 - float(i) * 0.17));
  }
  // strictly BELOW the band, never inside it
  cWeep *= smoothstep(-cHalf * 0.15, -cHalf * 0.95, cAcross);
  // narrow threads with their own lengths, broken along the run because
  // a dried weep is dotted rather than continuous
  float cLane = monoHash(vec3(floor(cS * 52.0), 21.0, sideS));
  float cRunLen = 16.0 + 78.0 * fract(cLane * 5.3);
  float cDrop = max(0.0, -(cAcross + cHalf) / 0.868);
  float cRun = step(0.38, cLane)
             * step(0.40, monoNoise(vec2(cS * 96.0, vMonoW.y * 0.85)))
             * smoothstep(cRunLen, cRunLen * 0.18, cDrop)
             * cWeep * step(0.0, sideS) * smoothstep(-12.0, 3.0, vMonoW.z);
  diffuseColor.rgb += diffuseColor.rgb * cRun * (1.5 + 0.9 * graze);
  diffuseColor.rgb += vec3(0.052, 0.057, 0.066) * cRun;

  // the cracks are thin bright residue too, and fainter than the band
  diffuseColor.rgb += diffuseColor.rgb * cCrack * (1.2 + 0.8 * graze);
  diffuseColor.rgb += vec3(0.040, 0.044, 0.051) * cCrack;

  // roughness follows the damage: the pits are matte voids, the cWeb is
  // a hard remaining edge
  vMonoRough = clamp(vMonoRough + cPit * 0.30 - (cWeb * band + cCrack * 0.6 + cRun * 0.5) * 0.22, 0.08, 0.96);

  // NOTHING EMITS. Sparse bright points were tried here and they are
  // the eczema again by another name: isolated dots on a surface read
  // as a skin condition, and this project has already killed that once.
  // The corrosion is entirely a darkening with a bright residue, which
  // is what the references show - the band is DARKER than the stone and
  // only the remaining web catches light.
  vMonoEng = 0.0;
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
/**
 * THE AIR, re-solved 2026-08-21. Jacob: the hero "is engulfed in the
 * background and the colour and seems small like part of choir".
 *
 * Three complaints, one fault, and it was not the rig or the albedo -
 * both were rebalanced on 2026-08-19 and both were correct for where
 * the camera stood THEN. The landing pose moved the same week from
 * (0,14,300) to (0,95,620) for the processional reference frame.
 * FogExp2 is quadratic in distance, so more than doubling it did not
 * double the veil, it squared it:
 *
 *   at 300 units, density 0.0022 -> 35% fog, 65% of the stone survives
 *   at 620 units, density 0.0022 -> 84% fog, 16% of the stone survives
 *
 * Five sixths of the hero was being discarded and replaced with flat
 * fog colour before it reached the frame. Every facet tone, machined
 * edge, inscribed glyph and raking key highlight was multiplied by
 * 0.16, which is why the mass reads as a cutout: what is left is the
 * fog colour, #05070c at luminance 0.027, against a sky measured at
 * 0.165 across the horizon. A dark shape on a lighter ground is a
 * silhouette, and a silhouette carries no size cue but its outline.
 * That is also why it reads as one of the choir: the choir sits at
 * 99.9% fog, so hero and witnesses were being painted the same colour,
 * and aerial perspective then puts them at the same distance, and
 * anything at the choir's distance must be the choir's size.
 *
 * That diagnosis was right and the remedy was solved for the wrong
 * camera. 0.00106 gives the 35% veil at 620 units - but the landing
 * went back to (0,14,300) on 2026-08-21, and the whole reason the hero
 * was drowning was that the camera had moved out to 620 in the first
 * place. Fix the distance and the air does not need rescuing: at 300
 * units 0.0022 IS the 35% veil, which is what the rig was balanced
 * against on 2026-08-19 and what this number always meant.
 *
 * Leaving it thinned would have double-counted the correction and
 * stripped the aerial perspective out of the frame entirely.
 *
 * Sweep it with window.__dl.setFog(density) rather than trusting this
 * number: it is solved, not judged, and judging it is Jacob's.
 */
const LANDING_FOG = 0.0022;

/**
 * How much denser the landing air is at the plain than at the hero's
 * mid-height.
 *
 * 2.08 existed only to hold the plain down under the thinned air, and
 * that air is gone. Jacob, 2026-08-21: "now haze is too much you over
 * did it so we wont see the choir hovering but that made it worse".
 * Back to 1.0 - uniform, no ground term at all. The height falloff is
 * kept in the shader because haze genuinely does pool low and it is one
 * uniform away, but it is OFF until a frame asks for it, not on because
 * a sweep liked it.
 */
const GROUND_HAZE = 1.0;
const INTERIOR_FOG = 0.005;

const LIGHT_KEYS: Array<{
  p: number;
  i: number;
  c: string;
  d: [number, number, number];
  amb: number;
  env: number;
}> = [
  // THE RIG, rebalanced 2026-08-19. Jacob: the hero is "very light in
  // colour and rest of background and skybox are eating it... can we
  // make it something that is very coherent".
  //
  // The fault was not the albedo, it was the ratio. Ambient was STRONGER
  // than the key at every stop - 1.1 against 0.88 at the landing - so
  // the monument was lit mostly by directionless fill. Fill cannot model
  // a form: it raises every facet by the same amount whatever way the
  // facet faces, which is the definition of flat. Lifting the albedo on
  // top of that only made the flatness paler, which is why it started
  // reading as a light grey cutout the sky could eat.
  //
  // Ambient roughly halved and the key raised to carry the exposure
  // instead. Now one side of the mass is lit and the other falls away,
  // so it reads as a solid with weight rather than a shape with a tone.
  // The landing key also swings side-on, from [0.35, 0.75, 0.55] which
  // was almost down the camera axis - frontal light flattens a form as
  // surely as ambient does - to a raking angle that separates the two
  // prongs and lets the skin's grazing-angle glyphs do their work.
  //
  // Inside the cleft the ambient is cut less hard: in there the fissure
  // and the traveller's light are doing the modelling already, and the
  // walls need enough fill to stay material rather than becoming a
  // black cutout.
  { p: 0.0, i: 1.45, c: '#eef1f4', d: [0.85, 0.55, 0.12], amb: 0.5, env: 0.29 },
  { p: 0.15, i: 2.1, c: '#e8ecf0', d: [0.9, 0.35, 0.15], amb: 0.38, env: 0.33 },
  { p: 0.29, i: 1.45, c: '#e9edf1', d: [0.72, 0.5, 0.2], amb: 0.45, env: 0.3 },
  { p: 0.43, i: 2.2, c: '#e4e9ee', d: [0.95, 0.3, -0.1], amb: 0.32, env: 0.35 },
  { p: 0.53, i: 0.52, c: '#cfd9e4', d: [0.2, 0.9, 0.2], amb: 0.3, env: 0.2 },
  { p: 0.65, i: 0.6, c: '#cfd9e4', d: [0.2, 0.9, 0.2], amb: 0.3, env: 0.2 },
  { p: 0.7, i: 1.02, c: '#c3ccd8', d: [-0.6, 0.5, -0.5], amb: 0.3, env: 0.27 },
  { p: 0.83, i: 1.17, c: '#dbe1e8', d: [0.55, 0.4, 0.6], amb: 0.36, env: 0.27 },
  { p: 0.92, i: 0.79, c: '#b4bfcd', d: [0.5, 0.5, 0.8], amb: 0.32, env: 0.25 },
  { p: 1.0, i: 0.73, c: '#aeb9c8', d: [0.55, 0.5, 0.7], amb: 0.32, env: 0.25 }
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



// MONO_VERT and MONO_FRAG lived here: the mirrored stone shader for
// the drowned monument. Removed with the reflection itself, 2026-08-19.
//
// Worth recording: MONO_FRAG carried its own inlined copy of the form
// constants, so the rule was "change the form in FOUR places" -
// src/world/monumentForm.ts, tools/blender/monument.py, FRAG_MAP and
// MONO_FRAG. It is THREE now. One fewer copy to drift out of step.

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

const SKY_VERT = /* glsl */ `
  out vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 0.0);
    gl_Position = (projectionMatrix * vec4(mv.xyz, 1.0)).xyww;
  }
`;

// THE SKY, as one function rather than one shader. The shore now runs
// all the way out to the fog, so the plain has to MEET this instead of
// cutting it, and the ground evaluates the same law at the horizon
// rather than carrying a second copy of these numbers.
const SKY_LAW = /* glsl */ `
float skyHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x),
             mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float skyFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * skyNoise(p); p *= 2.07; a *= 0.5; }
  return v;
}

// Rotating the SAMPLE POINT about the monument's axis, rather than
// translating it, is what keeps the drift even. A flat sheet seen from
// below is 300 units away overhead and 26000 at the horizon, so a
// constant world velocity would tear across the zenith and stand still
// at the horizon. Rotation moves every sample at the same ANGULAR rate,
// which is the same rate on screen everywhere.
//
// It rotates the texture only. Deck altitude and the draw's dip are
// computed from the true direction, so the bend stays fixed on the
// Spire while the weather moves through it.
vec2 skyDrift(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

vec3 skyAt(vec3 d, vec3 eye, float sev, float lidAmt, float drawAmt, float strata, float shaftAmt, float time) {
  // The skin is #050607. A near-black object against a near-black sky
  // is nothing at all, which is why the spire vanished when the spec
  // albedo went in. Every reference sheet stands it against haze, so
  // the atmosphere carries the silhouette and the stone stays honest
  float band = exp(-abs(d.y + 0.02) * 3.2);
  float high = exp(-max(d.y - 0.1, 0.0) * 2.4);
  // COLD BLUE, on Jacob's instruction 2026-08-19: the sky "collides
  // with the base and hero and spires and rest plain". It did. Sky,
  // plain, choir and monument were all sitting in one narrow neutral
  // grey band, so nothing separated from anything and the only thing
  // outside the band was the fissure - which is why it read as blinding
  // and why the hero read as invisible beside it.
  //
  // This is the brief's Deep energy blue as a HUE, not as a colour: at
  // roughly three to one blue over red it lands near 225 degrees, a true
  // blue with no violet in it, and it stays deeply desaturated. The
  // near-black stone is very slightly warm, so it now reads warm against
  // a cold sky instead of grey against grey.
  //
  // It is also about a quarter darker in luminance than the neutral sky
  // was, which gives the monument somewhere to be brighter THAN.
  vec3 base = mix(vec3(0.0040, 0.0058, 0.0115), vec3(0.0030, 0.0048, 0.0105), sev);
  vec3 glow = mix(vec3(0.0230, 0.0350, 0.0700), vec3(0.0130, 0.0220, 0.0500), sev);
  vec3 col = base + glow * band * (0.35 + 0.65 * high);

  // THE DECKS. Three horizontal sheets of haze at real altitudes. A ray
  // meets a sheet at t = (H - eye.y) / d.y, so the texture compresses
  // toward the horizon on its own and slides as the camera translates.
  // That perspective is the entire difference between weather and a
  // painted backdrop.
  //
  // This replaces a pair of sines on d.y that claimed to be strata and
  // could only ever have been stripes on a dome: banding the VIEW angle
  // has no distance in it, so it has no compression, no parallax, and a
  // nameable repeated element the moment it is strong enough to see. It
  // was also multiplied by exp(-|d.y| * 2.2), which killed it exactly
  // where the sky is bright. Measured, the sky was a monotonic ramp of
  // 0.060 to 0.234 varying 12 percent across the whole frame.
  float dens = 0.0;
  float lit = 0.0;
  float dy = max(d.y, 0.035);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float H0 = 300.0 + fk * 760.0;

    // THE DRAW. The sheets are not level: they dip toward the Spire's
    // axis, nearly horizontal at the edges and gently curving down as
    // they pass over the monument, as if the whole chamber were under a
    // field.
    //
    // This is deliberately GEOMETRY and not a texture warp. Swirling
    // the sample coordinate would crowd the pattern toward the centre
    // and read as an effect painted on a flat sheet; bending the sheet
    // itself and intersecting the bent sheet makes the perspective, the
    // compression and the convergence all fall out on their own. A
    // swirl says "effect". A draw says "law".
    //
    // Bending H makes the intersection implicit, so it is solved with
    // one fixed-point step: hit the flat sheet, ask how deep the dip is
    // there, then hit the bent sheet. One step is ample for a bend this
    // gentle and it keeps the cost closed-form.
    //
    // Two properties come free and both are in the brief. At grazing
    // angles t is enormous, so the sample lands far out where the dip
    // has died and the strata stay level at the edges. Overhead the
    // sample lands near the axis, which is where the dip is deepest.
    float t = (H0 - eye.y) / dy;
    vec2 pf = eye.xz + d.xz * t;
    // 7000 units of influence, not 3000. At 3000 the dip only reached
    // the lowest deck: the upper two are sampled four and seven
    // thousand units out at the elevations that matter, so the field
    // had died before it got to them and the bend touched about a third
    // of the density. "As if the whole chamber were under a field"
    // needs the field to reach the whole chamber.
    float bend = exp(-dot(pf, pf) / 49000000.0);
    float H = H0 * (1.0 - drawAmt * 0.35 * bend);

    // clamped so the horizon converges instead of running to infinite
    // frequency, which is where a flat deck aliases
    t = min((H - eye.y) / dy, 26000.0);
    vec2 p = eye.xz + d.xz * t;
    // STRATIFICATION. Isotropic fbm gives a field of blobs, and a bent
    // sheet of blobs reads as blobs that MOVED, not as a sheet that
    // bent - there is no line for the eye to follow. Squeezing one
    // horizontal axis elongates the features into layers, which is what
    // the word strata means and what makes the dip legible. Kept
    // parallel and never radial: features converging on the axis would
    // be a radial bloom, which is banned.
    // uStrata = 1.0 is the isotropic sky that was already approved.
    // 0.005 rad/s is about 0.29 degrees a second, near seven pixels a
    // second at this field of view - a hundred pixels over a fifteen
    // second dwell. Found by rendering, not reasoning: the decks were
    // built STATIC on the argument that camera parallax would carry the
    // motion, and at the landing dwell the camera barely travels, so
    // the whole upper frame froze. The first correction at 0.0026 was
    // still too slow to read.
    float n = skyFbm(skyDrift(p, time * 0.005) * vec2(strata, 1.0) * (0.00055 - fk * 0.00013));
    // thin and mostly clear. A low threshold fills the sky and the
    // frame stops having negative space, which is the whole composition
    float body = smoothstep(0.46, 0.70, n);
    // how much deck the ray actually crosses, which goes as 1/d.y. This
    // is the physical term and it also removes the zenith singularity:
    // straight up, every ray meets the sheet at almost the same point,
    // so without it the whole top of the sky is one arbitrary noise
    // sample that slides in value as the camera moves
    body *= clamp(0.16 / dy, 0.0, 1.0);
    dens += body * (0.52 - 0.12 * fk);
    // the fissure lights its own weather. A deck passing over the
    // monument carries that light and the rest of the sky does not,
    // which keeps the glow and its source on one axis
    lit += body * exp(-length(p) * 0.0016) * (0.9 - 0.22 * fk);
  }
  // thick air eats the horizon glow before it arrives, and gives a
  // little of it back where a deck is lit from below
  col *= 1.0 - clamp(dens, 0.0, 1.0) * 0.38;
  col += glow * clamp(lit, 0.0, 1.5) * 0.26;

  // THE LID. The faint inverted plain far above, met at the same
  // t = (H - eye.y) / d.y as any deck. Three things separate it from
  // the decks below and each one is load-bearing:
  //
  // 1. NO PATH-LENGTH TERM. The decks scale by clamp(0.16 / d.y)
  //    because a ray crosses more haze at a shallow angle. A SURFACE
  //    has no path length. Applying it would make the ceiling weakest
  //    directly overhead, which is exactly backwards.
  // 2. BROAD TONE, NOT TEXTURE. Two octaves at enormous scale and
  //    nothing finer. Detail turns a ceiling into a cloud, and a
  //    nameable repeated element is what has killed every carrier this
  //    project has built.
  // 3. IT NEVER ANNOUNCES ITSELF. It must read first as depth and only
  //    later as WRONG depth, so it is faint, it carries no edge, and
  //    the landing camera barely looks up.
  //
  // "Almost lost in haze" is free: t runs to infinity at the horizon,
  // so the aerial term buries the lid there without being asked, and
  // the tonal patches compress as they recede. That compression is the
  // whole cue that says surface rather than gradient.
  {
    float t = min((11000.0 - eye.y) / max(d.y, 0.02), 400000.0);
    vec2 q = eye.xz + d.xz * t;
    // The aerial term has to reach further down than the decks' does or
    // the lid dies above the elevations where its compression becomes
    // legible, and legible compression is the entire surface cue.
    float far = exp(-t / 42000.0);
    // Cell size is the number that decides whether this is a ceiling or
    // a wash. The landing camera sees roughly 15 to 36 degrees of sky,
    // which is t from 42500 down to 18560: about 24000 units of lid. At
    // the first attempt's 24000 unit cell that is ONE feature across the
    // whole band, so it read as brighter fog. Near 4800 puts five
    // features in it, which is enough to watch them stack and squash
    // toward the horizon, and still far too coarse to be a texture.
    // A third of the decks' rate. The difference is the point: the lid
    // and the weather beneath it separate over time, and relative
    // motion is the only kind the eye reads as depth. Everything moving
    // together is what a camera sway looks like, and it reads as still.
    vec2 qd = skyDrift(q, time * 0.0018);
    float n = skyNoise(qd * 0.00021) * 0.70 + skyNoise(qd * 0.00048) * 0.30;
    // centred and contrasty rather than a floor plus a wobble: the lid
    // must be uneven, not uniformly present
    float tone = smoothstep(0.32, 0.74, n);

    // THE SHAFT. A rectangular absence cut clean through the lid, and
    // nothing else. Cloud has no straight edges, so the cut itself is
    // the whole evidence that something engineered it - no beam, no god
    // rays, no column, and it never crosses the monument.
    //
    // Everything about its placement is a guard against the failure
    // Jacob named, that it becomes a second focal monument and reduces
    // the Spire to foreground dressing:
    //   - 24700 units out, so the light it lets past falls on a part of
    //     the plain nowhere near the Spire;
    //   - offset 22 degrees to one side, never centred, never overhead;
    //   - small, about 3 degrees, so it reads as an incision.
    //
    // The distance is also what puts it in frame at all. On a lid at
    // altitude 11000, horizontal distance IS elevation: the first
    // placement at 19000 units sat at 30 degrees, which is the landing
    // frame's top edge, so the viewport cut it in half and it read as a
    // smudge rather than a cut. 24700 units is 24 degrees - the upper
    // third, with room around it.
    //
    // Longer along the line of sight than across it, because the plane
    // is seen at a shallow angle and the radial extent foreshortens by
    // roughly sixty percent. In plan it is a slot; on screen it is near
    // square.
    //
    // The edge is hard but not aliased: its width is one pixel of the
    // lid's own coordinate, taken from the derivative, so it stays a
    // clean line at every distance instead of crawling.
    vec2 rel = abs(q - vec2(-9253.0, -22902.0)) - vec2(700.0, 900.0);
    float ew = max(fwidth(q.x), 1.0);
    float cut = (1.0 - smoothstep(-ew, ew, rel.x)) * (1.0 - smoothstep(-ew, ew, rel.y));
    tone *= 1.0 - cut * shaftAmt;

    // d.y guard, which also keeps the ground's horizon call at exactly
    // zero: it asks for a horizontal bearing and gets no lid at all
    float lid = far * smoothstep(0.0, 0.05, d.y) * tone;
    col += glow * lid * lidAmt * 0.70;

    // "faint remote illumination beneath it". Not a shaft of light: the
    // air under the opening simply carries a little more of whatever is
    // above, which is what an absence in a ceiling actually does.
    col += glow * cut * far * shaftAmt * 0.06;
  }

  // a faint drift across the azimuth, so turning the camera finds
  // variation instead of the same ramp everywhere
  float drift = sin(atan(d.z, d.x) * 2.0 + d.y * 3.0) * 0.5 + 0.5;
  return col + glow * drift * 0.08 * band;
}`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vDir;
  uniform float uSeverity;
  uniform float uLid;
  uniform float uDraw;
  uniform float uStrata;
  uniform float uShaft;
  uniform float uTime;
  out vec4 outColor;
  ${SKY_LAW}
  void main() {
    outColor = vec4(skyAt(normalize(vDir), cameraPosition, uSeverity, uLid, uDraw, uStrata, uShaft, uTime), 1.0);
  }
`;

/**
 * THE SHORE. The authored plain is a 1400 unit plane, so it stopped at
 * 700 units - and the choir stands from 560 out to 1560. Four of the six
 * masses had no ground under them at all and hung in open sky, which is
 * exactly what they looked like, and the plain's own far edge cut a hard
 * straight line across the frame at the same place.
 *
 * This carries the plain out into the fog. Its inner ring IS the authored
 * mesh's boundary vertices, read from the geometry rather than assumed,
 * so there is no seam to hide and no second copy of the plain's extent to
 * keep in step with monument.py.
 */
function buildShore(src: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(p);
  const edge = Math.min(box.max.x, box.max.z) - 0.5;
  const OUT = 3600;
  const seen = new Set<string>();
  const ring: { a: number; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (Math.abs(x) < edge && Math.abs(z) < edge) continue;
    const key = `${Math.round(x)}:${Math.round(z)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ring.push({ a: Math.atan2(z, x), x, y: p.getY(i), z });
  }
  // the plain is convex and contains the origin, so azimuth around the
  // centre IS boundary order and no edge walk is needed
  ring.sort((u, v) => u.a - v.a);

  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (const v of ring) {
    const r = Math.hypot(v.x, v.z) || 1;
    // inner vertex is the plain's own; outer runs level, so the dunes
    // ease off over three thousand units instead of ending
    pos.push(v.x, v.y, v.z, (v.x / r) * OUT, 0, (v.z / r) * OUT);
    nrm.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = i * 2;
    const b = ((i + 1) % ring.length) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  const shore = new THREE.Mesh(g, mat);
  shore.frustumCulled = false;
  return shore;
}

export class JourneyRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly path = new CameraPath();

  private readonly scene = new THREE.Scene();
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly cladMat: THREE.ShaderMaterial;
  private readonly markMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  /** review pin for the lid; null means the severity ramp owns it */
  private lidOverride: number | null = null;
  private landingFog = LANDING_FOG;
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
    uGDecay: { value: 0 },
    // the ground samples the sky at the horizon, so it needs the same
    // clock or the join would drift apart from what it is joining
    uGTime: { value: 0 },
    // how far the plain has failed at the foot. Built too weak and
    // swept, then taken UP on Jacob's call - 1.0 was the dial's ceiling
    // so "a little more" had to come from the coefficients above, not
    // from here.
    uGBite: { value: 1.0 },
    // THE GROUND HAZE. See the note in the ground fragment.
    uGHaze: { value: GROUND_HAZE }
  };
  private fissureMat!: THREE.ShaderMaterial;
  private hazeMat!: THREE.ShaderMaterial;
  private fieldMat!: THREE.ShaderMaterial;
  private mistMat!: THREE.ShaderMaterial;
  private readonly choir: ChoirGroup;
  private frameGroup!: THREE.Group;
  private moteMat!: THREE.ShaderMaterial;
  private monoMat!: THREE.MeshStandardMaterial;
  private stoneU!: Record<string, THREE.IUniform>;
  /** resolves once the authored monument is standing */
  readonly ready: Promise<void>;
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
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 4200);

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
      // uLid is driven from severity in update(); 0.3 is the landing
      // value, which is what the first frame shows before the ramp has
      // anything to add.
      //
      // uDraw and uStrata are LOCKED to the cell Jacob chose out of the
      // 2x2 in captures/draw/matrix: "d-layered-bend is right, lock
      // it". They stay uniforms so the pair can be pinned for review,
      // not because either is still open.
      uniforms: {
        uSeverity: { value: 0 },
        uLid: { value: 0.3 },
        uDraw: { value: 0.6 },
        uStrata: { value: 0.35 },
        uShaft: { value: 0.5 },
        uTime: { value: 0 }
      },
      side: THREE.BackSide,
      depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);

    // The sea is gone. It was a 2400 unit transparent plane at y=0 from
    // the drowned-monument direction, lying flat across the shore and
    // hazing everything the floor was supposed to show.

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

    // THE DROWNED REFLECTION IS REMOVED, 2026-08-19. Both copies of it:
    // the cells here and the stone body below.
    //
    // It reflected the monument in water that no longer exists - the sea
    // was taken out, and this was left behind. What it did instead was
    // put a plinth under the hero. MONO_VERT mirrors with
    // wp.y = -wp.y - 0.12, and the monument's foot is deliberately
    // BURIED: monument.py lofts from t = -0.055, about 10.7 units below
    // the plain, so each foot enters the terrain as straight stone.
    // Mirrored, that buried stub lands at +10.6 ABOVE the plain at full
    // untapered section, BASE_W wide, with a flat top. Two of them, one
    // per half, flanking the fissure. Jacob: "it just looks its been
    // placed on ground with support pillars ... a prop rather than
    // holy". They were the support pillars, exactly.
    //
    // It should have gone with the drowned inverted monument, which he
    // killed on the 19th. Removing it finishes that.

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
          // THE LIGHT FILLS THE SLOT; THE STONE GIVES IT ITS SHAPE.
          //
          // Not the halfway bug - that was depthWrite, see the material.
          // This is the separate fault the diagnosis turned up. The
          // plane was a fixed 4.6 across with a 2.8-unit core, while
          // monument.py cuts the slit at 5.0 - 3.9t half-width: 2.2
          // across at the crown, 10 across at the foot. So the light
          // overflowed the gap high up and the prongs cropped it into a
          // solid bar, and at the foot it covered barely a quarter of a
          // ten-unit slot with the rest left black. One light, two
          // different reads, and neither of them decided by the stone.
          //
          // So the plane is WIDER than the slit at every height and its
          // lit width tracks the cut, overspilling by a quarter into
          // stone that hides it. The prongs become the only thing that
          // decides the seam's width, at every height and every angle.
          //
          // Filling the slit EXACTLY, though, turns the foot into a
          // floodlight: the slot is ten across down there, and ten units
          // of white at this intensity blows out the whole base and puts
          // the frame back to one blinding wedge. So the blade keeps a
          // hairline width of its own - 4.4 across at the foot, 2.0 at
          // the crown - which is under the slit low down, where the
          // extra slot depth stays honestly dark, and OVER it high up,
          // where the prongs close to 2.2 and crop it.
          //
          //   world half-width 2.2 at the foot to 1.0 at the crown,
          //   over a 14-unit plane
          float wob = 0.008 * sin(vUvF.y * 21.0) + 0.004 * sin(vUvF.y * 53.0 + 1.7);
          float halfW = 0.157 - 0.086 * vUvF.y + wob;
          float d = abs(vUvF.x - 0.5);
          // softness scales with the cut, so the edge stays proportionate
          // instead of swallowing the gap where the slit is thinnest
          float u = smoothstep(halfW, halfW * 0.72, d);
          float v = smoothstep(0.0, 0.04, vUvF.y) * smoothstep(1.0, 0.90, vUvF.y);
          // spec: emission colour pure #FFFFFF, intensity 8 to 15
          vec3 holy = vec3(1.0);
          vec3 cold = vec3(0.86, 0.93, 1.0);
          float fail = 1.0 - uDecay * 0.55;
          // inside the slit the plane is a few units from the eye, so
          // full strength floods the frame and the walls lose their
          // dark. It burns from a distance and only glows up close.
          //
          // 4.2 was blinding, and blinding is not the same as bright:
          // at that intensity the eye adapts to the blade and every
          // other value in the frame collapses, which is exactly why
          // Jacob could not see the monument standing around it. 1.9
          // still clips to white in the core and still carries the
          // bloom; it just stops being the only thing the frame has.
          // 1.2 keeps the core bright without saturating, so the whole
          // seam reads as one continuous hairline.
          float near = mix(1.2, 0.85, uNear);
          outColor = vec4(mix(holy, cold, uSeverity) * v * u * near * fail, 1.0);
        }`,
      uniforms: { uSeverity: { value: 0 }, uDecay: { value: 0 }, uNear: { value: 0 } },
      side: THREE.DoubleSide,
      // Jacob, 2026-08-21: "there is a something in the back of crown
      // making it look weird i think its the light crack silhouette".
      // He was right, and it was mine. This material wrote alpha 1.0
      // with no blending, so everywhere the lit core falls away it was
      // painting SOLID BLACK, not nothing. At 4.6 wide that black hid
      // inside the slit. At 14 wide - see below - it protrudes past the
      // prongs near the crown, where they narrow to 6.3 from the axis,
      // and its top corners drew a dark plate across the sky behind the
      // tips.
      //
      // A blade of light is additive. Black then contributes nothing
      // and there is no plate to see. This also cannot bring back the
      // halfway bug: transparent geometry draws after ALL opaque
      // geometry, so the terrain no longer gets a turn after this.
      transparent: true,
      blending: THREE.AdditiveBlending,
      // THIS ONE FLAG WAS THE "LIT ONLY HALFWAY".
      //
      // The blade is opaque - alpha 1.0, no blending - but it was set
      // not to write depth, so it painted colour into the framebuffer
      // without ever claiming those pixels. Through the open slit there
      // is no stone to write depth either, so the buffer stayed at the
      // clear value and ANY geometry drawn afterwards passed the test
      // and overwrote the light.
      //
      // Above the horizon the slit opens onto sky, nothing is drawn
      // after it, and the blade survives at full strength. Below the
      // horizon the slit opens onto the plain, the terrain draws later
      // and paints straight over it. That put a hard edge across the
      // seam at exactly the horizon line - and the horizon moves with
      // the camera, which is precisely why the cut-off slid up and down
      // the spire on every camera move.
      //
      // Ruled out along the way, so none of it gets retried: not length
      // (184 tall spans the whole slit), not intensity (1.9 to 1.2 left
      // the ratio identical), not occlusion (depthTest off changed
      // nothing at all), and not width (a 14-unit plane widened the lit
      // part above the line and moved the line not one pixel).
      depthWrite: true
    });
    {
      // 184 tall at y=90 covers the whole slit top to bottom, and
      // z=-2.2 keeps the plane inside the slot: the prongs are
      // 17*(1-0.9t) deep, so the shallowest point the plane reaches is
      // still 2.7 deep and no thickness can ever stand in front of it.
      //
      // 14 wide, against a slit that is 10 across at its widest. The
      // plane must always be wider than the hole - see the shader - or
      // the light reads as a solid bar high up and a thread at the
      // foot. The overspill is buried in stone at every height: the
      // prongs run from the cut plane out to 31*(1-0.9t), which is
      // never less than 5 units of cover on each side.
      const fis = new THREE.Mesh(new THREE.PlaneGeometry(14, 184), this.fissureMat);
      fis.position.set(0, 90, -2.2);
      fis.frustumCulled = false;
      this.scene.add(fis);
    }

    // --- THE CORE HAZE ---
    // The spec asks for slight volumetric haze near the core. This is
    // a camera-facing sheet standing in the slit plane: air catching
    // the fissure, densest at the foot where the light pools.
    {
      const hazeMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out vec2 vH;
          void main() {
            vH = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          precision highp float;
          in vec2 vH;
          uniform float uSeverity;
          uniform float uDecay;
          out vec4 outColor;
          void main() {
            // a plume: soft at the foot, narrowing as it rises, never a
            // hard shape - and never wider than the cut it belongs to.
            //
            // THIS WAS THE "LIT ONLY HALFWAY". The seam was colour-coded
            // bottom-red / top-green and sampled down the frame. Above
            // screen y=740 the readings varied red-to-green, which is the
            // fissure plane itself. Below y=760 red and green came back
            // EQUAL - flat grey, not this gradient at all. What sat there
            // was THIS sheet: on a 46-unit plane, 0.10 + 0.34*rise made it
            // up to twenty units across against the fissure's 4.6, so it
            // spilled well outside the slit and laid a soft grey band down
            // the lower monument. The eye read one light that went dim at
            // a fixed height, and it appeared to move with the camera
            // because the crossover depends on the viewing angle. Neither
            // a length problem nor an occlusion problem, which is why a
            // taller plane and a forward move both failed to shift it.
            //
            // Air beside the cut, never a stand-in for it.
            float rise = vH.y;
            float w = 0.035 + 0.055 * rise;
            float across = smoothstep(w, 0.0, abs(vH.x - 0.5));
            float fade = smoothstep(0.0, 0.05, rise) * smoothstep(1.0, 0.30, rise);
            vec3 tint = mix(vec3(1.0, 0.99, 0.97), vec3(0.80, 0.88, 1.0), uSeverity);
            outColor = vec4(tint * across * fade * 0.075 * (1.0 - uDecay * 0.6), 1.0);
          }`,
        uniforms: { uSeverity: { value: 0 }, uDecay: { value: 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide
      });
      this.hazeMat = hazeMat;
      const haze = new THREE.Mesh(new THREE.PlaneGeometry(46, 120), hazeMat);
      haze.position.set(0, 58, -3.5);
      haze.frustumCulled = false;
      this.scene.add(haze);
    }

    // --- THE FIELD ---
    // NOT more spires. Twenty-six miniature copies of the hero gave the
    // eye rivals and broke the brief's one-object rule, which is why
    // they read wrong at every scale I tried. The plain is populated
    // with what the system LEAVES instead: low broken remains, flat and
    // horizontal, so nothing out there competes with a vertical hero.
    {
      const N = 120;
      const rng = mulberry32ish(world.seed ^ 0x5f1e);
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = rng() * Math.PI * 2;
        const d = 210 + Math.pow(rng(), 0.6) * 1500;
        const cx = Math.cos(a) * d;
        const cz = Math.sin(a) * d;
        // a slab lying in the dirt: long, low, and turned any way
        const len = 8 + rng() * 46 + d * 0.012;
        const hgt = 1.4 + rng() * 7.5 + d * 0.004;
        const rot = rng() * Math.PI;
        const tx = Math.cos(rot);
        const tz = Math.sin(rot);
        const b = pos.length / 3;
        for (const sgn of [-1, 1]) {
          pos.push(cx + tx * len * sgn, -1.0, cz + tz * len * sgn);
          pos.push(cx + tx * len * sgn * 0.72, hgt, cz + tz * len * sgn * 0.72);
        }
        idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fg.setIndex(idx);
      this.fieldMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out float vDist;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          precision highp float;
          in float vDist;
          uniform float uTime;
          uniform float uSeverity;
          uniform vec3 uFog;
          out vec4 outColor;
          void main() {
            vec3 col = vec3(0.010, 0.011, 0.014);
            float fog = 1.0 - exp(-vDist * vDist * 0.0000019);
            outColor = vec4(mix(col, uFog, clamp(fog, 0.0, 1.0)), 1.0);
          }`,
        uniforms: {
          uTime: { value: 0 },
          uSeverity: { value: 0 },
          uFog: { value: new THREE.Color('#07080a') }
        },
        side: THREE.DoubleSide
      });
      const field = new THREE.Mesh(fg, this.fieldMat);
      field.frustumCulled = false;
      this.scene.add(field);
    }

    // THE CHOIR is no longer built here. Five transparent swaying
    // billboards were the wrong quality level for the idea; the real
    // masses are authored geometry in ChoirGroup, loaded from
    // choir.glb, and they never move.
    this.choir = new ChoirGroup(this.scene);

    // --- DRIFTING MIST ---
    // Low banks crossing the field. Movement across the frame, which
    // is what a still background was missing; slow enough that nothing
    // in it can be watched.
    {
      this.mistMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out vec3 vM;
          void main() {
            vM = position;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          precision highp float;
          in vec3 vM;
          uniform float uTime;
          uniform vec3 uFog;
          out vec4 outColor;
          float mh(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
          float bank(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x),
                       mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            vec2 q = vec2(vM.x * 0.0032, vM.z * 0.0032);
            float d = bank(q + vec2(uTime * 0.0065, uTime * 0.0022));
            d *= bank(q * 2.1 - vec2(uTime * 0.004, 0.0));
            float body = smoothstep(0.22, 0.75, d);
            float fade = smoothstep(0.0, 1.0, clamp(vM.y / 34.0, 0.0, 1.0));
            // The "slow light crossing the plain" sweep is REMOVED, on
            // Jacob's instruction 2026-08-19. It was tuned to blend
            // into a neutral grey sky; against a cold blue one it read
            // as a warm glowing patch sitting on the ground with no
            // source, which is the most obviously wrong thing a frame
            // can have. The banks still drift, so the movement it was
            // there for survives without the blob.
            outColor = vec4(uFog * (2.6 * body) * (1.0 - fade) * 0.5, 1.0);
          }`,
        uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color('#07080a') } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide
      });
      for (let layer = 0; layer < 3; layer++) {
        const g = new THREE.PlaneGeometry(2600, 2600);
        const m = new THREE.Mesh(g, this.mistMat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 6 + layer * 11;
        m.frustumCulled = false;
        this.scene.add(m);
      }
    }

    // --- DISTANT RIDGES ---
    // Depth behind the monument: low broken silhouettes that give the
    // haze something to sit in front of, and give the spire a world.
    {
      const ridgeMat = new THREE.MeshBasicMaterial({ color: 0x090a0d, fog: true });
      const rng = mulberry32ish(world.seed ^ 0x1d6e);
      for (let ring = 0; ring < 3; ring++) {
        const dist = 620 + ring * 260;
        const pts: number[] = [];
        const idx: number[] = [];
        const segs = 90;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          const h = (14 + rng() * 46) * (1 - ring * 0.2);
          pts.push(Math.cos(a) * dist, 0, Math.sin(a) * dist);
          pts.push(Math.cos(a) * dist, h, Math.sin(a) * dist);
          if (i < segs) {
            const b = i * 2;
            idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        g.setIndex(idx);
        const m = new THREE.Mesh(g, ridgeMat);
        m.frustumCulled = false;
        this.scene.add(m);
      }
    }

    // --- atmosphere ---
    // THE BACKING HALO IS REMOVED, 2026-08-19. A 180 unit additive
    // sprite off to the left at low height, and the bright patch on the
    // plain Jacob asked to lose. It is worth recording WHY it can go
    // rather than just that he said so: it existed to separate a
    // near-black form from a near-black sky, by backlighting the
    // silhouette. That condition no longer holds. The sky is cold blue
    // and the key rakes side-on, so the form is separated by hue and by
    // modelling, and the halo had nothing left to do except sit there
    // glowing with no source.
    //
    // Its two placement laws stand for anything that replaces it: never
    // on the axis, because an additive sprite there paints over every
    // surface behind it and washes the far horn to a ghost; and NEVER
    // in the gap between the horns, because a lit void framed by two
    // curved forms is an eye, which is a kill word this project has
    // already paid for once.
    //
    // The crown light stays. It belongs to the tall horn alone, it is a
    // third the size, and it reads as part of the fissure rather than
    // as weather.
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
      // not added to the scene: drifting points read as dust, and dust
      // is a kill word on this project. The air is carried by the sky
      // strata and the core haze instead
      void mg;
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
      // 0x050607 put the hero BELOW the sky in value, so it could only
      // ever be a silhouette. 0x0c0e12 overcorrected into a pale flat
      // grey. The band is bought with the KEY now, not the albedo - see
      // the rig note above - so the stone comes back down to something
      // that is still near-black sintered graphite by the SIGNAL SKIN
      // spec and lets the light do the modelling.
      color: 0x090b0f,
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
uniform float uGTime;
uniform float uGBite;
uniform float uGHaze;
float gHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
${SKY_LAW}`
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
  // wet sheen in the middle distance. This was carrying the comment
  // about resolving into a horizon and it never could: past about a
  // thousand units the fog owns the pixel outright and no albedo
  // survives it. The horizon is done below, in the fog itself
  diffuseColor.rgb += vec3(0.020, 0.021, 0.026) * smoothstep(120.0, 620.0, r);
  // the same sintered grain the skin carries, at floor scale
  float g = gHash(floor(vGroundW.xz * 1.6));
  diffuseColor.rgb *= 0.86 + 0.28 * g;

  // THE CONTACT. The plain is not intact where the mass went into it.
  // Jacob: the hero reads as "a prop rather than holy" - a thing placed
  // on ground rather than standing in a world that has answered it. The
  // answer is consequence, not scenery: the plain carries the same
  // plate failure the skin does, and the fissure finds the seams it
  // opened. The mechanism is the form.
  //
  // Seams are the ZERO SET of a warped field divided by its own
  // gradient - not a threshold on noise, and not cells. A threshold
  // admits half the volume and reads as smoke; cells always resolve
  // into a repeating unit, which is what killed the Voronoi core.
  // Dividing by the gradient gives every seam the same width however
  // steep the field is there, which is what makes it read as fracture.
  float bite = 1.0 - smoothstep(46.0, 215.0, r);
  if (bite > 0.0015) {
    vec2 q = vGroundW.xz * 0.05;
    // warped BEFORE the field is taken, or the seams inherit the
    // noise's own roundness and come out as a lattice of bubbles
    q += (vec2(skyNoise(q * 0.8), skyNoise(q * 0.8 + 11.3)) - 0.5) * 2.2;
    float ff = skyFbm(q) - 0.4375;
    float grad = length(vec2(dFdx(ff), dFdy(ff))) + 1e-6;
    float seam = (1.0 - smoothstep(0.0, 3.0, abs(ff) / grad)) * bite;
    // a crack is a shadow before it is anything else
    diffuseColor.rgb *= 1.0 - seam * uGBite * 0.94;

    // AND THEN IT CARRIES. Which stretches of the network are live
    // drifts slowly, so it reads as charge finding a path through
    // broken ground.
    //
    // Deliberately NOT a wave travelling out from the foot. A radial
    // pulse on an axis is a ring, and a ring here is a radial bloom -
    // which is on the banned-construction list and is the single
    // easiest way to turn this into a portal. The light has to belong
    // to the fracture, not to the centre.
    //
    // It also grows with uGDecay, so the more the monument fails the
    // more the ground carries. The plain is part of the ledger.
    float chan = skyFbm(q * 0.42 + vec2(uGTime * 0.055, uGTime * -0.021));
    float live = smoothstep(0.46, 0.78, chan);
    float carry = seam * live * uGBite * exp(-r * 0.014);
    diffuseColor.rgb += lit * carry * (0.42 + 0.9 * uGDecay);
  }
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
            )
            .replace(
              '#include <fog_fragment>',
              `#ifdef FOG_EXP2
{
  // THE HORIZON, and the reason the shore does not simply move the old
  // edge further away. Fog carries the far plain to fogColor, which is
  // a good deal darker than the sky's glow at grazing angles, so a
  // plain that runs to the fog still cuts a straight line across it.
  // Out here the ground fogs toward the SKY instead, evaluated along
  // its own bearing so the azimuth drift matches at the join. The
  // plain stops being an object with an edge and becomes distance.
  // THE GROUND HAZE, 2026-08-21. Jacob: "the ground is too bright now,
  // keep hero fix".
  //
  // Measured first, and it killed three guesses. Cutting the plain's
  // albedo to a quarter moved it 16 percent; sanding it fully matte,
  // 22 to 33; dropping its skylight to nothing, 2. None of those is
  // what lights this plain. What lit it was that it had STOPPED being
  // fogged: the landing air was thinned from 0.0022 to 0.00106 to give
  // the hero its stone back, and the plain took the same gift, which it
  // did not need. Fog was always the term holding the ground down.
  //
  // So the air gets its height back instead. FogExp2 is uniform in y,
  // which no air is: haze pools low, and the plain lies in it along its
  // whole length while the monument stands up out of it. uGHaze is how
  // much denser the air is down here than at the hero's mid-height, so
  // the ground fogs as it did before and the hero keeps its 35 percent.
  // One lever, on the term that was doing the work all along.
  float gDensity = fogDensity * uGHaze;
  float fogFactor = 1.0 - exp(-gDensity * gDensity * vFogDepth * vFogDepth);
  vec3 bearing = normalize(vec3(vGroundW.x - cameraPosition.x, 0.0, vGroundW.z - cameraPosition.z));
  // lid amount is zero here on purpose: the bearing is horizontal, so
  // the lid contributes nothing at the horizon anyway and the ground
  // does not need a second uniform to say so
  // The blend starts at 2400, not at 700, and that number is the
  // furthest thing standing on the plain rather than a taste call.
  //
  // Objects fog to fogColor. This ground fogs toward the SKY. At the
  // same distance that leaves the ground bright and the object black,
  // so a distant mass became a silhouette sitting on a bright strip -
  // which is what "its hovering" actually was, and it was my own
  // horizon fix causing it. The furthest choir mass is at radius 2091,
  // so out to 2400 the ground stays fogColour and a foot merges into
  // ground of its own tone. Only past everything that stands on the
  // plain does it fade into the sky, and it reaches full sky by the
  // shore's rim, so the horizon still has no edge.
  //
  // ANYTHING PLACED FURTHER OUT THAN 2400 WILL HOVER AGAIN.
  vec3 far = mix(fogColor, skyAt(bearing, cameraPosition, uGSeverity, 0.0, 0.0, 1.0, 0.0, uGTime), smoothstep(2400.0, 3550.0, length(vGroundW.xz)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, far, fogFactor);
}
#endif`
            );
        };
        gltf.scene.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh) return;
          const mesh = o as THREE.Mesh;
          if (mesh.name === 'Terrain') {
            const ground = new THREE.Mesh(mesh.geometry, terrainMat);
            ground.frustumCulled = false;
            this.scene.add(ground);
            this.scene.add(buildShore(mesh.geometry, terrainMat));
            return;
          }
          const body = new THREE.Mesh(mesh.geometry, this.monoMat);
          body.frustumCulled = false;
          this.scene.add(body);
        });
      })
      .catch((e) => {
        console.error('monument.glb failed to load; debris continues without its body', e);
      });
  }

  /**
   * Pin the lid's presence, 0 to 1, overriding the severity ramp.
   * Review affordance only, and the reason the ramp's two endpoints are
   * measured frames rather than numbers someone wrote down.
   */
  setLid(amount: number): void {
    this.lidOverride = Math.max(0, Math.min(1, amount));
    this.skyMat.uniforms.uLid!.value = this.lidOverride;
  }

  /** How far the decks bend toward the axis, 0 to 1. Review pin. */
  setDraw(amount: number): void {
    this.skyMat.uniforms.uDraw!.value = Math.max(0, Math.min(1, amount));
  }

  /** Deck anisotropy: 1 is the approved isotropic sky, lower is more
   *  layered. Review pin, because it changes an approved frame. */
  setStrata(amount: number): void {
    this.skyMat.uniforms.uStrata!.value = Math.max(0.1, Math.min(1, amount));
  }

  /** How open the shaft is, 0 to 1. Review pin. */
  setShaft(amount: number): void {
    this.skyMat.uniforms.uShaft!.value = Math.max(0, Math.min(1, amount));
  }

  /** How lit the choir masses are, 0 to 1. Review pin. */
  setChoirDim(amount: number): void {
    this.choir.setDim(amount);
  }

  /** Landing air density, FogExp2. Review pin; see THE AIR. */
  setFog(density: number): void {
    this.landingFog = Math.max(0, Math.min(INTERIOR_FOG, density));
  }

  /** Air density at the plain, as a multiple of the hero's. See THE GROUND HAZE. */
  setGround(amount: number): void {
    this.groundU.uGHaze!.value = Math.max(1, Math.min(6, amount));
  }

  /** How far the plain has failed at the foot, 0 to 1. Review pin. */
  setBite(amount: number): void {
    this.groundU.uGBite!.value = Math.max(0, Math.min(1, amount));
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
      this.landingFog +
      (INTERIOR_FOG - this.landingFog) *
        smooth01(progress, 0.3, 0.7) *
        (1 - smooth01(progress, 0.86, 0.97));
    const fogColor = lerpColor('#05070c', '#03050b', sev);
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

    for (const mat of [this.cladMat]) {
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
    // THE LID'S PRESENCE. Jacob approved two frames, and they are not
    // the same setting: the landing frame at 0.30 and the studio foot
    // at 0.85. One global value cannot serve both - 0.85 at landing
    // announces a roof, which he explicitly forbade, and 0.30 at the
    // foot is invisible. So presence rides severity, which is 0.0 at
    // the landing key and 0.88 at the foot, and 0.30 + 0.625 * sev
    // lands on his two frames exactly.
    //
    // This is also the read he specified: first depth, then WRONG
    // depth. The enclosure becomes apparent as the world turns, and it
    // rides the same grade that already moves the whole palette rather
    // than being a new kind of change in the sky.
    //
    // Note the lid is scaled by `glow`, which cools and dims with
    // severity. That coupling is NOT a bug to fix: it is part of what
    // produced the frame he approved, and removing it would make the
    // foot 1.6x brighter than what he saw.
    if (this.lidOverride === null) {
      this.skyMat.uniforms.uLid!.value = 0.3 + 0.625 * sev;
    }
    this.fissureMat.uniforms.uSeverity!.value = sev;
    this.fissureMat.uniforms.uDecay!.value = decay;
    this.fissureMat.uniforms.uNear!.value = inside;
    this.fieldMat.uniforms.uTime!.value = reduced ? 0 : this.time;
    this.mistMat.uniforms.uTime!.value = reduced ? 0 : this.time;

    (this.mistMat.uniforms.uFog!.value as THREE.Color).copy(fogColor);
    this.fieldMat.uniforms.uSeverity!.value = sev;
    (this.fieldMat.uniforms.uFog!.value as THREE.Color).copy(fogColor);
    this.hazeMat.uniforms.uSeverity!.value = sev;
    this.hazeMat.uniforms.uDecay!.value = decay;
    this.skyMat.uniforms.uTime!.value = reduced ? 0 : this.time;
    this.groundU.uGTime!.value = reduced ? 0 : this.time;
    this.groundU.uGSeverity!.value = sev;
    this.groundU.uGDecay!.value = decay;
    // bloom must not smear the fissure across the walls in there
    this.bloom.strength = 0.34 * (1 - inside * 0.72);

    // holiness dims as the monument strips, and never smears the lens
    const crownFade = smooth01(this.camera.position.distanceTo(this.crownHalo.position), 40, 95);
    const breath = reduced ? 1 : 0.88 + 0.12 * Math.sin(this.time * 0.22);
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

    for (const mu of [this.stoneU]) {
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

    // the choir: three inputs, none of which move a single vertex
    this.choir.update({ progress, severity: sev, alignment: alignAmt });

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
