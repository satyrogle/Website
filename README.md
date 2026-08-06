# Dark Lattice — premium cinematic WebGL studio website

A single continuous 3D world that the DOM narrative travels through. One
persistent lattice object, one Gray–Scott reaction–diffusion field, and a
scroll-directed camera that carries the studio's argument from cold open
to evidence boundary.

Static output. `dist/` uploads to ordinary hosting, including GoDaddy
cPanel. See [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Commands

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`build` runs `tsc --noEmit` first, so a type error fails the build rather
than shipping.

```bash
npm run preview
```

---

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 6, TypeScript (strict) |
| 3D | Three.js, hand-written GLSL ES 3.00 |
| Motion | GSAP + ScrollTrigger. Native scrolling — no smooth-scroll layer |
| Styling | Plain CSS with custom properties |

No React. This is one continuous scene with one camera; a component tree
would sit between the scroll director and the uniforms it needs to drive
without earning its place.

---

## Structure

```
public/
  fallback/hero-poster.svg     composed still — GENERATED, see tools/poster.mjs
  social/og-dark-lattice.jpg   generated from the live hero, not drawn separately
  favicon.svg
src/
  main.ts                      boot sequence and loader hand-off
  styles/                      tokens, global, typography, sections
  scene/
    SceneController.ts         renderer, frame loop, the narrative surface
    LatticeModel.ts            procedural brand object
    ReactionField.ts           Gray–Scott simulation, ping-ponged
    CameraRig.ts               keyframed path + idle drift + parallax
    Lighting.ts                the lighting arc across the seven movements
    PostPipeline.ts            bright pass + composite
    QualityManager.ts          device tiering and runtime demotion
  shaders/                     reaction, seed, lattice, ring, bloom, composite
  motion/
    ScrollDirector.ts          document scroll → narrative timeline
    TextReveals.ts             masked headline choreography
    MotionPreferences.ts       reduced-motion source of truth
  content/
    evidence.ts                every factual claim, with sources
    verify.ts                  dev-only integrity check against the DOM
  accessibility/
    AccessibilityController.ts layer tablist, magnetic controls, print
tools/                         QA harness and capture scripts
index.html                     the entire narrative, static
404.html
```

---

## The object — THE CROWNED CONVERGENCE

The entity is **authored in Blender and shipped as a GLB**, not generated
procedurally at runtime. `public/models/DL_CrownedConvergence_Production_v01.glb`,
5,400 triangles across 20 meshes, 470 KB.

Seven exterior masses, each an explicit 3D vertex layout — a front loop
and a back loop of hand-written coordinates, lofted. There is no radial
formula anywhere in the exterior. Four earlier versions established why:
any set of pieces derived from one radial parameterisation reads as a
wreath, because the formula itself is the rotational rhythm the eye
picks up, and reshaping the pieces never addresses that.

Arranged by depth rather than angle — three foreground masses that
conceal the convergence, two middle-depth, two rear structural.

**One entity at three scales.** The crown is the containment structure,
the corridor is its internal anatomy, and the Latent Form is the system
at its origin. There is no second world, no portal scene and no
duplicate crown at the far end.

### Metadata travels with the asset

The runtime resolves parts by name, but everything else — stage window,
reaction weight, reaction projection mode, yield vector, ring spin —
arrives as glTF `extras` written by `tools/blender/build_production_asset.py`.
Restaging a part or adding a mass is an asset change, not a TypeScript
change, which is the only way the two stay in step across revisions.

One caveat worth knowing: the glTF exporter splits any object with two
or more material slots into separate primitives whose `userData` is
empty — the extras stay on the parent node. `CrownedConvergenceModel`
resolves extras up the ancestor chain for exactly that reason.

### Coordinates

The export runs with `export_yup`, which already maps Blender
`(x, y, z)` → glTF `(x, z, −y)`. "Up" is +Y and "into the entity" is −Z,
which is the site's world space. **Do not rotate the group at runtime** —
doing so double-transforms everything and the entity culls itself out of
frame.

Measured world extents the camera rail is authored against:

```text
crown         z  +1.09 .. -2.24, half-height 2.75
rings A/B/C   z  -0.56 .. -1.80
tunnel shell  z  -1.85 .. -7.80, bore radius ~1.4
chamber       z  -7.55 .. -11.10
Latent Form   z -11.22 .. -10.28
```

### Visibility staging

Parts are switched, never crossfaded. The stage windows in the asset are
a coarse gate; the precise cut is a **behind-camera cull** — a part
matters until the camera has passed it, which is the geometric answer
rather than a guessed number. Switching there is invisible, which is why
the directive asks for occlusion switches over transparent fades.

### Material identity

Seven classes — `MAT_CROWN_PRIMARY`, `MAT_CROWN_SECONDARY`,
`MAT_STRUCTURE`, `MAT_RING`, `MAT_CORE`, `MAT_LATENT`, `MAT_HALO` —
served by ONE shader. What differs is uniforms, not code paths.

The object stays predominantly black and the reaction field earns
brightness rather than being painted on. Pattern is thresholded per
class, not multiplied across every face, so `MAT_STRUCTURE` stays
near-black by construction — that is what creates depth between the
classes. Each class also carries its own key gain, because a single key
intensity let the threshold chamber out-brighten the Latent Form
standing in front of it.

Locked palette:

```text
Void #010204   Structure #020406   Raised black #081016
Teal #36E0B0   Cyan #4DD0FF        Cold white #DFF9FF
Magenta #FF2B9A                    Amber #C9A24A
```

The rule that keeps it honest: **cyan/teal is the baseline active
system, magenta means active response or retained consequence, amber
belongs to the halo and rare accumulated traces.** Magenta is never
decoration.

### One persistent reaction field

The Gray–Scott simulation is never reseeded. Crown and Latent Form
sample it by planar object-space projection normalised against the
authored exterior bounds; rings and tunnel sample the SAME texture by
cylindrical coordinates around the travel axis with a depth phase
offset. There is no second simulation.

Retained consequence only ever rises, so the magenta at the seam is the
accumulation of the whole descent — which is the point of a field that
survives the journey.

## The field

A Gray–Scott reaction–diffusion simulation in a ping-ponged pair of
half-float targets, stepped 4–8 times per frame depending on tier.

**It is seeded exactly once.** Nothing in the scroll choreography may
clear or reseed it — the field a visitor disturbs in the hero is the same
field still carrying those marks in the footer. That is enforced in
`ReactionField`, not left to convention, because persistence is the
site's whole thesis.

The three game states are the *same* system under different feed/kill
rates, eased between rather than cut:

| State | Regime | Reads as |
|---|---|---|
| Desk42 | spots | discrete cells that retain prior disturbances |
| Brawler | worms | aggressive propagation, contamination |
| Roguelite | between the two | the prior states combined |

Every preset sits in a *pattern-forming* region of the parameter space.
Values with a low kill rate relative to feed drive the field solid, which
lights the whole object and destroys the near-black material read.

The field is projected through the object in **object-space XY**, so
every node and strut samples one shared field. Channels line up across
physically separate pieces, which is what makes the foundation layers
look like they have common ancestry when they pull apart.

The field's feed rate is biased by a soft image of the lattice
(`latticeBias` in `reaction.frag.glsl`), so channels prefer to run along
struts rather than through empty space. **Its constants are derived from
the geometry** — envelope extents, cell spacing, ring radius — and are
duplicated in the shader. If `LatticeModel` and those shaders drift
apart, the chemistry concentrates in the voids and the object grows
bright clumps where there is no structure. Both files carry a comment
saying so.

### Warm-up

Gray–Scott needs thousands of iterations before it looks like anything.
`SceneController.warmUpField()` runs the simulation forward during load
so the hero lands developed instead of visibly filling in over the first
fifteen seconds — the brief's "first three seconds" requirement is
decided there, not in the shader.

It is **time-boxed, not a fixed step count**. A discrete GPU reaches the
target in a couple of hundred milliseconds; a software renderer would
take tens of seconds for the same work. Slow devices get a less developed
field and a page that still loads promptly, and the simulation keeps
growing once the loop starts. This is also the work the loader bar is
actually measuring.

---

## Motion architecture

Document scroll does not drive the camera directly. Each movement owns a
fixed band of narrative progress:

```
hero 0.00–0.10   premise 0.10–0.26   desk42 0.26–0.40   brawler 0.40–0.50
roguelite 0.50–0.60   foundation 0.60–0.71   accumulation 0.71–0.82
evidence 0.82–0.93   resolution 0.93–1.00
```

### No smooth scroll, and a spring on the camera

There is deliberately no Lenis layer. An earlier build ran it at 0.85s
and it was the single thing that made the site feel wrong: the page
lagged behind the wheel, so the camera — driven by scroll position —
lagged too, and the causal link between input and movement broke.
Native scrolling keeps that link honest.

On top of native scroll, camera progress follows the scroll through a
**critically damped spring** (`CameraRig.update`). First-order smoothing
keeps position continuous but lets velocity jump — every section
boundary kicked the camera, which read as bad scrolling. The
second-order spring keeps velocity continuous too: speed changes arrive
as gradients, never steps, while settling in a fraction of a second.
Idle drift and pointer parallax are kept small enough that they never
compete with travel.

`CameraRig`, `Lighting` and `ScrollDirector` are all authored against
this one timeline. A section can be 700px or 2400px tall on a given
viewport and the choreography still lands exactly as staged. Driving the
camera from raw document progress would re-time the whole sequence every
time copy or viewport height changed.

All measurement is cached and refreshed on resize; the scroll handler
performs no layout reads.

### Reveals hand off to CSS

Every text reveal adds `.is-revealed` and clears its inline tween
properties on completion. `ScrollTrigger.refresh()` reverts `fromTo`
tweens to their start values while re-measuring, and refresh fires on
load, on resize, and whenever the evidence disclosure changes the page
height. Without the hand-off, opening the evidence table throws
already-read headlines back off-screen.

### One mask, one line

`.reveal-line > span` is `white-space: nowrap`. If text inside a mask
wraps, the extra lines are clipped by the `overflow: hidden` that makes
the reveal work, and the headline silently loses words. Line breaks are
authored in the markup. **Do not add `max-width` in `ch` to a display
heading** — that is what forces the wrap.

---

## Accessibility and fallbacks

Four paths, all tested in the harness:

- **Normal.** Full choreography.
- **`prefers-reduced-motion: reduce`.** No smooth-scroll layer, no camera
  drift, no spatial travel, no translate-based text choreography. The 3D
  system holds a deliberately composed still. Everything is immediately
  readable.
- **WebGL unavailable.** The canvas is removed, the vector poster is
  shown, the full DOM narrative is retained, controls that only affect
  the 3D object are removed rather than left dead. No error page.
- **JavaScript disabled.** All three foundation explanations are visible
  in sequence, the evidence table is a plain `<table>` inside a native
  `<details>`, and an inline script in the document hides the loader
  before any bundle loads — so the worst case is a fully readable static
  site, never a page stuck behind a spinner.

The pre-animation state lives behind a `.motion-ready` class that
`TextReveals` adds only once it is certain it will run. Nothing is hidden
optimistically.

Also: skip link, visible focus on every stop, a real ARIA tablist with
roving tabindex and arrow-key operation for the layer selector, native
disclosure semantics, and no focus trapped in the canvas. The canvas is
`pointer-events: none` and every pointer listener is passive, so touch
can never block scrolling.

Printing opens the evidence disclosure via `beforeprint` and a `print`
media-query listener. A closed `<details>` does not render its contents
at all, so no print stylesheet can bring the table back on its own.

---

## Performance

`QualityManager` picks a tier at boot from pointer type, viewport,
`hardwareConcurrency` and `deviceMemory`, then watches frame time and
steps **down** if the median exceeds ~22ms across a second of frames. It
never steps back up: oscillating between tiers is more visible than
running one notch below peak.

| | high | medium | low |
|---|---|---|---|
| Max DPR | 2 | 1.5 | 1.25 |
| Sim resolution | 512² | 320² | 192² |
| Sim steps/frame | 8 | 6 | 4 |
| Bloom | yes | yes | no |
| MSAA samples | 4 | 2 | 0 |
| Worley crack passes | 2 | 2 | 2 |

The renderer has `antialias: false` because it never presents directly —
MSAA is on the offscreen target instead. Without it the thousands of thin
struts crawl, which is the most obvious "cheap WebGL" tell. The lattice
is built from closed solids, so it renders `FrontSide` — back faces are
never visible even with the camera inside the structure.

The frame loop stops entirely when the document is hidden.

Bundle, gzipped: ~118kB Three, ~33kB motion, ~39kB app, ~5kB CSS.

---

## Factual governance

This site makes claims about a real company in a regulated context, so a
factual regression matters more than a visual one.

`src/content/evidence.ts` holds every factual claim with its source. The
narrative ships as **static HTML** so it survives with JavaScript
disabled, which creates one real risk: the copy in `index.html` drifting
away from the checked record during editing.

`src/content/verify.ts` closes that gap. In dev it compares the rendered
DOM against the source data and reports divergence in the console:

- all eleven carry-over rows present, in order, with matching ranges;
- each evidence bar's geometry encoding the same numbers it sits beside;
- the scalability statement reproduced verbatim;
- claim counts matching the source;
- game-state names and roles matching;
- no prohibited wording from the claim-ladder guardrails appearing
  unqualified.

It is stripped from production by an `import.meta.env.DEV` guard.

Sources: `Dark-Lattice-Cross-Engine-Reuse.md`,
`CLAIM_LADDER_AND_LANGUAGE_GUARDRAILS.md`, `CURRENT_CASE_STATE.md`,
`Dark_Lattice_Innovator_Founder_Business_Plan_v3_Controlled_Draft.md`.

### Deliberately absent

No founder names, no contact email, no contact form, no team section, no
release dates, no sales figures, no final price, no partner or client
logos, no awards, no press quotes, no performance benchmarks, and no
image presented as gameplay. None of those is currently supported by
inspected evidence — several are marked `REPORTED` or `RED` in the case
state register — so none of them appears.

The wording "one proprietary engine" and "Dark Lattice Engine" is
excluded by design, and the verifier fails the build-time check if either
appears unqualified.

---

## QA harness

With a server running:

```bash
node tools/capture.mjs http://localhost:4173 captures
```

27 checks across the viewports and paths the brief requires: 1440×900,
1920×1080, 1366×768, 390×844, 360×800, plus reduced motion, WebGL
failure, JavaScript disabled, keyboard-only, and touch. Writes
`qa-report.json` and exits non-zero on failure.

Two notes on how it measures, because both caught false results:

- Horizontal overflow is checked as *"can the user scroll sideways"*
  against `window.innerWidth`, plus *"does any in-flow element exceed
  `clientWidth`"*. Fixed elements size to the layout viewport, and under
  Chromium's mobile emulation `innerWidth` can exceed
  `documentElement.clientWidth` by a scrollbar width — comparing them
  reports an overflow the user would never see.
- Text assertions are case-insensitive. Chrome applies `text-transform`
  to `innerText`, and every section heading here is uppercased in CSS.

Other scripts:

```bash
node tools/sequence.mjs http://localhost:4173 captures/sequence 1440 900
```

One frame per movement, for reading the sequence as a storyboard.

```bash
node tools/poster.mjs
```

Regenerates `public/fallback/hero-poster.svg` from the same envelope,
spacing and ring constants as `LatticeModel`. **Re-run it after changing
the lattice geometry**, or the fallback silently becomes a picture of an
object the site no longer has. ~6KB gzipped, and it can never be mistaken
for gameplay.

```bash
node tools/record.mjs http://localhost:4173 delivery
```

```bash
node tools/deliver.mjs http://localhost:4173 delivery
```

---

## Known limitations

- **`preview-scroll` is WebM, not MP4.** `ffmpeg` was not on PATH on the
  build machine. `tools/record.mjs` converts automatically when it is
  available; re-run it to produce the MP4.
- **Captures were rendered through SwiftShader** (software GL) in
  headless Chromium, so they are accurate for composition, layout and
  colour but not a guide to frame rate. Frame-rate QA needs a real GPU.
  The capture scripts also wait longer than a real visitor would, because
  the software renderer hits the warm-up time budget and the field needs
  the extra seconds to develop.
- **Fonts load from Google Fonts.** Self-host if the deployment needs to
  be fully origin-independent; see DEPLOYMENT.md.
