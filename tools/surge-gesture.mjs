// Does the surge fire on the gesture Jacob actually makes?
//
// wave-probe.mjs leaves by dispatching pointerleave, which is the cursor
// leaving the WINDOW. "when you take away the cursor from the hero" is
// almost certainly the cursor moving off the monument and staying on the
// page. The surge is gated on the tower-box raycast, not on the window, so
// it should fire for both - but three commits have died on an assumption
// about this effect, so it gets measured rather than reasoned.
//
//   node tools/surge-gesture.mjs
import { BASE, launch } from './env.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

await page.evaluate(() => {
  window.__peak = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const c = document.createElement('canvas');
          c.width = 800;
          c.height = 450;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(document.getElementById('world'), 0, 0, 800, 450);
          const d = x.getImageData(0, 0, 800, 450).data;
          let max = 0;
          let above200 = 0;
          for (let i = 0; i < 800 * 450; i++) {
            const l = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
            if (l > max) max = l;
            if (l >= 200) above200++;
          }
          resolve({ max: Math.round(max), above200 });
        })
      );
    });
});

// where the tower box ends: sweep across and watch the seam respond
const AWAY = [
  ['just off the silhouette', 1000, 450],
  ['half a screen away', 1250, 450],
  ['far corner, still on page', 1480, 780]
];

for (const [name, x, y] of AWAY) {
  await page.mouse.move(800, 450);
  await page.waitForTimeout(2000);
  const on = await page.evaluate(() => window.__peak());
  await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(260); // the front is brightest early
  const peak = await page.evaluate(() => window.__peak());
  await page.waitForTimeout(6000);
  const settled = await page.evaluate(() => window.__peak());
  // Keyed on the COUNT of bright pixels, not the frame max. The front is
  // deliberately dim now, so max barely moves while the number of pixels
  // the bloom lifts multiplies several times over. Judging by max called
  // a firing wave silent.
  const fired = peak.above200 > on.above200 * 2.5;
  console.log(
    `${fired ? 'FIRES  ' : 'SILENT '} ${name.padEnd(26)}` +
      ` on ${on.max}/${on.above200}  peak ${peak.max}/${peak.above200}  settled ${settled.max}/${settled.above200}`
  );
}

await browser.close();
