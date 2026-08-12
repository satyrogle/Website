// THE HERO — a star that has already blown apart.
//
// One marched scene: a dying star, and the debris of the world it destroyed
// floating in the void around it. The fragments trail away from the star in a
// narrowing funnel; scroll travels from fragment to fragment down that funnel,
// and the floor pulls wide to see the whole event at once before the star
// flares.
//
// Two things in this file are approved and are not to be redecorated:
//
//   - the plating: rectilinear armour at two scales with grooves along the
//     seams — every fragment is a piece of a made thing, not a rock;
//   - the glow: light accumulated along the ray, gathering in seams, in open
//     cuts and around the star. Nothing is painted onto a surface.
//
// Colour grammar, never redefined:
//
//   amber   the record       the plating's light, the heat in the cuts, the star
//   cyan    the world        deviation (surfaces under attention's fringe)
//   violet  the consequence  reserved — not spent on decoration
//
// No rings. The funnel is a scatter along an axis with irregular angles and
// radii, never a drawn spiral; the camera never looks straight down its
// throat; and every capture is judged for concentric reads. That rule has
// outlived six carriers.

precision highp float;

uniform vec2 uResolution;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform float uTanFov;

uniform float uTime;
uniform float uBreath;
uniform int uSteps;

uniform vec3 uRecord;
uniform vec3 uWorld;
uniform vec3 uConsequence;

// The star.
uniform vec3 uStarPos;
uniform float uStarRadius;
uniform float uStarGlow;
/** The finale. 0 for the whole descent, ramping to 1 at the very floor. */
uniform float uFlare;
/** How irregular the star's luminous envelope is. Zero is a lamp; never zero. */
uniform float uStarNoise;
/** Radial ejecta filaments thrown off the core. */
uniform float uEjecta;
/** The ruptured body around the core: radius, plate size, how far it has split. */
uniform float uStarBody;
uniform float uStarFrac;
uniform float uStarBreak;
/** Which way the rupture faces. Down the funnel: it is why the debris went. */
uniform vec3 uRupture;
/** Trailing ejecta behind each great fragment, back toward the source. */
uniform float uTrail;

// The blast funnel, for the small-debris field: the star sits at one end and
// the cone opens along the axis. Debris exists only inside it.
uniform vec3 uAxis;
uniform float uConeR0;
uniform float uConeSlope;
uniform float uConeLen;
/** Small-debris repetition cell and how full the field is. */
uniform float uDebrisCell;
uniform float uDebrisDensity;

// The debris. Position + shell radius, and a rotation as axis + angle.
const int FRAGS = 5;
uniform vec4 uFrag[FRAGS];
uniform vec4 uFragRot[FRAGS];

// The approved plating.
uniform float uPanelFreq;
uniform float uRelief;
uniform float uGroove;
uniform float uHeat;
/** Heat escaping from the broken faces of each fragment. */
uniform float uLava;

/** Pointer in NDC, and how far the field has come up to meet it. */
uniform vec2 uHover;
uniform float uHoverStrength;
uniform float uHoverRadius;
uniform float uHoverGain;
uniform float uHoverFringe;

uniform float uGlow;
uniform float uDensity;
uniform float uExposure;

out vec4 fragColour;

const float FAR = 60.0;

