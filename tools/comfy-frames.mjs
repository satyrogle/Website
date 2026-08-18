/**
 * comfy-frames.mjs — the two-frame kill test for H1, H2 and H3.
 *
 * Six candidate frames at equal finish. Composition is IMPOSED through a depth
 * guide authored in `tools/guide.mjs` and driven by union ControlNet; the
 * prompt carries the grade only. A capability probe on 2026-08-18 proved that
 * words alone resolve to the nearest photographic category (it returned a
 * mountain range), which is exactly what these three directions must not be.
 *
 * Art direction only. Nothing here is a production asset, nothing is approved,
 * and the three candidates stand equal.
 *
 *   node tools/comfy-frames.mjs                 all six, all variants
 *   node tools/comfy-frames.mjs --only h1a      one frame
 *   node tools/comfy-frames.mjs --only h1a --variants full
 *   node tools/comfy-frames.mjs --guides-only   author guides, do not render
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { HOST, run, stats, free } from './comfy.mjs';
import { canvas, box, fillPoly, blur, toPNG, upload } from './guide.mjs';

const W = 1280, H = 800;                       // 1.6, matches 1440x900, /1.125
const CKPT = 'RealVisXL_V5.0_fp16.safetensors';
const OUT = path.resolve('captures/hybrids');

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const flag = (n) => process.argv.includes(`--${n}`);

/* ------------------------------------------------------------------ *
 * Text-safe zone, identical in all six.
 * 1440x900 -> x 96..608, y 470..820   scaled by 0.8889 for the guide.
 * ------------------------------------------------------------------ */
const SAFE = { x0: 85, y0: 418, x1: 541, y1: 729 };

/* ------------------------------------------------------------------ *
 * Massing. Depth: 1.0 nearest, 0.0 furthest. Nearer wins on overlap,
 * so occlusion is correct without ordering care.
 * ------------------------------------------------------------------ */

const MASS = {
  // H1-A shallow load: two colossal masses, the lane between them, contacts.
  h1a(c) {
    box(c, 560, 200, 720, 320, 0.10);          // atmosphere in the lane
    box(c, 585, 135, 155, 145, 0.30, 18);      // far terrace
    box(c, 690, 95, 190, 225, 0.44, 22);
    box(c, 820, 40, 240, 330, 0.62, 26);
    box(c, 980, 0, 300, 420, 0.85, 30);        // nearest, cropped right + top
    box(c, 585, 545, 235, 255, 0.60, -20);     // lower mid mass
    box(c, 700, 480, 580, 320, 0.92, -28);     // lower near, cropped right + bottom
    return c;
  },

  // H1-B failure basin: three load paths converging into a broad territory.
  h1b(c) {
    box(c, 560, 110, 720, 280, 0.12);
    fillPoly(c, [[600, 0], [830, 0], [990, 440], [762, 476]], 0.52);
    fillPoly(c, [[1070, 0], [1280, 0], [1280, 405], [1012, 447]], 0.60);
    fillPoly(c, [[1165, 295], [1280, 283], [1280, 530], [1085, 505]], 0.48);
    box(c, 610, 470, 670, 330, 0.88, -18);     // the basin, broad not hot
    box(c, 890, 556, 390, 244, 0.97, -10);
    return c;
  },

  // H2-A constructed heaven: built sky above, sparse black below, no closed curve.
  h2a(c) {
    // Lower edge rises to the left so the sky clears the text-safe zone.
    fillPoly(c, [[0, 0], [1280, 0], [1280, 520], [0, 372]],
      (u, v) => 0.14 + (1 - u) * 0.26 + v * 0.30);
    // Both terraces enter from the right: the lower left is the shared text
    // void, and a left terrace bleeds into it under blur at any usable height.
    box(c, 900, 596, 380, 146, 0.80, -22);
    box(c, 1010, 700, 270, 100, 0.90, -14);
    return c;
  },

  // H2-B lower truth: strata dominate, the built sky is a far band at the top.
  h2b(c) {
    box(c, 0, 0, 1280, 96, 0.06);              // the sky, now distant
    const bands = [[250, 0.34], [332, 0.44], [418, 0.55], [508, 0.66], [606, 0.78], [706, 0.93]];
    let prev = 236;                            // x 585 leaves the blur headroom
    for (const [y, d] of bands) { box(c, 585, y, 695, y - prev + 92, d, -8); prev = y; }
    for (let i = 0; i < 7; i++) {              // sparse units rising, ambiguous
      box(c, 618 + i * 88, 138 + ((i * 37) % 62), 24, 44, 0.22);
    }
    return c;
  },

  // H3-A holy field: plates at exact positions, materially varied, with gaps.
  h3a(c) {
    const layers = [
      { d: 0.13, n: 9, s: 15 }, { d: 0.23, n: 7, s: 23 }, { d: 0.36, n: 6, s: 35 },
      { d: 0.50, n: 5, s: 52 }, { d: 0.70, n: 3, s: 80 }, { d: 0.90, n: 2, s: 124 },
    ];
    const removed = new Set(['1-3', '2-2', '3-1', '0-5']);   // the exact gaps
    layers.forEach((L, li) => {
      const step = (1280 - 566) / L.n;
      for (let i = 0; i < L.n; i++) {
        if (removed.has(`${li}-${i}`)) continue;
        const x = 566 + i * step + (li % 2) * 17;            // spacing is exact
        const y = 116 + ((i * 97 + li * 53) % 430);
        const w = L.s * (0.55 + ((i * 13 + li * 7) % 5) / 10); // only size varies
        box(c, x, y, w, L.s * 1.9, L.d, (i % 3 - 1) * 6);
      }
    });
    for (let i = 0; i < 5; i++) {              // far entries left, above the zone
      box(c, 118 + i * 96, 118 + ((i * 61) % 148), 15, 29, 0.14);
    }
    return c;
  },

  // H3-B imposed lattice: the same field, plus what holds it. Never a grid.
  h3b(c) {
    MASS.h3a(c);
    const verts = [[592, 30], [742, 22], [905, 34], [1074, 26], [1232, 30]];
    verts.forEach(([x, w], i) => box(c, x, 356 + (i % 2) * 26, w, 448, 0.55));
    const hors = [[430, 21], [566, 26], [702, 19]];
    hors.forEach(([y, h2], i) => box(c, 560 + (i % 2) * 24, y, 720, h2, 0.52));
    return c;
  },
};

