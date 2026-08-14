# PRODUCTION PLAN — THE CORRECTION, ON THE WOUNDED WORLD

> **STATUS 2026-08-14, end of the build pass.** P1 and P3–P8 are implemented
> and committed (`09b8dd4` … `6f532b9`); P2 predates this pass. Measured on
> the RTX 3060 against the **production** build: 12.90 ms/frame at 2560×1440,
> 5.10 ms at 1440×900, zero console output, and no dev handle or tuning panel
> in the bundle. Blender rebuilds byte-identically; two scripted identical
> visits produce identical records. `package.json` is unchanged from `main`.
>
> **Outstanding, and deliberately not guessed at:**
> - **Quality-tier thresholds (P7.3).** After the field early-out, bloom,
>   pixel ratio and march steps all measure inside the run-to-run spread on
>   this card — bloom *off* measured slower than bloom *on*. Setting tiers
>   from that would be fitting noise. Needs a mid-tier machine.
> - **P7.4 cleanup.** D6 telemetry single-sourcing and the disposal audit are
>   not done. The plan's named stray files are already gone.
> - **CP-1 through CP-8 are unjudged.** Every checkpoint in this plan is
>   Jacob's to call on his own GPU, and none has been called.
> - **Acceptance instrumentation is DEV-only.** `window.__correction` is
>   correctly absent from the production bundle, so the shipped artefact
>   cannot self-verify P1's criteria. Dev and production render identically
>   (lit 22.6%, mean 0.0441 on both), which is what makes the dev
>   measurements transferable — but that equivalence is the assumption the
>   numbers rest on, and it is worth re-checking whenever the build changes.


**Status: ACTIVE BUILD ORDER. Written 2026-08-14, after the cold review of the
running site. Supersedes the staging in `CORRECTION_BUILD_PLAN.md`; that file
remains authoritative for anything this one does not decide (interaction
canon, colour grammar detail, guardrails). Read `docs/HERO_DIRECTION.md` and
`CLAUDE.md` before any phase.**

This plan is written to be executed by a fresh session without re-deriving
anything. Decisions are made here. Where Jacob must judge, there is a named
checkpoint with exact artefacts to produce. Work the phases in order; each is
a vertical slice that ends in captures, not in claims.

---

## 0. Where the build actually stands (measured 2026-08-14)

The carrier is the **wounded planet of `76edad3`** plus the capillary-fissure
material pass (`255fe05`), with the correction newly wired into it:
`PlanetCorrection.ts` drives the staged pieces through the existing
`CorrectionOperator`; press → escape along the piece's own flight line → hold
→ monotonic return to the authored seat. At rest the frame is bit-identical
to the approved composition.

Baselines, so nobody re-measures from scratch:

| Fact | Value | Source |
|---|---|---|
| Peak screen displacement of a full press, nearest slab | **37 px (2.9% of viewport)** | measured in-page, 2026-08-14 |
| Press coverage before tolerant picking | 16% of frame | 11×11 raycast grid |
| Hold before engagement | ~0.8 s (`holdTicks: 96`) | `PlanetCorrection.ts` |
| Floor line on a no-press scroll | `ADJUSTMENTS APPLIED: 0.` | `captures/review/14-band-floor.png` |
| Slab/socket complementarity | 0.0000% mismatch, all five | `HERO_AUDIT`, `build-planet.py` |
| Blender toolchain | **5.1 pinned** — 4.5 gives same geometry, different bytes | both generators' docstrings |
| Hero GLB | 512 KB Draco; no UVs, no textures; mark in `COLOR_0` | exporters |
| Renders judged | RTX 3060, `tools/correction-capture.mjs` — the in-app pane cannot composite | memory: real-GPU capture route |

The rejected held-world build survives on branch `claude/held-world-rejected`
(`e5fce16`). Do not delete it; do not resurrect it.

