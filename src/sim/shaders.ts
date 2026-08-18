/**
 * All GLSL for the world. GLSL ES 3.00 via RawShaderMaterial with
 * glslVersion: THREE.GLSL3 (three prepends the #version line).
 *
 * Rules observed throughout:
 * - textureLod everywhere a specific mip is meant; no implicit lod.
 * - no pow() anywhere; specular lobes are exp-shaped so a zero base can
 *   never produce NaN (the SwiftShader lesson).
 * - all per-agent randomness is an integer hash of (id, tick, seed):
 *   seeded, replayable in the tested environment.
 */

const HASH = /* glsl */ '\n' +
  'uint pcg(uint v) {\n' +
  '  v = v * 747796405u + 2891336453u;\n' +
  '  uint w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;\n' +
  '  return (w >> 22u) ^ w;\n' +
  '}\n' +
  'float rnd(uint a, uint b, uint c) {\n' +
  '  return float(pcg(a ^ pcg(b ^ pcg(c)))) * (1.0 / 4294967295.0);\n' +
  '}\n';

/** Fullscreen triangle vertex shader (positions supplied in clip space). */
export const FSQ_VERT = /* glsl */ '\n' +
  'in vec3 position;\n' +
  'out vec2 vUv;\n' +
  'void main() {\n' +
  '  vUv = position.xy * 0.5 + 0.5;\n' +
  '  gl_Position = vec4(position.xy, 0.0, 1.0);\n' +
  '}\n';

/** Straight copy, used to seed render targets from data textures. */
export const COPY_FRAG = /* glsl */ '\n' +
  'precision highp float;\n' +
  'precision highp sampler2D;\n' +
  'uniform sampler2D uSrc;\n' +
  'in vec2 vUv;\n' +
  'out vec4 outColor;\n' +
  'void main() { outColor = textureLod(uSrc, vUv, 0.0); }\n';

/**
 * Agent update. One texel per agent: xy position in world uv,
 * z heading, w spare. Transport-network dynamics: sense three points
 * ahead, turn toward strength, move, wrap.
 * Beacon w carries the gaussian falloff coefficient; 0 means removed.
 */
export const AGENT_UPDATE_FRAG = /* glsl */ '\n' +
  'precision highp float;\n' +
  'precision highp sampler2D;\n' +
  'uniform sampler2D uAgents;\n' +
  'uniform sampler2D uTrail;\n' +
  'uniform vec4 uBeacons[24];\n' +
  'uniform int uBeaconCount;\n' +
  'uniform int uTick;\n' +
  'uniform int uSeed;\n' +
  'uniform float uSensorDist;\n' +
  'uniform float uSensorAngle;\n' +
  'uniform float uTurnRate;\n' +
  'uniform float uSpeed;\n' +
  'in vec2 vUv;\n' +
  'out vec4 outAgent;\n' +
  HASH +
  'float attract(vec2 p) {\n' +
  '  float a = 0.0;\n' +
  '  for (int i = 0; i < 24; i++) {\n' +
  '    if (i >= uBeaconCount) break;\n' +
  '    vec4 b = uBeacons[i];\n' +
  '    if (b.w < 1.0) continue;\n' +
  '    vec2 d = p - b.xy;\n' +
  '    a += b.z * exp(-dot(d, d) * b.w);\n' +
  '  }\n' +
  '  return a;\n' +
  '}\n' +
  'float sense(vec2 p) {\n' +
  '  vec2 q = fract(p + 1.0);\n' +
  '  return textureLod(uTrail, q, 0.0).r + attract(q) * 2.2;\n' +
  '}\n' +
  'void main() {\n' +
  '  ivec2 ts = textureSize(uAgents, 0);\n' +
  '  uint id = uint(gl_FragCoord.y) * uint(ts.x) + uint(gl_FragCoord.x);\n' +
  '  uint tick = uint(uTick);\n' +
  '  uint seed = uint(uSeed);\n' +
  '  vec4 a = textureLod(uAgents, vUv, 0.0);\n' +
  '  vec2 pos = a.xy;\n' +
  '  float ang = a.z;\n' +
  '  vec2 fd = vec2(cos(ang), sin(ang));\n' +
  '  vec2 ld = vec2(cos(ang + uSensorAngle), sin(ang + uSensorAngle));\n' +
  '  vec2 rd = vec2(cos(ang - uSensorAngle), sin(ang - uSensorAngle));\n' +
  '  float sf = sense(pos + fd * uSensorDist);\n' +
  '  float sl = sense(pos + ld * uSensorDist);\n' +
  '  float sr = sense(pos + rd * uSensorDist);\n' +
  '  float j = rnd(id, tick, seed) - 0.5;\n' +
  '  if (sf >= sl && sf >= sr) {\n' +
  '    ang += j * 0.2;\n' +
  '  } else if (sl > sr) {\n' +
  '    ang += uTurnRate * (0.75 + 0.5 * rnd(id, tick, seed ^ 391u));\n' +
  '  } else if (sr > sl) {\n' +
  '    ang -= uTurnRate * (0.75 + 0.5 * rnd(id, tick, seed ^ 761u));\n' +
  '  } else {\n' +
  '    ang += (rnd(id, tick, seed ^ 977u) - 0.5) * 2.0 * uTurnRate;\n' +
  '  }\n' +
  '  pos += vec2(cos(ang), sin(ang)) * uSpeed;\n' +
  '  pos = fract(pos + 1.0);\n' +
  '  outAgent = vec4(pos, ang, a.w);\n' +
  '}\n';

