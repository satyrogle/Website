// ============================================================
//  Final composite
//
//  Scene + restrained bloom, a filmic shoulder, an anamorphic-free
//  vignette and animated grain. No chromatic aberration: the canvas
//  sits directly behind body copy and the brief excludes it there.
// ============================================================

precision highp float;

in vec2 vUv;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uExposure;
uniform vec2 uResolution;

layout(location = 0) out vec4 outColor;

// ACES-derived filmic curve. Keeps the emissive channels from
// clipping to flat white while holding the deep ground black.
vec3 tonemap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;

  vec3 color = scene + bloom * uBloomStrength;
  color *= uExposure;
  color = tonemap(color);

  // Vignette — elliptical, weighted so the top of frame stays darker
  // than the base. Reads as a lens, not a CSS overlay.
  vec2 q = vUv - 0.5;
  q.x *= uResolution.x / max(uResolution.y, 1.0) * 0.62;
  float v = 1.0 - smoothstep(0.34, 0.92, length(q));
  color *= mix(1.0, v, uVignette);

  // Grain, animated per frame at a low amplitude. Sits on top of the
  // vignette so the darkest corners keep some texture and never band.
  float g = hash(vUv * uResolution + fract(uTime) * 137.0);
  color += (g - 0.5) * uGrain;

  outColor = vec4(color, 1.0);
}
