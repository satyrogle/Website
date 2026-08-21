// Does the draw need stratified decks to be legible? The decisive 2x2:
// approved isotropic sky vs layered sky, each with and without the
// bend. Headed Chrome on the real GPU.
//   node tools/draw-matrix.mjs
import { captures, launch } from './env.mjs';

const BASE = process.env.DL_BASE || 'http://localhost:5181';
const OUT = captures('draw/matrix');

const CELLS = [
  ['a-approved', 1.0, 0.0],
  ['b-bend-only', 1.0, 0.6],
  ['c-layered', 0.35, 0.0],
  ['d-layered-bend', 0.35, 0.6]
];

const STOPS = [
  ['landing', 0.001, 0.3],
  ['wide', 0.29, 0.4]
];

const browser = await launch();
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
  await page.evaluate((v) => window.__dl.setLid(v), lid);

  for (const [name, strata, draw] of CELLS) {
    await page.evaluate(
      ([s, dr]) => {
        window.__dl.setStrata(s);
        window.__dl.setDraw(dr);
      },
      [strata, draw]
    );
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${stop}-${name}.png` });
    await page.screenshot({
      path: `${OUT}/${stop}-${name}-sky.png`,
      clip: { x: 0, y: 0, width: 1600, height: 440 }
    });
    console.log('captured', stop, name, 'strata=', strata, 'draw=', draw);
  }
}

await browser.close();
