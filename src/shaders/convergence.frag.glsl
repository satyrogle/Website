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

// Locked palette. Two OPPOSING systems: the entity is cold, the halo
// alone is warm. uAmber / uHaloWarm are HALO-ONLY and must never reach
// an entity surface — a warm shell kills both systems at once.
uniform vec3 uVoid;
uniform vec3 uStructure;
// Structural blacks, recess -> exposed. Face variation lerps these.
uniform vec3 uObsidian;
uniform vec3 uShell;
uniform vec3 uGraphite;
uniform vec3 uRaisedBlack;
uniform vec3 uRingBlack;
// Primary reactive field.
uniform vec3 uTeal;
uniform vec3 uCyan;
// Secondary reactive field, independently distributed.
uniform vec3 uIndigo;
uniform vec3 uViolet;
uniform vec3 uMagenta;
// Cold edge response.
uniform vec3 uColdSilver;
uniform vec3 uColdWhite;
// Convergence light.
uniform vec3 uCoreGlow;
uniform vec3 uCoreInner;
// HALO ONLY.
uniform vec3 uAmber;
uniform vec3 uHaloWarm;

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
/** Part-relative position in WORLD units — see the vertex stage. */
in vec3 vCrackPos;
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

/**
 * pow() with a base that can legitimately reach zero.
 *
 * THIS IS NOT COSMETIC. HLSL compiles pow(x, y) as exp2(y * log2(x)),
 * and log2(0) is -Inf — so on ANGLE/D3D11 pow(0.0, y) returns NaN where
 * SwiftShader returns 0. Every masked term in this shader has a base
 * that is exactly zero across most of the surface: activeCrack is 0 in
 * every cell interior, nodeEnergy is 0 everywhere but the junctions,
 * fresnel is 0 dead-on to a face.
 *
 * A single NaN pixel does not stay local. It is written into the scene
 * target, the bloom pass blurs that target at quarter resolution, and
 * NaN propagates through every tap of the blur — so one bad pixel takes
 * out a whole low-resolution block. That is exactly how this presented:
 * the entity rendered as a solid black silhouette with chunky
 * rectangular edges, on a machine where the shader compiled and linked
 * without a single error, while headless SwiftShader captures of the
 * same commit looked correct.
 *
 * The floor is far below anything visible — pow(1e-6, 1.25) is ~2e-8 —
 * so it changes no output except the undefined one.
 */
