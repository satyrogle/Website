// Amber: the model of the world. Lit by the same rake as the world so the two
// read as the same surface in two states, rather than as two materials.

uniform vec3 uRecord;
uniform vec3 uLight;
uniform float uKey;
uniform float uFill;
uniform float uExposure;

in vec3 vNormal;

out vec4 fragColour;

void main() {
  float lambert = max(dot(normalize(vNormal), normalize(uLight)) + 0.22, 0.0) / 1.22;
  fragColour = vec4(uRecord * (uFill + uKey * lambert) * uExposure, 1.0);
}