/** Deposit: every agent stamps one texel of trail, additively. */
export const DEPOSIT_VERT = /* glsl */ '\n' +
  'precision highp float;\n' +
  'precision highp sampler2D;\n' +
  'in vec2 ref;\n' +
  'uniform sampler2D uAgents;\n' +
  'void main() {\n' +
  '  vec4 a = texture(uAgents, ref);\n' +
  '  gl_Position = vec4(a.xy * 2.0 - 1.0, 0.0, 1.0);\n' +
  '  gl_PointSize = 1.0;\n' +
  '}\n';

export const DEPOSIT_FRAG = /* glsl */ '\n' +
  'precision highp float;\n' +
  'uniform float uDeposit;\n' +
  'out vec4 outColor;\n' +
  'void main() { outColor = vec4(uDeposit, 0.0, 0.0, 1.0); }\n';

/** 3x3 box diffusion with decay: the trail relaxes, routes persist. */
export const DIFFUSE_FRAG = /* glsl */ '\n' +
  'precision highp float;\n' +
  'precision highp sampler2D;\n' +
  'uniform sampler2D uTrail;\n' +
  'uniform float uDecay;\n' +
  'in vec2 vUv;\n' +
  'out vec4 outColor;\n' +
  'void main() {\n' +
  '  vec2 px = 1.0 / vec2(textureSize(uTrail, 0));\n' +
  '  float s = 0.0;\n' +
  '  for (int y = -1; y <= 1; y++) {\n' +
  '    for (int x = -1; x <= 1; x++) {\n' +
  '      s += textureLod(uTrail, vUv + vec2(float(x), float(y)) * px, 0.0).r;\n' +
  '    }\n' +
  '  }\n' +
  '  outColor = vec4((s / 9.0) * uDecay, 0.0, 0.0, 1.0);\n' +
  '}\n';

/** One visitor press stamped straight into the trail: instant consequence. */
export const STAMP_VERT = /* glsl */ '\n' +
  'in vec3 position;\n' +
  'uniform vec2 uPos;\n' +
  'uniform float uSize;\n' +
  'void main() {\n' +
  '  gl_Position = vec4(uPos * 2.0 - 1.0, 0.0, 1.0);\n' +
  '  gl_PointSize = uSize;\n' +
  '}\n';

