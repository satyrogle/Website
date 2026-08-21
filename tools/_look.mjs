import { launch, captures } from './env.mjs';
const b = await launch(['--hide-scrollbars']);
const p = await b.newPage({ viewport: { width: 2270, height: 1278 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('http://localhost:5181/', { waitUntil: 'networkidle' });
await p.mouse.move(1135, 639);
await p.waitForTimeout(5000);
await p.screenshot({ path: captures('look') + '/page.png' });
// the crown and the foot, close, since both are on Jacob's list
await p.screenshot({ path: captures('look') + '/crown.png', clip: { x: 860, y: 90, width: 560, height: 460 } });
await p.screenshot({ path: captures('look') + '/foot.png', clip: { x: 800, y: 780, width: 700, height: 490 } });
console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'console clean');
await b.close();
