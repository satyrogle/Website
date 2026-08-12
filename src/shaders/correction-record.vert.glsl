// The record: the floor of the approved tolerance band, baked once from u*.
//
// It sits ε below where the world was recorded, so at rest the world covers it
// completely and it renders nothing at all — agreement is invisible, which is
// the law. It becomes visible only where the world has fallen out of the band,
// and what you then see is the file itself, exposed.

out vec3 vNormal;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
