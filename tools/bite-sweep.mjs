// THE CONTACT, swept. How far the plain has failed where the mass went
// into it. Same frame, same tick, five strengths, so the only variable
// is the fracture. Headed Chrome on the real GPU.
//   node tools/bite-sweep.mjs
import { captures, launch } from './env.mjs';

const BASE = process.env.DL_BASE || 'http://localhost:5181';
const OUT = captures('bite');

// 0 is the control. Too strong and the plain becomes crazy paving, so
// the answer is expected low; 1.0 is only there to bracket it.
const STRENGTHS = [0, 0.6, 0.8, 1.0];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}/?harness=1&bare=1`, { waitUntil: 'networkidle' });
// pointer centred so the camera sits on its authored pose
await page.mouse.move(800, 450);
await page.waitForTimeout(4000);

for (const s of STRENGTHS) {
  await page.evaluate((v) => window.__dl.setBite(v), s);
  await page.waitForTimeout(700);
  const tag = String(Math.round(s * 100)).padStart(3, '0');
  await page.screenshot({ path: `${OUT}/foot-${tag}.png`, clip: { x: 560, y: 760, width: 500, height: 140 } });
  await page.screenshot({ path: `${OUT}/wide-${tag}.png` });
  console.log('captured bite =', s.toFixed(2));
}

await browser.close();
