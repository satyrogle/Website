// Proof for gate I1 (THE BRACE) and gate I2 (THE SWALLOW).
//
//   node tools/i1-i2-capture.mjs
//
// I1 is an A/B: the same frame with the brace shut and held open. The
// half of it a still can carry is THE LOCK - the watcher leaving the
// cursor and coming dead centre onto the visitor - so the pointer is
// deliberately placed off to one side for both frames. If the light
// follows it in one and ignores it in the other, the lock reads.
//
// I2 is a transition strip: five stills across the crossing pulse, held
// by the review pin instead of chased down a scroll.
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('i1-i2');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(BASE + '/?harness=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__dl === 'object');
await page.waitForTimeout(5200);

// --- I1: the brace, off then on, with the pointer held off-axis ---
await page.mouse.move(1180, 300);
await page.waitForTimeout(1400);
for (const [name, v] of [['brace-off', 0], ['brace-on', 1]]) {
  await page.evaluate((amt) => window.__dl.still(amt), v);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: OUT + '/' + name + '.png' });
  console.log('[i1] ' + name);
}
await page.evaluate(() => window.__dl.still(-1));

// --- I2: the crossing, five stills across the pulse ---
const STEPS = [0, 0.25, 0.5, 0.75, 1];
for (let i = 0; i < STEPS.length; i++) {
  await page.evaluate((v) => window.__dl.swallow(v), STEPS[i]);
  await page.waitForTimeout(420);
  await page.screenshot({ path: OUT + '/swallow-' + i + '.png' });
  console.log('[i2] swallow ' + STEPS[i]);
}
await page.evaluate(() => window.__dl.swallow(-1));

await page.close();
await browser.close();
console.log('wrote ' + OUT);
