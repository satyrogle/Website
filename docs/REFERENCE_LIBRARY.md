# DARK LATTICE REFERENCE LIBRARY

**Status:** Research. Nothing here is a decision.
**Method:** Every site loaded in headed Chrome on the RTX 3060 and measured, not
recalled. Screenshots in `captures/reference/`. Raw data in
`captures/reference/calibration.json`.
**Rule:** We extract technique and budget. Never code, never assets. A reference
calibrates the target; `DARK_LATTICE_WEB_DESIGN_CONSTITUTION.md` still decides
the design.

---

# 1. THE FINDING THAT MATTERS

Jacob's six-site board shares an intent:

```
ENTER → TRAVEL → ENCOUNTER INFORMATION → WORLD TRANSFORMS
      → TRAVEL DEEPER → NEW INFORMATION → UNDERSTAND THE WHOLE
```

But the six do not implement it one way. They use **three different
architectures**, and only one of them is the tunnel instinct.

## Architecture A — the virtual-scroll baked journey
**Igloo, Hennessy House of Moves**

There is no document scroll. Body height equals viewport height. Wheel events
drive a value, and that value indexes an animation **baked into a texture**
(Igloo ships `scroll-datatexture.ktx2`, 1.25 MB, its single largest asset).
Rendering happens on an OffscreenCanvas in a worker, which is why
`document.querySelectorAll('canvas')` returns zero on both.

The consequence is the important part: **the site is a film you scrub.** Pacing
is authored frame by frame rather than emerging from scroll distance. That is
exactly why it feels cinematic and why it cannot be achieved with ScrollTrigger
over a tall page.

Budget: Igloo 15.3 MB, House of Moves 9.6 MB.

## Architecture B — free navigation in a world
**Gen-02 / samsy.ninja**

Arrow keys and space. You drive a character through a dark arcade space and go
to content. Running **WebGPU** at 120 FPS, 3.1 ms frames. It offers a SKIP
control immediately, which tells you the author knew not everyone will play.

Thrilling, and the least appropriate for us: an endorsement assessor or a press
contact will not learn to drive.

## Architecture C — long scroll documentary
**Sculpting Harmony, OceanX, and mostly Immersive Garden**

Native scroll, canvas as backdrop, enormous display type carrying the argument.
Sculpting Harmony runs **55.1 viewports and 310 MB** with 2,523 DOM nodes and
ScrollTrigger. OceanX runs 8.9 viewports and 14.3 MB.

Safest, most accessible, and closest to what we would have built anyway. It is
also the only one of the three where the content genuinely leads.

## The trap nobody mentions

**Igloo and House of Moves have 27 and 19 DOM nodes.** Igloo renders its type as
MSDF inside WebGL from `IBMPlexMono-Medium-datatexture.ktx2`. Its `innerText` is
empty. These sites have effectively **no accessible content at all**.

Brief section 17 and constitution section 11 both require key copy and
navigation in the DOM, full keyboard navigation, and a reduced-motion route. So
we cannot copy Architecture A wholesale. We would need the authored journey
**and** a real accessible document, which is harder than what either of them
shipped. That is a genuine constraint, and it should be designed in from the
first line rather than discovered at the end.

---

# 2. THE LIBRARY

## MUST STUDY

### Igloo — igloo.inc
Site of the Year 2025. Photoreal ice dome on a light grey snowfield.

**Measured.** 15.3 MB. ~40 KTX2 texture maps. `cube1/2/3_normal` and
`_roughness` prove realtime PBR. `cubes_env.exr` is HDRI image-based lighting.
`advect.png` plus `clouds_noise.ktx2` is a GPU fluid advection pass, so the
atmosphere is a running simulation rather than a fog shader. `ground_glow`
carries the emissive seams. 18 audio files including `music-highq.ogg`.
Background `rgb(160,165,177)`, which is **light, not dark**.

**Steal.** The material and light stack, entirely: PBR maps plus HDRI plus
volumetric atmosphere plus KTX2 compression. This is the specific reason it
looks expensive and our Gate B frames did not. Also steal the asset budget
discipline: 15 MB buys all of it.

**Slop if copied.** The named, literal, centred subject. Igloo can name its
object because the company is called Igloo. Ours cannot be a Dark Lattice-shaped
thing in the middle of the screen. Also do not copy the empty DOM.

### Sculpting Harmony — gehry.getty.edu
A digital exhibition on Frank Gehry and the Walt Disney Concert Hall.

**Measured.** 310 MB, 55.1 viewports, 2,523 DOM nodes, two full-viewport
canvases, ScrollTrigger, Reckless as the editorial serif. Vivid orange ground
with enormous black condensed display type.

**Steal.** Proof that **serious, dense, genuinely informative content survives
inside an immersive experience**, which is the hardest thing on our list. Also
the type confidence: display type at a scale that would terrify most designers,
used as structure rather than decoration.

**Slop if copied.** The palette and the 310 MB. Also: 55 viewports only works
when you have a museum's worth of real content. We do not, yet.