float hash31(vec3 c) {
  return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 turn(vec3 p, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}

/**
 * Cheap layered irregularity. Products of unaligned sines - smooth, seamless,
 * and free of the axis-locked lattice a single sine family gives. Used for the
 * star's uneven envelope, its ejecta filaments, and the large-scale roughness
 * that keeps a fragment from reading as a tidy sphere section.
 */
float terrain(vec3 d) {
  return 0.6 * sin(d.x * 3.1 + 1.7) * sin(d.y * 2.3 - 0.6)
       + 0.4 * sin(d.y * 5.7 + 2.1) * sin(d.z * 4.3 + 0.9)
       + 0.25 * sin(d.z * 8.9 - 1.2) * sin(d.x * 7.1 + 3.3);
}

/**
 * The seams between armour plates. Roughly 0 across a plate face, rising to 1
 * in the groove — the emission reads it, so light collects in the seams.
 */
float fissure(vec3 p) {
  vec3 g = abs(fract(p * uPanelFreq) - 0.5);
  float seam = min(min(g.x, g.y), g.z);
  float fine = min(min(
    abs(fract(p.x * uPanelFreq * 3.1) - 0.5),
    abs(fract(p.y * uPanelFreq * 3.1) - 0.5)),
    abs(fract(p.z * uPanelFreq * 3.1) - 0.5));
  return max(
    1.0 - smoothstep(0.0, 0.055, seam),
    (1.0 - smoothstep(0.0, 0.03, fine)) * 0.45
  );
}

// Feature values at the winning surface, written by map() as it runs. GLSL
// module globals, so the march does not have to re-derive which fragment it
// hit to know what should glow there.
float gSeam = 0.0;
float gCut = 0.0;

/**
 * One piece of the broken world, in its own local frame.
 *
 * A curved shard: the intersection of a plated sphere with two cutting planes.
 * The outer face carries the armour — it used to be the surface of something —
 * and the flat faces are the fresh breaks, which is where the heat comes out.
 * The same chunk is reused for every fragment at its own rotation and scale,
 * and the plating samples the rotated coordinates, so no two fragments show
 * the same face.
 */
float chunk(vec3 q, float shell, float idx) {
  float relief = (hash31(floor(q * uPanelFreq)) * 0.62 +
                  hash31(floor(q * uPanelFreq * 3.1) + 17.3) * 0.38 - 0.5) * uRelief;
  float seams = fissure(q) * uGroove;

  // Large-scale roughness on the outer face, keyed by the fragment's own
  // index. A clean sphere section is a tidy game prop; a torn radius is a
  // piece of something. This is what was missing when the founder called the
  // fragments "tidy spherical fragments" - and he was right.
  vec3 dir = q / max(length(q), 1e-4);
  float rough = terrain(dir * (2.2 + idx * 0.37) + idx * 1.7) * shell * 0.14;

  float sphere = length(q) - (shell + rough + relief - seams);

  // Two cuts per fragment, their angles walked by the index so no two pieces
  // broke the same way - kinship in material, variety in the break.
  vec3 nA = turn(normalize(vec3(0.78, 0.31, -0.55)), normalize(vec3(0.3, -0.8, 0.52)), idx * 1.7);
  vec3 nB = turn(normalize(vec3(-0.25, 0.91, 0.33)), normalize(vec3(-0.6, 0.2, 0.77)), idx * 2.3);
  float cutA = dot(q, nA) - shell * (0.34 - 0.06 * sin(idx * 2.1));
  float cutB = dot(q, nB) - shell * (0.52 + 0.08 * sin(idx * 1.3));

  float d = max(sphere, max(cutA, cutB));
  float nearCut = min(abs(cutA), abs(cutB));

  // Two of the five are hollowed: broken shells whose interiors are exposed
  // and incandescent. "Some more hollow" - the brief, verbatim.
  if (idx == 1.0 || idx == 3.0) {
    float hollow = length(q - nA * shell * 0.35) - shell * 0.74;
    d = max(d, -hollow);
    nearCut = min(nearCut, abs(hollow) * 0.6);
  }

  // Remember what the surface here is made of, for the light. The break glow
  // hugs the fresh faces and stays inside the shell.
  gSeam = fissure(q);
  gCut = exp(-nearCut * 3.2) * (1.0 - smoothstep(shell * 0.55, shell, length(q)));

  return d;
}

/**
 * The source: a body coming apart, not a lamp.
 *
 * Jacob's reference is a planet mid-rupture — dark crust, brilliant fractures,
 * light blasting out of the interior — and that is also the cure for the frame
 * being unlookable. A bare luminous core is an unoccluded disc and floods
 * everything; a crust around it blocks most of the light and lets the rest out
 * through the gaps, so what reaches the eye is shaped: rays through fractures,
 * a burning limb, a blown-open face. Same total emission, a hundred times more
 * legible.
 *
 * Built from the approved plating, broken into plates that have drifted apart
 * along their own radii, with one whole side blown out — facing down the
 * funnel, which is why the debris went that way. The flare widens the splits:
 * the body still coming apart, not a brightness ramp.
 */
float starBody(vec3 p) {
  vec3 q = p - uStarPos;
  float r = length(q);
  if (r > uStarBody * 2.2) return r - uStarBody * 1.6;

  float relief = (hash31(floor(q * uPanelFreq)) * 0.62 +
                  hash31(floor(q * uPanelFreq * 3.1) + 17.3) * 0.38 - 0.5) * uRelief;
  float seams = fissure(q) * uGroove;

  // Plates driven apart along their own radii. The gaps between them are what
  // the interior light escapes through.
  vec3 plate = floor(q * uStarFrac);
  float split = uStarBreak * (0.2 + hash31(plate + 8.3));

  float rough = terrain(q / max(r, 1e-4) * 2.7) * uStarBody * 0.1;
  float d = r - (uStarBody + split + rough + relief - seams);

  // The blown face. A cone opened toward the rupture direction, widening as
  // the flare drives the event on.
  float facing = dot(q / max(r, 1e-4), uRupture);
  // A section broken away, not most of the body. Opened too far it stops being
  // a planet coming apart and becomes a dark cap with a light behind it.
  float open = smoothstep(0.62 - uFlare * 0.18, 0.97, facing);
  d = max(d, -(r - uStarBody * (2.0 - 1.25 * open)));

  gSeam = fissure(q);
  // Every fracture face is incandescent: this is the interior, exposed.
  gCut = smoothstep(0.0, uStarBody * 0.5, split) * 0.8 + open * 0.6;
  return d;
}

/**
 * The small debris - everywhere, as the founder specified, not five props in
 * a void. Jittered domain repetition gated to the blast cone: one shard
 * evaluated per cell, presence decided by hash, density thinning toward the
 * cone's edge. Thousands of pieces for the price of one.
 *
 * During the flare the whole field is sampled through a contraction toward
 * the star, which renders as uniform expansion away from it - the explosion
 * still going, everywhere at once, for one uniform.
 */
float debris(vec3 p) {
  vec3 rel = (p - uStarPos) / (1.0 + uFlare * 0.05);
  float along = dot(rel, uAxis);
  if (along < 1.4 || along > uConeLen) return 1e9;

  float radial = length(rel - uAxis * along);
  float coneR = max(uConeR0 + uConeSlope * along, 0.3);
  if (radial > coneR * 1.5) return 1e9;

  vec3 cellP = (rel + uStarPos) / uDebrisCell;
  vec3 base = floor(cellP);
  float presence = uDebrisDensity * (1.0 - smoothstep(coneR, coneR * 1.5, radial));
  if (hash31(base) > presence) return 1e9;

  vec3 jitter = vec3(hash31(base + 11.1), hash31(base + 27.7), hash31(base + 43.3));
  vec3 centre = (base + 0.15 + jitter * 0.7) * uDebrisCell;
  float size = uDebrisCell * (0.08 + 0.2 * hash31(base + 5.5));

  vec3 q = (rel + uStarPos) - centre;
  vec3 axis = normalize(vec3(hash31(base + 7.1), hash31(base + 8.3), hash31(base + 9.7)) * 2.0 - 1.0);
  q = turn(q, axis, hash31(base + 13.9) * 6.28);

  // A small burned shard: an elongated box with softened edges, so even the
  // dust shares the body's angular, made language rather than being pebbles.
  vec3 b = abs(q) - size * vec3(1.0, 0.55, 0.35);
  float d = length(max(b, 0.0)) + min(max(b.x, max(b.y, b.z)), 0.0) - size * 0.08;

  // Never report further than the cell wall, or the march strides into a
  // neighbouring cell and clips whatever lives there.
  vec3 f = abs(fract(cellP) - 0.5);
  float wall = (0.5 - max(f.x, max(f.y, f.z))) * uDebrisCell;
  return min(d, wall + size);
}

/**
 * The scene: every fragment of the world the star destroyed.
 *
 * The star itself is deliberately not here. As a surface it rendered as a flat
 * disc with a bright rim — grazing rays accumulate the most halo, which is
 * limb brightening, which is an eclipse ring, which is the one read this
 * project is forbidden to produce. A star is not a surface; it is a volume of
 * light, and it lives entirely in the accumulation loop where rays pass
 * through it and come out brighter, brightest through the middle where the
 * path is longest. No surface, no rim, no ring.
 */
float map(vec3 p) {
  float best = 1e9;
  float bestSeam = 0.0;
  float bestCut = 0.0;

  for (int i = 0; i < FRAGS; i++) {
    vec3 w = p - uFrag[i].xyz;
    float shell = uFrag[i].w;

    // Cheap bound first. Most rays spend most steps nowhere near most
    // fragments, and the plating hashes are the expensive part.
    float bound = length(w) - shell * 1.6;
    if (bound > best + 0.4) continue;

    vec3 q = turn(w, normalize(uFragRot[i].xyz), uFragRot[i].w);
    float d = chunk(q, shell, float(i));
    if (d < best) {
      best = d;
      bestSeam = gSeam;
      bestCut = gCut;
    }
  }

  // The ruptured body at the throat.
  float sb = starBody(p);
  if (sb < best) {
    best = sb;
    bestSeam = gSeam;
    bestCut = gCut;
  }

  // The field of small debris. Dark: it carries no seam or break light of its
  // own, so it reads as burned mass silhouetted against the star.
  float dd = debris(p);
  if (dd < best) {
    best = dd;
    bestSeam = 0.0;
    bestCut = 0.0;
  }

  gSeam = bestSeam;
  gCut = bestCut;
  return best;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;

  vec3 direction = normalize(
    uCamRight * (ndc.x * aspect * uTanFov) + uCamUp * (ndc.y * uTanFov) + uCamForward
  );

  // The march starts at a per-pixel dithered offset. With a uniform start the
  // step bound near the star quantises accumulation into shells, which render
  // as faint concentric banding around the core - a ring read manufactured by
  // sampling, not geometry, and just as forbidden. Dither trades it for noise
  // the eye files as grain in the ejecta.
  float travelled =
    fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 0.14;

  // Light accumulated along the ray — the approved glow, unchanged in kind.
  float lit = 0.0;    // proximity to any surface
  float deep = 0.0;   // time spent close against structure
  float heat = 0.0;   // the plating's seams
  float lava = 0.0;   // the broken faces
  float star = 0.0;   // the dying star's own halo

  for (int i = 0; i < 256; i++) {
    if (i >= uSteps) break;

    vec3 p = uCamPos + direction * travelled;
    float d = map(p);

    // Step length decided up front, because open-space emission must be
    // weighted by it. Accumulating per sample quantises the star's envelope
    // into the march's own shells - faint concentric arcs around the core,
    // a ring read manufactured by sampling. Weighting by distance travelled
    // is the actual integral, and shells cannot exist in an integral.
    float dStarEarly = length(p - uStarPos);
    float stepLen = min(d, max(dStarEarly - uStarRadius * 0.6, 0.1));
    float w = clamp(stepLen, 0.004, 0.8) * 10.0;

    float near = exp(-abs(d) * uDensity);
    lit += near;
    deep += near * clamp(1.0 - abs(d) * 3.0, 0.0, 1.0);
    heat += near * gSeam;
    lava += near * gCut;

    // The star, as an event rather than a lamp.
    //
    // Three terms, all directional. The envelope's radius is modulated by
    // direction so the luminous edge is uneven and slowly reorganising; a
    // dirty outer envelope carries turbulence far past the core; and radial
    // filaments - noise sampled on the *direction* vector, so it is constant
    // along any sight-line from the core - read as ejecta thrown outward.
    // Nothing about it is a circle.
    vec3 sp = p - uStarPos;
    float dStar = length(sp);
    vec3 sdir = sp / max(dStar, 1e-4);

    float lumpy = 1.0 + uStarNoise * terrain(sdir * 2.0 + uBreath * 0.15);
    float hot = exp(-max(dStar - uStarRadius * lumpy, 0.0) * (1.6 / uStarRadius));
    float turb = 0.55 + 0.45 * terrain(sdir * 5.0 - uBreath * 0.1);
    float dirty = exp(-max(dStar - uStarRadius, 0.0) * (0.5 / uStarRadius)) * turb;
    float fil = max(terrain(sdir * 7.3 + 3.7), 0.0);
    float ejecta = fil * fil * exp(-max(dStar - uStarRadius * 1.2, 0.0) * (0.55 / uStarRadius)) * uEjecta;
    star += (hot + dirty * 0.45 + ejecta) * w;

    // Trailing ejecta behind each great fragment, back along its line to the
    // source - the fragments are still shedding, which is what ties them to
    // the event instead of floating beside it.
    for (int f = 0; f < FRAGS; f++) {
      vec3 a = uFrag[f].xyz;
      float shellF = uFrag[f].w;
      vec3 back = uStarPos - a;
      float L = length(back);
      vec3 tdir = back / max(L, 1e-4);
      float along = clamp(dot(p - a, tdir), 0.0, shellF * 3.0);
      vec3 nearest = a + tdir * along;
      float dl = length(p - nearest);
      if (dl < shellF * 1.5) {
        lava += exp(-dl * (3.4 / shellF)) * exp(-along / (shellF * 3.0) * 2.4) * uTrail
              * (0.4 + 0.6 * hash31(vec3(float(f) + 3.7))) * w;
      }
    }

    if (d < 0.0006 * travelled) break;

    travelled += max(stepLen * 0.6, 0.004);
    if (travelled > FAR) break;
  }

  float steps = float(uSteps);
  lit = lit / steps * uGlow * 0.35;
  deep = deep / steps * uGlow;
  heat = heat / steps * uGlow * uHeat * (1.0 + uFlare * 0.8);
  lava = lava / steps * uGlow * uLava * (1.0 + uFlare * 0.8);

  // The flare is the finale: the star's output climbs an order of magnitude
  // over the last stretch of scroll, and its colour runs from amber toward
  // white heat.
  // Four, not nine. At nine the finale whited out the frame and the founder
  // could not see the event he had scrolled to — and the crust now does most
  // of the shaping work anyway, so the emission does not have to shout.
  float flared = uStarGlow * (1.0 + uFlare * 4.0);
  star = star / steps * flared;

  // Amber carries everything. It desaturates as it brightens — hot, not gold.
  vec3 colour = mix(uRecord, vec3(1.0, 0.97, 0.92), clamp(deep * 0.9, 0.0, 0.7)) * deep;
  colour += uRecord * lit * 0.1;
  colour += mix(uRecord, vec3(1.0, 0.86, 0.62), 0.5) * heat;
  colour += mix(uRecord, vec3(1.0, 0.66, 0.3), 0.8) * lava;
  // Overexposed where hottest: past a threshold the core clips to white, and
  // it is allowed to - a star you can comfortably look at is a lamp.
  colour += mix(uRecord, vec3(1.0, 0.95, 0.88), clamp(star * 0.7 + uFlare * 0.4, 0.0, 0.92)) * star;
  // Clipping to white is allowed only well past the point the core has
  // already saturated, so the bloom stays inside the fractures instead of
  // spreading across everything behind them.
  colour += vec3(1.0) * max(star - 1.9, 0.0) * 0.5;

  // Attention warms the seams and the breaks, and only those. Cyan is a
  // hairline at the edge of attention — the world surfacing at the boundary
  // of observation, not a light shone on the object.
  float attention = uHoverStrength *
    (1.0 - smoothstep(0.0, uHoverRadius, distance(ndc * vec2(aspect, 1.0), uHover * vec2(aspect, 1.0))));
  float structure = heat + lava * 0.6 + deep * 0.25;
  colour += uRecord * structure * attention * uHoverGain;
  float fringe = attention * (1.0 - attention) * 4.0;
  colour += uWorld * structure * fringe * uHoverFringe;

  fragColour = vec4(colour * uExposure, 1.0);
}
