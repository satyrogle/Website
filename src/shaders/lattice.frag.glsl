// ============================================================
//  Entity fragment stage — v8: the crowned convergence, inside and out
//
//  Palette = the founder's sheet LIGHT LANGUAGE (08): primary
//  cyan/teal, secondary magenta, accent amber, environment near
//  black. Cyan/teal is the standing colour of the filament cracks;
//  MAGENTA IS THE REACTION COLOUR — it only appears where the
//  system is answering something (field response, the yield surge,
//  deep-vision crossings). Amber belongs to the halo and to the
//  far crown's arrival ignition, nothing else. Reaction over
//  colour: hue always means state, never decoration.
//
//  The tunnel is THE INSIDE OF THE ENTITY (camera journey 05:
//  enter presence → confront). No abstract spoke mandala: the
//  corridor walls are the same dense filament-cracked obsidian as
//  the crown (MAT_PRIMARY, high response), the six-fold vision
//  blooms along the WHOLE run and crescendos toward the deep end,
//  and every inward face catches faint light from the far core.
//  The filament pattern streams perpetually deeper even at idle —
//  the inevitable pull, stated continuously — and scroll
//  accelerates it.
// ============================================================

precision highp float;

uniform vec3 cameraPosition;

uniform sampler2D uField;
uniform float uTime;
uniform float uFlow;
uniform float uFarZ;

uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform float uKeyIntensity;

uniform vec3 uRimDir;
uniform vec3 uRimColor;
uniform float uRimIntensity;

uniform vec3 uFillColor;
uniform float uFillIntensity;

uniform vec3 uColdWhite;
uniform vec3 uCyan;
uniform vec3 uAmber;

uniform float uEmissive;
uniform float uAmberMix;
uniform float uWake;
uniform float uPsy;
uniform float uRip;
uniform float uTear;
uniform float uArrive;
uniform float uFogDensity;
uniform vec3 uFogColor;

in vec3 vWorldPos;
in vec3 vLocalPos;
in vec3 vNormal;
in vec3 vViewDir;
in vec2 vFieldUv;
in float vField;
in float vFocus;
in float vSeed;
in float vKind;
in float vShell;
in float vGate;

layout(location = 0) out vec4 outColor;

// --- LIGHT LANGUAGE (founder sheet, section 08) -----------------------
// PRIMARY cyan / teal, SECONDARY magenta, ACCENT amber.
const vec3 PAL_TEAL = vec3(0.21, 0.88, 0.69);    // #36e0b0
const vec3 PAL_CYAN = vec3(0.30, 0.82, 1.0);     // #4dd0ff
const vec3 PAL_MAGENTA = vec3(0.88, 0.29, 1.0);  // #e14bff
const vec3 PAL_AMBER = vec3(1.0, 0.72, 0.35);    // arrival / halo only

/**
 * The standing ramp: teal → cyan with a narrow magenta window. Most of
 * the ramp is primary; magenta stays rare so that when it appears it
 * reads as the system reacting, not as a third decoration colour.
 */
