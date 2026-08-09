/**
 * Composition targets, poster and social image — all cut from the real
 * scene so the still the visitor sees first is the frame the live scene
 * resolves into.
 *
 *   node tools/frames.mjs [baseUrl]
 *
 * Writes:
 *   design/frames/full-form-1440x900.png
 *   design/frames/tunnel-1440x900.png
 *   design/frames/latent-form-1440x900.png
 *   public/fallback/monolith-hero.png
 *   public/social/og-dark-lattice.jpg
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launch, settle, seek } from './browser.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';

await mkdir('design/frames', { recursive: true });
await mkdir('public/fallback', { recursive: true });
await mkdir('public/social', { recursive: true });

const browser = await launch();

// ---- Composition targets, with the copy in place ---------------------
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await settle(page);

  const targets = [
    { file: 'design/frames/full-form-1440x900.png', at: 0.05 },
    { file: 'design/frames/tunnel-1440x900.png', at: 0.55 },
    { file: 'design/frames/latent-form-1440x900.png', at: 0.92 },
  ];

  for (const target of targets) {
    await seek(page, target.at, 2200);
    await page.screenshot({ path: path.resolve(target.file) });
    console.log(`wrote ${target.file}`);
  }
  await context.close();
}

// ---- Poster: the hero composition with the copy hidden ---------------
//
// The poster sits UNDER the live copy, so it must carry the subject and
// the void and nothing else, or the type prints twice during the
// crossfade.
{
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.25,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await settle(page);
  await seek(page, 0, 2400);
  await page.addStyleTag({
    content: '.prologue__copy, .masthead, .skip-link { opacity: 0 !important; }',
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve('public/fallback/monolith-hero.png') });
  console.log('wrote public/fallback/monolith-hero.png');

  // ---- Social image, from the same composition ----------------------
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.waitForTimeout(1200);
  await seek(page, 0, 1800);
  await page.addStyleTag({
    content: '.masthead, .skip-link { opacity: 0 !important; }',
  });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.resolve('public/social/og-dark-lattice.jpg'),
    type: 'jpeg',
    quality: 88,
  });
  console.log('wrote public/social/og-dark-lattice.jpg');
  await context.close();
}

await browser.close();
