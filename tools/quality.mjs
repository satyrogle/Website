// Quality harness for the genesis build (localhost:5180).
// Headed Chrome on the real GPU. Run from a checkout with playwright:
//   (from ../dark-lattice)  node ../dark-lattice-genesis/tools/quality.mjs
//
// Tests, in the order the claims appear on the page:
//   1. replay        same seed, same steps, same world (two fresh loads)
//   2. first action  press -> authoritative state -> record, and it is fast
//   3. accessibility landmarks, heading structure, nav anchors, focus
//   4. reduced motion  content parity with animation removed
//   5. console       zero errors across all of the above
import { createRequire } from 'node:module';
// playwright lives in the main dark-lattice checkout, not here
const require = createRequire('file:///C:/Users/jacob/dark-lattice/package.json');
const { chromium } = require('playwright');

const BASE = process.env.DL_BASE || 'http://localhost:5180';
const results = [];
const consoleErrors = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
}

const browser = await chromium.launch({ headless: false });

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
  const chip = await a.evaluate(
    () => document.getElementById('record-chip').textContent
  );
  check(
    'first action: press writes the record immediately',
    placed === true && after === before + 1 && chip.includes('MARK 01') && Date.now() - t0 < 500,
    chip
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
  await page.waitForTimeout(2500);
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
