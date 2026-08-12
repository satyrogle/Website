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
//
// Every channel is scale-then-gamma rather than a saturating exponential. The
// exponential was wrong for a reason worth keeping written down: it drove a
// 0.02 drift to three quarters of full and a 0.45 deviation to full, so the
// entire veil read as maximally deviating and the actual violation — the thing
// the system reacts to — had nowhere brighter to go. Brightness has to rank
// magnitude, or a press floods the frame and the correction has no contrast to
// happen against.

uniform vec3 uWorld;
uniform vec3 uConsequence;
uniform float uGlowScale;
uniform float uGlowGamma;
uniform float uContactScale;
uniform float uContactGamma;
uniform float uBruiseScale;
uniform float uBruiseGamma;
uniform float uBruiseWeight;
uniform float uExposure;

in float vGlow;
in float vBruise;
in float vContact;

out vec4 fragColour;

float response(float value, float scale, float gamma) {
  float x = clamp(value * scale, 0.0, 1.0);
  // pow(0, y) is specified as 0 for y > 0 and has been returned as NaN by real
  // drivers anyway. A NaN here propagates through the mix into the fragment
  // and the structure renders black — which is exactly how an earlier object
  // in this project disappeared on one machine while looking correct on
  // another. At rest most of the veil has a channel sitting at zero, so this
  // is the common case, not the edge case.
  return x <= 0.0 ? 0.0 : pow(x, gamma);
}

void main() {
  float live = response(vGlow, uGlowScale, uGlowGamma);
  float grip = response(vContact, uContactScale, uContactGamma);
  float trace = response(vBruise, uBruiseScale, uBruiseGamma);

  // Violet replaces cyan under contact rather than adding to it. Added, it
  // loses: enforcement happens exactly where the deviation is brightest, so a
  // violet term summed into a bright cyan is a hue nobody can see. What is true
  // of the node is that the system has hold of it, and that is what the frame
  // should say.
  vec3 colour = mix(uWorld * live, uConsequence * max(live, grip), grip);

  // The bruise is additive because it is a residue, not a state — it sits on
  // structure that is otherwise dark and finished with.
  colour += uConsequence * trace * uBruiseWeight;

  fragColour = vec4(colour * uExposure, 1.0);
}
