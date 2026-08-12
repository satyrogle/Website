# THE CORRECTION — build plan

> **SUPERSEDED 2026-08-12 (later the same day).** The band carrier this plan
> describes was rejected by Jacob. The build order is now
> `docs/CHOIR_BUILD_PLAN.md`, which carries this plan's sim, interaction and
> guardrail canon forward. This file stays as the record of what the canon
> was; do not build the band from it.

Direction chosen by Jacob 2026-08-12. This is the build order. Design detail
(formal model, art dangers, cross-examination) lives in
`docs/decision/02-correction-dossier.md` — read it once before step 2.
Audits, QA matrices and adjudication phases run AFTER the build stands. Build
first.

## The site in one paragraph

A structure hangs in near-black, in perfect calm — barely breathing under a
faint standing harmonic. `Touch it.` Your press injects a cyan deviation that
ripples through it. The system lets it exist for a beat — then notices,
strains against it, and forces it back to the approved state. Violet burns at
the contact; a bruise remains. Scrolling descends through rising enforcement
gain: near the fringe deviations survive visibly longer; in the deep calm they
die instantly — the beauty you opened on is *maintained*, not natural. At the
floor: `YOUR RECORD — ADJUSTMENTS APPLIED: N. RESIDUAL DEVIATION: 0.` Machine
off, hard cut, editorial ground: thesis, Desk42, Brawler, technology, studio,
contact.

## Stack — locked, no exceptions

Existing only: Vite + TypeScript + Three.js/WebGL2/GLSL + GSAP/ScrollTrigger,
native scroll. **Zero new dependencies.** No React, R3F, Drei, Motion, Lenis,
Tailwind, shadcn, Leva. `package.json` must not gain a single entry.

## Colour grammar — never redefined

```
CYAN    the world        live deviation, the wave
AMBER   the record       approved rest state, the band, the ghost
VIOLET  the consequence  V = D × C — enforcement contact + retained bruise
```

Violet is scarce. Agreement renders zero violet.

## Where the code comes from

