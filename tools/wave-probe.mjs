// THE LEAVING GESTURE, recorded frame by frame, with the camera held still.
//
// Jacob, four times now, on the ripple that fires when the cursor is taken
// off the hero. Three rebuilds were written from a DESCRIPTION of what that
// ripple should be. The thing itself is in git, so this drives the actual
// gesture against two running builds and records what each one does.
//
//   node tools/wave-probe.mjs                 # current build, port 5180
//   DL_BASE=http://localhost:5182 DL_LABEL=ref node tools/wave-probe.mjs
//
// THE CAMERA IS THE TRAP. parX/parY follow the pointer and swing the yaw
// six degrees across a screen-wide flick, which moves every pixel and
// drowns the thing being looked for. Both targets are the pointer's NDC,
// and both fall back to ZERO when the pointer is cleared - so a pointer
// resting at NDC (0,0), screen centre, has the same camera target present
// or absent. Point there, fire pointerleave, and the only thing that
// changes in the whole frame is the wake. The watcher is pinned by the
// same argument: its aim is the same (0,0) before and after.
//
// Produces, per label: a contact sheet, a signed difference sheet against
// the resting frame, and a kymograph - every frame one column, time left
// to right, height top to bottom. A travelling wave is a diagonal streak
// there; a pool that sits still is a vertical block; nothing is flat grey.
import { writeFileSync } from 'node:fs';
import { BASE, SOFTWARE, captures, launch } from './env.mjs';

const LABEL = process.env.DL_LABEL || 'now';
const OUT = captures('wave');
const ON = { x: 800, y: 450 }; // NDC (0,0): dead centre, on the monument

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console error]', m.text());
});
page.on('pageerror', (e) => console.log('[page error]', e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

await page.evaluate(() => {
  // Grabs happen inside rAF: this canvas has no preserveDrawingBuffer and
  // reading it after composite returns a cleared buffer.
  const src = () => document.getElementById('world');
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 270;
  const ctx = c.getContext('2d');

  window.__leave = () => window.dispatchEvent(new PointerEvent('pointerleave'));

  window.__mass = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          ctx.drawImage(src(), 0, 0, 480, 270);
          const d = ctx.getImageData(180, 20, 130, 240).data;
          let sum = 0;
          const n = d.length / 4;
          for (let i = 0; i < n; i++) {
            sum += 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
          }
          resolve(+(sum / n).toFixed(3));
        })
      );
    });

  window.__grab = (durMs) =>
    new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      let n = 0;
      const tick = () => {
        const t = performance.now() - t0;
        if (n % 2 === 0) {
          ctx.drawImage(src(), 0, 0, 480, 270);
          out.push({ t: Math.round(t), d: c.toDataURL('image/jpeg', 0.9) });
        }
        n++;
        if (t < durMs) requestAnimationFrame(tick);
        else resolve(out);
      };
      requestAnimationFrame(tick);
    });
});

// ---- calibration: prove the pointer is actually ON the mass ----------------
// If the raycast misses the tower box then hoverTargetAmt never reaches 1,
// the wake clock never resets, and the recording below is of nothing. The
// reference build lights under the cursor, so a rise here is the proof.
await page.evaluate(() => window.__leave());
await page.waitForTimeout(1600);
const off = await page.evaluate(() => window.__mass());
await page.mouse.move(ON.x, ON.y);
await page.waitForTimeout(1600);
const on = await page.evaluate(() => window.__mass());
console.log(`${LABEL}: mass off-pointer ${off}  on-pointer ${on}  delta ${(on - off).toFixed(3)}`);

await page.screenshot({ path: `${OUT}/${LABEL}-00-resting.png` });

// ---- the leaving ----------------------------------------------------------
const rec = page.evaluate(() => window.__grab(3400));
await page.waitForTimeout(20);
await page.evaluate(() => window.__leave());
const frames = await rec;
console.log(`${LABEL}: ${frames.length} frames over ${frames[frames.length - 1].t}ms`);

const WANT = [0, 30, 60, 100, 150, 210, 280, 360, 450, 560, 700, 950];
const picked = WANT.map((want) =>
  frames.reduce((a, b) => (Math.abs(b.t - want) < Math.abs(a.t - want) ? b : a))
);

