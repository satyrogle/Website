/**
 * WHICH WORLD SHOULD THE SITE RUN?
 *
 *   node tools/seed-search.mjs [count] [startSeed]
 *
 * The kernel's thresholds are described as the amplifier: "a section
 * sitting just under its threshold is where a change of one part in a
 * thousand becomes a section moving ... the only reason a consequence
 * can travel a long way from a small cause." On seed 20260818 it never
 * fires. That is not a broken rule - the material is drawn from the
 * seed, so WHICH sections sit just under their thresholds is a property
 * of the world. Some worlds amplify. This finds them.
 *
 * Nothing is re-implemented and no constant is changed: every world
 * here is one the shipped kernel produces today.
 *
 * WHAT "BEST" MEANS, because a single number would hide the choice.
 * Five things, from THE_DELTA sections 6 and 7, each scored on the
 * WEAKER of the two detents - a world that is dramatic one way and
 * dead the other gives half the visitors nothing:
 *
 *   FLIPS     sections that yield in one future and never in the
 *             other. The strong form of consequence: the two worlds
 *             contain a different set of EVENTS, not the same events
 *             at different times.
 *   SPAN      how many sections the consequence visibly covers. Z is
 *             a place; a place has extent.
 *   TRAVEL    how slowly the gap dies per section away from the peak.
 *   VARIETY   the ratio of the widest visible gap to the narrowest.
 *             Section 7: equal gaps are a corridor of constant width,
 *             which is exactly what the frame test exists to fail.
 *   CONTRAST  how different the two detents' fields are from each
 *             other. If -1 and +1 produce the same room, the choice
 *             the whole piece is built on is decorative.
 *
 * Weights are stated in SCORE below and every component is printed, so
 * a disagreement about the weighting is a disagreement you can act on
 * rather than one buried in a sort.
 *
 * ELIGIBILITY comes first. A seed that fails the gates the site
 * already ships cannot be a candidate however dramatic it looks, so
 * the top few are re-run through the REAL tools/delta-verify.mjs - a
 * temp copy with its seed line rewritten, the same trick that file
 * uses to import the TypeScript kernel. No assertion is duplicated
 * here; the shipped suite is the judge.
 *
 * This nominates. It does not choose: the seed is a look decision and
 * belongs to Jacob, judged on his own GPU.
 */

import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SITE_SEED = 20260818;

/** Copy the kernel where Node can import it with explicit extensions. */
function stageKernel() {
  const dir = mkdtempSync(join(tmpdir(), 'dl-seed-'));
  for (const f of ['rng', 'Delta', 'causality']) {
    const src = readFileSync(join(root, 'src', 'core', `${f}.ts`), 'utf8');
    writeFileSync(
      join(dir, `${f}.ts`),
      src
        .replace(/from '\.\/rng'/g, "from './rng.ts'")
        .replace(/from '\.\/Delta'/g, "from './Delta.ts'")
    );
  }
  return dir;
}

async function loadKernel(dir) {
  const D = await import(pathToFileURL(join(dir, 'Delta.ts')).href);
  const C = await import(pathToFileURL(join(dir, 'causality.ts')).href);
  return { D, C };
}

// ------------------------------------------------------------- scoring

