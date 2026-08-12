# Phase 2 — THE CORRECTION: candidate dossier

Adjudication artifact, 2026-08-12. Level 0 (paper). Sources: master brief §58,
§99–102, §87 checklist, §214 questions 101–143; repo truth per
`00-repository-truth.md`; genealogy per `01-design-genealogy.md`.

## Proposition

**Reality is permitted to deviate briefly; the system then enforces
convergence to the recorded, approved state.** The site opens on perfect calm.
The late understanding is that the calm is not natural — it is maintained.
Perfect order is evidence that correction already won.

## Core inversion

- Opening belief: *a system in perfect, natural order.*
- Invalidating evidence: watching one deviation get noticed, resisted, and
  forced back — then recognising that everything already calm has the same
  history.
- What stays visually unchanged through the inversion: the structure, the
  camera grammar, the calm itself. Only their meaning flips. (The purest form
  of the project's comprehension-menace law, inherited from the graveyard line
  "the structure did not change; your model of it did.")

## Where the record enters (the argument, mapped exactly)

The admissible set is not an arbitrary band. It is derived from an **approved
baseline record** `u*` — the system's record of its own sanctioned state,
captured at approval time. Amber renders that record. Enforcement is the
record acting back on the world:

```text
WORLD            u, velocity per node          cyan   (live deviation)
RECORD           u* + tolerance εᵢ             amber  (the file: approved state)
DISAGREEMENT     D = |u − u*|                  measured in full
CONTACT          C = enforcement engaged        sparse, thresholded, hysteretic
CONSEQUENCE      V = D × C                      violet (enforcement + bruise)
```

The locked colour grammar and the canonical `V = D × C` formula survive
verbatim. Two thesis-true consequences fall out for free:

1. **The system's sensor is itself sparse.** Enforcement only *sees* violations
   beyond threshold, sustained past a hold time. Sub-threshold drift is never
   seen and never corrected — the file tolerates invisible error while
   violently correcting visible deviation.
2. **The false first action carries over intact.** Idle 8 s → the system
   injects a deviation itself, corrects it, and logs the adjustment as yours.

## Formal model (concrete, engine-fitting)

State and propagation are the existing spike engine unchanged: `u`,
`velocity` on an irregular CSR graph, damped wave step, fixed dt = 1/120,
seeded, checksummed, in a Worker.

New correction pass, run after each integration step (master brief §100
projected-iteration form):

```text
for each node i:
  vᵢ = max(0, |uᵢ − u*ᵢ| − εᵢ)                       # violation
  engagedᵢ: OFF→ON  when vᵢ > θ_on for T_hold ticks   # awareness latency
            ON →OFF when vᵢ < θ_off                    # hysteresis
  while engaged, for k in 1..K:                        # strain → snap
    δᵢ = stiffness(k) · (clamp(uᵢ, bandᵢ) − uᵢ)       # stiffness ramps up
    uᵢ += δᵢ
  mᵢ = mᵢ·decay + |Σδᵢ|                               # bruise (violet, retained)
  adjustments += 1 on each OFF→ON transition            # deterministic count
correctionEnergy += Σ|δᵢ|                              # removed energy, reported
```

Everything is CPU, fixed-step, replayable from seed + impulse trace. The
checksum extends to cover `m`, `engaged`, and the adjustments counter, so
determinism claims include the enforcement itself. Displayed counts are
derived, never authored (hard-blocker requirement).

## The grammar of one correction event (§58's six stages, as parameters)

1. **Deviation** — cyan wave displaces the structure (T_hold gives it time to
   visibly *exist*).
2. **Awareness** — the hold latency reads as the system noticing. Deliberate,
   tuned 0.3–0.8 s.
3. **Strain** — early low-stiffness iterations: the deviation resists, the
   pull is visible before it wins.
4. **Correction** — stiffness ramp completes; behaviour snaps (parameter
   glides, behaviour snaps — the hysteresis law inherited from THE LATTICE).
5. **Settling** — damped residual under the band.
6. **Trace** — violet bruise `mᵢ` decays but never fully clears; the counter
   incremented.

## Stage and rendering commitments

- **Structure:** a seeded irregular scatter graph — filaments via proximity
  edges. NOT the entity GLB, NOT a grid, no radial construction. Irregular
  topology is load-bearing (tunnel-class and magnetic-grid guards).
