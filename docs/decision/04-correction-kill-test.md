# Phase 4 — THE CORRECTION: kill-test specification

Adjudication artifact, 2026-08-12. Paper only — this document specifies the
test; nothing here is built. Conforms to the master brief's harness rules
(§72–80 isolation/baseline/capture, §82–86 blind review and stop rules, §87
CORRECTION checklist, §257 rescue budget).

## Proposition under test

Exactly one claim, the scorecard's dominant uncertainty:

> **Computed enforcement on a live deterministic system reads — blind, with no
> caption — as a system being disciplined: force with reason, weight, and
> trace. Not snap, not easing, not glitch.**

Everything else (first-frame beauty, mobile, reduced motion) is measured
opportunistically from the same session but does not gate this test.

## Founder's evidence unit: "one capture" — interpretation

Scoped per the founder's instruction ("spike sim + feedback, one capture"),
interpreted as: **one scene, one seed, one deterministic run, one capture
session** on the real GPU — producing:

- **Strip A (enforcement ON):** four stills from fixed ticks of the run —
  `before` / `violation` / `correction-instant` / `settled-with-trace`
  (checklist items 13–16).
- **Strip B (control, enforcement OFF):** the same seed, same impulse, same
  tick indices, correction pass disabled — the wave simply disperses.

B is what makes A falsifiable: identical worlds, the only difference is the
file being enforced. If A is not obviously a *governed* version of B, the
proposition failed. Optionally one 6–8 s WebM of the same run for motion
judgment (§75 temporal baseline); stills are the judged evidence.

If this two-strip interpretation exceeds the founder's intent, strike Strip B
— but the A/B is the same page, same run cost, and is the difference between
"looks nice" and "proves enforcement."

## Test form (§58 "first kill test": one local structure only)

- **Structure:** seeded irregular scatter graph, ~1,500–3,000 nodes, proximity
  edges, no radial construction, no grid. Node displacement directions n̂ᵢ
  stored at synth time. Uniform enforcement gain (the site-scale gradient is
  out of scope here).
- **Run script (deterministic, no live hand):** t=0 valid calm (u≡u* under a
  faint standing harmonic) → scripted bounded impulse at tick T₁ on one
  interior node → wave propagates (cyan, displacement) → hold latency elapses
  → strain → correction → settle → bruise persists. One deviation, full
  six-stage grammar, inside ~8 s of sim time.
- **Interactive mode** (mouse inject via the ported raycast path) exists on
  the page for the founder to feel it, but the judged evidence comes from the
  scripted run only (§80 no cherry-picking; the trace is the replay file).

## Isolation and implementation sketch (build-phase estimate, not build)

- **Branch:** new `claude/correction-kill-v1` off current main tip. Port the
  five engine files from `claude/causal-pulse-spike-v1`
  (`CausalPulseSimulation`, `PulseWorker`, `PulseClient`, `GraphAsset` types,
  stability-bounds math) — port files, do not merge (that branch carries
  unrelated entity work). **Precondition: push the spike branch to origin
  first; it is currently local-only.**
- **New code:** `GraphSynth.ts` (seeded scatter + proximity CSR + conservative
  spectral bound via max weighted degree or power iteration, ~150 lines);
  `CorrectionOperator.ts` (band, hysteresis, K-iteration stiffness-ramped
  projection, bruise, counter, correction-energy ledger, ~150 lines, per
  dossier formal model); render layer per dossier commitments (displacement +
  amber ghost + violet V=D×C, lab-local material, ~200 lines);
  `correction.html` isolated Vite entry per the `causal-pulse.html`
  convention. Extend checksum over `{m, engaged, adjustments}`.
- **Nothing in the production path changes.** No canonical doc changes. No new
  dependencies.
- **Cost estimate:** ~700 lines ported unchanged + ~500 new + capture session.
  One focused build session. Fully reversible by deleting the branch.

## Baseline conformance

- §74 visual: near-black; no bloom, fog, particles, grain, aberration; tone
  mapping only. Both strips identical settings.
- §76 viewport: 1920×1080 primary, DPR 1.5. (390×844 only if the concept
  survives — mobile is not judged here.)
- §73 shared baseline: same renderer path and camera family as any future
  candidate test; no per-candidate polish.
- §79 metadata recorded beside the images: concept, branch, commit, date,
  browser, OS, GPU, viewport, DPR, seed, dt, impulse trace, capture command,
  build command, console state.
- §80 seed: one representative seed chosen *before* first render and kept.
  Changing seed after seeing output is cherry-picking and is recorded as such.

## Real-GPU protocol (non-negotiable, project law)

All judged frames come from the founder's RTX 3060 in a real browser — dev
server + real Chrome, captured via DevTools/OS, or a `shot.mjs` variant with
`headless: false` and every SwiftShader flag removed (~10-line change,
build-phase). SwiftShader output may be used only for determinism/validation
checks (checksum replay), never for visual judgment. This is the
pow(0,y)=NaN lesson applied.

## Determinism instrumentation (extends existing validate tooling)

1. Same seed + same impulse trace → identical extended checksum, twice, on
   both CPU environments (headless ok here).
2. `ADJUSTMENTS APPLIED: N` equals the event log's OFF→ON count exactly.
3. Correction-energy ledger: Σ|δ| reported; enforcement-ON run's interior
   energy decays faster than control by the ledger amount (order-of-magnitude
   accounting, not exact conservation — damping exists).
4. Per-event log {node, tick engaged, ticks held, Σ|δ|} — every visible
   correction maps 1:1 to a logged event.

## Blind cold review (§82–83)

A fresh reviewer (subagent, read-only, no concept briefing, no dossier access)
receives both strips unlabeled plus the philosophy/rubric excerpts only, and
answers in order:

1. What do you see? (first noun matters — "net/web/circuit" is a finding)
2. What happened between frames 2 and 3 of strip A?
3. What is the difference between the two strips?
4. **Did strip A look like enforcement, or animation?**
5. What rule, if any, can you infer?

Its literal read is recorded before any explanation is given (§68: when prose
and runtime disagree, believe runtime; a concept cannot be saved by a better
essay).

## Pass / kill criteria (verbatim class from §58 + §87)

**PASS** requires all of:
- blind reviewer describes discipline/enforcement/force unprompted (Q4);
- a rule is inferable (Q5 yields something band/limit/allowed-shaped);
- violation and correction read as connected (Q2);
- the enforcement-ON strip reads as a governed version of the control.

**KILL** if any of:
- reviewer reaches for snap / easing / glitch / auto-layout;
- no rule is inferable;
- violation and correction visually disconnect;
- legibility depends on exaggerated violence;
- the trace (bruise) is the only thing communicating enforcement.

**Rescue budget (§257 class): exactly one parameter pass** — {θ_on, θ_off,
T_hold, K, stiffness ramp, strain visibility, bruise decay} only. No new
mechanisms, no post effects, no camera rescue. Then re-capture, re-review
blind, and the verdict stands. Kill-test stop rule §86: a killed proposition
is not re-litigated with polish.

## Outcome handling

- **PASS →** scorecard recomputes at Level 1/2 (legibility, first-frame, and
  reduced-motion cells get real evidence); founder sees the strips and rules
  on proceeding to site-scale design (gradient, beats, floor).
- **KILL →** candidate dies for one session's cost; fallback disposition is
  the FAIR COPY hybrid rule (dossier); the decision receipt records the
  evidence either way.
- Evidence lands in `evidence/hero-adjudication/correction/` with metadata
  (§78–79), committed only if the founder wants evidence versioned.
