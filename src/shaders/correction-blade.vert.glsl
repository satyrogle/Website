// One blade of the choir.
//
// The unit blade arrives in `position` as (side, along, 0) and is built into
// the world here, from the instance's own frame: anchor, approved long axis,
// face normal. Everything else is state.
//
// The deviation is a rotation, not a translation. A blade that has left the law
// has physically swung out of the comb its neighbours are still in and slipped
// sideways out of its slot — so it is visible in greyscale, by being wrong,
// before any colour is involved. That is the whole reason the state is carried
// by geometry: a blade that only changed colour would be a diagram of a
// deviation rather than one.
//
// The ghost pass compiles the same file with GHOST defined and skips the
// deviation entirely, drawing where the blade is supposed to be.

uniform sampler2D uState;
uniform int uTextureSize;
uniform float uSwing;
uniform float uSwingClamp;
uniform float uSlip;
uniform float uTip;
uniform float uBow;
uniform float uCross;
uniform float uArc;

in vec3 iAnchor;
in vec3 iTangent;
in vec3 iNormal;
in vec2 iDims;
in vec3 iShape;
in float iNode;

out float vGlow;
out float vBruise;
out float vContact;
out float vEdgeGain;
out float vLight;
out float vAlong;
out float vDepth;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vView;

// Rodrigues. The axis must be unit length.
vec3 rotateAbout(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

void main() {
  int index = int(iNode + 0.5);
  ivec2 texel = ivec2(index % uTextureSize, index / uTextureSize);
  vec4 state = texelFetch(uState, texel, 0);

  vGlow = state.g;
  vBruise = state.b;
  vContact = state.a;
  vEdgeGain = iShape.y;
  vLight = iShape.z;

  float side = position.x;
  float along = position.y;
  vAlong = along;

  vec3 normal = normalize(iNormal);
  vec3 tangent = normalize(iTangent);
  vec3 anchor = iAnchor;

#ifndef GHOST
  // Clamped rather than trusted: a runaway state must bend the frame, never
  // turn a blade inside out.
  float angle = clamp(state.r * uSwing, -uSwingClamp, uSwingClamp);
  tangent = normalize(rotateAbout(tangent, normal, angle));
  anchor += cross(tangent, normal) * (state.r * uSlip * iDims.x);
#endif

  // Twist along the blade's own length, so a face turns as the eye travels up
  // it and no two blades catch the light identically.
  vec3 spine = rotateAbout(normal, tangent, iShape.x * along);
  vec3 across = cross(tangent, spine);

  // Tapered at one end only, and only over the last stretch. Tapering both ends
  // makes a converging bundle near the camera — a nozzle, which reads as an
  // object with a front and a purpose. Tapering continuously from the base
  // makes a wedge, and a field of wedges reads as broken glass rather than as a
  // congregation of blades. Parallel-sided most of the way, then a tip.
  float taper = mix(1.0, uTip, smoothstep(0.55, 1.0, along));

  // The cross-section is a shallow arc rather than flat.
  //
  // This is the whole reason the choir is visible. A flat quad has one normal
  // across its entire surface, so it lights as a single flat tone — the first
  // build of this rendered six thousand uniformly lit shards, because there was
  // no geometry for a grazing light to graze. Fanning the normal across the
  // width gives every blade a dark body and a bright edge, which is what turns
  // the field from a pile of plates into something discovered by light.
  vec3 face = rotateAbout(spine, tangent, -side * uCross);

  vec3 placed =
    anchor +
    tangent * (along * iDims.x) +
    across * (side * 0.5 * iDims.y * taper) +
    spine * (uArc * (1.0 - side * side) * iDims.y + uBow * along * along * iDims.x);

  vec4 viewPosition = modelViewMatrix * vec4(placed, 1.0);
  vNormal = normalize(normalMatrix * face);
  vTangent = normalize(normalMatrix * tangent);
  vView = normalize(-viewPosition.xyz);
  vDepth = -viewPosition.z;

  gl_Position = projectionMatrix * viewPosition;
}
