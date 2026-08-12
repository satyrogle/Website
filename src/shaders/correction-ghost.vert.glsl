// The record. Static geometry baked at p₀ + u* · n̂ — the approved rest state,
// exactly as it was captured at the end of warm-up. It does not move, because
// a record that moved would not be a record.

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
