/**
 * comfy-krea.mjs — the three opening images on Krea 2, locally.
 *
 * SDXL / RealVisXL failed nine times: every output collapsed to a material
 * sample photographed at arm's length, with no scale, void or depth. Krea 2 is
 * a different architecture entirely (SingleStreamDiT), and it is already on
 * disk.
 *
 * Wiring, read out of the ComfyUI source rather than guessed:
 *   UNET      krea2_turbo_int8_convrot.safetensors
 *   CLIP      qwen3vl_4b_fp8_scaled.safetensors, CLIPLoader type "krea2"
 *   VAE       qwen_image_vae.safetensors  (Wan21 latent format, 16 channels)
 *   sampling  shift 1.15, applied from the model config automatically
 *
 *   node tools/comfy-krea.mjs --only h1
 *   node tools/comfy-krea.mjs --steps 10 --cfg 1.5
 */

import path from 'node:path';
import { run, stats, free } from './comfy.mjs';

const W = 1280, H = 800;
const OUT = path.resolve('captures/hybrids/openings-krea');

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const NEG = [
  'colour, mid grey, flat texture, close-up material sample, rubble, gravel,',
  'cracked mud, concrete blocks, coral, popcorn texture, tiling pattern,',
  'people, machinery, vehicles, text, watermark, mine, quarry, factory, bridge,',
  'cathedral, cave, dome, stadium, hangar, reactor, starfield, nebula, planet,',
  'orb, portal, tunnel, cemetery, LED wall, wireframe, grid, scaffolding,',
  'a room with a wall and a floor, mountain, landscape, sky, horizon, trees,',
  'neon, cyberpunk, cartoon, illustration, 3d render, cgi, low contrast, blurry',
].join(' ');

const CONCEPTS = {
  h1: {
    label: 'H1 — THE LOAD',
    prompt: `A vast dark chamber of impossible scale, kilometres across. Two colossal masses of
      near-black graphite, each far too large to see whole, press into one another. Blinding
      cold white light blazes out from the crushed contact surface where they bear together,
      and from nowhere else. The light rakes across their surfaces and dies into absolute
      blackness. Enormous empty void fills the left of the frame. Deep volumetric haze states
      the distance. Monochrome, no colour. Shot on large format, cinematic, extreme dynamic
      range. Every mass is cut off by the edge of the frame. There is no floor, no ceiling,
      no horizon and no complete shape.`,
  },
  h2: {
    label: 'H2 — THE ASCENSION ENGINE, INSIDE',
    prompt: `Looking upward inside a hollow structure so vast its far side is lost in haze. High
      overhead, an immense built surface made of many thousands of tiny ordered cold white
      lights recedes into the distance, dimming with depth. That surface never curves closed
      and never resolves into a shape. Below it hangs an enormous black emptiness with a few
      pale terraces entering from the right and stopping in mid air. Monochrome, no colour,
      thick atmosphere, cinematic, large format. No floor, no wall, no visible edge anywhere.`,
  },
  h3: {
    label: 'H3 — THE IMPOSED FIELD',
    prompt: `An immense three dimensional field of many thousands of thin pale stone plates hanging
      in absolute black void, receding kilometres into depth. Each plate is a substantial slab
      with real thickness and its own angle, and cold white light escapes only from its
      cracked and split edges. Their positions follow an exact grid that the plates themselves
      do not obey. Some positions are empty. The nearest plates are huge and cut off by the
      frame. Monochrome, no colour, faint haze in the void, large format, fine grain.`,
  },
};

const graph = (prompt, seed, steps, cfg) => ({
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'krea2_turbo_int8_convrot.safetensors', weight_dtype: 'default' } },
  '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_4b_fp8_scaled.safetensors', type: 'krea2' } },
  '3': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
  '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt.replace(/\s+/g, ' ').trim(), clip: ['2', 0] } },
  '5': { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['2', 0] } },
  '6': { class_type: 'EmptySD3LatentImage', inputs: { width: W, height: H, batch_size: 1 } },
  '7': {
    class_type: 'KSampler',
    inputs: {
      seed, steps, cfg, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0,
      model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0],
    },
  },
  '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
  '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'DL_krea' } },
});

const only = arg('only');
const steps = Number(arg('steps', 8));
const cfg = Number(arg('cfg', 1.0));
const keys = only ? [only] : Object.keys(CONCEPTS);

await free();
const s = await stats();
console.log(`Krea 2 — VRAM ${s.vramFreeGB.toFixed(1)}/${s.vramTotalGB.toFixed(1)} GB free, RAM ${s.ramFreeGB.toFixed(1)} GB`);
console.log(`steps ${steps}, cfg ${cfg}, ${W}x${H}\n`);

for (const k of keys) {
  console.log(CONCEPTS[k].label);
  await run(graph(CONCEPTS[k].prompt, 20260818, steps, cfg), path.join(OUT, k), { prefix: `${k}-krea` });
}
await free();