export const STAMP_FRAG = /* glsl */ '\n' +
  'precision highp float;\n' +
  'uniform float uAmount;\n' +
  'out vec4 outColor;\n' +
  'void main() {\n' +
  '  vec2 d = gl_PointCoord - 0.5;\n' +
  '  float fall = exp(-dot(d, d) * 14.0);\n' +
  '  outColor = vec4(uAmount * fall, 0.0, 0.0, 1.0);\n' +
  '}\n';

/** Downsample of the trail for CPU health reads (starvation law). */
export const HEALTH_FRAG = /* glsl */ '\n' +
  'precision highp float;\n' +
  'precision highp sampler2D;\n' +
  'uniform sampler2D uTrail;\n' +
  'in vec2 vUv;\n' +
  'out vec4 outColor;\n' +
  'void main() {\n' +
  '  outColor = vec4(textureLod(uTrail, vUv, 4.0).r, 0.0, 0.0, 1.0);\n' +
  '}\n';

/**
 * Present: the observation of the world.
 *
 * The trail is treated as a height field and lit: one cool key light,
 * exp-shaped specular, valleys occluded. Two parallax layers sit behind
 * the main reading, biased toward the world centre so travel produces
 * true depth. Bloom is a weighted stack of four mips. Severity regrades
 * the same data: the world never changes for the camera, only the
 * reading does. uFlat kills glow, atmosphere, grain and pulse so the
 * static frame can be judged on silhouette and value alone.
 */
