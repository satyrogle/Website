// Matte material under one grazing light, plus the colour grammar.
//
//   cyan    the world        live deviation from the record
//   violet  the consequence  V = D × C — enforcement contact and the bruise
//
// Amber is not here; the record is a separate surface with its own geometry.
//
// The light rakes almost parallel to the plate. That is not a look, it is how a
// finished surface is inspected for defects: at a few degrees of incidence a
// slope of a fraction of a degree swings N·L enormously, so a swelling far too
// shallow to see as a shape is unmissable as shading. The frame is lit by the
// system examining its own body.

uniform vec3 uMaterial;
uniform vec3 uWorldColour;
uniform vec3 uConsequence;
uniform vec3 uLight;
uniform float uKey;
uniform float uFill;
uniform float uSheen;
uniform vec3 uEye;
uniform float uGlowScale;
uniform float uGlowGamma;
uniform float uContactScale;
uniform float uContactGamma;
uniform float uBruiseScale;
uniform float uBruiseGamma;
uniform float uBruiseWeight;
uniform float uExposure;

in vec3 vNormal;
in vec3 vWorld;
in float vGlow;
in float vBruise;
in float vContact;

out vec4 fragColour;

float response(float value, float scale, float gamma) {
  return pow(clamp(value * scale, 0.0, 1.0), gamma);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(uLight);

  float lambert = max(dot(normal, light), 0.0);
  // A little wrap, so the unlit side falls to near-black rather than to a hard
  // terminator. A hard terminator on a near-flat plate reads as a drawn edge.
  float wrapped = max((dot(normal, light) + 0.22) / 1.22, 0.0);

  vec3 base = uMaterial * (uFill + uKey * mix(lambert, wrapped, 0.6));

  // Narrow grazing sheen. Enough that the material is ambiguous between
  // machined solid and standing fluid, far short of a reflection.
  vec3 eye = normalize(uEye - vWorld);
  vec3 half3 = normalize(eye + light);
  float sheen = pow(max(dot(normal, half3), 0.0), 220.0) * uSheen;

  float live = response(vGlow, uGlowScale, uGlowGamma);
  float grip = response(vContact, uContactScale, uContactGamma);
  float trace = response(vBruise, uBruiseScale, uBruiseGamma);

  vec3 colour = base + uWorldColour * live + vec3(sheen);

  // Violet replaces the world's colour under contact rather than adding to it.
  // Added, it loses: enforcement happens exactly where the deviation is
  // brightest, so a violet term summed into that is a hue nobody can see.
  colour = mix(colour, uConsequence * max(live, grip), grip);
  colour += uConsequence * trace * uBruiseWeight;

  fragColour = vec4(colour * uExposure, 1.0);
}
