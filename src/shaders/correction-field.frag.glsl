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
float chunk(vec3 q, float shell) {
  float relief = (hash31(floor(q * uPanelFreq)) * 0.62 +
                  hash31(floor(q * uPanelFreq * 3.1) + 17.3) * 0.38 - 0.5) * uRelief;
  float seams = fissure(q) * uGroove;

  float sphere = length(q) - (shell + relief - seams);

  // Two cuts, off the centre and at an odd angle to each other: a broken
  // piece, not a machined hemisphere.
  float cutA = dot(q, normalize(vec3(0.78, 0.31, -0.55))) - shell * 0.34;
  float cutB = dot(q, normalize(vec3(-0.25, 0.91, 0.33))) - shell * 0.52;

  float d = max(sphere, max(cutA, cutB));

  // Remember what the surface here is made of, for the light. The cut glow
  // hugs the two break planes and stays inside the shell.
  float nearCut = min(abs(cutA), abs(cutB));
  gSeam = fissure(q);
  gCut = exp(-nearCut * 3.2) * (1.0 - smoothstep(shell * 0.55, shell, length(q)));

  return d;
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
    float bound = length(w) - shell * 1.45;
    if (bound > best + 0.4) continue;

    vec3 q = turn(w, normalize(uFragRot[i].xyz), uFragRot[i].w);
    float d = chunk(q, shell);
    if (d < best) {
      best = d;
      bestSeam = gSeam;
      bestCut = gCut;
    }
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

  float travelled = 0.0;

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

    float near = exp(-abs(d) * uDensity);
    lit += near;
    deep += near * clamp(1.0 - abs(d) * 3.0, 0.0, 1.0);
    heat += near * gSeam;
    lava += near * gCut;

    // The star, as light along the path. Falloff is scaled to its radius so
    // the core saturates and the halo carries two or three radii beyond it,
    // bleeding around the debris silhouettes.
    float dStar = length(p - uStarPos);
    star += exp(-max(dStar - uStarRadius, 0.0) * (1.4 / uStarRadius));

    if (d < 0.0006 * travelled) break;

    // Steps are also bounded by the distance to the star. The fragments no
    // longer contribute a surface there, so the estimator reports empty space
    // and would stride straight through the core in two samples — a star that
    // flickered with every camera move. The bound densifies sampling exactly
    // where the light is.
    float stepLen = min(d, max(dStar - uStarRadius * 0.6, 0.1));
    travelled += max(stepLen * 0.6, 0.004);
    if (travelled > FAR) break;
  }

  float steps = float(uSteps);
  lit = lit / steps * uGlow * 0.35;
  deep = deep / steps * uGlow;
  heat = heat / steps * uGlow * uHeat;
  lava = lava / steps * uGlow * uLava;

  // The flare is the finale: the star's output climbs an order of magnitude
  // over the last stretch of scroll, and its colour runs from amber toward
  // white heat.
  float flared = uStarGlow * (1.0 + uFlare * 9.0);
  star = star / steps * flared;

  // Amber carries everything. It desaturates as it brightens — hot, not gold.
  vec3 colour = mix(uRecord, vec3(1.0, 0.97, 0.92), clamp(deep * 0.9, 0.0, 0.7)) * deep;
  colour += uRecord * lit * 0.1;
  colour += mix(uRecord, vec3(1.0, 0.86, 0.62), 0.5) * heat;
  colour += mix(uRecord, vec3(1.0, 0.66, 0.3), 0.8) * lava;
  colour += mix(uRecord, vec3(1.0, 0.94, 0.86), clamp(star * 0.5 + uFlare * 0.4, 0.0, 0.9)) * star;

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
