// THE DRAW, swept. Same frame, same tick, same camera, five strengths.
// The lid is pinned to its locked landing value so the only variable is
// the bend. Headed Chrome on the real GPU.
//   (from ../dark-lattice)  node ../dark-lattice-genesis/tools/draw-sweep.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');

const BASE = process.env.DL_BASE || 'http://localhost:5181';
const OUT = 'C:/Users/jacob/dark-lattice-genesis/captures/draw';
mkdirSync(OUT, { recursive: true });

// 0 is the control. Too strong is a fantasy storm, so the answer is
// expected low; 1.00 is included only to bracket it.
const STRENGTHS = [0, 0.2, 0.35, 0.6, 1.0];

const STOPS = [
  ['landing', 0.001, 0.3],
  ['orbit', 0.12, 0.32],
  ['wide', 0.29, 0.4]
];

const browser = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${BASE}/?harness=1&bare=1`, { waitUntil: 'networkidle' });
await page.mouse.move(8, 8);
await page.waitForTimeout(3500);

for (const [stop, prog, lid] of STOPS) {
  await page.evaluate((p) => {
    const h = document.body.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * p);
  }, prog);
  await page.waitForTimeout(1800);
  // pin the lid so the bend is the only thing changing
  await page.evaluate((v) => window.__dl.setLid(v), lid);

  for (const s of STRENGTHS) {
    await page.evaluate((v) => window.__dl.setDraw(v), s);
    await page.waitForTimeout(700);
    const tag = String(Math.round(s * 100)).padStart(3, '0');
    await page.screenshot({ path: `${OUT}/${stop}-${tag}.png` });
    await page.screenshot({
      path: `${OUT}/${stop}-${tag}-sky.png`,
      clip: { x: 0, y: 0, width: 1600, height: 420 }
    });
    console.log('captured', stop, 'draw=', s.toFixed(2));
  }
}

await browser.close();
