// The material of a dead world.
//
// One rule decides everything: light belongs to the break, not to the object.
//
// The mark arrives from Blender as one vec4 attribute, baked per corner so
// every boundary is the real geometric boundary:
//
//   r  1 on the original exterior, 0 on every face the event exposed
//   g  temperature of an exposed face — 1 on fresh cut cross-sections and
//      wound walls, low on the crust's old underside (the solidify lining),
//      which has had a planet's age to cool. This is the difference between
//      a detached slab reading as dark torn mass and reading as a dish of
//      molten orange: v3 burned the whole underside and every piece became
//      lit ceramic.
//   b  terrain altitude, basins 0 to highlands 1
//
// Two lights, and they are different kinds of thing. The interior is a real
// source: radial from the rupture, inverse-square, and everything hot keys
// off it. The wash is not a source at all — a fixed, faint, cool grazing
// response standing in for the void, because a charcoal world with no wash
// is a silhouette and its geology never reads. The wash carries no warmth:
// amber belongs to the break.

uniform vec3 uStarPos;
uniform float uHeat;
uniform float uCrustLight;
uniform float uRim;
uniform float uFlare;
uniform float uExposure;

in vec4 vMark;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec3 vView;
in float vCam;

out vec4 fragColour;

// Fixed in world space, high and slightly up-corridor, so ridge systems and
// scarps shade against it from the rail's poses. Cool and directionless in
// distance — the void does not fall off.
const vec3 WASH_DIR = vec3(0.565, 0.823, 0.057);

// A second fixed direction, deliberately low across the body. Landscape
// reads under a low sun and flattens under an overhead one, and the wash
// alone sits too near the reveal pose to cast terrain across itself. This
// one only shapes: it is applied mean-preserving, redistributing value
// between slopes that face it and slopes turned away rather than adding
// light. Chosen off both the wash and the star so no two of the three ever
// agree on a direction.
// Pre-normalised: a const initialiser cannot call normalize(). Chosen with
// a positive component along the approach so it actually falls on the
// hemisphere the camera can see — aimed away, every visible slope reads
// zero, the mean-preserving mix collapses to its floor, and the term
// becomes a flat dimming that shapes nothing. Near-perpendicular to
// WASH_DIR (dot ≈ 0.09), so the two never agree on a direction.
const vec3 RAKE_DIR = vec3(0.600, -0.350, 0.719);

/**
 * Stays sin-based, and that is a measurement rather than an oversight.
 *
 * Swapping this for a multiply-and-fract hash is the standard optimisation
 * and it was tried: it moved the frame by less than the run-to-run spread,
 * because this shader is not the bottleneck, and it changed the noise
 * realisation enough that the core's rift network went blobby and the crust
 * lost its grain. A different hash is a different surface. Not worth it for
 * nothing.
 */