**The one-sentence diagnosis this plan exists to fix:** the mechanism the
company is named for has never once been perceptible on screen — the site is
a handsome inert object above a very good essay, and the weld between them
(touch → deviation → correction → YOUR RECORD) exists in code at 37 px.

---

## 1. Non-negotiables (inherited, restated so they bind every phase)

- Stack: Vite + TS + Three.js/WebGL2/GLSL + GSAP/ScrollTrigger. **Zero new
  dependencies.** `package.json` gains nothing.
- Colour grammar, never redefined: **cyan = the world (deviation), amber =
  the model of the world (the record), violet = the consequence of their
  disagreement, only where correction acts (`V = D × C`).**
- Physical incandescence (melt, fissures, hot cut faces) is **not** part of
  the semantic layer. It is geology. The grammar colours are reserved for
  the deviation/record/consequence system and appear nowhere else.
- Light belongs to the break. Exterior crust near-black; no molten panels;
  slab undersides are ember-on-burnt-mass.
- No rotational symmetry; no camera pose down the blast corridor; no
  concentric-ring frame.
- Banned vocabulary in code/comments/commits/copy: `FULL FORM`, `MONOLITH`,
  `SEVEN MASSES`, `TUNNEL ENTITY`, `LATENT FORM`.
- Determinism: fixed-step sim (120 Hz), seeded randomness, no
  `Math.random()` in authoritative logic, byte-stable Blender builds on 5.1.
- Verification is rendered evidence on the real GPU. A clean console and a
  green typecheck prove nothing about a frame. Every phase ends with
  captures produced by `tools/correction-capture.mjs` and, where specified,
  numbers measured from the page.
- Editorial invents no numbers. Counts that the body of the site retracts do
  not appear in the hero.
- Jacob judges checkpoints on his own GPU. Do not mark a checkpoint passed
  from SwiftShader or from optimism.

---

## 2. Decisions made now, so they are not re-litigated mid-build

**D1 — The ghost is amber, and it is the record made visible.** When a piece
leaves its seat, its recorded pose renders at the seat as a restrained amber
presence — rim-weighted, depth-tested, no depth write, opacity scaled by
separation. Rationale: the 37 px failure is not amplitude, it is that the eye
has no reference state; an already-exploded composition gives deviation
nothing to read against. The record IS the reference state, and amber is
already its colour. This finally puts the site's own grammar on screen.
(Jacob may veto the ghost's *look* at CP-1; the need for a visible reference
state is not up for veto — if not a ghost, an equivalent must be proposed in
the same checkpoint.)

**D2 — Deviation is motion, not displacement.** A press currently teleports
the piece by adding to `u` in one tick, and small teleports are invisible.
The escape becomes a velocity impulse eased over 300–450 ms — the eye catches
motion at a fraction of the amplitude a jump needs.

**D3 — Press energy is sized in screen space, per event.** At press time,
compute the struck piece's projected size and scale the injected deviation so
peak displacement lands in the acceptance window (§P1). Deterministic: camera
pose + piece extent → same energy for the same input trace.

**D4 — The false first action happens where the visitor is looking.** Target
selection (for both the false action and tolerant-press fallback) is by
projected on-screen prominence, not world distance. An event the visitor
cannot see is not a lie about them, it is a no-op.

**D5 — Enforcement gain never reaches zero.** Floor ~0.08. The far field
shows corrections beginning and failing, not a system that has left.

**D6 — The Worker stays, demoted.** `PulseWorker`/`PulseClient` still boot
the halo field, the warm-up record and the triptych evidence. All
visitor-facing telemetry (`YOUR RECORD`, N, residual) comes from
`PlanetCorrection` only. Full consolidation is P7 cleanup, not before —
collapsing it earlier risks the boot path for zero visible gain.

**D7 — Strapline: the `THREE GAMES` count goes.** Replacement copy is drafted
in P6 and Jacob picks; nothing ships a count the body retracts.

**D8 — `BRAWLER` and `ROGUELITE` are labelled working titles** rather than
silently presented as final names. Renaming is Jacob's call alone and is out
of scope.

