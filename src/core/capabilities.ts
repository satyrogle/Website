/**
 * Capability detection. WebGL2 plus renderable float colour buffers is
 * the price of entry for the world; without it the page falls back to a
 * static composition and the full editorial content.
 */
export interface Capabilities {
  webgl: boolean;
  lowTier: boolean;
}

export function detectCapabilities(): Capabilities {
  let webgl = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl) {
      const ext = gl.getExtension('EXT_color_buffer_float');
      webgl = ext !== null;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch {
    webgl = false;
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const lowTier = coarse || cores < 6 || window.innerWidth < 820;

  return { webgl, lowTier };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
