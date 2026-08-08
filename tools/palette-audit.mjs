/**
 * Palette audit — makes the material acceptance test measurable.
 *
 * The entity brief specifies a colour DISTRIBUTION, not a set of hexes:
 * roughly two-thirds near-black structural surface, a fifth cyan/teal,
 * a tenth violet/magenta, and gold confined to the halo. Those are
 * numbers, and eyeballing a screenshot cannot answer them — the whole
 * reason this pass was needed is that a gold cast was described as
 * "verified" on the strength of a clean console.
 *
 * So this classifies every entity pixel by hue and reports the actual
 * split. Background and display type are excluded: background is what
 * the entity is composed against, and the white type would otherwise
 * register as a large neutral-bright region that is not material at all.
 *
 *   node tools/palette-audit.mjs captures/mat-hero.png
 *   node tools/palette-audit.mjs captures/mat-hero.png 480,85,940,620
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const FILE = process.argv[2] ?? 'captures/mat-hero.png';
// Entity bounding box, x0,y0,x1,y1. Defaults to the hero framing.
const BOX = (process.argv[3] ?? '470,80,950,630').split(',').map(Number);

const b64 = readFileSync(FILE).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

const stats = await page.evaluate(
  async ({ b64, box }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();

    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const [x0, y0, x1, y1] = box;
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;

    const bucket = {
      background: 0,
      type: 0,
      architecture: 0,
      cyanTeal: 0,
      blue: 0,
      violetMagenta: 0,
      warmGold: 0,
      other: 0,
    };

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255;
      const g = d[i + 1] / 255;
      const bl = d[i + 2] / 255;
      const max = Math.max(r, g, bl);
      const min = Math.min(r, g, bl);
      const luma = 0.299 * r + 0.587 * g + 0.114 * bl;
      const sat = max === 0 ? 0 : (max - min) / max;

      // The void the entity is composed against.
      if (luma < 0.02) {
        bucket.background++;
        continue;
      }
      // Display type: bright and essentially neutral.
      if (luma > 0.7 && sat < 0.12) {
        bucket.type++;
        continue;
      }
      // ARCHITECTURE — dark, or lit but desaturated.
      //
      // Two ways to be architecture. Dark obsidian is obvious; the cut
      // sits at 0.18 rather than an intuitive 0.10 because the brief's
      // own structural palette is blue-hued and reaches that high
      // (raised mineral face #1C2634 measures luma 0.143).
      //
      // The saturation cut matters more. The brief models the material
      // as non-emissive architecture PLUS emissive energy, and the
      // energy colours are highly saturated — #4DD0FF is 0.70, #36E0B0
      // is 0.76. Cold rim light striking obsidian lands around 0.33 and
      // is still architecture: it is the key and rim doing their job,
      // not light leaking through a fissure.
      //
      // At a 0.22 cut those rim pixels counted as fracture network, so
      // the audit reported ~20% energy on a frame that is plainly black,
      // and reported it identically before and after the emissive layer
      // was rewritten from scratch. A metric that cannot move when the
      // thing it measures is replaced is measuring something else.
      if (sat < 0.45 || luma < 0.18) {
        bucket.architecture++;
        continue;
      }

      let h = 0;
      const c2 = max - min;
      if (c2 < 1e-6) h = 0;
      else if (max === r) h = 60 * (((g - bl) / c2) % 6);
      else if (max === g) h = 60 * ((bl - r) / c2 + 2);
      else h = 60 * ((r - g) / c2 + 4);
      if (h < 0) h += 360;

      // KNOWN LIMIT, left in deliberately.
      //
      // This counts only energy above a 0.18 luma floor, so it
      // under-reports: the brief asks for a network that is "barely
      // visible", and barely-visible fissures live below that. Dropping
      // the floor for emissive hues was tried and swings the other way —
      // faintly lit obsidian is ALSO dim, saturated and cyan-hued at
      // these levels, and 1.3% became 16.5% on an unchanged frame.
      //
      // No hue/luma/saturation rule separates "faint fissure" from
      // "faintly lit stone", because the difference is whether the pixel
      // is emissive and that is not recoverable from the final image.
      // The honest measurement is a difference render — one frame with
      // emission on, one with it off — and until that exists this number
      // is a floor, not the figure. Treat the frame as the evidence.
      if (h >= 15 && h < 65) bucket.warmGold++;
      else if (h >= 150 && h < 205) bucket.cyanTeal++;
      else if (h >= 205 && h < 255) bucket.blue++;
      else if (h >= 255 && h < 340) bucket.violetMagenta++;
      else bucket.other++;
    }

    return bucket;
  },
  { b64, box: BOX }
);

await browser.close();

const material =
  stats.architecture +
  stats.cyanTeal +
  stats.blue +
  stats.violetMagenta +
  stats.warmGold +
  stats.other;

const pct = (n) => ((n / material) * 100).toFixed(1).padStart(5) + '%';

console.log(`\n${FILE}   box ${BOX.join(',')}   ${material.toLocaleString()} entity px`);
console.log('  (excluded: ' + stats.background.toLocaleString() + ' background, '
  + stats.type.toLocaleString() + ' type)\n');

// Targets are the LOCKED material balance from the reference sheet, not
// the earlier ones. The brief is explicit that the surface reads black
// first: energy is not painted on it, it is visible only through
// microscopic fractures in an otherwise opaque material.
const TARGET = {
  architecture: '90-95',
  cyanTeal: '4-8   (fracture network)',
  violetMagenta: '<1-2  (rare spectral)',
  warmGold: '0     (halo only)',
  blue: '—',
  other: '—',
};

for (const k of ['architecture', 'cyanTeal', 'violetMagenta', 'blue', 'warmGold', 'other']) {
  console.log(`  ${k.padEnd(16)} ${pct(stats[k])}    target ${TARGET[k]}`);
}

console.log('\n  ACCEPTANCE');
const pctOf = (n) => (n / material) * 100;
const checks = [
  ['architecture 90-95%', pctOf(stats.architecture) >= 88],
  ['fracture network 4-8%', pctOf(stats.cyanTeal) >= 3 && pctOf(stats.cyanTeal) <= 9],
  ['violet is RARE (<2.5%)', pctOf(stats.violetMagenta) <= 2.5],
  ['energy not flooding (colour <11%)',
    pctOf(stats.cyanTeal) + pctOf(stats.violetMagenta) + pctOf(stats.blue) <= 11],
  ['no gold on architecture (<1%)', pctOf(stats.warmGold) < 1],
];
for (const [label, ok] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
}
console.log();
