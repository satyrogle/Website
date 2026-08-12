// A screen-filling triangle. The hero is marched per pixel, so the only job
// here is to cover the frame once with no seam down the middle and no vertex
// transform worth doing — the camera is passed to the fragment stage as a basis
// rather than as a projection matrix.

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
