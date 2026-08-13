/**
 * correction-capture.mjs — stills from the running site, on the real GPU.
 *
 * The existing tools/*.mjs all force SwiftShader, and the build plan is
 * explicit that a software raster is not visual truth: it has already hidden a
 * shader bug that rendered the object black on the actual card. This harness
 * launches installed Chrome, headed, so the frames come off the 3060.
 *
 *   node tools/correction-capture.mjs                    opening frame
 *   node tools/correction-capture.mjs --event            opening + one full
 *                                                        enforcement event
 *   node tools/correction-capture.mjs --scroll           one frame per band,
 *                                                        down the whole descent
 *   node tools/correction-capture.mjs --url http://... --out captures/x
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const BASE = argValue('url', 'http://localhost:5173');
const OUT = path.resolve(argValue('out', 'captures/correction'));
const WIDTH = Number(argValue('width', 1440));
const HEIGHT = Number(argValue('height', 900));

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`  [console.${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

console.log(`\n${BASE} at ${WIDTH}x${HEIGHT}`);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

// The loader tracks real initialisation — graph synthesis, warm-up, record —
// so waiting on it is waiting on the system rather than on a timer.
await page
  .waitForFunction(
    () => {
      const loader = document.getElementById('loader');
      return !loader || loader.hidden || loader.classList.contains('is-done');
    },
    { timeout: 30000 }
  )
  .catch(() => console.log('  loader never cleared'));

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(`  GPU: ${gpu}`);

// The dev tuning panel draws over the corridor and has no place in a judged
// frame — these captures exist to be looked at as the composition.
await page.evaluate(() => document.querySelector('.tuning')?.remove());

const telemetry = () => page.evaluate(() => window.__correction?.telemetry ?? null);

/**
 * Mean luminance and the share of pixels carrying anything, read off the WebGL
 * canvas.
 *
 * Measured inside a requestAnimationFrame callback, which is not fussiness: the
 * drawing buffer is cleared at the swap, so reading it from ordinary script
 * returns a black image and reports a working frame as dead. The scene
 * registers its callback earlier, so this one runs after the render and before
 * the swap.
 */
async function frameStats() {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const canvas = document.getElementById('lattice-canvas');
    const copy = document.createElement('canvas');
    copy.width = 480;
    copy.height = Math.round((480 * canvas.height) / canvas.width);
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
    const { data } = ctx.getImageData(0, 0, copy.width, copy.height);

    let lit = 0;
    let sum = 0;
    let peak = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      sum += l;
      if (l > peak) peak = l;
      if (l > 0.04) {
        lit++;
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
      }
    }
    const pixels = data.length / 4;
    resolve({
      litShare: lit / pixels,
      meanLuma: sum / pixels,
      peakLuma: peak,
      litMeanRGB: lit ? [Math.round(rSum / lit), Math.round(gSum / lit), Math.round(bSum / lit)] : [0, 0, 0],
    });
  })));
}

/**
 * How far the structure actually moves on screen, in pixels.
 *
 * Two earlier versions of this measured mean luminance change between frames,
 * and both lied. Hairline geometry changes its antialiasing under sub-pixel
 * jitter, so a still image scored as moving; and when the movement became real
 * but smooth, consecutive samples differed less than the shimmer had, so it
 * scored as still. Luminance delta is not displacement.
 *
 * This tracks the veil's spine: per column, the luminance-weighted mean row.
 * Peak-to-peak movement of that spine over the sampling window is how far the
 * structure travelled, and it is immune to both failure modes above.
 */
