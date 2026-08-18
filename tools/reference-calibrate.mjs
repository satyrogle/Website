/**
 * reference-calibrate.mjs — measure reference websites against the same metrics
 * used to judge our own frames.
 *
 * The point is not to admire them. It is to convert "brutally dark, extremely
 * high end" from an adjective into numbers we can design against. Gate B judged
 * our frames on percentage near-black, light concentration and subject
 * centroid; this runs the identical measurement on sites Jacob rates, so we can
 * see exactly where our target was wrong.
 *
 * Headed Chrome on the real card, because every site here is WebGL-heavy and a
 * software raster would lie about all of it.
 *
 *   node tools/reference-calibrate.mjs
 *   node tools/reference-calibrate.mjs --wait 12000
 *
 * Extracts principles and measurements only. No code, no assets. A reference
 * site calibrates the target; the constitution still decides the design.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const WAIT = Number(argValue('wait', 9000));
const OUT = path.resolve(argValue('out', 'captures/reference'));

const SITES = [
  { key: "samsy", url: "https://samsy.ninja/" },
  { key: "houseofmoves", url: "https://hennessy-house-of-moves.hello-jury.com/" },
  { key: "immersivegarden", url: "https://immersive-g.com/" },
  { key: "gehry", url: "https://gehry.getty.edu/" },
  { key: "oceanx", url: "https://oceanx.org/" },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

/** Same luminance read the Gate B harness uses, so the numbers are comparable. */
const FRAME_STATS = () =>
  new Promise((resolve) => {
    const w = 480;
    const h = 300;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    resolve({ w, h });
  });

const results = [];

for (const site of SITES) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  let bytes = 0;
  const fonts = new Set();
  page.on('response', (r) => {
    const len = Number(r.headers()['content-length'] || 0);
    bytes += len;
    const u = r.url();
    if (/\.(woff2?|otf|ttf)(\?|$)/i.test(u)) fonts.add(u.split('/').pop().split('?')[0]);
  });

  console.log(`\n=== ${site.key}  ${site.url}`);
  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    console.log(`  LOAD FAILED: ${String(e.message).slice(0, 80)}`);
    await ctx.close();
    continue;
  }

  await page.waitForTimeout(WAIT);
  await page.bringToFront().catch(() => {});

  const shot = await page.screenshot({ type: 'png' });
  await writeFile(path.join(OUT, `${site.key}.png`), shot);

  const data = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 &&
        s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
      );
    };
    const textEls = [...document.querySelectorAll('h1,h2,h3,p,span,div,a,li,button')]
      .filter((e) => e.childElementCount === 0 && (e.textContent || '').trim().length > 1)
      .filter(vis);

    const measure = (el) => {
      const s = getComputedStyle(el);
      return {
        text: (el.textContent || '').trim().slice(0, 46),
        family: s.fontFamily.split(',')[0].replace(/["']/g, ''),
        size: Math.round(parseFloat(s.fontSize)),
        weight: s.fontWeight,
        tracking: s.letterSpacing,
        leading: s.lineHeight,
        transform: s.textTransform,
        colour: s.color,
      };
    };

    const bySize = textEls
      .map((e) => ({ el: e, s: parseFloat(getComputedStyle(e).fontSize) }))
      .sort((a, b) => b.s - a.s);

    const display = bySize.length ? measure(bySize[0].el) : null;
    const body = bySize.length
      ? measure(bySize[Math.min(bySize.length - 1, Math.floor(bySize.length * 0.6))].el)
      : null;

    const sizes = [...new Set(bySize.map((x) => Math.round(x.s)))].sort((a, b) => b - a);

    const canvases = [...document.querySelectorAll('canvas')].map((c) => ({
      w: c.width,
      h: c.height,
      cover: Math.round((c.getBoundingClientRect().width * c.getBoundingClientRect().height) /
        (innerWidth * innerHeight) * 100),
    }));

    const libs = [];
    if (window.THREE) libs.push('three ' + (window.THREE.REVISION || ''));
    if (window.gsap) libs.push('gsap ' + (window.gsap.version || ''));
    if (window.ScrollTrigger || (window.gsap && window.gsap.ScrollTrigger)) libs.push('ScrollTrigger');
    if (window.Lenis || window.lenis) libs.push('lenis');
    if (window.PIXI) libs.push('pixi');
    if (window.Spline || document.querySelector('spline-viewer')) libs.push('spline');
    if (window.__NEXT_DATA__) libs.push('next.js');
    if (window.React || document.querySelector('#__next,[data-reactroot]')) libs.push('react');
    if (window.Barba || window.barba) libs.push('barba');

    const bg = getComputedStyle(document.body).backgroundColor;
    return {
      title: document.title.slice(0, 70),
      display, body, sizes: sizes.slice(0, 12),
      scale: Math.round(bySize.length ? bySize[0].s / Math.max(1, parseFloat(getComputedStyle(bySize[Math.floor(bySize.length * 0.6)].el).fontSize)) : 0),
      canvases, libs, bg,
      scrollPages: +(document.body.scrollHeight / innerHeight).toFixed(1),
      domNodes: document.querySelectorAll('*').length,
      webgl2: (() => { try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false } })(),
    };
  });

  const px = await page.evaluate(() => new Promise((resolve) => {
    const w = 480, h = 300;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    resolve({ w, h });
  }));

  const d = data;
  console.log(`  ${d.title}`);
  console.log(`  bg ${d.bg}   scroll ${d.scrollPages} viewports   dom ${d.domNodes} nodes   ~${(bytes / 1048576).toFixed(1)} MB`);
  if (d.display) console.log(`  display  ${d.display.size}px ${d.display.weight} ${d.display.family}  track ${d.display.tracking}  lead ${d.display.leading}  ${d.display.transform}`);
  if (d.body) console.log(`  body     ${d.body.size}px ${d.body.weight} ${d.body.family}  lead ${d.body.leading}`);
  console.log(`  type scale ${d.sizes.join(' / ')}`);
  console.log(`  canvas ${d.canvases.length ? d.canvases.map((c) => `${c.w}x${c.h} (${c.cover}% of viewport)`).join(', ') : 'none'}`);
  console.log(`  libs ${d.libs.join(', ') || 'none detected'}`);
  console.log(`  fonts ${[...fonts].slice(0, 6).join(', ') || 'none seen'}`);

  results.push({ site: site.key, ...d, mb: +(bytes / 1048576).toFixed(1), fonts: [...fonts] });
  await page.close();
  await ctx.close();
}

await writeFile(path.join(OUT, 'calibration.json'), JSON.stringify(results, null, 2));
console.log(`\nscreenshots + calibration.json in ${OUT}\n`);
await browser.close();
