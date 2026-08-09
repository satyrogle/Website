/**
 * Shared browser setup for the capture tools.
 *
 * Headed by default, and with ANGLE pointed at the platform driver
 * rather than SwiftShader. A software rasteriser is not the truth: it
 * has already hidden a pow(0, y) = NaN difference that rendered the
 * entity as a solid black silhouette on a real GPU while the headless
 * capture of the same commit looked correct.
 *
 * Set DL_SOFTWARE=1 to force the software path when no GPU is available.
 */

import { chromium } from 'playwright';

const SOFTWARE = process.env.DL_SOFTWARE === '1';

const GPU_ARGS = [
  '--use-gl=angle',
  '--use-angle=default',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-zero-copy',
  '--hide-scrollbars',
  '--mute-audio',
];

const SOFTWARE_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--mute-audio',
];

export async function launch() {
  return chromium.launch({
    headless: SOFTWARE,
    args: SOFTWARE ? SOFTWARE_ARGS : GPU_ARGS,
  });
}

export function renderer() {
  return SOFTWARE ? 'swiftshader (headless)' : 'platform GPU (headed)';
}

/** Waits for the live canvas, then lets the field and camera settle. */
export async function settle(page, ms = 2600) {
  await page
    .waitForFunction(
      () => {
        const canvas = document.getElementById('lattice-canvas');
        return (
          !canvas ||
          canvas.classList.contains('is-live') ||
          document.documentElement.classList.contains('no-webgl')
        );
      },
      { timeout: 25000 }
    )
    .catch(() => {});
  await page.waitForTimeout(ms);
}

/**
 * Scrolls to an exact prologue progress and waits for the camera spring
 * to arrive, so a capture is of a composed state rather than of the
 * approach to one.
 */
export async function seek(page, progress, hold = 1800) {
  await page.evaluate(async (p) => {
    const wrapper = document.querySelector('.prologue[data-prologue]');
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const travel = Math.max(rect.height - window.innerHeight, 1);
    const target = top + travel * p;
    const from = window.scrollY;
    for (let i = 1; i <= 20; i++) {
      window.scrollTo(0, from + (target - from) * (i / 20));
      await new Promise((r) => setTimeout(r, 35));
    }
  }, progress);
  await page.waitForTimeout(hold);
}

/** Scrolls an editorial section into view and lets its reveals finish. */
export async function seekSection(page, selector, hold = 1200) {
  await page.evaluate((sel) => {
    document.querySelector(sel)?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, selector);
  await page.waitForTimeout(hold);
}
