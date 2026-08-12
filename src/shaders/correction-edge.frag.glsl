// Colour grammar, never redefined:
//
//   cyan    the world        live deviation from the record
//   violet  the consequence  V = D × C — enforcement contact and the bruise
//
// Amber is not here. The record is a separate object with its own geometry,
// because it is a different thing rather than a different tint of this one.
//
// There is no ambient term. An edge with no disagreement emits nothing, so the
// structure is visible exactly where state illuminates it and the calm is
// mostly the record's own faint light.

uniform vec3 uWorld;
uniform vec3 uConsequence;
uniform float uGlowGain;
uniform float uContactGain;
uniform float uBruiseGain;
uniform float uBruiseWeight;
uniform float uExposure;

in float vGlow;
in float vBruise;
in float vContact;

out vec4 fragColour;

void main() {
  // Saturating response, so a hard strike brightens without clipping to white
  // and losing the hue that carries the meaning.
  float live = 1.0 - exp(-vGlow * uGlowGain);
  float contact = 1.0 - exp(-vContact * uContactGain);
  float trace = 1.0 - exp(-vBruise * uBruiseGain);

  vec3 colour = uWorld * live;
  colour += uConsequence * (contact + trace * uBruiseWeight);

  fragColour = vec4(colour * uExposure, 1.0);
}
