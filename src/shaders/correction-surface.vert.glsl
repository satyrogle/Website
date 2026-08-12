// The world: a surface displaced along its own normal by the authoritative
// state, with the normal tilted to match.
//
// The tilt is the point. This surface is read by its shading, not by its
// outline, so a swelling whose normal stays put is invisible under any light
// however tall it is. The gradient of the deviation across the surface comes
// from the Worker, where it is solved as a fixed linear function of neighbour
// differences; here it is one perturbation of the rest normal.

uniform sampler2D uState;
uniform sampler2D uSlope;
uniform int uTextureSize;
uniform float uDisplacement;

in vec3 aNormal;
in float aNode;

out vec3 vNormal;
out vec3 vWorld;
out float vGlow;
out float vBruise;
out float vContact;

void main() {
  ivec2 texel = ivec2(int(aNode + 0.5) % uTextureSize, int(aNode + 0.5) / uTextureSize);
  vec4 state = texelFetch(uState, texel, 0);
  vec2 slope = texelFetch(uSlope, texel, 0).rg;

  vGlow = state.g;
  vBruise = state.b;
  vContact = state.a;

  vec3 displaced = position + aNormal * (state.r * uDisplacement);

  // Height-field perturbation: for y = h(x, z) the normal is
  // normalize(-dh/dx, 1, -dh/dz), so the deviation's gradient subtracts
  // directly from the rest normal's lateral components.
  vec3 tilted = normalize(aNormal - vec3(slope.x, 0.0, slope.y) * uDisplacement);

  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * tilted);

  gl_Position = projectionMatrix * viewMatrix * world;
}
