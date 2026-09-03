# THE FIELD

**STATUS: DIRECTION UNDER DESIGN, 2026-09-01 evening. No frame approved.
Source paths stay closed under `docs/APPROVED_VISUAL_JOURNEY.md` until an
opening image is approved and written there.**

Working title. Jacob renames the direction and names the guide.

Replaces THE GRAIN (killed 2026-09-01) as the interior. The entrance, scroll 0
to 0.34, black spire, gold seam, "SCROLL. THE SEAM IS THE WAY IN", is untouched
and still approved. Everything on this board happens after the seam.

## 1. What changed, in Jacob's words

- "Landing page is dark and sinister but inside becomes holy." The experience
  law in CLAUDE.md (appear divine, become menacing through understanding) is
  **inverted for the interior, on purpose: more awe, more surprise.** CLAUDE.md
  is updated when this direction is approved, not before.
- The entrance is a door. Cross the seam and the world changes: material,
  light, rules. The entrance is the last thing you see of the outside.
- Verb order: **set a condition, then ride, then press once.** The press fires
  right before company info.
- X is the engine. Y is the innovation. Z is the hybrid of both. Then the
  games.
- Bans on visual cues are lifted: a creature, particles, gold, petals, an
  energy form are all allowed. The one hard limit: **nothing that makes the
  site AI slop.**
- "Please don't fuck me over again." Read as: reachability is checked before a
  frame is locked, taste is Jacob's, no code before approved images.

## 2. Decision frame

Who arrives: a player, a collaborator, press, an endorsement assessor. What
they must get on the first screen: a UK systems studio building deterministic
games, Desk42 and Brawler. The entrance's DOM already says this and it stays.

What they experience inside: a golden field; a guide that is the wind; three
stops that make "deterministic" something they watched rather than read; the
two games; one press; a latent form that lights the company info.

The one interaction: one drag through the field. The one thing to understand
by the end: **the whole interior was computed from that drag, and would be
identical again.**

## 3. The sequence

For each beat: what the visitor SEES, what it MEANS, how it is BUILT. The
BUILD line is not implementation discussion for its own sake. It is the check
THE GRAIN never had, and it goes on the board so it cannot be skipped.

### Beat 1. The room

SEE: black. The field lies in two lit wedges, one entering from the left edge,
one from the right, both running to the horizon. Between them a wedge of
darkness reaches from the near foreground to the horizon. About 60 percent of
the frame is lit field, 40 percent is dark. A low warm sun sits behind the
field, out of frame, so every stalk is backlit: tops gold, the ground between
them near black, haze thickening with distance. The sky is the same black as
the dark wedge. Reference quality: Gorgo in the wheat in 300, Maximus in
Gladiator's Elysium. Warm, low, backlit, still, holy.

MEANS: you are inside. The outside was severe. This is not.

BUILD: instanced blades, tens of thousands to a few hundred thousand; wind in
the vertex shader; one directional backlight; one shaped light (a projected
mask or a shadow-casting occluder) for the wedge; warm exponential fog; a
near-black clear colour. A backlit grass field under wind is the most-solved
cinematic problem in realtime graphics. Its look lives in light, motion and
silhouette, which is exactly what the rock plain's did not.

OPEN: paddy or wheat. Paddy gives standing water and the gold doubled in
reflection. Wheat gives height to hide the guide in. Decide from the image.

### Beat 2. The hand (the condition)

SEE: the visitor drags once through the field, cursor or finger. Stalks part
where the hand went and stay parted. Nothing else moves yet. The invitation is
the field itself: stalks lean away from the cursor on hover. No arrow, no cue.

MEANS: the condition is set. That stroke is hashed into the seed. Nothing
after it is authored. It is computed.

BUILD: the stroke is painted into a render target the blades sample for bend.
The quantised stroke, a few dozen bytes, is hashed to a 32-bit seed. The seed
goes into the URL, so a reload or a shared link gives the identical run. This
is the brief's "one meaningful interaction within 15 to 20 seconds", met
without a button.

### Beat 3. The wake

SEE: next scroll. Inside the dark wedge, the field moves. A wave comes out of
the dark toward where the hand stopped. Nothing visible is making it. Then the
body surfaces from the stalks.

MEANS: the guide exists before you see it, and you see what it does before you
see what it is.

BUILD: the guide's path is a seeded spline. The wind field is displaced around
the guide's position, so the field moves where it moves. The body is a
spline-following mesh (instanced segments or a resampled tube), rendered as
silhouette with one gold light and a rim: the entrance's proven vocabulary. It
rises along the path's tangent.

### Beat 4. The ride

SEE: the guide glides ahead. Scroll follows it. Behind it the path blooms
gold: stalks it touched change state and do not spring back.

