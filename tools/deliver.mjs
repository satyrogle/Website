/**
 * Assembles the delivery folder described in the brief (§12).
 *
 *   node tools/deliver.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { mkdir, copyFile, readdir, cp } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = path.resolve(process.argv[3] ?? 'delivery');
const CAPTURES = path.resolve('captures');

await mkdir(OUT, { recursive: true });
await mkdir(path.join(OUT, 'qa'), { recursive: true });

// ---- Headline previews ------------------------------------------------
await copyFile(
  path.join(CAPTURES, 'hero-desktop-1440x900.png'),
  path.join(OUT, 'preview-desktop.png')
);
await copyFile(
  path.join(CAPTURES, 'hero-mobile-390x844.png'),
  path.join(OUT, 'preview-mobile.png')
);
await copyFile(
  path.resolve('public/social/og-dark-lattice.jpg'),
  path.join(OUT, 'og-dark-lattice.jpg')
);

// ---- Every QA capture, including the per-movement storyboard ----------
for (const entry of await readdir(CAPTURES, { withFileTypes: true })) {
  const from = path.join(CAPTURES, entry.name);
  const to = path.join(OUT, 'qa', entry.name);
  if (entry.isDirectory()) {
    await cp(from, to, { recursive: true });
  } else {
    await copyFile(from, to);
  }
}

// ---- Evidence section print preview -----------------------------------
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// A real browser fires `beforeprint` before building a print preview, and
// that is what opens the evidence disclosure. Playwright's emulateMedia
// does not fire it, so it has to be dispatched explicitly — otherwise the
// PDF silently omits the carry-over table and the deliverable is wrong.
await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(700);

const printState = await page.evaluate(() => ({
  open: document.querySelector('details[data-disclosure]')?.open === true,
  rows: [...document.querySelectorAll('.ledger tbody tr')].filter(
    (r) => r.getBoundingClientRect().height > 0
  ).length,
}));

if (!printState.open || printState.rows !== 11) {
  throw new Error(
    `Evidence not printable: open=${printState.open}, rows=${printState.rows} (expected 11)`
  );
}
console.log(`print preview: disclosure open, ${printState.rows} evidence rows`);

await page.pdf({
  path: path.join(OUT, 'evidence-print-preview.pdf'),
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
});

await page.emulateMedia({ media: 'screen' });
await browser.close();

console.log('delivery assembled at', OUT);
