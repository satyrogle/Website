# Dark Lattice — site (genesis build)

One seeded world behind the whole page. Built 2026-08-18 on the orphan
branch `claude/genesis`, then brought under the design constitution the
same day: documented type system, lit material rendering, institutional
ledger, legal pages, quality harness. `docs/DECISION_FRAME.md` is the
constitution 12.1 frame; `docs/SECTION_13_AUDIT.md` is the gate run.

## What it is

A transport-network simulation (Physarum-family dynamics) runs on the
GPU at a fixed 60 Hz step from one seed. The page is a journey through
it at three observational scales:

1. **Enter.** Macro: an immense, luminous, self-organised field.
2. **Travel.** Scroll pulls the reading inward. A press places a mark
   the world retains and records.
3. **Stops.** Desk42, then the rule that produces the beauty, then
   Brawler, then technology and the live record.
4. **The reveal.** The fourth rule, stated plainly: regions that stop
   earning traffic are starved and removed. It is real, driven by
   density read back from the world, and every removal is written to
   the record with its tick, including the visitor's marks.
5. **Return.** The opening frame again, regraded, understood.

There is one simulation, one authoritative state, and no scripted
transformation. Macro, meso and micro are three readings of the same
trail texture.

## Stack

Vite + TypeScript + Three.js (WebGL2, GLSL ES 3.00) + GSAP
ScrollTrigger. No React, no smoothing library, no UI framework, no
external requests of any kind. Type system (documented in
docs/DECISION_FRAME.md): Archivo Variable for display, reading and
interface; Fragment Mono for the ledger, labels and telemetry. Both
self-hosted from npm assets and preloaded.

## Run

```
npm install
npm run dev        # http://localhost:5180
npm run build      # type-check + production build
```

URL switches: `?seed=N` replaces the default seed (20260818),
`?flat=1` disables bloom/atmosphere/grain for static-frame review,
`?bare=1` hides the DOM for world-only captures, `?harness=1` exposes
`window.__dl` and stops auto-stepping for deterministic tests.

## Tooling (run from a checkout that has playwright, e.g. ../dark-lattice)

```
node ../dark-lattice-genesis/tools/capture.mjs      # full frame suite + fallback still
node ../dark-lattice-genesis/tools/quality.mjs      # replay, first-action, a11y, reduced motion
node ../dark-lattice-genesis/tools/seed-sweep.mjs 7 1187   # bare frames per seed
```

## Architecture

`ExperienceState` (coarse truth) · `SimulationKernel` (the world;
agents, trail, beacons, the starvation audit) · `ObservationModel`
(scale, severity, window; derives what the camera reads) ·
`SceneRenderer` (observes, never owns state) · `ScrollDirector` (the
only seam between document and world) · `InputController` (press →
state → consequence → record) · `EvidenceRecorder` (the DOM record) ·
`ContentController` (editorial, reveals, honest numbers).

Determinism claim, exactly: seeded, fixed-step, replayable in the
tested environment. Nothing stronger is claimed anywhere on the page.

## Accessibility and fallback

All company content is plain DOM and readable without the canvas.
Keyboard: skip link, visible focus, a Place-a-mark button equivalent to
the pointer press. `prefers-reduced-motion` slows the world to a drift
and removes reveal/scroll animation. Without WebGL2 the page stands on
a real capture of the same world (public/still/world.jpg) and says so
in the ledger. Privacy and terms pages ship with the site and describe
actual behaviour: no cookies, no analytics, no third-party requests.
