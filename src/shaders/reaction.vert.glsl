// Pass-through vertex stage for the simulation and post fullscreen quads.
// The quad is a single clip-space triangle pair; no matrices required.

precision highp float;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
