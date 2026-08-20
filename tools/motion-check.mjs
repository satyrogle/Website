// How alive is the landing frame? Samples the canvas over 20 seconds
// and reports, per band of the frame, how much actually changes. A
// still image scores ~0 everywhere.
//   (from ../dark-lattice)  node ../dark-lattice-genesis/tools/motion-check.mjs
import { createRequire } from 'node:module';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');

const BASE = process.env.DL_BASE || 'http://localhost:5181';
const browser = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${BASE}/?bare=1`, { waitUntil: 'networkidle' });
// pointer parked away from the monument and NOT moved again, so what is
// measured is the world's own life, not the visitor's hand
await page.mouse.move(20, 880);
await page.waitForTimeout(4000);

const grab = () =>
  page.evaluate(() => {
    return new Promise((res) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const s = document.getElementById('world');
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 180;
          const x = c.getContext('2d');
          x.drawImage(s, 0, 0, 320, 180);
          res(Array.from(x.getImageData(0, 0, 320, 180).data));
        });
      });
    });
  });

const BANDS = [
  ['sky, upper third', 0, 60],
  ['sky, mid + horizon', 60, 120],
  ['monument + plain', 120, 180]
];

const base = await grab();
console.log('seconds   ' + BANDS.map((b) => b[0].padEnd(20)).join(''));
for (const wait of [2, 4, 8, 14, 20]) {
  await page.waitForTimeout(wait * 1000 - (wait === 2 ? 0 : 0));
  const now = await grab();
  const out = [];
  for (const [, y0, y1] of BANDS) {
    let sum = 0;
    let n = 0;
    let peak = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < 320; x++) {
        const o = (y * 320 + x) * 4;
        const d =
          Math.abs(now[o] - base[o]) +
          Math.abs(now[o + 1] - base[o + 1]) +
          Math.abs(now[o + 2] - base[o + 2]);
        sum += d;
        if (d > peak) peak = d;
        n++;
      }
    }
    out.push(`mean ${(sum / n / 765 * 100).toFixed(3)}% peak ${(peak / 765 * 100).toFixed(1)}%`.padEnd(20));
  }
  console.log(String(wait).padStart(4) + 's     ' + out.join(''));
}

await browser.close();
