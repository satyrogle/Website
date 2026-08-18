// Render the bare opening frame for several seeds; pick by looking.
import { createRequire } from 'node:module';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');
import { mkdirSync } from 'node:fs';

const OUT = 'C:/Users/jacob/dark-lattice-genesis/captures/seeds';
mkdirSync(OUT, { recursive: true });
const seeds = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
for (const seed of seeds) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://localhost:5180/?bare=1&seed=' + seed, { waitUntil: 'networkidle' });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: OUT + '/seed-' + seed + '.png' });
  console.log('seed', seed, 'captured');
  await page.close();
}
await browser.close();
