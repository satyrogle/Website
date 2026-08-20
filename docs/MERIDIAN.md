# THE MERIDIAN — the sky's one element

```
STATUS:  SUPERSEDED, 2026-08-19, hours after it was written, by Jacob.
         See docs/THE_LID_AND_THE_DRAW.md, which he locked instead.
         Nothing here was built. History, not a base.
```

**Why it was replaced, in his words:** the lid, the draw and the shaft
"do the turn through spatial structure, not through a decorative sky
effect". The Meridian is an effect applied to the sky. The lid is a
fact about the world. He chose the fact.

Kept because section 9's kill risks still bind anything drawn in this
sky, and because section 7.1 records what the existing shader already
gives for free.

```
SOURCE:  Jacob, 2026-08-19, in full and unprompted after rejecting six
         suggestions of mine.
STATUS:  RECORDED, NOT BUILT. He said "paper only".
SCOPE:   one element in the sky, and nothing else in the sky ever.
         Not the decks, not the horizon, not the Spire, not the Choir.
```

## 0. The sentence it has to survive

> An impossibly large, almost perfectly straight fracture in the sky
> itself. Not lightning. Not a beam. Not a glowing portal.

Everything below serves that sentence. Where an implementation detail
and that sentence disagree, the sentence wins.

## 1. Why it exists, and the layer it occupies

Jacob's hierarchy for the landing frame, recorded verbatim in structure:

```
foreground            Dark Lattice typography
subject               the Split Spire
world                 the Choir
cosmological anomaly  the Meridian
```

The Spire is the thing you investigate. The Choir are the things
occupying its world. The Meridian is evidence that the world itself may
be part of something larger.

His closing instruction: **"That is enough. I would not put another
celestial object beside it."** One element. The sky is otherwise
finished.

## 2. What it is NOT

Named by Jacob as immediate pushes toward generic sci-fi, and therefore
banned in this frame: planets, moons, galaxies, black holes, giant
rings, auroras. Also from his own construction ban list, and all of them
one bad tuning pass away from this element: orb, eclipse, portal, halo,
radial bloom.

It is not lightning, not a beam, not a glowing portal, and **not
brighter than the sky around it**. See section 4 — the core goes DOWN.

## 3. Placement in the landing frame

Behind and slightly offset from the central fissure. Near-vertical, not
vertical — an off-vertical division running through the atmosphere
behind the Spire.

The load-bearing relationship:

```
sky fracture  ->  monument fracture
```

The Spire's fissure **almost aligns with the Meridian, and not
perfectly**. The near-miss is the point. A perfect alignment answers the
question; the near-miss makes the frame feel composed around something
enormous that cannot be identified. We never say which caused which.

## 4. What it actually looks like

Most of the sky stays near-black. Across it is a region roughly
**1 to 3 degrees wide** where the sky behaves incorrectly:

- the deck structure disappears inside it;
- haze bends slightly toward it;
- its two edges catch an extremely faint cold-white diffraction;
- distant cloud and mist appear subtly stretched where they cross it;
- one side of the sky sits perhaps 2 to 3 percent darker than the other.

So the eye reads **something happened to space here**, with no object
to name. That absence of an object is the requirement, not a limitation
of the method.

### 4.1 One translation I had to make, flagged rather than silently applied

Jacob wrote "stars/noise disappear inside it". **There are no stars.**
`starfield` is on this project's kill list and the sky has never had
one. The equivalent that does exist is the deck structure built on
2026-08-19 — three horizontal sheets of haze whose fbm texture is the
only structure the sky has. That is what disappears inside the Meridian,
and it is a better read anyway: the fracture eats *weather*, which is
nearer and therefore stranger than eating stars.

If he did mean literal stars, that is a separate decision and it
reopens a kill word.

## 5. The behaviour that makes it work

At the landing camera, one extremely precise accident: **the Meridian,
one Choir mass, and one face of the Split Spire align.** For the first
few seconds you get an impossible composition.

Then the visitor moves around the Spire:

- the Spire moves, because it is near;
- the Choir separates through parallax;
- **the Meridian does not move at all, because it is celestial.**

The relationship breaks. That communicates the scale with no animation,
nothing flying, nothing performing.

Jacob's summary of why this is the right behaviour for the site:

> The user moved, therefore the truth changed.

## 6. The late reinterpretation

Beginning: a beautiful pale seam.

