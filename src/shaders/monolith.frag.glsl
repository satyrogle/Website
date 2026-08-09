// Dark Lattice monolith — fragment stage.
//
// The surface is near-black obsidian. Light is earned in three ways and
// no others: cyan/teal along active fissures, restrained violet where a
// retained trace is being carried, and a cold edge response where the
// geometry turns away. Amber belongs to the halo alone and never
// touches a structural surface.

precision highp float;

uniform vec3 cameraPosition;

uniform sampler2D uField;
uniform float uTime;

// Structural blacks, recess -> exposed.
uniform vec3 uObsidian;
uniform vec3 uShell;
uniform vec3 uGraphite;
uniform vec3 uRaised;
// Active fissures.
uniform vec3 uTeal;
uniform vec3 uCyan;
// Retained consequence.
uniform vec3 uViolet;
// Cold edge response.
uniform vec3 uColdSilver;
// Halo only.
uniform vec3 uHaloWarm;
uniform vec3 uFogColor;

uniform float uClass;
uniform float uReaction;
uniform float uSeed;
uniform float uCrackScale;
uniform float uPartRadius;

uniform float uProgress;
uniform float uEmissive;
uniform float uWake;
uniform float uFogDensity;
uniform vec3 uKeyDir;
uniform float uKeyIntensity;
uniform vec3 uRimDir;
uniform float uRimIntensity;
uniform float uFillIntensity;
uniform float uSharp;
uniform float uHaloGain;

// The one causal demonstration: a disturbance made in the Full Form,
// carried unchanged through the tunnel, resolved at the latent core.
// xy = field uv, z = radius, w = strength.
uniform vec4 uTrace;
// How far the trace is stretched along v — 1 on planar surfaces, large
// in the tunnel, where it has to read as a scar running with the travel.
uniform float uTraceStretch;
// Retained consequence, 0..1. Rises across the prologue, never falls.
uniform float uRetained;

in vec3 vWorldPos;
in vec3 vSurfacePos;
in vec3 vNormal;
in vec3 vViewDir;
in vec2 vFieldUv;
in float vField;

layout(location = 0) out vec4 outColor;

const float CLASS_OBSIDIAN = 0.0;
const float CLASS_SPINE = 1.0;
const float CLASS_RIB = 2.0;
const float CLASS_WALL = 3.0;
const float CLASS_LATENT = 4.0;
const float CLASS_HALO = 5.0;

bool isClass(float which) {
  return abs(uClass - which) < 0.5;
}

/**
 * pow() with a base that can legitimately reach zero.
 *
 * HLSL compiles pow(x, y) as exp2(y * log2(x)), and log2(0) is -Inf — so
 * on ANGLE/D3D11 pow(0.0, y) is NaN where SwiftShader returns 0. A
 * single NaN survives the bloom blur and takes out a whole
 * low-resolution block, which presents as the entity rendering solid
 * black on a real GPU while headless captures look correct.
 */
float safePow(float x, float k) {
  return pow(max(x, 1e-6), k);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2(i).x;
  float b = hash2(i + vec2(1.0, 0.0)).x;
  float c = hash2(i + vec2(0.0, 1.0)).x;
  float d = hash2(i + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

/**
 * Cell boundaries, warped so the network never resolves into a lattice.
 * x: distance to the nearest border, zero along every edge.
 * y: distance to the nearest junction, where three cells meet.
 */
vec2 cellEdge(vec2 q, float seed) {
  vec2 warp = vec2(fbm(q * 0.55 + seed * 3.1), fbm(q * 0.55 + vec2(4.3, 1.7) - seed * 2.3));
  q += (warp - 0.5) * 0.44;

  vec2 ip = floor(q);
  vec2 fp = fract(q);
  float f1 = 8.0, f2 = 8.0, f3 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 offset = hash2(ip + g + seed * 17.0);
      float d = length(g + offset - fp);
      if (d < f1) { f3 = f2; f2 = f1; f1 = d; }
      else if (d < f2) { f3 = f2; f2 = d; }
      else if (d < f3) { f3 = d; }
    }
  }
  return vec2(f2 - f1, f3 - f1);
}

/** Per-facet identity, so no two cut planes answer the light alike. */
float facetKey(vec3 n, vec3 p, float seed) {
  vec3 bucket = floor(n * 5.0);
  float k = fract(sin(dot(bucket, vec3(12.9898, 78.233, 37.719)) + seed * 31.0) * 43758.5453);
  return fract(k + fbm(p.xy * uCrackScale * 2.4 + seed * 17.0) * 0.2);
}

/** Membership in the retained trace, in whichever space this part uses. */
float traceMask(vec2 uv) {
  if (uTrace.w < 0.001) return 0.0;
  vec2 d;
  // Narrow around the tunnel and long along it: a scar running with the
  // travel, not a stain wrapped round the corridor.
  float around = uTraceStretch > 1.5 ? 2.8 : 1.0;
  d.x = abs(fract(uv.x - uTrace.x + 0.5) - 0.5) * around;
  d.y = (uv.y - uTrace.y) / max(uTraceStretch, 0.001);
  d += (vec2(fbm(uv * 9.0), fbm(uv * 9.0 + 5.7)) - 0.5) * 0.035;
  return uTrace.w * (1.0 - smoothstep(0.0, max(uTrace.z, 1e-4), length(d)));
}