**D9 — Blender work targets 5.1 only.** Both generators already say so.

---

## 3. Phases

Sizing: one phase ≈ one focused session. Every phase ends with: typecheck
clean, captures written to `captures/<phase>/`, the phase's metrics printed,
and a one-paragraph honest report. If a phase's kill criterion fires, STOP
and report — do not absorb the failure into "tuning".

### P0 — Baseline lock (half session)

The working tree currently mixes the revert, the new wiring, and leftovers.

1. Commit the current state as the baseline: revert-to-`76edad3` composition
   + `PlanetCorrection` wiring + tolerant picking + audits. One commit,
   plain message.
2. Delete from the working tree (they live on the side branch):
   `HeldWorld.ts`, `HeldCorrection.ts` if still present; `patch6.tmp.py`.
   Decide-and-commit or delete `GLOBAL_CLAUDE.md`, `INSTALL.md`,
   `VALIDATION.md` (untracked strays — Jacob's call in one line each).
3. `world-macro.glb`/manifest are not loaded by the live path. Keep the
   files (the generator is real work) but confirm nothing fetches them.
4. Add to `tools/correction-capture.mjs`: an `--metrics` mode that prints,
   for a scripted press: struck piece id, projected piece size (px), peak
   screen displacement (px and % of piece size), time-to-peak (ms),
   settle time (s), and per-band subject-centroid position. Acceptance in
   every later phase reads from this, per the verify-by-looking rule.

**Exit:** clean `git status`, one baseline commit, metrics mode working.

### P1 — THE EVENT (the thesis slice — everything else waits on it)

Goal: one press produces an event nobody can miss, and the return reads as
enforcement, not animation.

Build, in `PlanetModel.ts` / `PlanetCorrection.ts` / one new small shader:

1. **Escape as motion (D2):** impulse → eased displacement, 300–450 ms to
   peak. While deviating, the piece carries a *restrained* cyan edge — the
   world, leaving. Cyan exists nowhere else.
2. **Screen-space energy (D3):** peak displacement of the struck piece
   ≥ 25% of its own projected size, and ≥ 140 px at 1440×900, clamped to
   stay in frame. Along the piece's own drift only.
3. **The amber ghost (D1):** recorded pose at the seat, rim-weighted amber,
   opacity ∝ separation. No fill bright enough to read as a second object.
4. **Violet at the closing gap:** when the operator engages, violet appears
   between piece and ghost — the consequence, only while correction acts.
   On settle, ghost gone, violet collapses into the piece's residue seam.
5. **Hold, then grip:** keep ~0.8–1.0 s hold. Return stays monotonic; the
   neighbour yield (0.22/0.13/0.07) stays; per-piece gain keeps arrival
   times uneven so the region converges, not the object.
6. **Counter truth:** the HUD counter and floor N increment visibly on the
   event; `visitAdjustments` already reads `PlanetCorrection`.

Acceptance (from `--metrics` + captures at deviation/hold/strain/settle):

- displacement ≥ 140 px @1440×900 and ≥ 25% of piece size; time-to-peak
  ≤ 0.5 s; full event (press → settled) between 2.5 s and 4.5 s.
- ghost legible in the hold and strain frames; cyan only during escape;
  violet only during engagement; grammar colours nowhere else in the frame.
- settled frame diff vs pre-press frame: nothing changed except the residue
  seam (and the counter).
- struck piece is the most prominent candidate near the cursor (D4).

**CP-1 (Jacob, on his GPU):** feel of the full beat, look of the ghost.

**Kill criterion:** if, with motion + reference state + correct scale, the
beat still reads as nothing, the interaction premise itself is dead. Stop.
Write the finding into `docs/decision/`, do not tune past it. (Ghost-specific
fallback before killing: outline-only ghost, or ghost shown only during
engagement — one iteration, not a tuning career.)

### P2 — THE FLOOR (the no-press path tells the truth by lying properly)

1. False first action fires during OPEN/ASK while the hero is on screen,
   targeting the most prominent slab (D4), full P1 visuals. The visitor who
   never touches anything still *sees* one enforcement happen.
2. Floor for that visitor: `ADJUSTMENTS APPLIED: 1.` and the inspectable
   diff (canon): `physical_event { source: SYSTEM }` /
   `recorded_event { source: VISITOR }` — the record's first entry is a lie
   they can catch.
3. Record copy sanity: `SIMULATION: NOT ENTERED` only on the skip path and
   reduced-motion path; `PREVIOUS VISITS` phrasing that survives a fresh
   visitor; carried adjustments render as residue seams on load.
4. Floor typesetting: the record lines get guaranteed contrast (measured
   ≥ 4.5:1 against what is behind them) — reposition or shade, do not glow.

Acceptance: scripted zero-input run shows the event and floor N=1; skip and
reduced-motion runs show their honest variants; contrast measured in capture.

**CP-2 (Jacob):** the floor, on all three paths.

### P3 — THE BODY (kill the two centre-frame CG tells)

1. **The melt ball.** Rewrite the core shader's structure: three scales of
   domain-warped fracture, convection provinces, limb response; brightness
   hierarchy — a few white-hot seams over mostly ember. No repeating cell
   scale identifiable at 1440p. The uniform Voronoi honeycomb dies.
2. **The orange panel.** The wound lining obeys the ember law: near-black
   burnt mass, sparse ember veins, no continuous orange sheet. Target: the
   wound region's lit-pixel share drops on the order of half while peak
   intensity survives (measure via capture histogram before/after).
3. **Wet crust.** Kill the broad glancing sheen; keep sparse hard mineral
   glints. Rock, not vinyl.

Acceptance: re-captured bands 11–14; histogram numbers; no grammar colours
introduced (heat stays heat).

**CP-3 (Jacob):** the three frames, before/after.

### P4 — THE WORLD (a planet, not an ember)

1. `build-planet.py`: raise feature *contrast* not amplitude — crease
   shading at scarps and crater rims, bake cavity/AO into the mark so the
   shader can darken recesses; keep the silhouette planetary.
2. An authored graze term in the crust shader (deterministic, in-shader,
   not a scene light) so terrain reads in relief where the star cannot
   reach. Restraint: it shapes, it does not illuminate.
3. Debris material: chunk cut faces flat-shaded and angular; three
   silhouette families instead of uniform pebbles; find and fix the literal
   triangle-wedge ejecta; dust gains a near-body scale gradient.
4. Scale cues: micro-detail gradient toward the wound, debris size falloff.

Acceptance: from stills alone, three nameable features (crater rim, scarp,
plateau) — the auditor agent must name them unprompted. `HERO_AUDIT` stays
OK. No ring reads. Byte-stable rebuild on 5.1.

**CP-4 (Jacob):** wide + close crust frames.

### P5 — THE JOURNEY (five shots, not one shot five times)

1. Per-band composition: subject off-centre by rule-of-thirds offsets that
   differ per band; one band framed *through* foreground debris; the wide
   reveal stands on the blast side (HERO_DIRECTION) with wounds and slabs
   in one frame; floor arrival composed for the record panel.
2. The enforcement gradient made visible: in the GRADIENT band, a scripted
   distant piece escapes and is caught *slowly*; near the floor, instantly.
   At the far fringe, one correction is seen failing to finish (D5).
3. Scroll copy beats align with what is actually on screen at that band.

Acceptance: subject centroid varies ≥ 15% of frame width across bands
(measured); gradient band capture shows a mid-flight enforcement; no band
looks down the corridor.

**CP-5 (Jacob):** the six band captures as a strip.

### P6 — THE WORDS (the two halves finally introduce each other)

1. Strapline replacement (D7) — three drafted options, all defensible from
   the evidence table, Jacob picks one.
2. Working-title labels (D8).
3. **The weld sentence.** At the floor → editorial handoff, one line that
   names the rhyme the site already contains: the record that diverges from
   reality is what you just experienced *and* what Desk42 is. Draft three,
   Jacob picks. This is the highest-leverage sentence on the site.
4. Restructure: player-facing content (premise, Desk42, Brawler) before
   diligence content (evidence tables, scalability position); everything
   still directly reachable — the company-clarity list in `CLAUDE.md` is
   the checklist. Fix the truncated studio paragraph.
5. Sweep hero/editorial for any remaining claim-vs-body contradiction.

Acceptance: auditor agent passes company clarity (thesis, Desk42, Brawler,
technology, studio, contact — findable and understandable without decoding
the hero); zero contradictions list.

**CP-6 (Jacob): copy approval — nothing ships words he did not pick.**

### P7 — SURFACES (everyone else's machine)

1. Mobile recomposition: portrait framing per band (recompose, don't
   scale), tap = press with the tolerant picker, dust/bloom tiers via
   `QualityManager`, type scale.
2. Reduced motion: static composed frame + honest record path; press
   correctly refused (already) with the refusal *visible*.
3. Performance: measure on the 3060 at 1440p (target 60) and a mid-tier
   profile (target 30 with tiers engaged); document draw calls, dust
   counts, bloom cost; set the tier thresholds from measurements, not
   guesses.
4. Cleanup: telemetry single-sourced (D6 completes), dead code from the
   carrier era removed (`buildRail` remnants, unused loads), disposal audit
   (geometries, materials, targets, listeners), untracked files resolved.
5. Determinism proof: two scripted identical visits → identical records;
   two Blender rebuilds → identical bytes.

Acceptance: fps numbers written down per profile; mobile captures at two
widths; determinism outputs pasted into the report.

### P8 — FINAL (cold eyes)

1. `dark-lattice-auditor` full pass against `CLAUDE.md`,
   `HERO_DIRECTION.md`, and this plan's acceptance criteria.
2. Fix list triaged: blockers fixed, the rest written down honestly.
3. Ship checklist: build, byte-stability, captures archived, branches
   cleaned, docs updated to final state.

**CP-8 (Jacob): ship / hold.**

---

## 4. File map (where the work lands)

| Area | Files |
|---|---|
| Event, ghost, grammar colours | `src/scene/correction/PlanetModel.ts`, `PlanetCorrection.ts`, new `src/shaders/ghost.*.glsl` (or inline material), `planet-fragment.frag.glsl` (residue only) |
| Floor / record | `src/ui/RecordController.ts` (or current owner of YOUR RECORD), `SceneController.ts` |
| Core + lining + crust lookdev | `src/scene/correction/PlanetModel.ts` (core material), `src/shaders/planet-fragment.frag.glsl` |
| Geology, debris, marks | `tools/blender/build-planet.py` (Blender 5.1), re-export `planet.glb` |
| Journey | `SceneController.ts` (`buildRail`, bands), `src/motion/ScrollDirector.ts` |
| Words | editorial DOM/copy files under `src/` (locate via `SKIP TO COMPANY INFORMATION`) |
| Metrics & proof | `tools/correction-capture.mjs` |

## 5. Standing risks, named once

- **R1 — The event still doesn't land at CP-1.** Then the premise is dead
  and the plan stops at P1 by design. Everything after P1 is sequenced
  behind it precisely because of this.
- **R2 — The ghost reads as a hologram gimmick.** One fallback iteration
  (outline-only / engagement-only), then CP-1 decides.
- **R3 — Lookdev regressions.** Every P3/P4 change re-runs the band
  captures; the approved `11-band-ask` frame is the reference — that frame
  getting worse is a regression regardless of what improved.
- **R4 — Scope creep back into carrier-hunting.** This plan builds on the
  approved composition. Any proposal that replaces the hero object is out
  of scope for every phase. Twelve carriers is enough.
