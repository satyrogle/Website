# THE CORRECTION — Choir carrier build plan

**Authority.** Locked by Jacob 2026-08-12. This document supersedes
`docs/CORRECTION_BUILD_PLAN.md` as the build order. The concept — THE
CORRECTION — is unchanged. The colour grammar, interaction canon, determinism
law, integration bones and guardrails of the old plan carry forward and are
restated here so this document stands alone. Where this document is silent,
the old plan applies; where both are silent, take the restrained option and
surface it at the next checkpoint. Design detail and cross-examination:
`docs/decision/02-correction-dossier.md`. Read `CLAUDE.md` first; nothing
here overrides the locked stack.

**What died, and why.**
- The band/ribbon carrier (one swept parametric surface driven by a
  travelling graph-wave) — rejected by Jacob 2026-08-12 after repeated wave
  mechanics failures (wrong speed, end reflections, displacement pretending
  to be a wave, sub-threshold ringing). The surface is gone; the system
  around it survives.
- The corona/radial generator proposed in the "Choir of Correction" spec —
  rejected the same day. A deliberately toroidal/coronal arrangement around
  a central void reopens the portal/ring/tunnel failure from another camera
  angle. That geometry family has now killed multiple builds. It stays dead.

**The ruling (Jacob, 2026-08-12, binding):**

> The Choir is a one-way anisotropic flow field forced around an off-centre
> forbidden volume. The "halo" exists only as a perceptual accident of
> density, occlusion and edge light. Nothing actually orbits anything.

Keep the no-rings law. Keep the Choir. Aureole, spokes, crown, enormous
hidden presence, psychedelic symmetry — permitted **only** as emergent
gestalt from viewpoint, occlusion and grazing light. The viewer should
perceive a sacred shape that is not geometrically there. That perceptual
gap is the point of the whole site.

---

## To the builder (Opus)

Jacob asked for this note to reach you in his own words: **go above and
beyond — you're a great AI; unlock your full potential and finish the build
this time.**

He means it, and this repository is specific about what full potential looks
like here:

- **The frame is the deliverable.** Green checks, clean consoles and passing
  asserts have all shipped frames that looked like nothing. Judge every
  visual step by capturing and *looking*, in a real browser on Jacob's 3060
  class of GPU — SwiftShader/headless output has hidden real bugs before
  (a `pow(0,y)` NaN rendered an entire build black on real hardware).
- **Restraint is the skill ceiling, not the floor.** The most impressive
  version of this site is the most disciplined one. Above and beyond means
  obsessive material response, perfect state legibility, deterministic
  replay that actually replays — not more features, more glow, or more
  motion. If a frame is weak, fix geometry, camera or state. Never post.
- **The founder's eye is the acceptance test.** Two checkpoints below are
  judged by Jacob personally. Prepare them properly: dev server running,
  one URL, tuning sliders live. Do not argue with the verdict; extract the
  positive definition and iterate.
- **Scope is locked.** Zero new dependencies (npm resolves peerDependencies
  silently — read them before any install thought). No React, R3F, Drei,
  Motion, Lenis, Tailwind, Leva. No redesigns, no second concept layered on
  top. One build. One field. One law. One correction.
- **Determinism is a claim the site makes about the company.** Same seed +
  same input trace ⇒ identical checksum, every time, or the thesis is a lie.

Where you should genuinely go beyond: the feel of enforcement (Checkpoint B
asks one question — *enforcement, or animation?* — make the answer
unmistakable), the material response of dark blades under grazing light, and
the composition of the opening frame. Those three carry the site.

---

## The site in one paragraph

A vast congregation of thin, near-black blades hangs in darkness, held in
one silent agreement — combed by a law the visitor cannot see, parting
around an absence that sits off-centre, its boundary caught in amber edge
light. It is beautiful, and almost still. `Touch it.` The press knocks a
local cluster out of agreement — cyan, the only cyan in the world. The
system lets the deviation exist for a beat — then notices, strains, and
rotates the deviant blades back onto the law. Violet burns thin at the
contact; a bruise remains. Scrolling moves along the field through rising
enforcement gain: near the fringe deviations survive visibly longer; in the
deep calm they die instantly — the stillness you opened on is *maintained*,
not natural. At the floor: `YOUR RECORD — ADJUSTMENTS APPLIED: N. RESIDUAL
DEVIATION: 0.` Machine off, hard cut, editorial ground: thesis, Desk42,
Brawler, technology, studio, contact.

