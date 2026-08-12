# Phase 3 — the hero object: candidates

Paper only, 2026-08-12. Second pass. The first pass — three wireframe
geometries — was rejected on sight, correctly: it answered "wrong object" with
three more sets of thin lines in a void, drawn as technical diagrams, with no
mass and no material. Two of the three also landed on things already ruled out
(crossing lines read as a grid; aligned segments read as stripes).

The axis that was wrong is material, not geometry. One candidate per register
below. They are not four equals — two have problems serious enough to name up
front.

No sketches this round. The schematic drawn for the first pass made every
candidate look like a technical drawing, which is the exact failure being
corrected. If one of these is worth seeing, the honest next step is a real
frame off the 3060, not a diagram.

## Why the veil failed, kept for the record

The build plan defines the structure entirely by prohibition: no rings, no
grid, no radial construction, no rotational symmetry, no plexus, no monster.
Nothing says what the thing *is*. A shape whose only property is "breaks no
rules" has no properties. Two consequences, both measured:

- **No order to violate.** A filament that already wanders has no correct
  shape, so pushing it back to the recorded wander is not a legible act.
- **Grey.** Amber and cyan sat on the same hairlines and blended additively to
  neutral — mean lit colour RGB 31,39,39 — so the grammar cancelled itself
  everywhere the world and the record agreed, which is most of the frame.

Every candidate below starts from what the approved state *is*, and applies the
prohibitions afterwards as a check.

## What any candidate must do

1. **A rest position and a displacement direction per element**, so the drawn
   position is `p₀ + u·n̂`. The simulation carries one scalar per node and
   nothing else.
2. **Deviation must be legible without an outline to read it against.** The
   veil's deformation happened inside a shape whose edge nobody could see.
3. **The record must be readable off the object.** The visitor has to see where
   the thing *should* be without being told. This is also what stops the two
   colours cancelling: a world and a record that disagree must occupy
   different space.
4. **Nearly dark at rest, bright when deviating.** Luminance from `|u − u*|`.
5. **No post beyond tone mapping.** No bloom, no fog, no particles. A weak
   frame is fixed with geometry, camera or state.

---

## A. THE SURFACE — the approved state is *unblemished*

**Register: mass and surface.**

**What it is.** A broad, shallowly curved expanse of solid material, finished to
a mirror tolerance but entirely matte, crossing the lower part of the frame and
receding. You never see the whole object and there is no silhouette to get
wrong — you are close to something much larger than the frame. Void above it.

**The order logic.** A perfect finish. Order is not in a pattern, an
arrangement or a repetition — it is in the *absence of incident* across a
continuous surface, which is the one kind of order that cannot read as a grid
or a stripe because it has no elements at all.

**How anything is visible.** One grazing light, raking almost parallel to the
surface. This is not a lighting choice for looks: raking light is literally how
a finished surface is inspected for defects, so the frame's own lighting is the
system examining its body. On a matte surface lit this way, a swelling a
fraction of a millimetre proud reads instantly as a bright crescent and a
shadow. Nothing else in this project has ever had that sensitivity.

**Deviation.** Your press raises a swelling. The rake turns it into a lit edge
and a cast shadow that travel as the wave moves under the surface.

**Correction.** It is pressed flat. The crescent narrows, the shadow shortens,
the surface closes. A faint permanent mark stays where it was.

**The record.** The unblemished profile — where the surface should sit. Amber
draws it as a thin true line along the departing edge, so the gap between the
swelling and the line it should be following is the disagreement, drawn.

**How it fails.** A smooth dark surface with a raking light and a bulge
travelling under it is a creature under a sheet. That is the single largest
risk in this document. It survives only if the material is unmistakably rigid
and finished rather than draped, and if the swelling starts precisely where the
visitor pressed and behaves like a wave rather than like locomotion. Second
risk, smaller but real: a large flat solid is adjacent to retired ground, and
the vocabulary rule exists because of it.

**Cost.** Moderate. The engine is untouched — mesh vertices are graph nodes and
`u` displaces along the surface normal, which is what `p₀ + u·n̂` already means.
`CorrectionModel` changes from line sets to a shaded mesh, and a matte material
under one directional light is a small shader.

---

## B. THE LEVEL — the approved state is *level*

**Register: liquid held level.**

**What it is.** A broad expanse of dark, heavy, still liquid. Not water: near
black, dense, closer to oil than to a pool, with sheen rather than reflection.

**The order logic.** Level is a liquid's own definition of correct, so the
approved state needs no explanation whatsoever — it is the only state the
visitor already expects the material to be in.

