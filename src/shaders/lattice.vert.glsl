// ============================================================
//  Entity vertex stage — v7: the crowned convergence
//
//  Geometry roles (aKind): 0 = crown slab, 1 = tunnel ring,
//  2 = gyre ring, 3 = core (aShell 1 = kernel).
//
//  The near crown (aGate 0) YIELDS as uRip rises: each slab hinges
//  about its own centre (aCenter), flaring outward and toward the
//  camera on a per-slab stagger, so the mouth opens like a slow
//  iris of debris — never like a pair of doors. The far crown
//  (aGate 99) is the same build mirrored and never moves.
//
//  The kite-door swing this replaces put two flat leaves through
//  the lens at grazing angles — the unkillable "white door". No
//  piece here ever presents a face to the camera at close range:
//  the slabs recede radially out of the rail's way.
// ============================================================

precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;

in vec3 position;
in vec3 normal;

uniform sampler2D uField;
uniform float uFieldExtent;
uniform float uDisplace;
uniform float uTime;
uniform float uFarZ;

// Per-layer separation (tunnel ring thirds), driven by the director.
uniform vec3 uLayerOffset0;
uniform vec3 uLayerOffset1;
uniform vec3 uLayerOffset2;
uniform vec3 uLayerFocus;

// Crown state: 0 sealed, 1 fully yielded. Only gate 0 responds.
uniform float uRip;
// Gyre activity: how hard the nested rings turn against each other.
uniform float uGyre;

in float aLayer;
in float aSeed;
in float aKind;
in float aShell;
in float aGate;
in vec3 aCenter;

out vec3 vWorldPos;
out vec3 vLocalPos;
out vec3 vNormal;
out vec3 vViewDir;
out vec2 vFieldUv;
out float vField;
out float vFocus;
out float vSeed;
out float vKind;
out float vShell;
out float vGate;

// Kernel centre, gate-local. Keep in step with KERNEL_Z in
// LatticeModel.ts.
const vec3 KERNEL = vec3(0.0, 0.0, -2.02);

vec2 fieldUv(vec3 objectPos) {
  return objectPos.xy / uFieldExtent * 0.5 + 0.5;
}

