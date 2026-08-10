/**
 * Cinema plate capture — render source only, never shipped from here.
 *
 * Drives the live scene to exact narrative progress values through
 * `window.__dlScene` and captures the entity ALONE: every DOM overlay is
 * hidden first, because v2 supplies its own copy and chrome and the old
 * page's wordmark must not be baked into a plate.
 *
 * Progress is the same 0..1 scalar `SceneController.setProgress` takes on
 * both branches, so a plate captured at p here lands at p in the v2
 * prologue. The stage boundaries the scene itself declares:
 *
 *     crowned / exterior   visible 0.00 - 0.26
 *     corridor / tunnel    between
 *     latent form          visible 0.68 - 1.00
 *
 *   node tools/cinema-plates.mjs [baseUrl] [outDir]
 *
 * The camera is a critically damped spring and this runs under
 * SwiftShader, where the spring converges in sim-time while the wall
 * clock stretches with the frame rate. Hence the long settle: a short
 * wait captures the camera mid-flight.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = path.resolve(process.argv[3] ?? 'captures/cinema');
const SETTLE = Number(process.env.SETTLE ?? 7000);

/** The six compositions the journey is cut into. */
const PLATES = [
  { name: '01-exterior-hero', at: 0.02, note: 'Full Form, composed hero' },
  { name: '02-exterior-disturbance', at: 0.16, note: 'Full Form, field disturbed' },
  { name: '03-opening', at: 0.34, note: 'the form opens' },
  { name: '04-tunnel', at: 0.52, note: 'corridor traversal' },
  { name: '05-latent-emerging', at: 0.78, note: 'destination emerges' },
  { name: '06-latent-form', at: 0.95, note: 'Latent Form, resolved' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
  ],
});

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[err]', m.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__dlScene, null, { timeout: 120000 });
  await page.waitForTimeout(6000);

  // Hide every DOM overlay, keeping only the canvas and its ancestors.
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const keep = new Set();
    for (let node = canvas; node; node = node.parentElement) keep.add(node);
    document.querySelectorAll('body *').forEach((el) => {
      if (!keep.has(el)) el.style.visibility = 'hidden';
    });
    document.documentElement.style.background = '#000';
    document.body.style.background = '#000';
    document.body.style.overflow = 'hidden';
  });

  // Progress cannot be set directly: ScrollDirector.tick() recomputes it
  // from window.scrollY on every animation frame and overwrites anything
  // pushed into the scene. Scroll IS the driver, and it also selects the
  // reaction-field preset for each band, which the plates have to carry.
  //
  // So advance FORWARD only, in small steps, reading the narrative back
  // off the progress readout. Monotonic travel is also what keeps the
  // field continuous: the disturbance seen at the Full Form is the same
  // one still present at the latent core.
  const readPct = () =>
    page.evaluate(() => Number(document.querySelector('[data-progress]')?.textContent ?? '0'));

  const advanceTo = async (targetPct) => {
    for (let guard = 0; guard < 600; guard++) {
      if ((await readPct()) >= targetPct) break;
      await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight * 0.22, 100)));
      await page.waitForTimeout(150);
    }
    return readPct();
  };

  for (const plate of PLATES) {
    const reached = await advanceTo(Math.round(plate.at * 100));
    plate[`reached_${viewport.name}`] = reached / 100;
    await page.waitForTimeout(SETTLE);
    const file = path.join(OUT, `${plate.name}-${viewport.name}.png`);
    // SwiftShader can hold the compositor well past playwright's 30s
    // default while the corridor and latent environments page in.
    await page.screenshot({ path: file, timeout: 180000, animations: 'allow' });
    console.log(
      `wrote ${plate.name}-${viewport.name}  target=${plate.at}  reached=${plate[`reached_${viewport.name}`]}  ${plate.note}`
    );
  }

  await page.close();
}

await browser.close();
console.log(`\n${PLATES.length} plates x ${VIEWPORTS.length} viewports into ${OUT}`);
