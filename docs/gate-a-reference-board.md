# GATE A — REFERENCE EXTRACTION

**Brief:** `docs/REFOUNDATION_BRIEF.md` section 14, Gate A
**Run:** 2026-08-17
**Pass condition:** references describe form and behavior, not just mood
**Fail condition:** the board becomes a collection of unrelated dark sci-fi images

---

## A.1 Verdict

**The original bloom / tunnel / entity captures FAIL the Gate A pass condition.**

The brief's section 2 asserts that the earliest DMT bloom, tunnel and entity
direction "created the strongest emotional response". The surviving frames were
opened and inspected rather than recalled. They supply mood. They do not supply
form or behaviour, and two of them are rejected by the brief's own kill tests
before any implementation exists.

| Frame | What is actually in it | Brief rule it breaks |
|---|---|---|
| `captures/final-tunnel.png` | Repeated faceted shards receding to a cyan starburst, teal and magenta iridescence, overlaid copy double printing | Section 9 main risk, "generic portal". Repeated primitive. |
| `captures/halo-v4.png` | Dark faceted mass, literal gold ring above it, blue vertical streak background, DARK LATTICE set across the object | Section 15 kill test 1, "a cool 3D object with text". Section 8, type over the subject. |
| `captures/core-tunnel.png`, `core2`, `core3` | Same shard tunnel, earlier passes | As above |
| `captures/back-to-crown.png`, `fhalo/` | Crown and halo studies | Halo reads as applied decoration, not as system output |

**This does not kill THE CRITICAL BLOOM.** It kills the premise that these
captures are its reference. The board below is rebuilt from physical sources and
from the frames in this repository that demonstrably satisfy the brief's own
section 8 requirements.

---

## A.2 The five qualities, each anchored to a real frame

The brief requires exactly five: silhouette, depth, luminance structure, scale,
implied intelligence. Each is anchored to a frame that actually exhibits it, with
the reason. No frame is included for mood.

### 1. Silhouette

**Anchor:** `captures/site-hero/01-opening.png`

One continuous form occupying roughly 55 percent of the frame, right of centre,
readable as a single object at thumbnail size and with bloom disabled. The
negative space on the left is not empty. It is the half of the composition that
holds the type.

**What to take:** one field, one silhouette. The brief's section 8 says one
central field, not multiple hero objects. Any bloom construction that resolves
into several competing shapes has already failed this.

**What to reject:** `final-tunnel.png`, where the silhouette is the aggregate of
several dozen shards and the eye counts them instead of reading one thing.

### 2. Depth

**Anchor:** `captures/locked/3-PEAK-CYAN.png`

Depth is produced by occlusion and by luminance falloff along the structure, not
by perspective recession down a corridor. Near surfaces occlude far ones, and
the far ones fall to true black rather than to a dimmer version of themselves.

**What to take:** depth from occlusion and falloff.

**What to reject:** tunnel recession as the depth device. Repeated bands
receding toward a vanishing point is the construction that reads as a portal,
and the brief kills the direction for it in section 9.

### 3. Luminance structure

**Anchor:** `captures/locked/3-PEAK-CYAN.png` against
`captures/site-hero/01-opening.png`

The pair is the point. At rest the entire structure sits in a narrow band just
above black. During an event, one branch goes to near-peak white with a
Cherenkov-blue core while every other part of the frame stays where it was. The
light belongs to the event, not to the object.

**What to take:** a rest state that is almost entirely dark, and an event that
spends its energy in one place. Brief section 8: light appears physically
concentrated rather than sprayed across the screen.

**What to reject:** `halo-v4.png`, where the background streaks, the ring and
the core all emit at once, so nothing reads as an event.

### 4. Scale

**Anchor:** `captures/site-hero/01-opening.png`

Scale comes from the form being cropped by the viewport, from the fineness of
the internal line structure relative to the whole, and from the type having a
different order of magnitude than the detail it sits beside.

**What to take:** crop the form. A subject fully contained inside the frame with
margin on all sides reads as an object on a page, not as something large.

**What to reject:** scale asserted by a wide empty background. The old frames
put a small object in a big void and the result reads as small, not vast.

### 5. Implied intelligence

**Anchor:** `captures/locked/1-REST.png` to `4-PEAK-VIOLET.png`, in sequence

This is the only quality the old frames genuinely lack and the only one that
cannot be faked by rendering. It comes from the structure responding
proportionally and locally to input, then doing something the visitor did not
ask for. It is behavioural, not visual.

**What to take:** the response must be local, proportional, and then exceed the
request. That is the brief's section 9 first interaction and its section 5
states 2 and 3.

**What to reject:** ambient motion presented as awareness. Brief section 6
forbids it explicitly.

---

## A.3 Physical reference, and what to extract from each

The brief names four. Each entry states the form and the behaviour to take, so
the board cannot degrade into a mood collage.

**Solar corona.**
Form: filament structure organised by an invisible field, dense at the base and
thinning outward without a hard edge. Behaviour: quiescent for long periods,
then a localised release that reorganises one region while the rest is
unaffected. Take the localisation. Reject the orange and the full ring.

**Cherenkov radiation.**
Form: a deep blue glow with a hard inner boundary and a soft outer one, emitted
from within a volume rather than from a surface. Behaviour: emission is caused
by something exceeding a threshold in the medium. Take threshold-caused
emission, which is exactly the brief's stored deviation. `#56D8FF` is the
brief's value for it.

**Magnetic field topology.**
Form: lines that never cross, that are dense where the field is strong, and
whose arrangement is fully determined by the sources. Behaviour: move a source
and the entire topology reorganises deterministically. Take the determinism and
the non-crossing rule. This is the strongest available answer to the repeated
primitive problem, because field lines are not repeated instances of a shape,
they are one solution sampled at many places.

**Reaction fronts.**
Form: a boundary between two states, sharp where the reaction is fast and
diffuse where it is slow. Behaviour: propagates through a medium, is affected by
what it passes through, and leaves the medium changed behind it. Take the
persistent change behind the front. That is Brawler's contamination and the
site's stored deviation in the same mechanism.

---

## A.4 Carried into Gate B

1. One silhouette, one field, cropped by the viewport.
2. Depth from occlusion and falloff, never from corridor recession.
3. Rest sits just above black. Events spend luminance in one place.
4. Nothing repeated as an instance. Structure is one solution sampled.
5. Response is local, proportional, then exceeds the request.

Gate B styleframes all three directions, desktop and mobile, with real copy,
per section 14 and section 18 deliverable 2. The pass condition is that the
frame looks authored and high-end **with bloom disabled**.
