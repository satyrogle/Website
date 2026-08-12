// Colour grammar, never redefined:
//
//   amber   the record       the approved arrangement — a restrained grazing edge
//   cyan    the world        a blade actually out of the law
//   violet  the consequence  V = D × C — the system's grip, and the trace
//
// The body of a blade is almost black. Light only appears where the surface
// turns away from the eye, so what the frame shows at rest is thousands of thin
// edges catching one light — presence without a silhouette. There is no lit
// mass to recognise and therefore nothing to dismiss, only many separate things
// visibly agreeing.
//
// The aureole is made here and is never drawn. Blades passing the absence carry
// a higher edge gain, because the flow crowds as it is forced around, and an
// accumulation of lit edges along a boundary is what the eye reports as a halo.
// Nothing in this file knows what a circle is.
//
// Every channel is scale-then-gamma. The gamma on the world channel is above
// one deliberately: below it, the smallest values are lifted hardest, and the
// ambient drift — the movement the system is defined as unable to see — would
// render as cyan across the whole field, so the approved state would show as
// permanently deviating.

uniform vec3 uRecord;
uniform vec3 uWorld;
uniform vec3 uConsequence;
uniform float uEdge;
uniform float uRecordGain;
uniform float uShellGain;
uniform vec3 uLightDir;
uniform float uSheen;
uniform float uSheenPower;
uniform float uGlowScale;
uniform float uGlowGamma;
uniform float uContactScale;
uniform float uContactGamma;
uniform float uBruiseScale;
uniform float uBruiseGamma;
uniform float uBruiseWeight;
uniform float uGhostGain;
uniform float uRecessionNear;
uniform float uRecessionRange;
uniform float uExposure;

in float vGlow;
in float vBruise;
in float vContact;
in float vEdgeGain;
in float vLight;
in float vAlong;
in float vDepth;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vView;

out vec4 fragColour;

float response(float value, float scale, float gamma) {
  float x = clamp(value * scale, 0.0, 1.0);
  // pow(0, y) is specified as 0 for y > 0 and has been returned as NaN by real
  // drivers anyway, and a NaN here renders the blade black. This has already
  // cost one build on the actual card while the software raster showed nothing
  // wrong.
  return x <= 0.0 ? 0.0 : pow(x, gamma);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);

  // Grazing edge. Bright where the blade turns away, dark across its face.
  float graze = pow(1.0 - abs(dot(n, v)), uEdge);

  // Recession.
  //
  // Light is taken away with distance rather than a haze being added over it:
  // the far field thins into darkness, which is the third zone the choir is
  // supposed to have and the only thing that made the frame read as deep
  // rather than as a flat sheet of texture. Not fog — nothing is being mixed
  // toward a fog colour, and there is no participating medium — so the near
  // black stays black and the ban on atmosphere stands.
  float recession = exp(-max(vDepth - uRecessionNear, 0.0) / uRecessionRange) * vLight;

#ifdef GHOST
  // Where the blade is supposed to be.
  //
  // Coincident with the world wherever the two agree, so at rest it is exactly
  // invisible and costs nothing but a draw. It appears only as a blade leaves
  // the law, which makes the record a thing the visitor can see the world
  // failing to match rather than a claim the site makes in text.
  float divergence = response(vGlow, uGlowScale, uGlowGamma);
  float body = graze * uGhostGain * divergence * recession;
  fragColour = vec4(uRecord * body * uExposure, body);
#else
  // The record's own light: one fixed direction for the whole choir, and a
  // blade runs bright exactly where its length lies against it. Alignment is
  // what glows — the coordination is the illumination — so the calm can be loud
  // without any blade gaining a silhouette.
  vec3 t = normalize(vTangent);
  float th = dot(t, normalize(uLightDir + v));
  float run = pow(max(1.0 - th * th, 0.0), uSheenPower * 0.5);

  // Blades crowding past the absence catch more of it. This is the aureole:
  // an accumulation, not an emitter, and broken wherever the density mask left
  // the boundary sparse.
  float gain = uRecordGain * (1.0 + uShellGain * vEdgeGain);

  // Gated hard to the grazing zone. With a quarter of the run reaching face-on
  // surfaces the field renders as lit straps — solid, satin, a pile of objects.
  // At six percent the light draws long edges and nothing owns a face.
  float record = graze * gain + run * uSheen * (0.06 + 0.94 * graze);

  float live = response(vGlow, uGlowScale, uGlowGamma);
  float grip = response(vContact, uContactScale, uContactGamma);
  float trace = response(vBruise, uBruiseScale, uBruiseGamma);

  // The record's colour desaturates as it brightens: a peak is hot, not yellow.
  // Held at constant hue the bright runs render as gilding — the difference
  // between a field drawn in light and one painted in gold.
  vec3 recordColour = mix(uRecord, vec3(1.0, 0.985, 0.93), clamp(record * 0.5, 0.0, 0.6));
  vec3 colour = recordColour * record;

  // A deviating blade is lit along its whole length rather than only at its
  // edge: it has left the law, and the point is that you can see which one.
  colour = mix(colour, uWorld * max(graze, 0.42), live);

  // Violet replaces cyan under contact rather than adding to it. Added, it
  // loses — enforcement happens exactly where the deviation is brightest.
  colour = mix(colour, uConsequence * max(graze, 0.5), grip);

  // The residue is thin on purpose: something you could almost miss.
  colour += uConsequence * trace * uBruiseWeight * graze;

  fragColour = vec4(colour * recession * uExposure, 1.0);
#endif
}
