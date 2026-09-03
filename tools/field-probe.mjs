// Ask the running page what it actually has, rather than assuming the
// uniforms landed. Prints the backdrop's state and a vertical slice of
// luminance through the middle of the frame, which is where a hard edge at
// the horizon shows up as a step.
import { readFileSync } from 'node:fs';

import { BASE, launch, repoPath } from './env.mjs';

const settings = readFileSync(repoPath('captures/field/settings.json'), 'utf8');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
page.on('console', (m) => console.log('[' + m.type() + ']', m.text().slice(0, 900)));  // consoleAll
// a capture must never write back to the file it reads: the page mirrors its
// panel on load, which would overwrite Jacob's values with this run's defaults
await page.route('**/__field-settings', (r) => r.abort());
await page.addInitScript(([k, j]) => window.localStorage.setItem(k, j), ['field-tuning-v2', settings]);
await page.goto(BASE + '/field.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

const out = await page.evaluate(() => {
  const f = window.__field;
  const P = f?.P ?? {};
  const air = { airGlow: P.airGlow, horizon: P.horizon, horizonHeight: P.horizonHeight, swell: P.swell, fogDensity: P.fogDensity };
  return { air, measure: f?.measure?.() };
});
console.log(JSON.stringify(out, null, 1).slice(0, 2500));
await browser.close();
