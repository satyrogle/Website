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
uniform float uFissureScale;
uniform float uFissureDepth;
uniform float uHeat;

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

/**
 * The crazing on a cooled crust.
 *
 * Returns roughly 0 across the faces and rises toward 1 along the fissures.
 * The coordinate is warped before the sines are taken, so the zero set is an
 * irregular network instead of the axis-aligned lattice three multiplied sines
 * would otherwise give — a grid here would be a visible primitive by another
 * name, and that rule has outlived five carriers.
 */
float fissure(vec3 p) {
  vec3 w = p * uFissureScale;
  w += 0.75 * vec3(
    sin(w.y * 1.31 + 0.7),
    sin(w.z * 1.07 - 1.3),
    sin(w.x * 1.73 + 2.1)
  );
  float veins = abs(sin(w.x) * sin(w.y) * sin(w.z));
  return pow(1.0 - clamp(veins * 3.4, 0.0, 1.0), 3.0);
}

/**
 * The field.
 *
 * A large irregular mass with architecture carved out of it, at four scales,
 * each rotated on an axis the previous one does not share.
 *
 * The first version of this folded space nine times with a small contraction
 * and produced detail at exactly one scale — a uniform crust over a blobby
 * silhouette. Founder verdict: "this looks like a skin disease." He was right,
 * and it was the same fault as the choir wearing different material: texture
 * with no hierarchy. Uniform detail is noise whatever generates it.
 *
 * So the structure now has three reads, the way the composition always needed:
 *
 *   MACRO   an irregular silhouette from blended volumes and a domain warp,
 *           with a large absence subtracted from it
 *   MESO    openings, corridors and shafts cut clean through the mass by the
 *           first carve, at a scale you could walk through
 *   MICRO   the same cut repeated three times smaller each pass, so edges
 *           keep resolving into finer edges as the camera closes
 *
 * The carve is a cross-section subtraction — the operation that turns a solid
 * into architecture rather than into crust. It leaves flat faces, straight
 * edges and deep square shafts, which is where "impossible machine" and
 * "sacred architecture" come from; the rotations between passes are what stop
 * it from reading as a grid, and the warp is what stops the outer boundary
 * from reading as the primitive it started as.
 */
float field(vec3 p) {
  // Large-scale warp first, so everything after it is applied to space that is
  // already bent. Non-radial by construction: each component is driven by a
  // different pair of the others, so there is no centre to organise around.
  vec3 q = p;
  q += uWarp * vec3(
    sin(q.y * 0.31 + 1.7) * cos(q.z * 0.24 - 0.9),
    sin(q.z * 0.27 + 0.4) * cos(q.x * 0.21 + 2.1),
    sin(q.x * 0.23 + 2.9) * cos(q.y * 0.19 - 1.4)
  );

  // The mass. One body, not a heap.
  //
  // Two blended volumes with bites taken out of them read as rubble — the
  // outline had no intent behind it. A dead star is one thing that collapsed,
  // so this is a single slightly flattened spheroid, made irregular by the
  // warp rather than by being built out of parts, with one large break taken
  // out of it. Coherent, and still not nameable: the warp is strong enough
  // that no direction shows you an ellipse.
  float d = (length(q / vec3(3.25, 2.45, 2.85)) - 1.0) * 2.45;

  // The break. One deliberate loss, not a scatter of dents.
  float broken = (length((q - vec3(-3.4, 2.5, 2.1)) / vec3(2.9, 2.5, 2.7)) - 1.0) * 2.5;
  d = max(d, -broken);

  // Breathing lives in the carve's offset, so the architecture reorganises
  // very slightly rather than the whole form drifting. This is the only thing
  // moving in the approved state and it is meant to be barely detectable.
  float breath = uFoldOffset * 0.1 + uBreath * 0.012;

  vec3 axisA = normalize(vec3(0.41, 0.83, -0.37));
  vec3 axisB = normalize(vec3(-0.72, 0.28, 0.63));

  vec3 c = q;
  float s = uScale;

  for (int i = 0; i < ITERATIONS; i++) {
    float fi = float(i);

    // Rotated before every carve, on two axes that advance independently. A
    // carve repeated on fixed axes is a grid, and a grid is a visible
    // primitive by another name.
    c = turn(c, axisA, 0.5 + fi * 0.37);
    c = turn(c, axisB, -0.31 + fi * 0.213);
    c += breath;

    vec3 cell = mod(c * s, 2.0) - 1.0;
    s *= 3.0;

    vec3 r = abs(1.0 - 3.0 * abs(cell));
    float shaft = (min(min(max(r.x, r.y), max(r.y, r.z)), max(r.z, r.x)) - 1.0) / s;

    // Subtraction, not union. This is the whole difference between carving a
    // solid and encrusting one.
    d = max(d, shaft);
  }

  // The dead star's crazing.
  //
  // A crust that cooled and split. The pattern is a warped interference of
  // three sine families, so its zero set is a network of irregular fissures
  // rather than a lattice of planes — and the fissures cut *into* the mass,
  // which is why light gathers in them rather than sitting on them. What is
  // left glowing is residual heat in the cracks of something that has gone
  // out, which is the same statement the amber has always made: the light you
  // can see is a record of a state, not the state itself.
  d -= fissure(q) * uFissureDepth;

  return d;
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

    // Residual heat, gathered in the fissures only.
    heat += near * fissure(p);

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
