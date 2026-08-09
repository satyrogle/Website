/**
 * Captures one frame per movement in a single session, so the sequence
 * can be read as a storyboard and checked for continuity.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = path.resolve(process.argv[3] ?? 'captures/sequence');
const W = Number(process.argv[4] ?? 1440);
const H = Number(process.argv[5] ?? 900);

const FRAMES = [
  ['01-hero', 0.0],
  ['02-premise', 0.14],
  ['03a-desk42', 0.3],
  ['03b-brawler', 0.42],
  ['03c-roguelite', 0.53],
  ['04-foundation', 0.65],
  ['05-accumulation', 0.77],
  ['06-evidence', 0.88],
  ['07-resolution', 1.0],
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
  ],
});
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  isMobile: W < 768,
  hasTouch: W < 768,
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[err]', m.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(7000);

for (const [name, frac] of FRAMES) {
  await page.evaluate(async (f) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const target = max * f;
    const from = window.scrollY;
    const steps = 26;
    for (let i = 1; i <= steps; i++) {
      window.scrollTo(0, from + (target - from) * (i / steps));
      await new Promise((r) => setTimeout(r, 45));
    }
  }, frac);
  // Let the camera rig, field and reveals settle at the new position.
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('captured', name);
}

await browser.close();
