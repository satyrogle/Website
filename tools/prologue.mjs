/**
 * Prologue state captures.
 *
 * Every state in one session, so the reaction field carries across them
 * exactly as a visitor would experience it: the disturbance seen at the
 * Full Form is the same one still present at the latent core.
 *
 *   node tools/prologue.mjs [baseUrl] [outDir]
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launch, settle, seek, seekSection, renderer } from './browser.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = path.resolve(process.argv[3] ?? 'captures/prologue');

const PROLOGUE_STATES = [
  { name: 'full-form-hero', at: 0.02 },
  { name: 'full-form-disturbance', at: 0.14 },
  { name: 'opening', at: 0.3 },
  { name: 'tunnel-entry', at: 0.46 },
  { name: 'tunnel-midpoint', at: 0.6 },
  { name: 'latent-form', at: 0.86 },
];

const SECTIONS = [
  { name: 'desk42', selector: '#work' },
  { name: 'brawler', selector: '#work + .product' },
  { name: 'method', selector: '#method' },
  { name: 'evidence', selector: '#evidence' },
];

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900, states: 'all' },
  { name: 'laptop-1366x768', width: 1366, height: 768, states: ['full-form-hero', 'latent-form'], sections: ['desk42'] },
  { name: 'mobile-390x844', width: 390, height: 844, states: ['full-form-hero', 'tunnel-midpoint', 'latent-form'], sections: ['desk42', 'brawler', 'evidence'] },
];

await mkdir(OUT, { recursive: true });
const browser = await launch();
const errors = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.width < 768,
    hasTouch: vp.width < 768,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${vp.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${vp.name}: ${m.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await settle(page);

  for (const state of PROLOGUE_STATES) {
    if (vp.states !== 'all' && !vp.states.includes(state.name)) continue;
    await seek(page, state.at);
    await page.screenshot({ path: path.join(OUT, `${state.name}-${vp.name}.png`) });
    console.log(`captured ${state.name} @ ${vp.name}`);
  }

  for (const section of SECTIONS) {
    if (vp.sections && !vp.sections.includes(section.name)) continue;
    await seekSection(page, section.selector);
    await page.screenshot({ path: path.join(OUT, `${section.name}-${vp.name}.png`) });
    console.log(`captured ${section.name} @ ${vp.name}`);
  }

  await context.close();
}

// Reduced motion — composed stills, not a frozen animation frame.
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`reduced: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await settle(page);
  await seek(page, 0.02);
  await page.screenshot({ path: path.join(OUT, 'reduced-motion-hero-1440x900.png') });
  await seek(page, 0.86);
  await page.screenshot({ path: path.join(OUT, 'reduced-motion-latent-1440x900.png') });
  await context.close();
  console.log('captured reduced-motion states');
}

await browser.close();
console.log(`\nrenderer: ${renderer()}`);
console.log(errors.length ? `ERRORS ${errors.length}:\n  ${errors.slice(0, 6).join('\n  ')}` : 'no runtime errors');
if (errors.length) process.exitCode = 1;
