// THE AIR at the landing, swept. The hero stands 620 units from the eye
// and FogExp2 is quadratic in that distance, so density is the single
// number deciding how much of the monument survives to reach the frame.
// Renders the opening at a range of densities and prints, per frame, how
// much stone is left and how far the hero separates from the sky.
//   node tools/fog-sweep.mjs
//   node tools/fog-sweep.mjs 0.0022 0.0018 0.0014 0.00106 0.0008
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('fog');
const HERO_DIST = 620; // opening pose (0,95,620), spire at origin
const CHOIR_DIST = 1226; // choir.glb node at (-330,68,-560)
const densities = process.argv.slice(2).map(Number).filter((n) => n > 0);
const sweep = densities.length ? densities : [0.0022, 0.0018, 0.0014, 0.00106, 0.0008, 0.0005];

const veil = (d, dist) => 1 - Math.exp(-Math.pow(d * dist, 2));

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(BASE + '/?harness=1&bare=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__dl === 'object');

// Settle in frames, never milliseconds: a software rasteriser gets three
// frames out of the same wall clock a GPU gets a hundred and fifty from.
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

console.log('density   hero veil   choir veil   sky lum   hero lum   separation');
for (const density of sweep) {
  await page.evaluate((d) => window.__dl.setFog(d), density);
  await settle(40);

  // Sample the hero's lit flank and the sky beside it, inside one rAF so
  // the readback lands on a frame that was actually drawn.
  const read = await page.evaluate(
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
            // The hero's flanks, either side of the fissure, low enough that
            // the cone is wide. Anything above 0.3 is the blade or its bloom
            // and is skipped: this measures the stone, never the light.
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
            // sky at the same height, well clear of every standing mass
            let sky = 0;
            let sn = 0;
            for (let px = 120; px <= 240; px += 6) {
              for (let py = 380; py <= 500; py += 6) {
                sky += lum(px, py);
                sn++;
              }
            }
            resolve({ hero: hero / hn, sky: sky / sn });
          })
        );
      })
  );

  const name = `fog-${String(density).replace('0.', '')}`;
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(
    String(density).padEnd(9) +
      (100 * veil(density, HERO_DIST)).toFixed(1).padStart(7) +
      '%  ' +
      (100 * veil(density, CHOIR_DIST)).toFixed(1).padStart(9) +
      '%  ' +
      read.sky.toFixed(4).padStart(8) +
      '  ' +
      read.hero.toFixed(4).padStart(8) +
      '  ' +
      (read.hero - read.sky).toFixed(4).padStart(10)
  );
}

console.log('\nframes in ' + OUT);
console.log('separation is hero minus sky: negative means the hero is a dark');
console.log('cutout against a lighter ground, which carries no size cue.');
await browser.close();
