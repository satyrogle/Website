// Initial condition for the reaction field.
//
// Seeded once, at load. The pattern is not random noise: it follows
// the lattice's own symmetry so the very first frame already reads as
// a structure waking rather than static settling into shape.

precision highp float;

in vec2 vUv;

uniform float uSeed;

layout(location = 0) out vec4 outState;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;

  // Seed on the door silhouette and across the ring band (constants
  // must match latticeBias in reaction.frag.glsl).
  float kite = abs(p.x) / 0.52 + abs(p.y) / 0.98;
  float door = step(kite, 1.0);
  float r = length(p);
  float band = step(0.34, r) * step(r, 1.0);

  float b = 0.0;
  b += door * step(0.6, hash(floor(p * 30.0) + uSeed));
  b += band * step(0.66, hash(floor(p * 24.0) + uSeed * 2.3));

  b = clamp(b, 0.0, 1.0);

  outState = vec4(1.0 - b * 0.62, b, 0.0, 1.0);
}
