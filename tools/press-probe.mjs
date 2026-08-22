// Click the hero and watch what forms, where. Jacob: "still forming try
// clicking on the hero and see what's happening pimples are popping".
//
//   node tools/press-probe.mjs
//
// Presses at three heights on the monument, and after each press crops
// two regions at full resolution: around the CLICK, and around the BASE.
// If the seating fix holds, the bitten patch grows under the click and
// the base stays clean. The crops are the evidence either way, at three
// moments so the mark's arrival is watchable, not described.
import { writeFileSync } from 'node:fs';
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('press');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(5200);

await page.evaluate(() => {
  window.__crop = (cx, cy, w, h) =>
    new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const src = document.getElementById('world');
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const x = c.getContext('2d');
          // the canvas backing store is DPR-scaled; drawImage from the
          // element resamples to CSS pixels for us
          x.drawImage(src, cx - w / 2, cy - h / 2, w, h, 0, 0, w, h);
          resolve(c.toDataURL('image/png'));
        })
      );
    });
});

const put = (name, dataUrl) =>
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));

// the monument occupies roughly x 650-950 at 1600x900; base at y ~840
const PRESSES = [
  ['high', 800, 330],
  ['mid', 860, 560],
  ['low', 790, 740]
];

for (const [name, px, py] of PRESSES) {
  await page.mouse.click(px, py);
  for (const [ms, tag] of [[250, 'a'], [700, 'b'], [1600, 'c']]) {
    await page.waitForTimeout(ms === 250 ? 250 : ms - (tag === 'b' ? 250 : 700));
    put(`${name}-${tag}-click`, await page.evaluate((a) => window.__crop(...a), [px, py, 360, 260]));
  }
  put(`${name}-base`, await page.evaluate((a) => window.__crop(...a), [800, 810, 460, 180]));
  console.log(`${name}: pressed at ${px},${py}`);
  // marks rate-limit at 30 ticks; leave room so the next press takes
  await page.waitForTimeout(800);
}

console.log(
  'LEDGER',
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('#record-list li')).map((li) => li.textContent).slice(0, 4)
  )
);
await browser.close();
console.log('crops -> ' + OUT);