## Stack — locked, no exceptions

Existing only: Vite + TypeScript + Three.js/WebGL2/GLSL + GSAP/ScrollTrigger,
native scroll. **Zero new dependencies.** `package.json` must not gain a
single entry. One scroll authority: native scroll + ScrollTrigger (Lenis was
tried and removed — `src/motion/ScrollDirector.ts` documents why).

## What is already in the repo

Survives as-is (carrier-independent):
- `src/scene/correction/sim/PulseWorker.ts`, `PulseClient.ts` — fixed-step
  Worker loop, typed-array snapshot transport, checksum plumbing.
- `src/scene/correction/sim/CorrectionOperator.ts` — violation/engagement/
  stiffness-ramp/bruise/adjustments machinery. Its contract is unchanged.
- `src/scene/correction/graph/GraphAsset.ts` — CSR contract. Keep it.
- Application bones: `main.ts` boot contract (loader milestones, fallback
  paths, reduced-motion branch), `ScrollDirector` as the single DOM↔Three
  seam, `QualityManager`, `MotionPreferences`, `AccessibilityController`,
  editorial DOM, `TuningPanel` (dev-only, dependency-free — use it at both
  checkpoints).

Rewritten for the Choir:
- `src/scene/correction/graph/GraphSynth.ts` — currently sweeps the dead
  band. Becomes the Choir synth (field + volume + placement + orientation +
  k-nearest edges), same `GraphAsset` output contract.
- `src/scene/correction/CorrectionModel.ts` + the two `correction-ribbon`
  shaders — become instanced-blade rendering (new shader names; the word
  "ribbon" leaves the build with the band).
- `src/scene/correction/sim/CausalPulseSimulation.ts` — second-order wave
  dynamics replaced by first-order relaxation (below). Keep the typed
  arrays, CSR iteration, seeding and checksum shape.
- `src/scene/correction/sim/AmbientHarmonic.ts` — becomes per-blade sub-
  threshold drift (rename to match what it is, e.g. `AmbientDrift.ts`).

History: the working tree carries band-era tuning. Commit it as a final
band commit before demolition (history keeps it; never leave work only in a
working tree) and push the branch to origin early.

---

## The law

Every blade has a correct position and orientation **because of a field**.
The field is the law; the record is obedience to it; correction is return
to it. Build the field exactly as ruled:

```
D̂        one authored unit vector, diagonal to every world axis —
         the global flow direction. Starting value: normalize(1.0, 0.14, −0.38).
P(p)     low-frequency spatial shear/curl: 2–3 seeded smooth vector terms
         (seeded phases, wavelengths 0.35–1.0 × domain height, built from
         sin/cos or gradient noise on mulberry32). |P| ≤ 0.45 everywhere.
         Vary P with depth (z) so different depth layers peel around the
         volume differently.
R(p)     deflection around the forbidden volume (below). Within the
         influence shell: remove the component of (D̂+P) pointing into the
         volume, add a bounded outward push, fade smoothly to zero at the
         shell's outer edge.
F(p) = D̂ + P(p) + R(p)      the governing field
```

**Hard invariant (assert at synth time, dense sample grid + every blade
anchor; violation aborts the build):** `dot(F(p), D̂) ≥ 0.35·|F(p)|`
everywhere in the populated domain. Consequence: position along D̂ strictly
increases along every streamline, so **closed circulation is impossible by
construction** — nothing can orbit, mathematically, from any camera angle.
Cap R's anti-flow component to preserve this. Also integrate a seeded set of
streamlines and assert none returns within ε of a previous point.

