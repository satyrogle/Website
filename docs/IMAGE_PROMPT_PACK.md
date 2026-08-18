# OPENING FRAME — IMAGE PROMPT PACK

**Purpose:** Jacob generates images, picks the one he actually wants to look at,
and THAT becomes the direction. Premise is chosen from pictures, not prose.
**Scope:** the OPENING frame only. If the opening lands, everything follows from
it. Do not generate the other five frames yet.
**Status:** The Congregation is NOT locked. It is one of six candidates here.

---

## HOW TO USE THIS

Generate 4 to 8 variations of each premise. Aspect **16:9**. Judge fast and
brutally: you are looking for the one image you would put on a monitor and stare
at, nothing else.

**Judge these three things only:**

1. **Composition** — where the mass sits, where the void sits, whether there is
   room for type on the left or lower left.
2. **Value** — is it dark in mood while still being properly exposed? Compare
   side by side with `captures\reference\igloo.png`.
3. **Scale** — does it feel enormous, or does it feel like an object photographed
   on a table?

**Ignore completely:** fine detail, texture accuracy, anything that looks
impossible to build. We are choosing a picture to aim at, not a spec.

---

## THE SHARED LANGUAGE

Every prompt below already contains this. It is written out here so you can
adjust it once and apply it everywhere.

**Grade:** near-black, deep charcoal, bone white, monochrome, no colour cast,
extreme dynamic range, deep shadow detail, bright specular highlights, shot on
large format, long exposure, ultra fine grain.

**Light:** volumetric atmosphere, light scattering through haze, aerial
perspective, god rays only where physically motivated, subsurface glow,
luminance falling off with distance.

**Scale:** vast, kilometres deep, cropped by frame edges, no visible boundary,
human-scale reference absent, cathedral of scale without cathedral imagery.

**Negative in every prompt:** `--no text, watermark, logo, people, creature,
face, orb, sphere, planet, eclipse, portal, ring, halo, tunnel ribs, chandelier,
lanterns, string lights, fairy lights, candles, altar, votive, glassmorphism,
neon, cyberpunk, purple, teal, rainbow, sci-fi HUD, spaceship, nebula clichés,
lens flare, bokeh hearts, vignette, cartoon, illustration, concept art`

---

## PREMISE 1 — THE FUNNEL  *(your note, and my pick to try first)*

Everything converges downward onto one axis. This is the premise that fixes the
incoherence you saw: one geometry that every element obeys.

> Vast dark chamber seen from above, thousands of tiny bone-white light sources
> suspended in slowly converging layers, the whole field narrowing downward into
> an unlit depth far below, concentric convergence without any visible ring or
> wall, luminous haze between the layers, near-black, monochrome, extreme scale,
> aerial perspective, long exposure, large format photography, deep shadow
> detail with bright specular points

Variations to try: shallow funnel versus steep; the convergence point off-centre;
the near layers cropped by the top edge.

## PREMISE 2 — THE SHAFT

Looking straight down something impossibly deep, light arriving from far below
rather than above. Strong tunnel sensation with no tunnel object.

> Looking directly down an immense vertical void, faint bone-white luminosity
> rising from unimaginable depth, layered strata of suspended light receding
> downward, walls implied but never visible, volumetric haze, near-black
> monochrome, vertigo, kilometres deep, long exposure, large format, fine grain

## PREMISE 3 — THE CANOPY

We are beneath something enormous that fills the sky. Light comes through gaps.

> Standing beneath a colossal dark structure that fills the entire sky,
> bone-white light penetrating through irregular gaps in its underside,
> shafts of scattered light in heavy atmosphere, the structure itself unlit and
> unreadable, overwhelming scale, near-black monochrome, deep shadow, large
> format photography, aerial perspective

## PREMISE 4 — THE CONGREGATION  *(the current written direction)*

> Enormous vertical field of thousands of small bone-white suspended light
> sources arranged in irregular horizontal strata, deep void between the bands,
> luminous haze, each source tiny and precise, the field cropped by the top and
> side edges, near-black monochrome, immense depth, long exposure, large format,
> no visible support structure

If this one does not beat the others as a picture, we drop it. That is the
entire point of doing this.

## PREMISE 5 — THE TERRACES

Descending levels of luminous structure, like an excavation made of light.

> Colossal descending terraces of luminous bone-white structure cut into
> darkness, level below level receding into depth, each terrace edge catching
> light, the pit floor invisible, industrial not natural, volumetric haze,
> near-black monochrome, extreme scale, large format, deep shadow detail

