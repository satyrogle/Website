# V2 defect register

Open defects carried into `claude/cinematic-editorial-rebuild-v2`.
Severity is the plan's scale: **P0** wrong design language or blocks the
gate, **P1** major visual/runtime failure, **P2** visible defect that is
shippable after correction, **P3** polish.

Status is one of `open`, `in-gate`, `fixed`, `wontfix`. Nothing is marked
fixed until the gate that owns it has founder approval.

## P0 — visual language

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| A-01 | Full Form built from piers, lintels, jambs and belt courses; reads as scaffolding or a ruined doorway | A | addressed, awaiting approval |
| A-02 | Rectangular central aperture with obvious left/right/top/bottom boundaries | A | addressed, awaiting approval |
| A-03 | Full-width top bridge closes the silhouette like a gate | A | addressed, awaiting approval |
| A-04 | Outer masses too narrow and pole-like; insufficient visual weight | A | addressed, awaiting approval |
| A-05 | Horizontal belt courses create modular kit repetition | A | addressed, awaiting approval |
| A-06 | Masses differ by parameter variation, not authored character | A | addressed, awaiting approval |
| A-07 | Depth hierarchy weak; silhouette decided by front-view vertical strips | A | addressed, awaiting approval |
| A-08 | Halo disc is ~3.2× the form width; competes with the subject | A | addressed, awaiting approval |
| A-09 | Fracture is micro-noise over macro boxes — damaged masonry, not fractured alien architecture | A | addressed, awaiting approval |
| B-01 | Tunnel ribs close into four-sided rectangular loops | B | open |
| B-02 | Tunnel reads as a generic sci-fi corridor / repeated portal frame | B | open |
| B-03 | Tunnel enclosed by separate wall, floor and ceiling panels rather than revealed from the entity | B | open |
| B-04 | No continuing inner spine with a distinct silhouette through the passage | B | open |
| B-05 | Latent Form is a `Π` — a miniature doorway rather than a condensed core | B | open |
| B-06 | Latent Form lacks a macro retained seam; the shader carries all narrative | B | open |
| P-01 | v1 was produced as one commit with no founder-controlled art gate | — | fixed by the gated plan |

## P1 — material, runtime and composition

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| C-01 | One cell-noise system serves every surface; fissures risk reading as procedural wallpaper | C | open |
| C-02 | Macro form shading subordinate to crack detail; fissures read before silhouette | C | open |
| C-03 | No distinct architectural strata between crust, structure, spine and core | C | open |
| C-04 | Halo uses an annular band function, so the maths still favours a ring read | C | open |
| C-05 | Whole-part sinusoidal scale pulse encodes breathing rather than structural pressure | C | open |
| C-06 | Latent Form is multiplied brighter rather than made denser by geometry | C | open |
| C-07 | Retained state is an analytic `uTrace` UV mask following the field, not the field's own retained state | C | open |
| D-01 | Copy safe zones are generic screen percentages, not authored from landmarks | D | open |
| D-02 | Masthead visible and unchanged throughout the cinematic sequence | D | open |
| D-03 | Hero CTA links to `#work` and skips the prologue it introduces | D | open |
| D-04 | Every cinematic statement uses one display voice at different sizes | D | open |
| D-05 | Mobile places nearly every statement in the same lower band | D | open |
| D-06 | WebGL failure returns before the director is constructed, leaving absolutely-positioned beats uncontrolled over the poster | D | open |
| D-07 | Faded hero CTA remains keyboard-focusable; opacity and `pointer-events` do not remove focus | D | open |
| D-08 | Mobile 390×844 hero wordmark overlaps the base of the outer masses | D | open |
| R-01 | `renderStill()` calls `applyPoster()` in normal motion, so resize or re-entry can reset a live session to the hero camera | C | open |
| R-02 | `ReactionField.resize()` inert after seeding, so quality demotion cannot reduce simulation resolution | C | open |
| E-01 | Both products use the same arrow-chain component; no real artefact is shown | E | open |
| E-02 | No project detail pages, studio block or validated contact route | E | open |
| E-03 | Evidence page has no review date, build SHA, source registry or SatyBT link | E | open |
| E-04 | Evidence manifest and integrity checker were removed in v1 | E | open |
| E-05 | Third game still described publicly on the evidence page | E | open |

## P2 — defects and QA

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| Q-01 | Subject bounding box inferred from luma; near-black structure can be omitted, so copy can overlap real geometry while the gate passes | D/F | open |
| Q-02 | Banned-word scan used as a proxy for visual form | F | open |
| Q-03 | Fallback tests verify text presence, not fallback composition | D | open |
| Q-04 | Brawler not captured in the main viewport loop | E | open |
| Q-05 | Only 1440, 1366 and 390 widths captured; 1920, 412 and 360 missing | F | open |
| Q-06 | No slow-network or blocked-font path | F | open |
| Q-07 | Hidden keyboard focus not tested per beat | D | open |
| Q-08 | No object-mask or depth-based landmark test | D/F | open |
| T-01 | `TextReveals.init()` and `revealHero()` both bind the hero's `.fade-in` elements | D | open |
| T-02 | Masthead has no state-aware contrast treatment | D | open |
| T-03 | Masthead brand link uses `href="/"` against a `base: './'` build | D | open |
| T-04 | Tunnel rib spacing produces a run of near-even frames around progress 0.55 | B | open |
| T-05 | Motes read as a sparse starfield rather than a medium | C | open |
| T-06 | Halo faintly visible through the central passage as a warm patch | A/C | superseded — there is no central passage in the v2 form |

