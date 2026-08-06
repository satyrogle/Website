// Bright-pass extract with a 13-tap dual-axis blur, run at quarter
// resolution. Restrained on purpose: only the reaction channels and
// the ring are allowed to bloom, and only enough to imply real light
// energy. The brief excludes excessive bloom, so the threshold sits
// high and the radius stays small.

precision highp float;

in vec2 vUv;

uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uRadius;

layout(location = 0) out vec4 outColor;

vec3 bright(vec2 uv) {
  vec3 c = texture(uScene, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - uThreshold, 0.0) / max(l, 0.0001);
  return c * k;
}

void main() {
  vec2 r = uTexel * uRadius;
  vec3 sum = vec3(0.0);

  sum += bright(vUv) * 0.1964825501511404;

  sum += bright(vUv + vec2(r.x * 1.411764705882353, 0.0)) * 0.2969069646728344;
  sum += bright(vUv - vec2(r.x * 1.411764705882353, 0.0)) * 0.2969069646728344;
  sum += bright(vUv + vec2(r.x * 3.2941176470588234, 0.0)) * 0.09447039785044732;
  sum += bright(vUv - vec2(r.x * 3.2941176470588234, 0.0)) * 0.09447039785044732;

  sum += bright(vUv + vec2(0.0, r.y * 1.411764705882353)) * 0.2969069646728344;
  sum += bright(vUv - vec2(0.0, r.y * 1.411764705882353)) * 0.2969069646728344;
  sum += bright(vUv + vec2(0.0, r.y * 3.2941176470588234)) * 0.09447039785044732;
  sum += bright(vUv - vec2(0.0, r.y * 3.2941176470588234)) * 0.09447039785044732;

  outColor = vec4(sum * 0.5, 1.0);
}
