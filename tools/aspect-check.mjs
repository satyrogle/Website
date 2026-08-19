// Capture the opening at Jacob's viewport, to compare like for like.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');
mkdirSync('C:/Users/jacob/dark-lattice-genesis/captures/aspect', { recursive: true });
const b = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
for (const [w, h, name] of [[1165, 1128, 'jacob-1165x1128'], [1600, 900, 'mine-1600x900']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('http://localhost:5180', { waitUntil: 'networkidle' });
  await p.mouse.move(4, 4);
  await p.waitForTimeout(5200);
  await p.screenshot({ path: `C:/Users/jacob/dark-lattice-genesis/captures/aspect/${name}.png` });
  console.log('shot', name);
  await p.close();
}
await b.close();