float hash1(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash1(i + vec3(0.0, 0.0, 0.0)), hash1(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(hash1(i + vec3(0.0, 1.0, 0.0)), hash1(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash1(i + vec3(0.0, 0.0, 1.0)), hash1(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(hash1(i + vec3(0.0, 1.0, 1.0)), hash1(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

/** Three octaves, centred on zero. Bounded cost: this runs on the whole body. */
float fbm3(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p = p * 2.07 + 13.3;
    amp *= 0.5;
  }
  return sum - 0.4375;
}

/**
 * Relief height at a point, in the piece's own local frame. This is the
 * surface the light is actually allowed to see — see the bump note in main().
 *
 * Built from noise, not from products of sines. A product of sines is a
 * regular three-dimensional lattice: it tiles, and the moment the real
 * terrain amplitude came down to something planetary the lattice stopped
 * being masked and the crust read as woven corduroy — the grid fault
 * HERO_DIRECTION names as the single most damaging one available. Noise has
 * no repeating unit, so relief can be pushed hard and no pattern ever
 * emerges from it.
 */
float relief_height(vec3 p, float fine, float micro) {
  // Rolling mass first, then ridged jointing subtracted from it: an absolute
  // value has a sharp bottom, which is what makes rock read as fractured
  // blocks meeting at angles rather than as dunes.
  float h = 1.30 * fbm3(p * 0.55);
  h -= 0.60 * abs(fbm3(p * 1.30 + 17.0));
  // Grain, faded out with distance — detail this fine, differentiated across
  // a distant pixel, is aliasing rather than texture. Skipped outright once
  // the fade has taken it, rather than multiplied by nothing: it is a third
  // of this function's cost, the fade reaches zero at 26 units, and most of
  // what the frame draws is further away than that. The branch is coherent
  // — whole pieces are near or far together — so it costs nothing to take.
  if (fine > 0.01) h += fine * 0.35 * fbm3(p * 4.10 + 41.0);

  // Pitting, and it only exists where the camera can resolve it.
  //
  // The scale above tops out around four cycles per unit, which is landscape
  // detail: correct at a stop's distance and far too coarse when the rail
  // brings a slab close, where it left the crust reading as smooth stone
  // rather than as rock. This octave is nearly three times finer and fades in
  // over the last fifteen units, so a near piece breaks its highlights the
  // way a real surface does without any of it existing to alias in the wide
  // shots.
  if (micro > 0.01) h += micro * 0.20 * fbm3(p * 11.5 + 73.0);
  return h;
}

/** Authored vein half-widths, in each network's own noise-space units. */
const float RIFT_WIDTH = 0.055;
const float CAPILLARY_WIDTH = 0.034;

/**
 * A crack network drawn at a width the author chose.
 *
 * `abs(f)` is not a distance — the level set's thickness in space is that
 * value divided by the field's gradient, so a flat region of the field draws
 * a patch where a hairline was intended. Dividing by the gradient makes the
 * width uniform and the threshold meaningful.
 *
 * `footprint` is how far the shading point moves across one pixel, in the
 * same units. The band never falls below it, and whatever the widening added
 * is taken straight back out, so a vein too fine to resolve fades instead of
 * breaking into crawling dots — and carries the same total light either way.
 * It is passed in rather than taken from `fwidth` here because a derivative
 * is only defined in uniform control flow, and this is called from inside a
 * branch.
 */
float crack_lines(vec3 q, float width, float footprint) {
  const float E = 0.07;
  float f0 = fbm3(q);
  vec3 grad = (vec3(fbm3(q + vec3(E, 0.0, 0.0)),
                    fbm3(q + vec3(0.0, E, 0.0)),
                    fbm3(q + vec3(0.0, 0.0, E))) - f0) / E;
  float slope = max(length(grad), 1e-3);
  float dist = abs(f0) / slope;

  float band = max(width, 0.5 * footprint);
  return (1.0 - smoothstep(0.0, band, dist)) * (width / band);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);

  vec3 toStar = uStarPos - vWorld;
  float starDist = length(toStar);
  vec3 l = toStar / max(starDist, 1e-4);

  // ------------------------------------------------------------- the relief
  //
  // The mesh is smooth-shaded, and smooth shading is why the crust kept
  // reading as moulded soap however it was lit: bedding and grain painted as
  // colour cannot cast, catch or break a highlight, because the surface the
  // light sees is still a soft curve. So the normal itself is bent by the
  // rock's own height field — bedding planes, blocky jointing, grain —
  // before a single lighting term is computed.
  //
  // Done with screen-space derivatives against the world position, which
  // needs no UVs and no tangents: the surface gradient is recovered from how
  // the height and the position change across neighbouring pixels. The fine
  // octave is faded with distance because differentiating a high frequency
  // across a far pixel produces noise, not stone.
  float nearness = clamp(1.0 - vCam / 15.0, 0.0, 1.0);
  float fine = clamp(1.0 - vCam / 26.0, 0.0, 1.0);
  float height = relief_height(vLocal, fine, nearness);
  vec3 dPdx = dFdx(vWorld);
  vec3 dPdy = dFdy(vWorld);

  // How far the shading point travels across one pixel, in the piece's own
  // frame. Taken here, at the top, because derivatives are only defined in
  // uniform control flow and the crack networks that need this are computed
  // inside a branch.
  float pixelLocal = length(fwidth(vLocal));

  // Curvature of the real surface, taken before the procedural bump touches
  // the normal, so what it reports is the terrain the generator built and
  // not the noise this shader adds on top.
  //
  // Normals converge into a hollow and diverge over a ridge, so the
  // divergence of the interpolated normal field is a cavity/crest signal
  // read straight off the mesh — what a baked ambient-occlusion map would
  // give, without the bake, and deterministic. Dividing by the screen
  // footprint turns it into a curvature in world units, which is what makes
  // it hold still as the camera moves instead of strengthening as the body
  // fills more pixels.
  vec3 dNdx = dFdx(n);
  vec3 dNdy = dFdy(n);
  float footprint = max(dot(dPdx, dPdx) + dot(dPdy, dPdy), 1e-9);
  float curvature = (dot(dNdx, dPdx) + dot(dNdy, dPdy)) / footprint;

  vec3 r1 = cross(dPdy, n);
  vec3 r2 = cross(n, dPdx);
  float det = dot(dPdx, r1);
  if (abs(det) > 1e-8) {
    vec3 surfaceGrad = (r1 * dFdx(height) + r2 * dFdy(height)) / det;
    n = normalize(n - surfaceGrad * 0.14);
  }

  // Inverse-square, softened. A piece far down the blast corridor is genuinely
  // darker than one beside the source, which is most of what sells the
  // distances involved.
  float fall = 1.0 / (1.0 + starDist * starDist * 0.012);

  float crust = clamp(vMark.r, 0.0, 1.0);
  float temperature = clamp(vMark.g, 0.0, 1.0);
  float altitude = clamp(vMark.b, 0.0, 1.0);

  // ------------------------------------------------------------- the crust
  //
  // Charcoal geology. Value comes from two places only: the wash shaping
  // ridges, scarps and basin walls, and altitude — highlands pale the way a
  // world's highlands do, basins fall to almost nothing. That pairing is what
  // lets terrain read inside the silhouette on a body this dark; the star
  // adds a grazing response at the limb with real falloff and nothing else.
  // The altitude bake is normalised against the soft cap, which ordinary
  // terrain never reaches — expanded here so the working range of hills and
  // basins spans the whole value scale. Subtle is invisible on a body this
  // dark; the separation that keeps it charcoal is against the fracture
  // light, which stays four to eight times brighter than any crust.
  float relief = clamp(0.5 + (altitude - 0.5) * 2.05, 0.0, 1.0);
  float wash = max(dot(n, WASH_DIR), 0.0);
  // Tight, because a broad one is a wet edge. At exponent 3 this lifted a
  // wide band around every silhouette — the reading a viewer names as
  // plastic before naming anything else about the material.
  float graze = pow(1.0 - abs(dot(n, v)), 5.5);
  float ground = 0.10 + 1.25 * relief;
  float shape = 0.04 + 1.30 * pow(wash, 1.35);
  // The rake, mean-preserving: slopes turned into it gain what slopes turned
  // away lose. Terrain casts value across itself and the body's overall
  // brightness is unchanged, which is the difference between revealing
  // geology and simply adding a second lamp to a world that must stay dark.
  float rake = smoothstep(0.0, 0.50, dot(n, RAKE_DIR));
  shape *= mix(0.66, 1.34, rake);
  vec3 colour = vec3(0.105, 0.110, 0.120)
              * (ground * shape * uCrustLight + graze * 0.40 * fall);

  // Close-range grain: warped high-frequency mottling, faded in only as the
  // camera arrives, so near stops read as pitted rock instead of clay while
  // the wide shots stay exactly as composed. Multiplicative, so it carves
  // cavity darkening out of whatever light is already there.
  float near = nearness;
  // Pitting, from the same noise for the same reason: the sine-product form
  // of this was a fine lattice, and a lattice at grain scale is the speckled
  // fabric weave that came with the corduroy.
  float grain = 3.2 * fbm3(vLocal * 7.5 + 3.7);
  colour *= 1.0 - near * (0.16 + 0.10 * crust) * clamp(0.5 - 0.4 * grain, 0.0, 1.0);

  // Landforms, made legible. The generator puts crater rims, scarps and
  // basins into the mesh; smooth shading on a body this dark was not
  // revealing any of them, so the terrain existed and could not be named.
  // Hollows darken, rims catch. Both come from real curvature, so what the
  // eye finds is the terrain that is actually there rather than a texture
  // implying it.
  //
  // Cavity carries the weight because it is zero on anything convex: a
  // sphere, and every debris chunk, is untouched, and only genuine
  // concavity darkens. Crest stays small for the same reason in reverse —
  // a small chunk has high curvature everywhere, and a large crest term
  // would light the debris field as a side effect.
  float cavity = clamp(-curvature * 0.60, 0.0, 1.0);
  float crest = clamp(curvature * 0.25, 0.0, 1.0);
  colour *= 1.0 - 0.52 * cavity * crust;
  colour *= 1.0 + 0.18 * crest * crust;

  // ------------------------------------------------------------- the strata
  //
  // Bedded rock. In the reference the enormous slab is unmistakably layered —
  // parallel laminations running the length of it, catching light on their
  // edges — and that lamination is most of why it reads as geology under its
  // own weight rather than as a shaded lump. Banded in the piece's own local
  // frame, so every fragment carries its own bedding attitude, and bent so
  // the layers follow the rock instead of ruling straight lines across it.
  //
  // Strongest on break faces, which is where bedding is actually exposed: a
  // cross-section cuts the layers edge-on. On the weathered exterior only a
  // trace survives.
  // The bedding also darkens: a cross-section shows its layers as tonal
  // banding, not only as relief. Strongest on break faces, where bedding is
  // actually exposed edge-on; a trace only on the weathered exterior.
  float bedFold = 0.55 * sin(vLocal.x * 0.9 + vLocal.z * 0.6);
  float beds = sin((vLocal.y * 1.35 + vLocal.x * 0.4 + bedFold) * 2.2);
  float lamina = smoothstep(-0.35, 0.35, beds) * 0.65 + 0.35 * smoothstep(-0.9, 0.9, beds);
  // Only where bedding is genuinely exposed — a cut cross-section — does it
  // band the tone. Painted across the weathered exterior it is stripes.
  float bedding = mix(0.26, 0.0, crust) * (0.35 + 0.65 * near);
  colour *= 1.0 - bedding * (1.0 - lamina);

  // ------------------------------------------------------------ the mineral
  //
  // Rock, not felt. The reference crust has a hard specular life — bright
  // grazing sheen along lit ridges and slab faces against deep shadow — and
  // a purely diffuse charcoal can never produce it, which is why ours read
  // as soap. Cool and tight, from the interior light and the void wash both,
  // roughened per-patch so it glints along edges instead of lacquering the
  // whole surface.
  // Sparse and hard, because the previous form was neither. `gloss` never
  // fell below 0.35, so every pixel of the crust carried some specular and
  // the whole body read as wet vinyl — the exact fault this section was
  // added to cure, reintroduced by giving the cure full coverage. A mineral
  // glint is isolated: a facet catches the light and the rock either side of
  // it does not. Thresholding the grain leaves only its peaks glinting, and
  // tighter lobes keep those glints hard instead of smearing them into
  // sheen. Faded with distance, since a sparse high-frequency highlight on a
  // far piece is a sparkle, not a mineral.
  float facet = smoothstep(0.58, 0.94, 0.5 + 0.5 * grain) * (0.2 + 0.8 * fine);
  vec3 h = normalize(l + v);
  float sheen = pow(max(dot(n, h), 0.0), 62.0) * facet * fall;
  vec3 hw = normalize(WASH_DIR + v);
  float voidSheen = pow(max(dot(n, hw), 0.0), 74.0) * facet;
  colour += vec3(0.44, 0.50, 0.60) * voidSheen * 0.34 * crust * uCrustLight;
  colour += vec3(1.0, 0.60, 0.30) * sheen * 0.60 * crust;

  // The interior is a light source: crust that faces it catches its warmth,
  // falling off with the square of the distance — wound rims, slab
  // undersides, the near faces of close debris. This is the spill that ties
  // every lit edge to the same fire.
  float spill = max(dot(n, l), 0.0) * fall * fall;
  colour += vec3(1.0, 0.42, 0.14) * spill * 0.38 * uCrustLight;

  // The failing plate boundaries, baked per vertex so the glow follows the
  // fracture field and not the tessellation: ember hairlines far from the
  // rupture, open venting near it, parting further as the flare climbs.
  // The reference's fissures are CAPILLARIES: thin incandescent threads
  // forking down to hairlines, the dark rock overwhelmingly winning the
  // surface area, each thread bright enough at its core to bleed light into
  // the stone beside it. Ours were wide soft bands — a glow painted along a
  // boundary, which is why they read as decoration rather than as rock
  // splitting.
  //
  // So the baked field is squeezed into a narrow channel and split in two: a
  // tight white-hot core carrying almost no area, inside a broader dim bleed
  // that does the spilling. Broken along its length by the grain, so a
  // thread varies and forks instead of running like piping.
  float vent = clamp(vMark.a, 0.0, 1.0) * crust;
  float threadBreak = 0.55 + 0.45 * clamp(0.5 + 0.5 * grain, 0.0, 1.0);
  float ventCore = smoothstep(0.62, 0.92, vent) * threadBreak;
  float ventBleed = smoothstep(0.12, 0.78, vent);
  vec3 bleedGlow = mix(vec3(0.34, 0.045, 0.006), vec3(1.0, 0.42, 0.07), ventBleed);
  colour += bleedGlow * ventBleed * ventBleed * uHeat * (0.55 + uFlare * 0.6);
  colour += vec3(1.0, 0.72, 0.34) * ventCore * uHeat * (1.7 + uFlare * 1.4);
  colour += vec3(1.0, 0.94, 0.86) * ventCore * ventCore * uHeat * (0.9 + uFlare * 1.1);

  // Backlight. Only the limb, only against the source. Narrower than every
  // previous version: a broad warm fresnel across exterior faces was most of
  // why detached slabs still read as lit orange objects from across the
  // corridor.
  float rim = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 5.0)
            * pow(max(dot(-v, l), 0.0), 1.5);
  colour += vec3(1.0, 0.62, 0.30) * rim * fall * uRim * 0.5;

  // ---------------------------------------------------------- the fracture
  //
  // Everything the crust is denied, gated twice: `heat` says the event
  // exposed this face, `temperature` says whether it is a fresh cut or the
  // old cooled underside.
  float heat = 1.0 - crust;

  // The white-hot line lives at the lip — the exact edge where a break face
  // meets old surface. The crust mark is per-corner, so the lip is found
  // where it changes across the screen: a derivative, which draws a crisp
  // fracture line at any distance instead of a vertex-width smear.
  float lip = clamp(fwidth(crust) * 2.4, 0.0, 1.0) * (0.3 + 0.7 * heat);

  // Slow variation across the break so molten faces are not flat panels of
  // colour. Three octaves, sized from continent slabs down to chunk faces —
  // and each octave's phase is bent by a slower wave first. Straight sines
  // paint parallel bands across any face bigger than their wavelength, and
  // the wound walls are exactly that big: the first frames striped every rim
  // like printed fabric. Warped, the bands close into marbling.
  // The ember law, finally with something to act on.
  //
  // Two faults in sequence, both visible only at magnification. First these
  // octaves ran at 1.7 per unit on a body of radius 4.6, so barely one cycle
  // spanned the whole world and across a wall two units wide the field was
  // effectively CONSTANT. A constant is a flat sheet, which is why the wound
  // read as orange rind and why the ember-law remap appeared to do nothing:
  // the remap was correct and had no distribution to remap.
  //
  // Raising the frequency exposed the second fault immediately. Products of
  // unaligned sines are a lattice, and once resolvable the walls came back as
  // a regular herringbone — the grid HERO_DIRECTION names as the single most
  // damaging fault available, arriving by the same route it did in the crust
  // relief and the core.
  //
  // So the veins are a LEVEL SET of noise, the technique that killed the
  // cellular core: the curve where a warped field crosses zero is a network
  // of long sinuous cracks with no characteristic size and no repeating unit.
  // It also delivers the ember law by construction rather than by remapping —
  // a level set occupies very little area, so most of the wall is burnt mass
  // and the network carries the heat.
  // And a level set has to be drawn as a DISTANCE, or it is not one.
  //
  // Thresholding the field's value looks like a level set and behaves like a
  // stain. Measured over the wall: `abs(rift) < 0.085` admitted 55% of space
  // and the capillary threshold 35%, so what was authored as a vein network
  // was most of the surface — which is why the ember law kept having to be
  // reasserted downstream against a field that had already lost it. Worse,
  // the width the threshold produced was its value divided by the local
  // gradient, so wherever the field flattened a vein swelled into a patch.
  //
  // Dividing by that gradient recovers the distance the threshold stood in
  // for: every vein is then the width it was authored at, wherever it runs.
  // Three extra taps each, and the two networks are computed together so the
  // per-pixel footprint below is shared.
  // Only on faces the event exposed. The gradient costs three taps a network
  // and the exterior has no veins to draw, so the whole thing sits behind the
  // same gate that already zeroes it downstream — and break faces are whole
  // regions, so the branch is coherent and the warp takes it together.
  float veinField = 0.0;
  if (heat > 0.002) {
    veinField = crack_lines(vLocal * 2.4 + 11.0, RIFT_WIDTH, pixelLocal * 2.4);
    // A finer network the near camera resolves, faded out beyond it so a
    // distant wall is not differentiating high frequencies into noise.
    float capillary = crack_lines(vLocal * 5.8 + 41.0, CAPILLARY_WIDTH, pixelLocal * 5.8);
    veinField = clamp(veinField + 0.55 * capillary * near, 0.0, 1.0);
  }

  // Burnt is the default; incandescence is the exception. The floor is what
  // keeps a cooled wall from going pure black, not a base level of glow.
  float veins = 0.05 + 0.95 * veinField;

  // Interiors cool as they travel — and steeper than v3, because the debris
  // tail must read as dark mass with hot break edges, not as a stream of
  // embers competing with the wounds.
  float cooling = clamp(1.9 / (1.0 + starDist * 0.20 + starDist * starDist * 0.0045), 0.06, 1.0);

  // The break gradient: white-hot at the torn lip, orange in the fresh face,
  // burnt and darkening deeper. `fresh` pulls the old undersides down to an
  // ember floor — dark burnt red, never a panel of orange.
  float fresh = temperature * temperature;
  vec3 molten = mix(vec3(0.42, 0.055, 0.008), vec3(1.0, 0.3, 0.045), veins * fresh);
  float intensity = heat * (0.05 + 0.95 * fresh) * veins * cooling * uHeat * (1.0 + uFlare * 1.2);
  colour += molten * intensity;
  colour += vec3(1.0, 0.94, 0.85) * lip * (0.35 + 0.65 * cooling) * uHeat * (0.85 + uFlare * 0.8);

  // ------------------------------------------------------------ the depth
  //
  // Distance takes light away, and a frame that forgets this cannot state
  // scale. Every fragment out in the field was being lit as though it stood
  // beside the body, so a chunk twenty units out and a slab against the
  // rupture arrived at the eye with the same weight — which is most of why
  // the composition read as a pebble surrounded by confetti rather than as a
  // world with a field around it.
  //
  // Not a fog colour: this is a dark scene and mixing toward anything would
  // grey the void the grade just cleared. Light is simply removed, so the far
  // field recedes into the black it already sits in. Floored well above zero,
  // because the far pieces are where the enforcement gradient is demonstrated
  // and a piece nobody can see teaches nothing.
  float recession = mix(1.0, 0.34, smoothstep(24.0, 95.0, vCam));
  colour *= recession;

  fragColour = vec4(colour * uExposure, 1.0);
}
