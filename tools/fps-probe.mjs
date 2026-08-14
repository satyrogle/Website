/**
 * fps-probe.mjs — frame cost on the real GPU, repeatably.
 *
 * A single fps reading is not a measurement: the same build measured 68.9,
 * 56.6 and 60.7 on three different runs, which is enough spread to invent a
 * regression that is not there or hide one that is. This takes the median of
 * several page loads and reports frame time in milliseconds as well, because
 * milliseconds subtract and frames per second do not — "we lost 12 fps" means
 * nothing without knowing where you started, while "we lost 2 ms" is a budget.
 *
 *   node tools/fps-probe.mjs                        median of 3 at 2560x1440
 *   node tools/fps-probe.mjs --runs 5 --label core  more runs, tagged
 *   node tools/fps-probe.mjs --width 1440 --height 900
 *   node tools/fps-probe.mjs --scan                 frame cost vs resolution
 */

import { chromium } from 'playwright';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const BASE = argValue('url', 'http://localhost:5173');
const RUNS = Number(argValue('runs', 3));
const LABEL = argValue('label', 'frame cost');
const SAMPLE_MS = Number(argValue('sample', 3000));

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

/** One load, settled, then counted frames over a fixed window. */
async function once(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      () => {
        const loader = document.getElementById('loader');
        return !loader || loader.hidden || loader.classList.contains('is-done');
      },
      { timeout: 30000 }
    )
    .catch(() => {});
  // The first seconds after the loader clears are still shader compilation and
  // texture upload; measuring through them reports the worst frame of the
  // visit as the cost of every frame.
  await page.waitForTimeout(2500);
  await page.bringToFront().catch(() => {});

  const fps = await page.evaluate(
    (windowMs) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < windowMs) requestAnimationFrame(tick);
          else resolve(frames / ((performance.now() - start) / 1000));
        };
        requestAnimationFrame(tick);
      }),
    SAMPLE_MS
  );
  await page.close();
  return fps;
}

async function report(label, width, height, runs) {
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(await once(width, height));
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mp = (width * height) / 1e6;
  console.log(
    `  ${label.padEnd(22)} ${width}x${height}  ${mp.toFixed(2)} Mpx   ` +
      `median ${median.toFixed(1)} fps  ${(1000 / median).toFixed(2)} ms/frame  ` +
      `(${samples.map((f) => f.toFixed(0)).join('/')})`
  );
  return median;
}

if (flag('scan')) {
  // Frame time against pixel count. If it scales, the cost is in fragments
  // and the shaders are where to look; if it is flat, it is geometry, draw
  // calls or the simulation, and no amount of shader work will move it.
  console.log('\nFRAME COST VS RESOLUTION');
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await report('scan', w, h, RUNS);
  }
} else {
  console.log('');
  await report(LABEL, Number(argValue('width', 2560)), Number(argValue('height', 1440)), RUNS);
}

console.log('');
await browser.close();