const sheets = await page.evaluate(
  async ({ picked, frames, label, gain, kgain }) => {
    const load = (d) =>
      new Promise((r) => {
        const i = new Image();
        i.onload = () => r(i);
        i.src = d;
      });
    const scratch = document.createElement('canvas');
    scratch.width = 480;
    scratch.height = 270;
    const sx = scratch.getContext('2d', { willReadFrequently: true });
    const px = async (d) => {
      sx.drawImage(await load(d), 0, 0);
      return sx.getImageData(0, 0, 480, 270);
    };

    const COLS = 4;
    const W = 480;
    const H = 270;
    const PAD = 26;
    const rows = Math.ceil(picked.length / COLS);
    const grid = (title) => {
      const c = document.createElement('canvas');
      c.width = COLS * W;
      c.height = rows * (H + PAD);
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      g.__title = title;
      return { c, g };
    };
    const cap = (g, i, text) => {
      g.fillStyle = '#8fa';
      g.font = '16px monospace';
      g.fillText(text, (i % COLS) * W + 8, Math.floor(i / COLS) * (H + PAD) + 18);
    };

    // plain contact sheet
    const A = grid();
    for (let i = 0; i < picked.length; i++) {
      const img = await load(picked[i].d);
      A.g.drawImage(img, (i % COLS) * W, Math.floor(i / COLS) * (H + PAD) + PAD);
      cap(A.g, i, `${label}  +${picked[i].t}ms`);
    }

    // signed difference against the resting frame
    const base = await px(picked[0].d);
    const B = grid();
    for (let i = 0; i < picked.length; i++) {
      const cur = await px(picked[i].d);
      const out = B.g.createImageData(W, H);
      for (let p = 0; p < W * H; p++) {
        const dl =
          0.2126 * (cur.data[p * 4] - base.data[p * 4]) +
          0.7152 * (cur.data[p * 4 + 1] - base.data[p * 4 + 1]) +
          0.0722 * (cur.data[p * 4 + 2] - base.data[p * 4 + 2]);
        const v = Math.max(0, Math.min(255, 128 + dl * gain));
        out.data[p * 4] = v;
        out.data[p * 4 + 1] = v;
        out.data[p * 4 + 2] = v;
        out.data[p * 4 + 3] = 255;
      }
      B.g.putImageData(out, (i % COLS) * W, Math.floor(i / COLS) * (H + PAD) + PAD);
      cap(B.g, i, `${label} DIFF x${gain}  +${picked[i].t}ms`);
    }

    // Kymograph, sampled ON THE SEAM. Averaging the whole 130-pixel
    // tower width buries a 3-pixel blade under stone that is not doing
    // anything, and a front running along the seam then shows as nothing.
    // A narrow window taking the MAX across it follows the blade even
    // where it drifts a pixel or two with the camera.
    const KX = 228;
    const KW = 26;
    const KY = 14;
    const KH = 250;
    const column = async (d) => {
      sx.drawImage(await load(d), 0, 0);
      const im = sx.getImageData(KX, KY, KW, KH).data;
      const col = new Float32Array(KH);
      for (let y = 0; y < KH; y++) {
        let m = 0;
        for (let k = 0; k < KW; k++) {
          const p = (y * KW + k) * 4;
          const l = 0.2126 * im[p] + 0.7152 * im[p + 1] + 0.0722 * im[p + 2];
          if (l > m) m = l;
        }
        col[y] = m;
      }
      return col;
    };
    const kbase = await column(frames[0].d);
    const raw = document.createElement('canvas');
    raw.width = frames.length;
    raw.height = KH;
    const rc = raw.getContext('2d');
    const kimg = rc.createImageData(frames.length, KH);

    // Two passes, because the gain that reads a subtle change on stone
    // saturates the seam to solid black and white and shows nothing at
    // all. Measure the range first, then scale to fill it. kgain is a
    // ceiling for the case where there is genuinely almost no change.
    const cols = [];
    let peak = 0;
    for (let i = 0; i < frames.length; i++) {
      const col = await column(frames[i].d);
      cols.push(col);
      for (let y = 0; y < KH; y++) {
        const d = Math.abs(col[y] - kbase[y]);
        if (d > peak) peak = d;
      }
    }
    const gainUsed = peak > 0.5 ? Math.min(kgain, 118 / peak) : kgain;
    for (let i = 0; i < frames.length; i++) {
      for (let y = 0; y < KH; y++) {
        const d = cols[i][y] - kbase[y];
        const v = Math.max(0, Math.min(255, 128 + d * gainUsed));
        const p = (y * frames.length + i) * 4;
        kimg.data[p] = v;
        kimg.data[p + 1] = v;
        kimg.data[p + 2] = v;
        kimg.data[p + 3] = 255;
      }
    }
    rc.putImageData(kimg, 0, 0);
    const big = document.createElement('canvas');
    big.width = 960;
    big.height = 300;
    const bc = big.getContext('2d');
    bc.fillStyle = '#000';
    bc.fillRect(0, 0, 960, 300);
    bc.imageSmoothingEnabled = false;
    bc.drawImage(raw, 0, 40, 960, 240);
    bc.fillStyle = '#8fa';
    bc.font = '15px monospace';
    const span = frames[frames.length - 1].t || 1;
    for (let s = 0; s <= 3; s++) {
      const sxp = Math.min(950, (s * 1000 * 960) / span);
      bc.fillRect(sxp, 40, 1, 240);
      bc.fillText(`${s}s`, sxp + 4, 34);
    }
    bc.fillText(`${label}  kymograph x${gainUsed.toFixed(1)}  peak dL ${peak.toFixed(1)}`, 300, 34);
    bc.fillText('crown', 4, 58);
    bc.fillText('foot', 4, 292);

    return {
      sheet: A.c.toDataURL('image/png'),
      diff: B.c.toDataURL('image/png'),
      kymo: big.toDataURL('image/png'),
      peak: +peak.toFixed(2)
    };
  },
  { picked, frames, label: LABEL, gain: 10, kgain: 14 }
);

