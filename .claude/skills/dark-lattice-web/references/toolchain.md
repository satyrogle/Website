# Toolchain — which tool does what, and what stays closed

Measured on this machine, not recalled. Every fact below was verified on
2026-08-18 against the running install.

## Stage map

```text
RAW RESEARCH        PureRef / FrameRef          cluster, never curate
CURATED LEDGER      Figma MCP                   TAKE / REJECT / FRAME
COMPOSITION         frameboard, written first   camera before pixels
GENERATION          ComfyUI ArtLab, local       composition imposed, not asked
BROWSER CAPTURE     Playwright, tools/*.mjs     only once code exists
IMPLEMENTATION      closed                      until the journey is approved
```

## ComfyUI ArtLab — the generation surface

Jacob's own install. Documented at
`C:\Users\jacob\ComfyUI-Installs\ComfyUI\ARTLAB_TOOLKIT.md`. Localhost only.

```text
endpoint    http://127.0.0.1:8191        NOT the default 8188
launcher    C:\Users\jacob\ComfyUI-Installs\ComfyUI\Start-ArtLab.ps1
card        RTX 3060, 12.9 GB VRAM, 32 GB RAM
version     ComfyUI 0.31.0, 1076 nodes
bridge      tools/comfy.mjs              --ping | --free | --run
```

**Free VRAM before every session.** The card idles with as little as 3.7 GB
free, and SDXL with ControlNet needs more. `node tools/comfy.mjs --free` returns
it to ~11.7 GB. Models reload on the next prompt, so this is safe.

**Write outputs into this repository, never into
`C:\Users\jacob\ComfyUI-Shared\output\ArtLab`.** That directory belongs to the
game project. Website art direction and game assets do not mix.

Verified available:

```text
checkpoints   RealVisXL_V5.0_fp16   preferred, most photographic grade
              Juggernaut-XL_v9      alternate, more stylised
controlnet    controlnet-union-sdxl-promax, union type "depth"
authoring     SolidMask, MaskComposite, FeatherMask, MaskToImage, ImageBlur
edit          Qwen Image Edit 2511 INT8 + 4-step Lightning LoRA
relight       IC-Light foreground and foreground/background
```

Cost: about 58 seconds for one 1280x800 SDXL frame at 28 steps. 1280x800 is
exactly the 1.6 ratio of the 1440x900 target and upscales at a clean 1.125.

## The finding that governs how generation is used

A capability probe on 2026-08-18 asked for "colossal dark graphite masses,
bone-white light along contact seams, aerial perspective, near-black
monochrome". The grade came back exactly right: real highlights, deep shadow
detail, fine grain, no colour cast, genuine scale.

**It came back as a photograph of a mountain range.** Snow on the ridgelines.

That is the whole lesson. A diffusion model resolves any description to the
nearest photographic category it knows. "Graphite mass with light on contact
seams" has a nearest neighbour, and it is aerial mountain photography. None of
H1, H2 or H3 has a nearest neighbour, because each is defined by what it must
not resemble — and a negative prompt cannot create a category that does not
exist.

So:

```text
THE GRADE          may be requested in words          the model is good at it
THE COMPOSITION    must be imposed with ControlNet    words will not hold it
```

Massing is authored as a depth guide with `SolidMask` and `MaskComposite`,
blurred to read as distance, and driven through union ControlNet at type
`depth`. The frameboard defines the massing before any pixel is generated. This
is the kit's "use depth, edge, normal, or composition references" requirement,
and it is not optional here — it is the only reason the output is a Dark Lattice
frame rather than a stock landscape.

Never six unrelated text-to-image frames. One frame at a time, each approved
frame becoming the reference for the next, the prompt stating only what changed.

### The second finding: exposure oscillates without a photographic anchor

Four probes on H1-A, 2026-08-18, all with the same validated depth guide:

```text
cn 0.82  end 0.85  cfg 4.5   flat grey slabs, the depth map re-rendered, dead
cn 0.50  end 0.55  cfg 4.5   composition dissolved into mid-grey fog
cn 0.70  end 0.70  cfg 7.0   almost entirely black, nothing readable
cn 0.70  end 0.75  cfg 5.5   near-white paper with thin dark strokes
```

Two things are separately proven and have not yet been achieved together:

- **Composition control works.** Probe 1 obeyed the authored massing exactly —
  terraces, lane, lower masses, and a clean text-safe void.
- **The grade is achievable.** The unguided smoke test produced genuine material,
  real highlights, deep shadow detail and correct monochrome.