End: the same seam, unchanged in shape. But after the site has revealed
the lattice under the Spire, the lighting has changed enough that you
notice **tiny repeating discontinuities** along it — regular
interruptions, not random noise:

```
│
│
╵
│
│
╵
│
```

It stops looking astronomical and starts looking constructed. We never
reveal what constructed it.

This is reinterpretation, not transformation, which is what the
experience law asks for.

## 7. How it is built, when it is built

Directly inside the existing sky shader. No mesh, no texture, no asset.
Mathematically defined from a fixed world-space direction, which is why
it is stable while the camera travels.

Jacob's own sketch, recorded as the starting point and not as final
numbers:

```glsl
float distanceToMeridian = ...;

float voidCore = 1.0 - smoothstep(0.002, 0.012, distanceToMeridian);
float edge     = exp(-pow(distanceToMeridian / 0.018, 2.0));

sky *= 1.0 - voidCore * 0.65;
sky += coldLight * edge * 0.05;
```

Then the deck sample coordinate is warped very slightly toward the seam,
which produces both the bending haze and the stretched cloud in one
term.

### 7.1 What is already in place, so this is cheaper than it looks

- **The celestial behaviour is free.** `SKY_VERT` builds its direction
  with `modelViewMatrix * vec4(position, 0.0)` and writes `.xyww`, so
  the sky is direction-only and already at infinity. Anything defined
  on `d` alone cannot parallax.
- **The contrast is also free.** The haze decks added on 2026-08-19
  intersect at `t = (H - eye.y) / d.y` and therefore DO parallax off
  `cameraPosition`. So the moment the visitor moves, the decks slide and
  the Meridian does not, in the same frame, with no extra work. Section
  5 is a consequence of the deck build rather than a new feature.
- **The one-viewpoint alignment machinery exists.** `choir.py` already
  cuts every mass with a single plane passing through the landing camera
  `(0, 14, 300)` looking at `(0, 96, 0)`, tilted 14 degrees, so the
  grooves coincide into one line from there and scatter from anywhere
  else.
- **The warp hook exists.** The decks sample `skyFbm(p * scale)`; the
  distortion in section 7 is a modification of `p`, not new machinery.

### 7.2 The arithmetic, so it is not re-derived

Vertical FOV is 42 degrees. On a 900 px frame that is about 21 px per
degree, so 1 to 3 degrees is a **21 to 64 px** wide feature. Jacob's
sketch, read in radians, gives a core out to 0.012 rad (0.69 deg) and
an edge falloff out to 0.018 rad (1.03 deg) — a total feature near 2
degrees. His two figures agree.

## 8. Open questions, for him and not for me

1. **Two "one line from this camera" devices in one frame.** The Choir's
   six grooves already coincide into a single line from the landing
   camera. The Meridian is a second near-line in the same frame. They
   may reinforce each other into one severe geometry, or they may
   compete and read as a system of stripes. Whether the Meridian should
   share the Choir's plane, sit at a deliberate small angle to it, or
   whether one of the two devices should give way, is a composition
   call.
2. **Is the discontinuity the return's one visible change?** The
   approved return allows at most one visible change. If the Meridian's
   interruptions are it, the return is spoken for. If not, they compete
   with whatever else changes.
3. **Mobile.** A near-vertical seam behaves very differently in a
   portrait frame. Mobile is a deliberate recomposition, so its angle
   and offset are probably not the desktop ones.

## 9. Kill risks, named in advance

- **It brightens.** The moment the core reads as emissive rather than as
  absence, it is a beam or a glowing gash. The core multiplies DOWN.
  Only the two edges add, and faintly.
- **It gains an aperture.** Any end, cap, ring or widening turns it into
  a portal.
- **It multiplies.** One line is a fracture. Several is a generative
  line field, which is banned.
- **It reads as a defect.** A dead-straight 1-degree line across a dark
  frame can read as a lens hair, a screen crack or a rendering artifact
  rather than as something enormous. The "almost straight" quality, the
  edge diffraction and the bending haze are what stop that, and they are
  therefore not optional polish.
- **The cold white becomes a brand device.** Faint diffraction at the
  edges only. It must not creep toward Cherenkov blue used as a colour
  signature.

## 10. Status

Nothing is built. No file under `src/`, `public/models/` or
`tools/blender/` has been touched for this element. This document is the
whole of it.

The name is locked: **THE MERIDIAN**.
