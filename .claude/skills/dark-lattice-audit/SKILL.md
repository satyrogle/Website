---
name: dark-lattice-audit
description: Cold reviewer for Dark Lattice - blind visual review of candidate frames, constitution audit against the 30 banned patterns, accessibility, evidence and performance. Use to judge work that already exists, never to produce or defend it.
disable-model-invocation: true
---

# Dark Lattice Audit

**This skill judges. It never produces, and it never defends.**

If you find yourself explaining why a frame is acceptable, you are in the wrong
skill. Report the defect and stop.

## Mode A — cold visual review

Run this on candidate frames BEFORE Jacob sees them, and record the answers
verbatim.

**The reviewer must not be told the concept name, the governing sentence, the
intended reading, or which candidate it is.** A frame that needs its concept
explained has already failed. Show the image and nothing else.

Ten questions, asked in this order:

```text
1  What are you looking at?
2  What industry could own this?
3  What feels holy?
4  What feels generic?
5  What is physically real?
6  What is the strongest visual element?
7  What is the weakest?
8  Does the reveal belong to the opening?
9  Does the image survive without atmosphere?
10 Could the Dark Lattice name be replaced without changing it?
```

Record answers. Do not argue with them. Do not soften them for the record.

### Literal-read kill test

If an untold reviewer names the frame as any of the following, the frame is dead
on the spot:

mine, quarry, factory, cathedral, temple, starfield, cemetery, LED installation,
data visualisation, matrix, sci-fi hangar, dome, cooling tower, spaceship
interior, generic WebGL art, AI concept art, crystal cave, reactor, bridge,
glowing architecture, chandelier, a cool 3D object beside company copy.

Per-candidate kill conditions live in
`docs/DARK_LATTICE_THREE_HYBRIDS_EXECUTION_KIT.md`. Apply them exactly.

### The rescue test

Ask separately of every frame:

- Does it survive in grayscale?
- Does it survive with bloom disabled?
- Does it survive with fog reduced?

**Atmosphere, darkness, bloom and technical complexity may not rescue a weak
composition.** A frame that only works with all three enabled has failed, and
saying so is this skill's job.

## Mode B — constitution audit

Run the full Section 13 gate from
`DARK_LATTICE_WEB_DESIGN_CONSTITUTION.md`. Nothing is skipped.

```text
Gate A  all 30 banned patterns: PASS / NOT APPLICABLE / FAIL / EXCEPTION APPROVED
Gate B  disguised equivalents, all six questions
Gate C  evidence: claims supported, limitations visible, ambition not stated as fact
Gate D  interaction: reveals behaviour, works with touch/keyboard/reduced motion
Gate E  production: the full checklist, desktop through legal links
```

Then the Section 14 scorecard. Report the number honestly:

```text
Specificity  Evidence  Composition  Restraint  Interaction  Legibility
```

Required: no automatic failure, no unresolved banned pattern, at least 10 of 12,
Specificity exactly 2, Evidence at least 1, Legibility at least 1.

**Check disguised equivalents explicitly.** Three cards stacked vertically are
still three cards. A cyan orb is still an orb. A blurred panel by another name
is still glassmorphism.

## Mode C — production audit

Only for work that exists in a browser:

- accessibility: keyboard, focus, screen reader, contrast, text scaling,
  reduced motion, `@axe-core/playwright` where a UI state exists
- performance: LCP 2.5s or less at p75, INP 200ms or less, CLS 0.1 or less, DPR
  capped, non-critical assets deferred
- failure paths: loading, empty, error, retry, WebGL unavailable, JS disabled
- legal: Terms and Privacy present where required, real and reviewed
- factual claims: every capability claim traced to real project evidence, no
  invented metrics, seeds, benchmarks or traces

## What this skill must never do

- Never invent a number for a Dark Lattice surface.
- Never use a measurement to overrule Jacob's visual judgement. Measurements
  diagnose an implementation; they are not acceptance.
- Never argue a frame back after he has called it dead.
- Never recommend tuning as the answer to a kill word.
- Never approve. Approval is Jacob's exact phrase, written into
  `docs/APPROVED_VISUAL_JOURNEY.md`, and nothing else.
