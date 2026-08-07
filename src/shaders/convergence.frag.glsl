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
// Per-part crack seed, so no two masses show the same fracture.
uniform float uSeed;
// 1 / entity width. Crack frequency is expressed in ENTITY WIDTHS, not
// world units, so swapping in a mesh authored at a different scale does
// not silently turn fractured stone into camouflage.
uniform float uCrackScale;

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
// Corridor interior intensity. Zero outside the tunnel so nothing of
// the interior shows behind the sealed crown at the hero; rises to full
// through the descent. This was keyframed across the whole journey in
// Lighting.ts and read by NOTHING — the entity state never carried it —
// so the corridor rendered as bare lit plates with no stream, no fold
// and no hue drift.
uniform float uPsy;
/**
 * DIVINITY, 1 at the hero and decaying to nothing by the corridor.
 *
 * The site's whole proposition is that you are meant to be fooled: the
 * entity presents as salvation from outside, and the truth is only
 * found by descending into it. This is that presentation. While it is
 * high the body lifts out of near-black, the veins run gold and cold
 * white instead of cyan, and the fresnel reads as radiance rather than
 * as a rim carving something dangerous out of the dark.
 *
 * It was keyframed as `amber` from the first build and never published
 * to the entity, so the lie was never told and there was nothing to
 * uncover — which is why descending felt like travel rather than
 * revelation.
 */
uniform float uDivinity;
/** Halo brightness from the arc. Also never published until now. */
uniform float uRingGain;
/**
 * Channel edge hardness, 0.5 at the hero rising to 0.7 at the evidence
 * boundary. Keyframed on all nine arc entries, damped every frame, and
 * declared in setLighting's own parameter type — and then dropped,
 * because no uniform existed to receive it. Soft glowing veins early,
 * etched documentary channels late.
 */
uniform float uSharp;
// World Z of the convergence light, so the corridor can lean toward it.
uniform float uCoreZ;

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

// ---------------------------------------------------------------------
//  The crack layer.
//
//  The reaction field is a 256px simulation stretched across the whole
//  entity and — until this — it was sampled once per VERTEX. The asset
//  is 5,400 triangles for the entire object, so a crown mass has a
//  handful of vertices and the "pattern" interpolated down to a smooth
//  three-point gradient across each face. That is why the masses read as
//  blank plastic no matter how far the reaction gain was pushed: there
//  was no detail present to amplify.
//
//  So the surface identity is generated per PIXEL here, in ridged noise,
//  exactly as the entity did before it moved to an authored mesh. The
//  field keeps its job — it decides WHERE the surface is reacting and
//  how hot — but it no longer has to carry detail it does not have the
//  resolution to carry.
// ---------------------------------------------------------------------

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

/**
 * Branching filament cracks. Thresholded high on purpose: these must
 * stay thin branching lines or the surface reads as camouflage marble
 * rather than fractured stone.
 */
/**
 * The palette ramp. Cyan and teal are the standing colours of the
 * system; magenta occupies a narrow band in the middle so it arrives as
 * a REACTION rather than as a third decoration colour.
 */
vec3 signal(float t) {
  t = fract(t);
  vec3 c = mix(uTeal, uCyan, smoothstep(0.0, 0.38, t));
  float mag = smoothstep(0.52, 0.66, t) * (1.0 - smoothstep(0.72, 0.88, t));
  c = mix(c, uMagenta, mag * 0.85);
  return mix(c, uTeal, smoothstep(0.86, 1.0, t));
}

