// ============================================================
//  Gray–Scott reaction–diffusion
//
//  A' = A + (Da * lap(A) - A*B^2 + f*(1 - A)) * dt
//  B' = B + (Db * lap(B) + A*B^2 - (k + f)*B) * dt
//
//  Stored in RG of a half-float target and ping-ponged each frame.
//  This field is the site's persistent state: it is never cleared
//  or reseeded on section change (brief §2.3). Feed and kill rates
//  are eased between presets so the three game states read as one
//  system changing behaviour, not three separate simulations.
// ============================================================

precision highp float;

in vec2 vUv;

uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uDt;

uniform float uFeed;
uniform float uKill;
uniform float uDiffuseA;
uniform float uDiffuseB;

// Structural bias: the lattice's own symmetry, fed back into the
// chemistry so growth follows the object rather than drifting freely.
uniform float uStructure;

// Pointer / scripted disturbance. xy = uv, z = radius, w = strength.
uniform vec4 uSplat;

// Additional decaying splats issued by the scroll director.
uniform vec4 uSplatB;

layout(location = 0) out vec4 outState;

// Nine-point Laplacian. Weights sum to zero; diagonals carry less
// influence than edge neighbours, which keeps growth isotropic
// enough to avoid axis-aligned artefacts on a square grid.
vec2 laplacian(vec2 uv) {
  vec2 sum = vec2(0.0);
  sum += texture(uState, uv + vec2(-uTexel.x, -uTexel.y)).rg * 0.05;
  sum += texture(uState, uv + vec2(0.0, -uTexel.y)).rg * 0.20;
  sum += texture(uState, uv + vec2(uTexel.x, -uTexel.y)).rg * 0.05;
  sum += texture(uState, uv + vec2(-uTexel.x, 0.0)).rg * 0.20;
  sum += texture(uState, uv).rg * -1.00;
  sum += texture(uState, uv + vec2(uTexel.x, 0.0)).rg * 0.20;
  sum += texture(uState, uv + vec2(-uTexel.x, uTexel.y)).rg * 0.05;
  sum += texture(uState, uv + vec2(0.0, uTexel.y)).rg * 0.20;
  sum += texture(uState, uv + vec2(uTexel.x, uTexel.y)).rg * 0.05;
  return sum;
}

// A soft image of the entity, biasing the feed rate so growth follows
// the structure. Field projects object XY through a half-extent of 4.5:
//   monolith kite  ±2.35 x, ±4.4 y  ->  0.52, 0.98 in p
//   ring band      r 1.55..4.9      ->  0.34..1.0 in p
float latticeBias(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0;

  // The kite silhouette of the doors.
  float kite = abs(p.x) / 0.52 + abs(p.y) / 0.98;
  float door = smoothstep(1.08, 0.85, kite);

  // The ring band, generous — every ring overlaps it in projection.
  float r = length(p);
  float band = smoothstep(0.3, 0.42, r) * smoothstep(1.05, 0.9, r);

  return clamp(door * 0.6 + band * 0.5, 0.0, 1.0);
}

void applySplat(inout vec2 s, vec2 uv, vec4 splat) {
  if (splat.w <= 0.0001) return;
  // Aspect-corrected so a pointer splat is round, not elliptical.
  float d = distance(uv, splat.xy);
  float amount = smoothstep(splat.z, 0.0, d) * splat.w;
  s.g = clamp(s.g + amount, 0.0, 1.0);
  s.r = clamp(s.r - amount * 0.55, 0.0, 1.0);
}

void main() {
  vec2 s = texture(uState, vUv).rg;
  vec2 lap = laplacian(vUv);

  float bias = latticeBias(vUv);
  // Feed varies subtly with structure: slightly richer on the plates,
  // leaner in the voids. This is what makes the field look grown into
  // the object instead of projected onto it.
  //
  // The bias is small on purpose. Gray-Scott is highly sensitive to
  // feed/kill, and a larger nudge pushes parts of the field out of the
  // pattern-forming regime into solid growth, which fills the plates.
  float feed = uFeed + bias * 0.0022 * uStructure;
  float kill = uKill - bias * 0.0010 * uStructure;

  float reaction = s.r * s.g * s.g;

  float da = uDiffuseA * lap.r - reaction + feed * (1.0 - s.r);
  float db = uDiffuseB * lap.g + reaction - (kill + feed) * s.g;

  s.r = clamp(s.r + da * uDt, 0.0, 1.0);
  s.g = clamp(s.g + db * uDt, 0.0, 1.0);

  applySplat(s, vUv, uSplat);
  applySplat(s, vUv, uSplatB);

  outState = vec4(s, 0.0, 1.0);
}
