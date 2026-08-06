// ============================================================
//  MAT_HALO — the silent crown
//
//  Three things made this read as a drawn ellipse rather than a ring
//  of light standing in the scene, and all three are fixed here:
//
//   1. NO ATMOSPHERE. It was the only object rendered without fog or
//      depth falloff, so it never receded. Now it takes both, which
//      also gives it its depth cue for free: the far arc of the ring
//      is further from the camera than the near arc, so it fogs
//      harder and the band reads as an ellipse in 3D instead of an
//      outline drawn on the glass.
//   2. A HARD 1-PIXEL EDGE. The tube was hair-thin and the renderer
//      runs with antialiasing off, so it resolved to an aliased
//      stair-stepped stroke. The tube now has real thickness and the
//      THINNESS IS DONE IN LIGHT — a gaussian across the tube — so
//      the band antialiases itself at any distance.
//   3. UNIFORM BRIGHTNESS. A constant-intensity outline is what a
//      paint tool produces. The profile below has a bright core and
//      a wide soft falloff, like a filament.
// ============================================================

precision highp float;

uniform vec3 cameraPosition;

uniform vec3 uColorCore;
uniform vec3 uColorEdge;
uniform vec3 uAmber;
uniform float uAmberMix;
uniform float uIntensity;
uniform float uWake;
uniform float uTime;
uniform float uFlow;    // scroll progress: the halo's charge rides it
uniform float uRip;     // flares while the crown yields
uniform float uArrive;  // solid and bright at arrival
uniform float uGateway; // 0 = crown overhead, 1 = threshold at the rail
uniform float uFogDensity;
uniform vec3 uFogColor;

in vec2 vUv;
in float vField;
in vec3 vViewDir;
in vec3 vNormal;
in vec3 vWorldPos;

layout(location = 0) out vec4 outColor;

void main() {
  float around = vUv.x;

  // ---- Cross-tube profile: a filament, not a stroke ---------------
  // t = 0 at the tube's centre line, 1 at its silhouette edge.
  float t = abs(vUv.y - 0.5) * 2.0;
  float coreW = mix(0.26, 0.42, uGateway);
  float core = exp(-(t * t) / (coreW * coreW));
  float bloom = exp(-(t * t) / 0.85) * 0.3;

  // A slow charge travelling around the circumference — persistence,
  // not decoration. A second, slower counter-charge keeps the band
  // from reading as a loading spinner.
  float travelA = fract(around - uTime * 0.02 - uFlow * 0.35);
  float travelB = fract(-around * 0.5 - uTime * 0.011);
  float pulse = smoothstep(0.0, 0.2, travelA) * smoothstep(0.5, 0.2, travelA) * 0.55
              + smoothstep(0.0, 0.3, travelB) * smoothstep(0.62, 0.3, travelB) * 0.28;

  float energy = core * (0.85 + pulse * 0.4) + bloom;
  // The halo answers the narrative: it surges while the crown tears,
  // burns hardest as the camera passes through it, and holds steady
  // at the far threshold.
  energy *= 1.0 + uRip * (1.0 - uRip) * 1.6 + uGateway * 1.3;
  energy *= 0.78 + vField * 0.3;

  vec3 color = mix(uColorEdge, uColorCore, clamp(energy * 1.1, 0.0, 1.0));
  color = mix(color, uAmber, uAmberMix * 0.7);

  color *= energy * uIntensity * mix(0.18, 1.0, uWake);
  color *= 1.0 + uArrive * 1.1;

  // MINIMAL REACTION at rest: held under the bloom threshold so the
  // band is a clean gold line with zero glare. It is allowed to burn
  // only at its two events — the gateway crossing and the arrival.
  color *= mix(0.55, 1.0, max(uGateway, uArrive));

  // ---- The atmosphere, at last ------------------------------------
  float depth = length(vWorldPos - cameraPosition);
  // Near-fade, matching the lattice: the camera passes through this
  // ring at the gateway and a smeared band across the whole frame is
  // not a threshold, it is a wipe.
  color *= smoothstep(0.25, 1.4, depth);
  // Fog at a reduced density — enough to seat the ring in the same
  // air as the entity and shade its far arc, not so much that the
  // band dissolves at hero distance.
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * 0.55 * depth * depth);
  color = mix(color, uFogColor, clamp(fog, 0.0, 0.85));

  outColor = vec4(color, 1.0);
}
