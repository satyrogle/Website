# SIGNAL SKIN — the Split Spire's material law

```
SOURCE:  four spec sheets supplied by Jacob, 2026-08-19
STATUS:  RECORDED, NOT BUILT. He said "check these paper only".
SCOPE:   the surface of the monument and the fissure core. Not the
         silhouette, which is already approved and unchanged.
```

## 1. What the material IS

Manufactured black stone. Sintered graphite or dense ceramic, not
geology. **Ancient yet machined**: edges hold machined precision with no
obvious wear, while the surface carries age. Non-organic throughout.

This is the single biggest correction to what is currently live, which
is coursed masonry with stepped shelves and slab bedding. Masonry is
quarried and stacked; this is manufactured and cut. **The course
shelves and the stacked-slab bedding are wrong for this spec and must
go.**

## 2. The engravings

- Extremely shallow. Near-invisible head-on.
- **Visible mostly at grazing angles**, which is the whole trick.
- They affect **roughness and specular, not albedo**, and are **not
  emissive most of the time**.
- Angular glyph language: strokes, crosses, arrows, bars. Rune-like but
  machined, never calligraphic and never organic.
- Procedural, described as a **two-system overlay** (two glyph systems
  layered rather than one repeating alphabet).
- No visible tiling at large scale.

Currently live: dash-run channels cut into albedo with real shadow and a
lit lip. That reads at every angle and is therefore too loud by this
spec. The glyphs should nearly vanish when lit flat and appear as the
light rakes.

## 3. Macro surface

- Large-scale plate breakup: long cracks running across facets, at a
  much bigger scale than the glyphs.
- Micro surface: sintered, dense, subtle roughness variation only.
- Micro variation under large-scale control, so the surface never reads
  as uniform noise.

## 4. The fissure core

- **A separate emissive material**, not part of the stone shader.
- Pure, featureless white. No gradient banding, no colour.
- High intensity with strong bloom, and slight volumetric haze near the
  core.
- The core's width is irregular along its length, not a clean ruled
  band.

Currently live: a soft vertical gradient plane, brightest at the throat.
Closer to right than the rest, but it is a gradient where the spec asks
for featureless white, and it has no haze.

## 5. The shader stack, as specified

```
1  BASE LAYER          dense graphite / ceramic base
2  ROUGHNESS BREAKUP   large scale variation
3  GLYPH ENGRAVING     procedural, two-system overlay
4  MICRO DETAIL NORMAL fine surface detail
5  PROXIMITY / SIGNAL  distance from fissure
6  EMISSION MASK       selective glyph activation
```

Layer 5 is the one with no equivalent in the current build: **distance
from the fissure drives the signal.** Glyph activity is a function of
proximity to the core.

## 6. Signal activation, the seven states

This is a behaviour spec, not a still. It runs as a cycle:

| State | Behaviour |
|---|---|
| IDLE | Glyphs almost invisible. The surface appears inert. |
| ROUGHNESS WAVE | A subtle change in reflectivity travels across the surface. Nothing lights yet. |
| GLYPH AWAKENS | Small fragments begin to activate. |
| SIGNAL PEAK | More fragments illuminate. **Never the whole glyph.** |
| CROSS-GAP ALIGNMENT | Glyphs on both sides of the fissure momentarily align. |
| SIGNAL FADES | Fragments dim and break apart. |
| RETURN TO IDLE | The surface returns to near-complete inactivity. |

Two rules inside this that are easy to get wrong and would ruin it:
**only fragments ever illuminate, never a whole glyph**, and the
roughness wave arrives *before* any light, so the surface is felt to
change before it is seen to change.

## 7. Maps the spec calls for

Albedo, Normal, Roughness, Height/Depth, AO/Cavity, Emissive mask.

The current bake produces two of the six: normal and AO. Roughness,
height, cavity and the emissive mask are all missing, and roughness is
the important one, because by this spec **roughness is where the
glyphs live**.

## 8. What this contradicts in the live build

Recorded plainly so it is a decision and not a silent drift.

1. **Masonry courses versus machined plates.** The live body has
   stepped course shelves baked into it and slab-coursed decay. The
   spec is a manufactured monolith. The two cannot both be true.
2. **Glyphs in albedo versus glyphs in roughness.** Live glyphs darken
   the surface at all angles; the spec wants them nearly invisible
   except at grazing incidence.
3. **The decay language.** The live decay eats course-aligned slabs,
   which is a masonry idea. Against a machined skin it would need to
   become plate failure along the macro cracks.
4. **The ledger reading.** The engraved script is currently justified
   in the copy as the record made visible. The spec's activation
   behaviour is compatible with that and arguably better: fragments
   light near the fissure, which reads as the system consulting its own
   record. Nothing in the copy needs to change.

## 9. Open questions for Jacob

1. Do the course shelves go entirely, or does the base keep some
   bedding and the upper body become machined?
2. Should the signal activation run continuously as ambient life, or
   fire only on a visitor press and on strike events from the law?
3. Cross-gap alignment "at specific angles": camera-angle driven, or
   time driven?
