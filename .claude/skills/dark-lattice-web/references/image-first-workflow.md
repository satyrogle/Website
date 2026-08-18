# Image-first workflow

```text
IMAGE FIRST
MOTION SECOND
TECHNOLOGY LAST
```

## Why this exists

Thirteen carriers were designed in prose, built in code, and rejected on sight.
Three website architectures and three visual journeys went the same way. The
common cause was never taste: **the picture was the last thing anyone saw, and
by then it had already cost days.**

The reversal is total. A picture is approved, then motion is studied from that
picture, then the cheapest technology that preserves it is chosen. Nothing is
implemented to illustrate an idea.

## Gate order

| Gate | Produces | Source paths |
|---|---|---|
| 0 Repository truth | facts, no edits | closed |
| 1 Two-frame kill test | opening + reveal per candidate | closed |
| 2 Cold review | blind reviewer answers | closed |
| 3 Six-frame board | survivors only | closed |
| 4 Founder approval | `docs/APPROVED_VISUAL_JOURNEY.md` | closed |
| 5 Motion previs | transition studies from stills | closed |
| 6 Technical decision | `docs/TECHNICAL_FIDELITY_DECISION.md` | closed |
| 7 Vertical slice | opening, one interaction, descent, discrepancy | **open** |
| 8 Real-content proof | real company material only | open |
| 9 Production and audit | full sequence, all audits | open |

Source paths open at Gate 7 and not before.

## What a reference board must contain

Never a mood collage. Every entry carries three fields, and an entry that cannot
fill all three does not belong on the board.

```text
TAKE     the exact visual quality being used
REJECT   the literal object, industry or cliché that must not be copied
FRAME    which journey frame it informs
```

Boards are grouped by what the reference teaches, not by where it came from:

```text
SCALE  LIGHT  MATERIAL  ATMOSPHERE  DESCENT  DISCREPANCY  REVEAL  RETURN
ANTI-REFERENCES
```

The anti-reference group is mandatory. A board without one has not defined its
own failure.

## What a frameboard must contain

Per frame, before any image is generated:

- **Camera** — position, height relative to the subject, what it is aimed at,
  what it deliberately does not frame
- **Composition** — where mass sits, where void sits, what crops the frame edge,
  where the text-safe zone is
- **Value** — what is black, what is lit, where the brightest point sits and what
  it costs; the highlight ceiling and what peak white is reserved for
- **Material** — what the surfaces are, and what they are explicitly not
- **Light law** — why light is where it is, stated as a physical cause
- **Scale cue** — the specific thing that states the size
- **Reading order** — first, second, third
- **Continuity** — what carries from the previous frame unchanged
- **Kill condition** — what would make this specific frame dead

## Controlled generation

Generation happens only after camera, composition, material, lighting, scale and
continuity are defined. Never six unrelated text-to-image frames: six
independent prompts produce six unrelated ideas that share a mood, which is the
same failure as choosing a premise from prose.

One frame at a time. Each approved frame becomes the image reference for the
next, and the next prompt states **only what changed**. It never re-describes
the world, the grade, the light or the scale — those arrive in the reference
image, and restating them invites reinvention.

Preserve good regions by compositing rather than regenerating the whole frame.

## Required variants for every candidate frame

```text
full treatment
grayscale
bloom disabled
fog reduced
text-safe-zone overlay
```

1440x900. Same finish across all candidates, or the comparison is worthless.

**No implementation explanation is placed over the image.** The frame is judged
as a picture.

## Approval

Not inferred from enthusiasm, positive language, or a frame that looks good.
Approval is Jacob's exact phrase written into `docs/APPROVED_VISUAL_JOURNEY.md`:

```text
DARK LATTICE <H1/H2/H3> VISUAL JOURNEY APPROVED
```

## When a frame is called dead

1. Describe what is literally visible.
2. Classify the defect: structural or cosmetic.
3. Attempt one targeted correction **only** if the concept was never honestly
   exercised.
4. Otherwise kill the direction.
5. Never defend sunk cost.
