/**
 * awards-scan.mjs — what is actually winning, read off the award sites.
 *
 * Read-only. Public listing pages only. Extracts titles and technique tags so
 * we can see which techniques recur, rather than recalling them.
 *
 *   node tools/awards-scan.mjs
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('captures/awards');
await mkdir(OUT, { recursive: true });

const TARGETS = [
  { key: 'awwwards-sotd', url: 'https://www.awwwards.com/websites/' },
  { key: 'awwwards-soty', url: 'https://www.awwwards.com/annual-awards-2024/' },
  { key: 'godly', url: 'https://godly.website/' },
  { key: 'fwa', url: 'https://thefwa.com/' },
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

const out = {};

for (const t of TARGETS) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  });
  const page = await ctx.newPage();
  console.log(`\n=== ${t.key}`);
  try {
    await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(1200);
    }
  } catch (e) {
    console.log(`  LOAD FAILED: ${String(e.message).slice(0, 90)}`);
    await ctx.close();
    continue;
  }

  await page.screenshot({ path: path.join(OUT, `${t.key}.png`) }).catch(() => {});

  const data = await page.evaluate(() => {
    const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const links = [...document.querySelectorAll('a')]
      .map((a) => ({ t: txt(a).slice(0, 90), h: a.getAttribute('href') || '' }))
      .filter((x) => x.t.length > 2);

    const body = txt(document.body);
    const words = body.toLowerCase();

    const TERMS = [
      'webgl', 'three.js', 'threejs', 'gsap', 'shader', 'particle', 'particles',
      'generative', 'procedural', 'raymarch', 'ray march', 'point cloud',
      'fluid', 'simulation', 'physics', 'volumetric', 'fog', 'caustic',
      'subsurface', 'displacement', 'instanc', 'gpgpu', 'compute',
      'scroll', 'parallax', 'transition', 'page transition', 'morph',
      'typography', 'kinetic', 'spline', 'blender', 'houdini', 'unreal',
      'r3f', 'react three fiber', 'lenis', 'webgpu', 'post processing',
      'bloom', 'depth of field', 'ambient occlusion', 'pbr', 'hdri',
    ];
    const hits = {};
    for (const term of TERMS) {
      const m = words.split(term).length - 1;
      if (m > 0) hits[term] = m;
    }
    return { links: links.slice(0, 160), hits, chars: body.length };
  });

  const sorted = Object.entries(data.hits).sort((a, b) => b[1] - a[1]);
  console.log(`  page text ${data.chars} chars, ${data.links.length} links`);
  console.log(`  technique mentions: ${sorted.slice(0, 18).map(([k, v]) => k + ' ' + v).join(', ') || 'none'}`);

  const titles = data.links
    .filter((l) => /\/sites\/|\/website|\/project|\/inspiration\//.test(l.h))
    .map((l) => l.t)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 30);
  if (titles.length) console.log(`  entries: ${titles.slice(0, 12).join(' | ')}`);

  out[t.key] = { ...data, titles };
  await page.close();
  await ctx.close();
}

await writeFile(path.join(OUT, 'awards.json'), JSON.stringify(out, null, 2));
console.log(`\nwritten to ${OUT}\n`);
await browser.close();
