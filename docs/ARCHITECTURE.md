# Dark Lattice — website architecture

**Frozen 2026-08-10.** This is the build reference. It supersedes the
nine-movement structure and the entire central-entity direction.

---

## The argument

Three layers, one causal chain:

```
physical state  →  observed state  →  recorded state  →  consequence
```

The record is wrong **because it was reconstructed from too few observations**,
not because it was blurred. Observation happens only where the official
structure contacts reality, so the contact points are causal, not cosmetic.

Colour grammar, taught once in the trench and then reused everywhere without
further explanation:

```
CYAN     the world
AMBER    the model of the world
VIOLET   the consequence of their disagreement
```

Violet renders `V = D x C`, where `D = |P - R|` is kept in full mathematically
and `C` is the sparse contact mask. Disagreement can exist unseen for a long
time; it becomes visible when the system acts on reality.

**These three colours are never redefined per section.** Desk42, Brawler,
technical diagrams, evidence panels and the visitor's own record all inherit
this exact meaning. One grammar taught once and reused is worth more than a
bespoke visual language per project.

## Interaction rule

Every section, without exception:

```
EXPERIENCE  →  NOTICE SOMETHING IS WRONG  →  UNDERSTAND  →  ONLY THEN READ
```

Never heading → paragraph → screenshot → button. Demonstrate the mechanic
first, name the project second. This rule is the studio identity; it is what
stops the site collapsing into "cool indie studio website."

## Three states, one height field

No object is authored. Approach, enter, withdraw — the same terrain at three
camera scales.

| State | Question | Camera |
|---|---|---|
| Approach | What is this? | Very high. An enormous unreadable fissure system below. Scroll pulls you down |
| Interior | How does it work? | Trench floor. Cut stratified walls above you. The grammar is taught here |
| Withdrawal | Who made it, where next? | Lifts out and keeps going until everything traversed — including this visit's violet scars — is one thin seam in black |

**The final seam must stay geological and incomplete.** Not a logo, not a jewel,
not a glyph, not a symmetrical mark, not a centred emblem. If it resolves into
something neat we have recreated the entity problem in two dimensions. Enforce
it at capture time: the seam must be off-centre, irregular in aspect, and broken
into disconnected segments.

Rock character is non-negotiable: **cut and stratified — an excavation or core
sample, not scenery.** Terraced height, columnar jointing.

## Flow

```
COLD OPEN            near-black, one line, no nav. "Systems leave traces."
    v
YOU ARE ASKED TO ACT scroll locked until the visitor acts, or 8s elapse
    v
EVENT                cyan through real topology; energy exits, never returns
    v
INCORRECT RECORD     amber assembles overhead, late, from sparse samples
    v
REVEAL               camera lifts to cross-section; the contradiction is legible
    v
MACHINE OFF          canvas stops rendering. Hard cut, not a fade
    v
THESIS               "You caused an event. The system observed it.
                      The record simplified it. Those are three different things."
    v
INSTANCES            SITE = instance 0, DESK42 = 1, BRAWLER = 2
    v
EVIDENCE             claim ladder, sources, deliberate absences, limitations
    v
YOUR OWN FILE        the site's evidence against its own account
    v
INSPECT SYSTEM       optional drawer, closed by default
```

**Instance 0 is the breakthrough.** The WebGL opening is not an introduction to
the portfolio — it is already a product argument. Desk42 and Brawler do not have
to justify sitting beneath it, because all three are the same idea at different
scales.

## Skip path

Persistent from frame one. Small, quiet, fixed position. No penalty, no modal,
no confirmation.

It jumps **directly to the editorial handoff** — it does not fast-forward the
camera and it does not fake completion of the experience.

The record then states the truth:

```
SIMULATION   Not entered.
RECORD       Visitor requested direct access to work.
```

A system that accurately records someone declining to participate strengthens
the thesis rather than weakening it. And a site arguing that records are
incomplete must not trap a reader who needs the record.

## The false first action

If the visitor does not act within 8 seconds the system acts and logs it as
theirs. The lie must be **inspectable, not theatrical** — two parallel logs are
kept and only diffed at the end:

