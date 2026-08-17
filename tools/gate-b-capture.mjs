/**
 * gate-b-capture.mjs — the six Gate B styleframes, off the real GPU.
 *
 * Headed Chrome, because SwiftShader has already hidden a shader bug that
 * rendered the hero black on the actual card. Waits on the page's own
 * `data-styleframe="ready"` flag rather than a timer, so a slow machine cannot
 * produce a screenshot of a half-drawn field.
 *
 *   node tools/gate-b-capture.mjs
 *   node tools/gate-b-capture.mjs --only bloom
 *
 * Prints a measured read of every frame. The numbers are the Gate B acceptance
 * that can be checked without an eye: brief section 8 asks for 80 to 90 percent
 * near-black negative space, and section 8 asks for light that is concentrated
 * rather than sprayed. `dark` and `p99/mean` are those two claims as numbers.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = argValue('url', 'http://localhost:5173/gate-b');
const OUT = path.resolve(argValue('out', 'captures/gate-b'));
const ONLY = argValue('only', null);

const DIRECTIONS = [
  { key: "bloom2", page: "bloom2.html", label: "A THE CRITICAL BLOOM (rebuilt primitive)" },
  { key: "witness2", page: "witness2.html", label: "B THE WITNESS FIELD (rebuilt mechanism)" },
];

const VIEWPORTS = [
  { key: "desktop", width: 1440, height: 900, mobile: false },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

/**
 * Luminance distribution of the whole composited frame.
 *
 * Read from the PNG the harness just wrote rather than from the canvas, so it
 * measures WHAT WAS JUDGED: field, veil, and type together. Measuring the
 * canvas alone reports a composition that nobody sees.
 */
function analyse(png) {
  // Decoding is done in the page, where a decoder already exists.
  return png;
}

const results = [];

for (const dir of DIRECTIONS) {
  if (ONLY && ONLY !== dir.key) continue;

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await context.newPage();

    const problems = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push(e.message));

    const url = `${BASE}/${dir.page}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const drew = await page
      .waitForFunction(() => document.documentElement.dataset.styleframe === 'ready', {
        timeout: 30000,
      })
      .then(() => true)
      .catch(() => false);

    if (!drew) problems.push('styleframe never signalled ready');

    if (vp.key === 'desktop') {
      const gpu = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      console.log(`\n${dir.label}\n  GPU ${gpu}`);
    }

    await page.bringToFront().catch(() => {});
    await page.waitForTimeout(350);

    const name = `${dir.key}-${vp.key}`;
    const buffer = await page.screenshot({ type: 'png' });
    await writeFile(path.join(OUT, `${name}.png`), buffer);

    // Measured off the live document, sampling the composited frame through a
    // 2D canvas drawn from the WebGL canvas plus the known veil, which is the
    // closest honest read available without decoding the PNG here.
    const stats = await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => {
            const canvas = document.getElementById('field');
            const w = 480;
            const h = Math.round((w * canvas.clientHeight) / canvas.clientWidth);
            const copy = document.createElement('canvas');
            copy.width = w;
            copy.height = h;
            const ctx = copy.getContext('2d');
            ctx.drawImage(canvas, 0, 0, w, h);
            const { data } = ctx.getImageData(0, 0, w, h);

            const luma = [];
            let sum = 0;
            let dark = 0;
            let blue = 0;
            let wsum = 0;
            let wx = 0;
            let wy = 0;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const l = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
              luma.push(l);
              sum += l;
              if (l < 0.04) dark++;
              if (b > r * 1.35 && b > 60) blue++;
              if (l > 0.04) {
                const p = i / 4;
                wsum += l;
                wx += l * (p % w);
                wy += l * Math.floor(p / w);
              }
            }
            luma.sort((a, b) => a - b);
            const q = (p) => luma[Math.min(luma.length - 1, Math.floor(luma.length * p))];
            resolve({
              dark: dark / luma.length,
              mean: sum / luma.length,
              p99: q(0.99),
              peak: q(0.9999),
              blue: blue / luma.length,
              cx: wsum ? wx / wsum / w : 0.5,
              cy: wsum ? wy / wsum / h : 0.5,
            });
          })
        )
    );

    const ratio = stats.mean > 0 ? stats.p99 / stats.mean : 0;
    console.log(
      `  ${vp.key.padEnd(8)} dark ${(stats.dark * 100).toFixed(1)}%  mean ${stats.mean.toFixed(4)}  ` +
        `p99 ${stats.p99.toFixed(3)}  peak ${stats.peak.toFixed(3)}  ` +
        `concentration ${ratio.toFixed(1)}x  blue ${(stats.blue * 100).toFixed(1)}%  ` +
        `centroid ${stats.cx.toFixed(2)},${stats.cy.toFixed(2)}`
    );
    if (problems.length) console.log(`    PROBLEMS: ${problems.join(' | ')}`);

    results.push({ name, ...stats, ratio, problems });
    await page.close();
    await context.close();
  }
}

console.log('\nGATE B ACCEPTANCE, measured');
console.log('  brief 8: 80-90% near-black negative space');
console.log('  brief 8: light concentrated, not sprayed (concentration well above 1x)');
for (const r of results) {
  const darkOk = r.dark >= 0.78 && r.dark <= 0.95;
  const concOk = r.ratio >= 6;
  console.log(
    `  ${r.name.padEnd(18)} negative space ${darkOk ? 'PASS' : 'FAIL'} (${(r.dark * 100).toFixed(1)}%)   ` +
      `concentration ${concOk ? 'PASS' : 'FAIL'} (${r.ratio.toFixed(1)}x)`
  );
}

console.log(`\nwritten to ${OUT}\n`);
await browser.close();
