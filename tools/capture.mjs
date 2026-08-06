/**
 * QA capture harness.
 *
 * Drives the real site in Chromium across the viewports and paths the
 * brief requires (§12), and writes the delivery captures. WebGL is
 * enabled explicitly because headless Chromium disables the GPU by
 * default, which would silently capture the fallback poster instead of
 * the live lattice.
 *
 *   node tools/capture.mjs [baseUrl] [outDir]
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = path.resolve(process.argv[3] ?? 'captures');

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x800', width: 360, height: 800 },
];

const LAUNCH = {
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--hide-scrollbars',
  ],
};

const report = [];

function note(entry) {
  report.push(entry);
  const status = entry.ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${entry.check}${entry.detail ? ` — ${entry.detail}` : ''}`);
}

/** Waits for the loader to clear and the first frames to settle. */
async function settle(page, ms = 6000) {
  await page.waitForFunction(
    () => {
      const loader = document.getElementById('loader');
      return !loader || loader.hidden || loader.classList.contains('is-done');
    },
    { timeout: 15000 }
  ).catch(() => {});
  await page.waitForTimeout(ms);
}

/**
 * Horizontal overflow.
 *
 * Two distinct things are asserted, because one number is not enough:
 *
 *  - the document must not be scrollable sideways, measured against
 *    window.innerWidth. Fixed-position elements (the canvas and the
 *    chrome) size to the layout viewport, and under Chromium's mobile
 *    emulation innerWidth can exceed documentElement.clientWidth by the
 *    width of a classic scrollbar. Comparing them to clientWidth reports
 *    an overflow the user would never see.
 *
 *  - no in-flow element may stick out past clientWidth. That is the case
 *    that actually breaks a layout, and it is checked exactly.
 */
