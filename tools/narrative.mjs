/**
 * Narrative frame capture.
 *
 * One frame at each checkpoint the full-build directive asks for, in a
 * single session so the reaction field carries across them exactly as a
 * visitor would experience it — the field is never reseeded, so frame
 * 100% shows the accumulated consequence of every frame before it.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = path.resolve(process.argv[3] ?? 'captures/narrative');
const W = Number(process.argv[4] ?? 1440);
const H = Number(process.argv[5] ?? 900);

const MARKS = [0, 10, 20, 30, 40, 50, 60, 70, 82, 92, 100];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage({
  viewport: { width: W, height: H }, deviceScaleFactor: 1,
  isMobile: W < 768, hasTouch: W < 768,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);

for (const mark of MARKS) {
  await page.evaluate(async (pct) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const target = max * (pct / 100);
    const from = window.scrollY;
    for (let i = 1; i <= 24; i++) {
      window.scrollTo(0, from + (target - from) * (i / 24));
      await new Promise((r) => setTimeout(r, 45));
    }
  }, mark);
  await page.waitForTimeout(4200);
  await page.screenshot({ path: path.join(OUT, `${String(mark).padStart(3, '0')}pct.png`) });
  console.log('captured', mark + '%');
}

await browser.close();
console.log(errors.length ? `ERRORS ${errors.length}: ${errors.slice(0,3).join(' | ')}` : 'no runtime errors');
