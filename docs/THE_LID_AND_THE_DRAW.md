# THE LID AND THE DRAW — the sky's law

```
SOURCE:  Jacob, 2026-08-19, choosing between three of my proposals and
         then writing the direction himself.
STATUS:  DIRECTION LOCKED. NOT BUILT. Paper only until he says
         otherwise.
SCOPE:   the sky above the plain. Not the Spire, not the Choir, not the
         ground, not the horizon.
REPLACES: docs/MERIDIAN.md, written and superseded the same day.
```

## 0. The sentence, his

> A vast stratified sky that first reads as open majesty, then reveals
> itself as the underside of an enclosing structure, with the
> atmospheric decks subtly bending toward the Spire's axis as if the
> whole chamber is under a field.

Where any detail below disagrees with that sentence, the sentence wins.

## 1. Why these and not the Meridian

His reasoning, recorded because it generalises well past this decision:

> All three fit the philosophy better because they do the turn through
> spatial structure, not through a decorative sky effect.

The Meridian was an effect applied to the sky. The lid is a fact about
the world. A fact takes longer to decode, and that slowness is the
point — see section 4.

## 2. The locked hierarchy

```
primary sky idea       THE LID
secondary deformation  THE DRAW
optional tertiary      a very restrained SHAFT, possibly not visible
                       in the first beat at all
```

The Split Spire remains the hero. Neither of these is a subject. The lid
is what makes the world feel impossibly large and then impossibly
enclosed; the draw is what makes the enclosure feel active.

### The read sequence this buys

1. **First read** — immense solemn world.
2. **Second read** — this is enclosed.
3. **Third read** — the enclosure is not passive; it is acting on the
   world.
4. **Possible fourth read** — somewhere above, something has been cut.

## 3. THE LID

**Not a literal ceiling.** His description:

- an extremely faint inverted plain far above;
- almost lost in haze;
- **broad tonal read, not detailed texture**;
- only enough underside structure that, after a few seconds, the brain
  realises it is a surface and not open sky.

The landing page must not scream *look, there's a roof*. It should read
first as **depth**, then as **wrong depth**.

The horror is structural, not theatrical. It makes the visitor feel
enclosed without ever showing a cage.

## 4. THE DRAW

The right active behaviour, and better than a ring, a vortex or an
obvious portal because it avoids the cliché entirely.

- the plain stays mostly calm and level;
- only near the Spire's axis does the world stop behaving normally;
- the bend suggests force **without showing a machine**;
- the anomaly reads as systemic, not decorative.

His distinction, which is the whole design:

> A swirl says "effect". A draw says "law".

Shape: kilometre-scale atmospheric strata, nearly horizontal at the
edges, gently curving downward or inward near the Spire. Strong enough
that the eye senses a pull **before consciously naming it**.

So the visitor thinks *beautiful sky*, and then *why is everything
bending toward that axis*.

If it is too strong it becomes a fantasy storm or a magical tornado
field. Subtlety here is not taste, it is the mechanism.

## 5. THE SHAFT — the dangerous one

Good in isolation, risky in the actual page. His diagnosis:

- a hard-edged cut in the deck is immediately legible;
- it introduces a **second focal monument** in the sky;
- the light column can become "the cool thing" and reduce the Spire to
  foreground dressing;
- **it answers too much too early.**

The tell is in my own wording for it — *someone cut that hole* arrives
almost instantly, where the lid and the draw take time. That slowness is
what makes them better.

If it is kept at all it must be: distant, offset, never centred, no god
rays, light falling to the plain far away and **never onto the
monument**, read as an incision rather than a spectacle. Not "a beam in
the sky" — **a rectangular absence with faint remote illumination
beneath it**. Exaggerated, it is sci-fi key art.

Default position: dropped, or held back as a late-read detail that is
not in the first beat.

## 6. The landing frame

- the Spire is the central subject;
- the Choir sits behind and around it in depth;
- the sky layers feel calm at first;
- the lid is **only barely perceptible**;
- the draw is visible only as a slight bending of the strata near the
  axis.

Which gives: **holiness from scale, unease from geometry, menace from
implication.**

## 7. What not to do

His list, verbatim in substance:

- obvious cloud detail on the lid;
- visible repeated patterns that make it read like a texture;
- too much curvature in the draw;
- a bright shaft beam crossing the Spire;
- a centred shaft directly above the monument;
- any animated "sucking" motion in the sky.

