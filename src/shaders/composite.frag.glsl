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
uniform sampler2D uHaze;
uniform float uBloomStrength;
uniform float uHazeStrength;
uniform float uDrift;
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

// Smoothed value noise. Deliberately not the per-pixel grain below:
// grain describes the LENS, and this has to describe the AIR, which
// means features big enough to drift across the frame and slow enough
// to be felt rather than seen.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  // Atmosphere. Added as LIGHT, before exposure and the tonemap, so it
  // goes through the same filmic shoulder as everything else — added
  // after, it would sit on top of the image as a wash instead of
  // behaving like something in the air.
  vec3 haze = texture(uHaze, vUv).rgb;
  float hazeLum = dot(haze, vec3(0.2126, 0.7152, 0.0722));

  vec3 color = scene + bloom * uBloomStrength + haze * uHazeStrength;
  color *= uExposure;
  color = tonemap(color);

  // Vignette — elliptical. Reads as a lens, not a CSS overlay.
  //
  // But it no longer closes uniformly: the void RELAXES wherever the
  // entity's light reaches it, using the haze as the mask. That is the
  // difference between a dark rectangle and darkness looming over
  // something — the black has to be pushed back by the subject rather
  // than applied evenly on top of it. exp, never pow: the base here
  // reaches exactly zero across most of the frame, and pow(0, y) is NaN
  // on D3D11.
  vec2 q = vUv - 0.5;
  q.x *= uResolution.x / max(uResolution.y, 1.0) * 0.62;
  float v = 1.0 - smoothstep(0.34, 0.92, length(q));
  float reach = 1.0 - exp(-max(hazeLum, 0.0) * uHazeStrength * 6.0);
  v = mix(v, 1.0, reach * 0.55);
  color *= mix(1.0, v, uVignette);

  // Particulate drift. Two octaves, very large and very slow, at an
  // amplitude that should never be consciously visible — its whole job
  // is to stop the deep black reading as a dead pixel field, which is
  // what makes a void look like an empty canvas instead of air.
  //
  // Masked to the DARK, so it cannot wash the entity, and tinted toward
  // the haze so the motes are the entity's own light scattering rather
  // than a grey fog laid over the top.
  vec2 dp = vUv * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float drift =
      vnoise(dp * 2.6 + vec2(uTime * 0.012, uTime * -0.008))
    + vnoise(dp * 5.3 - vec2(uTime * 0.009, uTime * 0.014)) * 0.5;
  drift = drift / 1.5 - 0.5;
  float dark = 1.0 - smoothstep(0.0, 0.20, dot(color, vec3(0.2126, 0.7152, 0.0722)));
  color += (vec3(0.30, 0.52, 0.80) + haze * 1.5) * drift * uDrift * dark;

  // Grain, animated per frame at a low amplitude. Sits on top of the
  // vignette so the darkest corners keep some texture and never band.
  float g = hash(vUv * uResolution + fract(uTime) * 137.0);
  color += (g - 0.5) * uGrain;

  outColor = vec4(color, 1.0);
}
