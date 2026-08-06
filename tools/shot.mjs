import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'captures/iterate.png';
const SCROLL = Number(process.argv[4] ?? 0);
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type()==='error') console.log('[err]', m.text()); });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(7000);
if (SCROLL > 0) {
  await page.evaluate(async (frac) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const target = max * frac;
    const step = window.innerHeight * 0.6;
    for (let y = 0; y < target; y += step) { window.scrollTo(0, y); await new Promise(r=>setTimeout(r,90)); }
    window.scrollTo(0, target);
  }, SCROLL);
  // Long settle: under SwiftShader the springs converge in sim-time
  // but the wall clock stretches with the frame rate, so a short wait
  // captures the camera mid-flight on heavy scenes.
  await page.waitForTimeout(Number(process.env.SETTLE ?? 6000));
}
await page.screenshot({ path: OUT });
await browser.close();
console.log('wrote', OUT);
