// Evidence for sinister gates 4 and 5, 2026-08-22.
//
//   node tools/sinister-45.mjs
//
// Gate 4, THE COLD LANDING: the shipping page at Jacob's viewport, mouse
// untouched, plus a plinth crop and a temperature read of the pool band
// against the stair lane (mean B/R per band: cold reads blue over red).
//
// Gate 5, THE WITNESSED CULL: a second page dwells at the landing while
// the world runs live. The chip is polled for the CULLED row; on the
// strike a burst of frames catches the cell in the air, then the grown
// pit. Before/after canvas grabs are diffed IN PAGE (inside rAF, the
// only place canvas pixels are true here) to locate and measure the
// change, so the claim "one cell fell and the face keeps the pit" is a
// measured region, not an assertion.
import { BASE, captures, launch } from './env.mjs';

const OUT = captures('sinister');
const browser = await launch();

// in-page canvas grab, valid only inside rAF
function grab({ w, h }) {
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(document.getElementById('world'), 0, 0, w, h);
        resolve(Array.from(x.getImageData(0, 0, w, h).data));
      })
    );
  });
}

// DL_ONLY=4 or DL_ONLY=5 runs one gate's evidence alone
const ONLY = process.env.DL_ONLY || '456';

// --- gate 4: the cold landing ---
if (ONLY.includes('4')) {
  const page = await browser.newPage({ viewport: { width: 2270, height: 1278 } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: OUT + '/gate4-landing.png' });
  await page.screenshot({
    path: OUT + '/gate4-plinth-crop.png',
    clip: { x: 700, y: 760, width: 900, height: 500 }
  });
  const bands = await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const W = 1135, H = 639;
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const x = c.getContext('2d', { willReadFrequently: true });
            x.drawImage(document.getElementById('world'), 0, 0, W, H);
            const d = x.getImageData(0, 0, W, H).data;
            const read = (rx, ry, rw, rh) => {
              let r = 0, g = 0, b = 0, n = 0;
              for (let yy = ry; yy < ry + rh; yy++)
                for (let xx = rx; xx < rx + rw; xx++) {
                  const i = (yy * W + xx) * 4;
                  r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
                }
              return { r: r / n, g: g / n, b: b / n, br: +(b / Math.max(1, r)).toFixed(3) };
            };
            resolve({
              // half-scale frame, regions placed from the captured
              // landing: pool = the lit ground at the mouth just above
              // the stair, lane = the run-out near the visitor
              pool: read(545, 550, 60, 20),
              lane: read(540, 600, 70, 35),
              seam: read(552, 150, 30, 200)
            });
          })
        );
      })
  );
  console.log('[gate4] pool', JSON.stringify(bands.pool));
  console.log('[gate4] lane', JSON.stringify(bands.lane));
  console.log('[gate4] seam', JSON.stringify(bands.seam));
  await page.close();
}