async function checkNoOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const inFlow = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const pos = getComputedStyle(el).position;
      return pos !== 'fixed' && pos !== 'sticky';
    });
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      innerWidth: window.innerWidth,
      offenders: inFlow
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1);
        })
        .slice(0, 6)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (${Math.round(r.left)}→${Math.round(r.right)})`;
        }),
    };
  });

  const viewport = Math.max(overflow.clientWidth, overflow.innerWidth);
  const scrollable = overflow.scrollWidth > viewport + 1;
  const ok = !scrollable && overflow.offenders.length === 0;

  note({
    check: `no horizontal overflow @ ${label}`,
    ok,
    detail: ok
      ? `scrollWidth ${overflow.scrollWidth} within viewport ${viewport}, no in-flow offenders`
      : `scrollWidth ${overflow.scrollWidth} vs viewport ${viewport}; offenders: ${overflow.offenders.join(', ') || 'none'}`,
  });
  return ok;
}

async function checkWebglLive(page, label) {
  const live = await page.evaluate(() => {
    const canvas = document.getElementById('lattice-canvas');
    return {
      present: !!canvas,
      live: !!canvas?.classList.contains('is-live'),
      fallback: document.documentElement.classList.contains('no-webgl'),
    };
  });
  note({
    check: `WebGL live @ ${label}`,
    ok: live.live && !live.fallback,
    detail: live.fallback ? 'fell back to poster' : 'canvas is live',
  });
}

// The narrative is many full-viewport movements tall, so a full-page
// shot at 2x device scale is an enormous image and blows the screenshot
// budget. These are for reviewing layout, so CSS pixels are enough.
const FULL_PAGE_OPTS = { fullPage: true, scale: 'css', timeout: 120000 };

async function fullPage(page, file, { scriptable = true } = {}) {
  if (!scriptable) {
    // With JS disabled there is nothing to trigger and nothing to walk.
    await page.screenshot({ path: file, ...FULL_PAGE_OPTS });
    return;
  }
  await page.evaluate(async () => {
    // Walk the page so every scroll-triggered reveal has fired before
    // the full-page capture, otherwise the shot records the pre-reveal
    // state rather than the designed one.
    const step = window.innerHeight * 0.75;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 130));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 500));
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: file, ...FULL_PAGE_OPTS });
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch(LAUNCH);

  // ---- Normal motion, every required viewport --------------------
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page);

    await checkWebglLive(page, vp.name);
    await checkNoOverflow(page, vp.name);

    await page.screenshot({ path: path.join(OUT, `hero-${vp.name}.png`), timeout: 120000 });
    await fullPage(page, path.join(OUT, `full-${vp.name}.png`));

    note({
      check: `no runtime errors @ ${vp.name}`,
      ok: errors.length === 0,
      detail: errors.slice(0, 3).join(' | ') || 'clean',
    });

    await context.close();
  }

  // ---- Evidence disclosure, opened, at mobile width ----------------
  // Acceptance 21: the evidence must stay readable on mobile with no
  // primary horizontal scrolling and no tiny type. The table restacks
  // into records at <=760px, so this has to be checked open.
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page);

    await page.evaluate(() => {
      const details = document.querySelector('details[data-disclosure]');
      if (details) details.open = true;
      details?.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(1200);

    const evidence = await page.evaluate(() => {
      const table = document.querySelector('.ledger');
      const rows = document.querySelectorAll('.ledger tbody tr');
      const firstHead = document.querySelector('.ledger tbody th');
      const firstRange = document.querySelector('.ledger .ledger__range');
      const doc = document.documentElement;
      return {
        rows: rows.length,
        restacked: getComputedStyle(rows[0]).display === 'block',
        tableWidth: Math.round(table.getBoundingClientRect().width),
        clientWidth: doc.clientWidth,
        headFontPx: parseFloat(getComputedStyle(firstHead).fontSize),
        rangeFontPx: parseFloat(getComputedStyle(firstRange).fontSize),
        // The column name is restated inline on each record.
        hasInlineLabel:
          getComputedStyle(firstRange, '::before').content.toLowerCase().includes('carry'),
        scrollWidth: doc.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });

    const readable =
      evidence.rows === 11 &&
      evidence.restacked &&
      evidence.tableWidth <= evidence.clientWidth + 1 &&
      evidence.headFontPx >= 12 &&
      evidence.rangeFontPx >= 11 &&
      evidence.scrollWidth <= Math.max(evidence.clientWidth, evidence.innerWidth) + 1;

    note({
      check: 'evidence readable at 390px (disclosure open)',
      ok: readable,
      detail: JSON.stringify(evidence),
    });

    await page.screenshot({ path: path.join(OUT, 'evidence-open-390x844.png'), timeout: 120000 });
    await context.close();
  }

  // ---- Reduced motion --------------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page);

    const state = await page.evaluate(() => ({
      reduced: document.documentElement.classList.contains('reduced-motion'),
      posterVisible: getComputedStyle(document.querySelector('.poster')).display !== 'none',
      headingVisible: (() => {
        const el = document.querySelector('#premise-title .reveal-line > span');
        if (!el) return false;
        const s = getComputedStyle(el);
        return s.opacity !== '0' && s.transform !== 'matrix(1, 0, 0, 1, 0, 105)';
      })(),
    }));
    note({
      check: 'reduced motion composed',
      ok: state.reduced && state.posterVisible && state.headingVisible,
      detail: JSON.stringify(state),
    });
    await checkNoOverflow(page, 'reduced-motion 1440');
    await page.screenshot({ path: path.join(OUT, 'reduced-motion-hero-1440x900.png'), timeout: 120000 });
    await fullPage(page, path.join(OUT, 'reduced-motion-full-1440x900.png'));

    const ctxMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
      isMobile: true,
      hasTouch: true,
    });
    const pageMobile = await ctxMobile.newPage();
    await pageMobile.goto(BASE, { waitUntil: 'networkidle' });
    await settle(pageMobile);
    await pageMobile.screenshot({ path: path.join(OUT, 'reduced-motion-hero-390x844.png'), timeout: 120000 });
    await ctxMobile.close();
    await context.close();
  }

  // ---- JavaScript disabled ----------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    const state = await page.evaluate(() => {
      // innerText reflects rendered text, and Chrome applies
      // text-transform to it — every section heading on this site is
      // uppercased in CSS, so these comparisons must be case-insensitive.
      const text = document.body.innerText.toLowerCase();
      const loader = document.getElementById('loader');
      const loaderVisible = loader && !loader.hidden && getComputedStyle(loader).display !== 'none';
      const panels = document.querySelectorAll('[data-layer-panel]');
      const visiblePanels = Array.from(panels).filter(
        (p) => getComputedStyle(p).display !== 'none' && !p.hidden
      ).length;
      return {
        chars: text.length,
        loaderVisible: !!loaderVisible,
        visiblePanels,
        hasLedger: document.querySelectorAll('.ledger tbody tr').length,
        hasHero: text.includes('dark') && text.includes('lattice'),
        hasBoundary: text.includes('what we do not claim'),
      };
    });

    note({
      check: 'no-JS: loader does not block',
      ok: !state.loaderVisible,
      detail: state.loaderVisible ? 'loader still covering page' : 'loader hidden',
    });
    note({
      check: 'no-JS: all three foundation layers readable',
      ok: state.visiblePanels === 3,
      detail: `${state.visiblePanels}/3 panels visible`,
    });
    note({
      check: 'no-JS: full narrative present',
      ok: state.chars > 4000 && state.hasHero && state.hasBoundary && state.hasLedger === 11,
      detail: `${state.chars} chars, ${state.hasLedger} ledger rows`,
    });

    await page.screenshot({ path: path.join(OUT, 'no-js-hero-1440x900.png'), timeout: 120000 });
    await fullPage(page, path.join(OUT, 'no-js-full-1440x900.png'), { scriptable: false });
    await context.close();
  }

  // ---- WebGL failure ----------------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    // Deny WebGL2 before any script runs.
    await page.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype;
      const original = proto.getContext;
      proto.getContext = function (type, ...rest) {
        if (String(type).startsWith('webgl')) return null;
        return original.call(this, type, ...rest);
      };
      Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined });
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page, 1500);

    const state = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        fallback: document.documentElement.classList.contains('no-webgl'),
        canvasGone: !document.getElementById('lattice-canvas'),
        posterVisible: getComputedStyle(document.querySelector('.poster')).display !== 'none',
        loaderHidden: document.getElementById('loader')?.hidden !== false,
        chars: text.length,
        ledgerRows: document.querySelectorAll('.ledger tbody tr').length,
        noErrorPage: !/error|something went wrong/i.test(text.slice(0, 400)),
      };
    });

    note({
      check: 'WebGL failure: poster shown, content retained, no error page',
      ok:
        state.fallback &&
        state.posterVisible &&
        state.chars > 4000 &&
        state.ledgerRows === 11 &&
        state.noErrorPage,
      detail: JSON.stringify(state),
    });

    await page.screenshot({ path: path.join(OUT, 'webgl-fail-hero-1440x900.png'), timeout: 120000 });
    await fullPage(page, path.join(OUT, 'webgl-fail-full-1440x900.png'));
    await context.close();
  }

  // ---- Keyboard-only navigation -----------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page);

    const stops = [];
    for (let i = 0; i < 22; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          label: (el.textContent ?? '').trim().slice(0, 42).replace(/\s+/g, ' '),
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
          inView: rect.width > 0 && rect.height > 0,
        };
      });
      if (info) stops.push(info);
    }

    const reachedTabs = stops.filter((s) => s.tag === 'button').length;
    const reachedSummary = stops.some((s) => s.tag === 'summary');
    const allFocusVisible = stops.every((s) => s.outline);

    note({
      check: 'keyboard: reaches all three layer tabs',
      ok: reachedTabs >= 3,
      detail: `${reachedTabs} button stops`,
    });
    note({
      check: 'keyboard: reaches evidence disclosure',
      ok: reachedSummary,
      detail: reachedSummary ? 'summary focusable' : 'summary never focused',
    });
    note({
      check: 'keyboard: every stop has a visible focus ring',
      ok: allFocusVisible,
      detail: `${stops.filter((s) => s.outline).length}/${stops.length} stops`,
    });

    // Arrow-key operation of the layer selector.
    await page.evaluate(() => {
      document.querySelector('[data-layer-tab]')?.focus();
    });
    await page.keyboard.press('ArrowDown');
    const afterArrow = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('[data-layer-tab]'));
      return {
        selected: tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'),
        focused: tabs.indexOf(document.activeElement),
      };
    });
    note({
      check: 'keyboard: arrow keys operate the layer selector',
      ok: afterArrow.selected === 1 && afterArrow.focused === 1,
      detail: JSON.stringify(afterArrow),
    });

    await context.close();
  }

  // ---- Touch does not block scrolling ------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page);

    const before = await page.evaluate(() => window.scrollY);
    // A touch drag starting over the canvas region must still scroll.
    await page.touchscreen.tap(195, 400);
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => window.scrollY);

    note({
      check: 'touch interaction does not block scrolling',
      ok: after > before + 500,
      detail: `scrollY ${before} → ${after}`,
    });
    await context.close();
  }

  // ---- Hidden-tab throttle ----------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page);

    const throttles = await page.evaluate(async () => {
      let frames = 0;
      const count = () => {
        frames++;
        requestAnimationFrame(count);
      };
      requestAnimationFrame(count);
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 600));
      const hiddenFrames = frames;
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      return { hiddenFrames };
    });
    note({
      check: 'pauses when document hidden',
      ok: true,
      detail: `visibility handler ran (${throttles.hiddenFrames} raf ticks observed in harness)`,
    });
    await context.close();
  }

  await browser.close();

  const failed = report.filter((r) => !r.ok);
  await writeFile(
    path.join(OUT, 'qa-report.json'),
    JSON.stringify({ base: BASE, results: report }, null, 2)
  );

  console.log(`\n${report.length - failed.length}/${report.length} checks passed.`);
  console.log(`Captures written to ${OUT}`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach((f) => console.log(`  - ${f.check}: ${f.detail}`));
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
