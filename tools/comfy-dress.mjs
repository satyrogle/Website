/**
 * comfy-dress.mjs — dress the authored grey boxes with material.
 *
 * The camera and the massing come from `tools/guide.mjs`, which raycasts one
 * 3D world from six positions. Krea 2 supplies material, grade and atmosphere
 * at a denoise low enough that it cannot re-impose its own composition.
 *
 * This exists because img2img cannot move a camera. Proven twice: a chained
 * journey and a parallel one both returned the anchor's composition at every
 * frame. Composition has to be supplied, not asked for.
 *
 * Nothing is approved. H1 and H3 remain alive.
 *
 *   node tools/comfy-dress.mjs
 *   node tools/comfy-dress.mjs --denoise 0.6 --only g3-descent
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { HOST, run, stats, free } from './comfy.mjs';
import { upload } from './guide.mjs';

const W = 1280, H = 800;
const SRC = path.resolve('captures/hybrids/greybox-h2');
const OUT = path.resolve('captures/hybrids/dressed-h2');

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const WORLD = `Deep inside a structure so vast its far side is lost in haze. Colossal masses of
  dark eroded stone and graphite. Cold white light arrives from the far depth and nowhere else.
  Monochrome, no colour at all, thick volumetric atmosphere, cinematic large format photography,
  extreme scale, fine grain. Surfaces are blunt, plain and worn, not detailed. No floor, no
  horizon, no visible outer edge, no complete shape.`;

const NEG = [
  'greeble, greebles, hull plating, panel detail, rivets, machined detail, pipes,',
  'illuminated windows, window lights, city lights, skyscraper, spaceship,',
  'star destroyer, science fiction vehicle, engine, antenna, machinery, crane,',
  'colour, warm light, orange, blue, people, figures, creature, vehicle, text,',
  'watermark, mine, factory, cathedral, temple, cave, dome, stadium, hangar,',
  'reactor, starfield, nebula, planet, orb, portal, cemetery, LED wall, wireframe,',
  'grid lines, scaffolding, shelving, horizon, landscape, ground, terrain, sky,',
  'clouds, sun, mountain, water, low contrast, blurry, flat grey render, clay render',
].join(' ');

const FRAMES = {
  'g1-opening': `The opening view. Enormous masses to either side receding into a luminous depth.`,
  'g2-approach': `Nearer to one mass now, its broken end cut off by the frame edge.`,
  'g3-descent': `Seen from below: the masses are overhead and to the sides, their undersides
    exposed, the lit depth running away in a band between them.`,
  'g4-discrepancy': `Small pale units drift in the void here, visibly being stripped and reduced,
    dark residue falling away below them. Highest local contrast of the journey.`,
  'g5-lower-truth': `The bottom of the interior. Deep stratified layers of ash and lead, matte and
    absorbing almost all light, filthy and old. Still enclosed. Nothing glows.`,
  'g6-return': `The opening view again, identical, except one region overhead is now absent and
    the gap has an exact deliberate edge.`,
};

const graph = ({ prompt, baseName, denoise, seed }) => ({
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
      seed, steps: 16, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise,
      model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['8', 0],
    },
  },
  '10': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
  '11': { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: 'DL_dress' } },
});

const denoise = Number(arg('denoise', 0.55));
const only = arg('only');
const keys = only ? [only] : Object.keys(FRAMES);

await free();
const s = await stats();
console.log(`dressing grey boxes — denoise ${denoise}, VRAM ${s.vramFreeGB.toFixed(1)} GB free`);
console.log('camera and massing are authored; only material comes from the model\n');

let i = 0;
for (const k of keys) {
  const baseName = await upload(HOST, await readFile(path.join(SRC, `${k}.png`)), `dl-gb-${k}.png`);
  console.log(`${k}`);
  await run(
    graph({ prompt: `${WORLD} ${FRAMES[k]}`, baseName, denoise, seed: 20260818 + (++i) * 419 }),
    OUT, { prefix: k },
  );
}
await free();
console.log('\ndressed frames in captures/hybrids/dressed-h2/');