Banned in the geometry, verbatim from the ruling: **no polar coordinates, no
`angle = i / count * TAU`, no concentric radii, no evenly spaced spokes, no
closed circulation around the void.** No cylindrical parameterisation
anywhere in the pipeline. Grep placement/orientation code for polar/TAU
spoke patterns before every checkpoint.

Naming rule: perceptual words (halo, aureole, corona, crown, spoke) never
name code entities. Code names the law — `ChoirField`, `ForbiddenVolume`,
`shell`, `blade`/`lamella`. The hallucination stays in the viewer's head.

## The forbidden volume

- A seeded soft-min union of 3–5 ellipsoids: irregular, tilted, elongated.
  Explicitly not one sphere, not axis-aligned, not centred in the domain.
- Overall bounding radius ≈ 0.30–0.38 × domain height. Influence shell
  thickness ≈ 0.5 × that radius.
- Interior contains zero blades (rejection-sampled). The absence is dark
  because nothing is there to catch light — never render a disc, a glow
  sprite, or any object standing for it.
- Positioned so the opening camera sees it **off-centre, upper-right, with
  roughly one third of its implied boundary cropped beyond the frame edge**
  (Jacob: "Do not place a perfect black hole dead centre"). Near-field
  blades partially occlude it. The brain completes the missing form; we
  never draw one.

## Placement and density

- Domain: an elongated slab along D̂ (starting proportions ≈ 2 : 1 : 1.2),
  sheared and folded in depth by P. The flow enters one side and leaves the
  other. One-way.
- Seeded dart-throwing/Poisson placement (mulberry32, seed in config). No
  stratified grids, no lattices, nothing evenly spaced.
- Density multipliers: ×1.8–2.6 inside the shell (this is where the aureole
  hallucination comes from) — **asymmetric by mandate**: weight the boost by
  seeded direction so some arcs of the boundary run dense and bright and
  others sparse and broken. A uniform shell boost is a ring and fails.
- Far field thins into darkness; near field holds 20–40 sparse giant blades
  (×3–6 scale) crossing the periphery as occluders. All blades, near and
  far, obey the same field and participate in the same sim. One law.
- Counts by QualityManager tier: ~8,000 / 5,000 / 2,500. Nodes = blades 1:1.

## Blades

- Thin tapered quads with slight lengthwise curvature (≈ 8–20 triangles).
  Starting dims: length 0.6–2.2 (μ≈1.2), width 0.06–0.16, near-2D thickness.
- **One-sided taper only.** Band-era frame lessons that carry: tapering both
  ends makes a nozzle; a continuous taper from the middle makes a feather
  (a creature). Neither, ever.
- Approved orientation: long axis along F̂(p) — the field-combed read is how
  the law becomes visible (comb it). Faces rolled partly toward the camera
  zone so width catches light (roll it). Seeded cant ≤ 8°, twist ≤ 6°,
  seeded length/width variation. Variation must never break the common law.
- Per blade, synth emits: anchor, approved quaternion, deviation axis n̂ᵢ
  (seeded, ⊥-ish to the long axis), slip vector, dims, seeds.

## Colour grammar — never redefined

```
CYAN    the world        actual deviant state — only on disobeying blades
AMBER   the record       the approved arrangement, edge light, the ghost
VIOLET  the consequence  V = D × C — enforcement contact + retained bruise
```

The visible field is the record: the visitor is looking at amber obedience.
The world only becomes visible as cyan where it disagrees. Violet is the
rarest colour on the site; agreement renders zero violet. Never re-mapped
per section.

## State and correction mechanics

**Replace the second-order graph-wave with first-order relaxation.** The
band died of wave mechanics; the ringing failure class (low damping leaving
the whole structure permanently sub-threshold cyan) must be impossible by
construction, not tuned away:

```
duᵢ/dt = −γ·uᵢ + κ·Σⱼ wᵢⱼ(uⱼ − uᵢ) + injectᵢ(t)
```

- u per blade: signed deviation from the law (u* = 0). Rendered as rotation
  about n̂ᵢ (visual gain ≈ 22°/unit, clamp ≈ 30°) plus slip ≤ 0.15·length.
