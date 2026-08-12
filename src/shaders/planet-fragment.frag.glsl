// The material of a dead world.
//
// One rule decides everything: light belongs to the break, not to the object.
//
// Every previous version put an amber outline around every silhouette, so all
// forty pieces glowed equally and the field read as a set of lit assets
// floating in space rather than as wreckage. Here the exterior crust is very
// nearly black — dry, dead, heavy, with only the most restrained warm response
// to the source — and all the heat is inside, on the faces that did not exist
// before the planet failed.
//
//   dark crust
//     -> glowing fracture seam
//     -> white-hot at the fresh edge
//     -> amber-hot inner material
//     -> cooler falloff deeper into the fragment
//
// The crust mark arrives from Blender as a vertex attribute, so the boundary
// between old surface and new break is the real geometric boundary rather than
// something approximated from a normal.

uniform vec3 uStarPos;
uniform vec3 uRecord;
uniform float uHeat;
uniform float uCrustLight;
uniform float uRim;
uniform float uFlare;
uniform float uExposure;

in float vCrust;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec3 vView;

out vec4 fragColour;

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

  // ------------------------------------------------------------- the crust
  //
  // Almost nothing. A grazing response only, so a slab reads as a silhouette
  // with a suggestion of a lit limb rather than as a lit object.
  float facing = max(dot(n, l), 0.0);
  float graze = pow(1.0 - abs(dot(n, v)), 3.0);
  // A visibility floor independent of the source, so an unlit slab is a
  // barely-there form instead of a hole in the frame. Bracketed twice: without
  // it the world vanished, and with the light keyed too high everything
  // glowed. Charcoal that you can just read is the target.
  float crustLight = (0.05 + facing * 0.3 + graze * 0.65 * (0.35 + 0.65 * facing)) * fall * uCrustLight;
  vec3 colour = uRecord * vec3(0.52, 0.47, 0.42) * crustLight * 0.3;

  // Backlight. Where a fragment stands between the eye and the source, its
  // edge takes the light directly — the read that ties every piece to the same
  // event without lighting its faces.
  float rim = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 2.5) * max(dot(-v, l), 0.0);
  colour += mix(uRecord, vec3(1.0, 0.93, 0.84), 0.5) * rim * fall * uRim;

  // ---------------------------------------------------------- the fracture
  //
  // Everything the crust is denied. `heat` is one at the break face and falls
  // to zero on the original surface, and the colour runs white at the fresh
  // edge into amber as it recedes — the interior of a planet, exposed.
  float heat = 1.0 - clamp(vCrust, 0.0, 1.0);

  // The white-hot line lives at the lip — the exact edge where a break face
  // meets old surface. The crust mark is per-corner and binary now, so the
  // lip is found where it changes across the screen: a derivative, which
  // draws a crisp fracture line at any distance instead of a vertex-width
  // smear.
  float lip = clamp(fwidth(vCrust) * 1.6, 0.0, 1.0) * (0.3 + 0.7 * heat);

  // Slow variation across the break so molten faces are not flat panels of
  // colour. Two octaves, both broad: at the first frequencies this produced
  // zebra stripes across every face and the wreckage read as printed fabric.
  float veins = 0.7 + 0.3 * sin(vLocal.x * 5.3 + vLocal.y * 3.7)
                          * sin(vLocal.z * 4.3 - vLocal.x * 2.9);
  veins *= 0.85 + 0.15 * sin(vLocal.y * 11.0 + vLocal.z * 8.0);

  // Interiors cool as they travel. The body still burns; a chip thrown thirty
  // units down the corridor has had the longest to die, so the journey reads
  // hot -> cooling -> cold, straight back toward the source. This is also
  // what keeps the debris field from being confetti: most of it only embers.
  float cooling = clamp(1.7 / (1.0 + starDist * 0.14), 0.12, 1.0);

  // dark crust -> white-hot lip -> amber inner material -> cooling deeper in.
  vec3 molten = mix(vec3(1.0, 0.38, 0.07), vec3(1.0, 0.68, 0.3), veins);
  float intensity = heat * heat * veins * cooling * uHeat * (1.0 + uFlare * 1.2);
  colour += molten * intensity;
  colour += vec3(1.0, 0.96, 0.9) * lip * cooling * uHeat * (0.9 + uFlare * 0.8);

  fragColour = vec4(colour * uExposure, 1.0);
}
