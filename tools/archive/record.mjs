/**
 * Records the complete scroll sequence as a video deliverable.
 *
 * Playwright records WebM; the script converts to MP4 when ffmpeg is on
 * PATH and otherwise leaves the WebM in place and says so, rather than
 * silently producing a file with the wrong contents.
 */
import { chromium } from 'playwright';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = path.resolve(process.argv[3] ?? 'delivery');
const RAW = path.join(OUT, '.video-raw');

await mkdir(OUT, { recursive: true });
await rm(RAW, { recursive: true, force: true });
await mkdir(RAW, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
  ],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: RAW, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
// Hold on the hero so the cold open and the type reveal are both in shot.
await page.waitForTimeout(5000);

// Scroll the whole document at a steady, human rate.
await page.evaluate(async () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const durationMs = 42000;
  const start = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      const t = Math.min((now - start) / durationMs, 1);
      // Ease in and out so the run does not start or stop abruptly.
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      window.scrollTo(0, max * eased);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
});

// Settle on the resolved frame.
await page.waitForTimeout(4000);

await context.close();
await browser.close();

const files = (await readdir(RAW)).filter((f) => f.endsWith('.webm'));
if (!files.length) {
  console.error('No video produced.');
  process.exit(1);
}

const webm = path.join(RAW, files[0]);
const mp4 = path.join(OUT, 'preview-scroll.mp4');

try {
  await run('ffmpeg', [
    '-y',
    '-i', webm,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    mp4,
  ]);
  await rm(RAW, { recursive: true, force: true });
  console.log('wrote', mp4);
} catch {
  const fallback = path.join(OUT, 'preview-scroll.webm');
  await rename(webm, fallback);
  await rm(RAW, { recursive: true, force: true });
  console.log('ffmpeg not available — wrote', fallback, '(WebM instead of MP4)');
}
