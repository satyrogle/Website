// THE LID, swept. Same frame, same tick, same camera, five strengths -
// so the only variable is the lid. Headed Chrome on the real GPU.
//   node tools/lid-sweep.mjs
import { captures, launch } from './env.mjs';

const BASE = process.env.DL_BASE || 'http://localhost:5181';
const OUT = captures('lid');

// 0 is the control. The lid is meant to be found, not seen, so the
// interesting answer is expected low.
const STRENGTHS = [0, 0.15, 0.3, 0.55, 0.85];

// the landing frame is the one he asked for; the studio foot is the
// steep upward look, which is where a ceiling should be most present
const STOPS = [
  ['landing', 0.001],
  ['orbit', 0.12],
  ['foot', 0.83]
];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${BASE}/?harness=1&bare=1`, { waitUntil: 'networkidle' });
await page.mouse.move(8, 8);
await page.waitForTimeout(3500);

for (const [stop, prog] of STOPS) {
  await page.evaluate((p) => {
    const h = document.body.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * p);
  }, prog);
  await page.waitForTimeout(1800);

  for (const s of STRENGTHS) {
    await page.evaluate((v) => window.__dl.setLid(v), s);
    await page.waitForTimeout(700);
    const tag = String(Math.round(s * 100)).padStart(3, '0');
    await page.screenshot({ path: `${OUT}/${stop}-${tag}.png` });
    // upper sky only, where the lid actually lives
    await page.screenshot({
      path: `${OUT}/${stop}-${tag}-sky.png`,
      clip: { x: 0, y: 0, width: 1600, height: 380 }
    });
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
              const lum = (i) =>
                (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
              // upper third only: that is the lid's territory
              let sum = 0;
              let lo = 1;
              let hi = 0;
              const n = 200 * 40;
              for (let i = 0; i < n; i++) {
                const l = lum(i);
                sum += l;
                if (l < lo) lo = l;
                if (l > hi) hi = l;
              }
              res({ mean: +(sum / n).toFixed(4), lo: +lo.toFixed(4), hi: +hi.toFixed(4) });
            })
          )
        )
    );
    console.log(`${stop} lid=${s.toFixed(2)} upperSky ${JSON.stringify(m)}`);
  }
}

await browser.close();
