/**
 * QA capture harness and composition gates.
 *
 * Drives the real site across the required viewports and paths, writes
 * the delivery captures, and asserts the locked gates. The composition
 * gates are measured rather than eyeballed: the subject's screen box is
 * read from the rendered pixels with the copy hidden, then compared
 * against the copy's own DOM box.
 *
 *   node tools/capture.mjs [baseUrl] [outDir]
 */

import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { launch, settle, seek, seekSection, renderer } from './browser.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = path.resolve(process.argv[3] ?? 'captures');

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];

/** Public copy and chrome that must not exist anywhere on the page. */
const FORBIDDEN = [
  'three games',
  'one accumulating systems stack',
  'initialising lattice',
  'enter the system',
  '02 / premise',
  '03 / state',
  '04 / foundation',
  '05 / accumulation',
  'roguelite',
];

const report = [];

function note(check, ok, detail) {
  report.push({ check, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${check}${detail ? ` — ${detail}` : ''}`);
}

/**
 * The subject's screen box, measured from the rendered frame with all
 * copy hidden.
 *
 * Two filters matter. The luma cut sits above the halo's broad wash, so
 * the box is the STRUCTURE rather than the glow standing behind it; and
 * a column or row only counts once several of its pixels clear the cut,
 * which drops the motes. Without both, the measured box was the whole
 * frame and the gate could never fail.
 */
async function subjectBox(page) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'dl-gate';
    style.textContent =
      '.prologue__copy, .masthead, .skip-link { opacity: 0 !important; }';
    document.head.appendChild(style);
  });
  await page.waitForTimeout(320);
  const shot = await page.screenshot({ type: 'png' });
  await page.evaluate(() => document.getElementById('dl-gate')?.remove());
  await page.waitForTimeout(200);

  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;

    const CUT = 0.17;
    const MIN_RUN = 6;
    const cols = new Uint32Array(c.width);
    const rows = new Uint32Array(c.height);
    let lit = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const luma = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        if (luma < CUT) continue;
        cols[x]++;
        rows[y]++;
        lit++;
      }
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let x = 0; x < c.width; x++) {
      if (cols[x] < MIN_RUN) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    for (let y = 0; y < c.height; y++) {
      if (rows[y] < MIN_RUN) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const scale = c.width / window.innerWidth;
    if (!lit || minX === Infinity) return { empty: true, lit };
    return {
      empty: false,
      lit,
      left: minX / scale,
      right: maxX / scale,
      top: minY / scale,
      bottom: maxY / scale,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }, shot.toString('base64'));
}

async function copyBox(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const boxes = Array.from(el.children).map((child) => child.getBoundingClientRect());
    if (!boxes.length) boxes.push(el.getBoundingClientRect());
    return {
      left: Math.min(...boxes.map((b) => b.left)),
      right: Math.max(...boxes.map((b) => b.right)),
      top: Math.min(...boxes.map((b) => b.top)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
      opacity: Number(getComputedStyle(el).opacity),
    };
  }, selector);
}

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
  const ok = overflow.scrollWidth <= viewport + 1 && overflow.offenders.length === 0;
  note(
    `no horizontal overflow @ ${label}`,
    ok,
    ok ? `scrollWidth ${overflow.scrollWidth} within ${viewport}` : JSON.stringify(overflow)
  );
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await launch();

  // ---- Per viewport ------------------------------------------------
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
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

    const live = await page.evaluate(() => ({
      live: !!document.getElementById('lattice-canvas')?.classList.contains('is-live'),
      fallback: document.documentElement.classList.contains('no-webgl'),
    }));
    note(`WebGL live @ ${vp.name}`, live.live && !live.fallback, JSON.stringify(live));

    await checkNoOverflow(page, vp.name);
    await page.screenshot({ path: path.join(OUT, `hero-${vp.name}.png`) });

    // GATE: hero copy must not cross the monolith.
    await seek(page, 0.02);
    const heroSubject = await subjectBox(page);
    const heroCopy = await copyBox(page, '.beat--hero');
    if (vp.width >= 900) {
      const clear = heroCopy && !heroSubject.empty && heroCopy.right <= heroSubject.left + 6;
      note(
        `hero copy clears the monolith @ ${vp.name}`,
        !!clear,
        `copy right ${Math.round(heroCopy?.right ?? -1)} vs subject left ${Math.round(heroSubject.left ?? -1)}`
      );
    } else {
      const clear = heroCopy && !heroSubject.empty && heroCopy.top >= heroSubject.bottom - 24;
      note(
        `hero copy clears the monolith @ ${vp.name}`,
        !!clear,
        `copy top ${Math.round(heroCopy?.top ?? -1)} vs subject bottom ${Math.round(heroSubject.bottom ?? -1)}`
      );
    }

    // GATE: tunnel copy must not cover the centre of the passage.
    for (const [beat, at] of [['t1', 0.34], ['t2', 0.54], ['t3', 0.72]]) {
      await seek(page, at, 1400);
      const box = await copyBox(page, `.beat--${beat}`);
      if (vp.width >= 900) {
        const centre = [vp.width * 0.38, vp.width * 0.62];
        const overlaps =
          box && box.opacity > 0.05 && box.right > centre[0] && box.left < centre[1];
        note(
          `tunnel copy clears the passage centre (${beat}) @ ${vp.name}`,
          !overlaps,
          box ? `${Math.round(box.left)}→${Math.round(box.right)} vs centre ${Math.round(centre[0])}–${Math.round(centre[1])}` : 'beat missing'
        );
      } else {
        // Portrait: the passage runs down the middle of the frame, so
        // the safe zone is below it rather than beside it.
        const clear = box && box.top >= vp.height * 0.6;
        note(
          `tunnel copy clears the passage centre (${beat}) @ ${vp.name}`,
          !!clear,
          box ? `copy top ${Math.round(box.top)} vs safe zone ${Math.round(vp.height * 0.6)}` : 'beat missing'
        );
      }
    }

    // GATE: nothing covers the latent core.
    await seek(page, 0.86);
    const latentSubject = await subjectBox(page);
    const latentCopy = await copyBox(page, '.beat--latent');
    const latentClear =
      latentCopy &&
      !latentSubject.empty &&
      (latentCopy.right <= latentSubject.left + 6 ||
        latentCopy.bottom <= latentSubject.top + 6 ||
        latentCopy.top >= latentSubject.bottom - 6);
    note(
      `latent copy clears the core @ ${vp.name}`,
      !!latentClear,
      `copy ${Math.round(latentCopy?.left ?? -1)}→${Math.round(latentCopy?.right ?? -1)} / bottom ${Math.round(latentCopy?.bottom ?? -1)}; core ${Math.round(latentSubject.left ?? -1)}→${Math.round(latentSubject.right ?? -1)} / top ${Math.round(latentSubject.top ?? -1)}`
    );

    // GATE: the renderer stops and the canvas is gone behind the editorial.
    await seekSection(page, '#method', 1600);
    const parked = await page.evaluate(() => {
      const frame = document.querySelector('[data-prologue-frame]');
      const rect = frame?.getBoundingClientRect();
      return {
        parked: document.documentElement.classList.contains('prologue-parked'),
        frameOpacity: frame ? Number(getComputedStyle(frame).opacity) : null,
        offscreen: rect ? rect.bottom <= 0 || rect.top >= window.innerHeight : true,
        editorialBg: getComputedStyle(document.querySelector('.editorial')).backgroundColor,
      };
    });
    note(
      `renderer stopped and canvas gone behind editorial @ ${vp.name}`,
      parked.parked && (parked.offscreen || parked.frameOpacity === 0),
      JSON.stringify(parked)
    );

    await seekSection(page, '#work', 1400);
    await page.screenshot({ path: path.join(OUT, `desk42-${vp.name}.png`) });
    await seekSection(page, '#evidence', 1400);
    await page.screenshot({ path: path.join(OUT, `evidence-${vp.name}.png`) });

    note(
      `no runtime errors @ ${vp.name}`,
      errors.length === 0,
      errors.slice(0, 3).join(' | ') || 'clean'
    );

    await context.close();
  }

  // ---- Public copy and structure ------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page, 1200);

    const text = (await page.evaluate(() => document.body.innerText)).toLowerCase();
    const found = FORBIDDEN.filter((phrase) => text.includes(phrase));
    note('no forbidden public copy', found.length === 0, found.join(', ') || 'clean');

    const chrome = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        progressCounter: /\d{1,3}\s*\/\s*100/.test(body),
        sectionNumbers: /(^|\n)\s*0[1-9]\s*\/\s/.test(body),
        loader: !!document.getElementById('loader'),
      };
    });
    note(
      'no progress counter, section numbering or loader',
      !chrome.progressCounter && !chrome.sectionNumbers && !chrome.loader,
      JSON.stringify(chrome)
    );

    const links = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (href.startsWith('#')) {
          out.push({ href, ok: !!document.querySelector(href) });
        } else {
          out.push({ href, ok: href.length > 0 && href !== '#' });
        }
      });
      return out;
    });
    const broken = links.filter((l) => !l.ok);
    note('every anchor and CTA has a real target', broken.length === 0, broken.map((b) => b.href).join(', ') || `${links.length} links`);

    const structure = await page.evaluate(() => ({
      beats: document.querySelectorAll('[data-beat]').length,
      products: document.querySelectorAll('.product').length,
      rows: document.querySelectorAll('.row').length,
      proof: document.querySelectorAll('.proof li').length,
      h1: document.querySelectorAll('h1').length,
    }));
    note(
      'homepage structure',
      structure.beats === 5 &&
        structure.products === 2 &&
        structure.rows === 3 &&
        structure.proof === 3 &&
        structure.h1 === 1,
      JSON.stringify(structure)
    );

    await context.close();
  }

  // ---- Reduced motion ------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page);
    const state = await page.evaluate(() => ({
      reduced: document.documentElement.classList.contains('reduced-motion'),
      heroReadable: (() => {
        const el = document.querySelector('#hero-title .reveal-line > span');
        if (!el) return false;
        const s = getComputedStyle(el);
        return s.opacity !== '0' && !s.transform.includes('104');
      })(),
      statements: Array.from(document.querySelectorAll('.statement')).length,
    }));
    note(
      'reduced motion: composed and immediately readable',
      state.reduced && state.heroReadable && state.statements === 5,
      JSON.stringify(state)
    );
    await checkNoOverflow(page, 'reduced-motion 1440');
    await page.screenshot({ path: path.join(OUT, 'reduced-motion-hero-1440x900.png') });
    await context.close();
  }

  // ---- JavaScript disabled -------------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    const state = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        chars: text.length,
        hasHero: text.includes('dark lattice'),
        hasTunnel: text.includes('the change travels'),
        hasLatent: text.includes('still present'),
        hasDesk42: text.includes('desk42'),
        hasBrawler: text.includes('brawler'),
        hasMethod: text.includes('what carries forward'),
        hasEvidence: text.includes('rather be checked'),
      };
    });
    const ok = Object.entries(state).every(([k, v]) => (k === 'chars' ? v > 1400 : v));
    note('no-JS: full narrative readable', ok, JSON.stringify(state));
    await checkNoOverflow(page, 'no-js 1440');
    await page.screenshot({ path: path.join(OUT, 'no-js-hero-1440x900.png') });
    await page.screenshot({
      path: path.join(OUT, 'no-js-full-1440x900.png'),
      fullPage: true,
      scale: 'css',
    });
    await context.close();
  }

  // ---- WebGL failure ---------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
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
    await page.waitForTimeout(2200);

    const state = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        fallback: document.documentElement.classList.contains('no-webgl'),
        canvasGone: !document.getElementById('lattice-canvas'),
        posterVisible: !!document.querySelector('[data-poster]'),
        chars: text.length,
        hasTunnel: text.includes('the change travels'),
        hasEvidence: text.includes('rather be checked'),
        noErrorPage: !/error|something went wrong/i.test(text.slice(0, 400)),
      };
    });
    note(
      'WebGL failure: poster shown, complete narrative retained',
      state.fallback &&
        state.canvasGone &&
        state.posterVisible &&
        state.chars > 1400 &&
        state.hasTunnel &&
        state.hasEvidence &&
        state.noErrorPage,
      JSON.stringify(state)
    );
    await page.screenshot({ path: path.join(OUT, 'webgl-fail-hero-1440x900.png') });
    await context.close();
  }

  // ---- Evidence page ---------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/evidence.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const evidence = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        rows: document.querySelectorAll('.ledger tbody tr').length,
        percentages: /\d+\s*[–-]\s*\d+\s*%/.test(text),
        counter: /\d{1,3}\s*\/\s*100/.test(text),
        canvas: !!document.getElementById('lattice-canvas'),
        qualitative: text.includes('Usually rewritten') && text.includes('Largely retained'),
      };
    });
    note(
      'evidence page: qualitative, no percentage ranges, no counter, no WebGL',
      evidence.rows === 11 &&
        !evidence.percentages &&
        !evidence.counter &&
        !evidence.canvas &&
        evidence.qualitative,
      JSON.stringify(evidence)
    );
    await checkNoOverflow(page, 'evidence 1440');
    await page.screenshot({ path: path.join(OUT, 'evidence-page-1440x900.png'), fullPage: true, scale: 'css' });

    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(OUT, 'evidence-print-1440x900.png'),
      fullPage: true,
      scale: 'css',
    });
    await page.emulateMedia({ media: 'screen' });

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(`${BASE}/evidence.html`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(700);
    const restacked = await mobilePage.evaluate(() => {
      const row = document.querySelector('.ledger tbody tr');
      const doc = document.documentElement;
      return {
        restacked: getComputedStyle(row).display === 'block',
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        fontPx: parseFloat(getComputedStyle(document.querySelector('.ledger tbody th')).fontSize),
      };
    });
    note(
      'evidence readable at 390px',
      restacked.restacked &&
        restacked.scrollWidth <= restacked.clientWidth + 1 &&
        restacked.fontPx >= 12,
      JSON.stringify(restacked)
    );
    await mobilePage.screenshot({ path: path.join(OUT, 'evidence-390x844.png'), fullPage: true, scale: 'css' });
    await mobile.close();
    await context.close();
  }

  // ---- Touch must not block scrolling ----------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page, 1500);
    const before = await page.evaluate(() => window.scrollY);
    await page.touchscreen.tap(195, 400);
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => window.scrollY);
    note('touch does not block scrolling', after > before + 700, `scrollY ${before} → ${after}`);
    await context.close();
  }

  // ---- Keyboard --------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(page, 1500);
    const stops = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        };
      });
      if (info) stops.push(info);
    }
    note(
      'keyboard: every stop has a visible focus ring',
      stops.length > 0 && stops.every((s) => s.outline),
      `${stops.filter((s) => s.outline).length}/${stops.length} stops`
    );
    await context.close();
  }

  await browser.close();

  // ---- Shipped source must not encode the retired entity ---------------
  {
    const distDir = path.resolve('dist');
    const banned = /\b(crown|face_shard|left-eye|right-eye|beak|gyre|convergence ring|iris)\b/i;
    let hits = [];
    try {
      const walk = async (dir) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else if (/\.(js|css|html)$/.test(entry.name)) {
            const body = await readFile(full, 'utf8');
            if (banned.test(body)) hits.push(entry.name);
          }
        }
      };
      await walk(distDir);
      note('no retired entity concepts in the shipped build', hits.length === 0, hits.join(', ') || 'clean');
    } catch {
      note('no retired entity concepts in the shipped build', false, 'dist/ not built');
    }
  }

  const failed = report.filter((r) => !r.ok);
  await writeFile(
    path.join(OUT, 'qa-report.json'),
    JSON.stringify({ base: BASE, renderer: renderer(), results: report }, null, 2)
  );

  console.log(`\nrenderer: ${renderer()}`);
  console.log(`${report.length - failed.length}/${report.length} checks passed.`);
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