The wave engine exists on local branch `claude/causal-pulse-spike-v1`
(**push it to origin first — it exists nowhere else**). Port these files (port,
don't merge — the branch carries unrelated retired-entity work):

```
src/labs/causal-pulse/simulation/CausalPulseSimulation.ts   → src/scene/correction/sim/
src/labs/causal-pulse/simulation/PulseWorker.ts             → src/scene/correction/sim/
src/labs/causal-pulse/simulation/PulseClient.ts             → src/scene/correction/sim/
src/labs/causal-pulse/graph/GraphAsset.ts (types/format)    → src/scene/correction/graph/
```

The engine is a damped graph-wave: typed arrays over CSR adjacency, fixed
dt = 1/120, symplectic Euler, seeded, checksummed, stepped in a Worker. It is
passive — the correction layer is new code (below). Do NOT port anything that
references `DL_Aurora_v13.glb`, `build-causal-graph.mjs`, or the entity. No
GLTFLoader anywhere.

## New modules

**`GraphSynth.ts`** — deterministic irregular structure, built in memory:
seeded scatter (mulberry32 or equivalent, seed in config), ~2,000–4,000 nodes,
proximity edges (radius or k-nearest, k≈4–6), per-node displacement direction
`n̂ᵢ`, CSR output matching `GraphAsset`, conservative CFL bound via max
weighted degree (`λ_max ≤ 2·maxᵢ Σⱼ wᵢⱼ`). Shape the scatter anisotropically
(elongated cloud/veil) — **no grids, no radial construction, nothing that can
read as rings.**

**`CorrectionOperator.ts`** — run after each sim step, inside the Worker:

```
for each node i:
  vᵢ = max(0, |uᵢ − u*ᵢ| − ε)                    # violation vs the record
  engagedᵢ: OFF→ON when vᵢ > θ_on for T_hold ticks; ON→OFF when vᵢ < θ_off
  while engaged, k = 1..K:
    δ = stiffness(k) · (clamp(uᵢ, band) − uᵢ)     # stiffness ramps: strain → snap
    uᵢ += δ;  δ_total += |δ|
  mᵢ = mᵢ · decay + |δ_total|                     # bruise
  adjustments++ on each OFF→ON edge               # the real number shown later
```

`u*` (the record) is the state captured at the end of warm-up calm — the band
is derived from a record, not authored. Starting parameters (tune by eye at
checkpoint B): `ε = 0.04`, `θ_on = 0.12`, `θ_off = 0.05`, `T_hold = 48` ticks
(0.4 s), `K = 6`, stiffness ramp `0.15 → 1.0`, bruise decay `0.995`/tick.
Extend the checksum over `{m, engaged, adjustments}`. No `Math.random`
anywhere in sim or narrative logic — seed + input trace must replay to an
identical checksum.

**Rendering (`CorrectionModel.ts` + lab-local shaders)** — displacement
carries the meaning: node position `p = p₀ + uᵢ·n̂ᵢ`. The world *physically*
deviates and is *physically* pushed back. Amber ghost = the approved rest
geometry, faint, coincident where agreeing. Luminance from |u| — structure is
visible where state illuminates it, near-invisible at rest. Violet strictly at
engaged contact and decaying bruises. Instanced edges/nodes. Near-black
background, tone mapping only — **no bloom, no fog, no particles.** If a frame
is weak, fix geometry/camera/state, not post.

## Integration

Keep the existing application bones: `main.ts` boot contract (loader
milestones, fallback paths, reduced-motion branch), `ScrollDirector` as the
single DOM↔Three seam, `QualityManager`, `MotionPreferences`,
`AccessibilityController`, editorial DOM. Adapt `SceneController` internals:
the correction system replaces `LatticeModel` + `ReactionField` on the live
path. Leave entity modules in place but unwired until step 8 cleanup.

## Build order — every step ends runnable

- **0.** Push `claude/causal-pulse-spike-v1`. Branch `claude/correction-site-v1`
  from current tip. Commit the plan/decision docs.
- **1. Sim core, no visuals.** Port engine, write GraphSynth +
  CorrectionOperator. Node-side determinism check (adapt the
  `causal-pulse-validate.mjs` pattern): same seed + trace → same checksum,
  correction events logged 1:1.
- **2. First frame.** Structure rendered in the app shell, calm harmonic,
  amber ghost coincident, vast negative space.
  **CHECKPOINT A — Jacob looks at the opening frame on his 3060.**
- **3. Enforcement live.** Click/touch injects (raycast → nearest node); full
  six-stage event: deviation → noticing pause → strain → snap → settle →
  bruise. One parameter-tuning pass by feel.
  **CHECKPOINT B — Jacob answers one question: enforcement, or animation?**
- **4. Scroll.** ScrollDirector bands: OPEN → ASK → NOTICE → GRADIENT → FLOOR
  → EDITORIAL. Enforcement gain rises with narrative depth. Authored camera
  drifts along the structure — never a clean central axis. Reverse scroll is
  honest: bruises and the counter persist; no rewind.
- **5. The record.** False first action (8 s idle → system injects, corrects
  it, attributes it to the visitor). Bounded injection energy budget. Floor
  panel typeset from real counters. `localStorage` record
  (`darkLattice.record`), persists across visits. Skip path from frame one →
  editorial, recorded honestly (`SIMULATION Not entered.`).
- **6. Editorial.** Machine-off hard cut onto solid ground: thesis, Desk42
  (you operate the record), Brawler (you operate the physical layer),
  technology, studio, contact. Reuse the existing editorial DOM/copy
  structure. Plain language; readable; no fake numbers anywhere.
- **7. The other paths.** Mobile recomposition (touch inject native; camera
  recomposed, not shrunk). Reduced motion: strain triptych (deviation peak /
  strain / settled+bruise) + live-free bruise state. WebGL failure → existing
  `enterFallback` → full company content. Loader milestones mapped to real
  init work (graph synth, warm-up, record capture).
- **8. Cleanup.** Retire entity modules/shaders from the build (history keeps
  them). Banned-vocab sweep. `npm run build` clean.
- **9. Handoff to Fable** for assessment: real-GPU captures, cold review, QA
  matrices, fixes. (Deferred by founder decision until the build stands.)

## Guardrails (hard — violating any of these is a stop)

1. Zero new dependencies; check `peerDependencies` before ANY install thought.
2. No entity assets, no GLB loading, no `references/models-archive`.
3. No rotational symmetry anywhere; any frame reading as concentric rings fails.
4. One scroll authority: native scroll + ScrollTrigger. No smooth-scroll layer
   — Lenis was tried and removed (`src/motion/ScrollDirector.ts` documents why).
5. No `Math.random()` in simulation/narrative logic. Seeded, fixed-step,
   replayable. Displayed numbers are computed, never authored.
6. Banned vocabulary in code/comments/commits/copy: FULL FORM, MONOLITH,
   SEVEN MASSES, TUNNEL ENTITY, LATENT FORM, HERO GLB.
7. Colour grammar never re-mapped per section.
8. SwiftShader/headless captures are not visual truth — judge frames in real
   Chrome on the 3060. (All existing `tools/*.mjs` hardcode SwiftShader;
   for stills, run the dev server and capture in a real browser.)
9. Company content must be reachable and readable in every path: mobile,
   reduced motion, no-WebGL, keyboard-only.

## Definition of done (build phase)

`npm run build` clean. Sim runs in the Worker at stable pacing on desktop
(QualityManager tiers active). The five beats scroll end to end. Skip path
works. Floor panel shows real derived numbers; a second visit shows the
persisted record. Mobile, reduced-motion and no-WebGL paths all reach company
content. Then Fable's assessment pass begins.
