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
uniform float uAureole;
uniform float uGlow;
uniform float uDensity;
uniform float uExposure;

out vec4 fragColour;

const int ITERATIONS = 9;
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
 * The field.
 *
 * Iterated folding: mirror, rotate, scale, translate. Each pass multiplies the
 * detail already present, so structure appears at every scale the ray can
 * resolve and keeps appearing as the camera closes — recursion the eye reads as
 * impossible depth rather than as a fractal demo.
 *
 * Every fold is offset before the mirror. A bare `abs()` folds about the origin
 * and leaves mirror planes through the middle of the form, which is how this
 * kind of field becomes kaleidoscopic — and a kaleidoscope resolves into
 * concentric arcs from exactly one camera angle, which is the failure this
 * project has died of four times.
 */
float field(vec3 p) {
  // Large-scale warp first, so the recursion is applied to space that is
  // already bent. Non-radial by construction: each component is driven by a
  // different pair of the others, so there is no centre for it to organise
  // itself around.
  vec3 q = p;
  q += uWarp * vec3(
    sin(q.y * 0.31 + 1.7) * cos(q.z * 0.24 - 0.9),
    sin(q.z * 0.27 + 0.4) * cos(q.x * 0.21 + 2.1),
    sin(q.x * 0.23 + 2.9) * cos(q.y * 0.19 - 1.4)
  );

  // Breathing lives in the fold offset rather than in any position, so the
  // whole form reorganises very slightly instead of drifting. This is the only
  // thing moving in the approved state and it is meant to be barely detectable.
  float breath = uFoldOffset + uBreath * 0.045;

  float scale = 1.0;
  vec3 axisA = normalize(vec3(0.41, 0.83, -0.37));
  vec3 axisB = normalize(vec3(-0.72, 0.28, 0.63));

  for (int i = 0; i < ITERATIONS; i++) {
    float fi = float(i);

    // Offset, then mirror. The offset is what keeps the mirror planes off the
    // centre and out of alignment with each other.
    vec3 shift = vec3(breath, breath * 0.72 + 0.11, breath * 1.31 - 0.07);
    q = abs(q + shift) - shift;

    // Two rotations on unrelated axes, advancing per iteration so no two passes
    // fold the same way.
    q = turn(q, axisA, 0.62 + fi * 0.191);
    q = turn(q, axisB, 0.37 - fi * 0.127);

    q = q * uScale;
    scale *= uScale;

    q -= vec3(0.87, 0.34, -0.55) * (1.0 + fi * 0.06);
  }

  // A rounded box at the end of the recursion. What it was matters less than
  // that it is small: by this depth the fold has carried it into structure that
  // no longer resembles the primitive it started as.
  vec3 b = abs(q) - uBox;
  float d = (length(max(b, 0.0)) + min(max(b.x, max(b.y, b.z)), 0.0) - uRound) / scale;

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

  // Amber carries the approved field. It desaturates as it brightens, so a
  // peak reads as hot rather than as gold — the difference between a form drawn
  // in light and one painted in metal.
  vec3 colour = mix(uRecord, vec3(1.0, 0.97, 0.92), clamp(lit * 0.7, 0.0, 0.65)) * lit;
  colour += uRecord * halo * 0.75;
  colour += uRecord * deep * 0.35;

  // Cyan and violet are wired and currently carry nothing: the deviation field
  // is not attached yet, and a colour grammar that lit up before the mechanism
  // existed would be decoration claiming to be state.
  colour += uWorld * 0.0;
  colour += uConsequence * 0.0;

  fragColour = vec4(colour * uExposure, 1.0);
}
