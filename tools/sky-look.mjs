// What is the sky actually doing? Full frame, a sky-only crop, and a
// vertical luminance profile to find banding the eye half-sees.
//   (from ../dark-lattice)  node ../dark-lattice-genesis/tools/sky-look.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');

const BASE = process.env.DL_BASE || 'http://localhost:5181';
const OUT = 'C:/Users/jacob/dark-lattice-genesis/captures/sky';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.mouse.move(8, 8);
await page.waitForTimeout(3500);
await page.addStyleTag({ content: 'header, footer, .hero-copy, .ticker, .evidence, nav, main { opacity: 0 !important; }' });
await page.waitForTimeout(600);

for (const [name, prog] of [['a-opening', 0.001], ['b-orbit', 0.12], ['c-wide', 0.29]]) {
  await page.evaluate((p) => {
    const h = document.body.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * p);
  }, prog);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  // sky only: the band above the monument's shoulder, left of the spire
  await page.screenshot({ path: `${OUT}/${name}-crop.png`, clip: { x: 0, y: 0, width: 700, height: 460 } });

  // a vertical cut well clear of the spire, and a horizontal one high up
  const prof = await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const src = document.getElementById('world');
            const c = document.createElement('canvas');
            c.width = src.clientWidth;
            c.height = src.clientHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(src, 0, 0, c.width, c.height);
            const lum = (d, i) =>
              (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            const col = ctx.getImageData(220, 0, 1, c.height).data;
            const down = [];
            for (let y = 0; y < c.height; y += 20) down.push(+lum(col, y * 4).toFixed(4));
            const row = ctx.getImageData(0, 120, c.width, 1).data;
            const across = [];
            for (let x = 0; x < c.width; x += 80) across.push(+lum(row, x * 4).toFixed(4));
            resolve({ down, across });
          })
        );
      })
  );
  console.log(name, 'down x=220 :', prof.down.join(' '));
  console.log(name, 'across y=120:', prof.across.join(' '));
}

await browser.close();