/* ------------------------------------------------------------------ *
 * Prompts. Grade only. The massing is the guide's job.
 * ------------------------------------------------------------------ */

// Ask for the LIGHT, never for the darkness. Three probes on 2026-08-18 asked
// for "near-black monochrome" and returned underexposure: flat grey slabs, then
// grey fog, then an almost entirely black frame. With an abstract depth guide
// the model has no lighting model to fall back on, so "near-black" simply wins.
// Darkness is what is left over once the light is placed, and it is enforced in
// the negative instead.
const GRADE = [
  'monochrome, no colour cast, graphite and bone white only,',
  'strong raking light from one distant source outside the frame,',
  'bright specular highlights along the lit edges, luminous haze catching the beam,',
  'correctly exposed, rich deep shadows that still hold detail,',
  'extreme dynamic range, large format photography, long exposure, ultra fine grain,',
  'immense scale, kilometres deep, cropped by the frame edge on every side,',
  'no horizon, no visible outer edge, no complete silhouette',
].join(' ');

const NEG_BASE = [
  'text, letters, watermark, logo, signature, people, person, figure, creature,',
  'face, animal, vehicle, machinery, pipes, conveyor, crane, tank, equipment,',
  'orb, sphere, planet, eclipse, portal, ring, halo, dome, arch, tunnel,',
  'cathedral, temple, church, altar, candle, chandelier, lantern, string lights,',
  'starfield, stars, constellation, nebula, galaxy, cemetery, gravestone, tomb,',
  'mountain, mountains, landscape, valley, cliff, snow, ice, sky, clouds, water,',
  'bridge, building, architecture render, room, floor, ceiling, wall, window,',
  'wireframe, grid lines, graph, chart, diagram, data visualisation, LED screen,',
  'glassmorphism, neon, cyberpunk, purple, teal, cyan, orange, red, rainbow,',
  'lens flare, bokeh, vignette, cartoon, illustration, painting, concept art,',
  // Moderated after probe 4: the aggressive anti-darkness block below drove the
  // frame to near-white paper. With an img2img base the exposure comes from the
  // base, so the negative only has to hold off mush.
  'low contrast, washed out, flat lighting, blurry, oversaturated,',
  'muddy, uniform grey, grey mush, empty frame, blank, featureless',
].join(' ');

