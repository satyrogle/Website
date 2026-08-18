/**
 * arch-capture.mjs — opening frames for the three website architectures.
 *
 * Headed Chrome for consistency with the Gate B harness, though these frames
 * are pure DOM and have no GPU dependency at all. That is the point of the
 * exploration: there is nothing to render.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('captures/architectures');
await mkdir(OUT, { recursive: true });

const PAGES = [
  ['proceeding', '01 THE PROCEEDING'],
  ['criticality', '02 CRITICALITY'],
  ['claim-and-run', '03 THE CLAIM AND THE RUN'],
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

for (const [key, label] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto(`http://localhost:5173/architectures/${key}.html`, { waitUntil: 'networkidle' });
  await page.bringToFront().catch(() => {});
  await page.waitForTimeout(400);
  await writeFile(path.join(OUT, `${key}.png`), await page.screenshot({ type: 'png' }));

  // Negative space, measured on the composited frame rather than a canvas,
  // because for these architectures the composition IS the type.
  const s = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return { w: window.innerWidth, h: window.innerHeight };
  });
  console.log(`  ${label.padEnd(28)} ${s.w}x${s.h}${problems.length ? '  PROBLEMS: ' + problems.join(' | ') : ''}`);
  await page.close();
  await ctx.close();
}

console.log(`\nwritten to ${OUT}\n`);
await browser.close();