- **Displacement, not colour, carries enforcement.** Node positions are
  `p₀ᵢ + uᵢ·n̂ᵢ` (stored per-node directions). The world *physically* deviates
  and is *physically* pushed back. The amber record renders as the structure's
  approved rest geometry — a coincident ghost, visible only where relevant.
  Colour is secondary: luminance from |u| (light law: structure visible where
  state illuminates it), violet only at `V = D × C`.
- **First frame:** a calm standing harmonic barely displacing the structure;
  ghost and world coincident (agreement everywhere → zero violet); vast
  negative space; near-black; no post beyond tone mapping.
- **Grayscale test:** hierarchy must survive desaturation (live luminance >
  ghost > void). Semantic hues are assignment, not the composition.

## Narrative beats (site-scale sketch — not part of the kill test)

1. **OPEN** — perfect harmonic calm. *A system in perfect order.*
2. **ASK** — `Touch it.` Press injects one bounded impulse (cyan).
3. **NOTICE** — the system permits it, notices it, corrects it. Strain, snap,
   settle, bruise. No caption.
4. **GRADIENT** — scroll reveals enforcement gain rising across the structure:
   near the fringe deviations live visibly longer; in the deep calm they die
   instantly. The calm regions are late-understood as won territory. (The
   turn, continuous, never captioned.)
5. **FLOOR** — your inputs replayed: what you did (cyan trace) against what
   now exists (corrected state). `YOUR RECORD — ADJUSTMENTS APPLIED: N.
   RESIDUAL DEVIATION: 0.` Machine off. Editorial.

Editorial handoff line candidate: **"The file is not a description. It is an
instruction."** Then the standard band: Desk42 (you operate the record),
Brawler (you operate the physical layer), thesis, contact.

Carried organs, unchanged: false first action, skip path (recorded honestly),
localStorage-only persistence, evidence governance, demonstrate-first law.

## Interaction

- One action: press/touch injects one bounded impulse (raycast-to-node exists
  in the spike app). Bounded energy budget per visit — not a sandbox toy.
- Do nothing: false first action after 8 s.
- Reverse scroll: gain gradient is scroll-bound and reversible; bruises and
  the counter persist — scrolling back shows scars, not a rewind.
- Touch: identical to press. No hover dependence.
- Reduced motion: a still triptych of one correction event — deviation peak /
  strain / settled-with-bruise — plus the live-free bruise state. This is
  designed against §58's kill condition ("unexplained before/after"): the
  strain frame is the explanation.

## Why it is dark

The system is not violent because it is angry. It is violent because deviation
is incompatible with the approved state. Procedural calm is the menace. The
site's beauty *is* the enforcement's track record.

## Art dangers and mitigations

| Danger (§58) | Mitigation |
|---|---|
| snap / elastic easing read | corrections are computed δ applied over stiffness-ramped iterations; no tween anywhere in the enforcement path |
| glitch read | strain phase precedes snap; hold latency gives cause a visible timeline; bruise gives it a past |
| quantize-demo / magnetic-grid read | irregular graph; band derived from a *record*, not a grid; no lattice snapping |
| physics-toy read | bounded injection budget; consequences persist; the system, not the visitor, is the protagonist |
| data-viz read | the band is geometry (ghost/sheath), never gauges, axes, labels, or in-scene numbers |
| generic plexus/constellation read | no uniform node dots, no line-network aesthetic; edges visible only through state light |
| UI-error aesthetics | no sparks, arcs, red flashes, or symbols (§102); material response only: compression, roughness shift, stress line, retained violet bruise |
| violet spam | violet strictly `V = D × C` plus decaying bruise; agreement renders zero violet |

**The frame that kills the direction if it looks wrong: the correction
instant.** If that still reads as UI snap or glitch, THE CORRECTION dies.

## Hard-blocker screen (all 16, master brief §66)

| Blocker | Verdict |
|---|---|
| Framework migration | PASS — vanilla stack, engine already vanilla |
| Second scroll/animation authority | PASS — native scroll + GSAP only |
| Unjudgeable before large art investment | PASS — one-capture kill test, schematic stage |
| First frame needs heavy post | PASS by construction — baseline forbids it; verified at capture |
| Duality needs explanatory paragraph | GUARDED — blind cold-read is the test |
| Mobile message loss | GUARDED — touch-native; composition deferred, designed not assumed |
| Reduced-motion loss | GUARDED — strain triptych designed; §58 kill condition applies |
| Traps company content | PASS — skip path + editorial band carried over |
| Hidden monster | PASS — there is no creature; the reveal is a count |
| Portal/ring/tunnel repeat | PASS — irregular graph, no cylindrical parameterisation; concentric-capture rule in force |
| GPU randomness claimed as deterministic fact | PASS — CPU authoritative, GPU renders snapshots |
| Record/correction hand-authored where derivation is central | PASS — δ, counts, and traces are computed; displayed N is derived |
| Reads as generic data visualization | GUARDED — geometry-not-gauges rule above |
| Reads as generic shader/generative art | PASS — CPU causality + interaction + replay distinguish it |
| Needs unsupported factual claims | PASS — every shown number is computed |
| False Façade resurrection | PASS — unrelated |