async function motion(samples = 20, intervalMs = 420) {
  const result = await page.evaluate(
    ([count, gap]) =>
      new Promise((resolve) => {
        const canvas = document.getElementById('lattice-canvas');
        const width = 480;
        const copy = document.createElement('canvas');
        copy.width = width;
        copy.height = Math.round((width * canvas.height) / canvas.width);
        const ctx = copy.getContext('2d', { willReadFrequently: true });

        // Spine of the structure: for each column, the luminance-weighted mean
        // row. NaN for columns with nothing in them.
        const spine = () =>
          new Promise((done) =>
            requestAnimationFrame(() => {
              ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
              const { data } = ctx.getImageData(0, 0, copy.width, copy.height);
              const out = new Float64Array(copy.width);
              for (let x = 0; x < copy.width; x++) {
                let weight = 0;
                let sum = 0;
                for (let y = 0; y < copy.height; y++) {
                  const i = (y * copy.width + x) * 4;
                  const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
                  if (l <= 0.015) continue;
                  weight += l;
                  sum += l * y;
                }
                out[x] = weight > 0.35 ? sum / weight : NaN;
              }
              done(out);
            })
          );

        (async () => {
          const first = await spine();
          const low = Float64Array.from(first);
          const high = Float64Array.from(first);
          let tracked = 0;

          for (let s = 1; s < count; s++) {
            await new Promise((r) => setTimeout(r, gap));
            const current = await spine();
            for (let x = 0; x < current.length; x++) {
              if (Number.isNaN(current[x]) || Number.isNaN(low[x])) { low[x] = NaN; continue; }
              if (current[x] < low[x]) low[x] = current[x];
              if (current[x] > high[x]) high[x] = current[x];
            }
          }

          const travel = [];
          for (let x = 0; x < low.length; x++) {
            if (Number.isNaN(low[x])) continue;
            travel.push(high[x] - low[x]);
            tracked++;
          }
          travel.sort((a, b) => a - b);
          const q = (p) => (travel.length ? travel[Math.floor(travel.length * p)] : 0);
          resolve({ columns: tracked, p10: q(0.1), median: q(0.5), p90: q(0.9), max: q(0.99) });
        })();
      }),
    [samples, intervalMs]
  );

  // The spine is measured on a 480px-wide downsample of a WIDTH-wide canvas.
  const toFullRes = WIDTH / 480;
  return {
    columns: result.columns,
    p10: result.p10 * toFullRes,
    median: result.median * toFullRes,
    p90: result.p90 * toFullRes,
    max: result.max * toFullRes,
  };
}

async function shot(name) {
  // An occluded window is a throttled one: rAF stops, so the canvas reads
  // black and the camera never reaches the pose the scroll position implies.
  // That has already produced one run of frames that looked like a
  // regression and was a window behind another window.
  await page.bringToFront().catch(() => {});
  const buffer = await page.screenshot({ type: 'png' });
  await writeFile(path.join(OUT, `${name}.png`), buffer);
  const stats = await frameStats();
  const t = await telemetry();
  console.log(
    `  ${name.padEnd(28)} lit ${(stats.litShare * 100).toFixed(1)}%  mean ${stats.meanLuma.toFixed(4)}  ` +
      `peak ${stats.peakLuma.toFixed(3)}  litRGB ${stats.litMeanRGB.join(',')}` +
      (t ? `  | tick ${t.tick} adj ${t.adjustments} held ${t.engaged} dev ${t.peakDeviation.toFixed(3)}` : '')
  );
  return { stats, telemetry: t };
}

/** Lands a band's own middle on the viewport middle — where the director measures. */
async function scrollToBand(id) {
  await page.evaluate((band) => {
    const parts = Array.from(document.querySelectorAll(`[data-band="${band}"]`));
    if (!parts.length) return;
    const top = Math.min(...parts.map((el) => el.getBoundingClientRect().top + window.scrollY));
    const bottom = Math.max(...parts.map((el) => el.getBoundingClientRect().bottom + window.scrollY));
    window.scrollTo(0, (top + bottom) / 2 - window.innerHeight / 2);
  }, id);
}

/** The record as a visitor reads it, straight off the DOM. */
async function recordText() {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-record]');
    if (!panel || panel.hidden) return '(no panel)';
    return panel.innerText.replace(/\s+/g, ' ').trim();
  });
}

console.log('\nOPENING FRAME');
await page.waitForTimeout(1600);
await shot('01-opening');

if (flag('motion')) {
  console.log('\nDOES THE CALM MOVE');
  const m = await motion();
  console.log(
    `  structure travel over 8s, screen px:  p10 ${m.p10.toFixed(1)}  median ${m.median.toFixed(1)}  ` +
      `p90 ${m.p90.toFixed(1)}  max ${m.max.toFixed(1)}   (${m.columns} columns tracked)`
  );
  console.log(`  ${m.median >= 3 ? 'BREATHING' : 'READS AS STILL'}`);
}

if (flag('event')) {
  console.log('\nONE ENFORCEMENT EVENT');
  // Struck clear of the display type, so the frames show the event rather
  // than the event behind a letterform. Reported so the series can be tied to
  // a specific strike.
  const node = await page.evaluate(
    ([x, y]) => window.__correction?.press(x, y) ?? -1,
    [Math.round(WIDTH * 0.70), Math.round(HEIGHT * 0.46)]
  );
  console.log(`  struck node ${node}`);

  const beats = [
    ['02-deviation', 260],
    ['03-noticing', 240],
    ['04-strain', 420],
    ['05-snap', 700],
    ['06-settling', 1400],
    ['07-bruise', 3000],
  ];
  for (const [name, wait] of beats) {
    await page.waitForTimeout(wait);
    await shot(name);
  }
}