// Unguided material plate. No ControlNet and no subject: this exists purely to
// carry correct exposure, surface and grain into img2img, so the model is not
// deciding exposure from prompt token weight alone.
const PLATE = [
  'extreme close range on a vast matte graphite surface, raking light from one',
  'distant source outside the frame, bright specular sheen along one edge,',
  'deep rich shadow that still holds detail, fine mineral grain, dust in the air,',
  'monochrome, no colour cast, large format photography, long exposure,',
  'ultra fine grain, correctly exposed',
].join(' ');

const FRAMES = {
  h1a: {
    label: 'H1-A shallow load',
    mass: MASS.h1a,
    cn: 0.82,
    prompt: `colossal graphite and carbon masses in black space, restrained bone-white light
      appearing only where one mass bears down on another, a series of small discrete contact
      points diminishing into the distance, hard void between the load paths, matte carbon
      surfaces with fine internal grain, volumetric haze revealing depth between the masses,
      ${GRADE}`,
  },
  h1b: {
    label: 'H1-B failure basin',
    mass: MASS.h1b,
    cn: 0.78,
    prompt: `colossal graphite masses converging, several load paths arriving into one broad
      luminous territory, brightness spread across a wide region rather than concentrated in a
      core, warped interfaces and opening seams, pale stress whitening within the material
      itself, unloaded masses nearby sitting completely dark, volumetric haze, ${GRADE}`,
  },
  h2a: {
    label: 'H2-A constructed heaven',
    mass: MASS.h2a,
    cn: 0.80,
    prompt: `the interior of something immeasurably vast, a built surface far overhead made of
      many thousands of small ordered bone-white sources receding into haze, the surface never
      resolving into a shape, deep black below with pale graphite terraces entering from the
      sides, luminous haze between the layers, ${GRADE}`,
  },
  h2b: {
    label: 'H2-B lower truth',
    mass: MASS.h2b,
    cn: 0.80,
    prompt: `deep stratified layers of ash, lead and fine sediment, matte and light-absorbing,
      horizontal banding receding into depth, a few small pale units suspended in the middle
      distance, one narrow band of distant ordered light far above at the top of the frame,
      dust in the air, ${GRADE}`,
  },
  h3a: {
    label: 'H3-A holy field',
    mass: MASS.h3a,
    cn: 0.85,
    prompt: `an immense three-dimensional field of thin faceted pale plates suspended in black
      void, each plate substantial with real thickness and orientation, light escaping only
      through fractured and delaminated edges, the nearest plates large and cropped by the
      frame, density falling away into depth, ash and damaged off-white material, faint
      scattered light in the void, ${GRADE}`,
  },
  h3b: {
    label: 'H3-B imposed lattice',
    mass: MASS.h3b,
    cn: 0.85,
    prompt: `an immense field of thin pale fractured plates suspended in black void, and behind
      them a heavy dead graphite structure that does not glow, older and duller than everything
      it holds, revealed only by what it blocks from view, light escaping only through damaged
      plate edges, the darkest possible exposure that still holds detail, ${GRADE}`,
  },
};

const VARIANTS = {
  full: { neg: '', note: 'full treatment' },
  nobloom: { neg: ', bloom, glow, halation, light bleed, soft glow, diffusion filter, glare', note: 'bloom disabled' },
  nofog: { neg: ', fog, haze, mist, atmospheric haze, smoke, dust in air, volumetric light', note: 'fog reduced' },
};

/* ------------------------------------------------------------------ */

