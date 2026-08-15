/**
 * slice-capture.mjs — Act I stills, on the real GPU.
 *
 * The Act I slice is judged on frames, not on a clean console. Headed Chrome
 * so the frames come off the card; a software raster has already hidden a
 * shader bug that rendered the hero black on the real one.
 *
 *   node tools/slice-capture.mjs [--url http://localhost:5341] [--out captures/slice]
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = argValue('url', 'http://localhost:5341');
const OUT = path.resolve(argValue('out', 'captures/slice'));
const WIDTH = Number(argValue('width', 1440));
const HEIGHT = Number(argValue('height', 900));

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') console.log(`  [console.error] ${m.text()}`);
});

console.log(`\n${BASE}/prototype.html at ${WIDTH}x${HEIGHT}`);
await page.goto(`${BASE}/prototype.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__slice !== undefined, { timeout: 20000 }).catch(() => {
  console.log('  slice never booted');
});
// Take the clock only for --event: those beats step the simulation by hand and
// the page's own accumulator would advance it too. --touch has to run in real
// time, because what it is testing is an interaction.
if (process.argv.includes('--event')) {
  await page.evaluate(() => {
    window.__manual = true;
  });
}
await page.waitForTimeout(600);

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(`  GPU: ${gpu}`);

const stats = await page.evaluate(() => window.__slice?.structure?.stats ?? null);
if (stats) {
  console.log(
    `  nodes ${stats.nodeCount}  along ${stats.alongEdges}  cross ${stats.crossEdges}  degree ${stats.meanDegree.toFixed(2)}  seeds ${stats.seeds}`
  );
}

/**
 * Coverage and level, read inside rAF — the drawing buffer is cleared at the
 * swap, so reading it from ordinary script returns black and reports a working
 * frame as dead.
 */
const frame = await page.evaluate(
  () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => {
        const canvas = document.getElementById('slice');
        const copy = document.createElement('canvas');
        copy.width = 480;
        copy.height = Math.round((480 * canvas.height) / canvas.width);
        const ctx = copy.getContext('2d');
        ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
        const { data } = ctx.getImageData(0, 0, copy.width, copy.height);

        let lit = 0;
        let sum = 0;
        let peak = 0;
        let blown = 0;
        let wsum = 0;
        let wx = 0;
        let wy = 0;
        for (let i = 0; i < data.length; i += 4) {
          const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
          sum += l;
          if (l > peak) peak = l;
          if (l > 0.9) blown++;
          if (l > 0.03) {
            lit++;
            const p = i / 4;
            wsum += l;
            wx += l * (p % copy.width);
            wy += l * Math.floor(p / copy.width);
          }
        }
        const pixels = data.length / 4;
        resolve({
          litShare: lit / pixels,
          meanLuma: sum / pixels,
          peakLuma: peak,
          blownShare: blown / pixels,
          centroidX: wsum > 0 ? wx / wsum / copy.width : 0.5,
          centroidY: wsum > 0 ? wy / wsum / copy.height : 0.5,
        });
      })
    )
);

console.log(
  `  lit ${(frame.litShare * 100).toFixed(1)}%  mean ${frame.meanLuma.toFixed(4)}  peak ${frame.peakLuma.toFixed(3)}  blown ${(frame.blownShare * 100).toFixed(2)}%  centroid ${frame.centroidX.toFixed(2)},${frame.centroidY.toFixed(2)}`
);

await writeFile(path.join(OUT, 'observe.png'), await page.screenshot({ type: 'png' }));

