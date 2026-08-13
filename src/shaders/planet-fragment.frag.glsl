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

/**
 * Relief height at a point, in the piece's own local frame: bedding planes
 * first, then blockiness, then grain. This is the surface the light is
 * actually allowed to see — see the bump note in main().
 */
float relief_height(vec3 p, float fine) {
  // Blocky jointing leads. Rock reads as fractured mass through irregular
  // blocks meeting at angles, not through banding — and a band that leads
  // becomes wood grain, which is the fault this scale is set against.
  float h = 0.60 * sin(p.x * 1.9 + 1.2) * sin(p.z * 1.6 - 0.6)
                 * sin(p.y * 1.4 + 2.2);
  h += 0.30 * sin(p.z * 3.1 - 0.4) * sin(p.x * 2.7 + 1.9);
  // Bedding: broad and shallow, a few thick layers across a whole piece
  // rather than a stripe pattern printed over it.
  float bedFold = 0.55 * sin(p.x * 0.9 + p.z * 0.6);
  h += 0.22 * sin(p.y * 0.95 + p.x * 0.26 + bedFold);
  // Grain, faded out with distance — a sine this fine, differentiated
  // across a distant pixel, is aliasing rather than texture.
  float warp = 2.2 * sin(p.y * 6.1 + p.x * 4.3);
  h += fine * 0.16 * sin(p.x * 21.0 + warp) * sin(p.y * 18.0 - warp);
  return h;
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
  float height = relief_height(vLocal, fine);
  vec3 dPdx = dFdx(vWorld);
  vec3 dPdy = dFdy(vWorld);
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
  float graze = pow(1.0 - abs(dot(n, v)), 3.0);
  float ground = 0.10 + 1.25 * relief;
  float shape = 0.04 + 1.30 * pow(wash, 1.35);
  vec3 colour = vec3(0.105, 0.110, 0.120)
              * (ground * shape * uCrustLight + graze * 0.40 * fall);

  // Close-range grain: warped high-frequency mottling, faded in only as the
  // camera arrives, so near stops read as pitted rock instead of clay while
  // the wide shots stay exactly as composed. Multiplicative, so it carves
  // cavity darkening out of whatever light is already there.
  float near = nearness;
  float grainWarp = 2.2 * sin(vLocal.y * 6.1 + vLocal.x * 4.3);
  float grain = sin(vLocal.x * 21.0 + grainWarp) * sin(vLocal.y * 18.0 - grainWarp)
              + 0.6 * sin(vLocal.z * 24.0 + grainWarp * 1.4) * sin(vLocal.x * 27.0 - vLocal.z * 15.0);
  colour *= 1.0 - near * (0.16 + 0.10 * crust) * clamp(0.5 - 0.4 * grain, 0.0, 1.0);

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
  vec3 h = normalize(l + v);
  float gloss = 0.35 + 0.65 * clamp(0.5 + 0.5 * grain, 0.0, 1.0);
  float sheen = pow(max(dot(n, h), 0.0), 26.0) * gloss * fall;
  vec3 hw = normalize(WASH_DIR + v);
  float voidSheen = pow(max(dot(n, hw), 0.0), 34.0) * gloss;
  colour += vec3(0.44, 0.50, 0.60) * voidSheen * 0.30 * crust * uCrustLight;
  colour += vec3(1.0, 0.60, 0.30) * sheen * 0.55 * crust;

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
  float warp = 1.9 * sin(vLocal.z * 0.83 + vLocal.x * 0.31);
  float veins = 0.80 + 0.20 * sin(vLocal.x * 1.7 + vLocal.y * 1.2 + warp)
                           * sin(vLocal.z * 1.4 - vLocal.x * 0.9 - warp);
  veins *= 0.93 + 0.07 * sin(vLocal.y * 4.0 + vLocal.z * 3.1 + warp * 1.6);
  veins *= 0.86 + 0.14 * sin(vLocal.x * 6.7 + vLocal.y * 5.3 - warp)
                       * sin(vLocal.z * 7.9 - vLocal.y * 4.1 + warp);
  // A fourth, mineral-fine octave that only the near camera resolves: the
  // frequencies above are sized for mid-range, and a break face inside a
  // stop's distance rendered as a flat orange sheet without it.
  veins *= 1.0 - near * 0.22 * (0.5 + 0.5 * sin(vLocal.x * 13.0 + vLocal.y * 10.0 + warp * 2.3)
                                          * sin(vLocal.z * 16.0 - vLocal.x * 9.0 - warp * 1.7));

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

  fragColour = vec4(colour * uExposure, 1.0);
}
