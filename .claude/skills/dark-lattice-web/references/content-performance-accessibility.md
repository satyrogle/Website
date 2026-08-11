# Content, Responsive Design, Performance and Accessibility

## Information architecture

The realtime hero must not consume the company.

Directly reachable sections:

1. Studio thesis
2. Work
   - Desk42
   - Brawler
3. Technology / deterministic systems
4. Studio / company
5. Contact

Navigation must not force a visitor to replay the hero.

## Audience test

A player, collaborator, contractor, press contact or endorsement assessor should understand:
- what Dark Lattice is,
- what it builds,
- what Desk42 and Brawler are,
- why the systemic/deterministic approach matters,
- how to contact the studio.

The visual system may be enigmatic.

The company explanation may not be.

## Copy discipline

Avoid:
- pseudo-mystical filler,
- unsupported claims,
- generic "immersive experiences" language,
- long text over the hero,
- tiny captions,
- jargon with no explanatory value.

Possible starting lines, not sacred copy:

```text
Systems look simple from a distance.
We build deterministic systems and games inside them.
Rules become state. State becomes consequence.
The structure did not change. Your model of it did.
```

## Responsive design

Do not shrink desktop.

At each breakpoint decide:
- dominant visual,
- camera framing,
- what moves/reorders,
- what disappears,
- interaction equivalent,
- copy measure.

Touch must not require hover/pointer-proximity for essential meaning.

## Reduced motion

Preserve narrative without continuous forced motion.

Use:
- stable key states,
- gentle transitions,
- controlled cuts/recompositions,
- reduced/no parallax,
- no disruptive glitch.

Do not leave an empty/broken hero.

## No-WebGL fallback

Company site remains usable.

Provide:
- deliberate static/composed hero,
- same navigation,
- readable copy,
- full editorial sections.

WebGL is enhancement, not a gate.

## Accessibility

At minimum:
- semantic navigation,
- native controls,
- keyboard access,
- visible focus,
- readable type,
- adequate contrast,
- accessible labels,
- no scroll trap,
- no essential meaning only in color/motion.

Do not replace a native button/link with a clickable div without a real reason.

## Performance

Measure rather than assume.

Priorities:
- stable frame pacing,
- bounded DPR,
- controlled draw calls,
- restrained transparent overdraw,
- small simulation buffers,
- minimal post FX,
- reuse/disposal of GPU resources,
- reduced work when hero is offscreen.

Quality tiers may control:
- DPR,
- geometry/detail count,
- shadows,
- reaction-diffusion,
- post-processing,
- secondary material detail.

Every tier must preserve the core composition/meaning.
