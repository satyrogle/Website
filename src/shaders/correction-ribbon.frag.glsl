// Colour grammar, never redefined:
//
//   amber   the record       the approved state — a restrained grazing edge
//   cyan    the world        a ribbon actually out of the permitted flow
//   violet  the consequence  V = D × C — the system's grip, and the trace
//
// The body of a ribbon is almost black. Light only appears where the surface
// turns away from the eye, so what the frame shows at rest is a set of thin
// edges catching the record's own light — presence without a silhouette. That
// is what lets the field read as coordination rather than as an object: there
// is no lit mass to recognise, only many separate things agreeing.
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
uniform float uExposure;

in float vGlow;
in float vBruise;
in float vContact;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vView;

out vec4 fragColour;

float response(float value, float scale, float gamma) {
  float x = clamp(value * scale, 0.0, 1.0);
  // pow(0, y) is specified as 0 for y > 0 and has been returned as NaN by real
  // drivers anyway, and a NaN here renders the ribbon black.
  return x <= 0.0 ? 0.0 : pow(x, gamma);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);

  // Grazing edge. Bright where the ribbon turns away, dark across its face.
  float graze = pow(1.0 - abs(dot(n, v)), uEdge);

  // The record's own light: one fixed direction for the whole field, and a
  // ribbon runs bright exactly where its length lies against it. Alignment is
  // what glows — the coordination is the illumination — so the calm can be
  // loud without any ribbon gaining a silhouette. The graze factor in the
  // weight keeps a face-on ribbon a body rather than a lit slab.
  vec3 t = normalize(vTangent);
  float th = dot(t, normalize(uLightDir + v));
  float run = pow(max(1.0 - th * th, 0.0), uSheenPower * 0.5);
  // Gated hard to the grazing zone. With a quarter of the run reaching
  // face-on surfaces the field rendered as lit straps — solid, satin, an
  // object pile. At six percent the light draws long edges and nothing owns
  // a face.
  float record = graze * uRecordGain + run * uSheen * (0.06 + 0.94 * graze);

  float live = response(vGlow, uGlowScale, uGlowGamma);
  float grip = response(vContact, uContactScale, uContactGamma);
  float trace = response(vBruise, uBruiseScale, uBruiseGamma);

  // The record's colour desaturates as it brightens: a peak is hot, not
  // yellow. Held at constant hue the bright runs rendered as gilding — the
  // difference between a field drawn in light and one painted in gold.
  vec3 recordColour = mix(uRecord, vec3(1.0, 0.985, 0.93), clamp(record * 0.5, 0.0, 0.6));
  vec3 colour = recordColour * record;

  // A deviating ribbon is lit along its length rather than only at its edge:
  // it has left the flow, and the point is that you can see which one.
  colour = mix(colour, uWorld * max(graze, 0.42), live);

  // Violet replaces cyan under contact rather than adding to it. Added, it
  // loses — enforcement happens exactly where the deviation is brightest.
  colour = mix(colour, uConsequence * max(graze, 0.5), grip);

  // The residue is thin on purpose: something you could almost miss.
  colour += uConsequence * trace * uBruiseWeight * graze;

  fragColour = vec4(colour * uExposure, 1.0);
}
