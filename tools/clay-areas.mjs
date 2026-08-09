/**
 * Per-mass projected area from the hero object-ID mask. Used while
 * tuning the fracture tree; the full gate measurement lives in
 * tools/clay-measure.mjs.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { launch } from './browser.mjs';

const DIR = path.resolve('design/clay', process.env.DL_CLAY_DIR ?? 'r2');
const browser = await launch();
const page = await (await browser.newContext()).newPage();
await page.goto('data:text/html,<body></body>');
const buffer = await readFile(path.join(DIR, 'A00-mask-hero.png'));
const stats = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const counts = new Array(8).fill(0);
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 1] > 150) { counts[7]++; total++; continue; }
    if (d[i] < 12) continue;
    const id = Math.round(d[i] / 25) - 1;
    if (id < 0 || id > 6) continue;
    counts[id]++;
    total++;
  }
  return { counts, total };
}, buffer.toString('base64'));
await browser.close();

const rows = stats.counts.slice(0, 7).map((n, i) => ({
  name: `Outer_0${i + 1}`,
  pct: (n / stats.total) * 100,
}));
rows.sort((a, b) => b.pct - a.pct);
console.log('target  29 / 21 / 12 / 11 / 10 / 9 / 8');
console.log('actual  ' + rows.map((r) => r.pct.toFixed(1)).join(' / '));
rows.forEach((r) => console.log(`  ${r.name}  ${r.pct.toFixed(1)}%`));
console.log(`  spine     ${((stats.counts[7] / stats.total) * 100).toFixed(2)}%`);
