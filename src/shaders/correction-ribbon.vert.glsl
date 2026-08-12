// One ribbon vertex.
//
// The strip spans the ribbon's sideways direction; its face normal is the same
// direction the state displaces along, so a ribbon that escapes the flow turns
// its face as it goes and the grazing light changes with it. The violation is
// visible as a change in shape before any colour is involved.

uniform sampler2D uState;
uniform int uTextureSize;
uniform float uDisplacement;

in vec3 aDirection;
in vec3 aBinormal;
in float aWidth;
in float aSide;
in float aNode;

out float vGlow;
out float vBruise;
out float vContact;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vView;

void main() {
  int index = int(aNode + 0.5);
  ivec2 texel = ivec2(index % uTextureSize, index / uTextureSize);
  vec4 state = texelFetch(uState, texel, 0);

  vGlow = state.g;
  vBruise = state.b;
  vContact = state.a;

  // Out of the permitted flow, then across the ribbon's own width.
  vec3 centre = position + aDirection * (state.r * uDisplacement);
  vec3 placed = centre + aBinormal * (aSide * aWidth);

  vec4 viewPosition = modelViewMatrix * vec4(placed, 1.0);
  vNormal = normalize(normalMatrix * aDirection);
  // The ribbon's length direction, completing the frame the two attributes
  // already span. The record's light reads against this.
  vTangent = normalize(normalMatrix * cross(aBinormal, aDirection));
  vView = normalize(-viewPosition.xyz);

  gl_Position = projectionMatrix * viewPosition;
}
