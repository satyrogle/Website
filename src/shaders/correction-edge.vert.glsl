// The world. One vertex per edge endpoint; the state texture carries what the
// simulation decided, and the vertex moves because of it.
//
// p = p₀ + u · n̂ — the structure physically deviates and is physically pushed
// back. Nothing here interpolates toward a pose; every position is the
// authoritative displacement of that tick.

uniform sampler2D uState;
uniform int uTextureSize;
uniform float uDisplacement;

in vec3 aDirection;
in float aNode;

out float vGlow;
out float vBruise;
out float vContact;

void main() {
  int index = int(aNode + 0.5);
  vec4 state = texelFetch(uState, ivec2(index % uTextureSize, index / uTextureSize), 0);

  vGlow = state.g;
  vBruise = state.b;
  vContact = state.a;

  vec3 displaced = position + aDirection * (state.r * uDisplacement);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
