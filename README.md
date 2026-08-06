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

## The object — ENTITY v7: THE CROWNED CONVERGENCE

Generated in code, not loaded from a `.glb`. There is no Blender stage in
this project and no mesh asset to maintain.

Rebuilt (Aug 2026) to the founder's reference sheet — "Entity Hybrid //
04 Hollow Convergence + 10 Silent Crown". The v5 kite-door monolith is
dead and must not return: its tall almond silhouette with a central
vertical seam read as anatomy, and its two swinging leaves swept the
lens as a pale wall — the "white door" that survived every dimming pass
because it was geometry, not lighting. Scroll mapping, camera rail and
tunnel structure are untouched (locked).

**The outer crown: rugged, COHERENT armour.** Seven major plates on a
near-regular heptagon, seven half-scale infill shards seated in the
gaps behind them — the sheet's big/small fidelity hierarchy. Placement
variance is deliberately SMALL: uniform steep lean, near-zero roll,
tight radius band, so the plates read as one suit of armour wrapping
the throat. Random thetas/rolls/scales were tried twice and read as
debris both times ("slabs are shit, they are asymmetrical"); a back
shell read as "rotating glass" and is banned. Material identity
follows the hierarchy (sheet 03): majors are MAT_PRIMARY (dense
iridescent veins, high response); infills and gyres are MAT_STRUCTURE
(darker base, muted veins, low response). Spike vertices always point
OUTWARD; inner vertices are fixed short so no plate can cross the
mouth and hide the recessed core. The dormant corridor is INVISIBLE
(tunnel skin gated to zero by `psy`) — nothing may hang behind the
sealed crown as a lit backdrop.

**The throat.** Three nested faceted gyre rings turning against each
other (`uGyre`: they creep while dormant, spin up as the visitor
approaches), stepping down to a pupil ring of eleven small shards and
the KERNEL — a burning cyan icosahedron on an uneven heartbeat, deep
in the socket. From the hero rail the entity is a dark crowned mass
with a cold eye looking back.

**The TEAR.** At the premise the crown is torn open (`uRip`, 10–27% of
the narrative): each plate waits its seeded beat then SNAPS over a
short window — hinge, radial throw, and a tangential SHEAR, so the
plates wrench sideways as the seams give. Infills rip slightly later
and faster than their majors: the small pieces give last. It must read
as tearing into the being, never as a mechanism blooming. The gyre
apertures widen for the rail, the pupil parts late, and the kernel
collapses toward nothing as the camera closes: the light WITHDRAWS
down the corridor, and the finale is meeting it again. No piece ever
presents a face to the lens at close range — the white door is
structurally impossible, not dimmed.

