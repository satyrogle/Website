/**
 * Generates the fallback poster from the ACTUAL final hero composition.
 *
 * The previous poster was a hand-authored SVG that drew the old
 * procedural entity — it could drift from the site without anyone
 * noticing. This screenshots the real thing instead, so the no-WebGL
 * path can never show an entity the site no longer has.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5341';
const OUT = path.resolve(process.argv[3] ?? 'public/fallback/crowned-convergence-hero.png');

await mkdir(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);

// The poster is the entity alone: chrome and copy belong to the DOM,
// which the fallback path still renders on top.
// Everything except the canvas is DOM, and the fallback path still
// renders that DOM on top of this image — so the poster must contain
// the entity and nothing else.
await page.addStyleTag({
  content: `body > *:not(#lattice-canvas) { opacity: 0 !important; }
            #lattice-canvas { opacity: 1 !important; }`,
});
await page.waitForTimeout(600);
await page.screenshot({ path: OUT });
await browser.close();
console.log('wrote', OUT);