## P3 — noted, not scheduled

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| N-01 | All five prologue beats remain in the accessibility tree at opacity 0; a screen-reader user hears every statement regardless of scroll position. Deliberate in v1, but should be reconciled with the `inert` work in D-07. | D | open |
| N-02 | Violet retained network covers most of the latent core rather than concentrating into one seam | C | open |

## Observed at Gate A — closed by the R1 correction pass

The founder review of 2026-08-09 did not approve Gate A and required one
clay correction pass. Measured against
`design/clay/gate-a-r1-measurements.json`; 15 of 16 checks pass.

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| GA-01 | One mass held 48.3% of the visible projected area. | A | corrected — dominant A is now 29.6%, and still the largest |
| GA-02 | The two rear masses held 3.7% and 2.2%. | A | corrected — 7.1% and 6.6%, inside the preferred bands |
| GA-03 | The base read as a separate plinth ring. | A | corrected — the plinth setback is gone, the base is sheared on a tilted plane and the three ground-touching masses terminate at different heights |
| GA-04 | Declared roles did not match measured areas. | A | corrected — hierarchy was fixed first, then `role` and `tier` were written to describe the measured result, and the checks now assert the role of each band |
| GA-05 | Two sliver masses detached at 128px. | A | corrected — one connected component, 100% of area in the largest |
| GA-06 | No recess at all; the front channel had been lost. | A/B | corrected for Gate A — an irregular, off-centre, tapered recess is cut into the front wall. The full camera passage remains Gate B work and has not been cut |
| GA-07 | The inner spine read at 0.5% of the hero projection. | A | corrected — 2.27%, inside the required 1.5–3.0% band, seen through the recess rather than over the crown |
| GA-08 | Clay renders are Workbench studio lighting and do not show behaviour under the site's own key/rim arc. | C | open — Gate C |

## Observed at Gate A R1

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| R1-01 | The dominant A/B interface projected as one near-straight boundary over roughly half the height. | A | corrected — the interface is four authored complementary sections; longest contiguous segment 24.4% across 11 measured segments, against a 30% target, and `straight-aperture-edge` is 27.1% against < 40% |
| R1-02 | The three depth tiers correlate with height rather than interleaving up the form. | A | open — diagnosed, deliberately not corrected. See R2-05 |
| R1-03 | Two labels overlapped in the mass-area overlay. | A | corrected — A11 uses a side legend with leader lines, and A14's bar and tier-band labels were unclipped and de-collided in the same pass |

## Observed at Gate A R2

Measured against `design/clay/gate-a-r2-measurements.json`; 17 of 17
checks pass. R2-01 to R2-04 were raised against the first R2 submission
(commit `dc67545`) and are recorded with their causes because each was a
wrong diagnosis worth not repeating.

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| R2-01 | `straight-aperture-edge` was 43.6% against < 40%, reported as an unfixable second straight plane in the west-columns fracture. That was a misreading. The run was at x 579 against a bounding box starting at x 576 — it was the **outer west silhouette**, which the aperture measure only sees because it takes the last gap-to-structure transition per row, and there were no gaps at all: rows 500–748 were solid from x 577 to x 865. The fracture opened no air anywhere, so an aperture measure had nothing to measure and fell through to the outer edge. | A | corrected — with real air at the interface the run is a genuine internal aperture edge at 27.1%, structure on both sides |
| R2-02 | Dominant B was 22.3% against 19–22%, reported as the closest split reachable. Also a misreading: the pair only trade area one-for-one at a **fixed** air width. Widening the fracture removes area from both at once, so the interface position and the air width are two independent controls, and the two bands are reachable together. | A | corrected — 28.9% / 21.5%, both mid-band |
| R2-03 | Spine visibility was 0.89% against 1.5–3.0%, reported as needing the recess re-authored against the displaced masses. The spine is glimpsed **between the dominants**, not only through the recess; R1 saw it through the notch-plane gaps. R2 removed the notches and sealed the sightline, and the enlarged recess and spine that were meant to compensate did not, because the obstruction was dominant A blanketing the void. | A | corrected — 2.38% with the R1 recess and spine restored unchanged; the interface itself carries the sightline |
| R2-04 | Fast and full render passes were said to disagree on the object-ID masks, cause unknown. Cause found: `DL_FAST` wrote **only** `A00-mask-hero`, so every elevation- or gap-derived reading during tuning came from whatever the last full pass had left on disk. The readings were not disagreeing, they were of different vintages. | — | corrected — `DL_FAST` now writes the hero mask, the elevation mask and the gaps pass, using the same framing calls as the full pass; fast and full readings match figure for figure |
| R2-05 | The front tier occupies 42–100% of visible height and the mid tier 0–47%, overlapping by only 5% of height. Front and mid are close to horizontally stacked, which is the R1-02 risk. No adjustment was made: §6 authorises one only when the diagnostic shows **one uninterrupted** horizontal tier boundary, and it does not — the rear tier spans 0–90% and crosses the front/mid transition, with mass 07 above it and mass 01 below. Evidence is `A14-depth-height-interleave.png`. | A | open — carried as a visual risk for founder scoping, not silently corrected |

## Introduced during v2

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| V-01 | The Blender workbench is realised from an authored data table by script rather than by interactive hand-modelling. Every plan point, level, setback, fracture plane and displacement is explicit and reviewable in `tools/blender/monolith_v2_form.py`, and the saved `.blend` is editable, but the shape has not been sculpted by hand. | A | open — for founder decision |
| V-02 | `tools/build-monolith.mjs` was archived, so `npm run asset` no longer exists. The v2 asset is built with `blender --background --python tools/blender/build_monolith_v2.py`. | A | open |