float filaments(vec2 q, float seed) {
  float ridge = 1.0 - abs(fbm(q + seed * 7.0) * 2.0 - 1.0);
  float fine = 1.0 - abs(fbm(q * 2.3 - seed * 3.0) * 2.0 - 1.0);
  // Width driven by uSharp: a wide ramp reads as glow, a narrow one as
  // an etched channel.
  float w = mix(0.16, 0.05, clamp((uSharp - 0.45) / 0.3, 0.0, 1.0));
  return smoothstep(0.97 - w, 0.97, ridge) * (0.4 + 0.6 * smoothstep(0.55, 0.88, fine));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  if (!gl_FrontFacing) N = -N;

  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - NdotV, 3.0);
  // Per-pixel, not the vertex-interpolated vField. vField is still what
  // drives the vertex displacement, where per-vertex is all it can be.
  float b = texture(uField, vFieldUv).g;

  // ---- Base: near-black, class-dependent -------------------------
  vec3 base = uStructure;
  float patternGain = 0.0;
  float rimGain = 1.0;
  // How much direct key each class takes. Structural surfaces must
  // stay near-black or they out-brighten the subject standing in front
  // of them — which is exactly what the threshold chamber was doing to
  // the Latent Form.
  float keyGain = 1.0;

  if (isClass(CLASS_CROWN_PRIMARY)) {
    base = uRaisedBlack;
    patternGain = 1.0;
  } else if (isClass(CLASS_CROWN_SECONDARY)) {
    base = mix(uStructure, uRaisedBlack, 0.78);
    patternGain = 0.62;          // lower response, less coverage
    rimGain = 0.9;
    keyGain = 0.8;
  } else if (isClass(CLASS_STRUCTURE)) {
    base = uStructure;
    patternGain = 0.06;          // near-black, creates separation
    rimGain = 0.55;
    keyGain = 0.22;              // the chamber must recede, not glow
  } else if (isClass(CLASS_RING)) {
    base = mix(uStructure, uCyan * 0.08, 0.5);
    patternGain = 0.85;
    rimGain = 0.95;
    keyGain = 0.42;              // rings read by trace, never as metal
  } else if (isClass(CLASS_CORE)) {
    // The convergence light — the thing the whole journey aims at.
    //
    // The reference sheet asks for an intense cyan point with
    // volumetric scatter. It was rendered as near-black stone
    // (`base = uRaisedBlack`) with no emission at all, on a part staged
    // to appear only after 60% scroll. So the corridor converged on a
    // void and the finale arrived at one. This is a light source, not a
    // lit surface, so it returns before the shading model.
    float pulse = 0.5 + 0.5 * sin(uTime * 0.9 + sin(uTime * 0.37) * 1.3);
    // Hot at the centre, dissolving to nothing at the silhouette. This
    // is drawn with additive blending (see MAT_CORE in the loader), so
    // the edge fades into the void instead of cutting a hard circle
    // out of it. Shading it like a lit sphere — a directional gradient
    // and a crisp outline — made it read as a plastic marble at the
    // finale, where it is close enough for the silhouette to show.
    // A near-linear falloff still carried brightness right up to the
    // silhouette, so the sphere stayed legible as a sphere. Steeper
    // concentrates the heat at the centre and lets the body fade out
    // well before its own edge.
    // Steep. Down the finished corridor the core was subtending more
    // screen than the last ring's aperture and reading as a ball
    // plugging the shaft. The sheet shows an intense POINT: the hot
    // region has to stay far smaller than the sphere carrying it.
    float falloff = pow(NdotV, 4.0);
    // Kept lean: once the spokes and the scatter halo add on top, the
    // centre was summing past the knee and crushing to white — the
    // convergence has to stay CYAN, not read as a lens flare.
    vec3 core = (uCyan * (1.05 + pulse * 0.45) + uColdWhite * 0.18) * falloff;
    core *= uEmissive * mix(0.25, 1.0, uWake);
    // Scatter. A light at the far end of a fogged corridor gains a
    // halo rather than fading to fog colour, so distance ADDS glow
    // here instead of subtracting brightness.
    float depth = length(vWorldPos - cameraPosition);
    float scatter = 1.0 - exp(-uFogDensity * depth * 0.55);
    core += uCyan * pow(1.0 - NdotV, 2.0) * (0.5 + scatter * 1.4) * 0.6;

    // Spokes. Every core panel on the reference sheet radiates; a bare
    // sphere reads as a bead. The rays live in the OUTER glow volume,
    // not on the hot centre — the sphere is deliberately larger than
    // the light so there is transparent space for them to occupy, and
    // additive blending lets them sit in that space as rays rather
    // than as stripes painted on a ball.
    float rad = 1.0 - NdotV;               // 0 at centre, 1 at silhouette
    float ang = atan(vObjectPos.y, vObjectPos.x);
    float spoke = pow(abs(cos(ang * 5.0 + uTime * 0.10)), 8.0) * 0.60
                + pow(abs(cos(ang * 11.0 - uTime * 0.06)), 14.0) * 0.35;
    float shell = smoothstep(0.04, 0.34, rad) * (1.0 - smoothstep(0.55, 0.98, rad));
    core += mix(uCyan, uColdWhite, 0.25) * spoke * shell * (0.9 + scatter * 1.3);

    // THE EYE.
    //
    // The site's proposition closes here. What presented itself as
    // salvation from the outside is a thing that has been looking back
    // the whole descent, and at the end it is close enough to see that.
    // Up close the core resolves into an iris — dark pupil, radial
    // fibres, bright limbal ring. Every term is view-relative, so it
    // always faces the visitor however the camera arrives: it is not
    // aimed at them, it is looking at them.
    //
    // Gated on proximity so that from down the corridor it collapses
    // back to the point of light the reference sheets show. The reveal
    // has to be a reveal.
    float near = 1.0 - smoothstep(2.0, 8.5, depth);
    if (near > 0.001) {
      float pupil = smoothstep(0.05, 0.17, rad);
      float fibre = 0.62 + 0.38 * cos(ang * 46.0 + sin(ang * 7.0) * 1.4);
      float limbus = exp(-pow((rad - 0.60) / 0.085, 2.0));
      core = core * mix(1.0, pupil * fibre, near)
           + mix(uCyan, uColdWhite, 0.5) * limbus * near * 1.6;
    }
    // Held under the tonemapper's knee: past ~2.7 the ACES shoulder
    // crushes cyan to white and the convergence reads as a camera
    // flash instead of a light.
    outColor = vec4(min(core, vec3(2.1)), falloff);
    return;
  } else if (isClass(CLASS_LATENT)) {
    // The destination of a twelve-unit journey. It was sitting at
    // essentially pure void — base ~#010305, key at 0.55 — so at the
    // finale it rendered black-on-black and the whole scroll paid off
    // to a shape you could not see. It stays dark stone, but it is now
    // lit enough to read as a mass rather than as an absence.
    base = mix(uStructure, uRaisedBlack, 0.9);
    patternGain = 0.75;
    rimGain = 2.1;               // stronger rim definition than clay
    keyGain = 0.9;
  } else if (isClass(CLASS_HALO)) {
    // A filament, not a stroke. The band's thinness is done IN LIGHT —
    // a gaussian across the tube — so it antialiases itself at any
    // distance instead of resolving to a hard stair-stepped outline.
    //
    // This previously drove the profile from vFieldUv.y, which is a
    // CONSTANT for the halo: its projection mode is "none", so the
    // sampler returned a fixed 0.5 and the gaussian evaluated to the
    // same value everywhere. The ring rendered at uniform brightness,
    // which is precisely what a paint tool produces — the exact defect
    // this profile exists to prevent.
    //
    // t = 0 along the band's visible centre line, 1 at its silhouette.
    float t = 1.0 - NdotV;
    float core = exp(-(t * t) / (0.30 * 0.30));
    float spread = exp(-(t * t) / 0.85) * 0.30;

    // A slow charge travelling the circumference — persistence, not
    // decoration. A slower counter-charge stops it reading as a
    // loading spinner.
    float around = vFieldUv.x;
    float travelA = fract(around - uTime * 0.02 - uProgress * 0.35);
    float travelB = fract(-around * 0.5 - uTime * 0.011);
    float pulse = smoothstep(0.0, 0.2, travelA) * smoothstep(0.5, 0.2, travelA) * 0.55
                + smoothstep(0.0, 0.3, travelB) * smoothstep(0.62, 0.3, travelB) * 0.28;

    float energy = core * (0.85 + pulse * 0.4) + spread;
    vec3 halo = mix(uAmber * 0.42, uAmber, clamp(energy * 1.1, 0.0, 1.0));
    halo += uColdWhite * core * 0.16;
    halo *= energy * uEmissive * uRingGain * mix(0.20, 1.0, uWake);
    // Gold and brightest while the entity is still presenting itself as
    // salvation — the halo is the single loudest part of that claim.
    halo *= 1.0 + uDivinity * 0.75;

    // The atmosphere, which it was previously rendered without — this
    // is what seats it in the world instead of on the glass. The far
    // arc is further away, so it fogs harder and the band reads as an
    // ellipse in 3D rather than an outline drawn over the scene.
    float depth = length(vWorldPos - cameraPosition);
    halo *= smoothstep(0.3, 1.6, depth);
    float haloFog = 1.0 - exp(-uFogDensity * uFogDensity * 0.55 * depth * depth);
    halo = mix(halo, uFogColor, clamp(haloFog, 0.0, 0.85));
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
  vec3 color = base + ambient * mix(0.35, 1.0, keyGain)
             + uColdWhite * pow(NdotL, 1.4) * uKeyIntensity * 0.20 * keyGain;

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
    // Widened from 0.28..0.62. With the sampling fixed there is real
    // variation across a face to threshold against, and the narrow band
    // was leaving most of the surface below the floor.
    float trace = smoothstep(0.18, 0.55, b);
    float hot = smoothstep(0.54, 0.78, b);

    // Pixel-resolution fracture, in the part's own space so it stays
    // locked to the surface when the mass yields and turns.
    // Roughly 18 vein features across the entity, whatever the entity
    // happens to measure. Fixed world-unit frequencies read as wide
    // blobs on a small mesh and as dense camouflage on a large one —
    // both of which this build has now shipped at least once.
    vec2 crackUv = vObjectPos.xy * uCrackScale;
    float veins = filaments(crackUv * 18.0, uSeed);
    float micro = 1.0 - abs(fbm(crackUv * 46.0 + uSeed * 11.0) * 2.0 - 1.0);
    // Hairline layer, kept light: at full strength it fills the gaps
    // between the veins and the face reads as speckled granite.
    veins += smoothstep(0.88, 0.99, micro) * 0.16;
    // Charges running the veins. The entity is alive whether or not the
    // visitor is scrolling — this is the thing whose absence made the
    // whole build read as a still render.
    float charge = 0.5 + 0.5 * sin(
      (vObjectPos.y + vObjectPos.x * 0.35) * uCrackScale * 26.0
      - uTime * 1.25 + uSeed * 6.28
    );
    veins *= 0.5 + 0.85 * charge;

    // Baseline system colour: cyan through teal. The hue slides with
    // viewing angle — oil on black — so a mass is never a flat swatch.
    vec3 signalColor = mix(uCyan, uTeal, smoothstep(0.3, 0.7, b + fresnel * 0.35));

    // Magenta is response and consequence only. `hot` is the field
    // actively reacting here; uRetained is what the journey has
    // accumulated. Neither is a decorative gradient.
    float consequence = clamp(hot + uRetained * 0.55, 0.0, 1.0);
    signalColor = mix(signalColor, uMagenta, consequence * 0.7);
    // While divine, the veins are gold and cold white — the reaction
    // colours are what the truth looks like, and they arrive as the
    // presentation decays.
    signalColor = mix(signalColor, mix(uAmber, uColdWhite, 0.5), uDivinity * 0.78);

    // The cracks carry the colour; the field decides how hot they burn.
    // The mass stays obsidian — the veins light it, they do not coat it.
    color += signalColor * veins * (0.34 + b * 0.62) * response * uEmissive * 0.55;
    // A much fainter wide wash, so the mass is not only cracks.
    color += signalColor * trace * response * uEmissive * 0.10;

    // Rare amber accumulation, only where consequence has really built.
    color += uAmber * smoothstep(0.82, 1.0, consequence) * 0.12 * response;
  }

  // ---- Radiance ----------------------------------------------------
  // Salvation reads as light coming OFF a whole body, not as an edge cut
  // out of blackness. Applied to the shell classes only: the corridor
  // has its own treatment and must never look holy.
  if (uDivinity > 0.001
      && (isClass(CLASS_CROWN_PRIMARY) || isClass(CLASS_CROWN_SECONDARY)
          || isClass(CLASS_LATENT))) {
    // Additive, and weighted by what is ALREADY lit. Multiplying the
    // whole surface lifted the cavity out of the dark along with
    // everything else and the entity read as a white blob — salvation
    // has to be light coming off a form, not the form washing out.
    // Gold-weighted too: an even mix with the cold white came out
    // silver, which reads as ice rather than as anything holy.
    vec3 divine = mix(uAmber * 1.75, uColdWhite, 0.22);
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    // Weighted hard toward the EDGES. An even lift across the body came
    // out as sandstone: warm, but flat and lifeless. Salvation reads as
    // brilliant light over a dark mass, so the body stays dark and the
    // silhouette burns — which is also what feeds the bloom pass.
    color += divine * uDivinity * (fresnel * 2.4 * rimGain + lum * 0.42);
    color += divine * pow(fresnel, 6.0) * uDivinity * 2.6;
  }

  // ---- The corridor interior ---------------------------------------
  // Ported from lattice.frag.glsl, which is where all of this has been
  // sitting, written and debugged, since the entity moved to an
  // authored mesh. The convergence shader was built to light surfaces
  // and never received the corridor treatment, so the tunnel rendered
  // as bare plates: no stream, no fold, no hue drift, nothing moving
  // unless the visitor moved it.
  if (uPsy > 0.001 && (isClass(CLASS_RING) || isClass(CLASS_STRUCTURE))) {
    float phi = atan(vWorldPos.y, vWorldPos.x);
    float rr = length(vWorldPos.xy);

    // The streaming coordinate. +time draws the pattern DEEPER even
    // when the visitor stands still — the pull does not wait for you —
    // and the radial term makes the iso-surfaces CONES rather than
    // planes, so the drift flows inward-and-deeper everywhere instead
    // of sliding past. This is what makes the corridor read as transit.
    float w = (vWorldPos.z - rr * 0.55) * 0.9 + uProgress * 1.35 + uTime * 0.14;

    // Organic, not architectural: the crack domain is warped by two
    // slow fbm fields before it is ridged, so no straight line and no
    // repeating structure survives. The warp runs on its own clock —
    // the flesh moves even when the visitor does not.
    vec2 q = vec2(phi * 3.4, w * 1.15);
    vec2 warp = vec2(
      fbm(q * 0.85 + uTime * 0.045),
      fbm(q * 0.85 + vec2(7.7, 3.1) - uTime * 0.038)
    );
    q += (warp - 0.5) * 2.4;
    float fil = filaments(q * 1.9, uSeed);
    float hair = 1.0 - abs(fbm(q * 6.5 + uSeed * 5.0) * 2.0 - 1.0);
    fil += smoothstep(0.86, 0.98, hair) * 0.3;

    // Near-uniform gain across faces and walls: an even skin is what
    // melts the ring architecture into one continuous gullet.
    float facing = abs(N.z);
    float density = mix(0.55, 0.8, facing)
                  * (0.75 + 0.55 * smoothstep(0.15, 0.5, b));

    // Iridescence sliding with the stream AND the viewing angle — oil
    // over black flesh. This is the gradient shift.
    vec3 filHue = signal(phi * 0.2 + w * 0.045 + uSeed * 0.4 + fresnel * 0.5);
    filHue = mix(filHue, uMagenta, smoothstep(0.45, 0.75, b) * 0.4);
    color = color * mix(0.4, 1.0, uPsy)
          + filHue * fil * density * (uPsy * 0.42) * uEmissive;

    // The six-fold fold, running the whole corridor and crescendoing
    // toward the deep end: the closer to the core, the harder the
    // lattice dreams.
    float deep = (0.42 + 0.58 * smoothstep(2.0, 11.0, -vWorldPos.z)) * uPsy;
    if (deep > 0.001) {
      float sector = 6.2831 / 6.0;
      float ka = abs(mod(phi + sector * 0.5, sector) - sector * 0.5);
      vec2 kq = vec2(ka * 3.2, w * 0.32);
      vec2 kc = vec2(0.8 + sin(uTime * 0.04) * 0.05,
                     0.5 + cos(uTime * 0.033) * 0.05);
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
      float dmt = (kfil * 0.8 + kweb * 0.32) * deep;
      color += signal(ka * 1.4 + w * 0.07 + uTime * 0.03) * dmt * density * 0.6;
    }

    // The pull, made light. The core faintly lights every face that
    // leans toward it, growing with real proximity: you are not
    // travelling a tube, you are being taken somewhere.
    vec3 farThroat = vec3(0.0, 0.0, uCoreZ);
    vec3 Lp = normalize(farThroat - vWorldPos);
    float pullFace = clamp(dot(N, Lp), 0.0, 1.0);
    float pullReach = exp(-length(farThroat - vWorldPos) * 0.055);
    color += mix(uCyan, uColdWhite, 0.15)
           * pullFace * pullFace * pullReach * 0.4 * uPsy;

    // Soft cyan on silhouette edges only — crisp aperture lines redraw
    // the ring architecture that the warp exists to dissolve.
    color += uCyan * fresnel * uPsy * 0.05;

    // SOFT CEILING. The filaments, the fold and the pull light all add
    // into the same pixel. Unbounded, the interior ran past the
    // tonemapper's knee and the corridor flared to full-frame white-
    // cyan — bright enough to be painful to scroll through.
    color = color / (1.0 + color * 0.62);
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