MEANS: consequence, drawn in the field.

BUILD: `ScrollDirector` maps scroll to distance along the guide's spline. A
"touched" mask accumulates in a render target; touched blades read a second
colour and a held bend. The petals are that state change, never an emitter.

### Beat 5. Stop X, the engine

SEE: the guide stills. One wave crosses the entire field as a single motion,
edge to edge.

COPY, draft: "Every stalk obeys one rule. Nothing here is rolled."

BUILD: the same wind system, one authored gust.

### Beat 6. Stop Y, the innovation

SEE: it turns you to look back along the path. Everything it touched is still
touched.

COPY, draft: "The world remembers. The record is the truth."

BUILD: the camera turns on the spline; the touched mask persists.

OPEN: the contents of Y are a proposal, built from the site's own line
("nothing is forgotten", "everything here is earned", every removal written to
the ledger). If the innovation is something specific to Desk42 or Brawler,
Jacob names it and this stop is re-mapped.

### Beat 7. Stop Z, the hybrid

SEE: the wave arrives at the bloomed path and breaks differently over it.

COPY, draft: "What happened changes what happens next."

BUILD: the touched mask modulates each blade's response to the wind.

### Beat 8. The games

Two stops, Desk42 then Brawler. NOT DESIGNED. Each needs its own beat and
Jacob's read on how each game is shown. The brief's Gate F still owns the
dedicated project pages; these are stops, not pages.

### Beat 9. The press

SEE: one press. The guide gathers into a stream aimed from an aperture in the
dark and hits a plane. Where it lands it spreads the way a jet spreads on a
wall and settles into a flat luminous imprint. The imprint lights the company
info beneath it.

MEANS: the latent form. The whole run folded back into the thing it came from.

BUILD: seeded GPU particles (ping-pong render targets in WebGL2) with plane
collision. The impact accumulates into a texture rendered emissive. That
texture is the light for the DOM section below it: the same texture sampled by
a plane behind the copy, so the copy is lit by the imprint and not by a CSS
glow. Same seed, identical imprint, every time.

RULE: the stream never forms a logo, letters or a symbol. The imprint is an
impact pattern and nothing else.

### Beat 10. Company and contact

Lit by the imprint. Thesis, studio, contact, legal links, all in the DOM,
reachable without the intro.

PROPOSAL, not asked for: press the imprint and the stream lifts off the plane
and the run replays identically. Determinism witnessed rather than claimed.

## 4. The guide

Take from Dragonair only the properties: long, legless, glides rather than
walks, gentle, carries an aura, and changes the weather, which here means it
changes the wind. Refuse the look: no blue, no pearls, no orbs, no show face,
no wings for ears. From Olympus: gold light, stillness, the field acknowledging
it. Not human. Not a dragon from fantasy art.

It enters in two stages, effect then body. It leaves in one, the stream.

Designed image-first from Jacob's generations. Checked against silhouette
plus one light before it is locked: if its beauty depends on scales,
iridescence or micro-detail, it is not approved, because that is the medium
failure of THE GRAIN wearing a creature.

## 5. The engine in plain English

Source for every line of copy inside. The visitor's version, not the
engineer's.

Most games roll dice every frame and read the clock. Play the same match
twice: different result, and nobody can prove what happened. A deterministic
engine refuses both. Time moves in identical ticks. Nothing is random.
Everything that happens is computed from two things only: the seed, one number
the whole world unfolds from, and the inputs, what the player did, in order.

That gives three things no other engine gives. Same seed, same inputs: the
identical world, every time, on any machine, down to the last blade. Every
outcome has a cause you can trace. The record of a whole match is tiny, the
seed and the inputs, and it IS the match: play it back and the world comes
back, send it to someone and they get the same world, settle a dispute by
recomputing instead of trusting.

And the fourth thing, the one that makes it feel alive: simple rules on a
million small things produce behaviour nobody wrote. One stalk only knows the
wind and its neighbours. A million of them make a wave you can watch cross the
field.

Determinism language, unchanged: seeded, fixed-step, replayable in the tested
environment. GPU-side wind and particles are visual state; the seed, the
stroke, the guide's path and the touched mask's inputs are the authoritative
state. Never claim bitwise cross-hardware determinism without evidence.

## 6. Reachability ledger

| Element | Realtime method | Check before lock |
| --- | --- | --- |
| The field | instanced blades, vertex-shader wind, fog | a Three.js test at target count holds 60 fps on the 3060 and 30 on a mid phone BEFORE any field image is locked |
| The wedge of darkness | shaped light or occluder | trivial |
| The stroke | render-target paint, hashed seed in URL | trivial |
| The guide | spline body, silhouette, one gold light, rim | any approved creature image must be reproducible as silhouette + one light + rim |
| Bloom on the path | state mask | trivial |
| The wave | wind system | trivial |
| The stream and imprint | GPU particles, accumulation texture | count target set by the 3060 test |
| The imprint lighting the copy | texture-driven plane behind the DOM | trivial |

