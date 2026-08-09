/**
 * Gate A contact sheet.
 *
 * Composites the ten required clay renders into one sheet for founder
 * review, and draws the two overlays that cannot come out of Blender:
 * the hero copy column and the halo guide's footprint.
 *
 *   node tools/clay-contact-sheet.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launch } from './browser.mjs';

const CLAY = path.resolve('design/clay', process.env.DL_CLAY_DIR ?? 'r2');
const SHEET = path.resolve('design/clay', process.env.DL_SHEET ?? 'GATE-A-R2-contact-sheet.png');
const MEASURE = path.resolve('design/clay', process.env.DL_MEASURE ?? 'gate-a-r2-measurements.json');

const TILES = [
  ['A01-front-1440x900.png', 'A01 front elevation'],
  ['A02-three-quarter-left.png', 'A02 three-quarter left'],
  ['A03-three-quarter-right.png', 'A03 three-quarter right'],
  ['A04-side.png', 'A04 side'],
  ['A09-hero-type-safe-zone.png', 'A09 hero, copy column and halo guide'],
  ['A08-depth-tiers.png', 'A08 depth tiers — front / mid / rear'],
  ['A07-gaps-only.png', 'A07 gaps only'],
  ['A05-silhouette-512.png', 'A05 silhouette 512'],
  ['A06-silhouette-128.png', 'A06 silhouette 128'],
  ['A10-mobile-silhouette-390x844.png', 'A10 mobile silhouette 390×844'],
  ['A11-mass-area-overlay.png', 'A11 measured projected area per mass'],
  ['A12-spine-recess-close.png', 'A12 hero recess and inner spine, close'],
  ['A13-dominant-interface-segments.png', 'A13 dominant interface, by measured segment'],
  ['A14-depth-height-interleave.png', 'A14 depth tier against vertical range'],
];

async function dataUrl(file) {
  const buffer = await readFile(path.join(CLAY, file));
  return 'data:image/png;base64,' + buffer.toString('base64');
}

async function main() {
  const images = {};
  for (const [file] of TILES) images[file] = await dataUrl(file);
  images['A00-halo-hero.png'] = await dataUrl('A00-halo-hero.png');
  const measurements = JSON.parse(await readFile(MEASURE, 'utf8'));

  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: 1800, height: 1600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto('data:text/html,<body></body>');

  // ---- A09 overlay -------------------------------------------------
  // The copy column is the left 44% of the frame, which is what the
  // hero lens shift is sized to protect. The halo guide is traced from
  // its own mask so the outline is the real footprint.
  const overlay = await page.evaluate(async ({ hero, halo }) => {
    const load = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = src;
      });
    const base = await load(hero);
    const mask = await load(halo);

    const c = document.createElement('canvas');
    c.width = base.width;
    c.height = base.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);

    // Halo footprint, traced from the mask's extreme columns and rows.
    const m = document.createElement('canvas');
    m.width = mask.width;
    m.height = mask.height;
    const mctx = m.getContext('2d', { willReadFrequently: true });
    mctx.drawImage(mask, 0, 0);
    const data = mctx.getImageData(0, 0, m.width, m.height).data;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (data[(y * m.width + x) * 4] > 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(201, 154, 82, 0.85)';
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        (maxX - minX) / 2,
        (maxY - minY) / 2,
        0, 0, Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    const column = Math.round(c.width * 0.44);
    ctx.save();
    ctx.strokeStyle = 'rgba(74, 201, 245, 0.9)';
    ctx.setLineDash([12, 8]);
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 96, column - 96, c.height - 260);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(74, 201, 245, 0.95)';
    ctx.font = '600 22px sans-serif';
    ctx.fillText('copy column', 62, 130);
    ctx.restore();

    return c.toDataURL('image/png');
  }, { hero: images['A09-hero-type-safe-zone.png'], halo: images['A00-halo-hero.png'] });

  await writeFile(
    path.join(CLAY, 'A09-hero-type-safe-zone.png'),
    Buffer.from(overlay.split(',')[1], 'base64')
  );
  images['A09-hero-type-safe-zone.png'] = overlay;

  // ---- Sheet --------------------------------------------------------
  const rows = measurements.checks
    .map(
      (c) =>
        `<tr class="${c.pass ? 'ok' : 'no'}"><td>${c.pass ? 'PASS' : 'FAIL'}</td><td>${c.id}</td><td>${c.value}</td><td>${c.target}</td></tr>`
    )
    .join('');

  const tiles = TILES.map(
    ([file, label]) =>
      `<figure><img src="${images[file]}" alt=""><figcaption>${label}</figcaption></figure>`
  ).join('');

  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #0b0d11; color: #eef0f2;
             font-family: Inter, system-ui, sans-serif; padding: 34px; }
      h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: 0.01em; }
      p.sub { margin: 0 0 26px; color: #858d94; font-size: 14px; }
      .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
      figure { margin: 0; }
      img { width: 100%; height: 216px; object-fit: contain; display: block;
            background: #05070a; border: 1px solid #1d232c; }
      figcaption { font-size: 12px; color: #99a1a9; padding-top: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 26px; font-size: 13px; }
      td { padding: 5px 10px 5px 0; border-bottom: 1px solid #1d232c; }
      td:first-child { width: 58px; font-family: ui-monospace, monospace; }
      tr.ok td:first-child { color: #2fd8ac; }
      tr.no td:first-child { color: #e0776b; }
      td:nth-child(2) { font-family: ui-monospace, monospace; color: #c3c9cf; width: 220px; }
      td:nth-child(4) { color: #858d94; }
    </style>
    <h1>Gate A R2 — Full Form clay, piecewise dominant interface</h1>
    <p class="sub">design/clay/DL_FullForm_v04_clay.glb · clay only, no material, no fissures, no emission</p>
    <div class="grid">${tiles}</div>
    <table>${rows}</table>
  `);
  await page.waitForTimeout(600);
  const box = await page.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { width: Math.ceil(r.width), height: Math.ceil(r.height) + 34 };
  });
  await page.screenshot({
    path: SHEET,
    clip: { x: 0, y: 0, ...box },
  });
  await browser.close();
  console.log('wrote ' + SHEET);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