### Gen-02 — samsy.ninja
Developer Award, October 2025.

**Measured.** WebGPU, 120 FPS, 3.1 ms frames. Near-black with saturated red.
Arrow-key and space navigation with an immediate SKIP.

**Steal.** The **skip affordance offered before the experience starts**, which
is the honest solution to "no forced intro" in brief section 17. And the
evidence that WebGPU at 120 FPS is now shippable, plus the TSL path to author
once for both backends.

**Slop if copied.** Driving a character. Neon red on black is stock cyberpunk
and constitution 4.29 bans it outright.

## USEFUL MECHANIC

### Hennessy House of Moves
**Measured.** 9.6 MB, 19 DOM nodes, Vue plus GSAP plus WebGL, worker canvas,
virtual scroll, sound.

**Steal.** The clearest example of one world containing distinct content spaces,
at a third of Igloo's byte cost. Worth studying purely for how few assets it
takes to make a place feel like a place.

**Slop if copied.** 19 DOM nodes. Same accessibility failure as Igloo.

### OceanX — oceanx.org
**Measured.** 14.3 MB, 8.9 viewports, three canvases, `zeist` variable font at
weight 710, conventional top navigation, deep blue-black photographic hero.

**Steal.** The proof that a **journey can coexist with an ordinary navigation
bar**. It is the only site on the board where a visitor can jump straight to
what they came for. That is brief section 4's "reach real project information
without completing an intro sequence", solved.

**Slop if copied.** The hero is a photograph with a headline on it. We do not
have photography, and staged imagery would be fabricated evidence.

### Immersive Garden — immersive-g.com
Agency of the Year 2025.

**Measured.** 21.2 MB. Background `rgb(232,232,232)`, so **light**. Eight
canvases: one full-viewport plus several 30x30, which are per-element effects
rather than one hero. PSTimes serif for display against Helvetica Neue body.

**Steal.** Transitions between distinct spaces, and the many-small-canvases
technique. Also the serif-display against neutral-body pairing, which is a
harder and better move than one grotesk doing everything.

**Slop if copied.** It is a studio showreel. Its content is its own work, which
is a much easier content problem than explaining a company.

## VISUAL ONLY

### Montfort — mont-fort.com
**Measured.** Josefin Sans 62px at weight 300 with **19.84px tracking**, Century
Gothic body, 19.6 viewports, 20.3 MB, pale photographic.

**Steal.** The tracking and weight discipline. A 300-weight display at that
tracking is confident in a way our Bahnschrift 700 was not.

**Slop if copied.** Luxury-commodity minimalism. Brand-swappable, which is
constitution section 15's first automatic failure.

### Prometheus Fuels — prometheusfuels.ai
**Measured.** `rgb(11,11,11)`, 11.7 MB, Roboto, aerial photograph with a
gradient overlay.

**Steal.** Almost nothing. Included as a control: this is what "dark and
competent" looks like without craft.

**Slop if copied.** Rounded corners, gradient overlay on photography, red pill
button, and the headline "redefining the future of energy" which trips
constitution 10.1 twice in five words.

## AVOID

### Star Atlas — staratlas.com
**Measured.** 87.1 MB. Glassmorphic email-capture modal over a cyan HUD on a
planet limb.

**Avoid entirely.** Constitution 4.8 glassmorphism, 4.29 neon, 4.22 the planet.
87 MB for a marketing page. Useful only as proof that a large budget and a
game licence do not produce craft.

---

# 3. WHAT THIS MEANS FOR DARK LATTICE

1. **The quality gap was never conceptual.** It is PBR materials, HDRI lighting,
   volumetric atmosphere and compressed textures. We shipped additive line
   drawings against lit, textured, simulated worlds. That is why every carrier
   got named as a thin mark: hair, dust, spatter, scan lines.
2. **Blender is mandatory** for Architecture A or anything Igloo-like. Baked
   colour maps and exploded variants come from an authored scene.
3. **Darkness is working against us.** Three of the strongest references are
   light. Black hides material, and material is the entire source of the quality
   Jacob is asking for. Staying brutally dark means needing *more* material
   fidelity than these sites, not less.
4. **A nameable subject is not fatal.** Site of the Year is a literal igloo.
   Thirteen carriers died on a rule the evidence does not support.
5. **Our stack is already correct.** Three.js plus GSAP as orchestration is
   exactly what is winning. No framework change. WebGPU with TSL is the upgrade
   path, not a rewrite.
6. **The hard problem is accessibility inside a journey.** Nobody on this board
   solved it except the Architecture C sites. If we take the tunnel, we have to
   solve it ourselves.

---

# 4. NOT YET DONE

This library covers ten sites, all measured. Extending to twenty or thirty means
a filtered crawl of the Awwwards 3D, WebGL, navigation, scrolling and
storytelling collections, screening for: spatial traversal, tunnel or passage or
depth, camera as navigation, content embedded in a world, transitions between
spaces, very dark art direction, technically unusual WebGL, award-level
typography. Screening out: generic luxury, crypto orbs, and one 3D object in the
centre.
