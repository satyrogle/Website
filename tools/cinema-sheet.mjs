/**
 * Composition gate sheet — the six candidate plates, desktop and mobile,
 * with the copy column marked so text-over-entity collisions are visible
 * before any compositor is written.
 *
 *   node tools/cinema-sheet.mjs [inDir] [outFile]
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const IN = path.resolve(process.argv[2] ?? 'captures/cinema');
const OUT = path.resolve(process.argv[3] ?? 'captures/cinema/GATE-COMPOSITION-sheet.png');

const PLATES = [
  ['01-exterior-hero', 'p 0.07 · Full Form, composed hero'],
  ['02-exterior-disturbance', 'p 0.20 · Full Form, field disturbed'],
  ['03-opening', 'p 0.44 · the form opens'],
  ['04-tunnel', 'p 0.56 · corridor traversal'],
  ['05-latent-emerging', 'p 0.91 · destination emerges'],
  ['06-latent-form', 'p 1.00 · Latent Form, resolved'],
];

const url = async (f) =>
  'data:image/png;base64,' + (await readFile(path.join(IN, f))).toString('base64');

const desktop = [];
const mobile = [];
for (const [name, caption] of PLATES) {
  desktop.push({ src: await url(`${name}-desktop.png`), caption });
  mobile.push({ src: await url(`${name}-mobile.png`), caption });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1400 } });
await page.goto('data:text/html,<body></body>');

const dataUrl = await page.evaluate(
  async ({ desktop, mobile }) => {
    const load = (src) =>
      new Promise((r) => {
        const i = new Image();
        i.onload = () => r(i);
        i.src = src;
      });
    const d = await Promise.all(desktop.map((p) => load(p.src)));
    const m = await Promise.all(mobile.map((p) => load(p.src)));

    const DW = 430;
    const DH = Math.round((DW * 900) / 1440);
    const MW = 150;
    const MH = Math.round((MW * 844) / 390);
    const pad = 26;

    const c = document.createElement('canvas');
    c.width = pad + (DW + pad) * 3;
    c.height = 150 + (DH + 54) * 2 + 40 + MH + 70;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = '#eef0f2';
    ctx.font = '600 26px sans-serif';
    ctx.fillText('Composition gate — six candidate plates', pad, 46);
    ctx.font = '400 15px ui-monospace, monospace';
    ctx.fillStyle = '#99a1a9';
    ctx.fillText('Aurora v13 render source. Entity only — v2 supplies its own copy.', pad, 74);
    ctx.fillStyle = '#4ac9f5';
    ctx.fillText('Cyan box = v2 copy column. Nothing important should sit under it.', pad, 98);

    d.forEach((img, i) => {
      const col = i % 3;
      const row = (i / 3) | 0;
      const x = pad + col * (DW + pad);
      const y = 130 + row * (DH + 54);
      ctx.drawImage(img, x, y, DW, DH);
      ctx.strokeStyle = 'rgba(74, 201, 245, 0.75)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      // v2's copy column: left ~44% of the frame.
      ctx.strokeRect(x + 6, y + 6, DW * 0.44, DH - 12);
      ctx.setLineDash([]);
      ctx.fillStyle = '#c3c9cf';
      ctx.font = '400 13px ui-monospace, monospace';
      ctx.fillText(desktop[i].caption, x, y + DH + 20);
    });

    const my = 130 + (DH + 54) * 2 + 30;
    ctx.fillStyle = '#eef0f2';
    ctx.font = '600 17px sans-serif';
    ctx.fillText('mobile 390 x 844', pad, my - 8);
    m.forEach((img, i) => {
      const x = pad + i * (MW + pad);
      ctx.drawImage(img, x, my + 10, MW, MH);
    });

    return c.toDataURL('image/png');
  },
  { desktop, mobile }
);

await writeFile(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();
console.log('wrote ' + OUT);