export const PRESENT_FRAG = /* glsl */ '\n' +
  'precision highp float;\n' +
  'precision highp sampler2D;\n' +
  'uniform sampler2D uTrail;\n' +
  'uniform vec2 uCenter;\n' +
  'uniform vec2 uWin;\n' +
  'uniform float uSeverity;\n' +
  'uniform float uExposure;\n' +
  'uniform float uGlow;\n' +
  'uniform float uTime;\n' +
  'uniform vec4 uPulse;\n' +
  'uniform float uFlat;\n' +
  'uniform float uZoom;\n' +
  'in vec2 vUv;\n' +
  'out vec4 outColor;\n' +
  HASH +
  'float vnoise(vec2 p) {\n' +
  '  vec2 i = floor(p);\n' +
  '  vec2 f = fract(p);\n' +
  '  vec2 u = f * f * (3.0 - 2.0 * f);\n' +
  '  uint xa = uint(int(i.x) + 4096);\n' +
  '  uint ya = uint(int(i.y) + 4096);\n' +
  '  float a = rnd(xa, ya, 71u);\n' +
  '  float b = rnd(xa + 1u, ya, 71u);\n' +
  '  float c = rnd(xa, ya + 1u, 71u);\n' +
  '  float d = rnd(xa + 1u, ya + 1u, 71u);\n' +
  '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);\n' +
  '}\n' +
  'float fbm(vec2 p) {\n' +
  '  float v = 0.0;\n' +
  '  float amp = 0.5;\n' +
  '  for (int i = 0; i < 4; i++) {\n' +
  '    v += amp * vnoise(p);\n' +
  '    p = p * 2.03 + vec2(17.1, 9.7);\n' +
  '    amp *= 0.5;\n' +
  '  }\n' +
  '  return v;\n' +
  '}\n' +
  'float tone(float d, float e) { return 1.0 - exp(-d * e); }\n' +
  '// close in, sample the height field from softer mips so the texel\n' +
  '// grid never reaches the lighting\n' +
  'float gZt = 0.0;\n' +
  'float hs(vec2 q) {\n' +
  '  return log2(1.0 + textureLod(uTrail, clamp(q, 0.0, 1.0), 1.0 + gZt * 1.6).r);\n' +
  '}\n' +
  'vec3 ramp(float x, float sev) {\n' +
  '  vec3 cVoid = vec3(0.008, 0.012, 0.016);\n' +
  '  vec3 cDeepA = vec3(0.075, 0.13, 0.30);\n' +
  '  vec3 cDeepB = vec3(0.045, 0.085, 0.24);\n' +
  '  vec3 cDeep = mix(cDeepA, cDeepB, sev);\n' +
  '  vec3 cBone = vec3(0.914, 0.933, 0.949);\n' +
  '  vec3 cCher = vec3(0.337, 0.847, 1.0);\n' +
  '  vec3 cHigh = mix(cBone, cCher, sev * 0.45);\n' +
  '  vec3 cPeak = vec3(0.973, 0.984, 1.0);\n' +
  '  vec3 col = mix(cVoid, cDeep, smoothstep(0.0, 0.38, x));\n' +
  '  col = mix(col, cHigh, smoothstep(0.28, 0.78, x));\n' +
  '  col = mix(col, cPeak, smoothstep(0.82, 0.99, x));\n' +
  '  return col;\n' +
  '}\n' +
  'void main() {\n' +
  '  gZt = smoothstep(3.0, 8.0, uZoom);\n' +
  '  vec2 uvw = clamp(uCenter + (vUv - 0.5) * uWin, 0.0, 1.0);\n' +
  '  float d = textureLod(uTrail, uvw, 0.0).r;\n' +
  '  float x = tone(d, uExposure);\n' +
  '\n' +
  '  // material: the trail lit as a height field\n' +
  '  float e = 1.5 / 1024.0;\n' +
  '  float hL = hs(uvw - vec2(e, 0.0));\n' +
  '  float hR = hs(uvw + vec2(e, 0.0));\n' +
  '  float hD = hs(uvw - vec2(0.0, e));\n' +
  '  float hU = hs(uvw + vec2(0.0, e));\n' +
  '  vec3 n = normalize(vec3(hL - hR, hD - hU, e * (46.0 + gZt * 60.0)));\n' +
  '  vec3 L = normalize(vec3(-0.30, 0.62, 0.72));\n' +
  '  float diff = clamp(dot(n, L), 0.0, 1.0);\n' +
  '  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));\n' +
  '  float sdot = clamp(dot(n, H), 0.0, 1.0);\n' +
  '  float spec = exp((sdot - 1.0) * 26.0);\n' +
  '\n' +
  '  vec3 col = ramp(x, uSeverity) * (0.46 + 0.72 * diff);\n' +
  '  col += vec3(0.95, 0.985, 1.0) * spec * x * (0.75 - 0.35 * uSeverity);\n' +
  '\n' +
  '  // depth: two readings behind the main one, parallax toward centre\n' +
  '  vec2 cB1 = mix(vec2(0.5), uCenter, 0.82);\n' +
  '  vec2 cB2 = mix(vec2(0.5), uCenter, 0.62);\n' +
  '  float db1 = textureLod(uTrail, clamp(cB1 + (vUv - 0.5) * uWin * 1.45, 0.0, 1.0), 1.5).r;\n' +
  '  float db2 = textureLod(uTrail, clamp(cB2 + (vUv - 0.5) * uWin * 2.1, 0.0, 1.0), 3.0).r;\n' +
  '  float xb1 = tone(db1, uExposure * 0.6);\n' +
  '  float xb2 = tone(db2, uExposure * 0.45);\n' +
  '  float bw = 1.0 - 0.6 * gZt;\n' +
  '  col += ramp(xb1, uSeverity) * vec3(0.62, 0.70, 0.86) * 0.22 * bw * (1.0 - x);\n' +
  '  col += ramp(xb2, uSeverity) * vec3(0.45, 0.55, 0.80) * 0.12 * bw * (1.0 - x);\n' +
  '\n' +
  '  if (uFlat < 0.5) {\n' +
  '    // bloom: weighted mip stack over the main window\n' +
  '    float g2 = tone(textureLod(uTrail, uvw, 2.0).r, uExposure * 0.85);\n' +
  '    float g3 = tone(textureLod(uTrail, uvw, 3.0).r, uExposure * 0.85);\n' +
  '    float g4 = tone(textureLod(uTrail, uvw, 4.0).r, uExposure * 0.85);\n' +
  '    float g5 = tone(textureLod(uTrail, uvw, 5.0).r, uExposure * 0.85);\n' +
  '    float glow = mix(\n' +
  '      0.32 * g2 + 0.30 * g3 + 0.24 * g4 + 0.14 * g5,\n' +
  '      0.30 * g2 + 0.25 * g3,\n' +
  '      gZt\n' +
  '    );\n' +
  '    vec3 glowTint = mix(vec3(0.55, 0.72, 0.95), vec3(0.337, 0.847, 1.0), uSeverity);\n' +
  '    col += glowTint * glow * uGlow * 0.30;\n' +
  '\n' +
  '    // scattered light: the dark is rich, not empty\n' +
  '    float atm = fbm(uvw * 3.0 + vec2(fbm(uvw * 6.0 + uTime * 0.008)) * 0.7);\n' +
  '    col += vec3(0.10, 0.16, 0.32) * atm * mix(0.17, 0.055, uSeverity) * (1.0 - x);\n' +
  '\n' +
  '    // input causality: a brief swell of light where the visitor pressed\n' +
  '    float age = uTime - uPulse.z;\n' +
  '    if (uPulse.w > 0.0 && age >= 0.0 && age < 1.4) {\n' +
  '      vec2 dp = uvw - uPulse.xy;\n' +
  '      float swell = exp(-dot(dp, dp) * 900.0) * exp(-age * 2.6) * uPulse.w;\n' +
  '      col += vec3(0.91, 0.94, 0.97) * swell * 0.8;\n' +
  '    }\n' +
  '  }\n' +
  '\n' +
  '  float vig = 1.0 - 0.32 * smoothstep(0.45, 1.05, length(vUv - 0.5) * 1.45);\n' +
  '  col *= vig;\n' +
  '\n' +
  '  if (uFlat < 0.5) {\n' +
  '    float g = rnd(uint(gl_FragCoord.x), uint(gl_FragCoord.y), uint(uTime * 60.0)) - 0.5;\n' +
  '    col += g * 0.013;\n' +
  '  }\n' +
  '\n' +
  '  col = col / (1.0 + col * 0.22);\n' +
  '  outColor = vec4(max(col, 0.0), 1.0);\n' +
  '}\n';

