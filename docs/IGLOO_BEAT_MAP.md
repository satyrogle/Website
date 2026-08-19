# THE IGLOO BAR — beat map

```
INSTRUCTION: Jacob, 2026-08-19, verbatim: "igloo bar, monument content, go"
MEANING:     match igloo.inc's experiential grammar and quality bar with
             OUR monument content. Never a clone of their world: no ice,
             no crystal, no their-geometry, no their-copy.
STATUS:      stage 1 built (body + bake + light score). Stages 2-4 open.
```

## What the reference actually does, beat by beat

Extracted from `dark-lattice-genesis/captures/igloo/` and the measured
entries in `docs/REFERENCE_LIBRARY.md`. Each line is a QUALITY, with the
Dark Lattice equivalent beside it. Nothing here is a build instruction
copied from them.

| # | Igloo beat | The quality to match | Our beat |
|---|---|---|---|
| 0 | Loader holds until the world is ready | The first frame is never half-built | Loader holds until glb, both maps and first compile are done |
| 1 | Establishing shot, subject small in frame | Awe by scale and negative space | The fork at 300 units, crown burning |
| 2 | Approach, subject grows, no cut | Continuity: one unbroken camera | Orbit in, the gap between the slabs opening up |
| 3 | Composed reading stops | The frame is STILL while text is read | System / Desk42 dwells |
| 4 | Material close-up | Light rakes across relief; the surface is the star | Rule dwell, raking key on the inscribed face |
| 5 | Passage through the subject | Transition by occlusion, never a fade | Through the gap between the slabs |
| 6 | Interior chamber | Scale inverts: inside is a different world | The slot, the ties, near darkness |
| 7 | Emergence | Relief after compression | Out the far side, the stripped face above |
| 8 | Outro at distance | The opening image, re-read | The return, lattice revealed |

## Stage 1, BUILT (genesis, this session)

- **Body**: THE FORK. Two broad slabs, fused foot, lens of sky between
  them, one tip curling past the other.
- **Sculpt and bake**: `tools/blender/monument.py` builds a 700-ring
  high-poly with real course shelves and three displacement layers, and
  bakes tangent normal + AO at 2048 onto the UV'd analytic low-poly.
  The low-poly surface is the one `monumentForm.ts` describes, so cells
  and camera stay exact. **The high poly never ships.**
- **Light score**: `LIGHT_KEYS` in `JourneyRenderer`. Ten keys lerped by
  scroll: warm hero at the establish, hard rake at the reading dwells,
  near-darkness in the slot, cold witness at the return. Key colour,
  intensity, direction, ambient and environment intensity all move.
- **Removed**: procedural veining (smeared into streaks on a broad flat
  slab; the bake carries relief now), shader-drawn course shelves (they
  are geometry in the normal map).

## Stage 2, NEXT: transitions and chapter craft

The largest remaining igloo gap. Currently every beat is one continuous
GSAP-driven camera with no transition design.

1. **Occlusion wipes.** Time the slab passage so a blade fills frame at
   the moment the DOM chapter swaps. Igloo never cross-fades; it hides
   the cut behind geometry.
2. **Dwell/travel rhythm.** Velocity should approach zero at each
   reading stop and peak between. Today the camera drifts through
   dwells at a constant rate.
3. **Text choreography.** Copy arrives after the camera settles, leaves
   before it moves. One motion vocabulary for every stop.
4. **Loader.** Hold on a composed still until ready, then release into
   beat 1. No spinner, no percentage, no forced intro (constitution).

## Stage 3: environment

Terrain dressing (scree fields, ridge silhouettes), a real horizon
treatment, and depth haze designed per beat rather than one global fog
curve.

## Stage 4 (Gate F): sound, project pages, production-lab pipeline

Not started. Governed by the brief, not by this document.

## The line that does not move

Igloo's register is cinematic, sacred, material-driven, and that is why
it was chosen. Lusion's is playful and physical, and it is NOT the
register for this site (`CLAUDE.md` experience law). Where the two
references disagree, igloo wins. Where igloo disagrees with the
constitution, the constitution wins: no forced intro, no scroll
hijacking that hides causality, real DOM content, keyboard reachable,
`prefers-reduced-motion` served with equivalent states.