function graph({ prompt, negative, guideName, cn, seed, base = null, denoise = 1.0 }) {
  // img2img when a base is supplied: the base carries exposure, surface and
  // grain; ControlNet re-masses it; denoise decides how much of the base's own
  // structure survives.
  const latent = base
    ? {
      '20': { class_type: 'LoadImage', inputs: { image: base } },
      '21': { class_type: 'ImageScale', inputs: { image: ['20', 0], width: W, height: H, upscale_method: 'lanczos', crop: 'center' } },
      '22': { class_type: 'VAEEncode', inputs: { pixels: ['21', 0], vae: ['1', 2] } },
    }
    : { '4': { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } } };
  const latentRef = base ? ['22', 0] : ['4', 0];

  return {
    ...latent,
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt.replace(/\s+/g, ' ').trim(), clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
    '10': { class_type: 'LoadImage', inputs: { image: guideName } },
    '11': { class_type: 'ControlNetLoader', inputs: { control_net_name: 'controlnet-union-sdxl-promax.safetensors' } },
    '12': { class_type: 'SetUnionControlNetType', inputs: { control_net: ['11', 0], type: 'depth' } },
    '13': {
      class_type: 'ControlNetApplyAdvanced',
      inputs: {
        positive: ['2', 0], negative: ['3', 0], control_net: ['12', 0], image: ['10', 0],
        // Composition is locked early and released before the end, so the last
        // stretch of denoising is free to put material and light on the massing.
        // At strength 0.82 to 0.85 the model reproduced the flat depth map.
        strength: Number(arg('cn', cn)),
        start_percent: 0.0,
        end_percent: Number(arg('cnend', 0.55)),
      },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed, steps: 32, cfg: Number(arg('cfg', 5.5)),
        sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise,
        model: ['1', 0], positive: ['13', 0], negative: ['13', 1], latent_image: latentRef,
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'DL_hybrid' } },
  };
}

const only = arg('only');
const wantVariants = (arg('variants') || 'full,nobloom,nofog').split(',');
const keys = only ? [only] : Object.keys(FRAMES);

await mkdir(path.join(OUT, 'guides'), { recursive: true });

const s = await stats();
console.log(`ComfyUI ${s.version} — ${s.device}, VRAM ${s.vramFreeGB.toFixed(1)}/${s.vramTotalGB.toFixed(1)} GB free`);
console.log(`text-safe zone (guide px): x ${SAFE.x0}-${SAFE.x1}, y ${SAFE.y0}-${SAFE.y1}\n`);

if (flag('plate')) {
  console.log('material plate — unguided, no subject, exposure reference only');
  const saved = await run({
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: PLATE, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: NEG_BASE, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: 20260818, steps: 30, cfg: 5.0, sampler_name: 'dpmpp_2m',
        scheduler: 'karras', denoise: 1.0,
        model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'DL_plate' } },
  }, path.join(OUT, 'base'), { prefix: 'plate' });
  const { readFile } = await import('node:fs/promises');
  const name = await upload(HOST, await readFile(saved[0].dest), 'dl-plate.png');
  console.log(`\nplate uploaded as ${name}`);
  console.log(`use:  node tools/comfy-frames.mjs --base ${name} --denoise 0.65`);
  await free();
  process.exit(0);
}

const BASE = arg('base', null);
const DENOISE = Number(arg('denoise', BASE ? 0.65 : 1.0));
if (BASE) console.log(`img2img base ${BASE} at denoise ${DENOISE}\n`);

for (const key of keys) {
  const F = FRAMES[key];
  if (!F) { console.error(`unknown frame ${key}`); continue; }

  // Author the guide, verify the safe zone, upload.
  const c = blur(F.mass(canvas(W, H, 0)), 9, 3);
  let maxInSafe = 0;
  for (let y = SAFE.y0; y <= SAFE.y1; y++) {
    for (let x = SAFE.x0; x <= SAFE.x1; x++) maxInSafe = Math.max(maxInSafe, c.px[y * W + x]);
  }
  const png = toPNG(c);
  await writeFile(path.join(OUT, 'guides', `${key}-depth.png`), png);
  const guideName = await upload(HOST, png, `dl-${key}-depth.png`);

  console.log(`${F.label}`);
  console.log(`  guide uploaded as ${guideName}, max depth inside text-safe zone ${maxInSafe.toFixed(3)}${maxInSafe > 0.08 ? '  <-- INTRUSION' : ''}`);
  if (flag('guides-only')) continue;

  for (const v of wantVariants) {
    const V = VARIANTS[v];
    if (!V) continue;
    console.log(`  [${v}] ${V.note}`);
    await run(
      graph({
        prompt: F.prompt,
        negative: NEG_BASE + V.neg,
        guideName, cn: F.cn, seed: 20260818,
        base: BASE, denoise: DENOISE,
      }),
      path.join(OUT, key),
      { prefix: `${key}-${v}` },
    );
  }
}

await free();
console.log('\nguides + frames in captures/hybrids/');
