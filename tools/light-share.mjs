// WHERE IS THE LIGHT? Jacob: "its not hitting as holy sinister yet".
//
//   node tools/light-share.mjs
//
// The brief's invariant is that light is CONCENTRATED, not sprayed - and
// the reference gates added four emitters to a frame that used to have
// one (the break, the rim, the plinth pool, the stair lane). Holy is one
// light. This measures whether the seam is still the frame's light or
// merely its brightest part: total luminance in the frame, and the share
// of it belonging to each region.
import { BASE, captures, launch } from './env.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(5200);

const out = await page.evaluate(
  () =>
    new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const c = document.createElement('canvas');
          c.width = 1600;
          c.height = 900;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(document.getElementById('world'), 0, 0, 1600, 900);
          const d = x.getImageData(0, 0, 1600, 900).data;
          const lum = (i) =>
            0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
          // linear-ish weighting: perceived light, squared, so a bright
          // small source counts for what it actually does to the eye
          const REGIONS = {
            seam: [782, 60, 40, 780],
            crownHalo: [690, 60, 230, 130],
            skyBreak: [560, 0, 500, 300],
            towerFaces: [660, 120, 300, 700],
            plinthStair: [520, 780, 580, 120],
            groundLane: [600, 830, 420, 70],
            farField: [1050, 480, 550, 340]
          };
          let total = 0;
          for (let i = 0; i < 1600 * 900; i++) {
            const l = lum(i) / 255;
            total += l * l;
          }
          const share = {};
          for (const [name, [rx, ry, rw, rh]] of Object.entries(REGIONS)) {
            let s = 0;
            let peak = 0;
            for (let yy = ry; yy < ry + rh; yy++) {
              for (let xx = rx; xx < rx + rw; xx++) {
                const l = lum(yy * 1600 + xx) / 255;
                s += l * l;
                if (l > peak) peak = l;
              }
            }
            share[name] = {
              pct: +((100 * s) / total).toFixed(1),
              peak: Math.round(peak * 255)
            };
          }
          resolve({ share });
        })
      );
    })
);
for (const [k, v] of Object.entries(out.share)) {
  console.log(`${k.padEnd(13)} ${String(v.pct).padStart(5)}% of frame light   peak ${v.peak}`);
}
await browser.close();
