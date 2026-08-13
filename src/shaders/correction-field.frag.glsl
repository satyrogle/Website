// The source, as light only.
//
// Everything with a surface is real geometry now — the authored fragments in
// `PlanetModel` — so this pass carries what geometry cannot: the interior
// energy of a failing world, accumulated along the ray.
//
// It used to carry the fragments too, as distance fields, and that is where
// the grid came from: a repeating seam pattern evaluated across every surface,
// which made all forty pieces read as manufactured procedural objects. Founder
// verdict, and the most damaging single fault in the build. Deleting the SDF
// geometry deletes the grid at its source rather than hiding it.
//
// Two rules survive from everything before:
//
//   - light is accumulated along the ray, never painted onto a surface;
//   - the core is never a clean orb. Its envelope is uneven and slowly
//     reorganising, turbulence carries past it, and radial filaments read as
//     ejecta. The crust in front of it does the rest of the shaping: this pass
//     draws behind the fragments, so what reaches the eye comes through the
//     gaps between them.
//
// No rings, and one subtlety that took a capture to find: emission in open
// space must be integrated by step length, not accumulated per sample, or the
// march quantises the envelope into its own sampling shells and draws faint
// concentric arcs around the core — a ring manufactured by sampling.

precision highp float;

uniform vec2 uResolution;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform float uTanFov;

uniform float uBreath;
uniform int uSteps;

uniform vec3 uRecord;
uniform vec3 uStarPos;
uniform float uStarRadius;
uniform float uStarGlow;
uniform float uStarNoise;
uniform float uEjecta;
uniform float uFlare;
uniform float uExposure;

out vec4 fragColour;

const float FAR = 70.0;

/**
 * Layered irregularity from products of unaligned sines: smooth, seamless, and
 * with no axis-locked lattice for the eye to catch.
 */
float terrain(vec3 d) {
  return 0.6 * sin(d.x * 3.1 + 1.7) * sin(d.y * 2.3 - 0.6)
       + 0.4 * sin(d.y * 5.7 + 2.1) * sin(d.z * 4.3 + 0.9)
       + 0.25 * sin(d.z * 8.9 - 1.2) * sin(d.x * 7.1 + 3.3);
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;

  vec3 direction = normalize(
    uCamRight * (ndc.x * aspect * uTanFov) + uCamUp * (ndc.y * uTanFov) + uCamForward
  );

  // Dithered start, so what banding survives integration reads as grain in the
  // ejecta rather than as structure.
  float travelled =
    fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 0.2;

  float star = 0.0;

  for (int i = 0; i < 256; i++) {
    if (i >= uSteps) break;

    vec3 p = uCamPos + direction * travelled;
    vec3 sp = p - uStarPos;
    float dStar = length(sp);
    vec3 sdir = sp / max(dStar, 1e-4);

    // Sampling densifies toward the core and strides across empty space.
    float stride = clamp((dStar - uStarRadius * 0.5) * 0.5, 0.06, 1.6);

    float lumpy = 1.0 + uStarNoise * terrain(sdir * 2.0 + uBreath * 0.15);
    float hot = exp(-max(dStar - uStarRadius * lumpy, 0.0) * (1.6 / uStarRadius));
    float turb = 0.55 + 0.45 * terrain(sdir * 5.0 - uBreath * 0.1);
    float dirty = exp(-max(dStar - uStarRadius, 0.0) * (0.45 / uStarRadius)) * turb;
    float fil = max(terrain(sdir * 7.3 + 3.7), 0.0);
    float ejecta = fil * fil
      * exp(-max(dStar - uStarRadius * 1.2, 0.0) * (0.5 / uStarRadius)) * uEjecta;

    star += (hot + dirty * 0.45 + ejecta) * stride;

    travelled += stride;
    if (travelled > FAR) break;
  }

  float flared = uStarGlow * (1.0 + uFlare * 4.0);
  star = star / float(uSteps) * flared;

  vec3 colour =
    mix(uRecord, vec3(1.0, 0.95, 0.88), clamp(star * 0.7 + uFlare * 0.4, 0.0, 0.92)) * star;
  // Clipping to white is allowed only well past core saturation, so the bloom
  // stays where the light actually is.
  colour += vec3(1.0) * max(star - 1.9, 0.0) * 0.5;

  fragColour = vec4(colour * uExposure, 1.0);
}