/**
 * Micro revelation: the agents themselves, visible only close in.
 * Each is an oriented streak along its own heading: grains in transit,
 * not decoration.
 */
export const AGENT_POINTS_VERT = /* glsl */ '\n' +
  'precision highp float;\n' +
  'precision highp sampler2D;\n' +
  'in vec2 ref;\n' +
  'uniform sampler2D uAgents;\n' +
  'uniform vec2 uCenter;\n' +
  'uniform vec2 uWin;\n' +
  'uniform float uPointSize;\n' +
  'out vec2 vDir;\n' +
  'void main() {\n' +
  '  vec4 a = texture(uAgents, ref);\n' +
  '  vec2 w = (a.xy - uCenter) / uWin;\n' +
  '  gl_Position = vec4(w * 2.0, 0.0, 1.0);\n' +
  '  gl_PointSize = uPointSize;\n' +
  '  vDir = vec2(cos(a.z), sin(a.z));\n' +
  '}\n';

export const AGENT_POINTS_FRAG = /* glsl */ '\n' +
  'precision highp float;\n' +
  'uniform float uOpacity;\n' +
  'uniform float uSeverity;\n' +
  'in vec2 vDir;\n' +
  'out vec4 outColor;\n' +
  'void main() {\n' +
  '  vec2 p = gl_PointCoord - 0.5;\n' +
  '  p.y = -p.y;\n' +
  '  float along = dot(p, vDir);\n' +
  '  float across = dot(p, vec2(-vDir.y, vDir.x));\n' +
  '  float fall = exp(-(along * along * 14.0 + across * across * 90.0));\n' +
  '  if (fall < 0.01) discard;\n' +
  '  vec3 col = mix(vec3(0.914, 0.933, 0.949), vec3(0.337, 0.847, 1.0), uSeverity * 0.4);\n' +
  '  outColor = vec4(col * fall * uOpacity, 1.0);\n' +
  '}\n';