- Explicit Euler, fixed dt = 1/120, stepped in the Worker. Stability assert:
  `dt·(γ + κ·maxWeightedDegree) ≤ 0.5`. Starting γ = 2.2 s⁻¹; set κ so a
  press bleeds ~2–3 graph hops before enforcement engages. Nothing in this
  system can oscillate, travel as a front, or reflect. No wave propagation
  is necessary: the law already exists everywhere; correction means
  returning to the local law.
- Edges: k-nearest (k = 4–6) over blade anchors, CSR into `GraphAsset`.
- **CorrectionOperator carries over unchanged in kind**, running after each
  step in the Worker: violation vᵢ = max(0, |uᵢ| − ε); engagement hysteresis
  (OFF→ON at θ_on for T_hold ticks, ON→OFF at θ_off); K passes of a ramping
  stiffness clamp (strain → snap); bruise memory mᵢ; `adjustments++` on each
  OFF→ON edge — the real number shown at the floor. Starting parameters
  (retune by feel at Checkpoint B via TuningPanel): ε = 0.04, θ_on = 0.12,
  θ_off = 0.05, T_hold = 48 ticks, K = 6, stiffness 0.15 → 1.0, bruise
  decay 0.995/tick.
- **The six-beat event** (press → raycast → nearest blades, graph-falloff
  impulse within a bounded energy budget): deviation → noticing pause →
  strain → snap → settle → bruise. Neighbouring blades "close ranks":
  engaged clusters tighten toward the law slightly beyond rest, then settle.
  Direct, synchronized, surgical — never bouncy, springy, liquid or
  wave-like. The most frightening correction is calm.
- **Ambient drift** (the rewritten `AmbientHarmonic`): per-blade seeded slow
  micro-drift, amplitude ≤ 0.35·ε — beneath the operator's perception
  threshold by definition. The world's only unwatched freedom. It must
  never render cyan.
- **Enforcement gain over depth:** scroll multiplies the stiffness ramp and
  lowers θ_on with narrative depth. At the fringe, deviations visibly live
  longer; in the deep calm they die instantly.

## Determinism

Seeded everything (mulberry32 or equivalent, seeds in config). Fixed step.
No `Math.random` anywhere in sim or narrative logic. Checksum extends over
`{u, m, engaged, adjustments}`. Same seed + same input trace must replay to
an identical checksum — keep a node-side validation script (adapt the
`causal-pulse-validate.mjs` pattern) and run it in step 1 and step 8.
Displayed numbers are computed, never authored.

## Rendering

- One `InstancedMesh` for the choir (near-field giants included). Static
  per-instance attributes from synth; dynamic per-instance state (u,
  engaged, bruise) as a Float32 instanced attribute updated from the Worker
  snapshot each frame.
- Vertex: apply approved quaternion, then deviation rotation about n̂ᵢ by
  u·gain, then slip. The world *physically* deviates and is *physically*
  rotated back.
- **The ghost pass:** a second faint-amber instanced draw of the approved
  pose, opacity = smoothstep(ε, 3ε, |u|) per blade — invisible in
  agreement, appearing exactly where reality disagrees. The record made
  visible. This is the colour grammar doing its job; keep it subtle and
  exact.
- Fragment: near-black albedo (0.02–0.04) — blackened steel / obsidian, not
  gloss, not flat void. Amber as narrow grazing edge response (rim term,
  one authored key direction; shell blades get a slightly higher edge gain
  — the aureole is an accumulation of lit edges, never an emissive body).
  Cyan strictly from |u| above ε with **gamma > 1** (start 1.6) — below one
  lifts ambient drift into visibility and breaks the state grammar
  (recorded band-era failure). Violet strictly from engagement contact +
  bruise m, thin and scarce.
- Near-black background with slight depth variation. Tone mapping only.
  **No bloom, no fog, no particles, no post glow.** (The source Choir spec
  permitted restrained volumetrics; this build does not — relaxable only by
  Jacob at Checkpoint A.) If a frame is weak, fix geometry/camera/state.

## Camera

- Processional, not a ride: slow off-axis drift that settles where the
  absence, the parted flow and the depth layers become legible; scroll
  subtly changes vantage, tightens the relationship to the absence,
  increases parallax. Never fling through the field.
