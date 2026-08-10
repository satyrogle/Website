/**
 * The lab's own material. Deliberately not the production convergence shader:
 * the spike must not be able to change how the real site renders, and the
 * question here is only whether simulation state reads on the object.
 *
 * Every vertex carries the index of the graph node it belongs to and fetches
 * that node's state directly, so geometry and colour are driven by the same
 * authoritative numbers rather than by two approximations of them.
 */

import {
  Color, DataTexture, FloatType, GLSL3, NearestFilter, RGBAFormat, ShaderMaterial, Vector3,
} from 'three';

const vertexShader = /* glsl */ `
in float aGraphNode;

uniform sampler2D uState;
uniform int uTextureSize;
uniform float uDisplace;

out float vWave;
out float vActivity;
out float vMemory;
out float vEnvelope;
out vec3 vNormalW;
out vec3 vViewDir;

void main() {
  int index = int(aGraphNode + 0.5);
  ivec2 texel = ivec2(index % uTextureSize, index / uTextureSize);
  vec4 state = texelFetch(uState, texel, 0);

  vWave = state.x;
  vActivity = state.y;
  vMemory = state.z;
  vEnvelope = state.w;

  // Pressure, not jelly. The displacement is deliberately small — the
  // structure should look loaded, not animated.
  vec3 displaced = position + normal * (uDisplace * state.x);

  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);

  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

in float vWave;
in float vActivity;
in float vMemory;
in float vEnvelope;
in vec3 vNormalW;
in vec3 vViewDir;

uniform vec3 uVoid;
uniform vec3 uCyan;
uniform vec3 uMagenta;
uniform vec3 uRim;
uniform float uWaveGain;
uniform float uActivityGain;
uniform float uMemoryGain;
uniform float uRetainedLow;
uniform float uRetainedHigh;
uniform float uActiveMaskGain;
uniform float uTransientFloor;
uniform float uTransientBoost;

out vec4 fragColor;

// HLSL compiles pow(x,y) as exp2(y*log2(x)), and log2(0) is -Inf, so ANGLE/D3D11
// returns NaN for a zero base where SwiftShader returns 0. One NaN pixel survives
// the whole frame. Never hand pow a bare zero.
float safePow(float base, float k) {
  return pow(max(base, 1e-6), k);
}

void main() {
  vec3 normal = normalize(vNormalW);
  vec3 view = normalize(vViewDir);
  float fresnel = safePow(1.0 - max(dot(normal, view), 0.0), 3.0);

  float wave = vEnvelope * uWaveGain;
  float activity = vActivity * uActivityGain;

  // The wave never reaches zero — it decays slowly and leaves a low residual
  // ring across the whole object. At the gain needed to make the travelling
  // front bright, that residual is enough to hold every surface cyan forever
  // and mask the trace permanently. The floor is a DISPLAY decision: below it
  // the object is ringing, not being disturbed, and reads as at rest.
  // Front and residual differ by only about a factor of two in amplitude, so
  // subtracting the floor alone dims both. The remainder is boosted, which
  // separates a passing front from a surface that is merely still ringing.
  float transient = clamp((wave + activity - uTransientFloor) * uTransientBoost, 0.0, 6.0);

  // Where the system is active NOW, the transient owns the pixel. The retained
  // trace is suppressed under it, so magenta never covers the travelling front
  // and the two channels stay legible as separate events.
  float activeMask = clamp(transient * uActiveMaskGain, 0.0, 1.0);

  // Fixed mapping from the deterministic calibration in the manifest. Never
  // normalised per frame or per interaction, so the same strike always looks
  // the same and different strikes stay comparable.
  float mapped = clamp((vMemory - uRetainedLow) / max(uRetainedHigh - uRetainedLow, 1e-9), 0.0, 1.0);
  float visibleRetained = mapped * uMemoryGain * (1.0 - activeMask);

  vec3 color = uVoid;

  // Cyan is the transient system: what is happening now, and it has priority.
  color += uCyan * transient;

  // Magenta is retained consequence, and only that. It never decorates.
  color += uMagenta * visibleRetained;

  // Faint enough that untouched structure stays near-black.
  color += uRim * fresnel;

  // Soft knee rather than a hard clamp, so a bright strike rolls off instead
  // of flattening into a white plate.
  color = color / (1.0 + color * 0.55);

  fragColor = vec4(color, 1.0);
}
`;

export interface PulseMaterialOptions {
  textureSize: number;
  /** Fixed retained-memory mapping from the manifest's calibration. */
  retainedLow: number;
  retainedHigh: number;
  displace?: number;
  waveGain?: number;
  activityGain?: number;
  memoryGain?: number;
  activeMaskGain?: number;
  transientFloor?: number;
  transientBoost?: number;
}

export function createStateTexture(textureSize: number): DataTexture {
  const texture = new DataTexture(
    new Float32Array(textureSize * textureSize * 4),
    textureSize, textureSize, RGBAFormat, FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createPulseMaterial(stateTexture: DataTexture, options: PulseMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: {
      uState: { value: stateTexture },
      uTextureSize: { value: options.textureSize },
      uDisplace: { value: options.displace ?? 0.35 },
      // The transient has to out-shout the trace at the moment of impact, or
      // cause and consequence arrive in the same colour and the sequence reads
      // as one event instead of two.
      uWaveGain: { value: options.waveGain ?? 420 },
      uActivityGain: { value: options.activityGain ?? 10 },
      uMemoryGain: { value: options.memoryGain ?? 1 },
      uRetainedLow: { value: options.retainedLow },
      uRetainedHigh: { value: options.retainedHigh },
      uActiveMaskGain: { value: options.activeMaskGain ?? 6 },
      uTransientFloor: { value: options.transientFloor ?? 0.78 },
      uTransientBoost: { value: options.transientBoost ?? 5 },
      // Locked palette: void, cyan for active transient, magenta for retained.
      uVoid: { value: new Color(0x010204) },
      uCyan: { value: new Color(0x4dd0ff) },
      uMagenta: { value: new Color(0xff2b9a) },
      uRim: { value: new Vector3(0.016, 0.032, 0.046) },
    },
  });
}