// Cheap 2D value noise for the tunnel's organic undulation.
float vhash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = vhash(i);
  float b = vhash(i + vec2(1.0, 0.0));
  float c = vhash(i + vec2(0.0, 1.0));
  float d = vhash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 rotZ(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

// Rodrigues rotation about a unit axis.
vec3 rotAxis(vec3 p, vec3 ax, float a) {
  float c = cos(a);
  float s = sin(a);
  return p * c + cross(ax, p) * s + ax * dot(ax, p) * (1.0 - c);
}

void main() {
  int layer = int(aLayer + 0.5);
  vec3 offset = layer == 0 ? uLayerOffset0 : (layer == 1 ? uLayerOffset1 : uLayerOffset2);
  float focus = layer == 0 ? uLayerFocus.x : (layer == 1 ? uLayerFocus.y : uLayerFocus.z);

  float isFar = step(50.0, aGate);
  float isRing = step(0.5, aKind) * (1.0 - step(1.5, aKind));

  // ---- Into gate-local space --------------------------------------
  // The far crown is baked mirrored (rotateY(pi)) and translated to
  // uFarZ. Undo that here so one choreography serves both gates, then
  // reapply on the way out.
  vec3 p = position;
  vec3 c = aCenter;
  vec3 n = normal;
  if (isFar > 0.5) {
    p.z -= uFarZ;
    p.xz = -p.xz;
    c.z -= uFarZ;
    c.xz = -c.xz;
    n.xz = -n.xz;
  }

  // Only the near crown yields. uRip arrives already eased.
  float open = (1.0 - isFar) * uRip;

  if (isRing < 0.5) {
    // Dormant drift: the whole entity turns almost imperceptibly.
    // "Silent. Almost still. Waiting."
    float drift = uTime * 0.008;
    p = rotZ(p, drift);
    c = rotZ(c, drift);
    n = rotZ(n, drift);
  }

  if (aKind < 0.5) {
    // ---- CROWN SLAB: the TEAR -------------------------------------
    // Each plate waits its own beat then SNAPS over a short window —
    // the crown is torn open, not bloomed open. The snap carries a
    // tangential shear (the plates wrench sideways as the seams give)
    // on top of the hinge and the radial throw. Infill shards
    // (aShell 1) rip on a slightly later, faster schedule than their
    // majors — the small pieces give last.
    float delay = fract(aSeed * 7.31) * 0.42 + aShell * 0.12;
    float o = smoothstep(delay, delay + 0.24, open);
    vec2 rdir = normalize(c.xy + vec2(1e-4, 0.0));
    vec3 tangent = vec3(-rdir.y, rdir.x, 0.0);
    float lean = o * (0.5 + fract(aSeed * 3.7) * 0.45);
    float shear = o * (fract(aSeed * 9.17) - 0.5) * 0.7;
    vec3 rel = p - c;
    rel = rotAxis(rel, tangent, -lean);
    rel = rotZ(rel, shear);
    n = rotAxis(n, tangent, -lean);
    n = rotZ(n, shear);
    p = c + rel;
    p.xy += rdir * o * (1.7 + fract(aSeed * 5.3) * 0.9);
    p.z += o * 0.4;
  } else if (aKind > 1.5 && aKind < 2.5) {
    // ---- GYRE RING: rings turning against each other ---------------
    // Alternating direction, inner rings faster. uGyre is the pull:
    // dormant they creep; as the visitor closes they spin up.
    float k = aShell;
    float dirn = mix(1.0, -1.0, mod(k, 2.0));
    float a = dirn * uTime * (0.05 + k * 0.028) * uGyre;
    p = rotZ(p, a);
    n = rotZ(n, a);
    // The throat widens with the yield so the rail has clean air.
    p.xy *= 1.0 + open * (0.14 + k * 0.06);
  } else if (aKind > 2.5) {
    if (aShell > 0.5) {
      // ---- KERNEL: the light that withdraws ------------------------
      // As the crown yields, the burning point collapses toward
      // nothing — the eye retreats down the corridor, and meeting it
      // again is the finale. The far kernel never moves.
      float shrink = 1.0 - smoothstep(0.5, 0.95, open);
      p = KERNEL + (p - KERNEL) * shrink;
    } else {
      // ---- PUPIL SHARD: the second iris ---------------------------
      // The pupil ring drifts against the gyres and parts late, after
      // the crown is already open — depth revealed innermost last.
      float a = -uTime * 0.03 * uGyre;
      p = rotZ(p, a);
      c = rotZ(c, a);
      n = rotZ(n, a);
      float o = smoothstep(0.35, 0.9, open);
      vec2 rdir = normalize(c.xy + vec2(1e-4, 0.0));
      p.xy += rdir * o * 1.6;
    }
  }

  // ---- Back to baked space ----------------------------------------
  if (isFar > 0.5) {
    p.xz = -p.xz;
    p.z += uFarZ;
    n.xz = -n.xz;
  }

  // Field sampled from the undisplaced position: the pattern belongs
  // to the structure, not to wherever the structure has moved.
  vec2 fuv = fieldUv(position);
  float b = texture(uField, fuv).g;

  if (isRing > 0.5) {
    // ---- The living bore -------------------------------------------
    // The tunnel is the inside of the entity, and the entity is alive:
    // a slow travelling undulation displaces the ring surfaces along
    // their normals, melting the octagonal architecture into an
    // organic gullet. Peristalsis, not machinery. The pattern samples
    // the undisplaced position, so the veins stay glued to the flesh.
    // Sampled on the unit circle (not raw phi) so the noise is
    // continuous across the angular wrap — a phi coordinate tears a
    // hairline crack where the duplicated seam vertices disagree.
    float phi = atan(position.y, position.x);
    float und = vnoise(vec2(
      cos(phi) * 1.5 + uTime * 0.1,
      sin(phi) * 1.5 + position.z * 0.6 - uTime * 0.16
    ));
    p += n * (und * 2.0 - 1.0) * 0.16;
  }

  // Near-imperceptible breathing so nothing ever reads as a still.
  float breathe = sin(uTime * 0.3 + aSeed * 6.2831) * 0.5 + 0.5;
  p += n * breathe * uDisplace;

  p += offset;

  vec4 worldPos = modelMatrix * vec4(p, 1.0);

  vWorldPos = worldPos.xyz;
  // Object-space position, pre-offset: the trip pattern rides this, so
  // it stays glued to each ring even while the thirds separate.
  vLocalPos = position;
  vNormal = normalize(mat3(modelMatrix) * n);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vFieldUv = fuv;
  vField = b;
  vFocus = focus;
  vSeed = aSeed;
  vKind = aKind;
  vShell = aShell;
  vGate = aGate;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
