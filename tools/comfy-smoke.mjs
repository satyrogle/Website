/**
 * comfy-smoke.mjs — prove the ComfyUI path works end to end before any board is
 * written against it.
 *
 * This is a CAPABILITY PROBE, not art direction. Nothing it produces is a
 * candidate frame and nothing it produces may be shown as one. It answers one
 * question: can this checkpoint, on this card, hold near-black monochrome at
 * vast scale without collapsing into the obvious cliche?
 *
 *   node tools/comfy-smoke.mjs
 */

import { run, stats, free } from './comfy.mjs';
import path from 'node:path';

const CKPT = process.argv.includes('--jugg')
  ? 'Juggernaut-XL_v9.safetensors'
  : 'RealVisXL_V5.0_fp16.safetensors';

// 1280x800 is exactly 1.6, matches the 1440x900 target ratio, and sits close to
// SDXL's native pixel budget. It upscales to 1440x900 at a clean 1.125.
const W = 1280;
const H = 800;

const NEGATIVE = [
  'text, watermark, logo, signature, people, person, figure, creature, face,',
  'orb, sphere, planet, eclipse, portal, ring, halo, tunnel, dome, arch,',
  'cathedral, temple, church, altar, candle, chandelier, lantern, string lights,',
  'starfield, stars, constellation, nebula, galaxy, cemetery, gravestone,',
  'glassmorphism, neon, cyberpunk, purple, teal, cyan, orange, rainbow,',
  'lens flare, bokeh, vignette, cartoon, illustration, concept art, painting,',
  'low contrast, washed out, flat lighting, blurry, noise, jpeg artifacts',
].join(' ');

const PROBE = [
  'colossal dark graphite masses in black space, restrained bone-white light',
  'along contact seams only, immense scale, kilometres deep, aerial perspective,',
  'volumetric haze revealing distance, near-black monochrome, no colour cast,',
  'extreme dynamic range, deep shadow detail, bright specular highlights,',
  'large format photography, long exposure, ultra fine grain, cropped by frame edge',
].join(' ');

const graph = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: PROBE, clip: ['1', 1] } },
  '3': { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE, clip: ['1', 1] } },
  '4': { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
  '5': {
    class_type: 'KSampler',
    inputs: {
      seed: 20260818, steps: 28, cfg: 4.5,
      sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1.0,
      model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
    },
  },
  '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'DL_smoke' } },
};

const s = await stats();
console.log(`ComfyUI ${s.version} — ${s.device}`);
console.log(`VRAM ${s.vramFreeGB.toFixed(1)}/${s.vramTotalGB.toFixed(1)} GB free, RAM ${s.ramFreeGB.toFixed(1)} GB`);
console.log(`checkpoint: ${CKPT}  @ ${W}x${H}`);

const t0 = Date.now();
await run(graph, path.resolve('captures/comfy-smoke'), { prefix: `smoke-${CKPT.split('-')[0].toLowerCase()}` });
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await free();