// --- the event, beat by beat -------------------------------------------
//
// Driven by the simulation's own tick, not by wall-clock sleeps: the point is
// to see the cascade at named moments of ITS timeline.
if (process.argv.includes('--event')) {
  console.log('\nONE FISSION EVENT');
  const beats = [
    ['10-ignition', 6],
    ['11-two', 26],
    ['12-four', 48],
    ['13-eight', 78],
    ['14-arrest', 92],
    ['15-unwinding', 106],
    ['16-unwound', 120],
    ['17-scar', 165],
  ];

  // Hand the clock over: the page stops stepping on its own, or its
  // accumulator and this loop both advance the same simulation.
  await page.evaluate(() => {
    const s = window.__slice;
    window.__ticks = 0;
    s.ignite();
  });

  for (const [name, targetTick] of beats) {
    await page.evaluate(
      (target) =>
        new Promise((resolve) => {
          const s = window.__slice;
          const pump = () => {
            if (window.__ticks >= target) return resolve(null);
            s.fission.step();
            window.__ticks++;
            requestAnimationFrame(pump);
          };
          pump();
        }),
      targetTick
    );
    const state = await page.evaluate(() => {
      const s = window.__slice;
      s.field.setEnergy(s.fission.energy);
      return {
        phase: s.fission.phase,
        active: s.fission.active,
        peak: s.fission.peakFronts,
        adjustments: s.fission.adjustments,
      };
    });
    await writeFile(path.join(OUT, `${name}.png`), await page.screenshot({ type: 'png' }));
    console.log(
      `  ${name.padEnd(14)} ${state.phase.padEnd(10)} paths ${String(state.active).padStart(3)}  peak ${String(state.peak).padStart(3)}  adjustments ${state.adjustments}`
    );
  }
}


// --- the invitation, and taking it -------------------------------------
//
// Run live. The false first action is a claim about eight seconds of real
// time, and the record is a claim about what the system files afterwards;
// neither can be checked by stepping ticks by hand.
if (process.argv.includes('--touch')) {
  console.log('');
  console.log('TOUCH IT');

  const settled = await page
    .waitForFunction(
      () => {
        const s = window.__slice;
        return s.record.physical.length > 0 && s.fission.phase === 'held';
      },
      { timeout: 20000 }
    )
    .then(() => true)
    .catch(() => false);
  console.log(`  false first action fired and settled: ${settled}`);

  await page.waitForTimeout(1500);
  const inviteShown = await page.evaluate(() =>
    window.__slice.invite.classList.contains('is-open')
  );
  console.log(`  invitation offered: ${inviteShown}`);
  await writeFile(path.join(OUT, '20-invited.png'), await page.screenshot({ type: 'png' }));

  // A press on empty void must do nothing. Inventing a nearest node would make
  // the field feel like it was reaching for the cursor.
  const beforeMiss = await page.evaluate(() => window.__slice.record.physical.length);
  // Found rather than assumed: the corner is not necessarily empty.
  const empty = await page.evaluate(() => {
    for (let y = 40; y < window.innerHeight - 40; y += 25) {
      for (let x = 40; x < window.innerWidth - 40; x += 25) {
        if (window.__slice.nodeUnder(x, y) === null) return { x, y };
      }
    }
    return null;
  });
  console.log(`  empty void found at ${empty ? empty.x + ',' + empty.y : 'nowhere'}`);
  if (empty) await page.mouse.click(empty.x, empty.y);
  await page.waitForTimeout(250);
  const afterMiss = await page.evaluate(() => window.__slice.record.physical.length);
  console.log(`  press on empty void ignored: ${beforeMiss === afterMiss}`);

  // A press on the structure, at a node the harness picks by projecting it.
  const target = await page.evaluate(() => {
    const s = window.__slice;
    const p = s.structure.graph.positions;
    const g = s.structure.graph;
    const v = s.camera.position.clone();
    s.camera.updateMatrixWorld();
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < g.nodeCount; i += 5) {
      if (g.offsets[i + 1] - g.offsets[i] < 3) continue;
      v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).project(s.camera);
      if (v.z > 1) continue;
      const d = Math.hypot(v.x + 0.1, v.y - 0.05);
      if (d < bestD) {
        bestD = d;
        best = {
          node: i,
          x: (v.x * 0.5 + 0.5) * window.innerWidth,
          y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        };
      }
    }
    return best;
  });
  console.log(`  pressing at ${Math.round(target.x)},${Math.round(target.y)} (node ${target.node})`);
  const filedBefore = await page.evaluate(() => window.__slice.record.physical.length);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(200);
  const responded = await page.evaluate(() => window.__slice.fission.phase !== 'held');
  // An event is filed when its correction completes, not when it starts, so
  // the entry has to be waited for rather than read straight after the press.
  await page.waitForFunction((n) => window.__slice.record.physical.length > n, filedBefore, { timeout: 12000 }).catch(() => {});
  const hit = await page.evaluate(() => {
    const last = window.__slice.record.physical[window.__slice.record.physical.length - 1];
    return { source: last.source, node: last.node };
  });
  console.log(`  it responded where pressed: ${responded} (node ${hit.node}, ${hit.source})`);
  await writeFile(path.join(OUT, '21-touched.png'), await page.screenshot({ type: 'png' }));

  const gone = await page.evaluate(() => !window.__slice.invite.classList.contains('is-open'));
  console.log(`  invitation withdrawn once taken: ${gone}`);

  await page.waitForTimeout(600);
  await writeFile(path.join(OUT, '22-their-cascade.png'), await page.screenshot({ type: 'png' }));

  await page.waitForFunction(() => window.__slice.fission.phase === 'held', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await writeFile(path.join(OUT, '23-corrected.png'), await page.screenshot({ type: 'png' }));

  const ledger = await page.evaluate(() => {
    const s = window.__slice;
    return {
      physical: s.record.physical,
      recorded: s.record.recorded,
      divergences: s.record.divergences,
      attributed: s.record.attributed,
      adjustments: s.fission.adjustments,
    };
  });
  console.log('');
  console.log('  PHYSICAL                             RECORDED');
  for (let i = 0; i < ledger.physical.length; i++) {
    const a = ledger.physical[i];
    const b = ledger.recorded[i];
    const left = `${a.source.padEnd(7)} node ${String(a.node).padStart(5)} tick ${String(a.tick).padStart(5)}`;
    const right = `${b.source.padEnd(7)} node ${String(b.node).padStart(5)} tick ${String(b.tick).padStart(5)}`;
    const flag = a.source !== b.source ? '   <- attributed' : '';
    console.log(`  ${left}      ${right}${flag}`);
  }
  console.log('');
  console.log(`  divergences ${ledger.divergences} of ${ledger.physical.length}   unperformed ${ledger.attributed}   adjustments applied ${ledger.adjustments}`);
}

