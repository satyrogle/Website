/**
 * causal-pulse-capture.mjs — the visual proof.
 *
 * Six stills plus a WebM of one deterministic strike, and pixel measurements of
 * the two claims that can only be checked in the image: that cyan leads and
 * violet follows, and that untouched structure stays near-black.
 *
 * Rendered through SwiftShader (software). Composition, colour and behaviour
 * are valid evidence here. FRAME TIME IS NOT — the timing this reports is the
 * software renderer's and is labelled separately.
 *
 *   node tools/causal-pulse-capture.mjs [http://localhost:5342] [captures/causal-pulse]
 */

import { mkdirSync, readFileSync, renameSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5342';
const OUT = process.argv[3] ?? 'captures/causal-pulse';
const URL = `${BASE}/causal-pulse.html?auto=0`;
const STRIKE_NODE = 2879;

const WIDTH = 1440;
const HEIGHT = 900;
// The entity occupies the centre; this crop excludes the header and inspector.
const CROP = { x0: 380, y0: 200, x1: 980, y1: 880 };

const MOMENTS = [
  { file: 'before.png', at: 0 },
  { file: 'impact.png', at: 0.16 },
  { file: 'propagation-early.png', at: 0.35 },
  { file: 'propagation-mid.png', at: 0.7 },
  { file: 'propagation-late.png', at: 1.5 },
  { file: 'retained.png', at: 7.5 },
];

// ------------------------------------------------------------- PNG decoding

function decodePng(buffer) {
  let at = 8;
  let width = 0, height = 0, colorType = 6, bitDepth = 8;
  const idat = [];

  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('ascii', at + 4, at + 8);
    const data = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + length;
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG: bitDepth ${bitDepth}, colorType ${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const target = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? target[x - channels] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= channels ? prior[x - channels] : 0;
      let value = line[x];
      switch (filter) {
        case 1: value += a; break;
        case 2: value += b; break;
        case 3: value += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: break;
      }
      target[x] = value & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

/**
 * Hue balance and darkness over the entity crop. Cyan score rewards blue+green
 * over red; magenta score rewards red+blue over green. Both are means over the
 * crop, so a few bright pixels cannot carry the result.
 */
function measure(path) {
  const image = decodePng(readFileSync(path));
  const { channels, data, width } = image;
  let cyan = 0, magenta = 0, luma = 0, nearBlack = 0, count = 0;
  let maxCyan = 0, maxMagenta = 0, maxLuma = -1, core = [0, 0, 0];

  for (let y = CROP.y0; y < CROP.y1; y++) {
    for (let x = CROP.x0; x < CROP.x1; x++) {
      const at = (y * width + x) * channels;
      const r = data[at], g = data[at + 1], b = data[at + 2];
      const c = Math.max(0, (g + b) / 2 - r);
      const mg = Math.max(0, (r + b) / 2 - g);
      cyan += c; magenta += mg;
      if (c > maxCyan) maxCyan = c;
      if (mg > maxMagenta) maxMagenta = mg;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luma += l;
      // The brightest pixel is the core of whatever is happening. A cyan-white
      // core saturates toward neutral, so its hue must be read directly rather
      // than through a channel-difference score that scores white as zero.
      if (l > maxLuma) { maxLuma = l; core = [r, g, b]; }
      if (Math.max(r, g, b) <= 12) nearBlack++;
      count++;
    }
  }

  return {
    cyan: cyan / count,
    magenta: magenta / count,
    maxCyan,
    maxMagenta,
    maxLuma,
    core,
    coreIsCool: core[2] >= core[0],
    meanLuma: luma / count,
    nearBlackShare: nearBlack / count,
  };
}

// -------------------------------------------------------------------- main

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const videoDir = `${OUT}/.video`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});

const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  recordVideo: { dir: videoDir, size: { width: WIDTH, height: HEIGHT } },
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__causalPulse), null, { timeout: 60000 });
await page.waitForTimeout(1500);

const frames = [];

// Moments are addressed in SIMULATION TICKS, not wall clock. Under a software
// renderer the main thread stalls, the Worker's accumulator backs up and it
// catches up at many times real speed — waiting 0.18s of wall clock landed
// 3.2 simulated seconds after the strike and every frame after impact looked
// identical. Ticks are exact regardless of how slowly the page renders.
const TICKS_PER_SECOND = 120;
const tickNow = () => page.evaluate(() => window.__causalPulse.state()?.tick ?? 0);

// Baseline first, before anything is struck.
await page.screenshot({ path: `${OUT}/${MOMENTS[0].file}` });
frames.push({ file: MOMENTS[0].file, atSeconds: 0, state: await page.evaluate(() => window.__causalPulse.state()) });

const strikeTick = await tickNow();
await page.evaluate((node) => window.__causalPulse.inject(node), STRIKE_NODE);

