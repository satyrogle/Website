// Particulate — the air the entity hangs in.
//
// One point per mote, drifting on its own slow path. The drift is
// derived from the mote's own seed rather than animated on the CPU, so
// a few thousand of them cost one draw call and no per-frame work.

precision highp float;

in vec3 position;
/** x: seed, y: brightness bias, z: drift rate. */
in vec3 aMote;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
/** Rises with the cold open so the air arrives with the entity. */
uniform float uWake;

out float vBright;

void main() {
  float seed = aMote.x;

  // A slow, unsynchronised wander. Three different rates so no two
  // motes ever travel together — a shared rate reads as a sheet of
  // rain, which is exactly the tell that this is a particle system.
  vec3 drift = vec3(
    sin(uTime * 0.041 * aMote.z + seed * 6.283),
    cos(uTime * 0.033 * aMote.z + seed * 4.712),
    sin(uTime * 0.027 * aMote.z + seed * 2.094)
  ) * 0.42;

  vec4 mv = modelViewMatrix * vec4(position + drift, 1.0);
  float dist = max(-mv.z, 0.001);

  // Fade OUT the ones nearest the lens. A mote a few centimetres from
  // the camera becomes a dinner plate of bloom and reads as a smudge on
  // the screen rather than as something in the world.
  float near = smoothstep(0.6, 4.0, dist);
  // And fade the far ones, so the volume has an edge instead of ending
  // at a hard boundary the eye can find.
  float far = 1.0 - smoothstep(26.0, 44.0, dist);

  vBright = aMote.y * near * far * uWake;

  gl_Position = projectionMatrix * mv;
  // Perspective size attenuation, floored so distant motes stay at
  // least a pixel instead of shimmering in and out between frames.
  gl_PointSize = max(uSize * uPixelRatio / dist, 1.0);
}
