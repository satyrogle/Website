/**
 * GradeShader — the last thing that touches the frame.
 *
 * Jacob, on the build every acceptance check had passed: "IT STILL SUCKS."
 * Two of the named faults are grading, not geometry. The void was a brown
 * smog rather than black, and there was no violent contrast anywhere — a
 * brief that asks for a blinding core in a near-black world was rendering as
 * polite mid-greys with a medium-orange wound.
 *
 * The cause was that nothing graded at all. The chain ended in CopyShader, a
 * pass-through, with `NoToneMapping` on the renderer, so every value above
 * one clipped per channel and everything below sat exactly where the shaders
 * left it. The reasoning for that was sound as far as it went — a filmic
 * curve desaturates, and these hues carry the colour grammar — but "no curve"
 * is not the only alternative to "the wrong curve".
 *
 * So this grades on LUMINANCE and rescales the colour by the ratio, which
 * moves the level without touching the hue. Amber stays amber; it simply
 * stops being amber-flavoured fog.
 *
 * Three stages, in order:
 *
 *   toe       the faint volumetric wash falls to void. A smooth toe, not a
 *             subtracted black point: the crust's own geology sits at a
 *             luminance not far above the haze, and a hard subtract would
 *             have taken the terrain out with the smog.
 *   contrast  a power on luminance. Below one it darkens, above one it
 *             brightens, so a single exponent widens the gap between the dead
 *             world and the break in one operation.
 *   shoulder  values already over one keep going, toward white rather than
 *             toward a clipped primary. This is the "too bright to look at"
 *             the hero direction asks for, and per-channel clipping cannot
 *             produce it — it produces flat orange instead.
 */

import * as THREE from 'three';

/** Shipped defaults. On the dev panel, because "brutally dark" is a judgement. */
export const GRADE = {
  /** Luminance below which the frame falls away to void. */
  black: 0.035,
  /** Exponent on luminance. >1 darkens the world and lifts the break. */
  contrast: 1.18,
  /** Where the highlight shoulder starts running toward white. */
  white: 0.82,
  /** How fast it gets there. */
  whiteRoll: 1.35,
};

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uBlack: { value: GRADE.black },
    uContrast: { value: GRADE.contrast },
    uWhite: { value: GRADE.white },
    uWhiteRoll: { value: GRADE.whiteRoll },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBlack;
    uniform float uContrast;
    uniform float uWhite;
    uniform float uWhiteRoll;
    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, LUMA);

      // Everything below the toe is the haze the void is not allowed to be.
      float toe = smoothstep(0.0, uBlack, l);

      // One exponent, both directions: the dead world falls, the break rises.
      float shaped = pow(max(l, 0.0), uContrast) * toe;

      // Rescale rather than recolour. The grammar's hues are load-bearing and
      // a per-channel curve would shift them.
      c *= l > 1e-6 ? shaped / l : 0.0;

      // The break is allowed to overwhelm. Desaturating toward the peak takes
      // it to white; clipping each channel separately would only take it to
      // saturated orange, which is what "medium orange wound" looked like.
      float peak = max(max(c.r, c.g), c.b);
      c = mix(c, vec3(peak), clamp((peak - uWhite) * uWhiteRoll, 0.0, 1.0));

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
