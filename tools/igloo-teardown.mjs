/**
 * igloo-teardown.mjs — what is igloo.inc actually made of?
 *
 * Read-only inspection of a reference site, for calibration only. We extract
 * TECHNIQUE and BUDGET, never code or assets. The constitution still decides
 * the design; this only tells us what the target costs to build.
 *
 *   node tools/igloo-teardown.mjs
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('captures/reference/igloo-teardown');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const assets = [];
page.on('response', (r) => {
  const u = r.url();
  const len = Number(r.headers()['content-length'] || 0);
  const type = r.headers()['content-type'] || '';
  assets.push({ u, len, type });
});

await page.goto('https://www.igloo.inc/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);
await page.bringToFront().catch(() => {});

const gl = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return { canvas: false, globals: [] };
  const g = c.getContext('webgl2') || c.getContext('webgl');
  const dbg = g && g.getExtension('WEBGL_debug_renderer_info');
  const exts = g ? g.getSupportedExtensions() : [];
  return {
    canvas: true,
    size: [c.width, c.height],
    css: [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)],
    dpr: window.devicePixelRatio,
    api: typeof WebGL2RenderingContext !== 'undefined' && g instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1',
    maxTex: g ? g.getParameter(g.MAX_TEXTURE_SIZE) : 0,
    floatLinear: exts.includes('OES_texture_float_linear'),
    colorBufferFloat: exts.includes('EXT_color_buffer_float'),
    three: window.THREE ? window.THREE.REVISION : null,
    globals: Object.keys(window).filter((k) => /three|gsap|lenis|scroll|tone|howl|spline|fiber/i.test(k)).slice(0, 20),
  };
});

const scrollProbe = await page.evaluate(async () => {
  const h = document.body.scrollHeight;
  const vh = innerHeight;
  const marks = [];
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    window.scrollTo(0, (h - vh) * f);
    await new Promise((r) => setTimeout(r, 1400));
    marks.push({
      f,
      text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 130),
    });
  }
  window.scrollTo(0, 0);
  return { pages: +(h / vh).toFixed(1), marks };
});

const fracs = [0, 0.2, 0.4, 0.6, 0.8];
for (let i = 0; i < fracs.length; i++) {
  await page.evaluate((fr) => window.scrollTo(0, (document.body.scrollHeight - innerHeight) * fr), fracs[i]);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: path.join(OUT, `scroll-${i}-${Math.round(fracs[i] * 100)}pc.png`) });
}

const byType = {};
let total = 0;
for (const a of assets) {
  total += a.len;
  const k = /\.(glb|gltf)/i.test(a.u) ? 'model'
    : /\.(ktx2|basis|webp|png|jpg|jpeg|avif|hdr|exr)/i.test(a.u) ? 'texture'
    : /\.(woff2?|ttf|otf)/i.test(a.u) ? 'font'
    : /\.(mp3|ogg|wav|m4a)/i.test(a.u) ? 'audio'
    : /\.(mp4|webm)/i.test(a.u) ? 'video'
    : /javascript|\.js/i.test(a.type + a.u) ? 'script'
    : 'other';
  byType[k] = byType[k] || { n: 0, bytes: 0, max: 0, biggest: '' };
  byType[k].n++;
  byType[k].bytes += a.len;
  if (a.len > byType[k].max) { byType[k].max = a.len; byType[k].biggest = a.u.split('/').pop().split('?')[0].slice(0, 58); }
}

console.log('\n=== IGLOO.INC TEARDOWN ===');
console.log(`canvas ${gl.size ? gl.size.join('x') : 'none'}  css ${gl.css ? gl.css.join('x') : '-'}  dpr ${gl.dpr}  ${gl.api}`);
console.log(`three r${gl.three ?? 'not exposed'}   globals: ${gl.globals.join(', ') || 'none exposed'}`);
console.log(`float-linear ${gl.floatLinear}  color-buffer-float ${gl.colorBufferFloat}  maxTexture ${gl.maxTex}`);
console.log(`scroll: ${scrollProbe.pages} viewports`);
console.log('\nASSET BUDGET');
for (const [k, v] of Object.entries(byType).sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`  ${k.padEnd(8)} ${String(v.n).padStart(3)} files  ${(v.bytes / 1048576).toFixed(2)} MB   biggest: ${v.biggest}`);
}
console.log(`  TOTAL ${(total / 1048576).toFixed(1)} MB`);
console.log('\nWHAT THE PAGE SAYS AS YOU SCROLL');
for (const m of scrollProbe.marks) console.log(`  ${String(Math.round(m.f * 100)).padStart(3)}%  ${m.text.slice(0, 110)}`);

await writeFile(path.join(OUT, 'teardown.json'), JSON.stringify({ gl, scrollProbe, byType, total }, null, 2));
console.log(`\nframes + teardown.json in ${OUT}\n`);
await browser.close();