**The tunnel is the ORGANIC INSIDE of the entity** (sheet camera
journey: enter presence → confront — "completely organic, feels like
inside of something alive"). Eleven rings, but the architecture is
dissolved twice over: a slow travelling vertex undulation displaces
the ring surfaces along their normals (peristalsis — sampled on the
unit circle so the angular wrap cannot crack a seam), and the crack
domain is warped by two drifting fbm fields before ridging, so no
straight line survives — flowing branched veins, iridescent
ferrofluid, hue sliding with view angle. No spoke mandala, no crisp
aperture rims (structural edge lines re-drew the octagons). The
streaming coordinate is CONICAL (`z − r·0.55`) and drifts deeper on
its own clock — the inevitable pull, stated continuously; scroll
accelerates it. The six-fold DMT fold runs the WHOLE corridor,
crescendoing toward the deep end. The far core faintly lights every
face that looks toward it. The ENTIRE tunnel skin is gated by `psy`:
dormant zero (nothing behind the sealed crown), materializing as the
crown tears. Rings dissolve on a longer near-fade than the crown
pieces. The reaction field modulates brightness — and paints the
magenta reaction — never gates.

**The far crown.** The same build, mirrored and sealed forever, at the
far end of the tunnel, its kernel visible down the corridor from
mid-trip — the destination burns ahead for the whole documentary
stretch. The finale is arrival: the corridor is bracketed by the crown
that yielded and a crown that never does. At `uArrive` its seams and
kernel ignite toward gold — the arrival ignition.

**The convergence light** is cyan and physically anchored: it radiates
from the throat point of each gate, so it can only appear on faces
that look into the socket, and it falls off with real distance. There
is no configuration of camera and geometry that can produce a white
wall. The infall particles are sampled from the crown's own vertices
and spiral endlessly into the throat — the pull, made visible.

### The rail

From crown to finale the camera moves only forward along the corridor
axis — x and y never leave zero. This is the founder-chosen fix for
"scroll going everywhere": scroll maps to depth one-to-one. The
foundation movement's three-layer separation happens *ahead* of the
camera (ring thirds part along Z, gaps opening between clusters) instead
of being viewed from a side orbit.

### The palette: LIGHT LANGUAGE (v5, from the sheet)

The reference sheet's section 08, implemented literally: PRIMARY
cyan/teal (the standing colour of every filament crack), SECONDARY
magenta — **the reaction colour**, appearing only where the system is
answering something (field response, the yield surge, deep-vision
crossings) — ACCENT amber, owned exclusively by the halo and the far
crown's arrival ignition, and a near-black environment. Hue always
means state, never decoration. The constants live in one block at the
top of `lattice.frag.glsl` (`PAL_*` + the `signal()` ramp) so the
whole grade swaps in minutes. Prior palettes, all dead: v4
teal/violet/gold jewel-obsidian, pure monochrome ("palette is bad"),
indigo/magenta washes ("looks AI").

**The yield carries anticipation** instead of a lamp: the throat's
convergence light holds a visible low burn at rest, surges as the
crown gives way (`uTear` — and the rim, veins and luminance floor
surge with it, so the event reads on the outer faces too), then
settles to a sustained glow. Cyan, never white.

**The DMT bloom** (founder request): a six-fold kaleidoscopic Kali
fold blooms across the DEEP half of the tunnel only (z < −8), in jewel
hues, while the registered spokes ease back — front of tunnel is the
instrument, the back is the vision.

### The Blender pipeline (superseded)

`tools/blender/entity_v6.py` blocked out THE STRATIFIED GATE for a
mesh-based v6. The founder's reference sheet redirected the entity to
the procedural crowned convergence before the blockout was approved;
the script and `public/models/entity-v6.glb` remain as tooling but are
NOT wired into the site and are not the current direction.

**The halo is the threshold, not an ornament — and it is QUIET.** One
hair-thin CONTINUOUS band (torus r 2.0, tube 0.016 — barely over half
the crown's width, close over the apex, per the sheet), dimmed at rest
BELOW the bloom threshold so it carries zero glare: a clean gold line,
nothing more. MAT_HALO is "minimal reaction" — it is allowed to burn
at exactly two events, the gateway crossing and the arrival
(`mix(0.55, 1, max(uGateway, uArrive))`). A wide bright ring read as
"shining, big, has glare" and died. All motion on it is light (two
counter-travelling charges), never structure. During the tear it tilts
down, descends the axis and widens (`setGateway`, riding the first
half of `uRip`), ending face-on at the rail so the camera passes
THROUGH it into the corridor. The far crown keeps its halo overhead
the whole journey and it ignites at the arrival.

**The back half stays alive.** The evidence movement's DOM is
semi-opaque (`rgba(14,19,27,0.84)`) rather than solid, and the arc
keeps `psy`/emissive up through it — documentation reads cleanly with
the entity still turning behind it, per founder note.

### Rules that survived seven failed forms

- **A wireframe cannot loom** (the node-and-strut grid was a chandelier).
- **Patterns live in the surface, not in front of it** (filaments read
  as tendrils).
- **No stripes** (axis + lip rails read as "3 lines").
- **No gloss** (mirror-finish ooze read as glare/residue).
- **Never gate the trip by chemistry** (it kept disappearing); modulate
  with it instead.
- **The entity must be self-luminous** (near-black stone corridors went
  invisible from 30% on).
- **The camera never reverses, and off the rail is off the table.**
- **Near geometry fades** (`smoothstep(0.45, 2.2, depth)`).
- **`FIELD_EXTENT` covers the object's XY footprint.**
- **Orient, then translate.** The far gate was once rotated *after*
  translation, which spun it around the world origin to +33 — behind
  the hero camera. The tunnel had no ending, and nobody could see why.
- **No vertical seam, no almond silhouette.** A tall marquise outline
  split by a central vertical seam reads as anatomy from every
  distance. The mouth is an irregular ring with a RECESSED core.
- **Asymmetry must be composed, not random.** The sheet's "asymmetric
  harmony": top-heavy scale, spikes always outward, inner edges
  clearance-capped. (The v5-era "strict bilateral symmetry" rule was
  the fix for a lighting artifact, and died with the doors.)
- **Steep lean beats big faces.** Slabs presenting their faces to the
  rail read as petals; menace is edges, bevels and foreshortening.
- **The pull never stops.** Gyres creep at idle, filaments stream
  deeper at idle, infall particles fall at idle, the far core glows at
  idle. Scroll strengthens the pull; it never causes it.
- **Capture tooling needs wall-clock headroom.** Under SwiftShader the
  camera/rip springs converge in sim-time while the wall clock
  stretches with the frame rate — a short settle screenshots the
  camera mid-flight and the storyboard lies. `tools/shot.mjs` settles
  6 s (override with `SETTLE=`).

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
