// Gate I3 proof: THE APERTURE and the country beyond it.
//
//   node tools/i3-capture.mjs
//
// Scroll is driven to exact progress values rather than nudged, because
// the interior only exists between 0.652 and 0.875 and a wheel event
// lands wherever it likes. Frames: the reveal out of the crack, then the
// two stops that stand in the country.
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('i3');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 2270, height: 1278 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(5200);

const SHOTS = [
  ['blackout', 0.64],
  ['aperture', 0.678],
  ['aperture-near', 0.705],
  ['country', 0.745],
  ['country-wide', 0.79],
  ['island', 0.83]
];

for (const [name, p] of SHOTS) {
  await page.evaluate((v) => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max * v, behavior: 'instant' });
  }, p);
  // the camera eases toward its key: give it frames, not milliseconds
  await page.evaluate(
    (n) =>
      new Promise((done) => {
        let i = 0;
        const tick = () => (++i < n ? requestAnimationFrame(tick) : done());
        requestAnimationFrame(tick);
      }),
    150
  );
  await page.screenshot({ path: OUT + '/' + name + '.png' });
  console.log('[i3] ' + name + ' @ ' + p);
}

await page.close();
await browser.close();
console.log('wrote ' + OUT);