// --- gate 5: the witnessed cull ---
if (ONLY.includes('5')) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Arm an in-page recorder BEFORE the strike. A screenshot round trip
  // costs seconds and the fall lasts about one, so the burst that
  // catches the cell in the air has to live inside the page: a
  // MutationObserver on the ledger starts grabbing half-scale frames
  // 120ms apart the moment the CULLED row lands. Grabs run inside rAF,
  // the only place this canvas tells the truth. Frames that close
  // together make the camera sway negligible, so diffing two of them
  // isolates the falling cell, and the TOPMOST blob is its seat -
  // which is where the stone keeps the pit.
  await page.evaluate(() => {
    const list = document.getElementById('record-list');
    const obs = new MutationObserver(() => {
      if (
        !Array.from(list.children).some((li) =>
          (li.textContent || '').includes('STRUCK FROM THE FACE')
        )
      )
        return;
      obs.disconnect();
      const src = document.getElementById('world');
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 450;
      const x = c.getContext('2d', { willReadFrequently: true });
      const raw = [];
      const urls = [];
      let i = 0;
      const grabOne = () => {
        x.drawImage(src, 0, 0, 800, 450);
        raw.push(x.getImageData(0, 0, 800, 450).data.slice());
        urls.push(c.toDataURL('image/png'));
        if (++i < 10) setTimeout(() => requestAnimationFrame(grabOne), 120);
        else {
          // locate the SEAT: the lit fleck leaves it between frame 0
          // and frame 6, so the strongest single-pixel change is at or
          // beside the seat - argmax is immune to the sparse noise
          // that drowned a threshold bbox
          let best = 0, bx = 0, by = 0;
          const a = raw[0], b = raw[6];
          for (let p = 0; p < 800 * 450; p++) {
            const d =
              Math.abs(a[p * 4] - b[p * 4]) +
              Math.abs(a[p * 4 + 1] - b[p * 4 + 1]) +
              Math.abs(a[p * 4 + 2] - b[p * 4 + 2]);
            if (d > best) {
              best = d;
              bx = p % 800;
              by = (p / 800) | 0;
            }
          }
          window.__cull = { urls, seat: { x: bx, y: by, d: best } };
        }
      };
      requestAnimationFrame(grabOne);
    });
    obs.observe(list, { childList: true });
  });

  // before: the face as it stands, one minute into the dwell
  await page.waitForTimeout(55000);
  await page.screenshot({ path: OUT + '/gate5-before.png' });

  // the strike lands at a seeded tick between 52s and 76s of world
  // time; the recorder resolves ~1.2s after it fires
  const got = await page
    .waitForFunction(() => !!window.__cull, null, { timeout: 45000, polling: 120 })
    .then(() => true)
    .catch(() => false);
  console.log('[gate5] strike recorded on the live page:', got);

  if (got) {
    const cull = await page.evaluate(() => ({
      seat: window.__cull.seat,
      urls: window.__cull.urls.filter((_, i) => [0, 1, 2, 4, 6, 9].includes(i))
    }));
    console.log('[gate5] seat (half-scale):', JSON.stringify(cull.seat));
    const { writeFileSync } = await import('node:fs');
    cull.urls.forEach((u, i) =>
      writeFileSync(OUT + `/gate5-fall-${i}.png`, Buffer.from(u.split(',')[1], 'base64'))
    );
    // the pit: crop the full-scale page at the seat once the stone has
    // opened, and a fall crop from the recorder frames' region
    await page.waitForTimeout(4000);
    await page.screenshot({ path: OUT + '/gate5-after.png' });
    {
      const cx = Math.min(1600 - 260, Math.max(0, cull.seat.x * 2 - 130));
      const cy = Math.min(900 - 260, Math.max(0, cull.seat.y * 2 - 130));
      await page.screenshot({
        path: OUT + '/gate5-pit-crop.png',
        clip: { x: cx, y: cy, width: 260, height: 260 }
      });
    }
  } else {
    await page.screenshot({ path: OUT + '/gate5-after.png' });
  }
  const row = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('#record-list li'))
        .map((li) => li.textContent || '')
        .find((r) => r.includes('STRUCK FROM THE FACE')) || 'NO CULL ROW'
  );
  console.log('[gate5] ledger:', row);
  await page.close();
}

// --- gate 6: the stillness ---
// The same mean-abs-diff over the same 2s gap, taken while the world is
// alive (15s in) and again deep in the dwell (70s in, past the 48-63s
// ramp). The claim is that autonomous motion STOPS, so the second
// number collapsing toward the seam's residual is the evidence.
if (ONLY.includes('6')) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const motion = async () => {
    const a = await page.evaluate(grab, { w: 800, h: 450 });
    await page.waitForTimeout(2000);
    const b = await page.evaluate(grab, { w: 800, h: 450 });
    let sum = 0;
    for (let i = 0; i < 800 * 450; i++)
      sum +=
        Math.abs(a[i * 4] - b[i * 4]) +
        Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) +
        Math.abs(a[i * 4 + 2] - b[i * 4 + 2]);
    return +((100 * sum) / (800 * 450 * 3 * 255)).toFixed(4);
  };
  await page.waitForTimeout(15000);
  const alive = await motion();
  await page.waitForTimeout(53000);
  const still = await motion();
  console.log(`[gate6] motion alive(15s) ${alive}%  still(70s) ${still}%`);
  await page.screenshot({ path: OUT + '/gate6-still.png' });
  await page.close();
}

await browser.close();
console.log('wrote ' + OUT);