const put = (name, dataUrl) =>
  writeFileSync(`${OUT}/${LABEL}-${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
put('sheet', sheets.sheet);
put('diff', sheets.diff);
put('kymo', sheets.kymo);
console.log(`${LABEL}: peak column change over the mass = ${sheets.peak} of 255`);
console.log(`  ${OUT}/${LABEL}-{sheet,diff,kymo}.png`);

// ---- the OLED check ---------------------------------------------------
// 3ef6cdf cut the blade because Jacob said "the light is blinding my eyes"
// on an OLED, and measured zero clipped pixels down the seam at 0.68. Any
// surge that puts a broad strip of full-output pixels back has reproduced
// the fault it was supposed to work around, so this counts them at rest
// and at the peak of the swell, full resolution, no JPEG in the way.
await page.evaluate(() => {
  window.__clip = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const src = document.getElementById('world');
          const c = document.createElement('canvas');
          c.width = 1600;
          c.height = 900;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(src, 0, 0, 1600, 900);
          const d = x.getImageData(0, 0, 1600, 900).data;
          let clipped = 0;
          let above240 = 0;
          let above200 = 0;
          let max = 0;
          for (let i = 0; i < 1600 * 900; i++) {
            const l = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
            if (l > max) max = l;
            if (d[i * 4] >= 254 && d[i * 4 + 1] >= 254 && d[i * 4 + 2] >= 254) clipped++;
            if (l >= 240) above240++;
            if (l >= 200) above200++;
          }
          resolve({ clipped, above240, above200, max: Math.round(max) });
        })
      );
    });
});
// THE JOURNEY, in the only currency that matters here: light thrown into
// the frame. The bloom pass thresholds at 1.0, so a front under that line
// is a hairline getting slightly brighter - perfect in a difference image,
// invisible on a monitor. Raw luminance said an earlier version travelled
// both ways; Jacob said it travelled up. He was right and the measurement
// was measuring the wrong thing.
//
// above240 counts pixels the bloom is actually lifting. If the up leg and
// the down leg carry comparable counts, the wave is visible both ways.
await page.mouse.move(ON.x, ON.y);
await page.waitForTimeout(1800);
console.log(`${LABEL}: attention ON       ${JSON.stringify(await page.evaluate(() => window.__clip()))}`);
await page.evaluate(() => window.__leave());
let atMs = 0;
for (const [ms, leg] of [
  [150, 'rising'],
  [400, 'rising'],
  [650, 'travelling'],
  [900, 'travelling'],
  [1100, 'landing'],
  [1400, 'landed?'],


  [2400, 'gone?'],
  [3600, 'settled']
]) {
  await page.waitForTimeout(ms - atMs);
  atMs = ms;
  const s = await page.evaluate(() => window.__clip());
  console.log(
    `${LABEL}: +${String(ms).padStart(4)}ms ${leg.padEnd(11)}` +
      ` bloom(>240) ${String(s.above240).padStart(5)}  seam(>200) ${String(s.above200).padStart(5)}  max ${s.max}  clipped ${s.clipped}`
  );
}

if (SOFTWARE) console.log('SOFTWARE RENDER - motion is readable, tone is not.');
await browser.close();
