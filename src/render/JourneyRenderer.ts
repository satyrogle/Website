import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
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
// THE ROT ANSWERS THE WATCHER. The world height it is attending to, and
// how present it is. The MASS reacting to where the visitor points is
// far worse than a light doing it alone - it means the monument is
// aware, not that there is a lamp inside it.
uniform float uWatchY;
uniform float uWatchAmt;
// gate 3: how hard the sky's grazing light finds the outer edges
uniform float uRim;
// NO WAKE ON THE STONE. Three passes put a travelling front on the face
// here - into the rot's emission, then into the albedo - and Jacob
// rejected all three. Measuring the leaving against the build he liked
// says why: the ripple he asked for was never on the stone. It was the
// SEAM crossing the bloom threshold, and it lives in the fissure
// material now. See THE SURGE there.
// presses: xyz world position, w born time in seconds
uniform vec4 uMarks[12];
uniform int uMarkN;
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
  // SIGNED, so it crosses BOTH spires as one event. Jacob: "tilt it
  // horizontally so it is on both of the spires". Unsigned, outward is
  // 0 at the cleft on each blade and 1 at each outer edge, so a band
  // built on it comes out MIRRORED - two symmetric marks, which reads
  // as decoration rather than as something that happened. Multiplying
  // by sideS runs the coordinate continuously from the left blade's
  // outer edge, through the cleft, to the right blade's outer edge, so
  // the band carries across the gap and the texture lines up either
  // side of it.
  float cS = sideS * clamp(outward, 0.0, 1.0);

  vec2 CP = vec2(cS * 34.0, vMonoW.y);
  vec2 BP = vec2(cS * 95.0, vMonoW.y);

  // the band: one SHALLOW diagonal crossing the whole monument. 0.497
  // over 0.868 rose 0.57 per unit across, which on a coordinate now
  // spanning both blades would climb a hundred and ten units and stand
  // the band on end. 0.287 over 0.958 gives about fifty over the full
  // width - a tilt, not a climb.
  const float CCA = 0.958, CSA = 0.287;
  // LOWERED, Jacob 2026-08-21. The offset IS the crossing height: at
  // the cleft the coordinate is zero, so the centreline sits at
  // offset / 0.958. 91 put it at y=95, mid-height. 60 puts it at 63,
  // low on the mass where the blades are broad.
  float cAcross = -BP.x * CSA + BP.y * CCA - 60.0;
  float cAlong  =  BP.x * CCA + BP.y * CSA;

  // THE LOWER BOUNDARY DISSOLVES; IT IS NOT CUT. Jacob: "its in a
  // straight line no matter you added the weeping ... can you make it
  // zig zag like top part of rot", then chose dissolving over jagged.
  //
  // step() on a constant value of the band's own axis is a
  // mathematically perfect diagonal, so the edge read as drawn however
  // much weeping hung below it - the runs broke the silhouette, they
  // could not break the LINE. And the top of the rot was never like
  // that: its edge is irregular because three things vary along it -
  // the centreline wanders, the half width breathes, and a clustering
  // field eats into it. The bottom had none of that, because it was one
  // number.
  //
  // So the same mechanism now works the bottom. A soft ramp replaces
  // the step, and a clustering field breaks it into patches - weighted
  // so it only bites NEAR the boundary and leaves the body of the band
  // solid. The result has no line anywhere: the rot thins into stone.
  float cSoft = smoothstep(-70.0, -20.0, cAcross);
  float cBreak = smoothstep(0.26, 0.70,
    monoFbm(vec2(cAlong * 0.050, cAcross * 0.070 + 61.0)));
  float cCut = cSoft * mix(cBreak, 1.0, cSoft * cSoft);

  // THE CROWN STAYS CLEAN. Jacob: "dim the static on the top". Up there
  // the band and its cracks thin out into scattered grain, and
  // scattered grain on a near-black spire against a dark sky is
  // STATIC - it stops reading as corrosion and starts reading as noise
  // in the image. The corrosion fades out over the upper third so the
  // crown is stone again.
  float cTop = smoothstep(170.0, 96.0, vMonoW.y);

  cAcross += 26.0 * (monoFbm(vec2(cAlong * 0.010, 5.0)) - 0.5);
  // WIDER. 30 to 50 read as a belt across a tall mass; 46 to 76 gives
  // the corrosion a territory, which is what the references show.
  float cHalf = 46.0 + 30.0 * monoFbm(vec2(cAlong * 0.014, 11.0));
  float band = 1.0 - smoothstep(cHalf * 0.22, cHalf, abs(cAcross));
  // clustered, so it takes hold in patches rather than filling the band
  band *= smoothstep(0.30, 0.66, monoFbm(vec2(cAlong * 0.035, cAcross * 0.048)) * 0.55 + band * 0.62);
  band *= smoothstep(-12.0, 3.0, vMonoW.z) * cCut * cTop;

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
  // the halo multiplier comes down as the band widens, or the cracks
  // scale with it and swallow the intact stone again
  float halo = 1.0 - smoothstep(cHalf * 0.7, cHalf * 1.55, abs(cAcross));
  halo *= smoothstep(-12.0, 3.0, vMonoW.z) * cCut * cTop;
  float cCrack = smoothstep(0.76, 0.99, cWebRaw)
               * smoothstep(0.48, 0.82, monoFbm(CP * 0.14 + 31.0))
               * halo * (1.0 - band * 0.85);

  // ---- GATE 4: MACRO CONCEALS, MICRO REVEALS ----
  // The reference picture, 2026-08-22. At the opening distance the web
  // resolved to a field of white dots covering two thirds of the face -
  // every vein is a couple of pixels at any range, so distance turns
  // structure into coverage, and coverage kills the material read. The
  // picture's faces are mostly clean dark stone broken by a FEW large
  // fractures that catch light.
  //
  // So the read is graded by distance, which is this project's own law
  // applied to its own skin. Far away the fine web and the runs fade
  // and a sparse set of macro fractures carries the corrosion's
  // presence; close in, the fractures stay physical and the web comes
  // back as the discovery. The FIELDS are untouched - band, pits, web,
  // cracks, engine glint, watcher response, presses all keep their
  // mechanism - only what the eye is given at each range changes.
  float viewDist = length(vViewPosition);
  float far = smoothstep(80.0, 240.0, viewDist);
  float webVis = 1.0 - far * 0.85;

  // the macro fractures: the same level-set-over-gradient family as the
  // web, an order of magnitude coarser, so they are continuous with it
  // rather than a second language. The gradient divide keeps each break
  // a clean line at every distance instead of dissolving.
  vec2 mq = CP * 0.075;
  mq += (vec2(monoFbm(mq * 0.5 + 7.0), monoFbm(mq * 0.5 + 23.0)) - 0.5) * 1.8;
  float mf = monoFbm(mq) - 0.5;
  float mg = length(vec2(dFdx(mf), dFdy(mf))) + 1e-6;
  float mLine = 1.0 - smoothstep(0.0, 1.7, abs(mf) / mg);
  // few survive: a slow selector breaks the network into three or four
  // long breaks per face rather than a lattice
  float mSel = smoothstep(0.84, 0.98, monoFbm(CP * 0.016 + 51.0));
  float mFrac = mLine * mSel * halo;
  // a break is a lip that catches light, strongest where the light
  // rakes - the scratch law at fracture scale. It strengthens with
  // distance as it takes the web's job, and stays modest up close.
  diffuseColor.rgb += diffuseColor.rgb * mFrac * (0.8 + 1.3 * graze) * (0.4 + 0.6 * far);
  diffuseColor.rgb += vec3(0.050, 0.055, 0.066) * mFrac * far;
  vMonoRough = clamp(vMonoRough - mFrac * 0.16, 0.05, 0.95);

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
  // gate 4: the fine web is the close-range discovery. webVis fades its
  // LIGHT at distance; the field itself never moves.
  diffuseColor.rgb += diffuseColor.rgb * cWeb * band * (1.6 + 0.9 * graze) * webVis;
  diffuseColor.rgb += vec3(0.058, 0.063, 0.072) * cWeb * band * webVis;

  // the runs: fine vertical streaks descending out of the band, where
  // it has wept down the face. Broken, because a dried run is dotted
  // THE WEEPING, HUNG FROM THE CUT. Jacob: "the cut looks straight add
  // some weeping to it maybe".
  //
  // It was sourced from the band above and then killed below the cut,
  // which is what left the edge reading as a ruled line. Now it hangs
  // FROM the cut itself and lives only below it, so the same term that
  // makes the boundary coherent also breaks it: threads of uneven
  // length reach past the line by different amounts and the straight
  // edge stops being straight without being blurred.
  //
  // Distance below the cut, in world units: cAcross carries CCA per
  // unit of height, so dividing by it converts back.
  float belowCut = max(0.0, -(cAcross + 30.0) / CCA);
  // Asymmetric on purpose. Jacob marked the left spire and asked the
  // weeping there to "stop at the line": on that blade the runs barely
  // clear the cut, just enough to keep the edge from reading as ruled,
  // while the right keeps its length. The two sides are not meant to
  // match - a symmetric pair of drip curtains would be the decoration
  // problem again, and the corrosion already crosses the cleft as one
  // event, so it can weep unevenly the way anything real does.
  float cSideLen = sideS < 0.0 ? 0.26 : 1.0;
  float cSideAmt = sideS < 0.0 ? 0.55 : 1.0;
  float cLane = monoHash(vec3(floor(cS * 52.0), 21.0, sideS));
  float cRunLen = (5.0 + 26.0 * fract(cLane * 5.3)) * cSideLen;
  float cRun = step(0.48, cLane)
             * step(0.52, monoNoise(vec2(cS * 96.0, vMonoW.y * 0.85)))
             * smoothstep(cRunLen, cRunLen * 0.12, belowCut)
             * smoothstep(-12.0, 3.0, vMonoW.z) * cSideAmt;
  // dimmer again, Jacob 2026-08-21: the runs support the cut edge, they
  // are not a feature of their own. Gate 4: and they are micro detail,
  // so they fade at range with the web.
  diffuseColor.rgb += diffuseColor.rgb * cRun * (0.45 + 0.35 * graze) * webVis;
  diffuseColor.rgb += vec3(0.016, 0.018, 0.021) * cRun;

  // the cracks are thin bright residue too, and fainter than the band
  diffuseColor.rgb += diffuseColor.rgb * cCrack * (1.2 + 0.8 * graze);
  diffuseColor.rgb += vec3(0.040, 0.044, 0.051) * cCrack;

  // roughness follows the damage: the pits are matte voids, the cWeb is
  // a hard remaining edge
  vMonoRough = clamp(vMonoRough + cPit * 0.30 - (cWeb * band + cCrack * 0.6 + cRun * 0.25) * 0.22, 0.08, 0.96);

  // THE WEB EMITS, NOT THE PITS. Jacob: "i think we are emitting the
  // wrong shader of rot emit the other stuff not the ones already".
  //
  // The pits were carrying it, on the idea that light comes from inside
  // the holes. But the pits are the part that is GONE - the voids - and
  // a void has nothing to emit. What is left standing is the web, the
  // surviving lace between the holes, and that is the material the rot
  // has actually turned into. So it is the web that glows, the cracks
  // that carry it out past the band, and the weeping that carries it
  // down.
  //
  // Kept at the same threshold as before: on stone this dark, anything
  // the eye can call a patch is too much, and the fissure must stay the
  // only real light in the frame.
  // THE PRESSES EAT THE STONE. A sprite at a press point is a decal
  // however it is drawn - filled it was a pimple, and as a bare ring at
  // landing distance it was STILL a white speck, because a ring under
  // twenty pixels is indistinguishable from a dot. So no sprite: the
  // press joins the corrosion field itself. Each mark darkens a small
  // bitten patch of face and rims it with the same pale residue the rot
  // carries, so a visitor's touch is a place the monument has been
  // EATEN, in the one language this surface already speaks.
  // A ROUND BITE IS A PIMPLE. Jacob, after gate 4 cleaned the face:
  // "pimples are popping". The old mark was a radial pit with a pale
  // ring, opening in half a second - and on calm stone a disc arriving
  // fast reads as a blemish popping in, whatever it is made of. Three
  // changes, all toward the corrosion's own language:
  //
  // 1. The local vesicular field decides what survives inside the bite,
  //    so a mark is ragged and directional like the rot, never a coin.
  // 2. It seeps in over about two seconds instead of popping in half of
  //    one. An opening performs; a taking does not.
  // 3. The rim is nearly gone - residue, not a ring. The DARKNESS is
  //    the mark.
  float mkPit = 0.0;
  float mkRim = 0.0;
  for (int mi = 0; mi < 12; mi++) {
    if (mi >= uMarkN) break;
    float md = distance(vMonoW, uMarks[mi].xyz);
    float age = uTime - uMarks[mi].w;
    if (age < 0.0 || md > 6.0) continue;
    float grow = clamp(age * 0.55, 0.0, 1.0);
    float mr = (1.3 + 0.9 * monoHash(vec3(uMarks[mi].xyz))) * grow;
    // ragged edge, from the same hash family as everything else here
    float wob2 = 0.75 + 0.5 * monoNoise(vec2(vMonoW.y * 1.7 + uMarks[mi].w, md * 2.2));
    float body = smoothstep(mr * wob2, mr * wob2 * 0.35, md);
    // eaten in the rot's own pattern: cf is the corrosion field already
    // computed above, so the bite and the band share one structure
    float eaten = 0.40 + 0.60 * smoothstep(0.14, -0.10, cf);
    mkPit = max(mkPit, body * eaten);
    mkRim = max(mkRim, exp(-pow((md - mr * wob2) / 0.5, 2.0)) * 0.22 * grow);
  }
  diffuseColor.rgb *= 1.0 - mkPit * 0.72;
  vMonoRough = clamp(vMonoRough + mkPit * 0.3, 0.05, 0.96);

  float wResp = exp(-pow((vMonoW.y - uWatchY) * 0.017, 2.0)) * uWatchAmt;
  vMonoEng = (cWeb * band * 0.028
            + cCrack * 0.020
            + cRun * 0.005) * (1.0 - uCalm * 0.45)
            * (1.0 + wResp * 2.2)
            + mkRim * 0.016 * (1.0 - uCalm * 0.45);
  }
}`;

const FRAG_EMISSIVE = `#include <emissivemap_fragment>
if (gl_FrontFacing) {
  float heightT = clamp(vMonoW.y / 195.0, 0.0, 1.0);
  vec3 sig = mix(vec3(1.0, 0.98, 0.94), vec3(0.72, 0.86, 1.0), uSeverity);
  // only fragments ever light, and they are small and hard edged
  totalEmissiveRadiance += sig * vMonoEng * 2.4;
  // NO HOVER LAMP. Jacob: "when you hover cursor over the spire there
  // is glow as well which is undercutting the sinister part".
  //
  // He is right, and the cause is that TWO things answered the pointer
  // and they were saying opposite things. A soft warm pool under the
  // cursor is an interaction affordance - it means "you may touch
  // this", which is welcoming - and the watcher in the cleft means
  // something is aware of you. Run together, the friendly one wins,
  // because a glow under your hand is the older and more familiar
  // signal.
  //
  // One input, one response, and it is the predatory one. The press
  // still works and still writes to the ledger; it simply no longer
  // announces itself in advance.
  if (uInnerAmt > 0.001) {
    vec3 iv = uInner - vMonoW;
    totalEmissiveRadiance += vec3(0.45, 0.5, 0.6) * (uInnerAmt / (1.0 + dot(iv, iv) * 0.02));
  }

  // ---- THE RIM ----
  // Gate 3 of the reference picture, 2026-08-22. With the sky dropped to
  // near-black (gate 1), the shadow side of the mass sank into it and the
  // silhouette died - the exact failure the skyAt comment predicts for a
  // near-black object on a near-black sky. The picture separates them
  // with pale light grazing the outer edges, sourced by its backlit
  // cloud break.
  //
  // Built as a fresnel response to SKY light, not a fixed backlight: the
  // camera orbits this monument across the whole journey, and a sun
  // nailed to one azimuth reads correctly from the opening and wrongly
  // from everywhere else. View-grazing edges catch a cold sky-coloured
  // light, biased upward twice - by the surface facing the sky and by
  // height on the mass - because the light this claims to be comes from
  // above. Fades with decay like everything else, and lives in the
  // material so the flat audit keeps it: this is the static-frame law
  // being served, not bloom.
  {
    vec3 rimV = normalize(vViewPosition);
    float graze = pow(1.0 - abs(dot(normal, rimV)), 3.0);
    // the sky is up: normals with any upward lean catch more of it
    float up = 0.35 + 0.65 * clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 rimC = mix(vec3(0.30, 0.38, 0.55), vec3(0.26, 0.36, 0.58), uSeverity);
    totalEmissiveRadiance += rimC * graze * up * (0.30 + 0.70 * heightT) * uRim * (1.0 - uDecay);
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
      // the hover lamp is gone here too - see the note in
      // FRAG_EMISSIVE. It was the warmest thing in the frame, at
      // (1.0, 0.88, 0.68), which is exactly why it read as an
      // invitation.
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
    // smaller, too: at 72 pixels a mark was a feature of the frame
    // rather than something the visitor left in it
    gl_PointSize = clamp(uScale * 1.35 * swell / dist, 2.0, 38.0);
  }
`;

const MARK_FRAG = /* glsl */ `
  precision highp float;
  in float vBorn;
  uniform float uTime;
  out vec4 outColor;
  void main() {
    // A MARK IS A HOLE, NOT A DOT. Jacob: "when i click on hero there
    // are small white sprouts sticking on hero like pimples".
    //
    // It was a soft round additive falloff - a filled bright disc stuck
    // on the surface, which is exactly what a pimple is. In a direction
    // where the stone is EATEN, a press has to open the surface, not
    // add something to it.
    //
    // So only the RIM lights. Additive cannot darken, but a lit ring
    // with nothing inside reads as an opening rather than a lump, and
    // the rim is irregular per mark so it is bitten rather than
    // stamped. The arrival still flares, briefly; what remains is a
    // small hole in the face carrying the same cold as the rot.
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float a = atan(d.y, d.x);
    float wob = 0.74 + 0.15 * sin(a * 5.0 + vBorn * 7.3)
                     + 0.07 * sin(a * 11.0 - vBorn * 3.1);
    float rim = exp(-pow((r - wob) / 0.15, 2.0));
    float ignite = clamp((uTime - vBorn) * 1.4, 0.0, 1.0);
    float flash = 1.0 - ignite;
    vec3 cold = vec3(0.72, 0.86, 1.0);
    vec3 col = cold * rim * (0.45 + 1.9 * flash)
             + cold * smoothstep(wob, wob * 0.5, r) * 0.10 * flash;
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

vec3 skyAt(vec3 d, vec3 eye, float sev, float lidAmt, float drawAmt, float strata, float shaftAmt, float breakAmt, float time) {
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
  //
  // GATE 1 OF THE REFERENCE PICTURE, 2026-08-22: the whole field drops to
  // about forty percent of that. Measured before the change, the clear
  // sky sat at 12.7/255 and the horizon at 15.2 - a broad mid-navy wash
  // that the monument's shadow side sank UNDER, so the frame read as a
  // grey-blue card with a dark cutout. The picture's sky is near-black
  // with structure. Hue untouched; the decks, lid and drift all scale
  // with these two, which is the point of them being the only two.
  vec3 base = mix(vec3(0.0017, 0.0024, 0.0048), vec3(0.0013, 0.0020, 0.0044), sev);
  vec3 glow = mix(vec3(0.0097, 0.0147, 0.0294), vec3(0.0055, 0.0092, 0.0210), sev);
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

  // ---- THE BREAK ----
  // Gate 5 of the reference picture, 2026-08-22. The picture's sky is
  // lit from one place: a torn opening in the weather above the tower,
  // and everything else - the rim on the outer edges (gate 3), the pale
  // crown, the silhouette - follows from that one source. Ours had a
  // halo sprite at the tips with no reason in the sky for it; this is
  // the reason, behind and above the crown, so the light the frame
  // already carries finally has a source.
  //
  // NOT a disc, and the guards are structural, not tuning. An eclipse
  // read needs a body with an edge: this is two very broad cosine
  // powers, its centre sits well ABOVE the tips (the sight line to it
  // from every journey camera clears the crown), and the decks occlude
  // it, so it arrives as weather torn open rather than as an object.
  // Severity takes it down by almost half: the return's sky closes.
  {
    // SUBORDINATED, sinister gate 3, 2026-08-22. As built for the
    // reference gate this had a broad pow(7) wing at full sky-blue,
    // and it read as its own celestial body - a moon behind the crown,
    // a SECOND light in a frame whose holiness depends on having one.
    // Two demotions:
    //
    // The wing collapses (pow 12 at a third of its weight), so the
    // break is a tear the crown's light escapes through, not a disc
    // with an atmosphere.
    //
    // And at rest its tint leans to the SEAM's warm white rather than
    // the sky's own blue, so the light up there is recognisably the
    // blade's, arrived in the air - the sky answering the seam, owning
    // nothing. Severity hands it back to the cold sky family as the
    // whole frame goes cold.
    vec3 toBreak = normalize(vec3(0.0, 360.0, 0.0) - eye);
    float bAlign = max(dot(d, toBreak), 0.0);
    float breakGlow = pow(bAlign, 34.0) * 0.72 + pow(bAlign, 12.0) * 0.10;
    breakGlow *= 1.0 - clamp(dens, 0.0, 1.0) * 0.55;
    vec3 bCol = mix(vec3(0.0315, 0.0300, 0.0270), glow * 1.05, sev * 0.8);
    col += bCol * breakGlow * breakAmt * (1.0 - sev * 0.45) * 2.0;
  }

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
  uniform float uBreak;
  uniform float uTime;
  out vec4 outColor;
  ${SKY_LAW}
  void main() {
    outColor = vec4(skyAt(normalize(vDir), cameraPosition, uSeverity, uLid, uDraw, uStrata, uShaft, uBreak, uTime), 1.0);
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
  private readonly grade: ShaderPass;
  /** ?flat=1: bloom held at zero so the static frame is audited bare */
  flatAudit = false;
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
  private strataMat!: THREE.ShaderMaterial;
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
  /** seconds since attention left the mass; 99 until it ever has */
  private wakeT = 99;
  /** the height along the seam it left from, 0 foot to 1 crown */
  private wakeY = 0.5;
  private parX = 0;
  /** the watcher's smoothed aim, and how present it is */
  private watchX = 0;
  private watchY = 0;
  private watchAmt = 0;
  /** false until the first pointer ever enters: the idle-attention gate */
  private everPointed = false;
  private watchDrift = 0;
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
    // THRESHOLD 0.78, NOT 1.0. At 1.0 the seam's surge was either over the
    // line - a hard halo, which Jacob read as an object being carried
    // along the crack - or under it and completely invisible, with no
    // useful range between. Every attempt at "dim but still there" landed
    // in that gap. Dropping the line gives the front somewhere to fade
    // THROUGH, so its glow shrinks as it travels instead of holding.
    //
    // 0.78 is chosen against the resting frame, not for the surge: the
    // blade at rest is 0.68 at its brightest and the tone-mapped stone
    // sits well under that, so nothing that is lit now starts glowing.
    // Verified by diffing the resting frame across the change - the only
    // thing that moved was the seam during a wave.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.34, 0.5, 0.78);
    this.composer.addPass(this.bloom);

    // ---- THE GRADE ----
    // Gate 7 of the reference picture, 2026-08-22, and deliberately the
    // smallest gate: most of the picture's grade fell out of gates 1 and
    // 5 (the value flip and the break). What remained is a floor and a
    // curve. The black point clips the last of the atmospheric haze off
    // the deep sky, and a gentle pivot contrast in linear space snaps
    // the stone's mids apart before ACES rolls the shoulder. It runs
    // BEFORE tone mapping so it grades light, not pixels, and it stays
    // in the flat audit: a curve is part of the static frame, bloom is
    // not.
    this.grade = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          // 0.0035 / 1.07 crushed the break to a tight halo and put the
          // frame back under the 25 percent floor - the sky and the break
          // live exactly in the lows a black point eats. Halved and
          // gentled: the depth stays, the opening survives.
          uLift: { value: 0.0012 },
          uContrast: { value: 1.05 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float uLift;
          uniform float uContrast;
          varying vec2 vUv;
          void main() {
            vec3 c = texture2D(tDiffuse, vUv).rgb;
            c = max(c - uLift, 0.0);
            // pivot at mid-grey in linear, so shadows crush and
            // highlights open without the frame changing exposure
            c = pow(c / 0.18, vec3(uContrast)) * 0.18;
            gl_FragColor = vec4(c, 1.0);
          }`
      })
    );
    this.composer.addPass(this.grade);
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
        // gate 5: the torn opening above the crown. Review pin.
        uBreak: { value: 1.0 },
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
        uniform vec2 uWatch;
        uniform float uWatchAmt;
        // THE SURGE. Seconds since the visitor's attention left the mass,
        // the height along the seam it left from, and how hard the seam
        // answers. See the note beside the term.
        uniform float uWakeT;
        uniform float uWakeY;
        uniform float uSurge;
        uniform float uSurgeTime;
        uniform float uSurgeTail;
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
          // The beam is a hairline and stays one. What fills the rest of
          // the slot is BLACK, not a dim glow - see the occluder plane
          // below. Jacob: "lit the gap with black colour instead of
          // white". Adding light there was the wrong reading: the gap
          // was showing SKY through the open slit, so it needed
          // blocking, not lighting.
          float u = smoothstep(halfW, halfW * 0.72, d);
          // THE GAP AT THE CROWN. Jacob: "there is a gap between two
          // spires". The top fade ran over the last TEN percent of the
          // plane, which is 18 units, so the light died from about
          // y=164 - while the slit stays open to y=175, where the short
          // prong ends. Eleven units of open slit with no light behind
          // it, seen against the sky: a dark wedge between the two
          // tips, exactly where the eye goes first.
          //
          // The fade is now the last two percent. The blade runs to the
          // top of the slit and the stone closes it, which is the same
          // rule the width follows - the prongs decide the shape, not
          // the plane.
          float v = smoothstep(0.0, 0.04, vUvF.y) * smoothstep(1.0, 0.98, vUvF.y);
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
          // 1.2 clips the core to white down the entire length of the
          // blade. On an OLED that is not "bright", it is a strip of
          // full-output pixels in a frame that is otherwise near-black,
          // and it hurts to look at. It also costs the watcher its
          // effect, because a saturated pixel cannot get brighter where
          // the attention lands.
          float near = mix(0.68, 0.55, uNear);
          // ---- THE WATCHER ----
          // Jacob asked for "an eye or something sinister looking from
          // the middle of the light crack" that follows the cursor.
          //
          // NOT an eye. A lit void framed by two forms IS one, and
          // eye-of-sauron is a kill word this project has already paid
          // for - the law is written beside the crown halo. A literal
          // iris in the cleft is also "a fully obvious monster on first
          // load", which the reject list names outright.
          //
          // So the light WATCHES instead of looking. A concentration
          // slides along the blade to the pointer's height and the beam
          // tightens and brightens there, as though the attention of
          // whatever is behind the slit has moved. No iris, no pupil,
          // no shape that can be read as a face - the menace is that it
          // TRACKS, which is behaviour, and behaviour is what this
          // project is supposed to unsettle with.
          float watchY = 0.5 + uWatch.y * 0.34;
          float dy = vUvF.y - watchY;
          float node = exp(-dy * dy * 420.0);
          // it narrows where it concentrates: attention, not a lamp
          float pinch = 1.0 - 0.34 * node * uWatchAmt;
          u = smoothstep(halfW * pinch, halfW * pinch * 0.72, d);
          // and the far side of the slot dims as it turns, so the
          // concentration reads as facing somewhere rather than sitting
          float turn = 1.0 - 0.30 * uWatchAmt * node * abs(uWatch.x)
                     * step(0.0, -uWatch.x * (vUvF.x - 0.5));
          // BRIGHTENING DOES NOTHING HERE. The blade already clips to
          // white down its whole length, so a concentration that only
          // adds intensity is invisible - the pixels are saturated
          // before it starts. It has to work by the beam DIMMING
          // everywhere it is not attending to. That also reads better:
          // the light gathering somewhere is attention; the light
          // getting brighter everywhere is a lamp.
          // Deeper. At 0.38 the rest of the blade was still clearly lit,
          // so the concentration read as a highlight ON a light. At 0.20
          // the crack goes nearly out where it is not attending, and
          // what is left is one point of interest in a dead seam.
          float watch = mix(1.0, mix(0.20, 1.35, node), uWatchAmt);

          // ---- THE SURGE ----
          // Jacob, four times: "you removed the cool effect when you take
          // away the cursor from the hero it ripples through out", then
          // "not like the wave you built earlier", then "there is no
          // fucking wave", then "wave is still not fixed".
          //
          // Three passes answered that by building a travelling front on
          // the STONE. Driving the same leaving gesture against the build
          // he liked, frame by frame with the camera pinned, says the
          // ripple was never on the stone. At f864728 the seam sat at 1.2
          // and the bloom pass thresholds at 1.0, so the core cleared it
          // and a soft halo blossomed out across the whole frame. 3ef6cdf
          // took the blade to 0.68 to stop it burning on an OLED - which
          // it had to - and 0.68 can never reach 1.0, so the halo went out
          // in the same commit that removed the hover lamp. That is why it
          // read as the lamp's doing, and why three rebuilds of a "wave"
          // never brought it back.
          //
          // So the seam SURGES instead of sitting bright. Rest stays at
          // 0.68: nothing clips, nothing burns. When attention leaves the
          // mass the whole length briefly overshoots the bloom threshold
          // and settles. The ripple through the frame is the bloom
          // answering, which is what it always was.
          //
          // Added OUTSIDE watch on purpose. The watcher holds the seam at
          // a fifth of its level while a pointer is anywhere on the page,
          // and a surge multiplied by that could never reach the
          // threshold. This is the seam's own light, not the watcher's.
          // Jacob: "wave is too fast now", then "the wave isnt propagating
          // to each ends its just lame".
          //
          // The second note is the real one and he is right. Both earlier
          // shapes were f(time) ALONE: every point of the seam brightened
          // and dimmed in lockstep, so the whole length pulsed at once.
          // That is a swell, not a wave. Nothing travelled, and a wave
          // that does not travel has no reason to be called one.
          //
          // So it propagates. Jacob on the first travelling version: "the
          // propagation is bit too slow and the split is awkward,
          // execution flawless".
          //
          // IT SPLITS. Two fronts leave the height attention was at in the
          // same instant, one for the crown and one for the foot, and each
          // dies where it lands.
          //
          // Recorded because it cost four rounds: the split was RIGHT the
          // first time it was built. "the split is awkward" was read here
          // as remove the split, so it became one front to the crown -
          // "its only propagating towards crown" - and then a single front
          // that reflected off the crown and came back down, which reaches
          // both ends but never at the same time. None of that was asked
          // for. The note under "awkward" is the tail, not the topology,
          // and the tail is uSurgeTail now rather than another guess.
          //
          // BOTH ENDS ARE REACHED AT THE SAME MOMENT. The split is almost
          // never in the middle of the seam, so a shared SPEED lands the
          // two fronts at different times and the thing reads lopsided -
          // Jacob: "timing is off both should reach the same time". What
          // is shared is the CLOCK, not the speed: one journey from 0 to 1
          // that both fronts run, each covering its own distance in it, so
          // the front with further to go simply travels faster. They leave
          // together and they arrive together whatever height was touched.
          //
          // uSurgeTime is that journey, in seconds, swept live through
          // __dl.setSurgeTime, because tempo cannot be judged from a
          // number.
          float prog = uWakeT / uSurgeTime;
          float toCrown = 1.0 - uWakeY;
          float toFoot = uWakeY;
          // THEY COME UP ALREADY MOVING. Starting both fronts ON the split
          // means the first thing that happens is a bright point at the
          // touch height that then tears into two, and that flash is what
          // Jacob was seeing. They appear a sixth of the way out instead,
          // in motion, so there is never a moment where the pair is one
          // object. The landing is unaffected: travel still reaches 1 when
          // prog does.
          float travel = mix(0.16, 1.0, prog);
          float posUp = uWakeY + toCrown * travel;
          float posDn = uWakeY - toFoot * travel;

          // tight ahead of each front, softer behind it, so each carries a
          // tail and reads as a wave with a direction rather than a band
          // sliding on a rail. Both tails point back at the split.
          float relUp = vUvF.y - posUp;
          float relDn = posDn - vUvF.y;
          float bandUp = exp(-pow(relUp / (relUp > 0.0 ? 0.085 : uSurgeTail), 2.0));
          float bandDn = exp(-pow(relDn / (relDn > 0.0 ? 0.085 : uSurgeTail), 2.0));

          // AND THE SPLIT IS LET GO OF. Both tails point back toward the
          // touch height, so while the fronts are still close the seam
          // between them stays lit and the pair reads as one lump being
          // torn rather than two things leaving. Each tail is cut where it
          // reaches back toward the split, measured along that front's own
          // run so it works the same whichever end is nearer. What is
          // behind a front goes dark; what is ahead of it is untouched, so
          // the travel is exactly as it was.
          float sUp = toCrown > 0.0001 ? (vUvF.y - uWakeY) / toCrown : 0.0;
          float sDn = toFoot > 0.0001 ? (uWakeY - vUvF.y) / toFoot : 0.0;
          bandUp *= smoothstep(0.0, travel * 0.72, sUp);
          bandDn *= smoothstep(0.0, travel * 0.72, sDn);

          // MAX, never a sum: adding the two would double the seam
          // wherever their reach overlaps.
          float band = max(bandUp, bandDn);
          // IT SPENDS ITSELF. Holding the level so both fronts stayed at
          // full brightness the whole way was wrong: Jacob, "earlier it
          // went fast with less glow, now its like forced". A front that
          // grinds to its end at constant strength reads as something
          // being carried along the crack; one that flares and is spent
          // reads as the structure doing something. So it decays as it
          // runs, and with the bloom threshold at 0.78 there is now room
          // for that decay to be seen as a shrinking glow rather than
          // falling straight off a cliff into nothing.
          float envelope = smoothstep(0.0, 0.07, prog)
                         * exp(-prog * 0.8)
                         * (1.0 - smoothstep(0.88, 1.04, prog));
          float surge = prog < 1.2 ? band * envelope * uSurge : 0.0;

          // THE BLOOM IS THE EFFECT, not decoration on top of it. Tried
          // holding the front under the pass's threshold of 1.0 so it
          // would travel without a halo - Jacob asked for exactly that -
          // and the propagation disappeared outright: the seam is three or
          // four pixels wide in a 1600-pixel frame, and a brightness
          // change on a line that thin is not something an eye finds. The
          // halo is what carries the front's position out to where it can
          // be seen. Recorded so it is not tried a second time.
          vec3 seam = mix(holy, cold, uSeverity) * v * u;
          outColor = vec4(seam * (near * fail * watch * turn + surge * fail), 1.0);
        }`,
      uniforms: {
        uSeverity: { value: 0 },
        uDecay: { value: 0 },
        uNear: { value: 0 },
        // THE WATCHER. x and y in -1..1, smoothed toward the pointer.
        uWatch: { value: new THREE.Vector2(0, 0) },
        uWatchAmt: { value: 0 },
        // THE SURGE. 99 parks it: no surge at load, none under reduced
        // motion. Amount is swept from rendered frames, not argued.
        uWakeT: { value: 99 },
        // where along the seam the fronts start, 0 foot to 1 crown
        uWakeY: { value: 0.5 },
        // 0.92 against a threshold of 0.78 and a resting seam of 0.136
        // puts the front only about a quarter over the line at birth, so
        // its halo is small from the start and shrinks as it spends
        // itself. The old 1.25 against a threshold of 1.0 sat much further
        // over and held there, which is the hard travelling glow.
        uSurge: { value: 0.92 },
        // seconds for the whole journey. Both fronts leave the split at
        // zero and land on their own end at one, whatever the two
        // distances are, so the far one simply travels faster.
        uSurgeTime: { value: 0.5 },
        // how long a tail each front drags back toward the split. Short
        // detaches the two fronts cleanly; long keeps the origin lit while
        // they pull away, which is the likeliest reading of "awkward".
        uSurgeTail: { value: 0.185 }
      },
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
      // THE SLOT'S BACK WALL. The slit is open, so at heights where no
      // stone lies behind it the visitor sees straight through to the
      // SKY - a pale strip either side of the beam, which read as the
      // two prongs standing apart rather than as one mass parted.
      //
      // This is an opaque near-black plane sitting just behind the
      // beam, cropped to the slit's own profile so the stone still
      // decides its shape. It DISCARDS outside that profile rather than
      // drawing black, which matters: an opaque plane that paints black
      // everywhere is exactly what put a dark plate across the sky
      // behind the crown once already, and discard cannot do that.
      const slotMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out vec2 vUvS;
          void main() {
            vUvS = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          precision highp float;
          in vec2 vUvS;
          out vec4 outColor;
          void main() {
            // the slit: 5.04 falling to 1.36 over the plane's 184 units,
            // over 14 units of width. The same numbers the beam uses.
            float slitW = 0.400 - 0.292 * vUvS.y;
            if (abs(vUvS.x - 0.5) > slitW) discard;
            outColor = vec4(0.004, 0.005, 0.007, 1.0);
          }`,
        side: THREE.DoubleSide
      });
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(14, 184), slotMat);
      slot.position.set(0, 90, -3.4);
      slot.frustumCulled = false;
      this.scene.add(slot);

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

    // --- THE FAR STANDING FIELD ---
    // Gate 2 of the reference picture, 2026-08-22. The world used to end
    // at the last choir mass: choir 560 to 1560 out, ridges inside 1140,
    // and past that nothing until fog - so seven same-scale shapes stood
    // on one plane and the frame read model-sized. The picture's scale
    // comes from monoliths that keep receding in LAYERS.
    //
    // Three rings of standing silhouettes, 1850 to 3250 out - inside the
    // shore's 3600, so every foot stays in ground. Each ring bakes a
    // deeper blend toward the fog colour into its vertices, which is the
    // whole recession: nearer rings cut darker against the horizon, the
    // last is almost air. No facets, no lights, no response to anything -
    // these are distance, not company. The old field note ("nothing out
    // there competes with a vertical hero") still governs the NEAR plain;
    // at these distances a 90-unit monolith subtends two degrees and
    // competes with nothing.
    {
      const rng = mulberry32ish(world.seed ^ 0x3a91);
      const pos: number[] = [];
      const fade: number[] = [];
      const idx: number[] = [];
      const RINGS: ReadonlyArray<readonly [number, number, number]> = [
        // distance, count, blend toward fog
        [1850, 26, 0.5],
        [2500, 36, 0.72],
        [3250, 48, 0.88]
      ];
      for (const [dist, count, blend] of RINGS) {
        for (let i = 0; i < count; i++) {
          const a = ((i + rng() * 0.8) / count) * Math.PI * 2;
          const d = dist * (0.92 + rng() * 0.16);
          const cx = Math.cos(a) * d;
          const cz = Math.sin(a) * d;
          // heights grow with distance more slowly than distance does,
          // so each layer subtends less: recession the eye can read
          const h = (26 + rng() * 64) * Math.pow(d / 1400, 0.8);
          const w = (7 + rng() * 16) * Math.pow(d / 1400, 0.9);
          // stood across the sightline, with a slight taper and lean
          const tx = -Math.sin(a);
          const tz = Math.cos(a);
          const lean = (rng() - 0.5) * 0.24;
          const top = 0.42 + rng() * 0.3;
          const b = pos.length / 3;
          pos.push(cx - tx * w, -6, cz - tz * w);
          pos.push(cx + tx * w, -6, cz + tz * w);
          pos.push(cx + tx * w * top + tx * lean * h * 0.2, h, cz + tz * w * top + tz * lean * h * 0.2);
          pos.push(cx - tx * w * top + tx * lean * h * 0.2, h, cz - tz * w * top + tz * lean * h * 0.2);
          fade.push(blend, blend, blend, blend);
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
      g.setIndex(idx);
      this.strataMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          in float aFade;
          out float vFade;
          void main() {
            vFade = aFade;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          precision highp float;
          in float vFade;
          uniform vec3 uFog;
          out vec4 outColor;
          void main() {
            outColor = vec4(mix(vec3(0.006, 0.007, 0.010), uFog, vFade), 1.0);
          }`,
        uniforms: { uFog: { value: new THREE.Color('#020305') } },
        side: THREE.DoubleSide
      });
      const strata = new THREE.Mesh(g, this.strataMat);
      strata.frustumCulled = false;
      this.scene.add(strata);
    }

    // --- THE SCREE ---
    // Part of THE FOOT, 2026-08-22. The scroll strips cells off the
    // monument and they fall - and until now they fell into nothing:
    // the ground at the foot was shaven clean, which is half of why the
    // mass read as a prop on a baseplate. These are the ones that have
    // already landed, from failures before the visitor arrived. Same
    // cell scale as the lattice, same stone family as the choir, sunk
    // into the plain, densest under the blades' outer edges and off the
    // cleft mouth where the falls funnel. They do nothing, respond to
    // nothing, and never glow: wreckage is not a feature, it is
    // evidence. Seeded like everything else.
    {
      const rng = mulberry32ish(world.seed ^ 0x7c25);
      // 150 field pieces, then 45 drift fines - the wind's work, banked
      // against the bottom riser east of the axis and along the east
      // tier face. One prevailing wind, the same one that dropped the
      // east pylon. The axis itself stays swept.
      const N = 195;
      const box = new THREE.BoxGeometry(1, 1, 1);
      const stone = new THREE.MeshStandardMaterial({
        color: 0x05060a,
        roughness: 0.62,
        metalness: 0.05
      });
      const scree = new THREE.InstancedMesh(box, stone, N);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      for (let i = 0; i < N; i++) {
        // biased to the blades' flanks: a lobe each side of the cleft,
        // thinning outward, with strays further off
        const side = rng() < 0.5 ? -1 : 1;
        const along = (rng() - 0.5) * 2; // along the cleft, -1..1
        const away = Math.pow(rng(), 1.7); // hugs the mass
        if (i >= 150) {
          // drift fines: small, heavily sunk, clustered where the wind
          // piles them
          const s2 = CELL * (0.18 + rng() * 0.3);
          const bank = rng() < 0.55;
          const bx = bank
            ? 15 - 11 * Math.pow(rng(), 1.6) // against the riser, east end
            : 68.5 + (rng() - 0.5) * 2.4; // along the east tier face
          const bz = bank ? 47.6 + rng() * 2.2 : (rng() - 0.5) * 66;
          e.set((rng() - 0.5) * 0.4, rng() * Math.PI * 2, (rng() - 0.5) * 0.4);
          q.setFromEuler(e);
          m.compose(
            // gate 5: the corridor is sacred - nothing banks inside x=6
            new THREE.Vector3(bank ? Math.max(bx, 6.0) : bx, s2 * 0.16, bz),
            q,
            new THREE.Vector3(s2, s2 * 0.5, s2 * 0.8)
          );
          scree.setMatrixAt(i, m);
          continue;
        }
        // a third lie ON the plinth - fragments that landed on the
        // platform and stayed - the rest on the ground past its skirt,
        // with strays thrown further out
        const onPlinth = rng() < 0.34;
        const stray = !onPlinth && rng() < 0.3;
        const s = CELL * (0.5 + rng() * 0.95);
        let x;
        let z;
        let y;
        if (onPlinth) {
          x = side * (9 + rng() * 26) + along * 4 * rng();
          // held off the stair's mouth at the platform edge: a fragment
          // there would float on the treads
          z = -19 + rng() * 36;
          y = 6.4 + s * 0.4; // resting on the top tier, slightly bedded
        } else {
          x = side * (72 + away * (stray ? 60 : 26)) * (0.35 + 0.65 * rng());
          z = along * (46 + away * 30) + (stray ? 10 + rng() * 20 : 0);
          // outside the skirt only: anything under a tier is buried
          if (Math.abs(x) < 70 && Math.abs(z) < 43) z = Math.sign(z || 1) * (44 + rng() * 18);
          // THE SWEPT FORECOURT, base gate 5. Nothing dares stand on the
          // approach line: any piece that lands inside the corridor is
          // pushed off it. Reverence reads as emptiness on the axis -
          // the one place in this wreckage where there is no wreckage.
          if (Math.abs(x) < 7 && z > 0 && z < 120) x = Math.sign(x || 1) * (7 + rng() * 4);
          y = -s * (0.3 + rng() * 0.4) + s / 2; // sunk into the plain
        }
        e.set(rng() * 0.6 - 0.3, rng() * Math.PI * 2, rng() * 0.6 - 0.3);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(x, y, z),
          q,
          new THREE.Vector3(s, s * (0.55 + rng() * 0.5), s * (0.7 + rng() * 0.5))
        );
        scree.setMatrixAt(i, m);
      }
      scree.instanceMatrix.needsUpdate = true;
      this.scene.add(scree);
    }

    // --- THE PLINTH ---
    // Jacob, 2026-08-22, pointing at the reference: "it has a base kind
    // of thing". It does, and it is most of why its tower reads as built
    // and ours read as grown out of dirt: the mass stands on an
    // architectural podium. Three stepped tiers of the same near-black
    // stone, wider than the blades, the top tier standing clear of the
    // dunes (they run to +6 here; the platform tops at 6.4 so no dune
    // ever pokes through it). The blades rise straight out of the stone
    // - monument.py keeps full section below ground, so the join is
    // solid by construction.
    //
    // The slit's light pools on the platform where it lands and drips
    // down the step faces toward the visitor - the same lane law the
    // ground uses, evaluated on the plinth's own surfaces. The pool is
    // why the fissure's foot being occluded by the top tier reads as
    // intended rather than cut: the light does not stop, it LANDS.
    {
      const plinthMat = new THREE.MeshStandardMaterial({
        color: 0x05060a,
        roughness: 0.46,
        metalness: 0.05
      });
      plinthMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.groundU);
        sh.vertexShader = sh.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
varying vec3 vPlinthW;
varying vec3 vPlinthN;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
vPlinthW = (modelMatrix * vec4(position, 1.0)).xyz;
vPlinthN = normalize(mat3(modelMatrix) * normal);`
          );
        sh.fragmentShader = sh.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
varying vec3 vPlinthW;
varying vec3 vPlinthN;
uniform float uGSeverity;
uniform float uGDecay;
float pHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }`
          )
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
{
  // coursed stone, at the platform's own scale
  diffuseColor.rgb *= 0.88 + 0.24 * pHash(floor(vPlinthW.xz * 0.55) + floor(vPlinthW.y * 0.8));
  // THE POOL. The slit's light lands on the top surfaces along the axis
  // and drips down the south step faces; the same lane law as the
  // ground, so platform and plain carry one light.
  float r = length(vPlinthW.xz);
  float axis = abs(vPlinthW.x) / (1.6 + r * 0.085);
  float lane = exp(-axis * axis) * exp(-r * 0.012);
  vec3 lit = mix(vec3(1.0), vec3(0.86, 0.93, 1.0), uGSeverity);
  float top = smoothstep(0.55, 0.9, vPlinthN.y);
  float face = smoothstep(0.55, 0.9, vPlinthN.z);
  diffuseColor.rgb += lit * lane * (top * 0.34 + face * 0.16) * (1.0 - uGDecay * 0.5);

  // ---- THE WORN AXIS ----
  // Base gate 4, 2026-08-22. The line of ten thousand approaches: a
  // channel down the stair's centre and across the platform to the
  // mouth, slightly darkened where the traffic ground its patina in.
  // Upward faces only, the approach side only, fading out past the
  // stair's foot where the walkers dispersed. The wear is the one
  // thing here the monument did not do to itself - it is the record
  // of everyone who came - and it aims the eye at the mouth for free.
  float wear = exp(-vPlinthW.x * vPlinthW.x / 18.0)
             * top
             * smoothstep(-4.0, 2.0, vPlinthW.z)
             * (1.0 - smoothstep(46.0, 54.0, vPlinthW.z));
  diffuseColor.rgb *= 1.0 - wear * 0.15;
}`
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
{
  // gate 4's other half: worn stone is SMOOTH stone. The channel
  // polishes, so the slit's lane light finds it and the centreline
  // glints where the edges stay dull - darker in albedo, brighter in
  // response, which is exactly what real wear does.
  float wtop = smoothstep(0.55, 0.9, vPlinthN.y);
  float wearR = exp(-vPlinthW.x * vPlinthW.x / 18.0)
              * wtop
              * smoothstep(-4.0, 2.0, vPlinthW.z)
              * (1.0 - smoothstep(46.0, 54.0, vPlinthW.z));
  roughnessFactor = max(roughnessFactor - wearR * 0.2, 0.2);
}`
          );
      };
      // topY, halfX, halfZ, height, settle - each tier stands on the
      // next. Base gate 3: the east flank has SUNK, a fraction more per
      // tier of depth, pivoting so the west edge holds its line - one
      // side of the architecture giving way over centuries while the
      // blades behind it stay true vertical. The monument does not age;
      // what people built around it does. The tilt is under a degree
      // and it is the difference between finished yesterday and
      // standing forever.
      const TIERS: ReadonlyArray<readonly [number, number, number, number, number]> = [
        [6.4, 38, 22, 2.4, 0.004],
        [4.0, 52, 31, 2.2, 0.007],
        [1.8, 68, 41, 4.6, 0.011]
      ];
      for (const [topY, hx, hz, h, settle] of TIERS) {
        const tier = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, h, hz * 2), plinthMat);
        // rotate about the centre, then lift so the WEST edge stays put:
        // the east drops by the full 2*hx*settle and the seam stays shut
        tier.position.set(0, topY - h / 2 + hx * settle, 0);
        tier.rotation.z = settle;
        this.scene.add(tier);
      }

      // ---- THE PROCESSIONAL STAIR ----
      // Base gate 1 of the temple-entrance extraction, 2026-08-22. The
      // tiers are 2.2 to 2.4 high: monolith slabs, and nothing anywhere
      // in the frame carries a human measure. Thirteen treads at just
      // under half a unit are that ruler. The moment they exist the
      // blades become four hundred steps tall, and the scale ladder -
      // step, tier, blade - snaps into place. Centred on the axis,
      // narrower than the plinth, rising from the plain to the top
      // platform on the approach side.
      //
      // Same material instance as the tiers, so the slit's light spills
      // down the treads by the same lane law with nothing added: the
      // beam falling down the entrance stair IS the reference's image,
      // and here it costs nothing because the law already existed.
      //
      // Each step drops to below grade rather than sitting as a slab on
      // the tiers, so from the flank the stair reads as one solid
      // stepped mass cut into the podium, not a gangway laid over it.
      {
        const STEPS = 13;
        const RISE = 6.4 / STEPS;
        const RUN = 1.9;
        const WIDTH = 30;
        // Base gate 3: five treads have lost their east corner, and the
        // pieces lie where they broke. Constants, not draws, so the
        // scree's seeded stream stays untouched downstream.
        const CHIPS = new Map<number, number>([
          [2, 2.6],
          [3, 1.4],
          [6, 3.1],
          [7, 1.8],
          [10, 2.2]
        ]);
        for (let i = 0; i < STEPS; i++) {
          const topY = RISE * (i + 1);
          const frontZ = 22 + (STEPS - i) * RUN;
          const chip = CHIPS.get(i) ?? 0;
          const step = new THREE.Mesh(
            new THREE.BoxGeometry(WIDTH - chip, topY + 0.6, RUN),
            plinthMat
          );
          step.position.set(-chip / 2, (topY - 0.6) / 2, frontZ - RUN / 2);
          this.scene.add(step);
          if (chip > 0) {
            // the corner that came off, lying below its notch
            const frag = new THREE.Mesh(
              new THREE.BoxGeometry(chip * 0.7, RISE * 0.8, RUN * 0.8),
              plinthMat
            );
            frag.position.set(WIDTH / 2 - chip * 0.2 + 1.2, RISE * 0.35, frontZ + 1.1);
            frag.rotation.set(0.14, 0.5 + i * 0.9, 0.1);
            this.scene.add(frag);
          }
        }
      }

      // ---- THE PYLONS ----
      // Base gate 2, 2026-08-22. Paired stones flanking the stair's foot,
      // marking the axis - and one of the pair is down. Each is built the
      // only way anything in this world is built: a stack of the
      // monument's own cell courses, drystone-irregular, so the guardian
      // and the monument obey one law. Which is exactly why one could
      // fall: cells fail, and cells fall. The west pylon stands its nine
      // courses; the east kept two, leaning, and the rest lie in a
      // directional run where they landed, half sunk, falling AWAY from
      // the axis so the forecourt stays swept. Never a colonnade: two
      // stones, one lesson.
      {
        const prng = mulberry32ish(world.seed ^ 0x51ab);
        const course = (
          x: number,
          y: number,
          z: number,
          rotY: number,
          tilt: number,
          sx: number,
          sy: number,
          sz: number
        ): void => {
          const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), plinthMat);
          b.position.set(x, y, z);
          b.rotation.set(tilt, rotY, tilt * 0.6);
          this.scene.add(b);
        };
        const FOOT_Z = 52;
        const AXIS_X = 21.5;
        // the standing pylon: nine courses, a stele, not a candle
        {
          let y = 0;
          for (let i = 0; i < 9; i++) {
            const h = 1.35 + prng() * 0.35;
            const w = 2.6 - i * 0.06 + (prng() - 0.5) * 0.18;
            y += h / 2;
            course(
              -AXIS_X + (prng() - 0.5) * 0.22,
              y,
              FOOT_Z + (prng() - 0.5) * 0.22,
              (prng() - 0.5) * 0.14,
              (prng() - 0.5) * 0.02,
              w,
              h,
              w * (0.9 + prng() * 0.2)
            );
            y += h / 2;
          }
        }
        // the fallen pylon: a leaning two-course stump, and the run of
        // courses where they landed - outward and east, off the axis
        {
          course(AXIS_X, 0.8, FOOT_Z, 0.1, 0.0, 2.7, 1.6, 2.6);
          course(AXIS_X + 0.3, 2.2, FOOT_Z + 0.2, 0.24, 0.09, 2.5, 1.3, 2.4);
          let d = 3.4;
          for (let i = 0; i < 7; i++) {
            const s = 2.3 - i * 0.1 + (prng() - 0.5) * 0.3;
            const spread = (prng() - 0.5) * 2.6;
            // half sunk: landed a long time ago
            course(
              AXIS_X + d * 0.72 + spread,
              s * (0.24 + prng() * 0.14),
              FOOT_Z + d + spread * 0.5,
              prng() * Math.PI,
              (prng() - 0.5) * 0.3,
              s,
              s * (0.6 + prng() * 0.3),
              s * (0.8 + prng() * 0.3)
            );
            d += s * (0.9 + prng() * 0.5);
          }
        }
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
    // CENTRED AND LARGER, on Jacob's instruction 2026-08-21:
    // "reposition the halo dude it should be centre of twospires and a
    // lil big am i not right".
    //
    // This overrides the placement law written directly above, which is
    // his to override - but it is recorded rather than quietly deleted,
    // because the law was paid for. A lit void framed by two forms is
    // an EYE, and eye-of-sauron is a kill word this project has already
    // been burned by once. If the frame starts reading that way, this
    // line is the cause and moving x back off the axis is the fix.
    //
    // Two things hold it back from that read for now: it sits BEHIND
    // the crown at z-34 so the horns occlude its centre rather than
    // framing a clean disc, and it is set below the tall tip so it does
    // not float as a separate body above the monument.
    const tallTip = prongCentre(TIP_T[0] - 0.02, 0);
    this.crownHalo = makeHalo('#cdd6e2', 112);
    this.crownHalo.position.set(0, tallTip.y - 2, tallTip.z - 34);
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
      uRim: { value: 1.0 },
      uHover: { value: new THREE.Vector3(0, -999, 0) },
      uHoverAmt: { value: 0 },
      uInner: { value: new THREE.Vector3(0, -999, 0) },
      uInnerAmt: { value: 0 },
      uSignal: { value: 0 },
      uAlign: { value: 0 },
      uWatchY: { value: 90 },
      uWatchAmt: { value: 0 },
      // the visitor's presses, as world positions + born times. The
      // stone eats at these points instead of a sprite being glued on.
      uMarks: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, -999, 0, -99)) },
      uMarkN: { value: 0 },
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
  // THE FOOT, 2026-08-22. Jacob: "need to do something about the base".
  // Four faults, one treatment; the lane is the first. It was 2.2 wide
  // at a mouth whose slit is under one unit of visible light, and it
  // died by r=80 - a blob at the foot, not light CAST BY the slit. It
  // leaves narrower and carries further now, a blade's throw.
  float axis = abs(vGroundW.x) / (1.6 + r * 0.085);
  float streak = exp(-axis * axis) * exp(-r * 0.0075) * step(-1.0, vGroundW.z);
  vec3 lit = mix(vec3(1.0), vec3(0.86, 0.93, 1.0), uGSeverity);
  diffuseColor.rgb += lit * streak * 0.26 * (1.0 - uGDecay * 0.5);

  // THE STANDING SHADOW. The mass blocks the sky, so the plain darkens
  // where it stands - the contact the frame never had, which is most of
  // why the monument read as placed on the ground rather than standing
  // in it. The lane wins near the mouth: light escaping the slit falls
  // INSIDE the shadow, which is exactly what makes both read as real.
  // sized to the plinth's skirt, which is what stands on the plain now
  vec2 fp = vec2(vGroundW.x / 74.0, vGroundW.z / 46.0);
  float foot = 1.0 - smoothstep(0.86, 1.7, length(fp));
  diffuseColor.rgb *= 1.0 - foot * 0.5 * (1.0 - streak * 0.75);
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
    // the lane stays continuous: the seams cut the stone, not the light
    seam *= 1.0 - streak * 0.6;
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
    // GATED ON DECAY, hard. At the opening uGDecay is zero: nothing has
    // failed, so the plain has nothing to carry - and yet these were the
    // brightest thing at the foot, pale worms wandering an intact floor.
    // Consequence before cause, exactly the read the ledger forbids. The
    // charge now arrives WITH the failure and grows with it.
    diffuseColor.rgb += lit * carry * uGDecay * (0.55 + 0.9 * uGDecay);
  }
}`
            )
            .replace(
              '#include <roughnessmap_fragment>',
              `#include <roughnessmap_fragment>
{
  float rr = length(vGroundW.xz);
  // polished where the light falls, dulling as it runs out to the dunes.
  // 0.24 was mirror enough that every dune ridge drew a banded specular
  // loop around the foot - the "water rings" read. 0.34 keeps the lane's
  // response and loses the rings.
  roughnessFactor = mix(0.34, 0.72, smoothstep(40.0, 340.0, rr))
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
  vec3 far = mix(fogColor, skyAt(bearing, cameraPosition, uGSeverity, 0.0, 0.0, 1.0, 0.0, 0.0, uGTime), smoothstep(2400.0, 3550.0, length(vGroundW.xz)));
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

  /** Gate 5 review pin: the torn opening above the crown. */
  setBreak(amount: number): void {
    this.skyMat.uniforms.uBreak!.value = Math.max(0, Math.min(3, amount));
  }

  /** Gate 7 review pin: black point and pivot contrast, in that order. */
  setGrade(lift: number, contrast: number): void {
    this.grade.material.uniforms.uLift!.value = Math.max(0, Math.min(0.02, lift));
    this.grade.material.uniforms.uContrast!.value = Math.max(0.8, Math.min(1.4, contrast));
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

  /**
   * How hard the seam answers attention leaving the mass. 0 is silent;
   * the surge only reads once the peak clears the bloom pass's threshold
   * of 1.0, so this is a level to sweep against rendered frames, not a
   * number to argue about.
   */
  setSurge(amount: number): void {
    this.fissureMat.uniforms.uSurge!.value = Math.max(0, Math.min(4, amount));
  }

  /**
   * Seconds for the whole journey: both fronts leave the split together
   * and land on their own end together. Lower is quicker.
   */
  setSurgeTime(seconds: number): void {
    this.fissureMat.uniforms.uSurgeTime!.value = Math.max(0.08, Math.min(6, seconds));
  }

  /** Gate 3 review pin: the sky's grazing light on the outer edges. */
  setRim(amount: number): void {
    this.stoneU.uRim!.value = Math.max(0, Math.min(3, amount));
  }

  /**
   * Where a press lands: the point on the monument under the cursor.
   *
   * Jacob, 2026-08-22: "when i click on the hero holes are forming on
   * the base wtf?" The old path put a mark 14 units ahead of the CAMERA
   * - right for inside the cleft, where the wall is that close, and
   * wrong everywhere else: at the opening the camera is hundreds of
   * units out, so the point's height was the camera's height, the world
   * clamped it onto the face, and every press seated at the foot
   * whatever the visitor aimed at. The bright web used to bury the
   * evidence; gate 4's clean base put it on display.
   *
   * Same raycast the hover lamp uses, so where the monument answers
   * attention and where it takes a mark are one geometry. When the ray
   * misses the tower entirely, the old fixed reach stands - pressing
   * into the dark is still a press.
   */
  pressPoint(ndcX: number, ndcY: number): THREE.Vector3 {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = this.raycaster.ray.intersectBox(this.towerBox, new THREE.Vector3());
    if (hit) return hit;
    const dir = new THREE.Vector3(ndcX, ndcY, 0.5)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();
    return this.camera.position.clone().add(dir.multiplyScalar(14));
  }

  /**
   * How long a tail each front drags back toward the split, in uv. Short
   * (0.08) detaches the two fronts cleanly; long (0.25) keeps the split
   * point lit while they pull away.
   */
  setSurgeTail(uv: number): void {
    this.fissureMat.uniforms.uSurgeTail!.value = Math.max(0.02, Math.min(0.6, uv));
  }

  /** The visitor's attention: where they point at the monument. */
  setPointer(ndcX: number, ndcY: number): void {
    this.pointerNdc = { x: ndcX, y: ndcY };
    this.everPointed = true;
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

      // THE WATCHER follows the pointer, slowly. The lag is the whole
      // effect: something that snaps to the cursor is a UI widget,
      // something that takes half a second to come round is paying
      // attention. It fades out entirely once the visitor is inside the
      // cleft, where the blade is overhead and there is nothing left to
      // watch from.
      // IT DECIDES TO LOOK. A constant follow rate is a cursor readout,
      // and a readout is never sinister - it is a widget. The turn rate
      // scales with how far the pointer has got from where it is
      // already attending, so small movements are IGNORED and a real
      // move brings it round fast. Being beneath its notice is worse
      // than being tracked.
      const werr = Math.hypot(px - this.watchX, py - this.watchY);
      const wrate = 0.22 + 8.0 * smooth01(werr, 0.09, 0.42);
      const watchK = 1 - Math.exp(-dt * wrate);
      this.watchX += (px - this.watchX) * watchK;
      this.watchY += (py - this.watchY) * watchK;
      // and it never holds perfectly still. Something motionless is an
      // object; something that drifts while it waits is alive
      this.watchDrift += dt;
      const wdrift = Math.sin(this.watchDrift * 0.23) * 0.055
                   + Math.sin(this.watchDrift * 0.071) * 0.030;
      // IT WAS ALREADY LOOKING. Sinister gate 2, 2026-08-22, from the
      // paper list. Before any pointer has ever entered, the watcher is
      // not asleep waiting to be summoned - it is settled at moderate
      // presence, attending the centre of the screen, which is where
      // the visitor is. The drift keeps it alive. The first mouse move
      // does not wake it; it hands it a better target.
      //
      // Once a pointer has existed, absence means the visitor LEFT, and
      // the watcher lets go as before - that release is the wave's
      // moment and it stays untouched.
      const wantWatch = this.pointerNdc ? 1 : this.everPointed ? 0 : 0.6;
      this.watchAmt += (wantWatch - this.watchAmt) * (1 - Math.exp(-dt * 1.1));
      const fu = this.fissureMat.uniforms;
      (fu.uWatch!.value as THREE.Vector2).set(this.watchX, this.watchY + wdrift);
      const wAmt =
        this.watchAmt * (1 - smooth01(progress, 0.44, 0.56)) * (reduced ? 0.35 : 1);
      fu.uWatchAmt!.value = wAmt;
      // the same height in world units, so the rot can answer it: the
      // plane is 184 tall centred at 90, and the node sits at
      // 0.5 + 0.34*wy along it
      this.stoneU.uWatchY!.value = 90 + 62.6 * (this.watchY + wdrift);
      this.stoneU.uWatchAmt!.value = wAmt;
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
      // THE FLOOR. Jacob, 2026-08-22: "the camera sway is going inside
      // the ground". The pitch above rotates the camera's OFFSET around
      // the look point, and at the opening that arm is 250 units long -
      // a pointer at the bottom edge pitched the eye seventeen units
      // DOWN, from a stand of ten, straight through the plain. It could
      // always dip; gate 6's lower stand made it plunge. The dunes run
      // to +6 out there and the stair treads to 6.4, so the eye never
      // goes below 8.2: the sway keeps its full range everywhere except
      // through the one boundary that is supposed to be solid. Inside
      // the cleft every key sits at 20 or higher, so this never binds.
      if (this.camera.position.y < 8.2) this.camera.position.y = 8.2;
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
    // Gate 1: the fog tracks the darkened sky at the same forty percent,
    // or every hazed slab reads as a paler cutout against it.
    const fogColor = lerpColor('#020305', '#010205', sev);
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

    // THE LEAVING CLOCK. Zero while the pointer is on the mass; it runs
    // the moment attention goes, and the seam surges off it. Gated on the
    // tower box rather than on the window, so it answers the cursor being
    // taken off the HERO and not only the cursor leaving the page - which
    // is the gesture Jacob has been describing all along.
    // The height it left FROM travels with it: the blade plane is 184
    // units tall centred at 90, which is the mapping the watcher already
    // uses in the other direction at uWatchY.
    if (hoverTargetAmt > 0.5) {
      this.wakeT = 0;
      this.wakeY = Math.max(0, Math.min(1, 0.5 + (this.hoverPoint.y - 90) / 184.1));
    } else if (this.wakeT < 8) {
      this.wakeT += dt;
    }
    const fsu = this.fissureMat.uniforms;
    fsu.uWakeT!.value = reduced ? 99 : this.wakeT;
    fsu.uWakeY!.value = this.wakeY;

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
    (this.strataMat.uniforms.uFog!.value as THREE.Color).copy(fogColor);
    this.hazeMat.uniforms.uSeverity!.value = sev;
    this.hazeMat.uniforms.uDecay!.value = decay;
    this.skyMat.uniforms.uTime!.value = reduced ? 0 : this.time;
    this.groundU.uGTime!.value = reduced ? 0 : this.time;
    this.groundU.uGSeverity!.value = sev;
    this.groundU.uGDecay!.value = decay;
    // bloom must not smear the fissure across the walls in there
    this.bloom.strength = this.flatAudit ? 0 : 0.34 * (1 - inside * 0.72);

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
      // the same marks, into the stone's own field - see THE PRESSES
      // EAT THE STONE. The sprite path is retired: draw range stays 0.
      const mv = this.stoneU.uMarks!.value as THREE.Vector4[];
      mv[m]!.set(mk.x, mk.y, mk.z, mk.bornTick / 60);
    }
    this.stoneU.uMarkN!.value = marks.length;
    this.markGeom.setDrawRange(0, 0);
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
