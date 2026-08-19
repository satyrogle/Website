import { createRequire } from 'node:module';
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const msgs = [];
p.on('console', (m) => { if (!/useProgram/.test(m.text())) msgs.push(m.type() + ': ' + m.text().slice(0, 1800)); });
p.on('pageerror', (e) => msgs.push('pageerror: ' + String(e).slice(0, 400)));
await p.goto('http://localhost:5180', { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
const info = await p.evaluate(() => {
  const c = document.getElementById('world');
  return { canvas: !!c, w: c && c.width, h: c && c.height };
});
console.log('CANVAS', JSON.stringify(info));
console.log(msgs.length ? msgs.join('\n---\n') : 'NO CONSOLE ERRORS');
await b.close();
