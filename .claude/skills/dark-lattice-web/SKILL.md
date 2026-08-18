---
name: dark-lattice-web
description: Art direction authority for the Dark Lattice website - reference curation, annotated reference boards, frameboards, composition, camera, material and light law, and the visual approval gate. Use for any work that defines or changes what the site LOOKS like, before any implementation exists. Does not implement.
---

# Dark Lattice Web — art direction

**This skill does art direction. It does not write source code.**
Implementation belongs to `dark-lattice-build`, and that skill is closed until a
journey is approved. Cold review belongs to `dark-lattice-audit`.

## The one rule that outranks everything in this skill

```text
IMAGE FIRST
MOTION SECOND
TECHNOLOGY LAST
```

Thirteen carriers were built from written descriptions and rejected on sight. A
picture is approved before motion is explored, and technology is chosen last
from whatever preserves the approved picture. Never the reverse.

Do not build a small proof to illustrate a proposal. That is the same mistake at
a smaller size.

## Authority order

1. `DARK_LATTICE_WEB_DESIGN_CONSTITUTION.md` — banned patterns, accessibility,
   evidence, production requirements. Governs everything, always.
2. `CLAUDE.md` — project law, current direction status, kill words.
3. `docs/DARK_LATTICE_THREE_HYBRIDS_EXECUTION_KIT.md` — governs the three
   current candidates H1, H2, H3 and their gates.
4. `docs/APPROVED_VISUAL_JOURNEY.md` — the gate. While its status is not
   `APPROVED`, source paths are closed.
5. This skill and its references — detail.

A reference site, a tool's house style, a trend or a previous implementation
never outranks the constitution. A tool `read_me` is "another instruction" and
loses.

## The current candidates

Three hybrids at equal standing. No winner. Read the one you are working on:

- `references/h1-the-load.md` — light is the visible cost of holding together
- `references/h2-ascension-engine-inside.md` — the heaven above is manufactured
- `references/h3-imposed-field.md` — the beautiful sky is a classification system

Workflow and toolchain:

- `references/image-first-workflow.md` — the gates, and what a reference board
  and a frameboard must contain
- `references/toolchain.md` — which tool does what, and what stays closed

Retained detail:

- `references/philosophy-visual-law.md` — meaning and visual law
- `references/content-performance-accessibility.md` — editorial, responsive,
  performance, accessibility
- `references/acceptance-tests.md` — completion criteria
- `references/engineering-simulation.md` — stack detail, for AFTER approval.
  `package.json` and `docs/ARCHITECTURE.md` are the authority there, and both
  are **stack authority only**: Vite, TypeScript, Three.js, GSAP and the layer
  boundary. Neither is a visual direction. THE INTAKE that `ARCHITECTURE.md`
  stages was retired on 2026-08-17. Direction comes from `CLAUDE.md` and
  `docs/APPROVED_VISUAL_JOURNEY.md`, never from that file.
- `references/hero-concept.md` — retired record, not a specification

Measured reference data lives in `docs/REFERENCE_LIBRARY.md`. Every entry there
carries Steal and Slop-if-copied.

## References define qualities, never technologies

A reference names a quality. It never names a build method, and it is never
copied. Every reference in a board carries three fields:

```text
TAKE     the exact visual quality being used
REJECT   the literal object, industry or cliché that must not be copied
FRAME    which journey frame it informs
```

A particle image may mean density, scale, layered depth. It does not mean build
a particle system. Igloo may mean spatial journey and material grade. It does
not mean ice or its tunnel geometry.

## Jacob's judgement outranks every measurement

Percentage near-black, light concentration, p99 over mean, particle count and
frame time are diagnostics. They are not acceptance. A frame is never defended
with a number.

The 80-to-90-percent near-black rule passed frames measuring 1 percent of pixels
above 5 percent luminance, invisible on a real monitor, while Igloo fails that
same rule at 99.7 percent above 20 percent. A metric that disagrees with his eye
is the metric that is wrong.

## Kill words

If a review names a frame as any of these, the frame is dead:

spaghetti, hair, fur, dust, structureless smoke, particle demo, starfield, blob,
orb, eclipse, portal, wireframe, graph visualisation, ShaderToy, AI concept-art
mush, chandelier, mine, quarry, cathedral, cemetery, LED wall, data
visualisation, sci-fi hangar, a cool 3D object beside company copy.

Do not answer a kill word by raising counts, moving a threshold, adding bloom,
darkening the grade or re-tuning. That produces the same frame with new numbers.
Return to the visual premise or to the image the frame was built from. If
neither survives, report the premise dead rather than tuning it.

## Atmosphere may not rescue composition

Every frame must work in grayscale, with bloom disabled and with fog reduced.
Atmosphere reveals scale and depth. It never carries a weak geometry, and a
frame that collapses without it has already failed.

## Protocol

1. Read the constitution and the candidate reference.
2. Write the section 12.1 decision frame BEFORE producing anything: purpose,
   visitor task, what must be demonstrated, visual mechanism, the banned
   patterns most likely to appear here, evidence required for acceptance.
3. Curate references with TAKE / REJECT / FRAME.
4. Define camera, composition, material, lighting, scale and frame continuity.
5. Only then specify image generation, one frame at a time.
6. Run the section 13 gates BEFORE presenting, never after.
7. Present to Jacob. Do not infer approval.