if (flag('scroll')) {
  console.log('\nTHE DESCENT');
  const bands = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-band]')).map((el) => el.dataset.band)
  );
  // A band may be several sections; the first one is where it starts.
  const seen = [];
  for (const band of bands) if (!seen.includes(band)) seen.push(band);

  for (let i = 0; i < seen.length; i++) {
    const band = seen[i];
    await scrollToBand(band);
    await page.waitForTimeout(900);

    const reported = await page.evaluate(() => document.documentElement.dataset.narrativeBand ?? '');
    await shot(`${String(10 + i)}-band-${band}`);
    if (reported !== band) console.log(`    band attribute reads "${reported}"`);
  }
}

/**
 * Is the copy actually on screen?
 *
 * The editorial animates in, and an animation that never runs leaves real
 * company content invisible while every other check still passes. This reads
 * the computed state of the elements that carry the reveal, so "readable" is
 * measured rather than assumed.
 */
async function copyState(id) {
  return page.evaluate((target) => {
    const root = document.getElementById(target);
    if (!root) return { total: 0, hidden: 0, sample: 'section missing' };
    const items = root.querySelectorAll('.reveal-line > span, .fade-in');
    let hidden = 0;
    let sample = '';
    items.forEach((el) => {
      const style = getComputedStyle(el);
      const masked = style.transform !== 'none' && !style.transform.endsWith(', 0, 0)');
      const faded = Number(style.opacity) < 0.9;
      if (masked || faded) {
        hidden++;
        if (!sample) sample = (el.textContent ?? '').trim().slice(0, 42);
      }
    });
    return { total: items.length, hidden, sample };
  }, id);
}

