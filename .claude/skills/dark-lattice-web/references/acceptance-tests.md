# Acceptance Tests

## Core concept

Fail if:
- menace comes mainly from horror decoration,
- the hero is just a video/pre-rendered wallpaper pretending to be realtime,
- interaction has no causal consequence when causality is part of the feature,
- decorative effects dominate the underlying system,
- the site becomes a generic AI/SaaS/cyberpunk template,
- multiple competing hero ideas dilute the composition.

## Visual slop

Flag as blocking when unjustified:
- purple nebula,
- glowing runes,
- chains/skulls,
- floating rubble,
- particle storm,
- generic portal ring,
- horn/tentacle clutter,
- excessive bloom/fog,
- fake sci-fi HUD,
- tiny techno typography,
- component-library showcase look,
- motion on every UI element.

## Company/UX

Fail if:
- Work, Technology, Studio or Contact are difficult to reach,
- Desk42/Brawler are buried,
- a non-art audience cannot understand Dark Lattice,
- mobile navigation breaks,
- hero copy is unreadable,
- reduced-motion loses the experience entirely,
- no-WebGL blocks company content,
- canvas/effects block keyboard, selection or normal navigation.

## System

When deterministic behavior is claimed, fail if:
- simulation outcome depends materially on frame rate,
- reset cannot reproduce authoritative opening state,
- important runtime logic uses unseeded randomness,
- GPU visual output is incorrectly treated as cross-machine deterministic authority,
- previous interaction should create memory but leaves none,
- system response looks like neon electricity/screensaver art.

## Performance

Fail if:
- visible unstable frame pacing,
- unbounded DPR,
- huge simulation textures without measured need,
- thousands of unnecessary individual scene objects/components,
- resources grow unbounded across remounts,
- post FX compensate for weak composition.

## Required browser evidence for meaningful visual work

Inspect representative:
- desktop,
- mobile,
- normal motion,
- reduced motion.

For scroll-driven hero work, capture the meaningful narrative phases.

Which phases those are comes from the approved journey. There is no approved
journey: `docs/APPROVED_VISUAL_JOURNEY.md` reads `NOT APPROVED`, and H1, H2 and
H3 stand equal. Until one is approved, audit the site that exists on its own
terms. The current `src/` predates every current candidate and is not a failed
attempt at any of them.

### RETIRED — THE INTAKE capture spec

Kept as a graveyard record so it is not reinvented, in the same way as
`hero-concept.md`. THE INTAKE was retired by the 2026-08-17 refoundation. Do not
capture against it and do not audit against it. Its amber-and-cathedral
vocabulary is separately banned by `CLAUDE.md`.

> Capture five beats: the face, the ask, the descent, the floor, look up. Then
> verify: opening = calm, near-symmetric, holy, amber rising from a wound in a
> black plain; descent = one growth system whose parameters slide from ordered
> to root-like, no set pieces; aperture = the opening above is smaller at each
> scripted look-up, and nothing says so; the record assembles above and behind,
> always later and always simpler; floor = a file about the visitor that is
> wrong, not a creature; look up = the amber cathedral is recognisably the
> divinity from beat one; final dread = comprehension, not spectacle. Fail the
> capture if any frame reads as concentric rings.

## Pass

Pass only when:
- visual system feels specific to Dark Lattice,
- hierarchy is restrained and authored,
- system behavior has causal meaning,
- company/editorial content is credible and legible,
- desktop/mobile/reduced-motion paths are real,
- production build passes,
- browser console/runtime evidence is clean enough for release.
