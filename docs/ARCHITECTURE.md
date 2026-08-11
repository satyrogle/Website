# Dark Lattice — website architecture

**FROZEN 2026-08-10. LOCKED 2026-08-11. Direction: THE INTAKE.**

This supersedes the trench/strata/truss stage, the Signal Horizon terrain, the
nine-movement structure, the entire central-entity direction, the False Façade /
Anamorphic Threshold Guardian candidate, and THE LATTICE excess-order ascent.
The *argument* below has survived every one of those and is not up for
renegotiation; only the set has been rebuilt.

Paper only. Nothing is implemented against this yet — `src/` predates this
document. Locking fixes the direction, not the schedule: work the build order at
the end of this file one step at a time.

---

## THE INTAKE

A vertical descent into a system that grew.

From the surface it looks like grace — golden, ordered, radiant, light pouring
up out of the earth. You go down into it. The deeper you go, the less it looks
like order and the more it looks like appetite. At the bottom you find what it
was doing the whole time: **writing you down, wrong.** Looking back up from the
floor, the radiant thing you entered through is still there, and you now
understand that the divine face was never the system. It was the system's
**record of itself**.

The turn is not "pretty object becomes monster." It is:

> **What looks like grace is the paperwork. What is underneath is the machine.**

`INTAKE` is meant in both senses at once: a vent that swallows, and an
admissions process.

### Why this version holds

Amber was already the colour of the record. So **the divine IS amber** — the
theology and the thesis become the same statement. Every earlier version had a
beautiful thing and, separately, an argument. Here the beauty *is* the argument,
which is why it cannot decorate.

## The five beats

**1 — THE FACE**
Black plain. A wound in it. Amber light rising out. Near-symmetric, calm, holy.

> *A system in perfect order.*

**2 — THE ASK**
`Touch it.` The false first action is intact — act or do not, something gets
logged as you.

**3 — THE DESCENT** *(the turn — gradual, continuous, never captioned)*
The touch sends the cyan disturbance down through the structure ahead of you and
you follow your own consequence. Scroll is depth. Three things change
continuously; all are parameters, none are set pieces:

- **Growth gradient.** Walls run crystalline / ordered / cathedral-like near the
  surface to tangled, dense and root-like at depth. One growth system top to
  bottom, only its parameters slide. Order becomes appetite.
- **Aperture.** At scripted beats the camera tilts up. The opening above is
  smaller each time. Nothing says so.
- **Registrations.** Amber sensor glints fire as you pass. The structure notices
  you. This is the observations buffer made visible rather than explained.

Meanwhile the record assembles **above and behind you** — always a few beats
late, always simpler. Where you wound past three chambers, it logs one straight
strut.

**4 — THE FLOOR**
Deepest chamber. Nearly dark, dense, and — uniquely — **still growing live**.
Tendrils extending in real time, toward the camera.

The reveal is not a creature. It is a file:

```
YOUR RECORD
  RECORDED    Descent completed in 3 steps.
  MEASURED    214 steps. 2 pauses. 1 look back.
  DIVERGENCE  3 events.
```

The most diabolical thing at the bottom is that it is about *you*, and it is
wrong.

**5 — LOOK UP**
From the floor, the full shaft. The amber reconstruction hangs above, clean and
luminous — a false cathedral of your own descent. It looks exactly like the
divinity from beat one because it **is** it. Cyan trace buried behind it, violet
burning at the anchor points.

> *The event took forty seconds. The record took one line.*

Then machine off — hard cut, canvas stops rendering — onto solid editorial
ground:

> **You just descended through a deterministic system. It observed you. It
> recorded you wrong. We build games about exactly this.**

Desk42, Brawler, evidence, contact. Closing line unchanged:
*This is only its current state.*

## The central bet

Stated honestly, because it is the thing that can fail:

> Placement-variance read as debris. **Process-variance reads as alive.**

A grown structure has no silhouette to judge because it has no outline — it has
a history. Growth is the one generative mechanism where irregularity signals
intent rather than randomness. That option was never available to the entity.