**The problem, stated first.** A point disturbance on a liquid surface produces
**concentric rings**. That is the one thing this project has killed three
directions over, and it is not an edge case here, it is what the material does.

**The escape, and it is the reason this candidate is in the document.** The
liquid never ripples. Not once. The order is a dead level plane, and a press
produces a *swell* — a region of the surface displaced as a body — which is
flattened before any ring can form. The absence of the most natural thing a
liquid does becomes the evidence: you have never seen a ripple on this surface,
and that is not because it is calm. That is a stronger statement of "maintained,
not natural" than any of the geometries in the first pass managed.

It only holds if enforcement is fast enough and wide enough that a ring never
resolves in a single frame. One capture showing concentric anything kills it.

**Deviation.** A swell rises and the level line deforms where it crosses it.

**Correction.** Flattened, and the level line closes.

**The record.** The level itself, and the visitor can read it off every part of
the line that is still true.

**How it fails.** Rings, as above. Then gloss: liquid needs some specular to be
liquid at all, and specular is close to gloss. Then the level line across a
dark frame is a horizon, and retired terrain was a horizon.

**Cost.** Same as A — displaced mesh, same engine mapping. Plus whatever it
takes to make enforcement outrun the material, which is a real tuning risk
rather than a rendering one.

---

## C. LIGHT AS THE OBJECT — blocked by a guardrail, not by taste

**Register: light.**

To make light itself the object — a field or a shaft with an exact boundary
hanging in the dark — you need a participating medium. Light is invisible in a
vacuum; you see a beam because something is in the air. That is volumetrics,
and volumetrics is atmosphere, and the build plan bans fog outright alongside
bloom and particles.

There is a version that dodges it: light *on* a surface rather than in air — a
precisely shaped region of illumination cast on an unseen plane, whose exact
outline is the approved state and whose deformation is the deviation. It needs
no volumetrics and it is the most literal reading of "the interface can appear
divine" available. But nothing physically moves in it, so it gives up
displacement-carries-meaning, which is the mechanic that makes the correction
an act rather than a colour change.

**So this register costs one of two things: a waiver on the no-fog rule, or the
displacement mechanic.** Both are yours to spend, and neither should be spent
quietly. If the waiver is available this becomes a serious candidate and I will
write it properly.

---

## D. THE SETTING — the approved state is *in register*

**Register: the record itself, made visible.**

**What it is.** The file, at monumental scale. A field of set marks — not
readable text, not numbers, not labels, but unmistakably *notation*: marks
whose meaning you cannot read and whose order you cannot miss. Every mark sits
on its line. Every line is true.

**The order logic.** Setting. Alignment and register — the order of a
typesetter or an engraver, which is the most precise order a person recognises
without knowing anything about the subject.

**Deviation.** Your press knocks a region out of register. Marks slip off their
lines. The setting breaks in a local patch and the break travels.

**Correction.** They are re-set, region by region, visibly and mechanically,
and the re-setting is staggered rather than on one clock.

**The record.** The ruling itself. Amber is the line each mark belongs on; cyan
is a mark that has left it; violet is where one is being pushed back. The
grammar maps onto this more exactly than onto anything else in this document —
the record is *literally* what you are looking at while it corrects the world.

**How it fails, and it is a taste problem rather than a craft one.** Ruling is
regular by definition. A field of ruled lines is stripes, and a field of marks
on ruled lines is a grid — both already ruled out, repeatedly and firmly. It is
also the closest of the four to reading as a document, a dashboard or a UI, all
of which the dossier bans.

**So this is the strongest thematic fit and the worst fit against stated
taste**, and I do not think that tension resolves by executing it better. It is
in the document because it is the only candidate where the hero *is* the
proposition rather than an illustration of it, and that is worth one look
before it is discarded.

**Cost.** Highest. Marks are instanced elements with a per-element transform
rather than displaced vertices, so `CorrectionModel` and the state-to-transform
mapping are new work.

---

## Where I would go

**A, THE SURFACE.** It is the only one of the four with no structural problem —
B fights its own material, C needs a rule bent, D needs a taste reversed. It
gets order from the absence of incident, which is the one form of order that
cannot collapse into a grid, a stripe or a plexus, and the raking light gives
the frame a reason to be lit that is the system's own behaviour rather than a
lighting choice.

Its risk is real and singular: it must never read as something moving under a
sheet. That is worth testing before anything else is built, and it is testable
in one frame.

**The kill frame is unchanged: the correction instant.** For THE SURFACE that
is a swelling half pressed out, its amber true-profile line beside it, violet at
the contact. If it reads as a creature, or as a dent in a car door, it dies.