// --- persistence, across a real page lifecycle -------------------------
//
// Reloaded rather than simulated: the claim is that the file survives the tab
// being closed, and nothing short of an actual reload tests that.
if (process.argv.includes('--return')) {
  console.log('');
  console.log('PERSISTENCE');

  const STORE = 'darkLattice.record.containment';

  const runVisit = async (label) => {
    await page
      .waitForFunction(() => window.__slice !== undefined, { timeout: 20000 })
      .catch(() => {});
    const arriving = await page.evaluate(() => ({
      visit: window.__slice.visit.index,
      held: window.__slice.heldAgainst(),
      stored: window.__slice.visit.stored,
    }));
    console.log(`  ${label}: arrives as visit ${arriving.visit}, system already holds ${arriving.held}`);
    const arrivedHolding = arriving.held;

    // Let the false first action fire and settle.
    await page
      .waitForFunction(() => window.__slice.record.physical.length > 0 && window.__slice.fission.phase === 'held', { timeout: 20000 })
      .catch(() => console.log(`  ${label}: false first action never settled`));
    await page.waitForTimeout(900);

    // One press of their own, at a node the harness picks by projecting it.
    const target = await page.evaluate(() => {
      const s = window.__slice;
      const p = s.structure.graph.positions;
      const g = s.structure.graph;
      const v = s.camera.position.clone();
      s.camera.updateMatrixWorld();
      let best = null;
      let bestD = Infinity;
      for (let i = 0; i < g.nodeCount; i += 5) {
        if (g.offsets[i + 1] - g.offsets[i] < 3) continue;
        v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).project(s.camera);
        if (v.z > 1) continue;
        const d = Math.hypot(v.x + 0.1, v.y - 0.05);
        if (d < bestD) {
          bestD = d;
          best = { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
        }
      }
      return best;
    });
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(() => window.__slice.fission.phase === 'held', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(700);

    const out = await page.evaluate(() => {
      const s = window.__slice;
      const stored = JSON.parse(window.localStorage.getItem('darkLattice.record.containment') || 'null');
      return {
        visit: s.visit.index,
        held: s.heldAgainst(),
        recorded: s.record.recorded.map((e) => ({ node: e.node, paths: e.paths, divergence: e.divergence })),
        physical: s.record.physical.map((e) => ({ source: e.source, node: e.node, paths: e.paths })),
        storedSeed: stored ? stored.seed : null,
        storedVisits: stored ? stored.visits.length : 0,
        storedEvents: stored ? stored.events.length : 0,
      };
    });
    return { ...out, arrivedHolding };
  };

  // Guarantee a first visit, then return three more times. Four is enough to
  // show the catalogue moving: with four entries, two consecutive visits
  // landing on the same one is an ordinary coincidence, not evidence.
  await page.evaluate((k) => window.localStorage.removeItem(k), STORE);
  const runs = [];
  for (let i = 0; i < 4; i++) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    runs.push(await runVisit(`visit ${i}`));
    if (i === 0) await writeFile(path.join(OUT, '30-first-visit.png'), await page.screenshot({ type: 'png' }));
  }
  const first = runs[0];
  const last = runs[runs.length - 1];
  await writeFile(path.join(OUT, '31-returning.png'), await page.screenshot({ type: 'png' }));

  console.log('');
  console.log(`  seed survived every reload: ${runs.every((r) => r.storedSeed === first.storedSeed)} (${first.storedSeed})`);
  console.log(`  visit index advanced: ${runs.every((r, i) => r.visit === i)}`);
  console.log(`  file holds ${last.storedVisits} visits and ${last.storedEvents} events`);
  console.log('');
  console.log('  VISIT   HELD ON ARRIVAL   HELD AT END   HAPPENED   FILED   DIVERGENCES');
  let expected = 0;
  let carried = true;
  for (const r of runs) {
    if (r.arrivedHolding !== expected) carried = false;
    expected = r.held;
    const lost = r.physical.length - r.recorded.length;
    const note = lost > 0 ? ` (${lost} collapsed away)` : '';
    console.log(
      `  ${String(r.visit).padEnd(7)} ${String(r.arrivedHolding).padEnd(17)} ${String(r.held).padEnd(13)} ${String(r.physical.length).padEnd(10)} ${String(r.recorded.length).padEnd(7)} ${r.recorded.map((e) => e.divergence).join(', ')}${note}`
    );
  }
  console.log('');
  console.log(`  the count is cumulative and never resets: ${carried}`);
}