if (flag('editorial')) {
  console.log('\nTHE GROUND');
  for (const id of ['premise', 'studio']) {
    await page.evaluate((target) => {
      document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, id);
    // Long enough for the masked headline reveal (1.15s plus stagger) to have
    // finished, so a hidden line means it never ran rather than that it is
    // still running.
    await page.waitForTimeout(2600);
    await shot(`30-${id}`);
    const copy = await copyState(id);
    console.log(
      `    copy: ${copy.total - copy.hidden}/${copy.total} revealed` +
        (copy.hidden ? `   still hidden e.g. "${copy.sample}"` : '')
    );
  }
  const machine = await telemetry();
  await page.waitForTimeout(800);
  const stillOff = await telemetry();
  console.log(
    `  machine at the editorial: tick ${machine.tick} -> ${stillOff.tick} after 0.8s ` +
      `(${machine.tick === stillOff.tick ? 'OFF' : 'STILL RUNNING'})`
  );

  // A press while the machine is off must not reach through the ground and
  // spend budget on a deviation nobody can see.
  const offPath = await page.evaluate(() => {
    const before = window.__correction?.budget ?? -1;
    window.__correction?.press(700, 450);
    return { before, after: window.__correction?.budget ?? -1 };
  });
  console.log(
    `  press at the editorial: budget ${offPath.before} -> ${offPath.after} ` +
      `(${offPath.before === offPath.after ? 'REFUSED' : 'REACHED THROUGH THE GROUND'})`
  );

  // Back up the page. The machine restarts where it was left, not where it
  // started: the count and the damage do not rewind.
  await scrollToBand('floor');
  await page.waitForTimeout(1200);
  const back = await telemetry();
  console.log(
    `  scrolled back to the floor: tick ${stillOff.tick} -> ${back.tick}, ` +
      `adjustments ${stillOff.adjustments} -> ${back.adjustments}`
  );
}

if (flag('record')) {
  console.log('\nTHE RECORD');

  // 1 — Do nothing at all. The system is supposed to supply the action.
  await page.bringToFront().catch(() => {});
  const before = await telemetry();
  await page.waitForTimeout(9500);
  const after = await telemetry();
  console.log(
    `  idle 9.5s:  injections ${before.injections} -> ${after.injections}   ` +
      `adjustments ${before.adjustments} -> ${after.adjustments}`
  );
  // The delta, not the total. Run after --event the structure has already
  // been struck, which is the one condition that cancels the false first
  // action — reading the absolute count reported that as a pass.
  const acted = after.injections > before.injections;
  console.log(
    `  ${acted ? 'THE SYSTEM ACTED FOR THE VISITOR' : 'no false first action — already struck this visit'}`
  );

  // 2 — The floor, typeset from the counters.
  await scrollToBand('floor');
  await page.waitForTimeout(1200);
  await shot('20-floor-record');
  console.log(`  panel: ${await recordText()}`);

  // 3 — The budget is bounded.
  const spent = await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.__correction?.press(700, 450);
    return window.__correction?.budget ?? -1;
  });
  console.log(`  after 20 presses, budget left ${spent}`);
  // The counters live in the Worker and reach the page on the next published
  // snapshot, so reading them in the same turn as the presses reads the state
  // from before them.
  await page.waitForTimeout(600);
  const injectedTotal = (await telemetry()).injections;
  console.log(`  total injections accepted this visit: ${injectedTotal}`);

  // 4 — Come back. The record came back with you.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      () => {
        const loader = document.getElementById('loader');
        return !loader || loader.hidden || loader.classList.contains('is-done');
      },
      { timeout: 30000 }
    )
    .catch(() => console.log('  loader never cleared on the second visit'));
  await page.waitForTimeout(1200);
  await scrollToBand('floor');
  await page.waitForTimeout(900);
  await shot('21-second-visit');
  console.log(`  second visit: ${await recordText()}`);

  // 5 — The way out, from the first frame. It has to be recorded as what it
  //     was, which is the one thing a skip path can get dishonest about.
  //
  //     In a clean context, because a visitor who has already been here is a
  //     different case: clearing storage in the current page does not survive
  //     the reload, since the outgoing page commits its own record on pagehide
  //     — which is the behaviour that makes the history reliable in the first
  //     place.
  const clean = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  const visitor = await clean.newPage();
  await visitor.goto(BASE, { waitUntil: 'domcontentloaded' });
  await visitor.waitForTimeout(3000);
  const skipped = await visitor.evaluate(async () => {
    const link = document.querySelector('[data-skip]');
    if (!link) return { stored: 'no skip control', reachable: false };
    link.click();
    await new Promise((r) => setTimeout(r, 600));
    const premise = document.getElementById('premise');
    return {
      stored: window.localStorage.getItem('darkLattice.record') ?? '(nothing stored)',
      reachable: !!premise && premise.getBoundingClientRect().height > 0,
      heading: premise?.querySelector('h2')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    };
  });
  console.log(`  skipped from frame one: ${skipped.stored}`);
  console.log(`  company content reachable: ${skipped.reachable} — "${skipped.heading}"`);
  await clean.close();
}

if (flag('og')) {
  console.log('\nSOCIAL CARD');

  // The card is the opening frame, shot at the size the meta tags declare and
  // written straight into public/. It used to be a render of the retired
  // object, which meant the first thing anyone saw of the site was the
  // graveyard. Regenerating it from the running page is the only way it stays
  // true to whatever the site actually is.
  const card = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
  });
  const framed = await card.newPage();
  await framed.goto(BASE, { waitUntil: 'domcontentloaded' });
  await framed.waitForTimeout(7000);
  const jpeg = await framed.screenshot({ type: 'jpeg', quality: 88 });
  await writeFile(path.resolve('public/social/og-dark-lattice.jpg'), jpeg);
  console.log(`  public/social/og-dark-lattice.jpg  ${(jpeg.length / 1024).toFixed(0)}kB at 2400x1260`);
  await framed.close();
  await card.close();
}

