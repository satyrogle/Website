/**
 * Gate A diagnostics.
 *
 *   A11  measured projected area per mass, with a side legend
 *   A13  the dominant A/B interface, coloured by detected segment
 *   A14  depth tier against visible vertical range
 *
 * These are geometry diagnostics, not beauty renders. A11 and A13 are
 * drawn from the object-ID masks and the measurement file, so what they
 * show is what was measured, not a redrawing of the intent.
 *
 *   node tools/clay-diagnostics.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launch } from './browser.mjs';

const CLAY = path.resolve('design/clay', process.env.DL_CLAY_DIR ?? 'r2');
const MEASURE = path.resolve('design/clay', process.env.DL_MEASURE ?? 'gate-a-r2-measurements.json');

const TIER_COLOUR = { front: '#f2f4f6', mid: '#8c959e', rear: '#4a5560' };
const ROLE_COLOUR = {
  dominant_a: '#4ac9f5',
  dominant_b: '#2fd8ac',
  supporting: '#eef0f2',
  rear_structural: '#c99a52',
};
const SEGMENT_COLOURS = ['#4ac9f5', '#e0776b', '#2fd8ac', '#c99a52', '#8a5cd8', '#f2f4f6'];

async function dataUrl(file) {
  return 'data:image/png;base64,' + (await readFile(path.join(CLAY, file))).toString('base64');
}

async function main() {
  const measurements = JSON.parse(await readFile(MEASURE, 'utf8'));
  const hero = await dataUrl('A09-hero-type-safe-zone.png');
  const elevation = await dataUrl('A01-front-1440x900.png');

  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto('data:text/html,<body></body>');

  // ---- A11: areas, with a legend instead of labels on centroids -----
  const a11 = await page.evaluate(
    async ({ src, areas, roleColour }) => {
      const img = await new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.src = src;
      });
      const xs = areas.filter((a) => a.centroid).map((a) => a.centroid[0]);
      const ys = areas.filter((a) => a.centroid).map((a) => a.centroid[1]);
      const pad = 150;
      const x0 = Math.max(0, Math.min(...xs) - pad);
      const x1 = Math.min(img.width, Math.max(...xs) + pad);
      const y0 = Math.max(0, Math.min(...ys) - pad);
      const y1 = Math.min(img.height, Math.max(...ys) + pad);

      const legend = 330;
      const c = document.createElement('canvas');
      c.width = x1 - x0 + legend;
      c.height = y1 - y0;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0b0d11';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, legend, 0, x1 - x0, y1 - y0);

      // Leader lines from the legend to each mass, so nothing is written
      // over a close centroid.
      const rows = [...areas].sort((a, b) => b.percent - a.percent);
      const step = Math.min(46, (c.height - 60) / rows.length);
      rows.forEach((a, i) => {
        if (!a.centroid) return;
        const ly = 40 + i * step;
        const tx = legend + a.centroid[0] - x0;
        const ty = a.centroid[1] - y0;
        ctx.strokeStyle = 'rgba(140, 149, 158, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(legend - 12, ly);
        ctx.lineTo(legend - 4, ly);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = roleColour[a.role] ?? '#eef0f2';
        ctx.beginPath();
        ctx.arc(tx, ty, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'right';
        ctx.font = '600 19px ui-monospace, monospace';
        ctx.fillText(a.percent.toFixed(1) + '%', legend - 20, ly + 6);
        ctx.font = '400 14px ui-monospace, monospace';
        ctx.fillStyle = '#99a1a9';
        ctx.fillText(a.name.slice(-2) + '  ' + a.role + '  ' + a.tier, legend - 78, ly + 6);
      });
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef0f2';
      ctx.font = '600 15px sans-serif';
      ctx.fillText('projected area, hero framing', 16, 20);
      return c.toDataURL('image/png');
    },
    { src: hero, areas: measurements.areas, roleColour: ROLE_COLOUR }
  );
  await writeFile(path.join(CLAY, 'A11-mass-area-overlay.png'), Buffer.from(a11.split(',')[1], 'base64'));

  // ---- A13: the dominant interface, by detected segment --------------
  const a13 = await page.evaluate(
    async ({ src, iface, colours }) => {
      const img = await new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.src = src;
      });
      const box = iface.box;
      const pad = 90;
      const x0 = Math.max(0, box.minX - pad);
      const x1 = Math.min(img.width, box.maxX + pad);
      const y0 = Math.max(0, box.minY - 40);
      const y1 = Math.min(img.height, box.maxY + 40);

      const panel = 360;
      const c = document.createElement('canvas');
      c.width = x1 - x0 + panel;
      c.height = y1 - y0;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0b0d11';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalAlpha = 0.4;
      ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, panel, 0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;

      const edgeA = new Map(iface.edgeA);
      const edgeB = new Map(iface.edgeB);
      const segments = iface.segments.filter((s) => s.heightPercent >= 1.0);

      segments.forEach((seg, index) => {
        const rows = seg.side === 'a' ? edgeA : edgeB;
        ctx.strokeStyle = colours[index % colours.length];
        ctx.lineWidth = seg.side === 'a' ? 3 : 2;
        ctx.setLineDash(seg.side === 'a' ? [] : [6, 5]);
        ctx.beginPath();
        let started = false;
        for (let y = seg.from; y <= seg.to; y++) {
          const x = rows.get(y);
          if (x === undefined) continue;
          const px = panel + x - x0;
          const py = y - y0;
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Breakpoints: where one segment ends and the next begins.
      ctx.fillStyle = '#e0776b';
      const breaks = new Set();
      segments.forEach((s) => breaks.add(s.from));
      [...breaks].forEach((y) => {
        const py = y - y0;
        ctx.fillRect(panel - 6, py - 1, x1 - x0 + 6, 1);
      });

      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef0f2';
      ctx.font = '600 16px sans-serif';
      ctx.fillText('dominant interface, by measured segment', 16, 24);
      ctx.font = '400 13px ui-monospace, monospace';
      ctx.fillStyle = '#99a1a9';
      ctx.fillText('solid = ' + iface.a.slice(-2) + ' edge   dashed = ' + iface.b.slice(-2) + ' edge', 16, 46);
      ctx.fillText('total fitted straight edge  ' + iface.aggregatePercent, 16, 70);
      ctx.fillText('longest contiguous segment  ' + iface.longestSegmentPercent + '%', 16, 90);

      segments.forEach((seg, index) => {
        const y = 124 + index * 22;
        ctx.fillStyle = colours[index % colours.length];
        ctx.fillRect(16, y - 9, 18, 3);
        ctx.fillStyle = '#c3c9cf';
        ctx.font = '400 13px ui-monospace, monospace';
        ctx.fillText(
          (seg.side === 'a' ? 'A' : 'B') +
            '  rows ' + seg.from + '-' + seg.to +
            '   ' + seg.heightPercent.toFixed(1) + '% of height',
          44,
          y
        );
      });
      return c.toDataURL('image/png');
    },
    {
      src: elevation,
      iface: {
        ...measurements.interface,
        aggregatePercent: measurements.checks.find((c) => c.id === 'straight-aperture-edge').value,
      },
      colours: SEGMENT_COLOURS,
    }
  );
  await writeFile(path.join(CLAY, 'A13-dominant-interface-segments.png'), Buffer.from(a13.split(',')[1], 'base64'));

  // ---- A14: depth tier against visible vertical range ----------------
  const a14 = await page.evaluate(
    async ({ src, areas, box, tierColour, height }) => {
      const img = await new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.src = src;
      });
      const chart = 620;
      const c = document.createElement('canvas');
      c.width = chart + 520;
      c.height = 760;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0b0d11';
      ctx.fillRect(0, 0, c.width, c.height);

      const scale = (c.height - 120) / (box.maxY - box.minY);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(
        img,
        box.minX - 60, box.minY, box.width + 120, box.height,
        chart + 40, 60, (box.width + 120) * scale, box.height * scale
      );
      ctx.globalAlpha = 1;

      const order = ['front', 'mid', 'rear'];
      const rows = [...areas].sort(
        (a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || b.percent - a.percent
      );
      const bar = 46;
      rows.forEach((a, i) => {
        const x = 130 + i * ((chart - 170) / rows.length);
        const top = 60 + (a.top - box.minY) * scale;
        const bottom = 60 + (a.bottom - box.minY) * scale;
        ctx.fillStyle = tierColour[a.tier];
        ctx.fillRect(x, top, bar, Math.max(bottom - top, 3));
        ctx.strokeStyle = '#0b0d11';
        ctx.strokeRect(x, top, bar, Math.max(bottom - top, 3));

        ctx.save();
        ctx.translate(x + bar / 2, bottom + 12);
        ctx.rotate(Math.PI / 2);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#c3c9cf';
        ctx.font = '400 13px ui-monospace, monospace';
        ctx.fillText(a.name.slice(-2) + '  ' + a.percent.toFixed(1) + '%  ' + a.tier, 0, 4);
        ctx.restore();
      });

      // Tier bands, to show whether a tier occupies one horizontal slab.
      order.forEach((tier, i) => {
        const members = areas.filter((a) => a.tier === tier);
        if (!members.length) return;
        const top = 60 + (Math.min(...members.map((m) => m.top)) - box.minY) * scale;
        const bottom = 60 + (Math.max(...members.map((m) => m.bottom)) - box.minY) * scale;
        ctx.strokeStyle = tierColour[tier];
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.strokeRect(24 + i * 10, top, chart - 60 - i * 20, bottom - top);
        ctx.setLineDash([]);
        ctx.fillStyle = tierColour[tier];
        ctx.font = '600 13px ui-monospace, monospace';
        ctx.fillText(tier, 26 + i * 10, top - 6);
      });

      ctx.fillStyle = '#eef0f2';
      ctx.font = '600 16px sans-serif';
      ctx.fillText('depth tier against visible vertical range', 20, 30);
      ctx.font = '400 13px ui-monospace, monospace';
      ctx.fillStyle = '#99a1a9';
      ctx.fillText('form height ' + height.toFixed(2) + ' units, hero framing', 20, 50);
      return c.toDataURL('image/png');
    },
    {
      src: elevation,
      areas: measurements.areas,
      box: measurements.interface.box,
      tierColour: TIER_COLOUR,
      height: measurements.authored.height,
    }
  );
  await writeFile(path.join(CLAY, 'A14-depth-height-interleave.png'), Buffer.from(a14.split(',')[1], 'base64'));

  await browser.close();
  console.log('wrote A11, A13, A14 into ' + CLAY);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
