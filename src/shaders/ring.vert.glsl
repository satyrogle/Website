// The encircling ring — the strongest silhouette element after the
// chevron core. Kept on its own material so it can stay purely
// emissive while the lattice body stays near-black.

precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform float uTime;
uniform sampler2D uField;
uniform float uFieldExtent;
uniform float uBreathe;

out vec2 vUv;
out float vField;
out vec3 vViewDir;
out vec3 vNormal;

void main() {
  vUv = uv;

  vec3 pos = position;
  // The ring inhales very slightly, on a longer period than the core.
  pos *= 1.0 + sin(uTime * 0.21) * 0.004 * uBreathe;

  vec2 fuv = pos.xy / uFieldExtent * 0.5 + 0.5;
  vField = texture(uField, clamp(fuv, 0.001, 0.999)).g;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
