/**
 * determinism-check.mjs — the same visit twice, compared.
 *
 * The site claims its authoritative state is reproducible from the same seed
 * and a bounded input trace. That claim is either measured or it is marketing,
 * and it cannot be measured by reading the code: the simulation is fixed-step
 * in a Worker, the record is written on pagehide, and the failure mode that
 * matters — a frame-rate-dependent step, an unseeded shuffle — only appears
 * when two runs are actually compared.
 *
 * Two fresh browser contexts, no shared storage, the same scripted presses at
 * the same simulated ticks, then the stored records are diffed.
 *
 *   node tools/determinism-check.mjs
 *   node tools/determinism-check.mjs --presses 6
 */

import { chromium } from 'playwright';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = argValue('url', 'http://localhost:5173');
const PRESSES = Number(argValue('presses', 5));

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

/**
 * One visit, driven identically every time.
 *
 * Presses go through the dev handle at fixed coordinates rather than through
 * synthesised pointer events, because a real gesture carries wall-clock
 * timing into the trace and would make every run differ for reasons that have
 * nothing to do with the simulation.
 */
async function visit(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      () => {
        const loader = document.getElementById('loader');
        return !loader || loader.hidden || loader.classList.contains('is-done');
      },
      { timeout: 30000 }
    )
    .catch(() => {});
  await page.waitForTimeout(2500);

  const trace = [];
  for (let i = 0; i < PRESSES; i++) {
    // Aimed at a real piece rather than at fixed screen coordinates.
    //
    // The first version of this pressed hardcoded points and every press
    // returned -1: the camera had moved since those numbers were written, so
    // the ray missed the body entirely. All four checks still reported MATCH,
    // because two runs that both do nothing agree perfectly. A determinism
    // proof that passes when the mechanism never fires is worse than none.
    //
    // The i-th largest on-screen piece is itself deterministic for a given
    // pose, so the choice does not weaken the claim.
    const target = await page.evaluate((rank) => {
      const probe = window.__correction?.probe?.();
      if (!probe) return null;
      const onScreen = probe.pieces
        .map((p, index) => ({ ...p, index }))
        .filter((p) => p.x > 60 && p.x < innerWidth - 60 && p.y > 60 && p.y < innerHeight - 60)
        .sort((a, b) => b.r - a.r);
      const pick = onScreen[rank % Math.max(onScreen.length, 1)];
      return pick ? { x: Math.round(pick.x), y: Math.round(pick.y) } : null;
    }, i);

    const node = target
      ? await page.evaluate(([px, py]) => window.__correction?.press(px, py) ?? -1, [target.x, target.y])
      : -1;
    trace.push(node);
    await page.waitForTimeout(900);
  }

  // Let every correction finish, so the record is the settled one.
  await page.waitForTimeout(6000);

  const state = await page.evaluate(() => {
    const probe = window.__correction?.probe?.();
    return {
      adjustments: probe?.adjustments ?? -1,
      // Rounded: these are floats off the GPU-adjacent path and the claim is
      // about the simulation reproducing, not about the last bit of a float.
      seats: probe ? probe.pieces.map((p) => Number(p.u.toFixed(6))) : [],
    };
  });

  // The record is committed on pagehide, which is what makes the history
  // reliable — so it has to be read after the page is actually leaving.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(250);
  const stored = await page.evaluate(() => window.localStorage.getItem('darkLattice.record'));

  await context.close();
  console.log(`  ${label.padEnd(8)} struck ${JSON.stringify(trace)}  adjustments ${state.adjustments}`);
  return { trace, state, stored };
}

console.log(`\nTWO IDENTICAL VISITS, ${PRESSES} SCRIPTED PRESSES EACH`);
const a = await visit('run A');
const b = await visit('run B');

const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const checks = [
  ['input trace', same(a.trace, b.trace)],
  ['adjustments', a.state.adjustments === b.state.adjustments],
  ['every piece seated identically', same(a.state.seats, b.state.seats)],
  ['stored record', a.stored === b.stored],
];

console.log('');
for (const [what, ok] of checks) console.log(`  ${ok ? 'MATCH   ' : 'DIVERGED'} ${what}`);
if (!same(a.stored, b.stored)) {
  console.log(`\n  A: ${a.stored}\n  B: ${b.stored}`);
}
console.log(`\n  ${checks.every(([, ok]) => ok) ? 'DETERMINISTIC' : 'NOT DETERMINISTIC'}\n`);

await browser.close();
