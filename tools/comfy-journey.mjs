/**
 * comfy-journey.mjs — the H2 journey, every frame derived from one anchor.
 *
 * Jacob picked f3-f on 2026-08-18: broken, interrupted level spans that make
 * depth legible. It is the anchor. Nothing is approved — `docs/APPROVED_VISUAL_
 * JOURNEY.md` still reads NOT APPROVED and H1 and H3 remain alive.
 *
 * METHOD CORRECTION. The previous pass chained each frame off the last and
 * failed twice over: frames 2 to 5 converged on one composition, and detail
 * accumulated pass over pass until the panelling became greebled hull with lit
 * windows — generic science fiction, which is a kill condition.
 *
 *   img2img chaining accumulates detail. It does not move a camera.
 *
 * So every frame here is derived from the SAME anchor with its own authored
 * composition, exactly as the variations were. That is the one method on this
 * project that has produced distinct compositions in one coherent world.
 *
 *   node tools/comfy-journey.mjs
 *   node tools/comfy-journey.mjs --only f5
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { HOST, run, stats, free } from './comfy.mjs';
import { upload } from './guide.mjs';

const W = 1280, H = 800;
const ANCHOR = path.resolve('captures/hybrids/f3-variations/f3-f.png');
const OUT = path.resolve('captures/hybrids/journey-f3f');

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const WORLD = `Deep inside a structure so vast its far side is lost in haze. An immense ceiling
  of dark mass overhead receding into glowing depth. Broad level spans entering from the sides,
  broken and interrupted in mid air so the depth between them is readable. Enormous black void
  between and below them. Monochrome, no colour at all, thick volumetric atmosphere, cinematic
  large format photography, extreme scale, fine grain. Surfaces are plain, blunt and eroded, not
  detailed. No floor, no horizon, no visible outer edge.`;

// The greeble guard. The previous pass drifted into hull plating with lit
// windows over successive passes; these terms hold the surfaces blunt.
const NEG = [
  'greeble, greebles, hull plating, panel detail, rivets, machined surface detail,',
  'illuminated windows, window lights, city lights, skyscraper, spaceship,',
  'star destroyer, death star, science fiction vehicle, engine nozzles, antenna,',
  'colour, warm light, orange, blue, people, figures, creature, vehicle, text,',
  'watermark, machinery, pipes, conveyor, crane, mine, factory, cathedral, temple,',
  'cave, dome, stadium, hangar, reactor, central engine, furnace, starfield, nebula,',
  'planet, orb, portal, cemetery, LED wall, wireframe, grid lines, scaffolding,',
  'shelving, horizon, landscape, ground, terrain, plateau, sky, clouds, sun,',
  'mountain, water, coastline, low contrast, blurry',
].join(' ');

const FRAMES = {
  f2: {
    n: 2, key: 'f2-approach', denoise: 0.56,
    delta: `Nearer to one broken span, which now runs large across the lower frame and is cut
      off by the edge. Beyond its broken end the void opens away into haze. The ceiling stays
      overhead. Nothing new enters the world; we are simply closer to part of it.`,
  },
  f3: {
    n: 3, key: 'f3-descent', denoise: 0.72,
    delta: `We have dropped below the level spans. They are above us now and to the sides, seen
      from underneath, their broken ends overhead. The ceiling is far above and much smaller.
      Beneath us the void opens further and deeper into blackness. Still entirely enclosed;
      there is no ground below, only more depth.`,
  },
  f4: {
    n: 4, key: 'f4-discrepancy', denoise: 0.74,
    delta: `Close range in the void between spans. Small pale units are rising slowly around us
      and are visibly being stripped and reduced as they rise, material separating away from
      them, dark residue drifting downward. Highest local contrast of the journey.`,
  },
  f5: {
    n: 5, key: 'f5-lower-truth', denoise: 0.70,
    delta: `The bottom of the interior. Deep stratified layers of ash and lead, matte and
      absorbing almost all light, filthy and old, receding into blackness. Still enclosed: the
      structure's walls continue past both frame edges and the ceiling is a narrow distant band
      far above. No central machine, nothing glowing. This is an interior. There is no horizon
      and no outdoors.`,
  },
  f6: {
    n: 6, key: 'f6-return', denoise: 0.34,
    delta: `Exactly the opening view again from the same camera: the same ceiling, the same
      broken level spans, the same void. One difference only — a region of the ceiling is dark
      and empty where its mass is missing, and that absence has an exact deliberate edge.`,
  },
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
      seed, steps: 14, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise,
      model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['8', 0],
    },
  },
  '10': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
  '11': { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: 'DL_jf3f' } },
});

const only = arg('only');
const keys = only ? [only] : Object.keys(FRAMES);

await free();
const s = await stats();
console.log(`H2 journey from f3-f — VRAM ${s.vramFreeGB.toFixed(1)}/${s.vramTotalGB.toFixed(1)} GB free`);
console.log('every frame derives from the anchor, never from the previous frame\n');

const baseName = await upload(HOST, await readFile(ANCHOR), 'dl-anchor-f3f.png');

for (const k of keys) {
  const F = FRAMES[k];
  console.log(`frame ${F.n}  ${F.key}   denoise ${F.denoise}`);
  await run(
    graph({ prompt: `${WORLD} ${F.delta}`, baseName, denoise: F.denoise, seed: 20260818 + F.n * 613 }),
    OUT, { prefix: F.key },
  );
}

await free();
console.log('\nframes in captures/hybrids/journey-f3f/  (frame 1 is the anchor itself)');