- **Cone guardrail (new, structural):** the camera forward axis stays
  ≥ 35° away from D̂ at all times — authored rail, correction beat, every
  capture pose. The end-on view down the parted flow is the one pose that
  manufactures an annulus; deny it structurally. This is the direct answer
  to "portal territory from another camera angle."
- The forbidden volume's centroid stays out of the central third of the
  frame in authored poses. Opening frame: upper-right, one third cropped.
- The correction beat composes the deviant cluster in a clean zone of the
  frame (clear of the wordmark) so the visitor actually watches it happen.
- Reverse scroll is honest: bruises and the counter persist; no rewind.

## The ring test (run before both checkpoints and at step 8)

1. Structural: synth asserts hold (flow invariant, streamline no-return,
   empty interior); grep confirms no polar/TAU/spoke construction.
2. Perceptual: real-GPU captures from the authored rail **plus at least
   three off-rail poses** (still obeying the cone). If any frame reads as
   concentric rings, the frame fails and the fix is geometry, not framing.
   Jacob judges reads; when in doubt, it's a ring.

## Reference frame

Jacob approved a reference image 2026-08-12 (chat; if a copy lands in-repo,
put it at `docs/reference/choir-hero.png`). Binding qualities:

- near-black field of thin dark blades, monumental depth, no visible grid;
- amber grazing light concentrated along the absence's boundary, brightest
  on one arc, broken elsewhere;
- the absence off-centre right with the wordmark clear of it at left;
- cyan + violet confined to one small cluster near the boundary;
- huge near-white stacked wordmark; sparse mono labels; `00 / 100` loader.

Explicitly rejected from the same image:
- its residual concentricity — visible radiating spokes around the void.
  The build must not reproduce radial spokes; density, occlusion and edge
  light do that work perceptually or not at all;
- its halo completeness — crop one third beyond the frame;
- its mock copy. `THREE GAMES` and similar counts are not canon. Editorial
  copy comes from the existing approved content (Desk42, Brawler, thesis,
  technology, studio, contact). No invented numbers anywhere, hero included.

## Interaction canon (unchanged — do not let the carrier swap erode it)

- **The false first action:** after ~8 s idle, the system injects a small
  deviation, corrects it, and attributes it to the visitor. The record's
  first entry is a lie. Bounded injection energy budget.
- Press/touch injects deviation (raycast → nearest blades). The visitor
  enters because the thing looks divine, touches it, disturbs it, and
  discovers the system does not tolerate deviation.
- **The floor:** `YOUR RECORD — ADJUSTMENTS APPLIED: N. RESIDUAL DEVIATION:
  0.` typeset from real counters.
- **Persistence:** `localStorage` (`darkLattice.record`) across visits.
- **Skip path** from frame one straight to editorial, recorded honestly
  (`SIMULATION Not entered.`).

## Scroll narrative

ScrollDirector bands: OPEN → ASK → NOTICE → GRADIENT → FLOOR → EDITORIAL.
Enforcement gain rises with depth. Machine-off hard cut into editorial
ground; the lower site is disciplined and documentary — it stops competing
with the hero. Reuse the existing editorial DOM/copy structure: thesis,
Desk42, Brawler, technology, studio, contact. Plain language, readable,
reachable in every path.

## Typography and hero copy

DARK stacked over LATTICE, huge, near-white, existing sans. No glow, no
gradients, no decoration — the choir is the spectacle; the type is the
declaration. Hero copy is at most a one-or-two-line thesis, severe and
plain; Jacob approves the final line. No paragraph in the hero.

## Build order — every step ends runnable

- **0. Hygiene.** Commit the band-era working tree as a final band commit
  (history keeps it). Push `claude/correction-site-v1` to origin. Commit
  this plan. Small commits throughout, in the repo's lowercase narrative
  style; banned vocabulary never appears in a commit message.