The diagnosis is that an abstract depth guide gives the model no photographic
category to anchor exposure to. Unanchored, exposure is decided entirely by
prompt token weight, so it swings between underexposure and blowout instead of
converging. Note that ControlNet depth also conflates *near* with *bright*: a
white near-mass in the guide reads as a lit mass.

**Do not answer this by tuning strength, CFG or the negative prompt again.** That
is the same frame with new numbers, and it is the behaviour `CLAUDE.md` forbids
in response to a dead frame.

### The anchor was tried, and it failed. Two more probes:

```text
img2img over a macro graphite plate,  denoise 0.72   high-frequency TV static
img2img over the scale-matched smoke, denoise 0.68   dendritic white filaments
```

The macro plate anchored the wrong *scale*: a close-up of grain cannot seed a
kilometre-scale composition, and the model amplified the grain frequency into a
repeating pattern. The scale-matched base was worse — it amplified the mountain
ridgelines into branching strands, which review names as **hair**, a kill word.
An img2img base does not get replaced; it gets amplified.

**Conclusion, six probes: SDXL plus ControlNet-depth is the wrong instrument for
these three frames.** The model is a category machine. It produces excellent
images when it has a photographic category to anchor to, and garbage when forced
onto a massing it has no category for. H1, H2 and H3 are each *defined* by not
being any known category, so there is nothing to anchor to. No further tuning of
strength, CFG, denoise or negative prompt is legitimate.

What remains, in order of cost:

1. **Lit grey-box, then a low-denoise pass.** `tools/guide.mjs` already computes
   the massing. Give it simple directional shading and contact darkening so it
   outputs a *lit image* rather than a flat depth map, then run diffusion at
   denoise 0.25 to 0.35 purely to add material and grain. At that denoise the
   authored value structure survives and the model only dresses it. Needs no
   Blender and no new dependency.
2. **Qwen Image Edit 2511**, already installed. A different architecture that
   restructures rather than generating from scratch; it may not share the
   category failure.
3. **Grey-box in Blender**, which is the standard professional route and is
   currently closed by instruction.

Route 1 is the recommendation. It is also the honest reading of IMAGE FIRST: the
composition becomes a real image before generation touches it, rather than being
described to a model that has no idea what it is.

### Resolved: it was the model. Use Krea 2, not SDXL.

Nine further SDXL renders on plain text to image — no ControlNet, no img2img,
prompts built from photographic and cinematic references — all collapsed to a
material sample photographed at arm's length: concrete rubble, coral crust, a
paper box, cracked mud. No scale, no void, no depth, on any of them.

RealVisXL is tuned for subjects at human distance and substitutes texture when
asked for vast dark space. **Krea 2, already on disk, produced genuine monumental
scale on the first attempt**, at 1280x800 in 60 to 90 seconds.

Wiring, read out of the ComfyUI source rather than guessed, and working:

```text
UNETLoader   krea2_turbo_int8_convrot.safetensors   weight_dtype default
CLIPLoader   qwen3vl_4b_fp8_scaled.safetensors      type "krea2"
VAELoader    qwen_image_vae.safetensors             Wan21 latent, 16 channels
latent       EmptySD3LatentImage
sampler      euler / simple, steps 8, cfg 1.0       turbo model, shift 1.15 auto
```

`tools/comfy-krea.mjs`. Note the CLIPLoader `type` list has 28 entries; `krea2`
is near the end and is easy to miss if the list is truncated when inspecting.

Do not go back to SDXL for Dark Lattice openings.

## Figma MCP

Connected as `plugin:marketing:figma`, **not yet authorised**. Authorise from
claude.ai connector settings or `/mcp` in an interactive terminal; it cannot be
done from a non-interactive session.

Its job is the curated ledger and the editable frameboards: annotation, side by
side comparison, continuity across frames, text-safe zones, mobile
recomposition, and later capturing the running localhost back for diffing
against an approved board.

It does not generate the opening image and it does not decide the direction.

## Playwright

Already present, `playwright@^1.62.1`, driving thirteen scripts in `tools/`.
Headed Chrome on the real card, always — headless SwiftShader has already hidden
a `pow(0, y)` NaN that rendered the hero black on Jacob's GPU.

Not used during art direction. There is nothing in a browser to capture yet.

## Closed until the journey is approved

Blender, `@gltf-transform/cli`, the glTF Validator, Chrome DevTools MCP,
Spector.js, `@axe-core/playwright`, Theatre.js, and `frontend-design` as a
decision-maker. Each has a real job at a later gate and none of them has one
now.

Rejected outright: designer mega-packs, a second browser MCP, global hook
managers, Wix, Lovable, Base44, Spline as the experience, prebuilt WebGL hero
templates.

Before installing anything, read its `peerDependencies`. A dev-tool install can
pull React into the tree and report success.
