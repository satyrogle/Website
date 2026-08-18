# THREE HYBRIDS — FRAME SPECS FOR THE TWO-FRAME KILL TEST

**Status:** working specification. No approval, no winner, three candidates at
equal standing.
**Purpose:** the kit forbids generation until camera, composition, material,
lighting, spatial scale and continuity are defined. This is that definition, for
six frames only.
**Canvas:** 1440x900 for every frame. Generated at 1280x800 (exactly 1.6, close
to SDXL's native pixel budget) and scaled 1.125.

---

## SHARED DISCIPLINE — identical across all six

Deviating from this makes the comparison worthless, which is the one thing the
kill test cannot survive.

### Text-safe zone

One zone, the same in every frame, so typography is never the variable being
judged:

```text
PRIMARY   x 96 -> 608   y 470 -> 820     (512 x 350, lower left)
MARGIN    96 px on every edge
```

Lower left rather than mid left, because H2's built sky occupies the upper two
thirds across the full width. A zone the three candidates cannot all honour is
not a shared discipline, and moving it is cheaper than distorting H2.

The zone must contain **no structure brighter than 8% luminance** and no element
the eye reads as a subject. It is a true void, not a darkened area.

No type is rendered into the candidate images. The zone is proven by a separate
overlay variant, and copy placement is a later gate.

### Grade

Near-black in mood, never in measurement. Verified against
`captures/reference/igloo.png`.

```text
at least 25% of the frame above 5% luminance
real highlights above 80%, spent sparingly
dark regions carry scattered light, never flat black
monochrome: void black to bone white, no colour cast, no event colour yet
```

### Absolute constraints

No visible roof, floor, outer edge or complete silhouette in any frame. No
horizon. No human, creature, vehicle or nameable equipment. No text, logo or
watermark. Atmosphere reveals depth and never rescues geometry.

### Depth-guide convention

Composition is imposed through union ControlNet at type `depth`, authored with
`SolidMask` / `MaskComposite` / `FeatherMask`. Words set the grade; the guide
sets the massing. See `references/toolchain.md` for why this is not optional.

```text
1.0 nearest   0.0 furthest   void = 0.0
blur 20-40 px so the guide reads as distance, not as collage
```

---

# H1 — THE LOAD

## H1-A — Shallow load *(opening)*

- **Camera** — elevated, aimed slightly down and across into the gap between two
  colossal masses. Deliberately does not frame: any top, any base, any end.
- **Composition** — left third is void. An ordered mass enters from the right
  edge and the top edge, cropped by both, stepping back in four terraces toward
  the upper left. A second mass rises from the bottom right. The two nearly
  meet; the lane between them runs lower-left to upper-right.
- **Value** — mass in the 2-8% range with internal detail; contact highlights
  reach 85-95%; void under 2%.
- **Material** — graphite and carbon, matte, fine grain, board-marked density.
  Explicitly not: masonry, ice, rock, metal plate with rivets.
- **Light law** — light exists only where the upper mass bears on the lower one.
  Five or six discrete contacts, diminishing with distance. Between contacts,
  nothing.
- **Scale cue** — the contact series repeating to the vanishing distance, the
  furthest at the threshold of visibility.
- **Reading order** — brightest near contact, then the lane, then the terraces
  receding, then the realisation that there is no edge.
- **Kill** — reads as bridge, cliff, cathedral, crystal cave, or glowing
  architecture; light appears decorative; needs fog to feel monumental.

## H1-B — Failure basin *(reveal)*

- **Camera** — lower and deeper, aimed up and across into a broad convergence.
  Same world, same material, same light colour.
- **Composition** — three load paths enter from upper left, upper right and
  right, converging into a broad luminous **territory** across the lower centre
  and right. Left third remains void.
- **Value** — the brightest frame of the pair, but spread. No single region above
  6% of frame area carries the peak.
- **Material** — as H1-A, plus warped interfaces, opening seams, stress
  whitening within the material.
- **Light law** — brightness is accumulated strain. It is broad because many
  paths arrive, not because something is hot.
- **Scale cue** — the convergence extends past both side crops.
- **Reading order** — the spread brightness, then that its edges are separating,
  then that the dark masses nearby are dark because they stopped carrying.
- **Kill** — becomes a reactor core, an explosion, or a hot centre; any radial
  bloom; the basin readable as a single object.

---

# H2 — THE ASCENSION ENGINE, INSIDE

## H2-A — Constructed heaven *(opening)*

- **Camera** — low, tilted up roughly 30 degrees. Deliberately does not frame:
  the closing of any curve, any floor, any wall meeting.
- **Composition** — upper two thirds is a vast ordered field of thousands of
  small bone-white sources on a surface receding to the upper right, cropped on
  all four sides. Lower third is black and sparse, with two pale terraces at
  different depths entering from the right and stopping well short of centre.
  Both enter from the right rather than from both sides: the lower left is the
  shared text void, and a left terrace bleeds into it under blur at any height
  tall enough to read.
- **Value** — upper field averages 10-18% with source points to 90%; lower third
  under 3%.
- **Material** — the sky is made of discrete manufactured units, not a glow.
  Pearl grey and ash white. The lower terraces are graphite.
- **Light law** — thousands of small sources, haze between, luminance falling
  with distance. No source is large enough to name.
- **Scale cue** — source size and spacing diminishing toward the upper right.
  That gradient is the entire sense of size.
- **Reading order** — the ordered sky, then that it is built from countable
  things, then the black below, then that no boundary ever resolves.
- **Kill** — any completed curve; reads as dome, hangar, cooling tower, stadium,
  planetarium or temple; the sky reads as a glow rather than as objects.

## H2-B — Lower truth *(reveal)*

- **Camera** — far below, aimed across and slightly up. The built sky is now a
  narrow pale band at the top of frame, distant and small.
- **Composition** — lower two thirds dominated by dark stratified material in
  horizontal bands, receding. Sparse pale units rising in the mid distance,
  small and ambiguous. Left third void.
- **Value** — the darker frame of the pair. Top band 12-20%; the strata 1-5%
  with real internal detail.
- **Material** — ash, lead, fine sediment, matte and light-absorbing. Explicitly
  not: machinery, pipes, conveyors, tanks, anything nameable.
- **Light law** — the lower world absorbs; the upper world emits. Only faint
  escape between strata.
- **Scale cue** — the sky band's smallness against the strata's mass.
- **Reading order** — the dark strata, then the rising units, then the pale band
  above, then that the band is made of what rose.
- **Kill** — recognisable equipment; a central engine or furnace; generic
  industrial concept art; the sky and the lower world not reading as one place.

---

# H3 — THE IMPOSED FIELD

## H3-A — Holy field *(opening)*

- **Camera** — inside the field, aimed into its depth. Deliberately does not
  frame: any edge, floor, roof or boundary of the field.
- **Composition** — thin faceted plates at exact positions receding into depth.
  The nearest two are large and cropped by the top and right edges. Density
  falls toward the upper left. Large black voids throughout, the largest on the
  left.
- **Value** — voids under 2%; plate faces 6-15%; fracture light to 88%.
- **Material** — each entry is a substantial plate with orientation, thickness
  and damage. Ash, bone, damaged off-white. Never a point, dot, star or
  identical unit.
- **Light law** — light escapes only at fractured or delaminated interfaces. No
  source is visible and nothing emits because it is pretty.
- **Scale cue** — near plates large enough to read material and damage; far
  plates small but still showing orientation.
- **Reading order** — the field as a whole, then that the entries differ, then
  that their spacing does not, then the gaps.
- **Kill** — reads as starfield, cemetery, LED wall, data visualisation, matrix
  or gallery; entries become points or identical repeats; any connecting line.

## H3-B — Imposed lattice *(reveal)*

- **Camera** — same field, rotated so the structure behind and below the entries
  becomes readable in silhouette.
- **Composition** — a dead graphite lattice occupies the lower and rear volume,
  occluding entries behind it. The field's gaps now align visibly to its nodes.
  Left third void.
- **Value** — the darkest frame of the six. The lattice is 1-3% and never
  emits; it is read entirely by what it blocks.
- **Material** — dead graphite. Heavier, older and duller than anything it holds.
- **Light law** — unchanged from H3-A. Nothing new is lit. The lattice becomes
  visible because the eye adjusts, not because it is illuminated.
- **Scale cue** — the lattice continues past every crop; the entries are small
  against it.
- **Reading order** — the same beautiful field, then something occluding it,
  then that the occluder is structural, then that the gaps were always aligned.
- **Kill** — the lattice glows, or reads as a wireframe, grid or matrix; it has
  to be explained by copy before it can be seen; it reads as scaffolding.

---

## WHAT IS DELIBERATELY NOT DECIDED HERE

Motion, pacing, mobile recomposition, copy, interaction, and every implementation
question. Six stills at equal finish, judged as pictures. Nothing else.
