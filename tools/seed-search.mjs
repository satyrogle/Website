/**
 * WHICH WORLDS ACTUALLY AMPLIFY?
 *
 *   node tools/seed-search.mjs [count] [startSeed]
 *
 * The kernel's own comment calls thresholds the amplifier: "a section
 * sitting just under its threshold is where a change of one part in a
 * thousand becomes a section moving ... the only reason a consequence
 * can travel a long way from a small cause."
 *
 * On the site's seed it never fires. Nothing flips, the consequence
 * covers 7 of 48 sections, and the gap halves every section away from
 * the peak. That reads as a broken rule, and it is not one: the same
 * rule on a different seed does fire. The material is drawn from the
 * seed, so WHICH sections sit just under their thresholds - the whole
 * amplifier - is a property of the world, not of the physics.
 *
 * So this sweeps seeds through the real kernel. No parameters are
 * changed and no rule is re-implemented; every world here is one the
 * shipped code produces today. Ranking is on what THE_DELTA section 6
 * actually asks for, in order:
 *
 *   FLIPS   sections that yield in one future and never in the other.
 *           The strong form: the two worlds contain a different set of
 *           events, not the same events at different times.
 *   SPAN    how many sections the consequence visibly covers.
 *   DECAY   how slowly it dies as it travels.
 *
 * This diagnoses. It does not choose - the seed is Jacob's call, made
 * by looking at the worlds it nominates on his own GPU.
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const dir = mkdtempSync(join(tmpdir(), 'dl-seed-'));
for (const f of ['rng', 'Delta', 'causality']) {
  const src = readFileSync(join(root, 'src', 'core', `${f}.ts`), 'utf8');
  writeFileSync(
    join(dir, `${f}.ts`),
    src.replace(/from '\.\/rng'/g, "from './rng.ts'").replace(/from '\.\/Delta'/g, "from './Delta.ts'")
  );
}
const D = await import(pathToFileURL(join(dir, 'Delta.ts')).href);
const C = await import(pathToFileURL(join(dir, 'causality.ts')).href);

const SITE_SEED = 20260818;
const count = Number(process.argv[2] ?? 2000);
const start = Number(process.argv[3] ?? SITE_SEED);

/** One world, scored on both detents; the weaker detent is the score. */
function score(seed) {
  const fam = D.computeFamilies(seed);
  let flips = Infinity;
  let span = Infinity;
  let decay = Infinity;
  let shifted = Infinity;
  let amp = Infinity;
  for (const d of [-1, 1]) {
    const c = C.readCausality(fam.baseline, fam.altered.get(d), fam.delta.get(d));
    // BOTH detents have to work. A seed that is dramatic one way and
    // dead the other gives half the visitors nothing, and the choice
    // is meant to be real in both directions.
    flips = Math.min(flips, c.flippedOn.length + c.flippedOff.length);
    span = Math.min(span, c.visibleSpan);
    decay = Math.min(decay, c.decayMean);
    shifted = Math.min(shifted, c.shifted.length);
    amp = Math.min(amp, c.amplification);
  }
  return { seed, flips, span, decay, shifted, amp };
}

console.log(`sweeping ${count} seeds from ${start} through the shipped kernel ...\n`);
const t0 = Date.now();
const rows = [];
for (let i = 0; i < count; i++) rows.push(score(start + i));
const ms = Date.now() - t0;

const rank = (a, b) => b.flips - a.flips || b.span - a.span || b.decay - a.decay;
const sorted = [...rows].sort(rank);
const site = rows.find((r) => r.seed === SITE_SEED) ?? score(SITE_SEED);
const better = sorted.filter((r) => rank(r, site) < 0).length;

const line = (r, mark = ' ') =>
  `  ${mark} ${String(r.seed).padEnd(9)} flips ${String(r.flips).padStart(2)}   ` +
  `span ${String(r.span).padStart(2)}/${D.SECTIONS}   falloff ${r.decay.toFixed(3)}x   ` +
  `shifted ${String(r.shifted).padStart(2)}   amp ${r.amp.toFixed(1)}x`;

console.log('BEST WORLDS  ·  both detents must work, so each is scored on its weaker one\n');
for (const r of sorted.slice(0, 12)) console.log(line(r, r.seed === SITE_SEED ? '>' : ' '));

console.log(`\nTHE SITE'S SEED\n`);
console.log(line(site, '>'));
console.log(
  `\n  ${better} of ${rows.length} swept seeds rank above it ` +
    `(${((better / rows.length) * 100).toFixed(1)}%).`
);

const withFlips = rows.filter((r) => r.flips > 0).length;
console.log(
  `  ${withFlips} of ${rows.length} seeds flip at least one section on BOTH detents ` +
    `(${((withFlips / rows.length) * 100).toFixed(1)}%).`
);
const spans = rows.map((r) => r.span).sort((a, b) => a - b);
console.log(
  `  span across the sweep: min ${spans[0]}, median ${spans[spans.length >> 1]}, max ${spans[spans.length - 1]}` +
    ` · the site's is ${site.span}.`
);

const out = join(root, 'captures');
if (!existsSync(out)) mkdirSync(out, { recursive: true });
const dest = join(out, 'seed-search.json');
writeFileSync(dest, JSON.stringify({ start, count, site, ranked: sorted.slice(0, 200) }, null, 2));
console.log(`\nswept in ${(ms / 1000).toFixed(1)}s · top 200 written to ${dest}`);
console.log('Nothing is changed by this. The seed is a look decision and belongs to Jacob.');