// --- the way out ------------------------------------------------------
//
// Two scenarios, because the record has to be honest in both: leaving before
// anything happens, and leaving after watching the system act.
if (process.argv.includes('--skip')) {
  console.log('');
  console.log('SKIP PATH');

  const STORE = 'darkLattice.record.containment';

  const fresh = async () => {
    await page.goto(`${BASE}/prototype.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((k) => window.localStorage.removeItem(k), STORE);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__slice !== undefined, { timeout: 20000 });
  };

  // --- present from frame one, and reachable without a mouse ------------
  await fresh();
  const present = await page.evaluate(() => {
    const el = document.getElementById('skip');
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      text: el.textContent.trim(),
      href: el.getAttribute('href'),
      visible: box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.opacity !== '0',
      area: Math.round(box.width * box.height),
    };
  });
  console.log(`  present from frame one: ${present.visible} ("${present.text}" -> ${present.href})`);
  console.log(`  small and quiet: ${present.area} px2 of a ${WIDTH * HEIGHT} px2 frame`);

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  console.log(`  first tab stop: ${focused === 'skip' ? 'the way out' : focused || 'nothing'}`);
  await writeFile(path.join(OUT, '40-skip-offered.png'), await page.screenshot({ type: 'png' }));

  // --- leaving before anything happens ----------------------------------
  const beforeIdle = await page.evaluate(() => window.__slice.record.physical.length);
  // Taken by keyboard, not by mouse: the way out is no use to a reader who
  // cannot reach it. The anchor is already focused from the tab above.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const url = page.url();
  console.log('');
  console.log(`  taken with the keyboard, before the system acted (${beforeIdle} events had happened)`);
  console.log(`  went straight to: ${url.replace(BASE, '')}`);

  // Well past the eight seconds the system would have waited.
  await page.waitForTimeout(9000);
  const afterLeaving = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) || 'null'), STORE);
  const v0 = afterLeaving.visits[afterLeaving.visits.length - 1];
  console.log(`  system did NOT fabricate an event after the visitor left: ${v0.events === 0 && v0.adjustments === 0}`);
  console.log('  the record states:');
  console.log(`      ${v0.statement[0]}`);
  console.log(`      ${v0.statement[1]}`);

  // --- leaving after watching it act ------------------------------------
  await fresh();
  await page
    .waitForFunction(() => window.__slice.record.physical.length > 0 && window.__slice.fission.phase === 'held', { timeout: 20000 })
    .catch(() => console.log('  false first action never settled'));
  await page.waitForTimeout(800);
  await page.click('#skip');
  await page.waitForTimeout(600);
  const afterWatching = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) || 'null'), STORE);
  const v1 = afterWatching.visits[afterWatching.visits.length - 1];
  console.log('');
  console.log('  left after watching one correction. the record states:');
  console.log(`      ${v1.statement[0]}`);
  console.log(`      ${v1.statement[1]}`);
  console.log(`  recorded as skipped: ${v1.skipped}   adjustments kept: ${v1.adjustments}`);
}

// --- the floor --------------------------------------------------------
//
// Reached the only way it can be: by producing the phenomenon yourself. The
// numbers on it are checked against the simulation rather than read back, so a
// panel that prints a plausible figure the system never produced fails here.
if (process.argv.includes('--record')) {
  console.log('');
  console.log('YOUR RECORD');

  const STORE = 'darkLattice.record.containment';
  await page.goto(`${BASE}/prototype.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => window.localStorage.removeItem(k), STORE);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__slice !== undefined, { timeout: 20000 });

  const openEarly = await page.evaluate(() => !document.getElementById('record').hidden);
  console.log(`  floor open before anything happened: ${openEarly}`);

  // Let the system act, then act twice ourselves.
  await page
    .waitForFunction(() => window.__slice.record.physical.length > 0 && window.__slice.fission.phase === 'held', { timeout: 20000 })
    .catch(() => console.log('  false first action never settled'));
  await page.waitForTimeout(600);

  const openAfterSystem = await page.evaluate(() => !document.getElementById('record').hidden);
  console.log(`  floor open after the system acted alone: ${openAfterSystem}`);

  const press = async () => {
    const target = await page.evaluate(() => {
      const s = window.__slice;
      const p = s.structure.graph.positions;
      const g = s.structure.graph;
      const v = s.camera.position.clone();
      s.camera.updateMatrixWorld();
      let best = null;
      let bestD = Infinity;
      for (let i = 0; i < g.nodeCount; i += 5) {
        if (g.offsets[i + 1] - g.offsets[i] < 3) continue;
        v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).project(s.camera);
        if (v.z > 1) continue;
        const d = Math.hypot(v.x + 0.1, v.y - 0.05);
        if (d < bestD) {
          bestD = d;
          best = { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
        }
      }
      return best;
    });
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(() => window.__slice.fission.phase === 'held', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(700);
  };

  await press();
  await press();
  const openBeforeDescent = await page.evaluate(() => !document.getElementById('record').hidden);
  console.log(`  floor open after two presses but no descent: ${openBeforeDescent}`);

  // What the simulation says, before the panel is asked anything.
  const truth = await page.evaluate(() => {
    const s = window.__slice;
    return {
      adjustments: s.heldAgainst(),
      residual: s.fission.residual,
      unseen: s.fission.unseen,
      scars: s.fission.scars,
      physical: s.record.physical.length,
      recorded: s.record.recorded.length,
    };
  });

  // Does the drift wash the field out? Measured, because it never decays and
  // its coverage only grows.
  const fieldNow = await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const c = document.getElementById('slice');
          const copy = document.createElement('canvas');
          copy.width = 480;
          copy.height = Math.round((480 * c.height) / c.width);
          const ctx = copy.getContext('2d');
          ctx.drawImage(c, 0, 0, copy.width, copy.height);
          const { data } = ctx.getImageData(0, 0, copy.width, copy.height);
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
          }
          resolve(sum / (data.length / 4));
        })
      )
  );
  console.log(`  field at rest ${frame.meanLuma.toFixed(4)} -> after ${truth.physical} events ${fieldNow.toFixed(4)} (${((fieldNow / frame.meanLuma - 1) * 100).toFixed(0)}% lift)`);

  // Reached by riding the rail to the bottom. The button is the
  // reduced-motion route and is not in the tab order on this path.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => !document.getElementById('record').hidden, { timeout: 12000 });
  await page.waitForTimeout(400);
  console.log('  floor reached by descending: true');
  await writeFile(path.join(OUT, '50-floor.png'), await page.screenshot({ type: 'png' }));

  const printed = await page.evaluate(() => {
    const dd = Array.from(document.querySelectorAll('.record__figures dd')).map((n) => n.textContent);
    const rows = Array.from(document.querySelectorAll('.record__table tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent)
    );
    return {
      title: document.querySelector('.record__title')?.textContent,
      adjustments: dd[0],
      residual: dd[1],
      statement: document.querySelector('.record__lines')?.textContent,
      rows,
      focused: document.activeElement?.className,
      visits: document.querySelector('.record__visits')?.textContent,
    };
  });

  console.log('');
  console.log(`  heading: ${printed.title}`);
  console.log(`  ADJUSTMENTS APPLIED  printed ${printed.adjustments}  simulation says ${truth.adjustments}  ${String(truth.adjustments) === printed.adjustments ? 'OK' : 'MISMATCH'}`);
  console.log(`  RESIDUAL DEVIATION   printed ${printed.residual}  simulation says ${truth.residual}  ${String(truth.residual) === printed.residual ? 'OK' : 'MISMATCH'}`);
  console.log(`  focus moved to: ${printed.focused}`);
  console.log(`  ${printed.visits}`);
  console.log('');
  console.log('  THE STATEMENT');
  for (const line of (printed.statement || '').split(String.fromCharCode(10))) console.log(`      ${line}`);
  console.log('');
  console.log('  THE DIFF');
  for (const r of printed.rows) console.log(`      ${r[0]}  |  ${r[1]}  |  ${r[2]}`);
  console.log('');
  console.log(`  the sensor reports ${truth.residual} deviation, and ${truth.unseen} trajectories are still off their approved state`);
  console.log(`  ${truth.scars} origin${truth.scars === 1 ? '' : 's'} permanently marked`);

  // Scroll to the diff for the second frame.
  await page.evaluate(() => document.querySelector('.record__diff')?.scrollIntoView());
  await page.waitForTimeout(300);
  await writeFile(path.join(OUT, '51-the-diff.png'), await page.screenshot({ type: 'png' }));
}

