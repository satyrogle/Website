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
| A-01 | Full Form built from piers, lintels, jambs and belt courses; reads as scaffolding or a ruined doorway | A | in-gate |
| A-02 | Rectangular central aperture with obvious left/right/top/bottom boundaries | A | in-gate |
| A-03 | Full-width top bridge closes the silhouette like a gate | A | in-gate |
| A-04 | Outer masses too narrow and pole-like; insufficient visual weight | A | in-gate |
| A-05 | Horizontal belt courses create modular kit repetition | A | in-gate |
| A-06 | Masses differ by parameter variation, not authored character | A | in-gate |
| A-07 | Depth hierarchy weak; silhouette decided by front-view vertical strips | A | in-gate |
| A-08 | Halo disc is ~3.2× the form width; competes with the subject | A | in-gate |
| A-09 | Fracture is micro-noise over macro boxes — damaged masonry, not fractured alien architecture | A | in-gate |
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
| T-06 | Halo faintly visible through the central passage as a warm patch | A/C | in-gate |

## P3 — noted, not scheduled

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| N-01 | All five prologue beats remain in the accessibility tree at opacity 0; a screen-reader user hears every statement regardless of scroll position. Deliberate in v1, but should be reconciled with the `inert` work in D-07. | D | open |
| N-02 | Violet retained network covers most of the latent core rather than concentrating into one seam | C | open |

## Introduced during v2

| ID | Defect | Gate | Status |
| --- | --- | --- | --- |
| V-01 | The Blender workbench is realised from an authored data table by script rather than by interactive hand-modelling. Every profile ring, lobe, mass boundary and depth tier is explicit and reviewable, and the saved `.blend` is editable, but the shape has not been sculpted by hand. | A | open — for founder decision |
