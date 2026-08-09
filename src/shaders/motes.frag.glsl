// Particulate — soft round falloff, cold, and dim.
//
// Deliberately quiet. These are not stars: the moment they read as
// points of light the frame becomes a space scene, and the entity is
// supposed to be hanging in a medium, not in orbit. They earn their
// place by parallaxing against the entity, which is what tells the eye
// there is depth here — not by being visible in their own right.

precision highp float;

in float vBright;

uniform vec3 uColdSilver;
uniform vec3 uTeal;

layout(location = 0) out vec4 outColor;

void main() {
  // Round, soft-edged. gl_PointCoord is the only thing available here,
  // and a squared falloff is enough — anything sharper reads as a
  // rendered dot rather than something out of focus.
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float falloff = 1.0 - r2 * 4.0;
  falloff *= falloff;

  // Two cold tints, split by brightness: the dimmer motes sit teal and
  // recede, the few bright ones go pale silver and come forward. One
  // colour at one brightness is a dust texture, not a volume.
  vec3 tint = mix(uTeal, uColdSilver, smoothstep(0.35, 0.9, vBright));

  outColor = vec4(tint * falloff * vBright, 1.0);
}
