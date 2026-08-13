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

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);

  vec3 toStar = uStarPos - vWorld;
  float starDist = length(toStar);
  vec3 l = toStar / max(starDist, 1e-4);

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
  float near = clamp(1.0 - vCam / 15.0, 0.0, 1.0);
  float grainWarp = 2.2 * sin(vLocal.y * 6.1 + vLocal.x * 4.3);
  float grain = sin(vLocal.x * 21.0 + grainWarp) * sin(vLocal.y * 18.0 - grainWarp)
              + 0.6 * sin(vLocal.z * 24.0 + grainWarp * 1.4) * sin(vLocal.x * 27.0 - vLocal.z * 15.0);
  colour *= 1.0 - near * (0.16 + 0.10 * crust) * clamp(0.5 - 0.4 * grain, 0.0, 1.0);

  // The interior is a light source: crust that faces it catches its warmth,
  // falling off with the square of the distance — wound rims, slab
  // undersides, the near faces of close debris. This is the spill that ties
  // every lit edge to the same fire.
  float spill = max(dot(n, l), 0.0) * fall * fall;
  colour += vec3(1.0, 0.42, 0.14) * spill * 0.26 * uCrustLight;

  // The failing plate boundaries, baked per vertex so the glow follows the
  // fracture field and not the tessellation: ember hairlines far from the
  // rupture, open venting near it, parting further as the flare climbs.
  float vent = clamp(vMark.a, 0.0, 1.0) * crust;
  vec3 ventGlow = mix(vec3(0.42, 0.055, 0.008), vec3(1.0, 0.5, 0.1), vent);
  // A gentler exponent than the square: the baked floor exists so no region
  // reads safe, and squaring it back to zero silenced the far side's ember
  // hairlines entirely.
  colour += ventGlow * pow(vent, 1.55) * uHeat * (1.05 + uFlare * 0.9);

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
