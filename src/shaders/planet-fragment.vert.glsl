// One fragment of the ruptured world.
//
// The mesh is authored: real crustal relief, real thickness, real break faces
// with cross-sections. Nothing here generates form — the vertex stage only
// places the piece and hands the fragment stage the one attribute that matters.
//
// `color.r` is the crust mark baked in Blender: 1 on the original planetary
// surface, 0 on a face made by the break. Every lighting decision downstream
// keys off it, which is how the exterior stays nearly black while the
// fractures burn.

uniform vec3 uStarPos;

// `color` is not declared here: Three injects it when the material sets
// vertexColors, and declaring it again is a redefinition that fails the whole
// program — which renders the world invisible while the star behind it keeps
// drawing, so the frame looks merely dark rather than broken.

out float vCrust;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec3 vView;

void main() {
  vCrust = color.r;
  vLocal = position;

  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);

  gl_Position = projectionMatrix * viewMatrix * world;
}