If the bet is wrong we find out at **bake time, offline, cheaply** — not after a
week of runtime work.

## Not the old graveyard

The retired tunnels died of **rotational symmetry** — mandala, octagon, turbine.

- Growth is seeded from scattered points. **Zero cylindrical parameterisation
  anywhere in the pipeline.**
- The camera rail drifts and hugs walls; it does not run a clean central axis.
- Capture review has a hard rule: **any frame that reads as concentric rings
  fails.**

Nothing is hand-modelled. The mouth is erosion, the shaft is growth, the
cathedral is reconstruction from samples. What is authored is the camera rail
and the depth-parameter curves — direction, not modelling.

---

## The argument (unchanged, canonical)

```
WORLD
  |  continuous
  v
PHYSICAL STATE ................ cyan
  |  contact / sensor sampling
  v
OBSERVATIONS .................. sparse, information-poor
  |  incomplete evidence
  v
RECORDED MODEL ................ amber  ( = the divine face )
  |  acts back on the world
  v
CONSEQUENCE
  |
  +-- disagreement at contact .. violet
```

**The record is incomplete because the institution never possessed reality. It
possessed observations.** Nothing is artificially blurred — the amber structure
is simple because it was reconstructed from a handful of samples.

The middle layer is NOT a simulation texture. It is a small event buffer:

```ts
type Observation = {
  position: Vec3
  time: number
  amplitude: number
  sourceAnchorId: number
}
```

Anchors are fixed contact points placed deterministically from the seed along
the shaft. **They exist before the event** — the sensors were already there —
and fire only when the disturbance passes. Some never fire. The recorded
structure is fitted through whatever they caught.

Directly exposable as copy:

```
WHAT HAPPENED     continuous physical trace
WHAT WAS SEEN     4 samples
WHAT WAS WRITTEN  1 reconstructed route
```

## Colour grammar

```
CYAN     the world
AMBER    the model of the world  (and therefore the divine face)
VIOLET   the consequence of their disagreement
```

`V = D x C`, where `D = |P - R|` is kept in full mathematically and `C` is the
sparse contact mask. Disagreement can exist unseen for a long time; it becomes
visible when the system acts on reality.

**Never redefined per section.** Desk42, Brawler, diagrams, evidence panels and
the visitor's own record all inherit this exact meaning.

## Fields

| Field | Kind | Purpose |
|---|---|---|
| Live physical | simulation over the grown graph | the travelling disturbance |
| Physical trace | running max of abs(P) | where reality went — cyan scar, survives to beat 5 |
| Observations | small CPU buffer | what the anchors caught |
| Recorded structure | fitted through observations | what was written — amber |
| Divergence | monotonic | `D x C` — violet |

## Interaction law

```
EXPERIENCE  ->  NOTICE SOMETHING IS WRONG  ->  UNDERSTAND  ->  ONLY THEN READ
```

Never heading -> paragraph -> screenshot -> button. Demonstrate the mechanic
first, name the project second. This is the studio identity and it is what stops
the site collapsing into a portfolio.

## The false first action

If the visitor does not act within 8 seconds the system acts and logs it as
theirs. The lie must be **inspectable, not theatrical** — two parallel logs,
diffed only at the bottom:

```ts
physical_event  { source: 'SYSTEM' | 'VISITOR', position, timestamp }
recorded_event  { source: 'VISITOR',            position: simplified, timestamp: quantised }
```

### Mechanism vs catalogue

**Route simplification is the fundamental mechanism and happens on every visit.**
As one entry in a random table it would vanish on some visits and take the
thesis with it.

The catalogue controls only the *additional* documentary failure, chosen
deterministically by hashing `(seed, event position, visit index)`:

| Visit condition | Additional divergence |
|---|---|
| No interaction | system action attributed to the visitor |
| Real interaction | position quantised |
| Real interaction | timestamp bucketed |
| Branching physical route | one branch omitted |
| Multiple observations | observations collapsed into one event |

## Skip path

