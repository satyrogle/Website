/**
 * Renders the social card from the live site at 1200x630.
 *
 * This is a real capture of the real hero, not a separately designed
 * asset — so the card can never drift away from what the page actually
 * looks like, and nothing in it is presented as something it is not.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = path.resolve(process.argv[3] ?? 'public/social/og-dark-lattice.jpg');

await mkdir(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
  ],
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(4200);

// The scroll readout and the scroll cue are page furniture, not brand.
await page.addStyleTag({
  content: '.chrome__progress{opacity:0!important}.hero__cue{display:none!important}',
});
await page.waitForTimeout(400);

await page.screenshot({ path: OUT, type: 'jpeg', quality: 88 });
await browser.close();
console.log('wrote', OUT);