## PREMISE 6 — THE SUSPENSION

Your Still Sea, which you liked poetically. Included so it gets tested as a
picture rather than as prose.

> Endless still luminous plane seen from just above, pale sourceless glow,
> absolutely no ripple, black void above with no stars, infinite horizon,
> minute pale fragments suspended just beneath the surface, near-black
> monochrome, long exposure, immense calm, large format photography

---

## WHAT TO BRING BACK

Save every keeper into `references\chosen\` and tell me which one wins. Then, in
order:

1. I write the frame board **from your approved image**, not from imagination.
2. We work out how to build that specific picture in Three.js, which is a
   matching problem rather than an inventing problem.
3. Only then do frames 2 to 6 get generated, in the winner's visual world, by
   the chaining method at the end of this file.

## THE ONE THING THAT WOULD WASTE THIS

Picking an image because it is impressive rather than because it is **Dark
Lattice**. The test: could this image be the opening of a crypto protocol, an AI
lab or a VFX studio? If yes, it fails, however beautiful it is. That is exactly
how Black Sun died.

---

# FRAMES 2 TO 6 — THE CHAINING METHOD

**Locked until the opening is approved** and recorded in
`docs/APPROVED_VISUAL_JOURNEY.md`. Do not start early. Everything below assumes
one image already exists that Jacob wants to look at.

## The rule

**Every frame is generated from the approved image before it, used as an image
reference. Never from text alone.**

The prompt for frame N+1 describes **only what changed**. It does not re-describe
the world, the grade, the light or the scale — those arrive in the reference
image, and restating them in words invites the generator to reinvent them.

Six independent prompts produce six unrelated ideas that happen to share a mood.
That is the failure this method exists to prevent, and it is the same failure as
choosing a premise from prose: the words agree, the pictures do not.

## The order, and the delta at each step

| From | To | The only thing the prompt states |
|---|---|---|
| 1 Opening | 2 Approach | Camera nearer. Detail resolves that was a single mark before. Nothing new enters the world. |
| 2 Approach | 3 Descent | We are inside what we were looking at. Mass to either side, unlit lane between. Depth, occlusion and scale carry it — **no tunnel object.** |
| 3 Descent | 4 Discrepancy | Closest range, highest local contrast. One thing is subtly wrong: growth reads as collapse, the pristine light comes from damage. Never horror, never a creature. |
| 4 Discrepancy | 5 Reveal | The recontextualisation. Expect this to be the **darkest** frame — the reveal works by understanding what was already in shot, not by lighting something new. Nothing is introduced that was absent from frames 1 to 4. |
| **1 Opening** | 6 Return | **Chain frame 6 from frame 1, not from frame 5.** It is the opening image again, with at most one visible change. Chaining it off the reveal makes it a seventh idea instead of a return. |

## Sign each one before starting the next

Generate 4 to 8 variations of a single frame. Jacob picks or kills. A killed
frame does not advance — regenerate that frame, do not proceed and hope the next
one fixes it. Drift compounds: a frame chained off an unapproved frame carries
the error into every frame after it.

Record each approval in the table in `docs/APPROVED_VISUAL_JOURNEY.md` as it
happens, by filename.

## The continuity check, run on every new frame

Put the new frame beside frame 1 and answer:

1. **Same world?** Could a camera physically travel from one to the other
   without cutting?
2. **Same material?** Is the stuff made of the same stuff, lit the same way?
3. **Same grade?** Black point, highlight peak and grain consistent — no frame
   suddenly brighter or contrastier because the generator drifted.
4. **Same scale law?** Does the sense of size still come from the same cue it
   came from in frame 1?
5. **Did anything new arrive?** A new element that was not implied by frame 1 is
   a new idea, not a continuation. Remove it.

If a frame fails the check, **step back one frame and re-chain from there.** Do
not reprompt from scratch and do not fix it by describing the world again in
words. That is the text-first failure returning through the side door.

## What still is not decided by an approved set of six

Mobile recomposition, which needs at minimum Opening, Descent and Reveal
composed for portrait, and is a separate approval. Motion and pacing, which are
not tested by stills. And the build technology, which is chosen last, from the
frames, per `CLAUDE.md`.

Generated frames are **targets, not production assets.** Before any of them is
treated as a source, check consistency, impossible geometry, resolution,
whether it can plausibly be animated, and whether it recomposes to portrait at
all.
