/**
 * proof-capture.mjs — the standardised medium kill test, captured on the real
 * GPU. One medium per run, all deliverables from CLAUDE.md's Proof 1 spec:
 * far, micro (same state), a four-frame scale descent, grayscale, and the
 * seed + input trace as JSON. Bloom note: these renders have no bloom pass at
 * all, so every capture is already the bloom-disabled capture.
 *
 *   node tools/proof-capture.mjs --medium physarum
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const MEDIUM = argValue('medium', 'physarum');
const BASE = argValue('url', 'http://localhost:5173/proofs');
const OUT = path.resolve('captures/proofs', MEDIUM);
await mkdir(OUT, { recursive: true });

const VIEWS = argValue('views', 'far,descent0,descent1,descent2,descent3,micro,fargray').split(',');

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

let traceSaved = false;

for (const view of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });

  await page.goto(`${BASE}/${MEDIUM}.html?view=${view}`, { waitUntil: 'domcontentloaded' });
  const ready = await page
    .waitForFunction(() => document.documentElement.dataset.styleframe === 'ready', { timeout: 90000 })
    .then(() => true).catch(() => false);
  if (!ready) problems.push('never signalled ready');

  await page.bringToFront().catch(() => {});
  await page.waitForTimeout(300);
  await writeFile(path.join(OUT, `${view}.png`), await page.screenshot({ type: 'png' }));

  const stats = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const c = document.getElementById('field');
    const w = 480, h = Math.round((w * c.clientHeight) / c.clientWidth);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    x.drawImage(c, 0, 0, w, h);
    const { data } = x.getImageData(0, 0, w, h);
    let dark = 0, sum = 0; const lum = [];
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      lum.push(l); sum += l; if (l < 0.04) dark++;
    }
    lum.sort((a, b) => a - b);
    resolve({
      dark: dark / lum.length,
      mean: sum / lum.length,
      p99: lum[(lum.length * 0.99) | 0],
    });
  })));
  const conc = stats.mean > 0 ? stats.p99 / stats.mean : 0;
  console.log(
    `  ${view.padEnd(9)} dark ${(stats.dark * 100).toFixed(1)}%  mean ${stats.mean.toFixed(4)}  ` +
    `concentration ${conc.toFixed(1)}x${problems.length ? '  PROBLEMS: ' + problems.join(' | ') : ''}`
  );

  if (!traceSaved) {
    const trace = await page.evaluate(() => window.__proofTrace ?? null);
    if (trace) {
      await writeFile(path.join(OUT, 'trace.json'), JSON.stringify(trace, null, 2));
      traceSaved = true;
    }
  }

  await page.close();
  await ctx.close();
}

console.log(`\nwritten to ${OUT}\n`);
await browser.close();
