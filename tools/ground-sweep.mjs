// THE GROUND HAZE, swept against a reference.
//
// Thinning the landing air gave the hero its stone back and handed the
// plain the same gift, which it did not need: fog was the term holding
// the ground down, and it stopped holding. This renders the plain the
// visitor used to see - old air, no ground haze - measures it, then
// sweeps the haze under the new air looking for the value that lands
// back on it.
//
// Reports per band: mean luminance, and the p10-p90 spread, which is the
// trench and section contrast. The haze must bring the mean back without
// flattening the spread, or the detail the camera move was made to show
// goes with it. It reports hero luminance in every row too: that number
// must not move at all, or the haze is reaching something it should not.
//   node tools/ground-sweep.mjs
//   node tools/ground-sweep.mjs 1.9 2.08 2.3
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('ground');
const OLD_FOG = 0.0022; // what shipped, and what the plain was authored under
const NEW_FOG = 0.00106; // THE AIR, re-solved for the hero at 620 units

const given = process.argv.slice(2).map(Number).filter((n) => n >= 1);
const sweep = given.length ? given : [1.0, 1.5, 2.08, 2.6, 3.2, 4.0];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(BASE + '/?harness=1&bare=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__dl === 'object');

const settle = (n) =>
  page.evaluate(
    (count) =>
      new Promise((done) => {
        let i = 0;
        const tick = () => (++i < count ? requestAnimationFrame(tick) : done());
        requestAnimationFrame(tick);
      }),
    n
  );

// Bands of plain, all clear of the fissure's reflection down the axis and
// clear of every standing mass. Plus the hero, to prove the haze stays low.
const read = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const src = document.getElementById('world');
            const W = 1600;
            const H = 900;
            const c = document.createElement('canvas');
            c.width = W;
            c.height = H;
            const x = c.getContext('2d');
            x.drawImage(src, 0, 0, W, H);
            const d = x.getImageData(0, 0, W, H).data;
            const lum = (px, py) => {
              const i = (py * W + px) * 4;
              return (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            };
            const band = (y0, y1) => {
              const v = [];
              for (const [a, b] of [
                [150, 620],
                [1000, 1450]
              ]) {
                for (let px = a; px <= b; px += 4) {
                  for (let py = y0; py <= y1; py += 3) v.push(lum(px, py));
                }
              }
              v.sort((p, q) => p - q);
              const at = (f) => v[Math.floor(f * (v.length - 1))];
              return { mean: v.reduce((s, n) => s + n, 0) / v.length, spread: at(0.9) - at(0.1) };
            };
            // the hero's flanks, skipping the blade: this measures stone
            let hero = 0;
            let hn = 0;
            for (const [x0, x1] of [
              [765, 793],
              [812, 845]
            ]) {
              for (let px = x0; px <= x1; px += 2) {
                for (let py = 500; py <= 660; py += 4) {
                  const l = lum(px, py);
                  if (l > 0.3) continue;
                  hero += l;
                  hn++;
                }
              }
            }
            resolve({ near: band(780, 870), mid: band(620, 700), hero: hero / hn });
          })
        );
      })
  );

const row = (label, r) =>
  label.padEnd(22) +
  ['near', 'mid']
    .map((k) => k + ' ' + r[k].mean.toFixed(4) + ' ±' + r[k].spread.toFixed(4))
    .join('   ') +
  '   hero ' +
  r.hero.toFixed(4);

console.log('mean ± (p90-p10 spread), where the spread is trench and section contrast\n');

// the reference: the plain as it read under the old air, with no ground haze
await page.evaluate((f) => window.__dl.setFog(f), OLD_FOG);
await page.evaluate(() => window.__dl.setGround(1));
await settle(40);
const ref = await read();
console.log(row('REFERENCE old air', ref));
await page.screenshot({ path: `${OUT}/reference-oldair.png` });
console.log('');

await page.evaluate((f) => window.__dl.setFog(f), NEW_FOG);
for (const haze of sweep) {
  await page.evaluate((h) => window.__dl.setGround(h), haze);
  await settle(40);
  const r = await read();
  const drift = Math.abs(r.near.mean - ref.near.mean) + Math.abs(r.mid.mean - ref.mid.mean);
  console.log(row('haze ' + haze.toFixed(2), r) + '   drift ' + drift.toFixed(4));
  await page.screenshot({ path: `${OUT}/haze-${String(haze).replace('.', '')}.png` });
}

console.log('\nframes in ' + OUT);
console.log('drift is distance from the reference plain across both bands.');
await browser.close();
