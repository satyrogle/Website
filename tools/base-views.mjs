// The base, seen properly. Jacob: "i cant actually see the progress of
// the base clearly". The opening stands 262 out; the base work deserves
// the two journey stops that are actually NEAR the foot, plus the
// worst-case sway frame that used to put the eye underground.
//
//   node tools/base-views.mjs
//
// Produces captures/base-views/: the opening with the pointer held at
// the screen's bottom edge (the pose that used to clip), the SYSTEM
// dwell, the STUDIO dwell, and a low crop of each.
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('base-views');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(5200);

// worst case sway: pointer parked at the bottom edge, smoothing settled
await page.mouse.move(800, 892);
await page.waitForTimeout(2600);
await page.screenshot({ path: OUT + '/01-opening-sway-floor.png' });

// Sample the dwell POSES, not the section tops: scrollIntoView lands at
// the section's first pixel, which is still inside the travel blend. A
// reader sweeps the whole dwell range; these captures sit at its centre.
for (const [prog, name] of [
  [0.168, '02-system-dwell'],
  [0.84, '03-studio-dwell']
]) {
  await page.evaluate((t) => {
    window.scrollTo(0, t * (document.documentElement.scrollHeight - window.innerHeight));
  }, prog);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: OUT + '/' + name + '.png' });
}
await browser.close();
console.log('views -> ' + OUT);
