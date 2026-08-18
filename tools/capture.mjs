// Smoke capture of the genesis build (localhost:5180), headed Chrome on
// the real GPU: headless is not GPU truth. Playwright is not a dependency
// of this repo; run it from a checkout that has it, e.g.
//   (from ../dark-lattice)  node ../dark-lattice-genesis/tools/capture.mjs
// or: npm i -D playwright, then: node tools/capture.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/Users/jacob/dark-lattice-genesis/captures';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5180', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

async function stats(label) {
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

await stats('OPENING');
await page.screenshot({ path: OUT + '/01-opening.png' });

// a visitor press in empty dark, off to the left
await page.mouse.click(320, 620);
await page.waitForTimeout(900);
console.log(
  'CHIP',
  await page.evaluate(() => (document.getElementById('record-chip') || {}).textContent || 'EMPTY')
);
await page.screenshot({ path: OUT + '/02-mark.png' });

for (const [id, name, wait] of [
  ['desk42', '03-desk42', 2500],
  ['rule', '04-rule', 2500],
  ['technology', '05-micro', 3000],
  ['contact', '06-return', 3500]
]) {
  await page.evaluate((sel) => document.getElementById(sel).scrollIntoView({ block: 'start' }), id);
  await page.waitForTimeout(wait);
  await stats(name.toUpperCase());
  await page.screenshot({ path: OUT + '/' + name + '.png' });
}

console.log(
  'RECORD',
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('#record-list li')).map((li) => li.textContent)
  )
);
console.log(
  'CONSOLE_ERRORS_CHECKED_VIA_LISTENER_BELOW'
);
await browser.close();