Motion, if any, must be nearly imperceptible. **This is a world
condition, not an event.**

The second item is this project's visible-primitives lesson arriving in
a new place: if the eye can name the repeated element, the carrier has
failed. It killed filaments, lamellae and Voronoi cells already. On a
surface as large as the lid it will be more obvious, not less.

## 8. Engineering notes, for whenever this is built

Recorded now because they are findings, not choices, and because two of
them would otherwise be discovered by rendering the wrong thing.

### 8.1 The decks built today are the substrate for both

`SKY_LAW` in `src/render/JourneyRenderer.ts` already intersects three
horizontal sheets of haze at real altitudes,
`t = (H - eye.y) / d.y`, and samples `skyFbm(p * scale)` at the
intersection. The lid is that same intersection at a much higher
altitude with different treatment. The draw is a warp of `p` toward the
Spire's axis. Neither needs new machinery, a mesh, or an asset.

### 8.2 The lid must NOT use the deck path-length term

The decks scale their density by `clamp(0.16 / d.y)` — how much sheet
the ray actually crosses. That is right for a volume of haze and
**wrong for a lid**. A surface has no path length: you either see it or
you do not. Applied to the lid, that term would make it weakest directly
overhead, which is precisely where a ceiling should be most present.

### 8.3 The lid's faintness on the landing frame is free

Because `t = (H - eye.y) / d.y`, the lid is nearest overhead and recedes
toward infinity at the horizon, so **fog hides it near the horizon
without being asked**. That is his "almost lost in haze", for nothing.

And the landing camera at `(0, 14, 300)` looking at `(0, 96, 0)` barely
looks up, so on the landing frame the lid is at its faintest — exactly
where he wants it barely perceptible. It becomes legible only where the
camera tilts up, which is later in the journey.

There is a bonus in that: `10-STUDIO-FOOT` is currently the emptiest
frame in the review, at 48.7 percent of pixels above 5 percent
luminance, and it is a steep upward look. The lid fills the frame that
most needs filling, with no separate decision.

### 8.4 The decks are already static, and must stay that way

They were built static on purpose: camera parallax supplies the motion
and nothing in the sky animates. That already satisfies section 7's
"a world condition, not an event", and it is why temporal calm measures
0.0030. Do not add drift to sell the draw.

### 8.5 Kill risks that carry over from the Meridian record

Still binding, from `docs/MERIDIAN.md` section 9: nothing in this sky
may gain an aperture, may brighten into a beam, may multiply into a
line field, or may push the faint cold white toward Cherenkov blue used
as a colour signature.

## 9. Build log — the lid, first pass, 2026-08-19

Built deliberately under strength on his instruction: *"build the lid
too weak and show me frames."* Swept from `window.__dl.setLid()` under
`?harness=1` rather than guessed, captured by `tools/lid-sweep.mjs` at
0, 0.15, 0.30, 0.55 and 0.85 across three stops.

**The first attempt failed and the reason is the useful part.** Tonal
cells were 24000 units across. The landing camera sees roughly 15 to 36
degrees of sky, which is `t` from 42500 down to 18560 — about 24000
units of lid. So exactly ONE feature spanned the whole visible band,
and with no second feature to compare it against there was no
compression to read. It looked like slightly brighter fog at every
strength, including 0.85.

**Cell size is therefore the number that decides ceiling or wash**, and
it is not free: it is fixed by the camera's elevation band and the lid's
altitude. Near 4800 units puts about five features in the band, which is
enough to watch them stack and squash toward the horizon, and still far
too coarse to read as texture. That is the whole fix — no strength
change was involved.

Second finding: the lid's aerial term must reach **further down than the
decks' does** (`exp(-t / 42000)` against the decks' behaviour), or the
lid fades out above the elevations where its compression becomes
legible.

Third: section 8.3 held. The lid is faintest on the landing frame and
strongest at `10-STUDIO-FOOT`, the steep upward look — and at that stop
0.85 is already too much, drifting toward generic cloud. The usable
range looks like landing-weak, and the ceiling on the whole scale is set
by the upward stops, not by the landing frame.

Harness 7/7 throughout. Temporal calm 0.00315 against 0.00304 before the
lid, so the smaller cells did not introduce shimmer.

## 10. The strength, locked from frames

