// The shaft, and the dimmed choir. Sweeps both so Jacob picks from
// frames. Headed Chrome on the real GPU.
//   node tools/shaft-look.mjs
import { captures, launch } from './env.mjs';

const BASE = process.env.DL_BASE || 'http://localhost:5181';
const OUT = captures('shaft');

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${BASE}/?harness=1&bare=1`, { waitUntil: 'networkidle' });
await page.mouse.move(8, 8);
await page.waitForTimeout(3500);

await page.evaluate(() => {
  const h = document.body.scrollHeight - window.innerHeight;
  window.scrollTo(0, h * 0.001);
});
await page.waitForTimeout(2000);

// --- the choir dim, shaft held closed so it is not a second variable
await page.evaluate(() => window.__dl.setShaft(0));
for (const dim of [1.0, 0.75, 0.55, 0.4]) {
  await page.evaluate((v) => window.__dl.setChoirDim(v), dim);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `${OUT}/choir-dim-${String(Math.round(dim * 100)).padStart(3, '0')}.png`
  });
  console.log('choir dim', dim);
}
await page.evaluate(() => window.__dl.setChoirDim(0.55));

// --- the shaft, at the landing frame and at a stop that looks up
for (const [stop, prog] of [['landing', 0.001], ['wide', 0.29], ['foot', 0.83]]) {
  await page.evaluate((p) => {
    const h = document.body.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * p);
  }, prog);
  await page.waitForTimeout(1800);
  for (const s of [0, 0.5, 1.0]) {
    await page.evaluate((v) => window.__dl.setShaft(v), s);
    await page.waitForTimeout(700);
    const tag = String(Math.round(s * 100)).padStart(3, '0');
    await page.screenshot({ path: `${OUT}/${stop}-shaft-${tag}.png` });
    await page.screenshot({
      path: `${OUT}/${stop}-shaft-${tag}-top.png`,
      clip: { x: 0, y: 0, width: 900, height: 340 }
    });
    console.log('shaft', stop, s);
  }
}

await browser.close();