// --- the descent ------------------------------------------------------
//
// One frame per pose, driven by scroll rather than by setting the camera:
// what is being tested is the rail the visitor actually rides.
if (process.argv.includes('--descent')) {
  console.log('');
  console.log('THE DESCENT');

  const STORE = 'darkLattice.record.containment';
  await page.goto(`${BASE}/prototype.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => window.localStorage.removeItem(k), STORE);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__slice !== undefined, { timeout: 20000 });

  const poses = await page.evaluate(() => window.__slice.poses.map((p) => p.name));
  console.log(`  ${poses.length} poses: ${poses.join(' -> ')}`);

  // Let the system act once so the floor has something to refer to.
  await page
    .waitForFunction(() => window.__slice.record.physical.length > 0 && window.__slice.fission.phase === 'held', { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(600);

  const travel = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  );
  console.log(`  rail length: ${travel}px of scroll`);

  for (let i = 0; i < poses.length; i++) {
    const t = i / (poses.length - 1);
    // Stop a shade short of the very bottom on the last pose, or the floor
    // opens over the frame we are trying to look at.
    const target = Math.round(travel * Math.min(t, 0.985));
    await page.evaluate((y) => window.scrollTo(0, y), target);
    // Let the easing settle rather than guessing at a timeout.
    await page
      .waitForFunction(
        (want) => Math.abs(window.__slice.progressNow() - want) < 0.004,
        Math.min(t, 0.985),
        { timeout: 6000 }
      )
      .catch(() => console.log(`    (${poses[i]} never settled)`));

    const state = await page.evaluate(() => {
      const s = window.__slice;
      const p = s.camera.position;
      return {
        pose: document.getElementById('pose').textContent,
        distance: Math.hypot(p.x, p.y, p.z),
        // How far the camera is from the seat the planet will occupy.
        toSeat: Math.hypot(p.x - 0.42, p.y + 0.31, p.z - 0.55),
      };
    });
    await writeFile(path.join(OUT, `6${i}-${poses[i].toLowerCase()}.png`), await page.screenshot({ type: 'png' }));
    console.log(
      `  ${String(i)} ${state.pose.padEnd(11)} radius ${state.distance.toFixed(2)}   to the seat ${state.toSeat.toFixed(2)}`
    );
  }

  // Does the machine still work while descending? Press at CROSS depth.
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(travel * 0.4));
  await page.waitForTimeout(1200);
  const deep = await page.evaluate(() => {
    const s = window.__slice;
    const p = s.structure.graph.positions;
    const g = s.structure.graph;
    const v = s.camera.position.clone();
    s.camera.updateMatrixWorld();
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < g.nodeCount; i += 3) {
      if (g.offsets[i + 1] - g.offsets[i] < 3) continue;
      v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).project(s.camera);
      if (v.z > 1) continue;
      const d = Math.hypot(v.x, v.y);
      if (d < bestD) {
        bestD = d;
        best = { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
      }
    }
    return best;
  });
  const beforeDeep = await page.evaluate(() => window.__slice.record.physical.length);
  await page.mouse.click(deep.x, deep.y);
  await page.waitForTimeout(500);
  const during = await page.evaluate(() => ({
    phase: window.__slice.fission.phase,
    events: window.__slice.record.physical.length,
  }));
  console.log('');
  console.log(`  pressing mid-descent still disturbs the field: ${during.phase !== 'held' || during.events > beforeDeep}`);
  await writeFile(path.join(OUT, '67-touched-at-depth.png'), await page.screenshot({ type: 'png' }));

  // Frame cost with the camera in motion.
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          window.scrollBy(0, 6);
          return ++n < 150 ? requestAnimationFrame(tick) : resolve((n * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(tick);
      })
  );
  console.log(`  ${fps.toFixed(0)} fps while scrolling the rail at ${WIDTH}x${HEIGHT}`);

  // The bottom of the rail is the floor, not a button.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1400);
  const floorOpen = await page.evaluate(() => !document.getElementById('record').hidden);
  console.log('');
  console.log(`  the bottom of the rail opens the floor: ${floorOpen}`);
  await writeFile(path.join(OUT, '66-floor.png'), await page.screenshot({ type: 'png' }));
}

console.log('');
console.log(`written to ${OUT}`);
await browser.close();