float safePow(float x, float k) {
  return pow(max(x, 1e-6), k);
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

/**
 * Per-FACE identity.
 *
 * uSeed is per-part, so with six crown masses it gives six variations —
 * every polygon within a mass still answered the light identically,
 * which is what made the shell read as one moulded object rather than as
 * cut crystal. Quantising the face normal buckets the surface by facing,
 * and on a flat/auto-smoothed mesh that is genuinely per-face: each
 * plate draws a different constant. A low-frequency positional term is
 * added on top so a large plate is not one flat swatch either.
 *
 * Returns 0..1, used to lerp the four structural blacks and to decide
 * which faces carry which reactive field.
 */
float facetKey(vec3 n, vec3 objPos, float seed) {
  vec3 bucket = floor(n * 6.0);
  float k = fract(
    sin(dot(bucket, vec3(12.9898, 78.233, 37.719)) + seed * 31.0) * 43758.5453
  );
  // The positional term is deliberately WEAK. At 0.55 it smeared the
  // per-face constant into a gradient and the planes stopped reading as
  // separate cut surfaces — the whole point of quantising the normal is
  // that each facet gets one value. It survives only to stop a large
  // plane being a perfectly flat swatch.
  return fract(k + fbm(objPos.xy * uCrackScale * 2.6 + seed * 17.0) * 0.22);
}

/**
 * CELLULAR CRACKLE — the entity's surface identity.
 *
 * Cell boundaries, not branching smears. `filaments()` is ridged fbm:
 * it produces soft blobby veins that read as staining or corrosion on
 * dark rock — "diseased iron" was the accurate description. The
 * reference is a crackle NETWORK: near-black polygonal cells divided by
 * thin bright lines, which is what makes the surface read as charged
 * crystal rather than as weathered metal.
 *
 * Worley cellular noise gives that directly. F1 is the distance to the
 * nearest feature point and F2 to the second nearest; where they are
 * equal you are exactly on a boundary between two cells, so F2 - F1
 * approaches zero along every edge of the diagram and nowhere else.
 * Thresholding it draws the network in one step, with no drawn lines
 * anywhere in the code.
 *
 * The domain is warped by fbm first, or the cells settle into a visibly
 * regular lattice — the giveaway that turns crystal back into wallpaper.
 */
vec2 cellEdge(vec2 q, float seed) {
  // Domain warp, low frequency and low amplitude. Noise WARPS the
  // lattice; it is never the crack itself. Push it further and the
  // network stops being structural and becomes the mottled noise the
  // reference explicitly rules out.
  vec2 warp = vec2(
    fbm(q * 0.55 + seed * 3.1),
    fbm(q * 0.55 + vec2(4.3, 1.7) - seed * 2.3)
  );
  q += (warp - 0.5) * 0.44;

  vec2 ip = floor(q);
  vec2 fp = fract(q);
  float f1 = 8.0;
  float f2 = 8.0;
  float f3 = 8.0;
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
  // x: distance to the nearest cell BORDER. Zero along an edge, rising
  //    into the cell interiors.
  // y: distance to the nearest VERTEX. Three cells meet at a junction,
  //    so all three feature distances converge there and F3 - F1 falls
  //    to zero; along a plain edge only the first two are equal and F3
  //    stays well clear. Two thresholds off one search, which is what
  //    lets energy pool at the junctions instead of running evenly along
  //    every fissure.
  return vec2(f2 - f1, f3 - f1);
}

/**
 * The energy ramp — the whole locked emissive palette in order.
 *
 *   teal -> cyan -> indigo -> violet -> magenta
 *
 * Energy travelling the lattice shifts along this, which is what gives
 * the network colour VARIETY rather than one hue with a brightness
 * gradient on it. Two earlier revisions ran teal->cyan only, with violet
 * bolted on as a binary region swap, and the entity came out monochrome.
 *
 * Deliberately weighted: the first 55% of the ramp is the teal/cyan
 * primary, so cyan/teal dominates and violet stays restrained exactly as
 * the brief asks. Indigo earns its place here as the TRANSITION between
 * the two families — passing through it is what stops a cyan-to-violet
 * blend averaging into a muddy blue, because indigo IS that region of
 * the spectrum, deliberately chosen rather than accidentally mixed.
 */
vec3 energyRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  // Stops spread EVENLY across the range, so the whole emissive palette
  // is present at once rather than cyan holding two-thirds of it. That
  // is the difference between a restrained material and a psychedelic
  // one, and it is a deliberate move away from the "cyan dominant,
  // violet restrained" balance the earlier revision was built to.
  vec3 c = mix(uTeal, uCyan, smoothstep(0.0, 0.27, t));
  c = mix(c, uIndigo, smoothstep(0.25, 0.49, t));
  c = mix(c, uViolet, smoothstep(0.47, 0.71, t));
  c = mix(c, uMagenta, smoothstep(0.69, 1.0, t));
  return c;
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
  float fresnel = safePow(1.0 - NdotV, 3.0);
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

  // Per-face identity, and how strongly this face answers the secondary
  // (violet) field rather than the primary (cyan) one. Faces are meant
  // to disagree: some almost pure black, some graphite with cyan cracks,
  // some carrying violet instead. Uniform response is what reads as a
  // moulded prop.
  float facet = facetKey(N, vCrackPos, uSeed);
  // Dark-biased so the majority of the shell stays near-black: the
  // target distribution is roughly two-thirds structural black, and a
  // linear ramp across the four blacks lands far too bright.
  // Dark-biased hard: the target is 90-95% near-black, and the previous
  // 1.7 exponent still carried most faces up into graphite and raised
  // mineral. Only the most exposed facets reach the top of the ramp now,
  // which is what "subtle roughness variation, facet normal detail"
  // means — variation you read as surface, not as tone.
  float exposure = safePow(facet, 2.1);

  if (isClass(CLASS_CROWN_PRIMARY)) {
    // Recess -> exposed across the four structural blacks. The bright end
    // is reached by a small minority of facets by construction.
    base = mix(uObsidian, uShell, smoothstep(0.0, 0.55, exposure));
    base = mix(base, uGraphite, smoothstep(0.62, 0.90, exposure));
    base = mix(base, uRaisedBlack, smoothstep(0.90, 1.0, exposure));
    patternGain = 1.0;
  } else if (isClass(CLASS_CROWN_SECONDARY)) {
    base = mix(uObsidian, uShell, smoothstep(0.0, 0.70, exposure));
    base = mix(base, uGraphite, smoothstep(0.78, 1.0, exposure));
    patternGain = 0.62;          // lower response, less coverage
    rimGain = 0.9;
    keyGain = 0.8;
  } else if (isClass(CLASS_STRUCTURE)) {
    base = uStructure;
    patternGain = 0.06;          // near-black, creates separation
    rimGain = 0.55;
    keyGain = 0.22;              // the chamber must recede, not glow
  } else if (isClass(CLASS_RING)) {
    // Gyres and corridor rings sit DARKER than the shell, so they read
    // as cavity depth rather than as more entity, and so a gyre turning
    // through the cavity disappears into the dark and returns.
    base = mix(uRingBlack, uObsidian, exposure * 0.6);
    // Full response. The corridor rings are most of what the visitor
    // sees down the throat at the hero, and at 0.85 they carried a
    // weaker lattice than the plates in front of them — so the entity's
    // material identity stopped at its own front face.
    patternGain = 1.0;
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
    float falloff = safePow(NdotV, 4.0);
    // Kept lean: once the spokes and the scatter halo add on top, the
    // centre was summing past the knee and crushing to white — the
    // convergence has to stay CYAN, not read as a lens flare.
    // Cyan outer -> cyan-white inner -> white-hot centre. Never warm:
    // a gold core would put a second warm source in frame and collapse
    // the halo's separation from the entity.
    vec3 core = (uCoreGlow * (0.85 + pulse * 0.40)
               + uCoreInner * (0.45 + pulse * 0.20) * safePow(NdotV, 2.0)
               + uColdWhite * 0.20 * safePow(NdotV, 6.0)) * falloff;
    core *= uEmissive * mix(0.25, 1.0, uWake);
    // Scatter. A light at the far end of a fogged corridor gains a
    // halo rather than fading to fog colour, so distance ADDS glow
    // here instead of subtracting brightness.
    float depth = length(vWorldPos - cameraPosition);
    float scatter = 1.0 - exp(-uFogDensity * depth * 0.55);
    core += uCoreGlow * safePow(1.0 - NdotV, 2.0) * (0.5 + scatter * 1.4) * 0.6;

    // Spokes. Every core panel on the reference sheet radiates; a bare
    // sphere reads as a bead. The rays live in the OUTER glow volume,
    // not on the hot centre — the sphere is deliberately larger than
    // the light so there is transparent space for them to occupy, and
    // additive blending lets them sit in that space as rays rather
    // than as stripes painted on a ball.
    float rad = 1.0 - NdotV;               // 0 at centre, 1 at silhouette
    float ang = atan(vObjectPos.y, vObjectPos.x);
    float spoke = safePow(abs(cos(ang * 5.0 + uTime * 0.10)), 8.0) * 0.60
                + safePow(abs(cos(ang * 11.0 - uTime * 0.06)), 14.0) * 0.35;
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
    // Same material family as the Crowned — unmistakably the same
    // species — but quieter: more black surface, thinner veins, less
    // secondary reaction. The difference is temperament, not material.
    base = mix(uObsidian, uShell, smoothstep(0.0, 0.60, exposure));
    base = mix(base, uGraphite, smoothstep(0.68, 1.0, exposure) * 0.7);
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
    // A HOT centre inside a WIDE soft glow, rather than one even band.
    //
    // The old profile put a 0.30-sigma core against a 0.30-weight spread
    // — near enough the same brightness across the whole tube, which is
    // what made it read as a drawn outline. A light source is bright in
    // the middle and falls off gradually; the falloff is most of what
    // reads as luminous, and it is what gives the bloom pass something
    // wide to work with instead of a hairline.
    float core = exp(-(t * t) / (0.22 * 0.22));
    float spread = exp(-(t * t) / 1.35) * 0.62;

    // A slow charge travelling the circumference — persistence, not
    // decoration. A slower counter-charge stops it reading as a
    // loading spinner.
    float around = vFieldUv.x;
    float travelA = fract(around - uTime * 0.02 - uProgress * 0.35);
    float travelB = fract(-around * 0.5 - uTime * 0.011);
    float pulse = smoothstep(0.0, 0.2, travelA) * smoothstep(0.5, 0.2, travelA) * 0.55
                + smoothstep(0.0, 0.3, travelB) * smoothstep(0.62, 0.3, travelB) * 0.28;

    float energy = core * (0.85 + pulse * 0.4) + spread;
    // The one warm object in frame. Deep gold at the band's edge rising
    // to a lighter gold along its centre line.
    vec3 halo = mix(uAmber * 0.42, uAmber, clamp(energy * 1.1, 0.0, 1.0));
    halo = mix(halo, uHaloWarm, core * 0.62);
    // White-hot along the centre line. A gold light this bright goes
    // pale at its heart — without it the ring stays the colour of paint
    // rather than the colour of something burning.
    halo += uColdWhite * safePow(core, 2.2) * 0.55;
    halo *= energy * uEmissive * uRingGain * mix(0.20, 1.0, uWake) * 1.55;
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
  // Each crystal plane answers the light differently.
  //
  // Facet variation drove ALBEDO only, which is why the shell read as
  // one moulded surface with tonal noise on it rather than as cut
  // planes. Real faceting shows up in the SPECULAR response — two
  // adjacent planes at the same angle still catch the key differently
  // because their finish differs. This is the cheap stand-in for the
  // roughness variation a PBR pipeline would carry, and it is what makes
  // an edge between two facets legible without a crack drawn on it.
  float facetLight = 0.45 + 1.15 * facet;

  // Light leaking THROUGH the fractures is accumulated separately from
  // light falling ON the surface, so the atmosphere can treat them
  // differently at the end of main. Lit stone loses to distance fast;
  // a light source seen through a gap does not.
  vec3 emissive = vec3(0.0);

  vec3 color = base + ambient * mix(0.35, 1.0, keyGain)
             + uColdWhite * safePow(NdotL, 1.4) * uKeyIntensity * 0.20
               * keyGain * facetLight;

  // Rim carves the mass out of the void. This is what does most of the
  // legibility work, since the body itself stays black.
  float rimShape = 0.5 + 0.5 * safePow(clamp(dot(N, normalize(uRimDir)), 0.0, 1.0), 1.5);
  color += uColdWhite * uRimIntensity * fresnel * rimShape * 0.40 * rimGain;
  // A tight specular glint along edges, so facets separate from each
  // other rather than merging into one silhouette.
  // Tight glint, also facet-dependent — polished planes flare at the
  // edge, matte ones stay dry. "Hard, dry obsidian" is the brief, so the
  // range runs from almost nothing to a crisp highlight, never to wet.
  color += uColdWhite * safePow(fresnel, 6.0) * 0.22 * rimGain
         * (0.35 + 1.30 * facet);

  // ---- The fracture network ---------------------------------------
  //
  // The surface is 90-95% near-black obsidian. Energy is NOT painted on
  // it: it is visible only THROUGH microscopic fractures in an otherwise
  // opaque material. The crack network is structural, built from Worley
  // cell borders — noise only ever warps that lattice, never stands in
  // for it. Most of the object stays dark; only the lattice leaks light.
  //
  // The previous revision drew the network everywhere and lit all of it,
  // which measured 24% coloured surface against a 4-8% target and read
  // as glowing veins rather than as stressed crystal. Two masks fix
  // that: a sparse REGION mask deciding where the network exists at all,
  // and a travelling ACTIVITY field deciding which fissures are live.
  // Most cracks are dormant and emit nothing.
  float response = patternGain * uReaction;
  if (response > 0.001) {
    // The NETWORK gets a compressed version of the authored response.
    //
    // dl_reaction tapers to 0.35 down the corridor and the deeper crown
    // tiers sit low too, so the lattice was already half strength before
    // the atmosphere touched it — and then fog took another 70%. The
    // surface shading still honours the authored value in full; only the
    // fracture light is floored, because the material identity has to
    // survive to the back of the entity.
    float netResponse = mix(0.55, 1.0, response);
    vec2 crackUv = vCrackPos.xy * uCrackScale;
    // Cell density. 15 gave five or six polygons per plate — the brief
    // asks for a capillary network, and at that scale each "crack" was a
    // band the width of a facet rather than a hairline in it.
    vec2 p = crackUv * 48.0;

    // TWO NETWORKS, not one.
    //
    // The reference has a coarse system of bright structural CHANNELS
    // running along the major facet boundaries, and a much finer, denser
    // CAPILLARY web covering the facet interiors. They are different
    // things: the channels are energy, the capillaries are fracture in
    // the glass catching light. Merging them into a single mask at a
    // single brightness — which is what the last revision did — gives an
    // even lattice that reads as a lit wireframe, because nothing on the
    // surface is subordinate to anything else.
    vec2 channelField = cellEdge(p * 0.55, uSeed);
    // Wide enough to CARRY colour.
    //
    // Per-part hue assignment was verified working — thirty parts, all
    // distinct seeds, landing across teal / cyan / indigo / violet /
    // magenta — and none of it was visible, because a hairline at 48
    // cells on a 500px entity is one or two pixels. Hue variety needs
    // surface to live on. This is deliberately past the reference
    // sheet's hairline figure: that sheet describes a close-up, and the
    // hero is not one.
    float channel = 1.0 - smoothstep(0.0, 0.125, channelField.x);
    // Junctions. Wider threshold than the edge: F3 - F1 falls off far
    // more gradually than F2 - F1, so the same number would produce
    // points too small to survive at hero distance.
    float nodes = 1.0 - smoothstep(0.0, 0.170, channelField.y);

    // The capillary web. Dense, hairline, and NOT energy — it is pale
    // and dim, so it describes the surface as fractured without claiming
    // any of the emissive budget.
    float web = 1.0 - smoothstep(0.0, 0.030,
      cellEdge(p * 3.4 + 8.3, uSeed + 3.1).x);

    // REGION MASK — modulates PROMINENCE, not presence.
    //
    // As a 0..1 gate this deleted the network across half the shell and
    // the entity came out featureless black. "Very low coverage" in the
    // brief means hairline WIDTH; its own panels show the lattice
    // reaching the whole surface, denser in some regions than others.
    // Floored at 0.35 so every part of the shell carries some structure.
    // Floor raised to 0.62: the lattice now reaches essentially the
    // whole shell and the mask only varies how prominent it is, which
    // is what "denser" means here — more surface carrying network, not
    // just finer cells in the places that already had it.
    float regionMask = mix(0.62, 1.0, smoothstep(0.30, 0.70,
      fbm(p * 0.18 + uSeed * 11.0) / 0.875));

    // Only the CHANNELS carry energy. The capillary web is lit
    // separately and stays pale, which is what keeps the emissive budget
    // on the structure that is meant to have it.
    float crackMask = channel * regionMask;

    // TRAVELLING ACTIVITY. Energy moves through the lattice; the object
    // does not pulse. Dormant fissures keep a tenth of the intensity, so
    // they read as dark hairline structure rather than vanishing.
    float moving = fbm(p * 0.7 + vec2(uTime * 0.035, uTime * 0.021) + uSeed * 5.0) / 0.875;
    moving = smoothstep(0.54, 0.78, moving);
    // Dormant fissures keep HALF the intensity. The gap between dormant
    // and live is what killed the last revision: at a tenth, dormant
    // emission worked out around 0.09 while a live fissure hit 2.6, so
    // the surface was either black or blazing and live cracks are rare
    // by design. A dormant fissure has to be a legible dark line, not an
    // absent one — travelling energy is then a brightening of something
    // already there, which is the whole point of a structural lattice.
    float activeCrack = crackMask * mix(0.62, 1.0, moving);
    // The reaction field decides how hot a live fissure burns.
    activeCrack *= 0.55 + 0.45 * smoothstep(0.18, 0.62, b);

    // WHERE ON THE RAMP this stretch of lattice sits.
    //
    // Low frequency, so a run of fissure holds one colour rather than
    // speckling, and drifting slowly on its own clock so the charge
    // changes character as it moves — "energy travels through the
    // lattice" is a colour behaviour as much as a brightness one.
    //
    // Biased toward the cyan end: the field averages 0.5 and the power
    // pulls that down to roughly 0.35, which lands in the teal/cyan half
    // of the ramp. Violet and magenta are what the upper tail reaches,
    // which is how they stay restrained without being absent.
    float hueField = fbm(p * 0.30 + uSeed * 29.0
                         + vec2(uTime * 0.040, uTime * -0.026)) / 0.875;
    // TRIANGLE WRAP, not a clamp.
    //
    // Multiplying past 1 and folding back sweeps the ramp several times
    // across a single shard, so one fissure runs teal to magenta and
    // back rather than holding one hue. A fract() would do the same but
    // with a hard seam where magenta meets teal; the triangle is
    // continuous, so the cycle reads as colour FLOWING through the
    // lattice instead of as banding.
    // PER-PART OFFSET is what spreads the layers.
    //
    // The sweep depends on how far the hue field travels across a
    // surface, and the deeper tiers are scaled to 0.83 and 0.66 — a
    // smaller part covers less of the field, so its hue collapses toward
    // one value. With no per-part term every layer behind the front
    // landed in the same place on the ramp and the depth of the entity
    // read as uniformly cyan while only the front plates had range.
    //
    // uSeed is a stable per-part hash, so multiplying it across several
    // cycles gives every plate its own starting point regardless of how
    // large it is or how much field it covers. Depth now has colour.
    float swept = hueField * 2.4 + uSeed * 3.7
                + fresnel * 0.22 + uTime * 0.021;
    hueField = abs(fract(swept) * 2.0 - 1.0);
    vec3 hue = energyRamp(hueField);

    // Colour lives INSIDE the fissure. A dormant crack is a dimmer
    // version of its own hue, not a different colour.
    vec3 crackColor = mix(hue * 0.42, hue, activeCrack);

    // Rare SPECTRAL EVENTS on top of the ramp — a stretch of lattice
    // flaring to full magenta. Independent of the ramp field, so they
    // can fire on a cyan run and read as an event rather than as more
    // gradient. Thresholded high: this is the "<1-2% luminous" tail.
    float spectral = smoothstep(0.74, 0.88,
      fbm(p * 0.16 + uSeed * 47.0 + vec2(0.0, uTime * 0.021)) / 0.875);
    crackColor = mix(crackColor, uMagenta, spectral * 0.85);

    // Retained consequence still earns magenta, but only where the
    // journey has genuinely accumulated it.
    float consequence = clamp(smoothstep(0.54, 0.78, b) + uRetained * 0.55, 0.0, 1.0);
    crackColor = mix(crackColor, uMagenta, smoothstep(0.75, 1.0, consequence) * 0.5);

    // EMISSION, confined to the hairline core. The 2.5 power is what
    // keeps the glow inside the fissure instead of bleeding onto the
    // surface either side of it — broad surface glow is the single
    // fastest way back to the plague-skin look.
    // 1.25, not 1.9. A steep power crushes the whole mid-range: it is
    // what made dormant fissures vanish while live ones blew out, and no
    // amount of extra gain fixes that because gain scales both ends.
    // Flattening the curve is what puts a readable network on screen.
    float core = safePow(activeCrack, 1.25);
    emissive += crackColor * core * netResponse * uEmissive * 3.40;
    // A white-hot centre on the live fissures only, very sparse. This is
    // the <1-2% luminous energy; the term above is the 4-8% network.
    emissive += mix(crackColor, uColdWhite, 0.45)
           * safePow(activeCrack, 6.0) * netResponse * uEmissive * 0.75;

    // NODES. Energy pools where fissures meet rather than running evenly
    // along them — it is most of what makes the reference read as
    // electrical rather than as a lit wireframe. Gated on the same
    // travelling field, so junctions brighten and fade as charge moves
    // through the lattice instead of all glowing at once.
    float nodeEnergy = nodes * crackMask * mix(0.30, 1.0, moving);
    emissive += mix(crackColor, uColdWhite, 0.40)
           * safePow(nodeEnergy, 1.7) * netResponse * uEmissive * 3.30;

    // THE CAPILLARY WEB, lit last and lit differently.
    //
    // Cold silver rather than cyan, and an order of magnitude fainter
    // than the channels: this is hairline fracture in the glass catching
    // the key, not energy leaking out. Keeping it colourless is what
    // stops it competing with the channels — the reference reads as one
    // bright system laid over a dense pale one, and if both are cyan the
    // hierarchy collapses and the whole surface turns into a wireframe.
    emissive += mix(uColdSilver, uColdWhite, 0.5)
           * web * regionMask * netResponse * uEmissive * 0.19;
  }

  // ---- Cold edge response ------------------------------------------
  // This block used to wash mix(uAmber * 1.75, uColdWhite, 0.22) across
  // the crown and the Latent Form, weighted by fresnel AND by luminance.
  // At the hero uDivinity is 1.0, so it ran at full strength over every
  // lit pixel — that single term is what turned a black obsidian entity
  // into a bronze statue, and the luminance weight is what spread it off
  // the edges and across the body as a beige cast.
  //
  // Amber is a HALO-ONLY colour. The edge response is cold silver, it is
  // strictly a silhouette term with no body component, and it is kept
  // small: the target is a trace of cold reflection on the rim, not a
  // second light source competing with the core.
  if (uDivinity > 0.001
      && (isClass(CLASS_CROWN_PRIMARY) || isClass(CLASS_CROWN_SECONDARY)
          || isClass(CLASS_LATENT))) {
    vec3 coldEdge = mix(uColdSilver, uColdWhite, 0.35);
    color += coldEdge * uDivinity * fresnel * 0.30 * rimGain;
    color += coldEdge * safePow(fresnel, 6.0) * uDivinity * 0.45;
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
  // The fracture light is added AFTER the fog and keeps most of itself.
  // Fogging it as hard as the stone is what left the front plates
  // colourful and everything behind them reading as flat cyan: at the
  // throat the atmosphere was removing about 70% of the network.
  emissive *= smoothstep(0.22, 1.5, depth) * mix(0.30, 1.0, uWake);
  color += emissive * (1.0 - clamp(fog, 0.0, 1.0) * 0.40);

  outColor = vec4(color, uOpacity);
}
