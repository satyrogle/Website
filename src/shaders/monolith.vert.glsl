// Dark Lattice monolith — vertex stage.
//
// One shader serves every part. What differs between an outer mass, a
// tunnel rib and the latent core arrives as uniforms the loader reads
// from the GLB's own extras: material class, reaction weight, projection
// mode and open vector.

precision highp float;

// RawShaderMaterial supplies no built-ins.
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;

in vec3 position;
in vec3 normal;

uniform sampler2D uField;
uniform float uTime;

uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
// Tunnel depth span, near (largest z) then far.
uniform vec2 uTunnelSpan;
// 0 = planar, 1 = cylindrical, 2 = none.
uniform float uProjection;
uniform float uReaction;
uniform float uDisplace;
uniform float uSeed;

// Tectonic opening: 0 closed, 1 open, with the mass's authored vector.
uniform float uOpen;
uniform vec3 uOpenTranslation;
uniform vec3 uOpenRotation;

out vec3 vWorldPos;
out vec3 vSurfacePos;
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

// Sampled against the REST world position, so a mass that opens carries
// its pattern with it instead of swimming through a fixed projection.
vec2 fieldCoords(vec3 worldRest) {
  if (uProjection > 1.5) {
    return vec2(fract(atan(worldRest.y, worldRest.x) / 6.2831853 + 0.5), 0.5);
  }
  if (uProjection > 0.5) {
    float angle = atan(worldRest.y, worldRest.x);
    float depth = (worldRest.z - uTunnelSpan.x)
                / max(uTunnelSpan.y - uTunnelSpan.x, 0.001);
    return vec2(fract(angle / 6.2831853 + 0.5), clamp(depth, 0.001, 0.999));
  }
  vec3 span = max(uBoundsMax - uBoundsMin, vec3(0.001));
  return clamp(
    vec2((worldRest.x - uBoundsMin.x) / span.x, (worldRest.y - uBoundsMin.y) / span.y),
    0.001, 0.999
  );
}

void main() {
  vec3 pos = position;

  // Rotation is about the part's own origin — the asset centres every
  // mesh on its own bounds — so a mass turns in place.
  if (uOpen > 0.0001) {
    pos = rotateEuler(pos, uOpenRotation * uOpen);
    pos += uOpenTranslation * uOpen;
  }

  vec3 restWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 uv = fieldCoords(restWorld);
  float b = texture(uField, uv).g;

  vec3 n = normalize(normal);
  // Pressure, not wobble: the surface answers the field by a fraction of
  // a centimetre and nothing else moves.
  pos += n * (b - 0.35) * uDisplace * uReaction;
  pos *= 1.0 + sin(uTime * 0.21 + uSeed * 6.28) * 0.0022;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;
  vSurfacePos = restWorld - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vFieldUv = uv;
  vField = b;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
