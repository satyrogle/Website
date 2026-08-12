# Dark Lattice — studio website

A single continuous 3D world the DOM narrative travels through. The world is
a synthesised structure under a deterministic simulation: it is permitted to
deviate, and a system enforces its return to a recorded, approved state. The
calm the site opens on is late-understood as maintained rather than natural.

Static output. `dist/` uploads to ordinary hosting, including GoDaddy cPanel.
See [DEPLOYMENT.md](DEPLOYMENT.md).

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
| Simulation | Plain TypeScript, fixed-step, in a Web Worker |
| Motion | GSAP + ScrollTrigger. Native scrolling — no smooth-scroll layer |
| Styling | Plain CSS with custom properties |

No React. This is one continuous scene with one camera; a component tree
would sit between the scroll director and the uniforms it needs to drive
without earning its place.

---

## Structure

```
public/
  social/og-dark-lattice.jpg   shot from the running hero, see below
  favicon.svg
src/
  main.ts                      boot sequence and loader hand-off
  styles/                      tokens, global, typography, sections
  scene/
    SceneController.ts         renderer, frame loop, camera rail, the
                               narrative surface the director may touch
    QualityManager.ts          device tiering and runtime demotion
    correction/
      CorrectionModel.ts       the world and the record, as two line sets
      graph/GraphSynth.ts      the structure, synthesised from a seed
      sim/CausalPulseSimulation.ts   damped graph wave over CSR adjacency
      sim/CorrectionOperator.ts      the system acting on the world
      sim/AmbientHarmonic.ts         the calm, and the drift below threshold
      sim/CorrectionSystem.ts        graph + wave + operator as one unit
      sim/PulseWorker.ts             the authority; owns all state
      sim/PulseClient.ts             main-thread handle, snapshot transport
  shaders/                     correction-edge, correction-ghost
  motion/
    ScrollDirector.ts          document scroll → narrative bands
    TextReveals.ts             masked headline choreography
    MotionPreferences.ts       reduced-motion source of truth
  content/
    RecordController.ts        the floor panel, the false first action,
                               and the record that survives the visit
    evidence.ts                every factual claim, with sources
    verify.ts                  dev-only integrity check against the DOM
  accessibility/
    AccessibilityController.ts layer tablist, magnetic controls, print
tools/
  correction-validate.mjs      the mechanism gate — 43 checks, no renderer
  correction-capture.mjs       stills and probes from real Chrome, real GPU
index.html                     the entire narrative, static
404.html
```

---

## The world, and the system that corrects it

There is no mesh asset. `GraphSynth` builds the structure in memory from a
seed: wandering filaments plus accepted scatter, proximity cross-links, and
a per-node displacement direction. The same seed gives the same structure on
every machine and every visit, which is what lets the determinism claim reach
the geometry rather than starting at the first simulation tick.

Three construction rules are load-bearing, all of them inherited from how
earlier directions failed:

- **No grid.** Spacing is irregular everywhere; no row or column exists.
- **No radial or cylindrical parameterisation.** Nothing converts an index
  into an angle. There is no centre, no axis, and no capture frame that can
  resolve into concentric anything.
- **Anisotropic by construction.** Long in x, deep in z, thin in y — a veil
  met obliquely, not a cloud with no orientation.

The state on top of it is a damped graph wave: `u` and velocity as typed
arrays, fixed `dt = 1/120`, symplectic Euler, seeded and checksummed. It runs
in a Worker and is the authority. What the renderer draws can never feed back
into it.

### The correction pass

After every integration step, `CorrectionOperator` compares the world against
the approved record `u*` and forces disagreement back inside tolerance:

```
D = |u − u*|      disagreement, measured in full
C = engaged       contact — sparse, thresholded, hysteretic
V = D × C         consequence: enforcement, and the retained bruise
```

Two consequences fall out of the model rather than being decorated on:

