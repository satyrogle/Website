# APPROVED VISUAL JOURNEY

```
STATUS:   NOT APPROVED
AS OF:    2026-08-18
APPROVED IMAGE: none
APPROVED JOURNEY: none
```

**This file is a gate, not a plan.** While the status line above reads anything
other than `APPROVED`, no new or changed visual direction may be built. Nothing
in any other document, board, brief or previous implementation overrides that,
and nothing may be inferred as approved.

The gate exists because thirteen carriers were built from written descriptions
and rejected on sight. Code is no longer allowed to precede an approved picture.

---

## 1. WHAT THE GATE CLOSES

Closed to **new-direction work** while status is not `APPROVED`:

```
src/                 including src/scene/ and src/shaders/
public/models/
gate-b/src/
proofs/src/  proof/src/
architectures/
tools/blender/
```

Open at all times, because none of it decides what the site looks like:

- bug fixes and regressions in existing code,
- accessibility, keyboard, focus and reduced-motion work,
- performance, build, tooling and capture scripts,
- editorial copy, company information, legal pages,
- documentation, boards, reference research,
- deleting or archiving retired work.

**The test for whether a change is gated:** would it alter what a visitor sees
as the identity of the site? If yes, it is gated. Repairing something already
approved is not new-direction work. Extending it into new imagery is.

If a task appears to require gated work, stop and say so. Do not build a
"quick proof" to illustrate a proposal. That is the exact move that produced
thirteen rejections.

---

## 2. HOW THE GATE OPENS

1. Jacob generates opening-frame images from `docs/IMAGE_PROMPT_PACK.md`.
2. Jacob picks the one picture he wants to look at. **That picture names the
   direction.** The direction is not named in prose first.
3. The image is saved into `references/chosen/` and recorded in section 3 below,
   by filename.
4. A frame board is written **from the approved image**, never from imagination.
5. Frames 2 to 6 are generated in the winner's visual world, one at a time,
   chained per `docs/IMAGE_PROMPT_PACK.md`.
6. Jacob's approval is written into section 3 in his own words, with the date.
7. Status becomes `APPROVED`. Only then is the question asked: how is this
   specific picture built.

An approval covers **the image recorded against it and nothing else.** Approving
frame 1 does not approve frames 2 to 6. Approving a still does not approve a
camera move. Approving a direction does not approve a full page.

---

## 3. THE APPROVAL RECORD

Empty. Filled only by Jacob's decision, never by inference.

```
SELECTED DIRECTION:      —
NAMED BY IMAGE:          —
JACOB'S APPROVAL, VERBATIM:
                         —
DATE:                    —
```

| Frame | Role | Approved image | Board section | Approved |
|---|---|---|---|---|
| 1 | Opening | — | — | no |
| 2 | Approach | — | — | no |
| 3 | Descent | — | — | no |
| 4 | First discrepancy | — | — | no |
| 5 | Hidden reveal | — | — | no |
| 6 | Return | — | — | no |

Mobile recomposition is a separate approval and is not implied by any row above.
Minimum before implementation: Opening, Descent, Reveal.

---

## 4. REJECTED ALTERNATIVES

Recorded so none of them is rediscovered as a fresh idea. Full reasoning lives
in `CLAUDE.md` and the documents named. **None of these may be refined, rescued
or re-primitived.**

### Gate B, rejected 2026-08-17

| Direction | Why it died |
|---|---|
| The Black Sun Protocol | Best finished composition, and rejected for it. The perfect black disc gives the brain the answer instantly. Reads as an eclipse or black-hole site. Kept as a compositional reference only. |
| The Critical Bloom | Combed hair around a lump. Rebuilt as a density-estimated caustic field and then read as torn or spattered material. Rejected on sight, twice. |
| The Witness Field | Strongest line and strongest mechanism of the three. The image stayed thin: 99.5 percent black is absence, not restraint. |

### Journeys, 2026-08-18

| Journey | Status |
|---|---|
| A — The Congregation | Chosen, then **unlocked the same day**. Not rejected. Demoted to one candidate among six in the image prompt pack, because it had been chosen from prose. |
| B — The Slow Fire | Rejected. Bigger spectacle, generic space-art risk. |
| C — The Still Sea | Rejected as a journey, too static to carry the homepage. Retained as image-pack premise 6 so it is tested as a picture. |

Boards written for A before the unlock are kept as record, not as a
specification: `docs/CONGREGATION_REFERENCE_BOARD.md`,
`docs/CONGREGATION_FRAME_BOARDS.md`.

### Earlier carriers, retired

The Containment v5 and v5.2, the entity hero at `1530d7f` and its four-frame
gate, The Held World, The Correction, the Choir, the band, the breaking planet,
the crown, the halo, the tunnel, Signal Horizon, the trench and truss, the False
Façade, The Lattice.

### Banned constructions

No orb, planet, eclipse, portal, halo, tunnel, radial bloom, filament field,
giant abstract blob or generative line field. And the one that generalises them:
**no single cool 3D object sitting next to company copy.**

---

## 5. WHAT IS STILL UNRESOLVED

Listed honestly, because an unresolved item read as settled is how the last
thirteen started.

1. **The opening image.** Nothing has been generated from the prompt pack yet.
   Everything below waits on it.
2. **Website architecture.** `architectures/proceeding.html`,
   `criticality.html` and `claim-and-run.html` exist and were captured to
   `captures/architectures/`. **No decision is recorded for any of them.** They
   are neither approved nor rejected.
3. **Journey versus architecture.** Whether the approved image drives a
   scrubbed virtual-scroll journey, a long-scroll documentary, or something
   else, is open. `docs/REFERENCE_LIBRARY.md` section 1 measured three distinct
   architectures and the choice between them has not been made.
4. **Accessibility inside a journey.** The reference library found that nobody
   on the board solved it except the long-scroll sites. Igloo and House of Moves
   ship 27 and 19 DOM nodes and effectively no accessible content. If a scrubbed
   journey wins, this is unsolved work, not a detail.
5. **Darkness versus material.** Three of the strongest references are light,
   not dark. Staying brutally dark means needing more material fidelity than
   those sites, not less.
6. **Build technology.** Chosen last, from the approved frames. Authored
   geometry, sculpted meshes, volumetric shaders, raymarched fields, procedural
   texture, layered fog, point clouds, displacement, image sequences, selective
   particles and compositing are all open. None is pre-selected.

---

## 6. WHY THIS FILE EXISTS RATHER THAN A SECTION IN CLAUDE.md

`CLAUDE.md` records how the project got here and is now long enough that current
truth has to be reconstructed from layers. This file answers one question with
no reading: **is there an approved direction, and what is it.** If the two ever
disagree about approval, this file is the one that is wrong and must be
corrected — approval is a decision Jacob makes, and it is recorded here in the
same breath.
