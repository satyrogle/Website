// THE FIELD, photographed with whatever the panel currently holds.
//
//   DL_BASE=http://localhost:5190 node tools/field-look.mjs [name]
//
// The tuning panel lives in localStorage, so a frame Jacob tuned by hand
// exists only in his tab. The dev server mirrors the panel to
// captures/field/settings.json on every change; this seeds a fresh browser
// with that same JSON, so the capture is his frame and not my defaults.
//
// Headed Chrome on the real card. Headless SwiftShader has already hidden a
// pow(0, y) NaN in this repo and cannot be trusted for tone or bloom.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASE, captures, launch, repoPath } from './env.mjs';

const OUT = captures('field');
const name = process.argv[2] || 'look';
// the defaults ARE the tuned frame now; a stale panel would only hide that
const settings = process.env.DL_FIELD_SETTINGS === '0'
  ? null
  : readFileSync(repoPath('captures/field/settings.json'), 'utf8');

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text());
});
// seed the panel before any module runs, so buildPanel reads his values
// a capture must never write back to the file it reads: the page mirrors its
// panel on load, which would overwrite Jacob's values with this run's defaults
await page.route('**/__field-settings', (r) => r.abort());
if (settings) {
  await page.addInitScript(([key, json]) => window.localStorage.setItem(key, json), ['field-tuning-v3', settings]);
}
await page.goto(BASE + '/field.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
// panel off: the frame is judged on its own
await page.evaluate(() => {
  const t = document.getElementById('tune');
  if (t) t.style.display = 'none';
  for (const id of ['status', 'label']) {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  }
});
await page.waitForTimeout(600);

const shot = join(OUT, name + '.png');
await page.screenshot({ path: shot });
const m = await page.evaluate(() => window.__field?.measure?.() ?? null);
writeFileSync(join(OUT, name + '.json'), JSON.stringify(m, null, 2));
console.log('captured', shot);
console.log(JSON.stringify(m));
await browser.close();
