// E0 proof: the exterior after the podium came out.
//
//   node tools/e0-capture.mjs
//
// Jacob's own viewport for the desktop frame, and a mobile recomposition
// check. Shipping page, never ?bare=1 - the DOM scrims are part of what
// he sees. Pointer untouched, so the authored pose is what is
// photographed rather than a pose swung ~6 degrees by a parked cursor.
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('e0');
const browser = await launch();

for (const [name, w, h, wait] of [
  ['desktop', 2270, 1278, 6500],
  ['mobile', 430, 932, 6500]
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('[page error]', name, e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: OUT + '/' + name + '.png' });
  console.log('[e0] ' + name + ' ' + w + 'x' + h);
  await page.close();
}

// the foot, close, at desktop scale: the one region every E0 strike
// lands in - no treads, no platform, slots at the roots, ruin east
{
  const page = await browser.newPage({ viewport: { width: 2270, height: 1278 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6500);
  await page.screenshot({
    path: OUT + '/foot.png',
    clip: { x: 620, y: 700, width: 1100, height: 560 }
  });
  console.log('[e0] foot crop');
  await page.close();
}

await browser.close();
console.log('wrote ' + OUT);