for (const moment of MOMENTS.slice(1)) {
  const target = strikeTick + Math.round(moment.at * TICKS_PER_SECOND);
  await page.waitForFunction(
    (wanted) => (window.__causalPulse.state()?.tick ?? 0) >= wanted,
    target,
    { timeout: 120000, polling: 16 },
  );

  const path = `${OUT}/${moment.file}`;
  await page.screenshot({ path });
  const state = await page.evaluate(() => window.__causalPulse.state());
  frames.push({ file: moment.file, atSeconds: moment.at, targetTick: target, state });
}

await page.waitForTimeout(1500);
await context.close();

// Playwright names the video by an internal id; rename to the required file.
const recorded = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
if (recorded) renameSync(`${videoDir}/${recorded}`, `${OUT}/causal-pulse.webm`);
rmSync(videoDir, { recursive: true, force: true });

// No-WebGL path must fail readably rather than showing a blank canvas.
const fallbackPage = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await fallbackPage.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
await fallbackPage.goto(URL, { waitUntil: 'networkidle' });
await fallbackPage.waitForTimeout(2500);
await fallbackPage.screenshot({ path: `${OUT}/fallback-no-webgl.png` });
const banner = await fallbackPage.evaluate(() => {
  const el = document.getElementById('lab-error');
  return el && !el.hidden ? el.textContent : null;
});
await fallbackPage.close();
await browser.close();

// ---------------------------------------------------------- pixel measures

const pixels = Object.fromEntries(MOMENTS.map((m) => [m.file, measure(`${OUT}/${m.file}`)]));

console.log('frame                     tick  reached  active  cyan   magenta  meanLuma  nearBlack');
for (const moment of MOMENTS) {
  const p = pixels[moment.file];
  const s = frames.find((f) => f.file === moment.file).state ?? {};
  console.log(
    `${moment.file.padEnd(24)}${String(s.tick ?? 0).padStart(6)}`
    + `${String(s.reachedNodes ?? 0).padStart(9)}${String(s.activeNodes ?? 0).padStart(8)}`
    + `${p.cyan.toFixed(2).padStart(7)}${p.magenta.toFixed(2).padStart(9)}`
    + `${p.meanLuma.toFixed(2).padStart(10)}${(p.nearBlackShare * 100).toFixed(1).padStart(10)}%`,
  );
}

const impact = pixels['impact.png'];
const early = pixels['propagation-early.png'];
const retained = pixels['retained.png'];
const before = pixels['before.png'];

/**
 * Precedence, not area. The travelling front is a thin bright band while the
 * retained trace is a broad field, so comparing their means in one frame
 * measures how much of the object each covers rather than which came first.
 * The ordering claim is: the front is the brightest feature at impact, cyan
 * falls away as the transient dies, and magenta only rises afterwards.
 */
const cyanLeads = impact.coreIsCool && early.coreIsCool
  && impact.cyan >= retained.cyan
  && impact.magenta < retained.magenta;
const violetFollows = retained.magenta > retained.cyan && retained.magenta > impact.magenta;
const unaffectedDark = retained.nearBlackShare >= 0.5 && before.nearBlackShare >= 0.9;

console.log('');
console.log('visual checks');
console.log(`  cyan leads                       ${cyanLeads ? 'PASS' : 'FAIL'}  impact core rgb(${impact.core.join(',')}) cool=${impact.coreIsCool}; early core rgb(${early.core.join(',')}) cool=${early.coreIsCool}`);
console.log(`  violet follows                    ${violetFollows ? 'PASS' : 'FAIL'}  magenta mean ${impact.magenta.toFixed(2)} -> ${retained.magenta.toFixed(2)}, vs cyan ${retained.cyan.toFixed(2)}`);
console.log(`  unaffected areas near-black      ${unaffectedDark ? 'PASS' : 'FAIL'}  (before ${(before.nearBlackShare * 100).toFixed(1)}%, retained ${(retained.nearBlackShare * 100).toFixed(1)}%)`);
console.log(`  no-WebGL banner                  ${banner ? 'PASS' : 'FAIL'}  ${banner ?? ''}`);
console.log(`  page errors                      ${errors.length === 0 ? 'none' : errors.join(' | ')}`);
console.log('');
console.log('SOFTWARE-CAPTURE TIMING ONLY — SwiftShader. Not production performance evidence.');

writeFileSync(`${OUT}/report.json`, `${JSON.stringify({
  url: URL, strikeNode: STRIKE_NODE, renderer: 'SwiftShader (software)',
  timingCaveat: 'Frame timings from this run are software-renderer only and are not production performance evidence.',
  frames, pixels, checks: { cyanLeads, violetFollows, unaffectedDark, noWebGLBanner: banner }, errors,
}, null, 2)}\n`);
console.log(`wrote ${OUT}/report.json`);
