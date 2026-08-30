// The descent, photographed. Eight stops down the scroll, DOM and all,
// exactly as the visitor gets them.
//
//   DL_BASE=http://localhost:5183 node tools/journey-look.mjs
//
// Instant scroll to each stop, a settle long enough for the director's
// short ease to land, then a full-viewport frame into captures/journey/.
// Jacob judges the frames; nothing here passes or fails anything.
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('journey');
// the whole journey: entrance, arrival, X scrub, Tick Zero, Y early and
// late, Z opening and settled. Real scrolling, DOM and all. The blade
// snaps to +1 at Tick Zero via the real keyboard path, so Y and Z carry
// a genuine intervention.
const STOPS = [0.36, 0.4, 0.46, 0.55, 0.62, 0.72, 0.82, 0.92];
const DETENT_AT = 0.55;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(5200);

for (const p of STOPS) {
  await page.evaluate((t) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max * t, behavior: 'instant' });
  }, p);
  await page.waitForTimeout(1400);
  if (p === DETENT_AT) {
    // the visitor's one input, through the real keyboard path
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
  }
  const name = OUT + '/' + String(Math.round(p * 100)).padStart(3, '0') + '.jpg';
  await page.screenshot({ path: name, type: 'jpeg', quality: 90 });
  console.log('captured', name);
}

await browser.close();
console.log('done:', OUT);
