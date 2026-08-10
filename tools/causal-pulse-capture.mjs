/**
 * causal-pulse-capture.mjs — drive the lab page and record what it does.
 *
 * Captures a deterministic strike at fixed points along the response so the
 * sequence can be read as a storyboard: before, impact, mid-travel, decayed,
 * and the retained trace once the transient is gone.
 *
 * IMPORTANT: this renders through SwiftShader, which is software. It is
 * evidence for composition, colour and behaviour, and is NOT evidence about
 * frame rate or about anything driver-dependent. The frame-time numbers in the
 * report are the software renderer's, not a GPU's. Open the page on real
 * hardware before believing anything about performance.
 *
 *   node tools/causal-pulse-capture.mjs [http://localhost:5342] [captures/causal-pulse]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5342';
const OUT = process.argv[3] ?? 'captures/causal-pulse';
// auto=0 suppresses the idle disturbance so "before" is a genuine baseline
// rather than a frame that already contains an automatic strike.
const URL = `${BASE}/causal-pulse.html?auto=0`;
const STRIKE_NODE = 2879;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

// Seconds after the strike at which to record.
const MOMENTS = [
  { name: '0-before', at: 0 },
  { name: '1-impact', at: 0.35 },
  { name: '2-travel', at: 1.2 },
  { name: '3-spread', at: 2.5 },
  { name: '4-retained', at: 6.0 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});

const report = { url: URL, strikeNode: STRIKE_NODE, renderer: 'SwiftShader (software)', viewports: [] };

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'networkidle' });

  // Wait for the hook rather than a fixed sleep: the worker has to fetch and
  // decode the graph, and the entity is 7.8 MB.
  await page.waitForFunction(() => Boolean(window.__causalPulse), null, { timeout: 60000 });
  await page.waitForTimeout(1200);

  const frames = [];
  let previous = 0;

  for (const moment of MOMENTS) {
    if (moment.at === 0) {
      // Baseline before anything is struck.
    } else if (previous === 0) {
      await page.evaluate((node) => window.__causalPulse.inject(node), STRIKE_NODE);
      await page.waitForTimeout(moment.at * 1000);
    } else {
      await page.waitForTimeout((moment.at - previous) * 1000);
    }
    previous = moment.at;

    const file = `${OUT}/${viewport.name}-${moment.name}.png`;
    await page.screenshot({ path: file });
    const state = await page.evaluate(() => window.__causalPulse.state());

    frames.push({ moment: moment.name, atSeconds: moment.at, file, state });
    console.log(
      `${viewport.name.padEnd(8)} ${moment.name.padEnd(11)} `
      + `tick ${String(state?.tick ?? 0).padStart(5)}  `
      + `reached ${String(state?.reachedNodes ?? 0).padStart(5)}  `
      + `active ${String(state?.activeNodes ?? 0).padStart(5)}  `
      + `retaining ${String(state?.retainingNodes ?? 0).padStart(5)}  `
      + `meanRetained ${(state?.meanRetained ?? 0).toFixed(5)}  `
      + `checksum 0x${(state?.checksum ?? 0).toString(16).padStart(8, '0')}`,
    );
  }

  report.viewports.push({ ...viewport, frames, errors });
  if (errors.length) console.log(`  ${viewport.name} errors:`, errors);

  await page.close();
}

// Reduced-motion / no-WebGL path: the lab must fail with a readable message
// rather than a blank canvas.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = function () { return null; };
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/fallback-no-webgl.png` });
  const banner = await page.evaluate(() => {
    const el = document.getElementById('lab-error');
    return el && !el.hidden ? el.textContent : null;
  });
  report.noWebGL = { file: `${OUT}/fallback-no-webgl.png`, banner };
  console.log(`fallback  no-webgl    banner: ${banner ?? 'NONE — blank canvas, defect'}`);
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nwrote ${OUT}/report.json`);
