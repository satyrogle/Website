/**
 * comfy-f3.mjs — variations on the descent frame Jacob picked out.
 *
 * f3 was produced by a chain, not authored, so there is very likely a better
 * version of it. Same world and same camera register throughout; only the
 * composition moves. Each variation is img2img from f3 itself, so the material,
 * grade and light stay put.
 *
 * Nothing here is approved. H1 and H3 remain alive.
 *
 *   node tools/comfy-f3.mjs
 *   node tools/comfy-f3.mjs --only d          one variation
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { HOST, run, stats, free } from './comfy.mjs';
import { upload } from './guide.mjs';

const W = 1280, H = 800;
const SRC = path.resolve('captures/hybrids/journey-h2/f3-descent.png');
const OUT = path.resolve('captures/hybrids/f3-variations');

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const WORLD = `Deep inside a structure so vast its far side is lost in haze. An immense built
  ceiling of dark panelled mass fills the upper frame and recedes into glowing depth. Broad
  interrupted level platforms enter from the sides at different depths and stop in mid air
  without ever meeting. Enormous black void hangs between and below them. Cold white light
  arrives from the far distance. Monochrome, no colour at all, thick volumetric atmosphere,
  cinematic large format photography, extreme scale, fine grain. No floor, no horizon, no
  visible outer edge, no complete shape.`;

const NEG = [
  'colour, warm light, orange, blue, people, figures, creature, vehicle, text,',
  'watermark, spaceship, starship, hull, science fiction vehicle, engine nozzles,',
  'machinery, pipes, conveyor, crane, mine, factory, cathedral, temple, cave,',
  'dome, stadium, hangar, reactor, starfield, nebula, planet, orb, portal,',
  'cemetery, LED wall, wireframe, grid lines, scaffolding, shelving, horizon,',
  'landscape, ground, sky, clouds, sun, mountain, water, low contrast, blurry',
].join(' ');

// Composition only. The world sentence above is repeated verbatim in all of them.
const VARIATIONS = {
  a: {
    denoise: 0.62,
    delta: `The ceiling hangs much lower and closer, pressing down and filling the top half of
      the frame. The levels below are further apart, leaving a taller black gap between them.
      Oppressive, heavy, close.`,
  },
  b: {
    denoise: 0.66,
    delta: `Far more void. The level platforms retreat to the extreme left and right edges and
      the entire centre of the frame is empty depth, haze and blackness receding for
      kilometres. Almost nothing is solid in the middle third.`,
  },
  c: {
    denoise: 0.66,
    delta: `Much deeper recession. The ceiling runs away from the camera into enormous distance,
      its panels becoming tiny, and the level platforms are small and far below. The sense of
      distance is extreme.`,
  },
  d: {
    denoise: 0.64,
    delta: `Strongly asymmetric. The level platforms enter only from the right side and stop
      well short of centre. The entire left third of the frame is pure black void with only
      faint haze in it. The ceiling is heavier on the right.`,
  },
  e: {
    denoise: 0.62,
    delta: `The camera looks further upward. The built ceiling dominates and its ordered
      luminous units are visible between the panelled mass. The level platforms sit low in
      the frame, small, near the bottom edge.`,
  },
  f: {
    denoise: 0.58,
    delta: `The same view, with the levels more broken and irregular, some of them collapsed or
      interrupted mid span, and the depth between them more clearly readable.`,
  },
};

const graph = (prompt, baseName, denoise, seed) => ({
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'krea2_turbo_int8_convrot.safetensors', weight_dtype: 'default' } },
  '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_4b_fp8_scaled.safetensors', type: 'krea2' } },
  '3': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
  '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt.replace(/\s+/g, ' ').trim(), clip: ['2', 0] } },
  '5': { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['2', 0] } },
  '6': { class_type: 'LoadImage', inputs: { image: baseName } },
  '7': { class_type: 'ImageScale', inputs: { image: ['6', 0], width: W, height: H, upscale_method: 'lanczos', crop: 'center' } },
  '8': { class_type: 'VAEEncode', inputs: { pixels: ['7', 0], vae: ['3', 0] } },
  '9': {
    class_type: 'KSampler',
    inputs: {
      seed, steps: 14, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise,
      model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['8', 0],
    },
  },
  '10': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
  '11': { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: 'DL_f3v' } },
});

const only = arg('only');
const keys = only ? [only] : Object.keys(VARIATIONS);

await free();
const s = await stats();
console.log(`f3 variations — Krea 2, VRAM ${s.vramFreeGB.toFixed(1)}/${s.vramTotalGB.toFixed(1)} GB free\n`);

const baseName = await upload(HOST, await readFile(SRC), 'dl-f3-base.png');
let i = 0;
for (const k of keys) {
  const V = VARIATIONS[k];
  console.log(`variation ${k}  denoise ${V.denoise}`);
  await run(graph(`${WORLD} ${V.delta}`, baseName, V.denoise, 20260818 + (++i) * 977), OUT, { prefix: `f3-${k}` });
}
await free();
console.log('\nvariations in captures/hybrids/f3-variations/');