```ts
physical_event  { source: 'SYSTEM' | 'VISITOR', position, timestamp }
recorded_event  { source: 'VISITOR',            position: simplified, timestamp: quantised }
```

The visitor sees only `TOUCH REGISTERED` at the time. At the bottom:

```
YOUR RECORD
  RECORDED       You touched the eastern wall at 16:26:12.
  MEASURED       No visitor input occurred.
  ACTION SOURCE  System-generated.
  DIVERGENCE     1 event.
```

If they *do* act, a smaller divergence is used instead, so there is always a
discrepancy and never the same lie twice. Chosen deterministically by hashing
`(seed, event position, visit index)`:

- position quantised to the coarse grid
- timestamp quantised to the nearest interval
- route simplified — record spans straight, physical went around
- one branch omitted entirely

## Persistence

`localStorage` only. No account, no fingerprinting, no backend, no cross-device
identity.

```ts
darkLattice.record = { seed, visits: [], events: [] }
```

Copy can then say "This browser has a record of 4 visits" — transparent and
technically defensible, which is why it lands.

## Positioning

The institutional-assessment subtext stays **implicit**. Making it explicit
inverts the hierarchy into "Dark Lattice exists because its founder must
convince an institution," which does not survive investors, publishers, hiring
or press. The correct hierarchy is a coherent thesis whose interaction with
institutions happens to be resonant.

```
DESK42          You operate the record.
PROJECT BRAWLER You operate the physical system.
DARK LATTICE    We build worlds where neither layer waits for the other.
```

## Scope

**v1** — approach, trench interior, cyan wave + Gate A, amber record, violet
contact, cross-section reveal, thesis, Desk42 evidence panel, studio statement,
withdrawal, editorial evidence, your record, inspector drawer, skip path.

**v2** — Brawler simulation state (port `ReactionField.ts`, already in the repo),
terminology morph, hover-linked system labels, team.

## Build order — do not reorder

1. Trench geometry + interior camera
2. **GATE A** — cyan propagation + sponge boundaries
3. Camera transition to cross-section
4. Coarse recorded simulation, reconstructed from sparse observations
5. Extract recorded path
6. Instance amber bays along it
7. Full difference field
8. `D x C` → violet

### Gate A

The only step that can kill the direction. Everything after it is comparatively
conventional geometry and rendering.

Track `E = sum(u^2 + v^2)` each tick, reduced on the GPU to 1x1 and read back
every ~10 frames.

> **PASS** — E peaks at the strike, decays monotonically, falls below 2% of peak
> within the beat, and never rises more than 5% once decay has begun.

A reflection's signature is E *rising again* after it had been falling.

Expected shape:

```
energy
  |      /  |     /    |    /    \____
  |  _/          \__
  |_/_________________ time
```

**Keep a real-GPU capture beside the curve.** The graph proves absorption; the
capture proves the geometry still makes the event visually readable. Neither is
sufficient alone, and the capture must come from the 3060, not SwiftShader.

**If Gate A fails, stop there.** Do not proceed to camera work, the recorded
field, or anything downstream.

Two ways this fails fixably rather than fundamentally:

- **The sponge must ramp, not switch.** An abrupt sigma causes impedance
  mismatch and the wave partially reflects off the absorber itself. Quadratic or
  cubic over at least 10-15% of the domain width.
- **Both ends of the trench must open into sponge.** Steep walls make the trench
  a waveguide; energy exits almost entirely at the ends. A closed-ended trench
  is a resonant cavity and will ring exactly as the 6,158-node graph did.

## Implementation vocabulary

The old concept must not creep back in through naming. **Banned from code,
comments, commits, filenames and copy:**

```
FULL FORM   MONOLITH   SEVEN MASSES   TUNNEL ENTITY   LATENT FORM   HERO GLB
```

**Use instead:** `approach`, `interior`, `cross-section`, `withdrawal`.

One height field. One world. Three camera scales. No hero object.

## Stack

Vite, TypeScript, Three.js, WebGL2, GLSL, GSAP for scroll and camera only.
No WebGPU, no Worker, no graph, no backend, no generated model, no hero asset.