- **The sensor is sparse.** Drift under `θ_on` is never seen, so it is never
  corrected. The file tolerates invisible error while violently correcting
  visible deviation. The ambient harmonic that makes the opening frame
  breathe is deliberately tuned to live in that gap — permanently invisible
  to the system that is otherwise total.
- **The calm is a result.** A region at rest is a region the operator has
  already finished with.

Nothing in the enforcement path is tweened. Every displacement a visitor sees
during a correction is a δ this operator computed and applied to the
authoritative state.

### Colour grammar — never redefined

```
CYAN    the world        live deviation, the wave
AMBER   the record       approved rest state, the ghost, the floor panel
VIOLET  the consequence  V = D × C — enforcement contact and retained bruise
```

Violet is scarce. Agreement renders zero violet.

### Enforcement gain

Gain scales three things at once — how soon the system notices, how soon the
ramp completes, how hard it pulls — and it comes from two places:

- **Spatially**, a single monotone gradient along the veil's long axis,
  starting past the opening view so the event the visitor is first shown is
  enforced at the tuning that was judged. Never radial: a soft ellipse drawn
  across the structure is the failure mode every retired direction died of.
- **Narratively**, rising with scroll depth and falling again on the way back
  up.

Thresholds are deliberately *not* scaled by gain. What the system can see is a
property of its sensor, so the calm is never enforced at any depth.

Gain changes what the system does, so it travels the same channel as an
injection — quantised, deduplicated, posted to the Worker — and the recorded
trace still replays to an identical checksum.

---

## Motion architecture

Document scroll does not drive the camera directly. Each band owns a fixed
slice of narrative progress whatever its measured height:

```
open 0.00–0.12   ask 0.12–0.28   notice 0.28–0.46
gradient 0.46–0.68   floor 0.68–0.82   editorial 0.82–1.00
```

The camera is one rail: the look-point slides along the veil and the offset
closes as it goes — travel plus approach, never a cut and never an orbit. It
is eased against *progress*, not against time, so reverse scroll runs it
backwards exactly as it ran forwards with no easing state to unwind.

Nothing else reverses. Bruises, scars and the adjustment count are one-way;
scrolling back shows scars, not a rewind.

Past the floor the machine stops: the render loop ends and the Worker is
paused. The cut is done by the layout — every editorial section carries the
ground colour itself, so coming out of the floor raises an opaque surface
over the canvas. A fade timed against the scroll would be a transition, and
the beat needs a stop.

### No smooth scroll

There is deliberately no Lenis layer. An earlier build ran it at 0.85s and it
was the single thing that made the site feel wrong: the page lagged behind the
wheel, so the camera — driven by scroll position — lagged too, and the causal
link between input and movement broke. Native scrolling keeps that link
honest.

All measurement is cached and refreshed on resize; the scroll handler performs
no layout reads.

### Reveals hand off to CSS

Every text reveal adds `.is-revealed` and clears its inline tween properties
on completion. `ScrollTrigger.refresh()` reverts `fromTo` tweens to their
start values while re-measuring, and refresh fires on load, on resize, and
whenever the evidence disclosure changes the page height. Without the
hand-off, opening the evidence table throws already-read headlines back
off-screen.

### One mask, one line

`.reveal-line > span` is `white-space: nowrap`. If text inside a mask wraps,
the extra lines are clipped by the `overflow: hidden` that makes the reveal
work, and the headline silently loses words. Line breaks are authored in the
markup. **Do not add `max-width` in `ch` to a display heading** — that is what
forces the wrap.

---

## Interaction

One action: a press injects one bounded impulse at the node under the ray.

- **Mouse** presses on the way down.
- **Touch and pen** arm a tap and resolve it on release — under 350ms, under
  8px of travel. `pointerdown` fires before the browser has decided whether a
  gesture is a tap or a scroll, so pressing on contact charged every flick
  down the page as an action.
- **Keyboard** gets the same action through the ASK band's own word, which is
  a real button. It fires from the centre of the frame with no distance
  tolerance, so it always lands.

A press is refused when the machine is off or the world is a still: an action
whose consequence cannot be observed is the one thing this interaction must
not be.

