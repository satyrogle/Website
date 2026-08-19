// Crop the crown out of the newest opening capture, so the tips can be
// judged at size instead of squinting at a 1600x900 frame.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');
mkdirSync('C:/Users/jacob/dark-lattice-genesis/captures/crown', { recursive: true });
const b = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:5180', { waitUntil: 'networkidle' });
await p.mouse.move(4, 4);
await p.waitForTimeout(5200);
const label = process.argv[2] || 'current';
await p.screenshot({
  path: `C:/Users/jacob/dark-lattice-genesis/captures/crown/${label}.png`,
  clip: process.argv[3] === 'foot' ? { x: 600, y: 560, width: 460, height: 340 } : { x: 640, y: 30, width: 380, height: 380 }
});
console.log('cropped', label);
await b.close();