const WEIGHT = { flips: 0.3, span: 0.25, travel: 0.15, variety: 0.15, contrast: 0.15 };
/** Ceilings past which more stops earning credit. */
const CAP = { flips: 3, span: 24, variety: 2 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Baseline and the two real interventions, without the neutral one.
 * computeFamilies also computes detent 0, which is the baseline by
 * construction - delta-verify asserts exactly that - so at a million
 * seeds it is a quarter of the work thrown away. Same public API, same
 * numbers; nothing about the kernel is bypassed.
 */
function families(D, seed) {
  const baseline = D.computeSequence(seed, null);
  const altered = new Map();
  const delta = new Map();
  for (const d of [-1, 1]) {
    const seq = D.computeSequence(seed, d);
    altered.set(d, seq);
    delta.set(d, D.computeDelta(baseline, seq));
  }
  return { baseline, altered, delta };
}

function measure(D, C, seed) {
  const fam = families(D, seed);
  const per = {};
  for (const d of [-1, 1]) {
    const c = C.readCausality(fam.baseline, fam.altered.get(d), fam.delta.get(d));
    const gaps = fam.delta.get(d).frames[D.TICKS - 1].gap;
    const widest = Math.max(...gaps);
    const vis = c.visible.map((i) => gaps[i]).filter((g) => g > 0);
    const narrowest = vis.length ? Math.min(...vis) : 0;
    per[d] = {
      flips: c.flippedOn.length + c.flippedOff.length,
      span: c.visibleSpan,
      travel: clamp01(c.decayMean),
      visible: c.visible.length,
      // the gate tools/delta-verify.mjs already enforces on the site seed
      ratio: narrowest > 0 ? widest / narrowest : 0,
      derived: c.shifted.length + c.flippedOn.length + c.flippedOff.length,
      lateGrowth:
        fam.delta.get(d).frames[D.TICKS - 1].diverged -
        fam.delta.get(d).frames[fam.delta.get(d).onsetTick].diverged
    };
  }

  // does the choice matter? Compare the two fields to each other.
  const gp = fam.delta.get(1).frames[D.TICKS - 1].gap;
  const gn = fam.delta.get(-1).frames[D.TICKS - 1].gap;
  const scale = Math.max(Math.max(...gp), Math.max(...gn));
  let contrast = 0;
  if (scale > 0) {
    for (let i = 0; i < D.SECTIONS; i++) {
      contrast = Math.max(contrast, Math.abs(gp[i] - gn[i]) / scale);
    }
  }

  const w = (k) => Math.min(per[-1][k], per[1][k]);
  const variety = Math.log10(Math.max(w('ratio'), 1));

  // the seed-dependent half of the shipped gates. Structural gates
  // (identical before the hinge, onset at the hinge) hold by
  // construction for every seed and are not re-tested here.
  const eligible =
    w('visible') >= 6 && w('ratio') > 3 && w('lateGrowth') > 0 && w('derived') > 0;

  const parts = {
    flips: Math.min(w('flips'), CAP.flips) / CAP.flips,
    span: Math.min(w('span'), CAP.span) / CAP.span,
    travel: w('travel'),
    variety: Math.min(variety, CAP.variety) / CAP.variety,
    contrast: clamp01(contrast)
  };
  let score = 0;
  for (const k of Object.keys(WEIGHT)) score += WEIGHT[k] * parts[k];

  return {
    seed,
    score,
    eligible,
    flips: w('flips'),
    span: w('span'),
    travel: w('travel'),
    variety,
    contrast,
    visible: w('visible'),
    ratio: w('ratio')
  };
}

// ------------------------------------------------------------- worker

/** How many rows each lane keeps. Merged, this is the pool main ranks. */
const KEEP = 400;

if (!isMainThread) {
  const { dir, from, to, keep, siteScore } = workerData;
  const { D, C } = await loadKernel(dir);

  // A MILLION ROWS DO NOT COME BACK ACROSS THE THREAD BOUNDARY. Each
  // lane keeps its own best and reports counters for everything else;
  // returning every row serialised hundreds of megabytes to say almost
  // nothing. The top-K is kept as an unsorted array and only trimmed
  // when it grows, which is cheaper than a heap at this K.
  let best = [];
  let worstKept = -Infinity;
  const tally = { total: 0, eligible: 0, aboveSite: 0, flips: {}, maxSpan: 0, maxFlips: 0 };
  // per-dimension leaders are tracked over every eligible row, not over
  // the kept pool: the pool is ranked by the composite, so reading
  // "best span" out of it would only ever find the best span AMONG
  // seeds that already scored well overall.
  const leaders = {};
  const lead = (k, r) => {
    if (!leaders[k] || r[k] > leaders[k][k]) leaders[k] = r;
  };

  for (let s = from; s < to; s++) {
    const r = measure(D, C, s);
    tally.total++;
    if (r.flips > tally.maxFlips) tally.maxFlips = r.flips;
    if (!r.eligible) continue;
    tally.eligible++;
    if (r.score > siteScore) tally.aboveSite++;
    if (r.span > tally.maxSpan) tally.maxSpan = r.span;
    const key = r.flips >= 4 ? '4+' : String(r.flips);
    tally.flips[key] = (tally.flips[key] ?? 0) + 1;
    for (const k of ['flips', 'span', 'travel', 'variety', 'contrast']) lead(k, r);

    if (best.length < keep || r.score > worstKept) {
      best.push(r);
      if (best.length > keep * 2) {
        best.sort((a, b) => b.score - a.score);
        best.length = keep;
        worstKept = best[best.length - 1].score;
      }
    }

    if (tally.total % 25000 === 0) {
      parentPort.postMessage({ progress: tally.total, from });
    }
  }
  best.sort((a, b) => b.score - a.score);
  parentPort.postMessage({ best: best.slice(0, keep), tally, leaders });
}

// ------------------------------------------------------------- main

function verifySeeds(seeds, dir) {
  const verifySrc = readFileSync(join(root, 'tools', 'delta-verify.mjs'), 'utf8');
  if (!/^const SEED = \d+;$/m.test(verifySrc) || !/^const root = join\(here, '\.\.'\);$/m.test(verifySrc)) {
    console.log('  delta-verify.mjs no longer has the two lines this rewrites; skipping.');
    return;
  }
  for (const seed of seeds) {
    const copy = join(dir, `verify-${seed}.mjs`);
    writeFileSync(
      copy,
      verifySrc
        .replace(/^const SEED = \d+;$/m, `const SEED = ${seed};`)
        .replace(/^const root = join\(here, '\.\.'\);$/m, `const root = ${JSON.stringify(root)};`)
    );
    let ok = true;
    let tail = '';
    try {
      tail = execFileSync(process.execPath, [copy], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
        .trim()
        .split('\n')
        .pop();
    } catch (e) {
      ok = false;
      const outText = String(e.stdout ?? '');
      tail =
        outText.split('\n').filter((l) => l.startsWith('FAIL')).join(' · ') ||
        'the suite could not run';
    }
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  seed ${seed}  ${tail}`);
  }
}

if (isMainThread && process.argv[2] === '--verify') {
  // check named candidates against the shipped suite, no sweep
  const seeds = String(process.argv[3] ?? '').split(',').map(Number).filter(Number.isFinite);
  if (seeds.length === 0) {
    console.log('usage: node tools/seed-search.mjs --verify 20302847,20285930');
    process.exit(1);
  }
  console.log('RUNNING THE REAL tools/delta-verify.mjs ON EACH SEED\n');
  verifySeeds(seeds, stageKernel());
  console.log('');
} else if (isMainThread) {
  const count = Number(process.argv[2] ?? 50000);
  const start = Number(process.argv[3] ?? SITE_SEED);
  const dir = stageKernel();
  const lanes = Math.max(1, Math.min(cpus().length, 8));
  const per = Math.ceil(count / lanes);

  console.log(
    `sweeping ${count.toLocaleString()} seeds from ${start} through the shipped kernel ` +
      `on ${lanes} threads ...\n`
  );
  const t0 = Date.now();

  // the site's own score is needed before the lanes start, so each can
  // count how many of its worlds beat it without shipping rows back
  const { D: mainD, C: mainC } = await loadKernel(dir);
  const site = measure(mainD, mainC, SITE_SEED);

  let done = 0;
  const chunks = await Promise.all(
    Array.from({ length: lanes }, (_, k) => {
      const from = start + k * per;
      const to = Math.min(start + count, from + per);
      return new Promise((res, rej) => {
        if (from >= to) return res({ best: [], tally: null, leaders: {} });
        const w = new Worker(fileURLToPath(import.meta.url), {
          workerData: { dir, from, to, keep: KEEP, siteScore: site.score }
        });
        w.on('message', (m) => {
          if (m.progress !== undefined) {
            done += 25000;
            process.stdout.write(`\r  ${done.toLocaleString()} seeds swept ...`);
            return;
          }
          res(m);
        });
        w.on('error', rej);
      });
    })
  );
  const ms = Date.now() - t0;
  process.stdout.write('\r');

  const ranked = chunks
    .flatMap((c) => c.best)
    .sort((a, b) => b.score - a.score);

  const tally = { total: 0, eligible: 0, aboveSite: 0, flips: {}, maxSpan: 0, maxFlips: 0 };
  const leaders = {};
  for (const c of chunks) {
    if (!c.tally) continue;
    tally.total += c.tally.total;
    tally.eligible += c.tally.eligible;
    tally.aboveSite += c.tally.aboveSite;
    tally.maxSpan = Math.max(tally.maxSpan, c.tally.maxSpan);
    tally.maxFlips = Math.max(tally.maxFlips, c.tally.maxFlips);
    for (const [k, v] of Object.entries(c.tally.flips)) tally.flips[k] = (tally.flips[k] ?? 0) + v;
    for (const [k, r] of Object.entries(c.leaders ?? {})) {
      if (!leaders[k] || r[k] > leaders[k][k]) leaders[k] = r;
    }
  }
  const eligible = ranked;

  const line = (r, mark = ' ') =>
    `  ${mark} ${String(r.seed).padEnd(9)} ${r.score.toFixed(3)}   ` +
    `flips ${String(r.flips).padStart(2)}   span ${String(r.span).padStart(2)}   ` +
    `travel ${r.travel.toFixed(2)}   variety ${r.variety.toFixed(2)}   ` +
    `contrast ${r.contrast.toFixed(2)}`;

  console.log(
    `eligible (passes the seed-dependent shipped gates): ` +
      `${tally.eligible.toLocaleString()} of ${tally.total.toLocaleString()}\n`
  );
  console.log('             score   flips  span  travel  variety  contrast');
  for (const r of ranked.slice(0, 15)) console.log(line(r));

  console.log('\nTHE SITE\'S SEED');
  console.log(line(site, '>'));
  console.log(
    `\n  ${tally.aboveSite.toLocaleString()} eligible seeds score above it` +
      `${site.eligible ? '' : '   (the site seed itself is INELIGIBLE on these gates)'}.`
  );
  console.log(`  most flips found anywhere: ${tally.maxFlips} · widest span: ${tally.maxSpan}`);
  const fl = Object.keys(tally.flips).sort();
  console.log(`  eligible seeds by flip count: ${fl.map((k) => `${k}=${tally.flips[k].toLocaleString()}`).join('  ')}`);

  // leaderboards per dimension, because the weighting is arguable
  const top = (key, label) => {
    const b = leaders[key];
    if (b) console.log(`  best ${label.padEnd(9)} seed ${b.seed}  (${key} ${b[key].toFixed(2)}, score ${b.score.toFixed(3)})`);
  };
  console.log('\nBEST ON EACH DIMENSION ALONE');
  top('flips', 'flips');
  top('span', 'span');
  top('travel', 'travel');
  top('variety', 'variety');
  top('contrast', 'contrast');

  const out = join(root, 'captures');
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'seed-search.json'),
    JSON.stringify({ start, count, weights: WEIGHT, site, ranked: ranked.slice(0, 500) }, null, 2)
  );
  console.log(
    `\nswept in ${(ms / 1000).toFixed(1)}s · top 500 written to captures/seed-search.json`
  );

  // ---- the shipped suite is the judge ----

  console.log('\nRUNNING THE REAL tools/delta-verify.mjs ON THE TOP CANDIDATES\n');
  verifySeeds(ranked.slice(0, 5).map((r) => r.seed), dir);

  console.log('\nNothing is changed by this. The seed is a look decision and belongs to Jacob.');
}