Jacob, on the sweep: **"landing-030 and foot-085 are okay."**

Those are two different uniform values, and checking the cross-frames
showed no single value serves both:

- `landing-085` announces a roof and drifts into obvious cloud detail —
  both explicitly forbidden in section 7;
- `foot-030` is invisible, near-black upper sky with only a hint.

So presence has to vary, and it now rides **severity**, which is `0.0`
at the landing key and `0.88` at the studio foot:

```
uLid = 0.30 + 0.625 * severity
```

which lands on his two approved frames exactly. It rides severity rather
than raw scroll because severity is the grade that already moves the
whole palette, so this is not a new kind of change in the sky.

### 10.1 What was deliberately NOT fixed

The lid is scaled by `glow`, which cools and dims by about 2.4x as
severity rises. That looks like a bug — the lid losing brightness
because the palette cooled — and fixing it would have made the foot
1.6x brighter than the frame he approved. **The frames are the spec.**
The coupling stays.

### 10.2 It ramps, it does not turn on

Section 7 bans anything in the sky that reads as an event. Measured
across the journey in twenty steps (`tools/lid-ramp.mjs`), the upper-sky
mean is **0.0935 at the landing frame and 0.0935 at the studio foot** —
identical, despite `uLid` nearly tripling. Outside the cleft the
step-to-step change stays within ±0.02 and wanders with camera angle
rather than climbing.

The reason is section 10.1: the severity ramp raises the lid by almost
exactly what the cooling `glow` takes away. **Structure increases,
luminance does not.** So the lid becomes more legible without the sky
ever getting brighter, which is the definition of a world condition
rather than an event. The two large steps in the walk are at `p` 0.50 to
0.65, which is the cleft descent and has nothing to do with the lid.

## 11. Build log — the draw, first pass, 2026-08-19

Built as **geometry, not as a texture warp**. The three sheets dip
toward the Spire's axis, `H = H0 * (1 - draw * 0.35 * exp(-r² / R²))`,
and the ray intersects the bent sheet. Because bending `H` makes the
intersection implicit, it is solved with one fixed-point step: hit the
flat sheet, ask how deep the dip is there, hit the bent sheet. That is
ample for a bend this gentle and it stays closed-form.

Warping the sample coordinate instead would have crowded the pattern
toward the centre — an effect painted on a flat sheet. Bending the sheet
makes the perspective, the compression and the convergence fall out on
their own. His distinction, mechanically: a swirl says effect, a draw
says law.

Two properties came free and both are in section 4. At grazing angles
`t` is enormous, so the sample lands far out where the dip has died and
**the strata stay level at the edges**. Overhead the sample lands near
the axis, which is where the dip is deepest.

### 11.1 The influence radius was wrong at first

3000 units only reached the lowest deck. The upper two are sampled four
and seven thousand units out at the elevations that matter, so the field
had died before it got to them and the bend touched about a third of the
density. **"As if the whole chamber were under a field" needs the field
to reach the whole chamber.** Now 7000.

### 11.2 The finding that matters: a bend needs a line to bend

At first the draw was visible only as a *shift*, not a curve, at every
strength up to 1.0. The reason is that the decks are isotropic fbm —
a field of blobs. **A bent sheet of blobs reads as blobs that moved.**
There is nothing linear for the eye to follow, so there is no curve to
see.

Squeezing one horizontal axis of the noise elongates the features into
layers — which is what the word *strata* in section 4 actually means —
and the dip becomes legible immediately. Kept parallel and never radial:
features converging on the axis would be a radial bloom, which is
banned.

**This changes an already-approved frame,** so it is behind its own
uniform (`uStrata`, 1.0 = the approved isotropic sky) and defaulted to
the approved value until Jacob rules. The 2x2 that isolates it is in
`captures/draw/matrix/`: approved, bend-only, layered, layered-and-bent,
at the landing and wide stops.

Harness 7/7, temporal calm 0.00337.

### 11.3 Locked

Jacob, on the 2x2: **"d-layered-bend is right, lock it."**

```
uStrata = 0.35     decks elongated about 2.9x on one horizontal axis
uDraw   = 0.60     constant, not ramped - he approved one cell, at two
                   stops, at one value
uLid    = 0.30 + 0.625 * severity     (section 10)
```

### 11.4 The risk that did not materialise, and the one real surprise

