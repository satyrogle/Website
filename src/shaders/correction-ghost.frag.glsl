// Amber: the model of the world. Flat and unvarying by intent — the record has
// no state of its own to express, and giving it a gradient would make it look
// like a second live system rather than a file.

uniform vec3 uRecord;
uniform float uIntensity;

out vec4 fragColour;

void main() {
  fragColour = vec4(uRecord * uIntensity, 1.0);
}