if (flag('paths')) {
  console.log('\nTHE OTHER PATHS');

  /** Company content has to be reachable and readable on every one of these. */
  const companyCheck = () =>
    page.evaluate(() => {
      const sections = ['premise', 'studio'];
      const missing = sections.filter((id) => !document.getElementById(id));
      const contact = document.querySelector('a[href^="mailto:"]');
      const words = (document.getElementById('main')?.innerText ?? '').trim().split(/\s+/).length;
      return { missing, contact: !!contact, words };
    });

  // --- Mobile: a different composition, not a smaller one -----------------
  {
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const phone = await mobile.newPage();
    await phone.goto(BASE, { waitUntil: 'domcontentloaded' });
    await phone.waitForTimeout(6000);
    await writeFile(path.join(OUT, '40-mobile-open.png'), await phone.screenshot({ type: 'png' }));

    const shape = await phone.evaluate(() => {
      const canvas = document.getElementById('lattice-canvas');
      if (!canvas) return null;
      const copy = document.createElement('canvas');
      copy.width = 240;
      copy.height = Math.round((240 * canvas.height) / canvas.width);
      const c = copy.getContext('2d');
      return new Promise((resolve) =>
        requestAnimationFrame(() => {
          c.drawImage(canvas, 0, 0, copy.width, copy.height);
          const { data } = c.getImageData(0, 0, copy.width, copy.height);
          let lit = 0;
          for (let i = 0; i < data.length; i += 4) {
            const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
            if (l > 0.04) lit++;
          }
          resolve({ litShare: lit / (data.length / 4) });
        })
      );
    });
    console.log(`  mobile 390x844: structure covers ${(shape.litShare * 100).toFixed(1)}% of the frame`);
    await phone.close();
    await mobile.close();
  }

  // --- Touch: a flick is travel, a tap is an action -----------------------
  {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const thumb = await phone.newPage();
    await thumb.goto(BASE, { waitUntil: 'domcontentloaded' });

    // The counters this probe reads live behind an import.meta.env.DEV guard,
    // so against a production build there is nothing to measure. Say so and
    // move on rather than failing the whole run — every other check in this
    // block is worth having against the built site.
    const instrumented = await thumb
      .waitForFunction(() => window.__correction?.telemetry?.tick > 0, { timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (!instrumented) {
      console.log('  touch: skipped — no dev handle on this build');
      await thumb.close();
      await phone.close();
    } else {

    /**
     * Budget is the honest reading here. It is spent on the main thread the
     * instant a press is accepted, whereas `injections` has to come back from
     * the Worker on the next published snapshot — reading that in the same
     * turn as the gesture reports the state from before it.
     */
    const state = async () => {
      await thumb.waitForTimeout(600);
      return thumb.evaluate(() => ({
        budget: window.__correction?.budget ?? -1,
        injections: window.__correction?.telemetry?.injections ?? -1,
      }));
    };

    const gesture = (steps) =>
      thumb.evaluate((path) => {
        const fire = (type, y) =>
          window.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 7,
              pointerType: 'touch',
              clientX: 195,
              clientY: y,
              bubbles: true,
            })
          );
        for (const [type, y] of path) fire(type, y);
      }, steps);

    const start = await state();

    // A flick: contact, travel, release. This is what scrolling the descent
    // with a thumb looks like to the page.
    await gesture([
      ['pointerdown', 700],
      ['pointermove', 560],
      ['pointermove', 380],
      ['pointerup', 300],
    ]);
    const afterFlick = await state();

    // A tap: contact and release in the same place.
    await gesture([
      ['pointerdown', 500],
      ['pointerup', 500],
    ]);
    const afterTap = await state();

    const flickCost = start.budget - afterFlick.budget;
    const tapCost = afterFlick.budget - afterTap.budget;
    console.log(
      `  touch: 400px flick costs ${flickCost} presses ` +
        `(${flickCost === 0 ? 'TRAVEL IS FREE' : 'FLICK CHARGED AS A PRESS'})`
    );
      console.log(
        `  touch: tap costs ${tapCost} press, injections ${afterFlick.injections} -> ${afterTap.injections} ` +
          `(${tapCost === 1 ? 'THE ACTION STILL WORKS' : 'TAP DOES NOTHING'})`
      );
      await thumb.close();
      await phone.close();
    }
  }

  // --- Reduced motion: the triptych, and a world that does not move -------
  {
    const still = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      reducedMotion: 'reduce',
    });
    const reader = await still.newPage();
    await reader.goto(BASE, { waitUntil: 'domcontentloaded' });
    await reader.waitForTimeout(9000);

    const triptych = await reader.evaluate(() => {
      const figure = document.querySelector('[data-triptych]');
      if (!figure) return { present: false };
      const images = Array.from(figure.querySelectorAll('img'));
      return {
        present: !figure.hidden,
        frames: images.length,
        filled: images.filter((img) => img.src.startsWith('data:image/png')).length,
        alt: images.map((img) => img.alt.slice(0, 34)),
        askHidden: !document.querySelector('.band--ask')?.getBoundingClientRect().height,
      };
    });
    console.log(
      `  reduced motion: triptych shown ${triptych.present}, ${triptych.filled}/${triptych.frames} frames rendered, ` +
        `invitation hidden ${triptych.askHidden}`
    );

    // The triptych is a real correction event on the real world, so the
    // Worker's adjustment count is around two hundred before the visitor has
    // done anything. None of it is theirs, and none of it may reach the
    // record.
    await reader.evaluate(() => {
      const parts = Array.from(document.querySelectorAll('[data-band="floor"]'));
      if (!parts.length) return;
      const top = Math.min(...parts.map((el) => el.getBoundingClientRect().top + window.scrollY));
      window.scrollTo(0, top);
    });
    await reader.waitForTimeout(1200);
    const owned = await reader.evaluate(() => ({
      panel: (document.querySelector('[data-record]')?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      stored: window.localStorage.getItem('darkLattice.record'),
    }));
    console.log(`  reduced motion record: ${owned.panel}`);
    console.log(`    stored: ${owned.stored}`);

    await reader.evaluate(() => {
      document.querySelector('[data-triptych]')?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    await reader.waitForTimeout(600);
    await writeFile(path.join(OUT, '41-reduced-triptych.png'), await reader.screenshot({ type: 'png' }));
    await reader.close();
    await still.close();
  }

  // --- Reduced motion on a phone: both recompositions at once -------------
  {
    const both = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const reader = await both.newPage();
    await reader.goto(BASE, { waitUntil: 'domcontentloaded' });
    await reader.waitForTimeout(9000);
    const shape = await reader.evaluate(() => {
      const img = document.querySelector('[data-triptych-frame="strain"]');
      if (!img) return null;
      img.scrollIntoView({ block: 'center', behavior: 'instant' });
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    await reader.waitForTimeout(500);
    await writeFile(path.join(OUT, '43-reduced-mobile.png'), await reader.screenshot({ type: 'png' }));
    console.log(`  reduced motion on a phone: stills are ${shape?.w}x${shape?.h}`);
    await reader.close();
    await both.close();
  }

  // --- No WebGL: the machine is simply absent -----------------------------
  {
    const blind = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
    // Refusing the context is the honest simulation of a machine that cannot
    // give us one, and it exercises the same branch as a driver failure.
    await blind.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl2' || type === 'webgl') return null;
        return original.call(this, type, ...rest);
      };
    });
    const reader = await blind.newPage();
    await reader.goto(BASE, { waitUntil: 'domcontentloaded' });
    await reader.waitForTimeout(3000);

    const state = await reader.evaluate(() => ({
      fallback: document.documentElement.classList.contains('no-webgl'),
      bands: document.querySelectorAll('.band').length,
      canvas: !!document.getElementById('lattice-canvas'),
      enterHref: document.querySelector('[data-fallback-href]')?.getAttribute('href'),
      premise: !!document.getElementById('premise'),
      studio: !!document.getElementById('studio'),
      loader: document.getElementById('loader')?.hidden,
      stored: window.localStorage.getItem('darkLattice.record'),
    }));
    console.log(
      `  no WebGL: fallback ${state.fallback}, machine bands left ${state.bands}, canvas ${state.canvas}, ` +
        `loader cleared ${state.loader}`
    );
    console.log(`    "enter" now points at ${state.enterHref}; premise ${state.premise}, studio ${state.studio}`);
    console.log(`    recorded: ${state.stored}`);

    // The re-aimed control has to carry the keyboard with it, not just the
    // scroll position.
    const focus = await reader.evaluate(async () => {
      document.querySelector('[data-fallback-href]')?.click();
      await new Promise((r) => setTimeout(r, 700));
      const active = document.activeElement;
      return { id: active?.id ?? '(none)', tag: active?.tagName.toLowerCase() ?? '' };
    });
    console.log(`    after "enter", focus is on ${focus.tag}#${focus.id}`);
    await writeFile(path.join(OUT, '42-no-webgl.png'), await reader.screenshot({ type: 'png' }));
    await reader.close();
    await blind.close();
  }

  // --- Keyboard only: the action, and the whole company ------------------
  {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const stops = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      stops.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return '(body)';
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
          return `${el.tagName.toLowerCase()}:${text || el.getAttribute('aria-label') || ''}`;
        })
      );
    }
    console.log(`  keyboard: ${stops.join(' -> ')}`);
  }

  const company = await companyCheck();
  console.log(
    `  company content on the live path: ${company.words} words, contact link ${company.contact}, ` +
      `missing sections ${company.missing.length ? company.missing.join(',') : 'none'}`
  );
}

console.log(`\nwritten to ${OUT}\n`);
await browser.close();