Persistent from frame one. Small, quiet, fixed. No penalty, no modal, no
confirmation. Jumps **directly to the editorial handoff** — it does not
fast-forward the camera or fake completion.

The record then states the truth:

```
SIMULATION   Not entered.
RECORD       Visitor requested direct access to work.
```

A system that accurately records someone declining to participate strengthens
the thesis. A site arguing that records are incomplete must not trap a reader
who needs the record.

## Persistence

`localStorage` only. No account, no fingerprinting, no backend, no cross-device
identity.

```ts
darkLattice.record = { seed, visits: [], events: [] }
```

## Positioning

The institutional-assessment subtext stays **implicit**. Making it explicit
inverts the hierarchy into "the studio exists because its founder must convince
an institution," which does not survive investors, publishers, hiring or press.

```
DESK42          You operate the record.
PROJECT BRAWLER You operate the physical system.
DARK LATTICE    We build worlds where neither layer waits for the other.
```

**Project imagery.** No generated game-looking pictures, ever. The homepage uses
abstract system diagrams that make no gameplay claim. Real build captures belong
on project detail pages, where normal evidence rules apply.

---

## Engineering

### Growth runs offline

A build script, not a runtime system. Differential growth plus adaptive-network
rules from the masterplan, deterministic from the seed, baked with a
**birth-time per element**.

Runtime "grows" by sliding a birth-time threshold with scroll depth: the
presence of a living thing at the cost of instanced geometry. Target ~100k
instances with fog and bloom — comfortable on the 3060.

### The grown structure is natively a graph

Which means `CausalPulseSimulation` runs on it **as is**. The Worker,
edge-strain memory, quantised checksum and the whole validation harness stop
being archived research and become the engine.

That work is on `claude/causal-pulse-spike-v1` and its measurement discipline
transfers unchanged.

### Gate A

Restated for the new geometry, same instrument, same criteria:

> Energy injected at the mouth is absorbed at depth.

Measure **interior energy** with the absorbing region masked out, smoothed over
~0.25s, plus a **return probe** near the injection point.

```
PASS   interior residual  < 2% of peak
       return amplitude   < 5% of outgoing peak
       no visually obvious coherent return front
```

A monotonic total-energy curve is the WRONG criterion — legitimate interference,
discretisation noise and internal reflection off real geometry all produce local
rises while absorption is still excellent.

**Keep a real-GPU capture beside the curve.** The graph proves absorption; the
capture proves the event is still visually readable. It must come from the 3060,
never SwiftShader.

### Implementation vocabulary

Banned from code, comments, commits, filenames and copy, so the dead concept
cannot creep back through naming:

```
FULL FORM   MONOLITH   SEVEN MASSES   TUNNEL ENTITY   LATENT FORM   HERO GLB
```

Use instead: `face`, `mouth`, `descent`, `shaft`, `floor`, `cathedral`.

### Stack

Vite, TypeScript, Three.js, WebGL2, GLSL, GSAP for scroll and camera only.
No WebGPU, no backend, no generated model, no hero asset, no authored mesh.

---

## Risks, named

**Growth-bake aesthetics is the new art risk.** If the growth is ugly, the site
is ugly, and closing that is a parameter search. It converges or it does not,
and we will know within the first bake sessions rather than after a week.

**Pacing a single vertical descent.** The aperture beats are the pacing tool.

Both are honest unknowns. Neither is the silhouette problem returning: there is
no outline to get right.

## Build order

1. Growth bake — offline, deterministic, birth-times. Judge the aesthetics here
2. Shaft geometry + camera rail + depth-parameter curves
3. **GATE A** — disturbance through the grown graph, absorbed at depth
4. Aperture beats and the growth gradient
5. Anchor sampling into the observations buffer
6. Fit the recorded structure through those observations
7. Difference field, `D x C` -> violet
8. Floor, live growth, YOUR RECORD
9. Machine-off, editorial band, evidence, skip path

Steps 1 and 3 are the only ones that can kill it. Everything after is
conventional geometry and rendering.
