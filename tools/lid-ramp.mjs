// Does the lid RAMP or does it TURN ON? Walks the journey in fine
// steps and reports the upper-sky mean at each, so a step change shows
// up as a jump rather than as a slope. A world condition should slope.
//   (from ../dark-lattice)  node ../dark-lattice-genesis/tools/lid-ramp.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');

const BASE = process.env.DL_BASE || 'http://localhost:5181';
const OUT = 'C:/Users/jacob/dark-lattice-genesis/captures/lid/ramp';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${BASE}/?harness=1&bare=1`, { waitUntil: 'networkidle' });
await page.mouse.move(8, 8);
await page.waitForTimeout(3500);

let prev = null;
for (let i = 0; i <= 20; i++) {
  const prog = i / 20;
  await page.evaluate((p) => {
    const h = document.body.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * Math.min(p, 0.999));
  }, prog);
  await page.waitForTimeout(1400);
  const m = await page.evaluate(
    () =>
      new Promise((res) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const src = document.getElementById('world');
            const c = document.createElement('canvas');
            c.width = 200;
            c.height = 120;
            const x = c.getContext('2d');
            x.drawImage(src, 0, 0, 200, 120);
            const d = x.getImageData(0, 0, 200, 120).data;
            let sum = 0;
            const n = 200 * 40;
            for (let i = 0; i < n; i++) {
              sum += (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
            }
            res(+(sum / n).toFixed(4));
          })
        )
      )
  );
  const jump = prev === null ? 0 : m - prev;
  prev = m;
  console.log(
    `p=${prog.toFixed(2)}  upperSky=${m.toFixed(4)}  step=${jump >= 0 ? '+' : ''}${jump.toFixed(4)}`
  );
  if (i % 2 === 0) {
    await page.screenshot({ path: `${OUT}/p${String(Math.round(prog * 100)).padStart(3, '0')}.png` });
  }
}

await browser.close();