void main() {
  // Geometric normal from screen-space derivatives. The asset is low
  // poly and deliberately faceted; interpolating the authored normals
  // would round the cut planes back off.
  vec3 gn = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  vec3 V = normalize(vViewDir);
  if (dot(gn, V) < 0.0) gn = -gn;
  vec3 N = normalize(mix(gn, normalize(vNormal), 0.18));

  float b = texture(uField, vFieldUv).g;

  // ---- Halo -------------------------------------------------------
  if (isClass(CLASS_HALO)) {
    float r = length(vSurfacePos.xy) / max(uPartRadius, 1e-4);
    // A field of light, not a ring: broad, centre-weighted, and with no
    // edge anywhere that could read as an outline.
    // A broad field standing OUTSIDE the silhouette, dark through the
    // middle: light showing through the passage would read as a lit
    // doorway, and a hard inner edge would read as a ring.
    float band = smoothstep(0.24, 0.66, r) * (1.0 - smoothstep(0.58, 1.0, r));
    float amount = band * uHaloGain * uWake;
    outColor = vec4(uHaloWarm * amount * 0.3, 1.0);
    return;
  }

  float facet = facetKey(N, vSurfacePos, uSeed);
  // Dark-biased hard. Most of the building is near-black; only the most
  // exposed planes reach the top of the ramp.
  float exposure = safePow(facet, 1.7);

  vec3 base = mix(uObsidian, uShell, smoothstep(0.0, 0.45, exposure));
  base = mix(base, uGraphite, smoothstep(0.44, 0.78, exposure));
  base = mix(base, uRaised, smoothstep(0.8, 1.0, exposure));

  // The chamber must stay recessive or it out-brightens the subject
  // standing in front of it.
  if (isClass(CLASS_WALL)) base *= 0.45;
  if (isClass(CLASS_SPINE)) base *= 0.86;
  // The latent core is the destination: the same material run hotter in
  // a much smaller volume.
  if (isClass(CLASS_LATENT)) base *= 2.1;

  // ---- Analytic shading -------------------------------------------
  float key = clamp(dot(N, normalize(uKeyDir)), 0.0, 1.0);
  float fill = clamp(dot(N, vec3(0.0, -0.4, 0.9)) * 0.5 + 0.5, 0.0, 1.0);
  float rim = safePow(clamp(dot(N, normalize(uRimDir)), 0.0, 1.0), 2.4);
  float fresnel = safePow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);

  vec3 color = base * (0.2 + key * 1.05 * uKeyIntensity + fill * 0.3 * uFillIntensity);

  // ---- The fissure network ----------------------------------------
  // Isotropic in world units, so a cell is the same size on a 0.4 m
  // pier face and on a fifteen-metre tunnel wall. Scaling the axes
  // separately smeared the network into metre-wide blobs on the walls.
  vec3 sp = vSurfacePos * uCrackScale * 24.0;
  vec2 q = vec2(sp.x + sp.z * 0.62, sp.y - sp.z * 0.41);
  vec2 cell = cellEdge(q, uSeed);
  float width = mix(0.1, 0.045, clamp((uSharp - 0.45) / 0.3, 0.0, 1.0));
  float fissure = 1.0 - smoothstep(0.0, width, cell.x);
  float node = 1.0 - smoothstep(0.0, width * 1.8, cell.y);

  // Only fissures the field is actually driving light up. That gate is
  // what keeps the surface predominantly dark.
  float charge = smoothstep(0.36, 0.72, b) * uReaction;
  float lit = fissure * charge;

  vec3 fissureColor = mix(uTeal, uCyan, smoothstep(0.2, 0.75, b));
  color += fissureColor * lit * (0.8 + node * 1.2) * uEmissive * 0.85;

  // ---- The retained trace -----------------------------------------
  //
  // Cyan while it is a fresh disturbance, resolving to violet as the
  // consequence accumulates. It is added to the fissures that already
  // exist rather than painted over the surface, and it never subtracts.
  float trace = traceMask(vFieldUv);
  if (trace > 0.001) {
    float seam = mix(fissure, 1.0, 0.28);
    vec3 traceColor = mix(uCyan, uViolet, smoothstep(0.15, 0.85, uRetained));
    float carrier = isClass(CLASS_WALL) ? 0.45 : 1.0;
    color += traceColor * trace * seam * (0.55 + node * 1.1) * uEmissive * 1.15 * carrier;
    // A little of it survives on the raw surface, so the trace is still
    // legible where the fissure network happens to be sparse.
    color += traceColor * trace * 0.12;
  }

  // ---- Edge response ----------------------------------------------
  color += uColdSilver * fresnel * 0.2 * uRimIntensity;
  color += uColdSilver * rim * 0.09 * uRimIntensity;

  if (isClass(CLASS_LATENT)) {
    // Concentrated, and carrying what the journey deposited: the same
    // fissure network, resolved to violet in proportion to how much
    // consequence has been retained.
    vec3 retainedColor = mix(uCyan, uViolet, smoothstep(0.1, 0.7, uRetained));
    float seam = fissure * (0.35 + 0.65 * charge / max(uReaction, 1e-3));
    color += retainedColor * seam * (0.5 + node * 1.4) * uEmissive * 0.85 * uRetained;
  }

  color *= mix(0.06, 1.0, uWake);

  // ---- Depth ------------------------------------------------------
  float dist = length(cameraPosition - vWorldPos);
  float fog = 1.0 - exp(-uFogDensity * dist);
  color = mix(color, uFogColor, clamp(fog, 0.0, 0.94));

  outColor = vec4(max(color, vec3(0.0)), 1.0);
}