Directional strata could have converged to a vanishing point at stops
where the camera looks ALONG the elongation axis — `02-ORBIT` sits at
x=86 looking back at the origin. Checked: the bands stay broad and
horizontal, no convergence, no radial read. At 2.9x the features are
layers rather than lines, and the fbm keeps them irregular.

The surprise is how much the whole journey lifted. Percentage of frame
above 5 percent luminance, before this change and after:

```
01-OPENING       92.1  ->  95.3
08-CORKSCREW      8.4  ->  47.5      (the stop that kept reading empty)
10-STUDIO-FOOT   48.7  ->  72.7
11-RETURN-A      58.9  ->  83.8
12-RETURN-B      60.4  ->  90.1
13-RETURN-END    58.5  ->  88.3
```

The journey's worst stop went from 8.4 to 47.5, and nothing is near the
25 percent floor any more. **The frames were not empty because the
monument was too dark. They were empty because there was no world
behind it.** That is the same diagnosis as the choir hovering and the
plain stopping at 700 units, arriving a third time: the subject was
never the problem.

## 12. Build log — the shaft, and two choir corrections, 2026-08-19

Jacob: *"there is no point for the spire behind the entity as the hero
covers it can you remove it and also can you dim them and then do the
shaft."*

### 12.1 The mass behind the hero

Measured from the landing camera before touching anything. Choir mass 3
at `(140, -1080)`, 288 units tall — the tallest and widest of the six —
is **74 percent occluded by the Spire, and it is the only one of the six
with any occlusion at all**. Removed.

It is commented out rather than deleted from `MASSES`, and skipped via a
`SKIP` set, because index parity drives the taper's lean direction:
renumbering would have silently altered masses 4 and 5. Verified after
the rebuild — mass 3 absent, the other five's feet and tops unchanged to
the decimal.

Worth knowing: it was not occluded at every stop. At `02-ORBIT` it sat
near the right edge of frame. Removing it removes it everywhere.

### 12.2 The dim

`uCDim`, applied as the **last** operation in the choir's material so it
scales facet tone, machined edge, groove light and all together, rather
than hollowing out one term and leaving the highlights where they were.
Default 0.55, swept at 1.0 / 0.75 / 0.55 / 0.40 in `captures/shaft/`.

### 12.3 The shaft

Built exactly to section 5: a rectangular absence cut through the lid,
and nothing else. No beam, no column, no god rays. Cloud has no straight
edges, so the cut itself is the whole evidence that something engineered
it.

Placement is entirely guard-work against Jacob's named failure — that it
becomes a second focal monument:

- 24700 units out, so the light it lets past falls on a part of the
  plain nowhere near the Spire;
- offset 22 degrees to one side, never centred, never overhead;
- about 3 degrees across, an incision rather than a spectacle.

**The first placement failed on distance, and the reason is a rule.** On
a lid at altitude 11000, *horizontal distance IS elevation*. 19000 units
put it at 30 degrees, which is the landing frame's top edge, so the
viewport cut it in half and it read as a smudge. 24700 units is 24
degrees — the upper third, with room around it. Anything placed on the
lid is positioned in elevation whether or not you meant to.

It is longer along the line of sight than across it, because the plane
is seen at a shallow angle and the radial extent foreshortens by roughly
sixty percent. In plan a slot; on screen near square.

At `uShaft` 1.0 it is a clean hard-edged parallelogram in the haze,
unmistakably not weather. At 0.5 it is barely perceptible in the full
frame, which is closer to *"maybe not even visible in the first beat"*.
Jacob's call.

Harness 7/7. Worst stop across the thirteen is now 58.3 percent above 5
percent luminance.

## 13. Status

The lid is built and its strength is locked to Jacob's two frames.

The draw is built, stratified and locked to the cell he chose. Harness
7/7 throughout, temporal calm 0.00337, all thirteen review stops checked
by eye and by measurement.

The shaft is built and **awaits its strength** (`uShaft`, live at 0.5).
The choir dim likewise (`uCDim`, live at 0.55). Both are swept in
`captures/shaft/`.

**Not done:** mobile recomposition, where a directional sky, a ceiling
and an off-centre cut all behave differently in a portrait frame.
`choir.glb` was rebuilt; nothing else under `public/models/` changed.

Locked names: **THE LID**, **THE DRAW**, and **THE SHAFT** if it
survives at all.
