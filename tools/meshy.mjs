/**
 * Meshy batch generator.
 *
 * Submits every prompt in a set, polls them concurrently, and downloads
 * the results into public/models/ ready for tools/compare.mjs.
 *
 * The point is to stop generating one candidate at a time. A single
 * candidate always looks plausible in isolation — that is how this
 * entity went six rounds — and the only reliable filter found so far is
 * a silhouette column with several candidates side by side.
 *
 *   node tools/meshy.mjs validate
 *   node tools/meshy.mjs divine          # generate the divine-shell set
 *
 * Reads MESHY_API_KEY from .env.local. The key is never printed, and
 * never appears in an error message.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://api.meshy.ai/openapi';

function loadKey() {
  if (!existsSync('.env.local')) {
    throw new Error('.env.local not found — see the PowerShell command in chat.');
  }
  const raw = readFileSync('.env.local', 'utf8');
  const key = (raw.match(/MESHY_API_KEY=(.*)/) || [])[1]?.trim() ?? '';
  if (!key) throw new Error('MESHY_API_KEY missing from .env.local');

  // Validate the SHAPE before spending anything. The first key written
  // carried a stray backslash at position 40 and every generation call
  // would have failed 401 after the tasks were already queued.
  const problems = [];
  if (!key.startsWith('msy_')) problems.push('does not start with "msy_"');
  const bad = [...key].map((c, i) => (/[A-Za-z0-9_-]/.test(c) ? null : i))
    .filter((i) => i !== null);
  if (bad.length) problems.push(`invalid character(s) at position ${bad.join(', ')}`);
  if (key.length < 30 || key.length > 48) problems.push(`unexpected length ${key.length}`);
  if (problems.length) {
    throw new Error(`API key looks malformed: ${problems.join('; ')}`);
  }
  return key;
}

async function api(key, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

/**
 * The divine shell.
 *
 * This is the OUTSIDE of the entity — what a stranger sees before they
 * scroll. It has to read as salvation: whole, symmetrical, radiant.
 * That is close to the opposite of the fractured shell it covers, which
 * is deliberate: the fractured one is the truth underneath, and the
 * divinity curve dissolves this to reveal it.
 *
 * Constraints carried from everything already rejected:
 *   - a real aperture at the front, on axis (the camera enters here)
 *   - depth ratio near 0.85-0.95; anything flatter collapses to a wreath
 *   - no spokes, no gears, no octagonal architecture
 */
const SETS = {
  /**
   * Hypothesis test, three candidates.
   *
   * Twelve text-to-3D candidates across two batches all collapsed to
   * flat discs, gears or boxes. The common factor in both prompt sets
   * was "one round opening at the centre of the FRONT" — read as a
   * plate with a hole in it, which is a disc. So: no aperture in the
   * prompt at all (it gets bored in Blender anyway, exactly as the
   * crowned shell did), volume stated explicitly, and symmetry_mode off
   * in case the forced mirror is what is flattening them.
   */
  volume: {
    base:
      'a thick heavy three-dimensional egg-shaped body of polished pale ' +
      'gold and bone white, as deep front to back as it is wide, solid ' +
      'and rounded on every side, standing upright, its whole surface ' +
      'made of many tightly fitted interlocking plates with no gaps, ' +
      'calm and reverent, plain grey background, matte clay render, ' +
      'even studio lighting, entire form in frame, not flat, not a ' +
      'disc, not a plate, not a wheel',
    symmetry: 'off',
    variants: [
      ['egg', ', smooth unbroken plates, serene'],
      ['ridged', ', fine vertical ridges running from top to bottom over every plate'],
      ['tiered', ', plates layered in overlapping tiers from the base upward'],
    ],
  },
  divine: {
    // Every noun in the first attempt was the name of a real object, and
    // text-to-3D obliged: "vessel" returned a ceramic pot with a lid,
    // "reliquary" a casket, "cathedral" an actual church spire lying on
    // its side. The model builds the thing you named, not the quality
    // you meant. So: describe the FORM and the feeling, and never hand
    // it an object to reach for.
    base:
      'a large closed symmetrical mass of polished pale gold and bone ' +
      'white, its whole surface built from many tightly fitted ' +
      'interlocking plates with no gaps and no cracks, one round ' +
      'opening at the centre of the front, bilaterally symmetrical, ' +
      'calm and reverent and untouched, plain grey background, matte ' +
      'clay render, even studio lighting, no glow, no text, entire ' +
      'form in frame',
    variants: [
      ['grooved', ', fine parallel grooves radiating outward from the opening across every plate'],
      ['scaled', ', tightly overlapping smooth scales of even size covering the entire form'],
      ['banded', ', concentric raised bands centred on the opening, each one unbroken'],
      ['spired', ', tall slender spires standing evenly spaced around the upper edge'],
      ['filigree', ', a delicate symmetrical lattice of thin raised lines over a solid core'],
      ['smooth', ', almost featureless, one continuous polished surface, a single deep opening'],
    ],
  },
};

async function submit(key, prompt, name, symmetry = 'on') {
  const body = await api(key, '/v2/text-to-3d', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'preview',
      prompt,
      // The v2 API accepts only 'realistic'. 'sculpture' is rejected
      // outright rather than ignored, so it fails the whole batch.
      art_style: 'realistic',
      should_remesh: true,
      symmetry_mode: symmetry,
    }),
  });
  const id = body.result ?? body.id;
  console.log(`submitted ${name}: ${id}`);
  return { id, name };
}

async function poll(key, task) {
  const started = Date.now();
  for (;;) {
    const body = await api(key, `/v2/text-to-3d/${task.id}`);
    const status = body.status ?? body.state;
    if (status === 'SUCCEEDED') return { ...task, url: body.model_urls?.glb };
    if (status === 'FAILED' || status === 'CANCELED') {
      console.log(`  ${task.name}: ${status} ${JSON.stringify(body.task_error ?? {})}`);
      return { ...task, url: null };
    }
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    console.log(`  ${task.name}: ${status} (${body.progress ?? 0}%, ${mins}m)`);
    await new Promise((r) => setTimeout(r, 15000));
  }
}

async function download(task) {
  if (!task.url) return null;
  const res = await fetch(task.url);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `public/models/${task.set}-${task.name}.glb`;
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${(buf.length / 1048576).toFixed(1)} MB)`);
  return path;
}

const mode = process.argv[2] ?? 'validate';
const key = loadKey();

if (mode === 'validate') {
  const bal = await api(key, '/v1/balance');
  console.log('key valid. balance:', JSON.stringify(bal));
} else {
  const set = SETS[mode];
  if (!set) throw new Error(`unknown set "${mode}" — try: ${Object.keys(SETS).join(', ')}`);

  await api(key, '/v1/balance'); // fail fast before queueing anything
  const tasks = [];
  for (const [name, suffix] of set.variants) {
    tasks.push(await submit(key, set.base + suffix, name, set.symmetry ?? 'on'));
  }
  console.log(`\n${tasks.length} queued, polling…`);
  const done = (await Promise.all(tasks.map((t) => poll(key, t)))).map((t) => ({ ...t, set: mode }));
  for (const t of done) await download(t);
  console.log('\nnow run:  node tools/compare.mjs');
}
