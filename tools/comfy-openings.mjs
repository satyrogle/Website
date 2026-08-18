/**
 * comfy-openings.mjs — one opening image per concept, judged as a picture.
 *
 * Plain text to image. No ControlNet, no img2img, no depth guide. Six probes on
 * 2026-08-18 proved that forcing an authored composition onto the model
 * destroys quality; unguided generation was the only thing that produced real
 * material and grade. Prompts are built from docs/THREE_HYBRIDS_OPENING_BOARDS.md,
 * naming photographic and cinematic territory the model actually knows.
 *
 *   node tools/comfy-openings.mjs
 *   node tools/comfy-openings.mjs --only h1 --seeds 4
 */

import path from 'node:path';
import { run, stats, free } from './comfy.mjs';

const CKPT = 'RealVisXL_V5.0_fp16.safetensors';
const W = 1280, H = 800;
const OUT = path.resolve('captures/hybrids/openings');

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const NEG = [
  'text, letters, watermark, logo, signature, people, person, figure, silhouette',
  'of a person, creature, animal, vehicle, crane, conveyor, pipes, machinery,',
  'mine, quarry, factory, bridge, cathedral, temple, church, cave, crystal cave,',
  'dome, cooling tower, stadium, hangar, spaceship interior, reactor, monolith,',
  'starfield, stars, constellation, nebula, galaxy, planet, orb, sphere, eclipse,',
  'portal, ring, halo, tunnel, cemetery, gravestone, LED screen, wireframe, grid',
  'lines, chart, diagram, data visualisation, scaffolding, shelving, staircase,',
  'a room, wall and floor, mountain, landscape, valley, cliff, snow, ice, trees,',
  'water, sky, clouds, horizon, glassmorphism, neon, cyberpunk, purple, teal,',
  'cyan, orange, red, rainbow, colour, lens flare, bokeh, vignette, cartoon,',
  'illustration, painting, concept art, 3d render, cgi, videogame, low contrast,',
  'washed out, flat lighting, blurry, muddy, uniform grey, empty frame',
].join(' ');

const CONCEPTS = {
  h1: {
    label: 'H1 — THE LOAD',
    prompt: `colossal masses of dark cast concrete and graphite pressing into one another at
      impossible scale, brilliant white light blazing out only from the crushed contact
      surfaces where they bear against each other, everything else in absolute darkness,
      monochrome infrared cinematography, blown white highlights against pure black with
      almost no midtone, heavy volumetric haze stating enormous distance, anamorphic,
      shot on large format, no human reference anywhere, every mass cropped by the frame
      edge, no horizon, no ground, no complete shape`,
  },
  h2: {
    label: 'H2 — THE ASCENSION ENGINE, INSIDE',
    prompt: `looking upward inside an impossibly vast dark hollow interior, an immense distant
      surface far overhead built from many thousands of tiny ordered white light sources
      receding into deep haze, that surface never resolving into a shape and never closing,
      enormous black empty volume below it, monochrome, thick volumetric atmosphere,
      perfectly symmetrical composition, cold floodlit excavation lighting, large format
      photography, extreme scale, no floor, no wall, no visible edge anywhere`,
  },
  h3: {
    label: 'H3 — THE IMPOSED FIELD',
    prompt: `an immense three dimensional field of many thousands of thin pale fractured stone
      plates suspended in absolute black void, each plate substantial with real thickness and
      its own orientation, cold white light escaping only from their cracked and delaminated
      edges, their positions obeying an exact mathematical spacing, the field receding into
      infinite depth and cropped by every frame edge, monochrome, large format photography,
      fine grain, volumetric haze in the void`,
  },
};

const graph = (prompt, seed) => ({
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt.replace(/\s+/g, ' ').trim(), clip: ['1', 1] } },
  '3': { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['1', 1] } },
  '4': { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
  '5': {
    class_type: 'KSampler',
    inputs: {
      seed, steps: 40, cfg: 5.0, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1.0,
      model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
    },
  },
  '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'DL_open' } },
});

const only = arg('only');
const seeds = Number(arg('seeds', 3));
const keys = only ? [only] : Object.keys(CONCEPTS);

const s = await stats();
console.log(`ComfyUI ${s.version} — VRAM ${s.vramFreeGB.toFixed(1)}/${s.vramTotalGB.toFixed(1)} GB free\n`);

for (const k of keys) {
  const C = CONCEPTS[k];
  console.log(C.label);
  for (let i = 0; i < seeds; i++) {
    const seed = 20260818 + i * 7717;
    console.log(`  seed ${seed}`);
    await run(graph(C.prompt, seed), path.join(OUT, k), { prefix: `${k}-s${i}` });
  }
}

await free();
console.log('\nopenings in captures/hybrids/openings/');