**Bounded budget.** Twelve presses a visit — enough to strike, watch the whole
event, and try it elsewhere to compare; not enough for the structure to become
a toy. The invitation goes quiet when spent.

**The false first action.** Eight seconds of doing nothing and the system
supplies the action itself, corrects it, and counts it. Nothing downstream
distinguishes it from a real press, because the record has no column for whose
fault it was. It is disabled under reduced motion, where there is no event to
watch.

---

## The record

The floor is typeset from the Worker's counters and nothing else:

```
YOUR RECORD
ADJUSTMENTS APPLIED: N.
RESIDUAL DEVIATION: 0.
```

The zero is the interesting one. Residual deviation is measured against what
the system can *see*, and below its own release threshold it can see nothing —
so a settled world still deviating by 0.05 is reported as 0. Honest arithmetic
and a false statement in the same line. Both halves are asserted in the
mechanism gate, because the line is only worth anything if the zero is
computed rather than written.

`darkLattice.record` in localStorage carries visits, adjustments and whether
the simulation was entered, written as a total so committing twice cannot
inflate it. A second visit reads it back.

Adjustments the *system* made to itself — the scripted event that renders the
reduced-motion triptych — are subtracted before anything reaches the record.
A visitor who touched nothing owes nothing.

---

## Accessibility and fallbacks

Four paths, all measured in `correction-capture --paths`:

- **Normal.** Full descent.
- **`prefers-reduced-motion: reduce`.** No camera travel and no text
  choreography. One real correction event is rendered at boot as three
  stills — the tick before enforcement engages, one inside the ramp, one
  after it has let go — with the world left where the event left it, so the
  held frame is the bruise state. Each still carries alt text. A
  before-and-after pair would be an unexplained change; the middle frame is
  the explanation. The invitation is hidden there: a still cannot answer a
  press.
- **WebGL unavailable.** The canvas and the machine's bands are removed, the
  entry control is re-aimed at the editorial, the full DOM narrative is
  retained, and the visit is recorded honestly as not entered. No error page.
- **JavaScript disabled.** All three foundation explanations are visible in
  sequence, the evidence table is a plain `<table>` inside a native
  `<details>`, the machine's bands are hidden, and an inline script hides the
  loader before any bundle loads — so the worst case is a fully readable
  static site, never a page stuck behind a spinner.

The pre-animation state lives behind a `.motion-ready` class that
`TextReveals` adds only once it is certain it will run. Nothing is hidden
optimistically.

Also: skip link, visible focus on every stop, a real ARIA tablist with roving
tabindex and arrow-key operation for the layer selector, native disclosure
semantics, and no focus trapped in the canvas. The canvas is
`pointer-events: none` and every pointer listener is passive, so touch can
never block scrolling.

Printing opens the evidence disclosure via `beforeprint` and a `print`
media-query listener. A closed `<details>` does not render its contents at
all, so no print stylesheet can bring the table back on its own.

### Mobile is a recomposition

The veil is eighteen units long and under two thick, and a tall viewport's
horizontal field is narrow: held level it crops to a fragment, and backing off
far enough to fit it makes it a thread. So the frame turns instead of the
object — the camera rolls and the structure runs the diagonal, which is the
longest run a portrait frame has. It covers about 21% of the frame there
against 10% on desktop: filled, not shrunk.

---

## Performance

`QualityManager` picks a tier at boot from pointer type, viewport,
`hardwareConcurrency` and `deviceMemory`, then watches frame time and steps
**down** if the median exceeds ~22ms across a second of frames. It never steps
back up: oscillating between tiers is more visible than running one notch
below peak.

A tier sets one thing — the ceiling on device pixel ratio (2 / 1.5 / 1.25).
That is what this world costs. The simulation is fixed-step and cannot be
thinned without changing what the system does, and the structure is untextured
lines with no post, so the only thing that scales with the machine is how many
pixels those lines are rasterised into.

