// Quality harness for the genesis build (localhost:5180).
// Headed Chrome on the real GPU where there is one. See tools/env.mjs.
//   node tools/quality.mjs
//
// Tests, in the order the claims appear on the page:
//   1. replay        same seed, same steps, same world (two fresh loads)
//   2. first action  press -> authoritative state -> record, and it is fast
//   3. accessibility landmarks, heading structure, nav anchors, focus
//   4. reduced motion  content parity with animation removed
//   5. console       zero errors across all of the above
import { launch } from './env.mjs';

const BASE = process.env.DL_BASE || 'http://localhost:5180';
const results = [];
const consoleErrors = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
}

const browser = await launch();

async function harnessPage(context) {
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(BASE + '/?harness=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__dl === 'object');
  return page;
}

// --- 1. replay determinism (tested environment) ---
{
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await harnessPage(ctxA);
  const b = await harnessPage(ctxB);
  const snapA = await a.evaluate(() => {
    window.__dl.stepTo(900);
    return window.__dl.snapshot();
  });
  const snapB = await b.evaluate(() => {
    window.__dl.stepTo(900);
    return window.__dl.snapshot();
  });
  check(
    'replay: identical world at T+900 across two loads',
    snapA.tick === snapB.tick && snapA.sum === snapB.sum && snapA.sum > 0,
    'sumA=' + snapA.sum.toFixed(6) + ' sumB=' + snapB.sum.toFixed(6)
  );

  // --- 2. first action ---
  const before = await a.evaluate(() => window.__dl.records());
  const t0 = Date.now();
  const placed = await a.evaluate(() => window.__dl.placeMark(0.42, 0.55));
  const after = await a.evaluate(() => window.__dl.records());
  // The chip was removed from the hero in 02bebeb; the ledger is the record.
  const newest = await a.evaluate(
    () => (document.querySelector('#record-list li') || {}).textContent || 'NO LEDGER ROW'
  );
  check(
    'first action: press writes the record immediately',
    // MARK 01 belongs to the prior history now - the ledger opens with a
    // seeded past and the visitor's first press CONTINUES the count. The
    // check asserts the seating and the increment, whatever the number.
    placed === true && after === before + 1 && newest.includes('SEATED IN THE FACE') && Date.now() - t0 < 500,
    newest
  );

  // --- 2b. the witnessed cull ---
  // Gate 5, 2026-08-22: the seeded appointment fells one camera-facing
  // cell between 52 and 76 seconds in, and the next natural strike is
  // minutes out. Ninety seconds of law must therefore hold EXACTLY one
  // CULLED row: zero means the appointment silently died, two means the
  // cull became weather.
  const culls = await a.evaluate(() => {
    window.__dl.stepTo(5400);
    const rows = Array.from(document.querySelectorAll('#record-list li'))
      .map((li) => li.textContent || '')
      .filter((r) => r.includes('STRUCK FROM THE FACE'));
    return { rows, pits: window.__dl.cullPits() };
  });
  check(
    'witnessed cull: exactly one unprompted strike inside a 90s dwell',
    culls.rows.length === 1 && culls.rows[0].includes('CULLED'),
    culls.rows.join(' | ') || 'no strike by T+5400'
  );
  check(
    'witnessed cull: the struck cell faces the landing camera (z > 0)',
    culls.pits.length === 1 && culls.pits[0].z > 0,
    JSON.stringify(culls.pits)
  );
  await ctxA.close();
  await ctxB.close();
}

// --- 3. accessibility smoke ---
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const a11y = await page.evaluate(() => {
    const h1s = document.querySelectorAll('h1').length;
    const landmarks =
      !!document.querySelector('header') &&
      !!document.querySelector('main') &&
      !!document.querySelector('footer');
    const badAnchors = Array.from(document.querySelectorAll('a[href^="#"]')).filter(
      (a) => a.getAttribute('href').length > 1 && !document.getElementById(a.getAttribute('href').slice(1))
    ).length;
    const labelled = Array.from(document.querySelectorAll('section[aria-labelledby]')).every(
      (s) => !!document.getElementById(s.getAttribute('aria-labelledby'))
    );
    const headingOrderOk = (() => {
      const hs = Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => +h.tagName[1]);
      let prev = 0;
      for (const l of hs) {
        if (l - prev > 1) return false;
        prev = l;
      }
      return true;
    })();
    return { h1s, landmarks, badAnchors, labelled, headingOrderOk };
  });
  check(
    'a11y: one h1, landmarks, resolving anchors and labels, heading order',
    a11y.h1s === 1 && a11y.landmarks && a11y.badAnchors === 0 && a11y.labelled && a11y.headingOrderOk,
    JSON.stringify(a11y)
  );

  const focusVisible = await page.evaluate(() => {
    const link = document.querySelector('.site-nav a');
    link.focus();
    const s = getComputedStyle(link);
    return s.outlineStyle !== 'none' || document.activeElement === link;
  });
  check('a11y: keyboard focus lands and is styleable', focusVisible, '');
  await ctx.close();
}

// --- 4. reduced motion parity ---
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce'
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const parity = await page.evaluate(() => {
    const reveals = Array.from(document.querySelectorAll('[data-reveal]'));
    const allVisible = reveals.every((el) => getComputedStyle(el).opacity === '1');
    const contentThere = ['desk42', 'brawler', 'technology', 'studio', 'contact'].every(
      (id) => !!document.getElementById(id)
    );
    return { allVisible, contentThere, reveals: reveals.length };
  });
  check(
    'reduced motion: every section readable with animation removed',
    parity.allVisible && parity.contentThere,
    JSON.stringify(parity)
  );
  await ctx.close();
}

// --- 5. temporal calm: nothing may strobe (the flicker regression guard) ---
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.getElementById('rule').scrollIntoView({ block: 'start' }));
  // Settle in FRAMES, not milliseconds. The camera has to arrive before a
  // strobe reading means anything, and arrival costs frames: 2500ms buys 150
  // of them on a real GPU and three on a software rasteriser, where this read
  // 4.6% for a world measured calm at 0.2% once it had actually landed. The
  // measurement window below stays wall-clock, because strobe is wall-clock.
  await page.evaluate(
    (n) =>
      new Promise((done) => {
        let i = 0;
        const tick = () => (++i < n ? requestAnimationFrame(tick) : done());
        requestAnimationFrame(tick);
      }),
    150
  );
  const diff = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const src = document.getElementById('world');
        const grab = () => {
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 180;
          const x = c.getContext('2d');
          x.drawImage(src, 0, 0, 320, 180);
          return x.getImageData(0, 0, 320, 180).data;
        };
        requestAnimationFrame(() => {
          const a = grab();
          setTimeout(
            () =>
              requestAnimationFrame(() => {
                const b = grab();
                let sum = 0;
                const n = 320 * 180;
                for (let i = 0; i < n; i++) {
                  sum +=
                    Math.abs(a[i * 4] - b[i * 4]) +
                    Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) +
                    Math.abs(a[i * 4 + 2] - b[i * 4 + 2]);
                }
                resolve(sum / (n * 3 * 255));
              }),
            500
          );
        });
      })
  );
  check(
    'temporal calm: drift allowed, strobe forbidden (under 4%/half-second)',
    diff < 0.04,
    'diff=' + diff.toFixed(5)
  );
  await ctx.close();
}

// --- 6. console ---
check('console: zero errors across all runs', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed === 0 ? 0 : 1);
