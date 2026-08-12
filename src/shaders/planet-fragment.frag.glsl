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
  float crustLight = (facing * 0.35 + graze * 0.65) * fall * uCrustLight;
  vec3 colour = uRecord * crustLight * 0.13;

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
  float deep = heat * heat;
  float edge = pow(heat, 6.0);

  // Slow variation across the break so molten faces are not flat panels of
  // colour. Sampled in the fragment's own space, so it moves with the piece.
  float veins = 0.72 + 0.28 * sin(vLocal.x * 41.0 + vLocal.y * 27.0)
                            * sin(vLocal.z * 33.0 - vLocal.x * 19.0);

  vec3 molten = mix(vec3(1.0, 0.42, 0.09), vec3(1.0, 0.78, 0.42), deep);
  molten = mix(molten, vec3(1.0, 0.97, 0.92), edge);

  float intensity = (deep * 0.85 + edge * 1.35) * veins * uHeat * (1.0 + uFlare * 1.2);
  colour += molten * intensity;

  fragColour = vec4(colour * uExposure, 1.0);
}
