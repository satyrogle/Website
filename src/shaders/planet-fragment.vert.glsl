// One fragment of the ruptured world.
//
// The mesh is authored: real crustal relief, real thickness, real break faces
// with cross-sections. Nothing here generates form — the vertex stage only
// places the piece and hands the fragment stage the one attribute that matters.
//
// `color` is the mark baked in Blender: r crust, g temperature, b altitude —
// see the fragment stage. Every lighting decision downstream keys off it,
// which is how the exterior stays nearly black while the fractures burn.

uniform vec3 uStarPos;

// `color` is not declared here: Three injects it when the material sets
// vertexColors, and declaring it again is a redefinition that fails the whole
// program — which renders the world invisible while the star behind it keeps
// drawing, so the frame looks merely dark rather than broken. Widened through
// a vec4 constructor so the program survives either attribute width.

out vec4 vMark;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec3 vView;

void main() {
  vMark = vec4(vec3(color).rgb, 1.0);
  vLocal = position;

  // The ejecta tier is instanced; the hero fragments are not. Same material,
  // both paths, or the small debris would need a second shader to drift out
  // of sync with.
  #ifdef USE_INSTANCING
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  #else
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
  #endif

  vWorld = world.xyz;
  vView = normalize(cameraPosition - world.xyz);

  gl_Position = projectionMatrix * viewMatrix * world;
}
