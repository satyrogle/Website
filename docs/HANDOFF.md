# HANDOFF — Dark Lattice, 2026-08-23

Written for a fresh agent with no context. Read this, then
`docs/THE_CROSSING_PLAN.md`. Those two are the whole briefing.

---

## 1. Where things are

- **Repo:** this checkout. Branch `claude/genesis`. HEAD `49ec359`, tree
  clean. The site is at the repo root (orphan branch, no shared history
  with `main`).
- **Dev server:** Vite on port 5180. `node_modules/.bin` is broken in
  this checkout, so run Vite through node directly:
  `node node_modules/vite/bin/vite.js . --port 5180 --strictPort`
- **Typecheck:** `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
  (`npm run build` does not work here, same reason.)
- **Test harness:** `node tools/quality.mjs` — 11 checks, all passing at
  HEAD. Needs the dev server up. Runs headed Chrome on the real GPU.
- **Captures:** `node tools/e0-capture.mjs` writes `captures/e0/`
  (desktop at Jacob's 2270x1278, mobile, and a crop of the foot).
  `captures/` is gitignored.
- **Blender** is installed but not on PATH:
  `"/c/Program Files/Blender Foundation/Blender 4.5/blender.exe" -b -P tools/blender/monument.py`
  Same for `choir.py`. Only needed when the monument's FORM changes.

## 2. The story (LOCKED — do not reopen)

**The monument is not a temple. It is a lock.** The holy exterior is the
restraint. The light in the fissure is what leaks from the thing being
held. The ledger is the containment log. The culls are strain damage:
something inside pulled, and a piece of the wall let go.

Consequences that bind:
- **Agency lock.** The held thing may *notice* the visitor. The
  containment system owns the ledger. `OBSERVER NOTED — RETAINED` is
  written by the containment, once, near the encounter.
- **Strain chain**, never a decoupled effect: strain → load rises → one
  exterior cell fails → ledger records CULLED → the return keeps it.
- **The true form is not a character.** No humanoid colossus, no boss
  silhouette, no face in the fissure. A restrained spatial mass that
  never fully resolves.

## 3. What is actually built

**Exterior / landing — the current focus.** Podium, stair and pylons
deleted. The plain is graded level at the roots and blends back into
dunes. The blades FLARE into the ground (a fillet, not a cone). The
contact is one system keyed to `fd`, distance to the flared footprint:
hairline seam, basin sag, press shadow, under-stone dark, an incision
carrying the split out toward the visitor with cold light in it, bright
vesicular lace at the wound, four long stress seams. The record crowds
and is eaten at the wound (see `49ec359`).

**Six sinister gates** (committed earlier): the ledger has a seeded past
with negative ticks; the watcher attends before any pointer exists; the
sky break is subordinated to the seam; the cold landing; the witnessed
cull at ~74s; the stillness.

**I1 THE BRACE** — approaching the mouth, the world's autonomous motion
stops and the watcher locks dead centre on the visitor.

**I2 THE SWALLOW** — passing the seam redistributes light to the frame
edges while dark opens from the centre. Never brighter than the landing
seam; the harness asserts both that and the no-ring rule.

**I3 THE INTERIOR, first pass, INCOMPLETE.** An aperture opening onto a
dark country 60000 units to one side (the far plane is 4200, so neither
world can draw the other). Two known faults, both named and unfixed:
the DOM content stops no longer line up with the camera, and the
horizon band does not read.

## 4. Review pins

On `?harness=1`, in the console. These exist so Jacob points at a
rendered frame instead of anyone guessing a number:

```
__dl.script(x)    the crowded record at the wound   (default 1)
__dl.still(0|1)   hold the brace open / shut        (-1 = live)
__dl.swallow(0..1) hold the crossing mid-pulse      (-1 = live)
__dl.setLid / setDraw / setStrata / setBreak / setRim / setFog / setGrade ...
```

## 5. How to work with Jacob — read this twice

This matters more than any technical note in the file.

- **One change at a time, then stop and hand over.** Build, typecheck,
  capture, say where the frame is, stop. His verdict between every
  change. A batch of four changes got fully reverted on 2026-08-23
  because he could not tell which one broke it — and neither could I.
- **Do not verify what he is going to judge.** When he says he will look
  at it, the job ends at build → typecheck → hand over. Unasked capture
  loops and tuning passes burn his limit for a confidence worth nothing.
  Reading captured PNGs is the single most expensive thing in this repo.
- **His eye outranks every measurement.** Never defend a frame with a
  number. If a metric disagrees with him, the metric is wrong.
- **He judges pictures, not prose.** Every direction ever taken from a
  written description has collapsed on first render. When a choice is
  open, render candidates or ask for a reference image — do not write a
  paragraph describing options.
- **Drawing on the frame is a good channel.** He has circled faults in
  MS Paint twice and both times it was faster than any description.
  Offer it.
- **When he says something is wrong, do not guess the cause.** Two
  separate faults ("the support pillars", "the bump") were each chased
  through wrong hypotheses first. Bisect the scene or probe the shader's
  own values.
- Capture at his viewport, 2270x1278, on the shipping page — never
  `?bare=1`, the DOM scrims are part of what he sees.

## 6. Traps already paid for — do not rediscover

- Canvas pixels are only true inside `requestAnimationFrame`.
- Playwright `evaluate` takes ONE argument; a stringified function
  silently returns `undefined`.
- The bloom threshold (0.78) decides visibility: a front under it is
  real in a difference image and invisible on the monitor.
- Anything standing on the plain must stay under distance 2400 or it
  hovers. Objects and ground must fog to the same colour at the same
  distance.
- Mean-absolute-frame-diff is blind to low-contrast motion. Look at two
  frames.
- Headless/SwiftShader is not GPU truth — a `pow(0,y)` NaN once rendered
  the hero black on Jacob's actual card.
- **The form authority is `src/world/monumentForm.ts`.** Its constants
  are mirrored in `tools/blender/monument.py` and inlined in the GLSL
  (`FRAG_MAP`). Change all three or the cells, the camera and the stone
  part company. `resample()` in the Python walks each profile segment by
  parameter while `profilePoint(u)` walks by ARC LENGTH — they must
  agree about `u`.
- Every tuned value belongs to a camera pose. The landing camera does
  not move; `choir.py` solves its alignment plane from it.
- Loft rings are ~3 units apart. A fillet shorter than that gets
  linearly smeared into a cone — that is resolution, not strength.

## 7. Kill words and banned constructions

A frame named any of these is dead, and the only legal response is to
return to its premise, never to retune it:

spaghetti, hair, fur, dust, structureless smoke, particle demo,
starfield, blob, orb, eclipse, portal, wireframe, graph visualisation,
ShaderToy, AI concept-art mush, chandelier, a cool 3D object beside
company copy.

Also banned: pedestals and plinths of any kind, uniform radial
arrangements, symmetric vanishing-point compositions, radioactive green,
caramel/rust crust, purple-cyan gradients, glowing script, and a lit
void framed by the two horns (that is an eye).

Palette: black, bone, one cold event colour. Nothing else.

## 8. What to do next

Jacob is mid-pass on the exterior base and likes where it landed. In
priority order:

1. **Ask him for the `__dl.script(x)` value** and bake it in. It is the
   only open dial.
2. **Two known shortfalls against his mock**, both flagged to him
   already and neither started: the lace inherits the corrosion field's
   cell size so it reads chunkier than his reference, and the incision
   is thin at the landing's grazing angle.
3. **Then the interior**, which is where the plan goes: fix I3's two
   named faults, then V4 → I4 (the shadow road), I5 (the stations),
   V6 → I6 (the true form), I7 (the return audit), I8 (parity and
   performance). All specified in `docs/THE_CROSSING_PLAN.md`.

Do not start 3 while 1 and 2 are open unless he says so.
