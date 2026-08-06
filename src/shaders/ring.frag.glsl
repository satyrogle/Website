precision highp float;

uniform vec3 uColorCore;
uniform vec3 uColorEdge;
uniform vec3 uAmber;
uniform float uAmberMix;
uniform float uIntensity;
uniform float uWake;
uniform float uTime;
uniform float uSegments;
uniform float uFlow;    // scroll progress: the halo's charge rides it
uniform float uRip;     // flares while the crown yields
uniform float uArrive;  // solid and bright at arrival
uniform float uGateway; // 0 = crown overhead, 1 = threshold at the rail

in vec2 vUv;
in float vField;
in vec3 vViewDir;
in vec3 vNormal;

layout(location = 0) out vec4 outColor;

void main() {
  // vUv.x runs around the ring, vUv.y around the tube cross-section.
  float around = vUv.x;

  // ONE unbroken line. The dashed machined version read as cheap;
  // MAT_HALO is a continuous band of gold in stable orbit. All motion
  // on it is light, never structure.
  //
  // Emissive face: the inward half of the tube carries the light. As
  // the halo becomes the threshold the lit band widens around the
  // tube, so the ring burns from every angle while the camera crosses.
  float face = smoothstep(0.7 + uGateway * 0.25, 0.1, abs(vUv.y - 0.5) * 2.0);

  // A slow charge travelling around the circumference — persistence,
  // not decoration: the same signal the entity's veins carry. A second
  // slower counter-charge keeps the band from reading as a loading
  // spinner.
  float travelA = fract(around - uTime * 0.02 - uFlow * 0.35);
  float travelB = fract(-around * 0.5 - uTime * 0.011);
  float pulse = smoothstep(0.0, 0.2, travelA) * smoothstep(0.5, 0.2, travelA) * 0.6
              + smoothstep(0.0, 0.3, travelB) * smoothstep(0.62, 0.3, travelB) * 0.3;

  float NdotV = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
  float fres = pow(1.0 - NdotV, 2.0);

  float energy = face * (0.8 + pulse * 0.45) + 0.06;
  // The halo answers the narrative: it surges while the crown yields,
  // burns hardest as the camera passes through it, and holds steady at
  // the far threshold.
  energy *= 1.0 + uRip * (1.0 - uRip) * 1.8 + uGateway * 1.5;
  energy *= 0.7 + vField * 0.45;
  energy += fres * 0.3;

  vec3 color = mix(uColorEdge, uColorCore, clamp(energy * 1.1, 0.0, 1.0));
  color = mix(color, uAmber, uAmberMix * 0.7);

  color *= energy * uIntensity * mix(0.18, 1.0, uWake);
  color *= 1.0 + uArrive * 1.1;

  // MINIMAL REACTION at rest: held under the bloom threshold so the
  // band is a clean gold line with zero glare. It is allowed to burn
  // only at its two events — the gateway crossing and the arrival.
  color *= mix(0.55, 1.0, max(uGateway, uArrive));

  outColor = vec4(color, 1.0);
}
