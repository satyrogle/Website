/**
 * Candidate contact sheet runner.
 *
 * Renders every `public/models/meshy-*.glb` into one sheet — same
 * lighting, same camera, same scale normalisation — so a comparison is
 * about form and nothing else.
 *
 * The point of this existing at all: the entity went six rounds being
 * judged one option at a time, in isolation, as grey clay. A single
 * candidate always looks plausible. Side by side, ring topology is
 * obvious in the silhouette column within a second.
 *
 *   node tools/compare.mjs [baseUrl] [outFile]
 */

import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5342';
const OUT = process.argv[3] ?? 'captures/meshy-compare.png';

const files = readdirSync('public/models')
  .filter((f) => f.startsWith('meshy-') && f.endsWith('.glb'))
  .sort();

if (!files.length) {
  console.error('No public/models/meshy-*.glb found.');
  process.exit(1);
}

console.log(`${files.length} candidate(s):`);
files.forEach((f) => console.log('  ' + f));

const query = files.map((f) => `src=/models/${f}`).join('&');

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
// Tall enough for every row; fullPage catches the rest.
const page = await browser.newPage({
  viewport: { width: 1740, height: Math.min(400 * files.length + 60, 3000) },
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[err]', m.text());
});

await page.goto(`${BASE}/tools/compare.html?${query}`, {
  waitUntil: 'networkidle',
  timeout: 600000,
});
// Each candidate is ~1M triangles through SwiftShader; the wait scales
// with the batch rather than assuming a fixed budget.
await page.waitForFunction(() => document.title === 'compare-ready', {
  timeout: 180000 * files.length,
});
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();

console.log('wrote', OUT);