**No frame is locked until its build method is named here and the expensive
rows have been tested at scale.** THE GRAIN locked six frames with none of
this, and the plain was rebuilt five ways and rejected every time.

## 7. Image workflow

Images before code, unchanged. Order: the room, then the guide, then the
imprint, then the stops.

Three routes, used in this order of preference:

1. **Reachability first.** Build the room's geometry in Three.js at no
   material quality, render a depth pass, and generate the frame conditioned
   on it (ControlNet depth on the ArtLab ComfyUI, or a reference image into
   Krea 2 / Qwen-Image-Edit). What gets approved then has our layout under
   it by construction.
2. **Jacob's still-image tool**, which is what worked for THE GRAIN. I write
   the prompt, he generates, I review one frame at a time and write the next
   prompt stating only what changed.
3. **ArtLab ComfyUI** on port 8191: Krea 2 turbo for text-to-image batches;
   Krea 2 with a reference for "same world, next frame"; Qwen-Image-Edit 2511
   for edits that must keep a locked composition, which is exactly what F6
   needed and did not have.

Rule 8 from THE GRAIN, restated: composite or edit rather than regenerate when
a frame must match a locked one.

## 8. Rules that hold the board together

1. Properties, never looks. Dragonair names a property (it changes the
   weather). 300 names a quality (backlit gold, stillness). Neither is copied.
2. Nothing that makes it slop. No logo-forming particles, no orbs, no glowing
   eyes, no lens flares, no god-ray spray, no purple, no HUD, no glass panels,
   no oversaturated gold, nothing that could not be photographed.
3. The entrance is the yardstick. Anything that would not sit in the same
   frame as the spire is out.
4. Effect before body. The guide is seen through what it does to the field
   before it is seen at all.
5. Consequence is a state change in the world, never an emitter.
6. Reachability before lock. Section 6 is not optional.
7. Taste is Jacob's. I write prompts and diagnose. I do not approve, and I do
   not settle a taste call with renders.
8. Composite or edit rather than regenerate when a frame must match a locked
   one.
9. When a note fails twice, change the method, not the wording.
10. Never say layered, blocky or stratified. Carried, in case rock returns.

## 9. Constitution notes

The DOM is unchanged by this board: self-hosted type, no decorative gradient,
no event colour spent on decoration, no scroll cue (the parting stalks are the
affordance), legal pages present. Gold is the interior's light, not a brand
gradient; it exists as light on stalks and as the imprint, never as a fill.
The banned constructions of 2026-08-17 (orb, planet, eclipse, portal, halo,
tunnel, radial bloom, filament field, blob, line field) are lifted by Jacob
for the interior; the slop rule above is what replaces them. Kill words still
kill a frame on sight.

## 10. Open questions for Jacob

1. The contents of Y, the innovation.
2. The games' two stops: how each game is shown.
3. Paddy or wheat, from the image.
4. Replay on a second press: yes or no.
5. Names: the direction and the guide.
6. Where the X, Y, Z copy sits. Assumed: pinned beside each stop in the DOM,
   the way the survey annotations are pinned to the monument.

## 11. F1 prompt: the room

Natural language, one paragraph, no weights or tags. Written so the image can
contain only things the BUILD line for Beat 1 can produce.

> A vast field of ripe golden grain at dusk, seen from a low standing height
> from inside a dark space whose walls are lost in black. The field runs to a
> far horizon. A low sun sits behind the field, out of frame, so every stalk is
> backlit: the tops glow warm gold, the ground between them falls to near
> black, and warm haze thickens with distance until the far field is one
> continuous gold. The field is lit only in two wide wedges, one entering from
> the left edge of the frame and one from the right; between them a wedge of
> darkness reaches from the near foreground to the horizon, unlit, as if the
> light simply does not reach it. About sixty percent of the frame is lit
> field and forty percent is that darkness. The sky is the same near black as
> the darkness. Stalks in the near foreground are large, individual and sharp;
> nothing else is in the frame: no figures, no creature, no buildings, no
> path, no sun disc, no glow, no lens flare, no text. Large-format
> photograph, 35mm lens, 16:9, quiet and still.

For any route with a negative prompt (SDXL, cfg above 1): lens flare, god
rays, glow, bloom, sun disc, figure, creature, building, path, road, text,
watermark, oversaturated, HDR, fantasy painting, concept art.

Krea 2 turbo runs at cfg 1, so only the positive prompt counts there.