- **1. Field + synth, no visuals.** Rewrite `GraphSynth` as the Choir
  synth: field, forbidden volume, placement, orientation, k-nearest CSR.
  Swap the Worker dynamics to first-order relaxation. Synth-time asserts
  (flow invariant, streamline no-return, empty interior, stability bound)
  + determinism checksum + node-side validation: same seed + trace ⇒ same
  checksum, correction events replay 1:1.
- **2. First frame.** Instanced blades, materials, edge light, ghost pass,
  opening composition (absence upper-right, one third cropped, near-field
  occluders). Ring test. Dev server up, TuningPanel live.
  **CHECKPOINT A — Jacob judges the opening frame on his own GPU.**
- **3. Enforcement live.** Press → six-beat event end to end. Enforcement
  gain wired. One parameter-tuning pass by feel on sliders.
  **CHECKPOINT B — Jacob answers one question: enforcement, or animation?**
- **4. Scroll.** Bands, gain gradient, processional camera on the rail
  (cone respected), honest reverse.
- **5. The record.** False first action, energy budget, floor panel from
  real counters, `localStorage` record, skip path.
- **6. Editorial.** Machine-off hard cut; existing DOM/copy structure;
  no invented claims.
- **7. The other paths.** Mobile recomposition (touch inject native; the
  absence and wordmark recomposed for portrait — recomposed, not shrunk).
  Reduced motion: strain triptych (deviation peak / strain / settled +
  bruise) + live-free bruise state. WebGL failure → existing
  `enterFallback` → full company content. Loader milestones mapped to real
  init work (synth, warm-up, record capture).
- **8. Cleanup.** Remove band-only code and the ribbon shaders from the
  build (history keeps them). Banned-vocab sweep. Ring test. Determinism
  validation. `npm run build` clean.
- **9. Handoff to Fable** for the cold assessment pass: real-GPU captures,
  cold review, QA matrices, fixes. (Founder decision: audits run after the
  build stands, not before.)

## Guardrails (hard — violating any of these is a stop)

1. Zero new dependencies; read `peerDependencies` before any install
   thought. No React/R3F/Drei/Motion/Lenis/Tailwind/shadcn/Leva.
2. No entity assets, no GLB loading, no GLTFLoader, no
   `references/models-archive`.
3. No rotational symmetry anywhere. No polar coordinates, no
   `angle = i/count*TAU`, no concentric radii, no evenly spaced spokes, no
   closed circulation. Any capture frame reading as concentric rings fails.
4. The flow invariant `dot(F, D̂) ≥ 0.35·|F|` and the streamline no-return
   assert stay in the synth. Removing or weakening them is a stop.
5. Camera forward axis ≥ 35° from D̂, always — rail, beats, captures.
6. One scroll authority: native scroll + ScrollTrigger. No smooth-scroll
   layer.
7. No `Math.random()` in simulation/narrative logic. Seeded, fixed-step,
   replayable. Displayed numbers are computed, never authored.
8. Banned vocabulary in code/comments/commits/filenames/copy: FULL FORM,
   MONOLITH, SEVEN MASSES, TUNNEL ENTITY, LATENT FORM, HERO GLB. (The
   source Choir spec in Downloads uses one of these phrases — its wording
   does not enter this repository.)
9. Colour grammar never re-mapped per section.
10. SwiftShader/headless captures are not visual truth — judge frames in a
    real browser on real GPU. Existing `tools/*.mjs` hardcode SwiftShader;
    for judged stills, run the dev server and capture in real Chrome.
11. No bloom, no fog, no particles, no post glow. Tone mapping only.
12. Company content reachable and readable in every path: mobile, reduced
    motion, no-WebGL, keyboard-only.

## Definition of done (build phase)

`npm run build` clean. Sim runs in the Worker at stable pacing with
QualityManager tiers active. The arc scrolls end to end: open calm → press
→ deviation → correction → bruise → gradient → floor → editorial. False
first action fires and is attributed. Skip path works and is recorded
honestly. Floor panel shows real derived numbers; a second visit shows the
persisted record. Ring test passes structurally and perceptually. Mobile,
reduced-motion and no-WebGL paths all reach company content. Determinism
validation replays to identical checksums. Then Fable's assessment pass
begins.