vec3 signal(float t) {
  t = fract(t);
  vec3 c = mix(PAL_TEAL, PAL_CYAN, smoothstep(0.0, 0.38, t));
  float mag = smoothstep(0.52, 0.66, t) * (1.0 - smoothstep(0.72, 0.88, t));
  c = mix(c, PAL_MAGENTA, mag * 0.85);
  return mix(c, PAL_TEAL, smoothstep(0.86, 1.0, t));
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float fnoise(vec2 p) {
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
    v += a * fnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

/** Ridged filament mask — MAT_PRIMARY's branching cracks. */
float filaments(vec2 q, float seed, out float fine) {
  float ridge = 1.0 - abs(fbm(q * 1.0 + seed * 7.0) * 2.0 - 1.0);
  fine = 1.0 - abs(fbm(q * 2.3 - seed * 3.0) * 2.0 - 1.0);
  // Threshold high: CRACKS, not mottle — the ridges must stay thin
  // branching lines or the surface reads as camouflage marble.
  return smoothstep(0.76, 0.95, ridge) * (0.4 + 0.6 * smoothstep(0.55, 0.88, fine));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  if (!gl_FrontFacing) N = -N;

  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - NdotV, 3.0);

  float b = vField;
  float isRing = step(0.5, vKind) * (1.0 - step(1.5, vKind));
  float isFar = step(50.0, vGate);

  vec3 graphite = vec3(0.055, 0.065, 0.082);
  vec3 ice = uColdWhite;

  vec3 color;

  if (isRing < 0.5 && vKind > 2.5 && vShell > 0.5) {
    // ---- KERNEL: the burning eye -----------------------------------
    // Pure emissive, on an uneven heartbeat — alive, not oscillating.
    // Near kernel surges as the crown yields; far kernel ignites amber
    // at the arrival. Bright enough to feed the bloom pass: this is
    // MAT_CORE, the light source of the whole composition.
    float pulse = 0.5 + 0.5 * sin(uTime * 0.9 + sin(uTime * 0.37) * 1.3);
    // Arrival ignition kept below the tonemapper's white knee: past
    // ~2.7 total the ACES shoulder crushes the amber to white and the
    // coronation reads as a camera flash instead of gold.
    float amp = mix(1.25 + uTear * 1.6, 0.7 + uArrive * 1.9, isFar);
    vec3 kcol = uCyan * (1.15 + pulse * 0.85) + ice * 0.3;
    kcol = mix(kcol, PAL_AMBER * 1.7, isFar * uArrive * 0.7);
    // Centre-weighted so it reads as a sphere of light, not a disc.
    color = kcol * amp * (0.3 + 0.7 * NdotV);
  } else if (isRing < 0.5) {
    // ---- CROWN / GYRE / PUPIL: obsidian in the core's light --------
    float hemi = N.y * 0.5 + 0.5;
    vec3 ambient = mix(uFillColor, ice * 0.4, hemi) * uFillIntensity;

    vec3 L = normalize(uKeyDir);
    float NdotL = clamp(dot(N, L), 0.0, 1.0);

    color = graphite * (ambient * 2.0 + uKeyColor * NdotL * uKeyIntensity * 1.4);

    // Edge light carves the shards out of the void — kept lean so the
    // slabs read as dense matte stone, not glass. The rim answers the
    // yield: the whole mass energizes while the crown gives way.
    float tearSurge = uTear * (1.0 - uTear) * 1.9;
    vec3 RL = normalize(uRimDir);
    float rimShape = 0.5 + 0.5 * pow(clamp(dot(N, RL), 0.0, 1.0), 1.5);
    color += ice * uRimIntensity * fresnel * rimShape * 0.6 * (1.0 + tearSurge * 0.9);
    // Glint, capped hard — grazing angles must never flash the frame.
    color += ice * pow(fresnel, 5.0) * 0.2;

    // Material identity (sheet 03). MAT_PRIMARY on the seven majors:
    // dense branching filament cracks, high response. MAT_STRUCTURE on
    // the infill shards (vShell 1) and the gyres (vKind 2): darker
    // base, muted veins, low response — the quiet support layer that
    // makes the primary plates read as the face of the being.
    float isSupport = clamp(vShell * (1.0 - step(2.5, vKind)) + step(1.5, vKind), 0.0, 1.0);
    float matGain = mix(1.0, 0.4, isSupport);
    color *= mix(1.0, 0.78, isSupport);

    float fine;
    float veins = filaments(vLocalPos.xy * 4.8, vSeed, fine);
    float micro = 1.0 - abs(fbm(vLocalPos.xy * 16.0 + vSeed * 11.0) * 2.0 - 1.0);
    veins += smoothstep(0.86, 0.98, micro) * 0.35; // hairline crack layer

    vec3 throat = vec3(0.0, 0.0, mix(-1.6, uFarZ + 1.6, isFar));
    float throatDist = length(throat - vWorldPos);
    float pullWave = 0.78 + 0.22 * sin(throatDist * 2.3 + uTime * 1.1);

    // Iridescence: the vein hue slides with viewing angle — oil on
    // black, the sheet's reactive surface — and magenta is still the
    // REACTION, rising with field response and the tear surge.
    vec3 veinHue = signal(vSeed * 0.9 + vLocalPos.y * 0.03 + fresnel * 0.45);
    veinHue = mix(veinHue, PAL_MAGENTA, clamp(b * 0.6 + tearSurge * 0.9, 0.0, 1.0) * 0.55);
    color += veinHue * veins * (0.3 + b * 0.5 + tearSurge * 1.4) * 0.62 * pullWave * matGain;

    // ---- The convergence light -------------------------------------
    // Cyan radiance from the throat point of this piece's own gate.
    // Faces turned into the socket catch it; faces turned away stay
    // obsidian. Distance falloff keeps it a recess glow, not a wash.
    vec3 Ld = normalize(throat - vWorldPos);
    float inward = clamp(dot(N, Ld), 0.0, 1.0);
    float reach = exp(-throatDist * 0.3);
    float glow = mix(
      0.42 + tearSurge * 1.15 + uTear * 0.32,
      0.42 + uArrive * 2.3,
      isFar
    );
    vec3 seamCol = mix(uCyan, ice, 0.18);
    seamCol = mix(seamCol, PAL_AMBER, isFar * uArrive * 0.5);
    color += seamCol * inward * inward * reach * glow * 2.4 * uEmissive;
    // SEAM (sheet 02): with the armour seated coherently, the gaps
    // between plates are thin and regular — edge-on surfaces that face
    // the throat catch a hard extra line of light, so the crown reads
    // as sealed plates over a burning interior.
    color += seamCol * fresnel * inward * reach * glow * 1.6;

    // Luminance floor: the entity is never invisible — and it lifts
    // with the yield so the crown stays present through the crossing.
    color += ice * (0.05 + tearSurge * 0.1);
    color += ice * smoothstep(0.3, 0.6, b) * 0.07;
  } else {
    // ---- TUNNEL: the inside of the entity --------------------------
    // Camera journey 05, frames four and five: past the crown you are
    // within the lattice. The walls are MAT_PRIMARY — the same dense
    // filament-cracked obsidian as the outside — streaming endlessly
    // toward the far core. No spoke mandala, no instrument: material.
    float phi = atan(vLocalPos.y, vLocalPos.x);
    float rr = length(vLocalPos.xy);
    // Streaming coordinate: +time draws the pattern DEEPER (toward
    // -z) even when the visitor stands still; scroll accelerates it.
    // The pull does not wait for you. The radial term makes the
    // iso-surfaces CONES, not planes, so the drift visibly flows
    // inward-and-deeper everywhere.
    float w = (vLocalPos.z - rr * 0.55) * 0.9 + uFlow * 1.35 + uTime * 0.14;

    vec3 base = graphite * 0.7;

    // ORGANIC, not architectural: the crack domain is warped by two
    // slow fbm fields before it is ridged, so no straight line and no
    // repeating structure survives — flowing branched veins, the
    // ferrofluid interior of the reference sheet. The warp drifts on
    // its own clock: the flesh moves even when the visitor does not.
    vec2 q = vec2(phi * 3.4, w * 1.15);
    vec2 warp = vec2(
      fbm(q * 0.85 + uTime * 0.045),
      fbm(q * 0.85 + vec2(7.7, 3.1) - uTime * 0.038)
    );
    q += (warp - 0.5) * 2.4;
    float fine;
    float fil = filaments(q * 1.9, vSeed, fine);
    float micro = 1.0 - abs(fbm(q * 6.5 + vSeed * 5.0) * 2.0 - 1.0);
    fil += smoothstep(0.86, 0.98, micro) * 0.3;

    // Near-uniform gain across faces and walls: the warp killed the
    // grazing streaks, and an even skin is what melts the ring
    // architecture into one continuous gullet.
    float facing = abs(N.z);
    float density = mix(0.55, 0.8, facing) * (0.75 + 0.55 * smoothstep(0.15, 0.5, b));

    // Iridescent hue: slides with the stream AND with viewing angle —
    // oil-slick over black flesh. Magenta arrives as the veins cross
    // the field's hot zones — reaction, not wallpaper. The whole skin
    // is gated by uPsy: DORMANT ZERO, so nothing of the corridor
    // shows behind the sealed crown at the hero (the lit backdrop
    // read as a tinted glass canvas). The interior lights only as the
    // crown tears.
    vec3 filHue = signal(phi * 0.2 + w * 0.045 + vSeed * 0.4 + fresnel * 0.5);
    filHue = mix(filHue, PAL_MAGENTA, smoothstep(0.45, 0.75, b) * 0.4);
    color = base * mix(0.4, 1.0, uPsy)
      + filHue * fil * density * (uPsy * 0.85) * uEmissive;

    // --- The vision, THROUGHOUT -------------------------------------
    // The six-fold kaleidoscopic fold runs the whole corridor now and
    // crescendos toward the deep end — the closer to the core, the
    // harder the lattice dreams. (Was gated to z < -8; founder: "it
    // needs to be throughout".)
    float deep = (0.42 + 0.58 * smoothstep(4.0, 13.0, -vLocalPos.z)) * uPsy;
    if (deep > 0.001) {
      float sector = 6.2831 / 6.0;
      float ka = abs(mod(phi + sector * 0.5, sector) - sector * 0.5);
      vec2 kq = vec2(ka * 3.2, w * 0.32);
      vec2 kc = vec2(0.8 + sin(uTime * 0.04) * 0.05, 0.5 + cos(uTime * 0.033) * 0.05);
      float orbit = 1e3;
      float acc = 0.0;
      for (int i = 0; i < 4; i++) {
        kq = abs(kq) / max(dot(kq, kq), 1e-4) - kc;
        float lq = length(kq);
        orbit = min(orbit, lq);
        acc += exp(-6.0 * abs(lq - 0.5));
      }
      float kfil = exp(-8.0 * orbit);
      float kweb = clamp(acc * 0.22, 0.0, 1.0);
      float dmt = (kfil * 1.5 + kweb * 0.55) * deep;
      color += signal(ka * 1.4 + w * 0.07 + uTime * 0.03) * dmt * density * 1.25;
    }

    // --- The pull, made light ---------------------------------------
    // The far core faintly lights every face that looks toward it, and
    // the light grows with real proximity (and erupts at arrival). A
    // single distant source the whole corridor leans toward: you are
    // not travelling a tube, you are being taken somewhere.
    vec3 farThroat = vec3(0.0, 0.0, uFarZ + 1.6);
    vec3 Lp = normalize(farThroat - vWorldPos);
    float pullFace = clamp(dot(N, Lp), 0.0, 1.0);
    float pullReach = exp(-length(farThroat - vWorldPos) * 0.055);
    color += mix(uCyan, ice, 0.15) * pullFace * pullFace * pullReach
      * (0.4 + uArrive * 1.6) * uPsy;

    // Soft cyan sheen on silhouette edges only — no structural rim
    // lines: crisp aperture edges re-drew the octagon architecture
    // the undulation exists to dissolve.
    color += uCyan * fresnel * uPsy * 0.05;

    color *= mix(0.34, 1.0, vFocus);
  }

  color = mix(color, color * 0.6 + uAmber * 0.4, uAmberMix * 0.3);

  float grain = fract(sin(dot(floor(vFieldUv * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) * 0.012;

  float depth = length(vWorldPos - cameraPosition);
  // Rings dissolve over a longer run-up than the crown pieces: the
  // camera passes straight through their planes, and a half-faded face
  // at arm's length otherwise fills the frame with giant blurred
  // shapes while the actual view — the corridor ahead — hides behind
  // it.
  color *= smoothstep(0.45, mix(2.2, 3.0, isRing), depth);

  color *= mix(0.30, 1.0, uWake);

  float fog = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
  color = mix(color, uFogColor, clamp(fog, 0.0, 0.92));

  outColor = vec4(color, 1.0);
}
