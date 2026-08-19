// Review pass for the marker-quality monument: walks the journey at
// exact scroll progresses, headed Chrome on the real GPU (headless is
// not GPU truth). Playwright lives in the main dark-lattice checkout:
//   (from ../dark-lattice)  node ../dark-lattice-genesis/tools/marker-review.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');

const BASE = process.env.DL_BASE || 'http://localhost:5180';
const OUT = 'C:/Users/jacob/dark-lattice-genesis/captures/marker';
mkdirSync(OUT, { recursive: true });

const STOPS = [
  ['01-opening', 0.001, 3000],
  ['02-orbit', 0.12, 2600],
  ['03-system', 0.17, 2600],
  ['04-desk42-wide', 0.29, 2600],
  ['05-rule-face', 0.43, 2800],
  ['06-cleft-mouth', 0.515, 2600],
  ['07-inside-ties', 0.56, 2600],
  ['08-corkscrew', 0.65, 2600],
  ['09-emerged', 0.7, 2600],
  ['10-studio-foot', 0.83, 2600],
  ['11-return-a', 0.9, 2600],
  ['12-return-b', 0.95, 2600],
  ['13-return-end', 0.999, 3000]
];

async function stats(page, label) {
  const s = await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const src = document.getElementById('world');
            const c = document.createElement('canvas');
            c.width = 200;
            c.height = 120;
            const ctx = c.getContext('2d');
            ctx.drawImage(src, 0, 0, 200, 120);
            const d = ctx.getImageData(0, 0, 200, 120).data;
            let a5 = 0, a40 = 0, a80 = 0, max = 0, sum = 0;
            const n = 200 * 120;
            for (let i = 0; i < n; i++) {
              const l = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
              sum += l;
              if (l > max) max = l;
              if (l > 0.05) a5++;
              if (l > 0.4) a40++;
              if (l > 0.8) a80++;
            }
            resolve({
              mean: +(sum / n).toFixed(4),
              max: +max.toFixed(3),
              pctAbove5: +((100 * a5) / n).toFixed(1),
              pctAbove40: +((100 * a40) / n).toFixed(1),
              pctAbove80: +((100 * a80) / n).toFixed(2)
            });
          })
        );
      })
  );
  console.log(label, JSON.stringify(s));
}

const browser = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.mouse.move(8, 8);
await page.waitForTimeout(5200);

for (const [name, p, wait] of STOPS) {
  await page.evaluate((prog) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, max * prog);
  }, p);
  await page.waitForTimeout(wait);
  await stats(page, name.toUpperCase());
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

// flat static-frame audit of the opening: composition without rescue
await page.goto(BASE + '/?flat=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(4200);
await stats(page, 'FLAT-OPENING');
await page.screenshot({ path: OUT + '/14-flat-opening.png' });

await browser.close();
console.log('DONE ->', OUT);
