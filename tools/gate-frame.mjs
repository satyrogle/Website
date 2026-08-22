// One opening frame plus the numbers the value gates turn on.
//
//   DL_LABEL=g1-before node tools/gate-frame.mjs
//
// Captures the opening as the visitor gets it (DOM and all) into
// captures/gates/, and prints mean luminance for four regions: sky beside
// the crown, sky at the horizon between slabs, the monument's mass, and
// the ground. The value-hierarchy gate is PASSED BY THE PICTURE, not the
// numbers - these exist so a change can be steered without re-arguing
// what the eye already settled.
import { BASE, SOFTWARE, captures, launch } from './env.mjs';

const LABEL = process.env.DL_LABEL || 'gate';
const OUT = captures('gates');

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(5200);

// DL_SCROLL=<section id> captures a journey stop instead of the opening,
// so a gate that grades by distance can show both ends of itself.
if (process.env.DL_SCROLL) {
  await page.evaluate(
    (id) => document.getElementById(id)?.scrollIntoView({ block: 'start' }),
    process.env.DL_SCROLL
  );
  await page.waitForTimeout(2600);
}

const stats = await page.evaluate(
  () =>
    new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const src = document.getElementById('world');
          const c = document.createElement('canvas');
          c.width = 1600;
          c.height = 900;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(src, 0, 0, 1600, 900);
          const region = (rx, ry, rw, rh) => {
            const d = x.getImageData(rx, ry, rw, rh).data;
            let sum = 0;
            const n = rw * rh;
            for (let i = 0; i < n; i++) {
              sum += 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
            }
            return +(sum / n).toFixed(1);
          };
          const whole = x.getImageData(0, 0, 1600, 900).data;
          let a5 = 0;
          for (let i = 0; i < 1600 * 900; i++) {
            const l =
              (0.2126 * whole[i * 4] + 0.7152 * whole[i * 4 + 1] + 0.0722 * whole[i * 4 + 2]) / 255;
            if (l > 0.05) a5++;
          }
          resolve({
            skyCrown: region(960, 120, 260, 180), // beside the crown, clear sky
            skyHorizon: region(1180, 620, 200, 60), // above the far slabs
            mass: region(690, 300, 220, 380), // the monument
            ground: region(1100, 830, 300, 50),
            pctAbove5: +((100 * a5) / (1600 * 900)).toFixed(1)
          });
        })
      );
    })
);
console.log(LABEL, JSON.stringify(stats));
console.log(
  'hierarchy:',
  stats.mass > stats.skyCrown ? 'MASS ABOVE SKY (picture)' : 'SKY ABOVE MASS (backwards)'
);
await page.screenshot({ path: `${OUT}/${LABEL}.png` });
console.log(`frame -> ${OUT}/${LABEL}.png`);
if (SOFTWARE) console.log('SOFTWARE RENDER - tone is not to be trusted.');
await browser.close();
