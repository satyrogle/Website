// ============================================================
//  Crowned Convergence — fragment stage
//
//  Material identity per directive section 6. The object stays
//  predominantly black; the reaction field earns brightness rather
//  than being painted everywhere.
//
//  The rule that keeps the palette honest:
//
//      cyan / teal  = the baseline active system
//      magenta      = ACTIVE RESPONSE or RETAINED CONSEQUENCE
//      amber        = the halo, and rare accumulated traces
//
//  So magenta is never decoration. It appears where the field is
//  actually reacting hard, or where a trace has been retained from
//  earlier in the journey, and nowhere else. That is also why the
//  pattern is gated by a threshold per material class instead of
//  multiplied across every face — MAT_STRUCTURE stays near-black by
//  construction, which is what creates depth between the classes.
// ============================================================

precision highp float;

uniform vec3 cameraPosition;

uniform sampler2D uField;
uniform float uTime;

// Locked palette (directive 6.2).
uniform vec3 uVoid;
uniform vec3 uStructure;
uniform vec3 uRaisedBlack;
uniform vec3 uTeal;
uniform vec3 uCyan;
uniform vec3 uColdWhite;
uniform vec3 uMagenta;
uniform vec3 uAmber;

// Material class, 0..6 in the order of MATERIAL_CLASSES.
uniform float uClass;
uniform float uReaction;

// Narrative and lighting state.
uniform float uProgress;
uniform float uEmissive;
uniform float uWake;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform vec3 uKeyDir;
uniform float uKeyIntensity;
uniform vec3 uRimDir;
uniform float uRimIntensity;
uniform float uFillIntensity;
// Retained consequence: rises across the journey, never falls.
uniform float uRetained;
uniform float uOpacity;

in vec3 vWorldPos;
in vec3 vObjectPos;
in vec3 vNormal;
in vec3 vViewDir;
in vec2 vFieldUv;
in float vField;

layout(location = 0) out vec4 outColor;

const float CLASS_CROWN_PRIMARY = 0.0;
const float CLASS_CROWN_SECONDARY = 1.0;
const float CLASS_STRUCTURE = 2.0;
const float CLASS_RING = 3.0;
const float CLASS_CORE = 4.0;
const float CLASS_LATENT = 5.0;
const float CLASS_HALO = 6.0;

bool isClass(float which) {
  return abs(uClass - which) < 0.5;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  if (!gl_FrontFacing) N = -N;

  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - NdotV, 3.0);
  float b = vField;

  // ---- Base: near-black, class-dependent -------------------------
  vec3 base = uStructure;
  float patternGain = 0.0;
  float rimGain = 1.0;

  if (isClass(CLASS_CROWN_PRIMARY)) {
    base = uRaisedBlack;
    patternGain = 1.0;
  } else if (isClass(CLASS_CROWN_SECONDARY)) {
    base = mix(uStructure, uRaisedBlack, 0.55);
    patternGain = 0.42;          // lower response, less coverage
    rimGain = 0.85;
  } else if (isClass(CLASS_STRUCTURE)) {
    base = uStructure;
    patternGain = 0.06;          // near-black, creates separation
    rimGain = 0.6;
  } else if (isClass(CLASS_RING)) {
    base = mix(uStructure, uCyan * 0.10, 0.5);
    patternGain = 0.55;
    rimGain = 0.9;
  } else if (isClass(CLASS_CORE)) {
    base = uRaisedBlack;
    patternGain = 0.8;
    rimGain = 1.1;
  } else if (isClass(CLASS_LATENT)) {
    base = mix(uVoid, uStructure, 0.6);
    patternGain = 0.30;          // quieter than the crown
    rimGain = 1.25;              // stronger rim definition than clay
  } else if (isClass(CLASS_HALO)) {
    // The halo is amber, minimal reaction, no pattern at all.
    float band = smoothstep(0.75, 0.15, abs(vFieldUv.y - 0.5) * 2.0);
    vec3 halo = uAmber * (0.55 + band * 0.85);
    halo += uColdWhite * pow(1.0 - NdotV, 2.0) * 0.10;
    halo *= uEmissive * mix(0.22, 1.0, uWake);
    float depth = length(vWorldPos - cameraPosition);
    halo *= smoothstep(0.3, 1.6, depth);
    float haloFog = 1.0 - exp(-uFogDensity * uFogDensity * 0.5 * depth * depth);
    halo = mix(halo, uFogColor, clamp(haloFog, 0.0, 0.8));
    outColor = vec4(halo, uOpacity);
    return;
  }

  // ---- Analytic lighting -----------------------------------------
  float hemi = N.y * 0.5 + 0.5;
  vec3 ambient = mix(uVoid, uStructure * 6.0, hemi) * uFillIntensity;
  float NdotL = clamp(dot(N, normalize(uKeyDir)), 0.0, 1.0);
  // The key is what gives the masses readable form. It stays low —
  // the object must read as near-black stone — but at 0.05 the crown
  // was genuinely invisible against the void rather than merely dark.
  vec3 color = base + ambient + uColdWhite * pow(NdotL, 1.4) * uKeyIntensity * 0.20;

  // Rim carves the mass out of the void. This is what does most of the
  // legibility work, since the body itself stays black.
  float rimShape = 0.5 + 0.5 * pow(clamp(dot(N, normalize(uRimDir)), 0.0, 1.0), 1.5);
  color += uColdWhite * uRimIntensity * fresnel * rimShape * 0.40 * rimGain;
  // A tight specular glint along edges, so facets separate from each
  // other rather than merging into one silhouette.
  color += uColdWhite * pow(fresnel, 6.0) * 0.22 * rimGain;

  // ---- Reaction ---------------------------------------------------
  // Thresholded, not multiplied: below the threshold the surface stays
  // black. That is the difference between a field that lives IN the
  // material and one that wallpapers it.
  float response = patternGain * uReaction;
  if (response > 0.001) {
    float trace = smoothstep(0.28, 0.62, b);
    float hot = smoothstep(0.54, 0.78, b);

    // Baseline system colour: cyan through teal.
    vec3 signalColor = mix(uCyan, uTeal, smoothstep(0.3, 0.7, b));

    // Magenta is response and consequence only. `hot` is the field
    // actively reacting here; uRetained is what the journey has
    // accumulated. Neither is a decorative gradient.
    float consequence = clamp(hot + uRetained * 0.55, 0.0, 1.0);
    signalColor = mix(signalColor, uMagenta, consequence * 0.7);

    color += signalColor * trace * response * uEmissive * 0.5;

    // The core reads cold and recessed rather than coloured.
    if (isClass(CLASS_CORE)) {
      color += uColdWhite * hot * 0.35;
    }
    // Rare amber accumulation, only where consequence has really built.
    color += uAmber * smoothstep(0.82, 1.0, consequence) * 0.12 * response;
  }

  // Luminance floor: the entity is never entirely invisible.
  color += uColdWhite * 0.022;

  // ---- Atmosphere -------------------------------------------------
  float depth = length(vWorldPos - cameraPosition);
  // Near-fade: the camera passes through this geometry, and a
  // half-metre-away face filling the frame is not a reveal.
  color *= smoothstep(0.22, 1.5, depth);
  color *= mix(0.30, 1.0, uWake);

  float fog = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
  color = mix(color, uFogColor, clamp(fog, 0.0, 0.92));

  outColor = vec4(color, uOpacity);
}