No blocker fails on paper. Three are GUARDED — they are what runtime evidence
must retire.

## Fallback disposition

If the standalone stage fails but the enforcement mechanism proves legible,
THE CORRECTION becomes the escalation layer of THE FAIR COPY under §58's four
hybrid conditions (FAIR COPY works alone; record already legible; correction
adds one thesis, not a second hero; controlled visual complexity). Recorded as
fallback, not plan.

---

## Appendix — cross-examination answers (§214, Q101–143)

101. Opening must establish: *this calm is natural and complete.*
102. Invalidated by: one deviation noticed, resisted, forced back; calm
     re-read as maintained.
103. Unchanged through inversion: structure, camera, calm — meaning only.
104. Real state: `u`, `velocity` typed arrays in the Worker.
105. Official state: baseline record `u*` + tolerance band.
106. Authority enters at the projection operator — the record acts on the world.
107. Memory enters as bruise `mᵢ`, the adjustments counter, and the visit record.
108. Menace of late understanding: the beauty you trusted is enforcement's
     track record, and your own input just joined it.
109. Works without dark colours: yes — displacement/ghost/return read in any
     palette; grammar hues are semantic assignment.
110. Another studio unchanged: the mechanic could be imitated; the
     record-derived band, deterministic replay, and YOUR RECORD ending are
     thesis-specific.
111. First-frame dominant mass: one irregular filament structure under a calm
     standing harmonic.
112. First-frame negative space: near-black void; structure ≤ ⅓ of frame.
113. Grayscale hierarchy: live luminance > ghost > void — survives desaturation.
114. Cyan: the world — live deviation.
115. Amber: the record — approved geometry/band.
116. Violet earned by: active enforcement contact and decaying bruises only.
117. First post effect removed: none present beyond tone mapping (baseline).
118. Generic sci-fi risk: plexus/constellation read — guarded (no dot-line
     aesthetic).
119. Data-viz risk: band-as-gauge — guarded (band is geometry).
120. Kill frame: the correction instant.
121. Authoritative state: CPU arrays in Worker (u, velocity, engaged, m, count).
122. Derived visual state: GPU snapshot rendering; never authoritative.
123. Seeded: graph synthesis + scripted impulse schedule.
124. Fixed-step: dt = 1/120 accumulator (existing engine).
125. Observed: violations beyond threshold sustained past hold — nothing else.
126. Omitted: sub-threshold drift — permanently invisible to the system.
127. Persisted: adjustments count, bruise summary, visit record (localStorage).
128. Replayable: seed + impulse trace → identical checksum incl. enforcement.
129. Downstream consequence: bruises, counter, YOUR RECORD text — all derived.
130. Debug trace: per-event log {node, tick engaged, ticks held, Σ|δ|}
     matching visible events 1:1, plus checksum replay.
131. Single action: one press/touch, one bounded impulse.
132. No action: false first action at 8 s, attributed to the visitor.
133. Reverse scroll: gain follows scroll both ways; scars persist.
134. Touch: identical injection; no hover anywhere.
135. Reduced motion: strain triptych + bruise state.
136. Cause→effect delay: T_hold, tuned 0.3–0.8 s — the "noticing" gap.
137. Smoothing vs causality: no easing in the enforcement path; scroll
     smoothing stays off the sim.
138. Demo-toy guard: bounded energy budget; persistent consequence.
139. Later memory of action: bruises + counter surface at the floor and in
     the persisted record.
140. Same input trace replay: yes — inject messages are the trace; the
     validate script replays them.
141. Highest-cost unknown: enforcement legibility; then first-frame beauty.
142. Cheapest honest kill test: the one-capture A/B in
     `04-correction-kill-test.md`.
143. Reused systems: CausalPulseSimulation, PulseWorker/PulseClient,
     GraphAsset format, validate/calibrate/bench harness, isolated-entry
     convention; later QualityManager and MotionPreferences.
