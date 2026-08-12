// THE CORRECTION — the apparition.
//
// There is no carrier object here. No lines, no sticks, no plates, no grid, no
// mesh, no repeated element. The form is a distance field, marched, and every
// surface you can see is a level set of that field rather than a thing that was
// placed. That is the entire point of this file.
//
// Why, in one line: five carriers died here and every one of them died the same
// way. Filaments read as spaghetti. A swept surface read as a cutting board.
// Lamellae read as hanging anatomy. Plates read as architectural junk. The
// common fault was never the shape — it was that the primitive stayed visible,
// so the eye identified the material and filed the whole thing as mundane
// geometry before it could feel anything. An implicit field has no primitive to
// recognise. You perceive a presence and then fail to classify it, which is the
// order the site needs.
//
// Colour grammar, never redefined:
//
//   amber   the record       the approved field, and the light it emits
//   cyan    the world        a region whose parameters have left the basin
//   violet  the consequence  V = D × C — where the system closed the gap
//
// No rings. That rule outlived four directions and it applies here with more
// force, not less: radial domain repetition and origin-centred spherical folds
// are the two easiest ways to make a raymarcher produce concentric arcs. Every
// fold below is offset before it is mirrored and rotated on an axis shared with
// nothing, and the core is carved off-centre. The halo is meant to be an
// accident of density and light around an irregular absence — never a ring, and
// never a shape anything was drawn along.

precision highp float;

uniform vec2 uResolution;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform float uTanFov;

uniform float uTime;
/** Slow parameter breathing. Not motion — the field is nearly still. */
uniform float uBreath;
uniform int uSteps;

uniform vec3 uRecord;
uniform vec3 uWorld;
uniform vec3 uConsequence;

uniform float uScale;
uniform float uFoldOffset;
uniform vec3 uBox;
uniform float uRound;
uniform float uWarp;

uniform vec3 uCore;
uniform float uCoreRadius;
uniform float uPanelFreq;
uniform float uRelief;
uniform float uGroove;
uniform float uTrench;
uniform float uRadius;
uniform vec3 uDish;
uniform float uDishRadius;
uniform float uHeat;
uniform float uFractureFreq;
uniform float uBreak;
uniform float uMoltenRadius;
uniform float uLavaDensity;
uniform float uLava;

/** Pointer in NDC, and how far the field has come up to meet it. */
uniform vec2 uHover;
uniform float uHoverStrength;
uniform float uHoverRadius;
uniform float uHoverGain;
uniform float uHoverFringe;

uniform float uAureole;
uniform float uGlow;
uniform float uDensity;
uniform float uExposure;

out vec4 fragColour;

const int ITERATIONS = 4;
const float FAR = 46.0;

/** A rotation built from an axis and an angle, applied without a matrix. */
vec3 turn(vec3 p, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}

/**
 * The absence.
 *
 * Three ellipsoids blended into one irregular body, then roughened by a
 * low-frequency warp so its boundary has no single radius anywhere on it. It is
 * subtracted from the field: nothing exists inside it, so it is dark because it
 * is empty rather than because something black was drawn there.
 */
float core(vec3 p) {
  vec3 q = p - uCore;

  float a = length(q / vec3(1.35, 0.92, 1.08)) - 1.0;
  float b = length((q - vec3(1.1, 0.55, -0.7)) / vec3(0.78, 1.12, 0.85)) - 1.0;
  float c = length((q + vec3(0.9, -0.75, 1.05)) / vec3(0.95, 0.7, 1.25)) - 1.0;

  // Smooth union, so it reads as one body rather than three balls with creases.
  float k = 0.55;
  float d = -log(exp(-a / k) + exp(-b / k) + exp(-c / k)) * k;

  // Roughened. A clean ellipsoid boundary is the one thing here that could
  // still resolve into a recognisable primitive.
  d += 0.12 * sin(q.x * 1.7 + 0.6) * sin(q.y * 1.3 - 1.1) * sin(q.z * 1.9 + 2.2);

  return d * uCoreRadius;
}

