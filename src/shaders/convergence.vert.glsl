// ============================================================
//  Crowned Convergence — vertex stage
//
//  One shader serves every part of the entity. What differs between a
//  crown mass, a ring and the Latent Form is not the code path but the
//  uniforms the loader sets from the GLB's own extras: material class,
//  reaction weight, projection mode, stage window, yield vector.
//
//  Reaction sampling is per-role and deliberately so. The crown and the
//  Latent Form take a planar projection in object space normalised
//  against the authored exterior bounds; the rings and tunnel take
//  cylindrical coordinates around the travel axis. Both read the SAME
//  Gray-Scott texture — there is one field for the whole site and it is
//  never reseeded, so a disturbance made in the hero is still present
//  in the walls of the corridor and still present at the seam.
// ============================================================

precision highp float;

// RawShaderMaterial supplies no built-ins; every one of these has to be
// declared or the shader fails to link.
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;

in vec3 position;
in vec3 normal;

uniform sampler2D uField;
uniform float uTime;

// Authored exterior bounds, for planar sampling.
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
// Tunnel Y span, for cylindrical depth sampling.
uniform vec2 uTunnelSpan;

// 0 = planar (crown, Latent Form), 1 = cylindrical (rings, tunnel),
// 2 = none (halo).
uniform float uProjection;
uniform float uReaction;
uniform float uDisplace;

// Yield: how far this part has opened, 0..1, and its authored vector.
uniform float uYield;
uniform vec3 uYieldTranslation;
uniform vec3 uYieldRotation;
uniform float uYieldSpin;

out vec3 vWorldPos;
out vec3 vObjectPos;
out vec3 vNormal;
out vec3 vViewDir;
out vec2 vFieldUv;
out float vField;

vec3 rotateEuler(vec3 p, vec3 e) {
  float cx = cos(e.x), sx = sin(e.x);
  float cy = cos(e.y), sy = sin(e.y);
  float cz = cos(e.z), sz = sin(e.z);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  p = vec3(cz * p.x - sz * p.y, sz * p.x + cz * p.y, p.z);
  return p;
}

vec2 fieldCoords(vec3 objectPos) {
  if (uProjection > 1.5) {
    return vec2(0.5);
  }
  if (uProjection > 0.5) {
    // Cylindrical: angle around the travel axis, and normalised depth
    // along it. The depth phase offset keeps the corridor from reading
    // as one repeated band without needing a second simulation.
    float angle = atan(objectPos.z, objectPos.x);
    float depth = (objectPos.y - uTunnelSpan.x)
                / max(uTunnelSpan.y - uTunnelSpan.x, 0.001);
    return vec2(
      fract(angle / 6.2831853 + 0.5),
      fract(depth * 0.85 + 0.12)
    );
  }
  // Planar: X/Z against the authored exterior bounds.
  vec3 span = max(uBoundsMax - uBoundsMin, vec3(0.001));
  return clamp(
    vec2(
      (objectPos.x - uBoundsMin.x) / span.x,
      (objectPos.z - uBoundsMin.z) / span.z
    ),
    0.001, 0.999
  );
}

void main() {
  vec3 pos = position;

  // The yield. Rotation is applied about the part's own origin, which
  // the Blender build placed at each mass's centre, so a mass turns in
  // place rather than swinging about the entity axis.
  if (uYield > 0.0001) {
    pos = rotateEuler(pos, uYieldRotation * uYield);
    pos += uYieldTranslation * uYield;
    if (abs(uYieldSpin) > 0.0001) {
      float a = uYieldSpin * uYield;
      float c = cos(a), s = sin(a);
      pos = vec3(c * pos.x - s * pos.z, pos.y, s * pos.x + c * pos.z);
    }
  }

  vec2 uv = fieldCoords(position);
  float b = texture(uField, uv).g;

  // Very small displacement — the directive allows the field to move
  // the surface, but only barely. Anything larger reads as wobble.
  vec3 n = normalize(normal);
  pos += n * (b - 0.35) * uDisplace * uReaction;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;
  vObjectPos = position;
  vNormal = normalize(normalMatrix * n);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vFieldUv = uv;
  vField = b;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
