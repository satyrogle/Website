/**
 * correction-capture.mjs — stills from the running site, on the real GPU.
 *
 * The existing tools/*.mjs all force SwiftShader, and the build plan is
 * explicit that a software raster is not visual truth: it has already hidden a
 * shader bug that rendered the object black on the actual card. This harness
 * launches installed Chrome, headed, so the frames come off the 3060.
 *
 *   node tools/correction-capture.mjs                    opening frame
 *   node tools/correction-capture.mjs --event            opening + one full
 *                                                        enforcement event
 *   node tools/correction-capture.mjs --url http://... --out captures/x
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const BASE = argValue('url', 'http://localhost:5173');
const OUT = path.resolve(argValue('out', 'captures/correction'));
const WIDTH = Number(argValue('width', 1440));
const HEIGHT = Number(argValue('height', 900));

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`  [console.${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

console.log(`\n${BASE} at ${WIDTH}x${HEIGHT}`);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

// The loader tracks real initialisation — graph synthesis, warm-up, record —
// so waiting on it is waiting on the system rather than on a timer.
await page
  .waitForFunction(
    () => {
      const loader = document.getElementById('loader');
      return !loader || loader.hidden || loader.classList.contains('is-done');
    },
    { timeout: 30000 }
  )
  .catch(() => console.log('  loader never cleared'));

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(`  GPU: ${gpu}`);

const telemetry = () => page.evaluate(() => window.__correction?.telemetry ?? null);

/**
 * Mean luminance and the share of pixels carrying anything, read off the WebGL
 * canvas.
 *
 * Measured inside a requestAnimationFrame callback, which is not fussiness: the
 * drawing buffer is cleared at the swap, so reading it from ordinary script
 * returns a black image and reports a working frame as dead. The scene
 * registers its callback earlier, so this one runs after the render and before
 * the swap.
 */
async function frameStats() {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const canvas = document.getElementById('lattice-canvas');
    const copy = document.createElement('canvas');
    copy.width = 480;
    copy.height = Math.round((480 * canvas.height) / canvas.width);
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
    const { data } = ctx.getImageData(0, 0, copy.width, copy.height);

    let lit = 0;
    let sum = 0;
    let peak = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      sum += l;
      if (l > peak) peak = l;
      if (l > 0.04) {
        lit++;
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
      }
    }
    const pixels = data.length / 4;
    resolve({
      litShare: lit / pixels,
      meanLuma: sum / pixels,
      peakLuma: peak,
      litMeanRGB: lit ? [Math.round(rSum / lit), Math.round(gSum / lit), Math.round(bSum / lit)] : [0, 0, 0],
    });
  })));
}

/**
 * How much the surface's shading changes over time.
 *
 * The metric has now been right twice and wrong twice, and which one is correct
 * depends entirely on what is being drawn. For hairlines, luminance change was
 * useless — a still image jittering sub-pixel changes its antialiasing and
 * scores as movement — so that build tracked the geometry's position instead.
 * This build draws a solid shaded surface, where the opposite holds: the plate
 * barely moves in screen space by design, and *shading* is the whole signal. A
 * position tracker would report this frame as dead while the light visibly
 * swings across it.
 */
async function motion(samples = 16, intervalMs = 400) {
  return page.evaluate(
    ([count, gap]) =>
      new Promise((resolve) => {
        const canvas = document.getElementById('lattice-canvas');
        const copy = document.createElement('canvas');
        copy.width = 480;
        copy.height = Math.round((480 * canvas.height) / canvas.width);
        const ctx = copy.getContext('2d', { willReadFrequently: true });

        const read = () =>
          new Promise((done) =>
            requestAnimationFrame(() => {
              ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
              const { data } = ctx.getImageData(0, 0, copy.width, copy.height);
              const luma = new Float32Array(data.length / 4);
              for (let i = 0; i < data.length; i += 4) {
                luma[i / 4] = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
              }
              done(luma);
            })
          );

        (async () => {
          const first = await read();
          const low = Float32Array.from(first);
          const high = Float32Array.from(first);

          for (let s = 1; s < count; s++) {
            await new Promise((r) => setTimeout(r, gap));
            const current = await read();
            for (let i = 0; i < current.length; i++) {
              if (current[i] < low[i]) low[i] = current[i];
              if (current[i] > high[i]) high[i] = current[i];
            }
          }

          // Only pixels the plate actually covers. Void does not change and
          // would otherwise drown the statistic.
          const swings = [];
          for (let i = 0; i < low.length; i++) {
            if (high[i] < 0.03) continue;
            swings.push((high[i] - low[i]) / Math.max(high[i], 1e-3));
          }
          swings.sort((a, b) => a - b);
          const q = (p) => (swings.length ? swings[Math.floor(swings.length * p)] : 0);
          resolve({ covered: swings.length, p10: q(0.1), median: q(0.5), p90: q(0.9) });
        })();
      }),
    [samples, intervalMs]
  );
}

async function shot(name) {
  const buffer = await page.screenshot({ type: 'png' });
  await writeFile(path.join(OUT, `${name}.png`), buffer);
  const stats = await frameStats();
  const t = await telemetry();
  console.log(
    `  ${name.padEnd(28)} lit ${(stats.litShare * 100).toFixed(1)}%  mean ${stats.meanLuma.toFixed(4)}  ` +
      `peak ${stats.peakLuma.toFixed(3)}  litRGB ${stats.litMeanRGB.join(',')}` +
      (t ? `  | tick ${t.tick} adj ${t.adjustments} held ${t.engaged} dev ${t.peakDeviation.toFixed(3)}` : '')
  );
  return { stats, telemetry: t };
}

console.log('\nOPENING FRAME');
await page.waitForTimeout(1600);
await shot('01-opening');

if (flag('motion')) {
  console.log('\nDOES THE CALM MOVE');
  const m = await motion();
  console.log(
    `  shading swing over 6s, as a fraction of each pixel's own brightness:  ` +
      `p10 ${(m.p10 * 100).toFixed(0)}%  median ${(m.median * 100).toFixed(0)}%  p90 ${(m.p90 * 100).toFixed(0)}%` +
      `   (${m.covered} covered pixels)`
  );
  console.log(`  ${m.median >= 0.12 ? 'BREATHING' : 'READS AS STILL'}`);
}

if (flag('event')) {
  console.log('\nONE ENFORCEMENT EVENT');
  // Press near the middle-left of the structure. Reported so the frame series
  // can be tied to a specific strike.
  const node = await page.evaluate(
    ([x, y]) => window.__correction?.press(x, y) ?? -1,
    [Math.round(WIDTH * 0.42), Math.round(HEIGHT * 0.52)]
  );
  console.log(`  struck node ${node}`);

  const beats = [
    ['02-deviation', 260],
    ['03-noticing', 240],
    ['04-strain', 420],
    ['05-snap', 700],
    ['06-settling', 1400],
    ['07-bruise', 3000],
  ];
  for (const [name, wait] of beats) {
    await page.waitForTimeout(wait);
    await shot(name);
  }
}

console.log(`\nwritten to ${OUT}\n`);
await browser.close();