Measured on an RTX 3060 at 1440×900: tier high, median frame 4.2ms, p95 4.4ms,
Worker 0.094ms per fixed step — about 11ms of work per second of simulated
time.

`antialias: true` on the renderer, because the structure is hairlines over
near-black with no post to hide edge aliasing behind. The frame loop stops
entirely when the document is hidden.

Bundle, gzipped: ~117kB Three, ~28kB motion, ~29kB app, ~5kB CSS.
`dist/` is under 900kB.

---

## Determinism

The claim is that seed plus input trace replays to an identical checksum, and
it covers the enforcement, not only the world: the checksum extends over the
bruise, the scar, the sensor reading, the engaged mask, the adjustment count
and the narrative gain.

Everything that changes what the system does goes through the Worker as a
message and is therefore part of that trace — injections and gain alike. There
is no `Math.random()` in the simulation or in the narrative logic. Every
number the site displays is computed.

GPU output is visual state, not a cross-device deterministic authority.

```bash
node tools/correction-validate.mjs
```

43 checks with no renderer involved, so a failure is a failure of the
mechanism rather than of a shader: graph structure and stability bounds, the
rotational-symmetry guard, the calm never engaging (including at maximum
gain), the six stages of one correction event with timings a person can watch,
the derived-zero residual, gain behaviour, replay equality, and pacing.

Flags for sweeping a parameter without editing source:
`--ambient --thetaOn --thetaOff --hold --stiffnessTo --ramp --sense --energy
--ticks --trace`.

---

## Capture

Frames are judged from real Chrome on the real GPU. Software rasterisation has
already hidden a shader bug here that rendered the object black on the actual
card, so it is not visual truth.

```bash
node tools/correction-capture.mjs --scroll --event --record --editorial --paths
```

| flag | what it does |
|---|---|
| *(none)* | the opening frame, with luminance and colour statistics |
| `--event` | one full enforcement event, six beats |
| `--motion` | whether the calm actually moves, in screen pixels |
| `--scroll` | one frame per narrative band |
| `--record` | the false first action, the floor panel, the budget, a second visit, the skip path |
| `--editorial` | the machine-off cut, and whether the copy is genuinely revealed |
| `--paths` | mobile, touch tap vs flick, reduced motion, no-WebGL, keyboard |
| `--og` | regenerates `public/social/og-dark-lattice.jpg` from the running page |

The social card is shot from the site rather than drawn separately, which is
the only arrangement where it cannot drift from what the site actually is.

---

## Factual governance

This site makes claims about a real company in a regulated context, so a
factual regression matters more than a visual one.

`src/content/evidence.ts` holds every factual claim with its source. The
narrative ships as **static HTML** so it survives with JavaScript disabled,
which creates one real risk: the copy in `index.html` drifting away from the
checked record during editing.

`src/content/verify.ts` closes that gap. In dev it compares the rendered DOM
against the source data and reports divergence in the console:

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

No founder names, no contact form, no team section, no release dates, no sales
figures, no final price, no partner or client logos, no awards, no press
quotes, no performance benchmarks, and no image presented as gameplay. None of
those is currently supported by inspected evidence — several are marked
`REPORTED` or `RED` in the case state register — so none appears.

The wording "one proprietary engine" and "Dark Lattice Engine" is excluded by
design, and the verifier fails the check if either appears unqualified.

**One open item.** This list previously included "no contact email". The
studio section now carries `contact@darklattice.co.uk`, because reachable
contact is a requirement of the editorial band and a company site without a
route to it fails a different test. The address is a conventional role address
on the company's own domain and is the one piece of text on the site not
derived from something already in the repository. It is marked with a comment
in `index.html`. Confirm or replace it.

---

## Known limitations

- **Fonts load from Google Fonts.** Self-host if the deployment needs to be
  fully origin-independent; see DEPLOYMENT.md.
- **The hero object is not final.** The structure currently on screen is a
  standing placeholder. The mechanism, the narrative and every path around it
  are built and measured; what the visitor is looking at is still open.