float hash31(vec3 c) {
  return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

/**
 * The seams between plates.
 *
 * Returns roughly 0 across a plate face and rises to 1 in the groove between
 * plates. The emission term reads it, so light collects in the seams of the
 * armour rather than on its faces — which is the same accumulation the glow
 * already used, pointed at a machine instead of at geology.
 */
float fissure(vec3 p) {
  vec3 g = abs(fract(p * uPanelFreq) - 0.5);
  float seam = min(min(g.x, g.y), g.z);
  float fine = min(min(
    abs(fract(p.x * uPanelFreq * 3.1) - 0.5),
    abs(fract(p.y * uPanelFreq * 3.1) - 0.5)),
    abs(fract(p.z * uPanelFreq * 3.1) - 0.5));
  return max(
    1.0 - smoothstep(0.0, 0.055, seam),
    (1.0 - smoothstep(0.0, 0.03, fine)) * 0.45
  );
}

/**
 * The field: an armoured sphere.
 *
 * The previous body was an irregular warped mass and it was unreadable —
 * founder verdict, and correct: a shape you cannot name is not automatically a
 * shape that means something. "No visible primitives" was a rule about
 * *material*, about being able to see the sticks and plates a thing was
 * assembled from. It was never a licence to make the silhouette illegible.
 * A coherent body covered in detail you cannot resolve is the target; an
 * amorphous blob is just the same failure wearing mathematics.
 *
 * So: a sphere, plated. Rectilinear armour panels at two scales, each plate
 * sitting at its own slight height, with grooves cut along every seam. One
 * enormous concave dish taken out of it, off-centre. Broad trenches cutting
 * across the plating, offset and broken rather than running as one clean
 * equator — a single continuous equatorial band is a ring, and that rule has
 * outlived five carriers.
 *
 * The relief is applied to the radius rather than folded into space, so the
 * body stays legible at every distance: a machine the size of a moon, whose
 * surface keeps resolving into more machine as you approach.
 */
float field(vec3 p) {
  vec3 q = p;

  // A little warp, only enough that the horizon is not a perfect circle.
  // Any more and the body stops being one thing again.
  q += uWarp * 0.14 * vec3(
    sin(q.y * 0.51 + 1.7),
    sin(q.z * 0.43 + 0.4),
    sin(q.x * 0.37 + 2.9)
  );

  float r = length(q);

  // Armour plating: two scales of blocky relief, each plate at its own height.
  float coarse = hash31(floor(q * uPanelFreq));
  float fine = hash31(floor(q * uPanelFreq * 3.1) + 17.3);
  float relief = (coarse * 0.62 + fine * 0.38 - 0.5) * uRelief;

  // Grooves along every seam, cut into the plating.
  float seams = fissure(q) * uGroove;

  // The fracture.
  //
  // The crust is broken into large plates, each shifted out along its own
  // radius by its own amount, so the gaps between them are real crevasses
  // rather than drawn lines. This is the event the whole hero is about: a made
  // thing the size of a world, coming apart along the seams it was built on.
  vec3 plate = floor(q * uFractureFreq);
  float drift = hash31(plate + 4.1);
  float split = uBreak * (0.25 + drift);

  float surface = uRadius + split + relief - seams;

  // Trenches. Three broad cuts on unrelated axes, each offset from the centre
  // and each broken by the plating it crosses — the Death Star's equator read
  // as a machined channel, not as a drawn circle.
  vec3 t = q;
  float trench = 1e9;
  trench = min(trench, abs(dot(t, normalize(vec3(0.08, 1.0, 0.05))) - 0.35) - 0.16);
  trench = min(trench, abs(dot(t, normalize(vec3(0.94, 0.22, -0.26))) + 1.55) - 0.10);
  trench = min(trench, abs(dot(t, normalize(vec3(-0.31, 0.42, 0.85))) - 2.05) - 0.07);
  surface -= (1.0 - smoothstep(0.0, 0.09, max(trench, 0.0))) * uTrench;

  float d = r - surface;

  // The dish. One enormous concavity, off the centre of the face, and the
  // absence the whole composition is organised around.
  float dish = length(q - uDish) - uDishRadius;
  d = max(d, -dish);

  // Give the estimator some slack: the relief is not Lipschitz-1, so the march
  // takes shorter steps rather than overshooting through a plate edge.
  return d * 0.55;
}

/** The field with the absence removed from it. */
float map(vec3 p) {
  return max(field(p), -core(p));
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;

  vec3 direction = normalize(
    uCamRight * (ndc.x * aspect * uTanFov) + uCamUp * (ndc.y * uTanFov) + uCamForward
  );

  float travelled = 0.0;

  // Light is accumulated along the ray rather than shaded onto a surface.
  //
  // This is what makes the glow belong to the mathematics: it collects wherever
  // the ray spends time close to a boundary, which is exactly the folds, the
  // cavities and the narrow gaps where recursive detail is densest. Nothing is
  // painted onto geometry, so there is no geometry to look painted.
  float lit = 0.0;
  float halo = 0.0;
  float deep = 0.0;
  float heat = 0.0;
  float lava = 0.0;

  for (int i = 0; i < 256; i++) {
    if (i >= uSteps) break;

    vec3 p = uCamPos + direction * travelled;
    float d = map(p);

    // Proximity emission. The exponential is what concentrates it at the
    // boundary instead of smearing it through the volume.
    float near = exp(-abs(d) * uDensity);
    lit += near;

    // Cavities: places the ray is inside the field's influence but not against
    // a wall. This is the depth that reads as interior rather than as shell.
    deep += near * clamp(1.0 - abs(d) * 3.0, 0.0, 1.0);

    // Residual heat, gathered in the seams only.
    heat += near * fissure(p);

    // Lava.
    //
    // The molten interior is a second surface below the crust. A ray that
    // meets armour stops at it and never sees this; a ray that goes down a
    // crevasse reaches it and comes back carrying light. So the fractures glow
    // from underneath because they are actually open, not because anything was
    // painted into them.
    // Gated to rays that have actually got below the crust. Ungated it
    // accumulated against every surface in the frame, so the molten interior
    // bled through solid armour and the planet rendered as a glowing ball with
    // a shell drawn on it. Light only comes out of a fracture if the fracture
    // is open.
    float below = 1.0 - smoothstep(uRadius - 0.35, uRadius + 0.05, length(p));
    lava += near * below * exp(-abs(length(p) - uMoltenRadius) * uLavaDensity);

    // The aureole. Density gathered around the absence, falling off with
    // distance from its boundary — a volumetric brightening the arrangement
    // produces, not a ring anything was drawn along.
    halo += exp(-abs(core(p)) * uAureole) * near;

    if (d < 0.0006 * travelled) break;

    travelled += max(d * 0.62, 0.004);
    if (travelled > FAR) break;
  }

  float steps = float(uSteps);
  lit = lit / steps * uGlow;
  deep = deep / steps * uGlow;
  halo = halo / steps * uGlow;
  heat = heat / steps * uGlow * uHeat;
  lava = lava / steps * uGlow * uLava;

  // Amber carries the approved field. It desaturates as it brightens, so a
  // peak reads as hot rather than as gold — the difference between a form drawn
  // in light and one painted in metal.
  // Weighted hard toward the cavities. Spread evenly over every boundary the
  // emission lit every bump equally, which is exactly what made a recursive
  // solid read as a crust — light on all of it is light on none of it. Most of
  // the frame is meant to be black, with the field appearing where it is deep.
  // The broad proximity term is almost entirely suppressed. It accumulates
  // along every grazing boundary, so it traces the outline — which is what
  // drew a bright rim around the whole mass and made the silhouette the first
  // thing the eye found. Depth is allowed to glow; outlines are not.
  lit *= 0.35;
  vec3 colour = mix(uRecord, vec3(1.0, 0.97, 0.92), clamp(deep * 0.9, 0.0, 0.7)) * deep;
  colour += uRecord * lit * 0.1;
  colour += uRecord * halo * 0.6;
  colour += mix(uRecord, vec3(1.0, 0.86, 0.62), 0.5) * heat;

  // Hotter than the record's own light, and never a different hue family.
  // What is coming out of the cracks is amber because the light in a fracture
  // is a record of a state, not the state — the same thing the colour has
  // always meant here.
  colour += mix(uRecord, vec3(1.0, 0.72, 0.34), 0.75) * lava;

  // Attention.
  //
  // The field comes up to meet a pointer held over it. Gated by the structure
  // rather than added on top of it, so what brightens is whatever architecture
  // is actually there — a glow that ignored the field would be a torch shining
  // on a picture, and this has to read as the thing responding.
  //
  // Amber deepens at the centre of attention and the world's own cyan surfaces
  // at its edge, which is the observation model the site already runs on:
  // looking at something is the first step of it being recorded. Violet stays
  // out. It is the consequence colour and it is not spent on a hover.
  float attention = uHoverStrength *
    (1.0 - smoothstep(0.0, uHoverRadius, distance(ndc * vec2(aspect, 1.0), uHover * vec2(aspect, 1.0))));
  // Attention warms the cracks, and only the cracks.
  //
  // Weighted onto the residual heat rather than onto every lit surface. Spread
  // across all the structure it lifted whole cavities at once and the hovered
  // region became a blue-white mass with none of the dead star's material in
  // it — bright enough to measure as a success and wrong enough to destroy the
  // frame it was applied to. The fissures are what this object is; they are
  // what should answer.
  float structure = heat + deep * 0.25;
  colour += uRecord * structure * attention * uHoverGain;

  // Cyan is a hairline at the edge of attention, not a wash through it. It is
  // the world surfacing at the boundary of observation, and at this weight it
  // is a cool edge you notice rather than a light being shone on the object.
  float fringe = attention * (1.0 - attention) * 4.0;
  colour += uWorld * structure * fringe * uHoverFringe;

  fragColour = vec4(colour * uExposure, 1.0);
}
